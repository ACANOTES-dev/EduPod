import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private anthropic: { messages: { create: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }> } } | null = null;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // Dynamic import to avoid build failure when SDK is not installed
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey });
      } catch {
        this.logger.warn(
          '@anthropic-ai/sdk is not installed — AI substitution ranking will be unavailable',
        );
      }
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — AI substitution ranking will be unavailable',
      );
    }
  }

  // ─── Rank Substitutes ────────────────────────────────────────────────────

  async rankSubstitutes(
    tenantId: string,
    scheduleId: string,
    date: string,
  ): Promise<{ data: AiSubstituteRanking[] }> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI substitution ranking is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    // Load schedule context
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      include: {
        class_entity: {
          select: {
            name: true,
            year_group_id: true,
            subject_id: true,
            academic_year_id: true,
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
          },
        },
        room: { select: { name: true } },
      },
    });
    if (!schedule) {
      return { data: [] };
    }

    const targetDate = new Date(date);
    const weekday = targetDate.getDay();
    const subjectId = schedule.class_entity?.subject_id ?? null;
    const yearGroupId = schedule.class_entity?.year_group_id ?? null;
    const academicYearId = schedule.class_entity?.academic_year_id ?? schedule.academic_year_id;

    // Find busy teachers at that slot
    const busyTeachers = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        weekday,
        start_time: { lt: schedule.end_time },
        end_time: { gt: schedule.start_time },
        teacher_staff_id: { not: null },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: targetDate } }],
        effective_start_date: { lte: targetDate },
      },
      select: { teacher_staff_id: true },
    });

    const busyIds = new Set(
      busyTeachers.map((s) => s.teacher_staff_id).filter((id): id is string => id !== null),
    );

    // Load all staff
    const allStaff = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const availableStaff = allStaff.filter(
      (s) => !busyIds.has(s.id) && s.id !== schedule.teacher_staff_id,
    );

    if (availableStaff.length === 0) {
      return { data: [] };
    }

    // Load competencies
    const competencies = (subjectId || yearGroupId)
      ? await this.prisma.teacherCompetency.findMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYearId,
            ...(subjectId ? { subject_id: subjectId } : {}),
            ...(yearGroupId ? { year_group_id: yearGroupId } : {}),
          },
          select: { staff_profile_id: true, is_primary: true },
        })
      : [];

    const competencyMap = new Map<string, { is_primary: boolean }>();
    for (const comp of competencies) {
      const existing = competencyMap.get(comp.staff_profile_id);
      if (!existing || comp.is_primary) {
        competencyMap.set(comp.staff_profile_id, { is_primary: comp.is_primary });
      }
    }

    // Load cover counts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const coverRecords = await this.prisma.substitutionRecord.findMany({
      where: { tenant_id: tenantId, created_at: { gte: thirtyDaysAgo } },
      select: { substitute_staff_id: true },
    });

    const coverCountMap = new Map<string, number>();
    for (const r of coverRecords) {
      coverCountMap.set(
        r.substitute_staff_id,
        (coverCountMap.get(r.substitute_staff_id) ?? 0) + 1,
      );
    }

    // Build context for AI
    const staffContext = availableStaff.map((s) => {
      const comp = competencyMap.get(s.id);
      return {
        staff_profile_id: s.id,
        name: `${s.user.first_name} ${s.user.last_name}`.trim(),
        is_competent: subjectId ? comp !== undefined : true,
        is_primary: comp?.is_primary ?? false,
        cover_count_last_30_days: coverCountMap.get(s.id) ?? 0,
      };
    });

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
1. Subject competency (is_competent=true preferred, is_primary=true strongly preferred)
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
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content?.type === 'text' && content.text) {
        const parsed = JSON.parse(content.text) as RawAiCandidate[];
        if (Array.isArray(parsed)) {
          const validated = parsed.filter((item): item is ValidatedAiCandidate =>
            typeof item.staff_profile_id === 'string' &&
            typeof item.confidence === 'string' &&
            typeof item.score === 'number' &&
            typeof item.reasoning === 'string',
          );
          rankings = validated
            .map((item) => {
              const staffMember = availableStaff.find((s) => s.id === item.staff_profile_id);
              const confidenceValue: 'high' | 'medium' | 'low' =
                item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
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
