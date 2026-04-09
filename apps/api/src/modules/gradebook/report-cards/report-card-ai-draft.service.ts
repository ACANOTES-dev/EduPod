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
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { SettingsService } from '../../configuration/settings.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { ConsentService } from '../../gdpr/consent.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

import type { CommentActor } from './report-card-subject-comments.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftSubjectCommentArgs {
  studentId: string;
  subjectId: string;
  classId: string;
  academicPeriodId: string;
}

export interface DraftSubjectCommentResult {
  comment_text: string;
  model: string;
  tokens_used: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6-20250514';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardAiDraftService {
  private readonly logger = new Logger(ReportCardAiDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly consentService: ConsentService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly windowsService: ReportCommentWindowsService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  async draftSubjectComment(
    tenantId: string,
    actor: CommentActor,
    args: DraftSubjectCommentArgs,
  ): Promise<DraftSubjectCommentResult> {
    // 1. AI provider configured?
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI comment generation is not configured. ANTHROPIC_API_KEY is not set.',
      });
    }

    // 2. Tenant opt-in?
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.commentsEnabled) {
      throw new ServiceUnavailableException({
        code: 'AI_FEATURE_DISABLED',
        message: 'AI comment generation is not enabled for this tenant.',
      });
    }

    // 3. Authorship FIRST — never leak window state to unauthorised users.
    await this.assertActorCanDraft(tenantId, actor, args.classId, args.subjectId);

    // 4. Window enforcement — the primary cost-control mechanism.
    await this.windowsService.assertWindowOpenForPeriod(tenantId, args.academicPeriodId);

    // 5. Load student / subject / period context.
    const student = await this.studentReadFacade.findById(tenantId, args.studentId);
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student "${args.studentId}" not found`,
      });
    }

    const subject = await this.academicReadFacade.findSubjectById(tenantId, args.subjectId);
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject "${args.subjectId}" not found`,
      });
    }

    const period = await this.academicReadFacade.findPeriodById(tenantId, args.academicPeriodId);
    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period "${args.academicPeriodId}" not found`,
      });
    }

    // 6. AI consent for the student.
    const hasConsent = await this.consentService.hasConsent(
      tenantId,
      'student',
      student.id,
      CONSENT_TYPES.AI_COMMENTS,
    );
    if (!hasConsent) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message: 'AI comment consent is not active for this student.',
      });
    }

    // 7. Load the snapshot for this (student, class, subject, period).
    const snapshot = await this.prisma.periodGradeSnapshot.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: student.id,
        class_id: args.classId,
        subject_id: args.subjectId,
        academic_period_id: period.id,
      },
      select: {
        computed_value: true,
        display_value: true,
        overridden_value: true,
      },
    });

    // 8. Trajectory: load prior period snapshots for the same subject to show progression.
    const priorSnapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: student.id,
        subject_id: args.subjectId,
      },
      orderBy: { snapshot_at: 'asc' },
      select: {
        computed_value: true,
        display_value: true,
        snapshot_at: true,
      },
    });

    // 9. GDPR tokenisation for the student name.
    const studentFullName = `${student.first_name} ${student.last_name}`;
    const outbound: GdprOutboundData = {
      entities: [
        {
          type: 'student',
          id: student.id,
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
    const tokenisedName = processedData.entities[0]?.fields.full_name ?? studentFullName;

    // 10. Build prompt. AI settings has optional cosmetic fields (commentStyle,
    // commentTargetWordCount, commentLocale) that may live on tenant settings
    // but are not in the typed schema yet.
    const aiSettings = (settings as Record<string, unknown>).ai as
      | Record<string, unknown>
      | undefined;
    const locale = (aiSettings?.commentLocale as string | undefined) ?? 'en';
    const commentStyle = (aiSettings?.commentStyle as string | undefined) ?? 'balanced';
    const targetWordCount = (aiSettings?.commentTargetWordCount as number | undefined) ?? 80;

    const prompt = this.buildPrompt({
      studentName: tokenisedName,
      subjectName: subject.name,
      periodName: period.name,
      snapshot,
      trajectory: priorSnapshots,
      commentStyle,
      targetWordCount,
      locale,
    });

    // 11. Call AI.
    const startedAt = Date.now();
    const response = await this.anthropicClient.createMessage({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const elapsed = Date.now() - startedAt;

    const textBlock = response.content.find((b) => b.type === 'text');
    const rawComment = textBlock?.type === 'text' ? (textBlock.text?.trim() ?? '') : '';

    // 12. Detokenise the response (restore real student name).
    const commentText = await this.gdprTokenService.processInbound(tenantId, rawComment, tokenMap);

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    // 13. Audit log (metadata only — no prompt/response text in full).
    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_comments',
      subjectType: 'student',
      subjectId: student.id,
      modelUsed: DEFAULT_MODEL,
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 200),
      responseSummary: AiAuditService.truncate(rawComment, 200),
      inputDataCategories: ['grades'],
      tokenised: true,
      processingTimeMs: elapsed,
    });

    this.logger.log(
      `AI subject draft: tenant=${tenantId} actor=${actor.userId} student=${student.id} subject=${subject.id} period=${period.id} model=${DEFAULT_MODEL} tokens=${tokensUsed}`,
    );

    return { comment_text: commentText, model: DEFAULT_MODEL, tokens_used: tokensUsed };
  }

  // ─── Authorship check ────────────────────────────────────────────────────

  private async assertActorCanDraft(
    tenantId: string,
    actor: CommentActor,
    classId: string,
    subjectId: string,
  ): Promise<void> {
    if (actor.isAdmin) return;

    const cls = await this.classesReadFacade.findById(tenantId, classId);
    if (!cls) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class "${classId}" not found`,
      });
    }
    if (cls.subject_id && cls.subject_id !== subjectId) {
      throw new ForbiddenException({
        code: 'INVALID_AUTHOR',
        message: `You are not assigned to teach subject "${subjectId}" in class "${classId}"`,
      });
    }
    const assignments = (await this.classesReadFacade.findClassStaffGeneric(
      tenantId,
      {
        class_id: classId,
        staff_profile: { user_id: actor.userId },
      },
      { class_id: true },
    )) as Array<{ class_id: string }>;
    if (assignments.length === 0) {
      throw new ForbiddenException({
        code: 'INVALID_AUTHOR',
        message: 'You are not assigned to this class',
      });
    }
  }

  // ─── Prompt builder ──────────────────────────────────────────────────────

  private buildPrompt(args: {
    studentName: string;
    subjectName: string;
    periodName: string;
    snapshot: {
      computed_value: unknown;
      display_value: string;
      overridden_value: string | null;
    } | null;
    trajectory: Array<{
      computed_value: unknown;
      display_value: string;
      snapshot_at: Date;
    }>;
    commentStyle: string;
    targetWordCount: number;
    locale: string;
  }): string {
    const currentGrade = args.snapshot
      ? `${args.snapshot.overridden_value ?? String(args.snapshot.computed_value)} (${args.snapshot.display_value})`
      : 'not yet graded';

    const trajectoryLines = args.trajectory.length
      ? args.trajectory
          .map(
            (t) =>
              `  - ${t.snapshot_at.toISOString().slice(0, 10)}: ${String(t.computed_value)} (${t.display_value})`,
          )
          .join('\n')
      : '  (no prior snapshots)';

    const languageInstruction =
      args.locale === 'ar'
        ? 'Write the comment in Arabic (Modern Standard Arabic).'
        : 'Write the comment in English.';

    const styleDescriptions: Record<string, string> = {
      formal: 'formal, professional tone suitable for academic reporting',
      warm: 'warm, encouraging tone that celebrates progress',
      balanced: 'balanced tone — professional yet warm and constructive',
    };
    const styleInstruction = styleDescriptions[args.commentStyle] ?? styleDescriptions.balanced;

    return `You are writing a short, parent-friendly subject comment for a student's report card.

Student: ${args.studentName}
Subject: ${args.subjectName}
Period: ${args.periodName}
Current grade: ${currentGrade}
Grade trajectory across periods:
${trajectoryLines}

Instructions:
- Write 2-3 sentences.
- Use a ${styleInstruction}.
- ${languageInstruction}
- Target length: approximately ${args.targetWordCount} words.
- Focus on observed strengths and one constructive area to work on.
- Be specific to the subject and the trajectory above — no generic fluff.
- Do NOT use the student's full name repeatedly — use the first name or "the student".
- Return ONLY the comment text, no labels, no explanation.`;
  }
}
