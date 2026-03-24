import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AiGradingInstructionStatus } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type {
  CreateAiGradingInstructionDto,
  ReviewAiGradingInstructionDto,
} from './dto/gradebook.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListInstructionsQuery {
  class_id?: string;
  subject_id?: string;
  status?: AiGradingInstructionStatus;
}

interface CreateReferenceDto {
  assessment_id: string;
  file_url: string;
  file_type: string;
  auto_approve: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiGradingInstructionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── AI Grading Instructions ──────────────────────────────────────────────

  /**
   * Create or update a grading instruction for a class-subject pair.
   * Updating resets status to pending_approval.
   */
  async upsertInstruction(
    tenantId: string,
    userId: string,
    dto: CreateAiGradingInstructionDto,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.aiGradingInstruction.findFirst({
        where: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          subject_id: dto.subject_id,
        },
        select: { id: true },
      });

      if (existing) {
        return db.aiGradingInstruction.update({
          where: { id: existing.id },
          data: {
            instruction_text: dto.instruction_text,
            status: 'pending_approval',
            submitted_by_user_id: userId,
            reviewed_by_user_id: null,
            reviewed_at: null,
            rejection_reason: null,
          },
        });
      }

      return db.aiGradingInstruction.create({
        data: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          subject_id: dto.subject_id,
          instruction_text: dto.instruction_text,
          status: 'pending_approval',
          submitted_by_user_id: userId,
        },
      });
    });
  }

  /**
   * List grading instructions with optional filters.
   */
  async listInstructions(tenantId: string, query: ListInstructionsQuery) {
    const data = await this.prisma.aiGradingInstruction.findMany({
      where: {
        tenant_id: tenantId,
        ...(query.class_id ? { class_id: query.class_id } : {}),
        ...(query.subject_id ? { subject_id: query.subject_id } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        submitted_by: { select: { id: true, first_name: true, last_name: true } },
        reviewed_by: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return { data };
  }

  /**
   * Get a single grading instruction by ID.
   */
  async findOneInstruction(tenantId: string, id: string) {
    const record = await this.prisma.aiGradingInstruction.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        submitted_by: { select: { id: true, first_name: true, last_name: true } },
        reviewed_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'AI_GRADING_INSTRUCTION_NOT_FOUND',
          message: `AI grading instruction "${id}" not found`,
        },
      });
    }

    return record;
  }

  /**
   * Approve or reject a grading instruction.
   */
  async reviewInstruction(
    tenantId: string,
    instructionId: string,
    reviewerId: string,
    dto: ReviewAiGradingInstructionDto,
  ) {
    const record = await this.prisma.aiGradingInstruction.findFirst({
      where: { id: instructionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'AI_GRADING_INSTRUCTION_NOT_FOUND',
          message: `AI grading instruction "${instructionId}" not found`,
        },
      });
    }

    if (record.status !== 'pending_approval') {
      throw new ConflictException({
        error: {
          code: 'INSTRUCTION_NOT_PENDING',
          message: `Instruction is "${record.status}", not pending_approval`,
        },
      });
    }

    if (dto.status === 'rejected' && !dto.rejection_reason) {
      throw new BadRequestException({
        error: {
          code: 'REJECTION_REASON_REQUIRED',
          message: 'rejection_reason is required when rejecting',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.aiGradingInstruction.update({
        where: { id: instructionId },
        data: {
          status: dto.status,
          reviewed_by_user_id: reviewerId,
          reviewed_at: new Date(),
          rejection_reason: dto.rejection_reason ?? null,
        },
      });
    });
  }

  /**
   * Delete a grading instruction (only draft/rejected can be deleted).
   */
  async deleteInstruction(tenantId: string, id: string, userId: string) {
    const record = await this.prisma.aiGradingInstruction.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, submitted_by_user_id: true },
    });

    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'AI_GRADING_INSTRUCTION_NOT_FOUND',
          message: `AI grading instruction "${id}" not found`,
        },
      });
    }

    if (record.status === 'active') {
      throw new ConflictException({
        error: {
          code: 'CANNOT_DELETE_ACTIVE_INSTRUCTION',
          message: 'Cannot delete an active instruction. Reject it first.',
        },
      });
    }

    if (record.submitted_by_user_id !== userId) {
      throw new ForbiddenException({
        error: {
          code: 'NOT_INSTRUCTION_OWNER',
          message: 'Only the submitter can delete this instruction',
        },
      });
    }

    await this.prisma.aiGradingInstruction.delete({ where: { id } });
  }

  // ─── AI Grading References ────────────────────────────────────────────────

  /**
   * Create a reference marking scheme for an assessment.
   */
  async createReference(
    tenantId: string,
    userId: string,
    dto: CreateReferenceDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: dto.assessment_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        error: {
          code: 'ASSESSMENT_NOT_FOUND',
          message: `Assessment "${dto.assessment_id}" not found`,
        },
      });
    }

    const status = dto.auto_approve ? 'active' : 'pending_approval';

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.aiGradingReference.create({
        data: {
          tenant_id: tenantId,
          assessment_id: dto.assessment_id,
          file_url: dto.file_url,
          file_type: dto.file_type,
          uploaded_by_user_id: userId,
          status,
        },
      });
    });
  }

  /**
   * List grading references for an assessment.
   */
  async listReferences(tenantId: string, assessmentId: string) {
    const data = await this.prisma.aiGradingReference.findMany({
      where: { tenant_id: tenantId, assessment_id: assessmentId },
      include: {
        uploaded_by: { select: { id: true, first_name: true, last_name: true } },
        reviewed_by: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return { data };
  }

  /**
   * Review (approve/reject) a grading reference.
   */
  async reviewReference(
    tenantId: string,
    referenceId: string,
    reviewerId: string,
    dto: ReviewAiGradingInstructionDto,
  ) {
    const record = await this.prisma.aiGradingReference.findFirst({
      where: { id: referenceId, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'AI_GRADING_REFERENCE_NOT_FOUND',
          message: `AI grading reference "${referenceId}" not found`,
        },
      });
    }

    if (record.status !== 'pending_approval') {
      throw new ConflictException({
        error: {
          code: 'REFERENCE_NOT_PENDING',
          message: `Reference is "${record.status}", not pending_approval`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.aiGradingReference.update({
        where: { id: referenceId },
        data: {
          status: dto.status,
          reviewed_by_user_id: reviewerId,
          reviewed_at: new Date(),
        },
      });
    });
  }

  /**
   * Delete a grading reference.
   */
  async deleteReference(tenantId: string, referenceId: string) {
    const record = await this.prisma.aiGradingReference.findFirst({
      where: { id: referenceId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException({
        error: {
          code: 'AI_GRADING_REFERENCE_NOT_FOUND',
          message: `AI grading reference "${referenceId}" not found`,
        },
      });
    }

    await this.prisma.aiGradingReference.delete({ where: { id: referenceId } });
  }
}
