import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import { type GdprOutboundData, CONSENT_TYPES } from '@school/shared/gdpr';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { StudentReadFacade } from '../../students/student-read.facade';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressSummaryResult {
  student_id: string;
  period_id: string;
  summary: string;
  locale: string;
  generated_at: string;
  cached: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiProgressSummaryService {
  private readonly logger = new Logger(AiProgressSummaryService.name);
  private readonly CACHE_TTL = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settingsService: SettingsService,
    private readonly consentService: ConsentService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  // ─── Generate Summary ─────────────────────────────────────────────────────

  /**
   * Generate or retrieve a cached AI progress summary for a student/period.
   * Cache key: ai:progress_summary:{tenant_id}:{student_id}:{period_id}
   * TTL: 24 hours
   */
  async generateSummary(
    tenantId: string,
    studentId: string,
    periodId: string,
    locale: string,
  ): Promise<ProgressSummaryResult> {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI progress summaries are not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    // Check if feature is enabled
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.progressSummariesEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    const hasConsent = await this.consentService.hasConsent(
      tenantId,
      'student',
      studentId,
      CONSENT_TYPES.AI_PROGRESS_SUMMARY,
    );

    if (!hasConsent) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message: 'AI progress summary consent is not active for this student.',
      });
    }

    // Check cache
    const cacheKey = `ai:progress_summary:${tenantId}:${studentId}:${periodId}`;
    const client = this.redis.getClient();
    const cached = await client.get(cacheKey);

    if (cached) {
      const result = JSON.parse(cached) as ProgressSummaryResult;
      return { ...result, cached: true };
    }

    // Load context
    const context = await this.loadStudentContext(tenantId, studentId, periodId);

    if (!context) {
      throw new NotFoundException({
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: `Student "${studentId}" not found`,
        },
      });
    }

    const commentStyle =
      ((settings.ai as Record<string, unknown>)?.commentStyle as string | undefined) ?? 'balanced';

    // GDPR tokenisation — protect student PII before sending to AI
    const outbound: GdprOutboundData = {
      entities: [
        {
          type: 'student',
          id: context.student.id,
          fields: { first_name: context.student.first_name, last_name: context.student.last_name },
        },
      ],
      entityCount: 1,
    };

    const { processedData, tokenMap } = await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_progress_summary',
      outbound,
      SYSTEM_USER_SENTINEL,
    );

    // Build prompt with tokenised student name
    const tokenisedContext = {
      ...context,
      student: {
        ...context.student,
        first_name: processedData.entities[0]?.fields.first_name ?? context.student.first_name,
        last_name: processedData.entities[0]?.fields.last_name ?? context.student.last_name,
      },
    };

    const prompt = this.buildSummaryPrompt(tokenisedContext, commentStyle, locale);

    this.logger.log(`Generating AI progress summary for student ${studentId}, period ${periodId}`);

    const startTime = Date.now();
    const response = await this.anthropicClient.createMessage({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const elapsed = Date.now() - startTime;

    const textBlock = response.content.find((b) => b.type === 'text');
    const rawSummary = textBlock?.type === 'text' ? (textBlock.text?.trim() ?? '') : '';

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_progress_summary',
      subjectType: 'student',
      subjectId: studentId,
      modelUsed: 'claude-sonnet-4-6-20250514',
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 500),
      responseSummary: AiAuditService.truncate(rawSummary, 500),
      inputDataCategories: ['grades', 'attendance'],
      tokenised: true,
      processingTimeMs: elapsed,
    });

    // Detokenise AI response — restore real student name
    const summary = await this.gdprTokenService.processInbound(tenantId, rawSummary, tokenMap);

    const result: ProgressSummaryResult = {
      student_id: studentId,
      period_id: periodId,
      summary,
      locale,
      generated_at: new Date().toISOString(),
      cached: false,
    };

    // Cache for 24 hours
    await client.set(cacheKey, JSON.stringify(result), 'EX', this.CACHE_TTL);

    return result;
  }

  // ─── Invalidate Cache ─────────────────────────────────────────────────────

  /**
   * Invalidate the progress summary cache for a student.
   * Called when grades are published for the student.
   */
  async invalidateCache(tenantId: string, studentId: string, periodId?: string): Promise<void> {
    try {
      const client = this.redis.getClient();

      if (periodId) {
        await client.del(`ai:progress_summary:${tenantId}:${studentId}:${periodId}`);
      } else {
        // Scan and delete all period summaries for this student
        const pattern = `ai:progress_summary:${tenantId}:${studentId}:*`;
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate progress summary cache for student ${studentId}: ${String(err)}`,
      );
    }
  }

  // ─── Load Context ─────────────────────────────────────────────────────────

  private async loadStudentContext(tenantId: string, studentId: string, periodId: string) {
    const student = await this.studentReadFacade.findById(tenantId, studentId);

    if (!student) return null;

    const period = await this.academicReadFacade.findPeriodById(tenantId, periodId);

    if (!period) return null;

    // Published grades only (filter by grades_published_at IS NOT NULL on assessment)
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_period_id: periodId,
      },
      include: {
        subject: { select: { name: true } },
      },
    });

    // Attendance summary
    const attendanceRecords = await this.attendanceReadFacade.findAllRecordsForStudent(
      tenantId,
      studentId,
    );

    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter((r) => r.status === 'present').length;
    const absentDays = attendanceRecords.filter((r) => r.status.startsWith('absent')).length;

    return {
      student,
      period,
      snapshots,
      attendance: { totalDays, presentDays, absentDays },
    };
  }

  // ─── Build Prompt ─────────────────────────────────────────────────────────

  private buildSummaryPrompt(
    context: NonNullable<Awaited<ReturnType<typeof this.loadStudentContext>>>,
    commentStyle: string,
    locale: string,
  ): string {
    const studentName = context.student.first_name;
    const periodName = context.period.name;

    const subjectLines =
      context.snapshots.length > 0
        ? context.snapshots
            .map(
              (s) =>
                `- ${s.subject.name}: ${Number(s.overridden_value ?? s.computed_value).toFixed(1)} (${s.display_value})`,
            )
            .join('\n')
        : '- No grades recorded yet';

    const styleDescriptions: Record<string, string> = {
      formal: 'Write in a formal, professional tone suitable for academic reporting.',
      warm: 'Write in a warm, encouraging and supportive tone.',
      balanced: 'Write in a balanced, friendly yet professional tone.',
    };

    const styleInstruction = styleDescriptions[commentStyle] ?? styleDescriptions.balanced;

    const languageInstruction =
      locale === 'ar' ? 'Write in Arabic (Modern Standard Arabic).' : 'Write in English.';

    return `Write a brief academic progress summary for a parent to read.

Student: ${studentName}
Period: ${periodName}

Grades this term:
${subjectLines}

Attendance:
- Days present: ${context.attendance.presentDays} / ${context.attendance.totalDays}
- Days absent: ${context.attendance.absentDays}

Instructions:
- ${styleInstruction}
- ${languageInstruction}
- Keep it to 2-3 sentences. Be specific and encouraging.
- Mention overall performance and any notable strengths.
- Suitable for parents — avoid overly technical language.
- Return ONLY the summary text, no labels.`;
  }
}
