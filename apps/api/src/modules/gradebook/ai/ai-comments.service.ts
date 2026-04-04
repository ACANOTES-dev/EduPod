import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import { type GdprOutboundData, CONSENT_TYPES } from '@school/shared/gdpr';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiCommentResult {
  report_card_id: string;
  comment: string;
  locale: string;
}

export interface BatchCommentResult {
  results: AiCommentResult[];
  errors: { report_card_id: string; error: string }[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiCommentsService {
  private readonly logger = new Logger(AiCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly consentService: ConsentService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly attendanceReadFacade: AttendanceReadFacade,
  ) {}

  // ─── Generate Single Comment ──────────────────────────────────────────────

  async generateComment(tenantId: string, reportCardId: string): Promise<AiCommentResult> {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI comment generation is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.commentsEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    const reportCard = await this.loadReportCardContext(tenantId, reportCardId);
    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }

    const hasConsent = await this.consentService.hasConsent(
      tenantId,
      'student',
      reportCard.student.id,
      CONSENT_TYPES.AI_COMMENTS,
    );

    if (!hasConsent) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message: 'AI comment consent is not active for this student.',
      });
    }

    const aiSettings = (settings as Record<string, unknown>).ai as
      | Record<string, unknown>
      | undefined;

    const commentStyle = (aiSettings?.commentStyle as string | undefined) ?? 'balanced';
    const sampleReference = aiSettings?.commentSampleReference as string | undefined;
    const targetWordCount = (aiSettings?.commentTargetWordCount as number | undefined) ?? 100;

    const locale = reportCard.template_locale ?? 'en';

    // GDPR tokenisation — protect student PII before sending to AI
    const studentFullName = `${reportCard.student.first_name} ${reportCard.student.last_name}`;
    const outbound: GdprOutboundData = {
      entities: [
        {
          type: 'student',
          id: reportCard.student.id,
          fields: { full_name: studentFullName },
        },
      ],
      entityCount: 1,
    };

    const { processedData, tokenMap } = await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_comments',
      outbound,
      SYSTEM_USER_SENTINEL,
    );

    // Build prompt with tokenised student name
    const tokenisedName = processedData.entities[0]?.fields.full_name ?? studentFullName;
    const tokenisedReportCard = {
      ...reportCard,
      student: {
        ...reportCard.student,
        first_name: tokenisedName,
        last_name: '',
      },
    };

    const prompt = this.buildCommentPrompt(
      tokenisedReportCard,
      commentStyle,
      sampleReference,
      targetWordCount,
      locale,
    );

    this.logger.log(`Generating AI comment for report card ${reportCardId}, tenant ${tenantId}`);

    const startTime = Date.now();
    const response = await this.anthropicClient.createMessage({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const elapsed = Date.now() - startTime;

    const textBlock = response.content.find((b) => b.type === 'text');
    const rawComment = textBlock?.type === 'text' ? (textBlock.text?.trim() ?? '') : '';

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_comments',
      subjectType: 'student',
      subjectId: reportCard.student.id,
      modelUsed: 'claude-sonnet-4-6-20250514',
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 500),
      responseSummary: AiAuditService.truncate(rawComment, 500),
      inputDataCategories: ['grades', 'attendance'],
      tokenised: true,
      processingTimeMs: elapsed,
    });

    // Detokenise AI response — restore real student name
    const comment = await this.gdprTokenService.processInbound(tenantId, rawComment, tokenMap);

    return { report_card_id: reportCardId, comment, locale };
  }

  // ─── Generate Batch Comments ──────────────────────────────────────────────

  async generateBatchComments(
    tenantId: string,
    reportCardIds: string[],
  ): Promise<BatchCommentResult> {
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI comment generation is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const results: AiCommentResult[] = [];
    const errors: { report_card_id: string; error: string }[] = [];

    for (const id of reportCardIds) {
      try {
        const result = await this.generateComment(tenantId, id);
        results.push(result);
      } catch (err) {
        errors.push({
          report_card_id: id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { results, errors };
  }

  // ─── Load Report Card Context ─────────────────────────────────────────────

  private async loadReportCardContext(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        academic_period: {
          select: { id: true, name: true },
        },
      },
    });

    if (!reportCard) return null;

    // Load period grade snapshots for context
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: reportCard.student_id,
        academic_period_id: reportCard.academic_period_id,
      },
      include: {
        subject: { select: { name: true } },
      },
    });

    // Load attendance summary
    const attendanceRecords = await this.attendanceReadFacade.findAllRecordsForStudent(
      tenantId,
      reportCard.student_id,
    );

    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter((r) => r.status === 'present').length;
    const absentDays = attendanceRecords.filter((r) => r.status.startsWith('absent')).length;
    const lateDays = attendanceRecords.filter((r) => r.status === 'late').length;

    return {
      ...reportCard,
      snapshots,
      attendance: { totalDays, presentDays, absentDays, lateDays },
    };
  }

  // ─── Build Prompt ─────────────────────────────────────────────────────────

  private buildCommentPrompt(
    reportCard: NonNullable<Awaited<ReturnType<typeof this.loadReportCardContext>>>,
    commentStyle: string,
    sampleReference: string | undefined,
    targetWordCount: number,
    locale: string,
  ): string {
    const studentName = `${reportCard.student.first_name} ${reportCard.student.last_name}`;
    const periodName = reportCard.academic_period.name;

    const subjectLines = reportCard.snapshots
      .map(
        (s) =>
          `- ${s.subject.name}: ${Number(s.overridden_value ?? s.computed_value).toFixed(1)} (${s.display_value})`,
      )
      .join('\n');

    const styleDescriptions: Record<string, string> = {
      formal: 'Write in a formal, professional tone suitable for academic reporting.',
      warm: 'Write in a warm, encouraging tone that celebrates progress.',
      balanced: 'Write in a balanced tone — professional yet warm and constructive.',
    };

    const styleInstruction = styleDescriptions[commentStyle] ?? styleDescriptions.balanced;

    const languageInstruction =
      locale === 'ar'
        ? 'Write the comment in Arabic (Modern Standard Arabic).'
        : 'Write the comment in English.';

    const sampleSection = sampleReference
      ? `\n\nWrite in a similar style to this sample:\n"${sampleReference}"`
      : '';

    return `You are writing a teacher report card comment for a student.

Student: ${studentName}
Period: ${periodName}

Academic Performance:
${subjectLines}

Attendance:
- Total days: ${reportCard.attendance.totalDays}
- Present: ${reportCard.attendance.presentDays}
- Absent: ${reportCard.attendance.absentDays}
- Late: ${reportCard.attendance.lateDays}

Instructions:
- ${styleInstruction}
- ${languageInstruction}
- Target length: approximately ${targetWordCount} words.
- Focus on the student's strengths and constructive areas for improvement.
- Be specific to the student's performance, not generic.
- Do NOT use the student's full name repeatedly — use first name or "the student".
- Return ONLY the comment text, no labels, no explanation.${sampleSection}`;
  }
}
