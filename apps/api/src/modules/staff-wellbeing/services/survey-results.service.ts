import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuestionAggregation {
  question_id: string;
  question_text: string;
  question_type: string;
  response_count: number;
  // likert_5
  mean?: number;
  median?: number;
  distribution?: Record<number, number>;
  // single_choice
  options?: Array<{ option: string; count: number; percentage: number }>;
  // freeform
  approved_count?: number;
  redacted_count?: number;
}

export interface DepartmentInfo {
  department: string;
  staff_count: number;
  eligible: boolean;
}

export interface SurveyResultsResponse {
  survey_id: string;
  suppressed: boolean;
  reason?: string;
  response_count: number;
  threshold: number;
  results?: QuestionAggregation[];
  department_drill_down?: {
    available: boolean;
    departments: DepartmentInfo[];
  };
}

export interface ModerationQueueItem {
  id: string;
  response_text: string;
  submitted_date: Date;
  moderation_status: string;
}

export interface ModeratedComment {
  id: string;
  text: string;
  submitted_date: Date;
  is_redacted: boolean;
}

export interface ModeratedCommentsResponse {
  survey_id: string;
  suppressed: boolean;
  reason?: string;
  response_count: number;
  threshold: number;
  comments?: ModeratedComment[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeMedian(sortedValues: number[]): number {
  const len = sortedValues.length;
  if (len === 0) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 === 1) {
    return sortedValues[mid] ?? 0;
  }
  return ((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SurveyResultsService {
  private readonly logger = new Logger(SurveyResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── C1–C5: GET RESULTS ─────────────────────────────────────────────────────

  async getResults(
    tenantId: string,
    surveyId: string,
    filters?: { department?: string },
  ): Promise<SurveyResultsResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Fetch survey
      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      // C5 — Batch release enforcement
      if (survey.status === 'draft') {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (survey.status === 'active') {
        throw new ForbiddenException({
          error: {
            code: 'SURVEY_STILL_ACTIVE',
            message: 'Results are only available after the survey closes. This prevents timing inference.',
          },
        });
      }

      // C2 — Minimum response threshold
      const participationCount = await db.surveyParticipationToken.count({
        where: { survey_id: surveyId },
      });

      if (participationCount < survey.min_response_threshold) {
        return {
          survey_id: surveyId,
          suppressed: true,
          reason: 'Not enough responses to maintain anonymity.',
          response_count: participationCount,
          threshold: survey.min_response_threshold,
        };
      }

      // C3 — Department drill-down metadata
      const deptGroups = await db.staffProfile.groupBy({
        by: ['department'],
        where: { tenant_id: tenantId, department: { not: null } },
        _count: { _all: true },
      });

      const departments: DepartmentInfo[] = deptGroups.map(
        (g: { department: string | null; _count: { _all: number } }) => ({
          department: g.department ?? '',
          staff_count: g._count._all,
          eligible: g._count._all >= survey.dept_drill_down_threshold,
        }),
      );

      const hasEligible = departments.some((d) => d.eligible);

      // C4 — Cross-filter blocking
      if (filters?.department) {
        const deptInfo = departments.find((d) => d.department === filters.department);
        const deptStaffCount = deptInfo?.staff_count ?? 0;

        if (deptStaffCount < survey.dept_drill_down_threshold) {
          throw new ForbiddenException({
            error: {
              code: 'FILTER_BELOW_THRESHOLD',
              message: 'Department staff count is below the drill-down threshold.',
            },
          });
        }

        if (deptStaffCount < survey.min_response_threshold) {
          throw new ForbiddenException({
            error: {
              code: 'FILTER_BELOW_THRESHOLD',
              message: 'Filtered results would be below the minimum response threshold.',
            },
          });
        }
      }

      // Fetch questions
      const questions = await db.surveyQuestion.findMany({
        where: { survey_id: surveyId },
        orderBy: { display_order: 'asc' },
      });

      // Fetch all responses for this survey
      const responses = await db.surveyResponse.findMany({
        where: { survey_id: surveyId },
      });

      // C1 — Aggregate by question type
      const results: QuestionAggregation[] = questions.map(
        (q: { id: string; question_text: string; question_type: string; options: unknown }) => {
          const qResponses = responses.filter(
            (r: { question_id: string }) => r.question_id === q.id,
          );

          const base: QuestionAggregation = {
            question_id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            response_count: qResponses.length,
          };

          if (q.question_type === 'likert_5') {
            const values = qResponses
              .map((r: { answer_value: number | null }) => r.answer_value)
              .filter((v: number | null): v is number => v !== null);

            if (values.length > 0) {
              const sum = values.reduce((a: number, b: number) => a + b, 0);
              const mean = Math.round((sum / values.length) * 100) / 100;
              const sorted = [...values].sort((a: number, b: number) => a - b);
              const median = computeMedian(sorted);
              const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
              for (const v of values) {
                distribution[v] = (distribution[v] ?? 0) + 1;
              }
              base.mean = mean;
              base.median = median;
              base.distribution = distribution;
            } else {
              base.mean = 0;
              base.median = 0;
              base.distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            }
          } else if (q.question_type === 'single_choice') {
            const optionLabels = Array.isArray(q.options) ? (q.options as string[]) : [];
            const counts: Record<string, number> = {};
            for (const label of optionLabels) {
              counts[label] = 0;
            }
            for (const r of qResponses) {
              const idx = (r as { answer_value: number | null }).answer_value;
              if (idx !== null && idx >= 0 && idx < optionLabels.length) {
                const label = optionLabels[idx] ?? '';
                counts[label] = (counts[label] ?? 0) + 1;
              }
            }
            const total = qResponses.length;
            base.options = optionLabels.map((opt) => ({
              option: opt,
              count: counts[opt] ?? 0,
              percentage: total > 0
                ? Math.round(((counts[opt] ?? 0) / total) * 10000) / 100
                : 0,
            }));
          } else if (q.question_type === 'freeform') {
            base.approved_count = qResponses.filter(
              (r: { moderation_status: string }) => r.moderation_status === 'approved',
            ).length;
            base.redacted_count = qResponses.filter(
              (r: { moderation_status: string }) => r.moderation_status === 'redacted',
            ).length;
          }

          return base;
        },
      );

      return {
        survey_id: surveyId,
        suppressed: false,
        response_count: participationCount,
        threshold: survey.min_response_threshold,
        results,
        department_drill_down: {
          available: hasEligible,
          departments,
        },
      };
    })) as SurveyResultsResponse;

    return result;
  }

  // ─── MODERATION QUEUE ─────────────────────────────────────────────────────

  async listModerationQueue(
    tenantId: string,
    surveyId: string,
  ): Promise<ModerationQueueItem[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const items = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Verify survey exists and belongs to tenant
      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      // Fetch freeform responses needing moderation
      const pendingResponses = await db.surveyResponse.findMany({
        where: {
          survey_id: surveyId,
          moderation_status: { in: ['pending', 'flagged'] },
          answer_text: { not: null },
        },
        orderBy: { submitted_date: 'asc' },
      });

      return pendingResponses.map(
        (r: { id: string; answer_text: string | null; submitted_date: Date; moderation_status: string }) => ({
          id: r.id,
          response_text: r.answer_text ?? '',
          submitted_date: r.submitted_date,
          moderation_status: r.moderation_status,
        }),
      );
    })) as ModerationQueueItem[];

    return items;
  }

  // ─── MODERATE RESPONSE ────────────────────────────────────────────────────

  async moderateResponse(
    tenantId: string,
    surveyId: string,
    responseId: string,
    action: { status: 'approved' | 'flagged' | 'redacted'; reason?: string },
    userId: string,
  ): Promise<{ moderated: true }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Verify survey exists and belongs to tenant
      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      // Verify response exists and belongs to the survey
      const response = await db.surveyResponse.findFirst({
        where: { id: responseId, survey_id: surveyId },
      });

      if (!response) {
        throw new NotFoundException({
          error: {
            code: 'RESPONSE_NOT_FOUND',
            message: `Response "${responseId}" not found for survey "${surveyId}"`,
          },
        });
      }

      // Build update
      const updateData: { moderation_status: string; answer_text?: string } = {
        moderation_status: action.status,
      };

      if (action.status === 'redacted') {
        updateData.answer_text = '[Response redacted by moderator]';
      }

      await db.surveyResponse.update({
        where: { id: responseId },
        data: updateData,
      });
    });

    // Audit log — fire-and-forget
    await this.auditLogService.write(
      tenantId,
      userId,
      'survey_response',
      responseId,
      `moderation.${action.status}`,
      {
        reason: action.reason ?? null,
        response_id: responseId,
        survey_id: surveyId,
      },
      null,
    );

    return { moderated: true };
  }

  // ─── MODERATED COMMENTS ───────────────────────────────────────────────────

  async getModeratedComments(
    tenantId: string,
    surveyId: string,
  ): Promise<ModeratedCommentsResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Fetch survey
      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      // C5 — Batch release enforcement
      if (survey.status === 'draft') {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (survey.status === 'active') {
        throw new ForbiddenException({
          error: {
            code: 'SURVEY_STILL_ACTIVE',
            message: 'Results are only available after the survey closes. This prevents timing inference.',
          },
        });
      }

      // C2 — Threshold check
      const participationCount = await db.surveyParticipationToken.count({
        where: { survey_id: surveyId },
      });

      if (participationCount < survey.min_response_threshold) {
        return {
          survey_id: surveyId,
          suppressed: true,
          reason: 'Not enough responses to maintain anonymity.',
          response_count: participationCount,
          threshold: survey.min_response_threshold,
        };
      }

      // Fetch approved + redacted freeform responses
      const comments = await db.surveyResponse.findMany({
        where: {
          survey_id: surveyId,
          moderation_status: { in: ['approved', 'redacted'] },
          answer_text: { not: null },
        },
        orderBy: { submitted_date: 'asc' },
      });

      return {
        survey_id: surveyId,
        suppressed: false,
        response_count: participationCount,
        threshold: survey.min_response_threshold,
        comments: comments.map(
          (c: { id: string; answer_text: string | null; submitted_date: Date; moderation_status: string }) => ({
            id: c.id,
            text: c.answer_text ?? '',
            submitted_date: c.submitted_date,
            is_redacted: c.moderation_status === 'redacted',
          }),
        ),
      };
    })) as ModeratedCommentsResponse;

    return result;
  }
}
