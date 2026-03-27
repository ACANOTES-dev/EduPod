import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type { CreateSurveyDto, SubmitSurveyResponseDto, UpdateSurveyDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { HmacService } from './hmac.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface SurveyListQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SurveyRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  frequency: string;
  window_opens_at: Date;
  window_closes_at: Date;
  results_released: boolean;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface SurveyListItem extends SurveyRow {
  _count?: { responses: number };
}

export interface QuestionRow {
  id: string;
  tenant_id: string;
  survey_id: string;
  question_text: string;
  question_type: string;
  display_order: number;
  options: unknown;
  is_required: boolean;
  created_at: Date;
}

export interface SurveyWithQuestions extends SurveyRow {
  questions: QuestionRow[];
}

export interface SurveyDetail extends SurveyWithQuestions {
  response_count?: number;
  eligible_staff_count?: number;
  response_rate?: number;
}

export interface ActiveSurveyResult extends SurveyWithQuestions {
  hasResponded: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmacService: HmacService,
    @InjectQueue('wellbeing') private readonly wellbeingQueue: Queue,
  ) {}

  // ─── B1: CREATE ─────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSurveyDto,
  ): Promise<SurveyWithQuestions> {
    // Validate window dates
    const opensAt = new Date(dto.window_opens_at);
    const closesAt = new Date(dto.window_closes_at);

    if (closesAt <= opensAt) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_WINDOW_DATES',
          message: 'window_closes_at must be after window_opens_at',
        },
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const survey = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = await db.staffSurvey.create({
        data: {
          tenant_id: tenantId,
          title: dto.title,
          description: dto.description ?? null,
          status: 'draft',
          frequency: dto.frequency ?? 'fortnightly',
          window_opens_at: opensAt,
          window_closes_at: closesAt,
          results_released: false,
          min_response_threshold: dto.min_response_threshold ?? 5,
          dept_drill_down_threshold: dto.dept_drill_down_threshold ?? 10,
          moderation_enabled: dto.moderation_enabled ?? true,
          created_by: userId,
        },
      });

      if (dto.questions.length > 0) {
        await db.surveyQuestion.createMany({
          data: dto.questions.map((q) => ({
            tenant_id: tenantId,
            survey_id: created.id,
            question_text: q.question_text,
            question_type: q.question_type,
            display_order: q.display_order,
            options: (q.options as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            is_required: q.is_required ?? true,
          })),
        });
      }

      // Re-fetch with questions for the response
      const result = await db.staffSurvey.findUnique({
        where: { id: created.id },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });

      return result;
    })) as SurveyWithQuestions;

    return survey;
  }

  // ─── B1: FIND ALL (PAGINATED) ──────────────────────────────────────────────

  async findAll(
    tenantId: string,
    query: SurveyListQuery,
  ): Promise<{ data: SurveyListItem[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const sortBy = query.sortBy ?? 'created_at';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Record<string, string> = { [sortBy]: sortOrder };

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const where = { tenant_id: tenantId };

    const [data, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.staffSurvey.findMany({
        where,
        include: {
          _count: { select: { responses: true } },
        },
        orderBy,
        skip,
        take: pageSize,
      });

      const count = await db.staffSurvey.count({ where });

      return [items, count];
    })) as [SurveyListItem[], number];

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── B1: FIND ONE ──────────────────────────────────────────────────────────

  async findOne(tenantId: string, surveyId: string): Promise<SurveyDetail> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      const responseCount = await db.surveyResponse.count({
        where: { survey_id: surveyId },
      });

      const detail: SurveyDetail = { ...survey, response_count: responseCount };

      if (survey.status === 'active') {
        const eligibleStaffCount = await db.staffProfile.count({
          where: { tenant_id: tenantId },
        });
        detail.eligible_staff_count = eligibleStaffCount;
      }

      if (survey.status === 'closed' || survey.status === 'archived') {
        const eligibleStaffCount = await db.staffProfile.count({
          where: { tenant_id: tenantId },
        });
        detail.response_rate =
          eligibleStaffCount > 0 ? responseCount / eligibleStaffCount : 0;
      }

      return detail;
    })) as SurveyDetail;

    return result;
  }

  // ─── B1: UPDATE ─────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    surveyId: string,
    dto: UpdateSurveyDto,
  ): Promise<SurveyWithQuestions> {
    // Validate window dates if both are provided
    if (dto.window_opens_at && dto.window_closes_at) {
      const opensAt = new Date(dto.window_opens_at);
      const closesAt = new Date(dto.window_closes_at);
      if (closesAt <= opensAt) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_WINDOW_DATES',
            message: 'window_closes_at must be after window_opens_at',
          },
        });
      }
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const survey = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (existing.status !== 'draft') {
        throw new ConflictException({
          error: {
            code: 'SURVEY_NOT_DRAFT',
            message: 'Only draft surveys can be updated',
          },
        });
      }

      // Build update data (exclude questions — handled separately)
      const updateData: Record<string, unknown> = {};
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.frequency !== undefined) updateData.frequency = dto.frequency;
      if (dto.window_opens_at !== undefined) updateData.window_opens_at = new Date(dto.window_opens_at);
      if (dto.window_closes_at !== undefined) updateData.window_closes_at = new Date(dto.window_closes_at);
      if (dto.min_response_threshold !== undefined) updateData.min_response_threshold = dto.min_response_threshold;
      if (dto.dept_drill_down_threshold !== undefined) updateData.dept_drill_down_threshold = dto.dept_drill_down_threshold;
      if (dto.moderation_enabled !== undefined) updateData.moderation_enabled = dto.moderation_enabled;

      if (Object.keys(updateData).length > 0) {
        await db.staffSurvey.update({
          where: { id: surveyId },
          data: updateData,
        });
      }

      // Replace questions if provided
      if (dto.questions !== undefined) {
        await db.surveyQuestion.deleteMany({
          where: { survey_id: surveyId },
        });

        if (dto.questions.length > 0) {
          await db.surveyQuestion.createMany({
            data: dto.questions.map((q) => ({
              tenant_id: tenantId,
              survey_id: surveyId,
              question_text: q.question_text,
              question_type: q.question_type,
              display_order: q.display_order,
              options: (q.options as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              is_required: q.is_required ?? true,
            })),
          });
        }
      }

      return db.staffSurvey.findUnique({
        where: { id: surveyId },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });
    })) as SurveyWithQuestions;

    return survey;
  }

  // ─── B2: CLONE-AS-DRAFT ────────────────────────────────────────────────────

  async clone(
    tenantId: string,
    surveyId: string,
    userId: string,
  ): Promise<SurveyWithQuestions> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const cloned = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const source = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });

      if (!source) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      // Create new draft with blank window dates (epoch as placeholder — required non-null fields)
      const newSurvey = await db.staffSurvey.create({
        data: {
          tenant_id: tenantId,
          title: `${source.title} (Copy)`,
          description: source.description,
          status: 'draft',
          frequency: source.frequency,
          window_opens_at: new Date(0),
          window_closes_at: new Date(0),
          results_released: false,
          min_response_threshold: source.min_response_threshold,
          dept_drill_down_threshold: source.dept_drill_down_threshold,
          moderation_enabled: source.moderation_enabled,
          created_by: userId,
        },
      });

      // Copy questions
      if (source.questions.length > 0) {
        await db.surveyQuestion.createMany({
          data: source.questions.map((q: QuestionRow) => ({
            tenant_id: tenantId,
            survey_id: newSurvey.id,
            question_text: q.question_text,
            question_type: q.question_type,
            display_order: q.display_order,
            options: (q.options as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            is_required: q.is_required,
          })),
        });
      }

      return db.staffSurvey.findUnique({
        where: { id: newSurvey.id },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });
    })) as SurveyWithQuestions;

    return cloned;
  }

  // ─── B3: ACTIVATE ──────────────────────────────────────────────────────────

  async activate(tenantId: string, surveyId: string): Promise<SurveyRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const activated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
        include: { questions: true },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (survey.status !== 'draft') {
        throw new ConflictException({
          error: {
            code: 'SURVEY_NOT_DRAFT',
            message: 'Only draft surveys can be activated',
          },
        });
      }

      // Must have at least 1 question
      if (!survey.questions || survey.questions.length === 0) {
        throw new BadRequestException({
          error: {
            code: 'NO_QUESTIONS',
            message: 'Survey must have at least one question before activation',
          },
        });
      }

      // Window dates must be set (not epoch placeholder)
      const epochMs = new Date(0).getTime();
      if (
        survey.window_opens_at.getTime() === epochMs ||
        survey.window_closes_at.getTime() === epochMs
      ) {
        throw new BadRequestException({
          error: {
            code: 'WINDOW_DATES_REQUIRED',
            message: 'Window dates must be set before activation',
          },
        });
      }

      // Single active enforcement
      const existingActive = await db.staffSurvey.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'active',
          id: { not: surveyId },
        },
      });

      if (existingActive) {
        throw new ConflictException({
          error: {
            code: 'SURVEY_ALREADY_ACTIVE',
            message: 'Another survey is already active. Close it before activating a new one.',
          },
        });
      }

      return db.staffSurvey.update({
        where: { id: surveyId },
        data: { status: 'active' },
      });
    })) as SurveyRow;

    // Enqueue notification job after successful transaction
    await this.wellbeingQueue.add('wellbeing:survey-open-notify', {
      tenant_id: tenantId,
      survey_id: surveyId,
    });

    return activated;
  }

  // ─── B3: CLOSE ─────────────────────────────────────────────────────────────

  async close(tenantId: string, surveyId: string): Promise<SurveyRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const closed = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (survey.status !== 'active') {
        throw new ConflictException({
          error: {
            code: 'SURVEY_NOT_ACTIVE',
            message: 'Only active surveys can be closed',
          },
        });
      }

      return db.staffSurvey.update({
        where: { id: surveyId },
        data: {
          status: 'closed',
          results_released: true,
        },
      });
    })) as SurveyRow;

    return closed;
  }

  // ─── B4: SUBMIT RESPONSE ──────────────────────────────────────────────────

  async submitResponse(
    tenantId: string,
    surveyId: string,
    userId: string,
    dto: SubmitSurveyResponseDto,
  ): Promise<{ submitted: true }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    // Collect freeform response IDs for moderation scan (populated inside transaction)
    const freeformResponseIds: string[] = [];
    let moderationEnabled = false;

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Verify survey exists and is active
      const survey = await db.staffSurvey.findFirst({
        where: { id: surveyId, tenant_id: tenantId },
        include: {
          questions: true,
        },
      });

      if (!survey) {
        throw new NotFoundException({
          error: { code: 'SURVEY_NOT_FOUND', message: `Survey "${surveyId}" not found` },
        });
      }

      if (survey.status !== 'active') {
        throw new ConflictException({
          error: {
            code: 'SURVEY_NOT_ACTIVE',
            message: 'This survey is not currently active',
          },
        });
      }

      // 2. Verify within window
      const now = new Date();
      if (now < survey.window_opens_at || now > survey.window_closes_at) {
        throw new ForbiddenException({
          error: {
            code: 'OUTSIDE_SURVEY_WINDOW',
            message: 'This survey is not currently accepting responses',
          },
        });
      }

      // 3. Verify user has staff_profile
      const staffProfile = await db.staffProfile.findFirst({
        where: { tenant_id: tenantId, user_id: userId },
      });

      if (!staffProfile) {
        throw new ForbiddenException({
          error: {
            code: 'NOT_STAFF',
            message: 'Only staff members can submit survey responses',
          },
        });
      }

      // 4. HMAC double-vote check
      const tokenHash = await this.hmacService.computeTokenHash(
        tenantId,
        surveyId,
        userId,
      );

      const existingToken = await db.surveyParticipationToken.findUnique({
        where: {
          survey_id_token_hash: {
            survey_id: surveyId,
            token_hash: tokenHash,
          },
        },
      });

      if (existingToken) {
        throw new ConflictException({
          error: {
            code: 'ALREADY_RESPONDED',
            message: 'You have already submitted a response to this survey',
          },
        });
      }

      // 5. Build question lookup for type checks
      const questionMap = new Map(
        survey.questions.map((q: QuestionRow) => [q.id, q]),
      );

      moderationEnabled = survey.moderation_enabled;

      // 6. Insert participation token (atomic with responses)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await db.surveyParticipationToken.create({
        data: {
          survey_id: surveyId,
          token_hash: tokenHash,
          created_date: today,
        },
      });

      // 7. Insert response rows — NO user_id, NO staff_profile_id
      for (const answer of dto.answers) {
        const question = questionMap.get(answer.question_id);
        const isFreeform = question?.question_type === 'freeform';
        const moderationStatus =
          isFreeform && moderationEnabled ? 'pending' : 'approved';

        const created = await db.surveyResponse.create({
          data: {
            survey_id: surveyId,
            question_id: answer.question_id,
            answer_value: answer.answer_value ?? null,
            answer_text: answer.answer_text ?? null,
            submitted_date: today,
            moderation_status: moderationStatus,
          },
        });

        if (isFreeform && moderationEnabled) {
          freeformResponseIds.push(created.id);
        }
      }
    });

    // 8. Enqueue moderation scan jobs for freeform responses (after transaction)
    for (const responseId of freeformResponseIds) {
      await this.wellbeingQueue.add('wellbeing:moderation-scan', {
        tenant_id: tenantId,
        survey_id: surveyId,
        response_id: responseId,
      });
    }

    return { submitted: true };
  }

  // ─── B5: GET ACTIVE SURVEY FOR STAFF ───────────────────────────────────────

  async getActiveSurvey(
    tenantId: string,
    userId: string,
  ): Promise<ActiveSurveyResult | null> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const survey = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const activeSurvey = await db.staffSurvey.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        include: {
          questions: { orderBy: { display_order: 'asc' } },
        },
      });

      if (!activeSurvey) {
        return null;
      }

      // Check if user has already responded via HMAC token
      const tokenHash = await this.hmacService.computeTokenHash(
        tenantId,
        activeSurvey.id,
        userId,
      );

      const existingToken = await db.surveyParticipationToken.findUnique({
        where: {
          survey_id_token_hash: {
            survey_id: activeSurvey.id,
            token_hash: tokenHash,
          },
        },
      });

      return {
        ...activeSurvey,
        hasResponded: !!existingToken,
      };
    })) as ActiveSurveyResult | null;

    return survey;
  }
}
