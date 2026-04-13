import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import type { GdprOutboundData } from '@school/shared/gdpr';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

export interface AiSubstituteRanking {
  staff_profile_id: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasoning: string;
}

interface RawAiCandidate {
  staff_profile_id?: string;
  confidence?: 'high' | 'medium' | 'low' | string;
  score?: number;
  reasoning?: string;
}

interface ValidatedAiCandidate {
  staff_profile_id: string;
  confidence: string;
  score: number;
  reasoning: string;
}

@Injectable()
export class AiSubstitutionService {
  private readonly logger = new Logger(AiSubstitutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Rank Substitutes ────────────────────────────────────────────────────

  async rankSubstitutes(
    tenantId: string,
    scheduleId: string,
    date: string,
  ): Promise<{ data: AiSubstituteRanking[] }> {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI substitution ranking is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.substitutionRankingEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    // Load schedule context
    const schedule = await this.schedulesReadFacade.findByIdWithSubstitutionContext(
      tenantId,
      scheduleId,
    );
    if (!schedule) {
      return { data: [] };
    }

    const targetDate = new Date(date);
    const weekday = targetDate.getDay();
    const subjectId = schedule.class_entity?.subject_id ?? null;
    const yearGroupId = schedule.class_entity?.year_group_id ?? null;
    const academicYearId = schedule.class_entity?.academic_year_id ?? schedule.academic_year_id;

    // Find busy teachers at that slot
    const busyIds = await this.schedulesReadFacade.findBusyTeacherIds(tenantId, {
      weekday,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      effectiveDate: targetDate,
    });

    // Load all staff
    const allStaff = await this.staffProfileReadFacade.findActiveStaff(tenantId);

    const availableStaff = allStaff.filter(
      (s) => !busyIds.has(s.id) && s.id !== schedule.teacher_staff_id,
    );

    if (availableStaff.length === 0) {
      return { data: [] };
    }

    // Load competencies. is_primary was dropped in Stage 1 of the scheduler
    // rebuild; Stage 7 will rewire AI ranking against the new
    // substitute_teacher_competencies table.
    const competencies =
      subjectId || yearGroupId
        ? await this.prisma.teacherCompetency.findMany({
            where: {
              tenant_id: tenantId,
              academic_year_id: academicYearId,
              ...(subjectId ? { subject_id: subjectId } : {}),
              ...(yearGroupId ? { year_group_id: yearGroupId } : {}),
            },
            select: { staff_profile_id: true },
          })
        : [];

    const competentStaffIds = new Set(competencies.map((c) => c.staff_profile_id));

    // Load cover counts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const coverRecords = await this.prisma.substitutionRecord.findMany({
      where: { tenant_id: tenantId, created_at: { gte: thirtyDaysAgo } },
      select: { substitute_staff_id: true },
    });

    const coverCountMap = new Map<string, number>();
    for (const r of coverRecords) {
      coverCountMap.set(r.substitute_staff_id, (coverCountMap.get(r.substitute_staff_id) ?? 0) + 1);
    }

    // GDPR tokenisation — protect staff PII before sending to AI
    const outbound: GdprOutboundData = {
      entities: availableStaff.map((s) => ({
        type: 'staff' as const,
        id: s.id,
        fields: { full_name: `${s.user.first_name} ${s.user.last_name}`.trim() },
      })),
      entityCount: availableStaff.length,
    };
    const { processedData, tokenMap } = await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_substitution',
      outbound,
      SYSTEM_USER_SENTINEL,
    );

    // Build a lookup from staff ID to tokenised name
    const tokenisedNameMap = new Map<string, string>();
    for (const entity of processedData.entities) {
      tokenisedNameMap.set(entity.id, entity.fields.full_name ?? '');
    }

    // Build context for AI. is_primary always false post-Stage-1; the
    // Stage 7 rewire will reinstate a real primary-vs-secondary signal from
    // the substitute_teacher_competencies table.
    const staffContext = availableStaff.map((s) => ({
      staff_profile_id: s.id,
      name: tokenisedNameMap.get(s.id) ?? `${s.user.first_name} ${s.user.last_name}`.trim(),
      is_competent: subjectId ? competentStaffIds.has(s.id) : true,
      is_primary: false,
      cover_count_last_30_days: coverCountMap.get(s.id) ?? 0,
    }));

    const prompt = `You are helping a school assign a substitute teacher.

Schedule context:
- Subject: ${schedule.class_entity?.subject?.name ?? 'Unknown'}
- Year Group: ${schedule.class_entity?.year_group?.name ?? 'Unknown'}
- Class: ${schedule.class_entity?.name ?? 'Unknown'}
- Date: ${date}
- Room: ${schedule.room?.name ?? 'TBD'}

Available teachers (JSON):
${JSON.stringify(staffContext, null, 2)}

Rank these teachers as substitutes. Consider:
1. Subject competency (is_competent=true preferred)
2. Fairness (lower cover_count_last_30_days preferred)
3. Return only the top 5 ranked teachers

Return a JSON array of objects with exactly these fields:
- staff_profile_id (string, UUID from input)
- confidence ("high" | "medium" | "low")
- score (number 0–100)
- reasoning (one sentence explaining the ranking)

Return ONLY the JSON array. No markdown, no explanation.`;

    let rankings: AiSubstituteRanking[] = [];

    try {
      const startTime = Date.now();
      const response = await this.anthropicClient.createMessage({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const elapsed = Date.now() - startTime;

      const content = response.content[0];
      const rawResponseText = content?.type === 'text' && content.text ? content.text : '';

      await this.aiAuditService.log({
        tenantId,
        aiService: 'ai_substitution',
        subjectType: null,
        subjectId: null,
        modelUsed: 'claude-3-5-haiku-20241022',
        promptHash: AiAuditService.hashPrompt(prompt),
        promptSummary: AiAuditService.truncate(prompt, 500),
        responseSummary: AiAuditService.truncate(rawResponseText, 500),
        inputDataCategories: ['staff_availability', 'competencies', 'cover_history'],
        tokenised: true,
        processingTimeMs: elapsed,
      });
      if (content?.type === 'text' && content.text) {
        const detokenisedText = await this.gdprTokenService.processInbound(
          tenantId,
          content.text,
          tokenMap,
        );
        const parsed = JSON.parse(detokenisedText) as RawAiCandidate[];
        if (Array.isArray(parsed)) {
          const validated = parsed.filter(
            (item): item is ValidatedAiCandidate =>
              typeof item.staff_profile_id === 'string' &&
              typeof item.confidence === 'string' &&
              typeof item.score === 'number' &&
              typeof item.reasoning === 'string',
          );
          rankings = validated
            .map((item) => {
              const staffMember = availableStaff.find((s) => s.id === item.staff_profile_id);
              const confidenceValue: 'high' | 'medium' | 'low' =
                item.confidence === 'high' ||
                item.confidence === 'medium' ||
                item.confidence === 'low'
                  ? item.confidence
                  : 'low';
              return {
                staff_profile_id: item.staff_profile_id,
                name: staffMember
                  ? `${staffMember.user.first_name} ${staffMember.user.last_name}`.trim()
                  : item.staff_profile_id,
                confidence: confidenceValue,
                score: Math.max(0, Math.min(100, item.score)),
                reasoning: item.reasoning,
              };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        }
      }
    } catch (err) {
      this.logger.error('AI substitute ranking failed', err);
      return { data: [] };
    }

    return { data: rankings };
  }
}
