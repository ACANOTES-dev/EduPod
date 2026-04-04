import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { SUBMISSION_VALID_TRANSITIONS, type SubmitFormDto } from '@school/shared/engagement';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── Query types ──────────────────────────────────────────────────────────────

interface ListFormSubmissionsQuery {
  page: number;
  pageSize: number;
  form_template_id?: string;
  event_id?: string;
  status?: string;
  student_id?: string;
}

interface CompletionStatsQuery {
  form_template_id?: string;
  event_id?: string;
}

// ─── FormSubmissionsService ───────────────────────────────────────────────────

@Injectable()
export class FormSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parentReadFacade: ParentReadFacade,
  ) {}

  // ─── List (paginated) ───────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListFormSubmissionsQuery) {
    const { page, pageSize, form_template_id, event_id, status, student_id } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EngagementFormSubmissionWhereInput = {
      tenant_id: tenantId,
    };
    if (form_template_id) where.form_template_id = form_template_id;
    if (event_id) where.event_id = event_id;
    if (status) where.status = status as Prisma.EnumFormSubmissionStatusFilter;
    if (student_id) where.student_id = student_id;

    const [data, total] = await Promise.all([
      this.prisma.engagementFormSubmission.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          form_template_id: true,
          event_id: true,
          student_id: true,
          status: true,
          submitted_at: true,
          acknowledged_at: true,
          expired_at: true,
          created_at: true,
          updated_at: true,
          form_template: {
            select: { name: true, form_type: true },
          },
          student: {
            select: { first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.engagementFormSubmission.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Get by ID ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const submission = await this.prisma.engagementFormSubmission.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        form_template: {
          select: {
            id: true,
            name: true,
            form_type: true,
            consent_type: true,
            fields_json: true,
            requires_signature: true,
          },
        },
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        consent_record: true,
      },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'FORM_SUBMISSION_NOT_FOUND',
        message: `Form submission with id "${id}" not found`,
      });
    }

    return submission;
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  /**
   * Validates responses against template fields, stores signature data,
   * transitions to 'submitted', and creates a consent record when applicable.
   */
  async submit(
    tenantId: string,
    submissionId: string,
    dto: SubmitFormDto,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ) {
    // 1. Load submission and verify status
    const submission = await this.prisma.engagementFormSubmission.findFirst({
      where: { id: submissionId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        form_template_id: true,
        student_id: true,
        event_id: true,
        academic_year_id: true,
      },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'FORM_SUBMISSION_NOT_FOUND',
        message: `Form submission with id "${submissionId}" not found`,
      });
    }

    this.validateTransition(submission.status, 'submitted');

    // 2. Fetch template to check signature requirement
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id: submission.form_template_id, tenant_id: tenantId },
      select: {
        id: true,
        form_type: true,
        consent_type: true,
        requires_signature: true,
      },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${submission.form_template_id}" not found`,
      });
    }

    // 3. Validate signature if required
    if (template.requires_signature && !dto.signature) {
      throw new BadRequestException({
        code: 'SIGNATURE_REQUIRED',
        message: 'This form requires a signature',
      });
    }

    // 4. Build signature JSON from DTO + request metadata
    const signatureJson = dto.signature
      ? {
          type: dto.signature.type,
          data: dto.signature.data,
          timestamp: dto.signature.timestamp,
          legal_text_version: dto.signature.legal_text_version,
          ip_address: ipAddress,
          user_agent: userAgent,
          user_id: userId,
        }
      : null;

    const now = new Date();

    // 5. Execute within RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Update submission
      const updated = await db.engagementFormSubmission.update({
        where: { id: submissionId },
        data: {
          responses_json: dto.responses as Prisma.InputJsonValue,
          signature_json: signatureJson ? (signatureJson as Prisma.InputJsonValue) : undefined,
          status: 'submitted',
          submitted_at: now,
          submitted_by_user_id: userId,
        },
      });

      // 6. Create consent record if this is a consent form
      if (template.form_type === 'consent_form' && template.consent_type) {
        const expiresAt = await this.resolveConsentExpiry(
          db,
          tenantId,
          template.consent_type,
          submission.academic_year_id,
          submission.event_id,
        );

        await db.engagementConsentRecord.create({
          data: {
            tenant_id: tenantId,
            student_id: submission.student_id,
            consent_type: template.consent_type,
            form_template_id: submission.form_template_id,
            form_submission_id: submissionId,
            event_id: submission.event_id ?? null,
            status: 'active',
            granted_at: now,
            expires_at: expiresAt,
            academic_year_id: submission.academic_year_id,
          },
        });
      }

      return updated;
    });
  }

  // ─── Acknowledge ────────────────────────────────────────────────────────────

  async acknowledge(tenantId: string, id: string, userId: string) {
    const submission = await this.prisma.engagementFormSubmission.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'FORM_SUBMISSION_NOT_FOUND',
        message: `Form submission with id "${id}" not found`,
      });
    }

    this.validateTransition(submission.status, 'acknowledged');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.engagementFormSubmission.update({
        where: { id },
        data: {
          status: 'acknowledged',
          acknowledged_at: new Date(),
          acknowledged_by_id: userId,
        },
      });
    });
  }

  // ─── Completion Stats ───────────────────────────────────────────────────────

  async getCompletionStats(tenantId: string, query: CompletionStatsQuery) {
    const where: Prisma.EngagementFormSubmissionWhereInput = {
      tenant_id: tenantId,
    };
    if (query.form_template_id) where.form_template_id = query.form_template_id;
    if (query.event_id) where.event_id = query.event_id;

    const [submitted, pending, expired, total] = await Promise.all([
      this.prisma.engagementFormSubmission.count({
        where: { ...where, status: 'submitted' },
      }),
      this.prisma.engagementFormSubmission.count({
        where: { ...where, status: 'pending' },
      }),
      this.prisma.engagementFormSubmission.count({
        where: { ...where, status: 'expired' },
      }),
      this.prisma.engagementFormSubmission.count({ where }),
    ]);

    return { submitted, pending, expired, total };
  }

  // ─── Parent-Scoped Access ───────────────────────────────────────────────────

  /**
   * Returns all pending form submissions for students linked to the given parent.
   */
  async getPendingFormsForParent(tenantId: string, userId: string) {
    const parent = await this.parentReadFacade.findByUserId(tenantId, userId);

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'Parent profile not found for this user',
      });
    }

    const studentIds = await this.parentReadFacade.findLinkedStudentIds(tenantId, parent.id);

    if (studentIds.length === 0) {
      return [];
    }

    return this.prisma.engagementFormSubmission.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        status: 'pending',
      },
      select: {
        id: true,
        form_template_id: true,
        event_id: true,
        student_id: true,
        status: true,
        created_at: true,
        form_template: {
          select: { name: true, form_type: true },
        },
        student: {
          select: { first_name: true, last_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Returns a single submission if the student belongs to the requesting parent.
   */
  async getSubmissionForParent(tenantId: string, submissionId: string, userId: string) {
    const parent = await this.parentReadFacade.findByUserId(tenantId, userId);

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'Parent profile not found for this user',
      });
    }

    const studentIds = await this.parentReadFacade.findLinkedStudentIds(tenantId, parent.id);

    const submission = await this.prisma.engagementFormSubmission.findFirst({
      where: { id: submissionId, tenant_id: tenantId },
      include: {
        form_template: {
          select: {
            id: true,
            name: true,
            form_type: true,
            consent_type: true,
            fields_json: true,
            requires_signature: true,
          },
        },
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        consent_record: true,
      },
    });

    if (!submission || !studentIds.includes(submission.student_id)) {
      throw new NotFoundException({
        code: 'FORM_SUBMISSION_NOT_FOUND',
        message: `Form submission with id "${submissionId}" not found`,
      });
    }

    return submission;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Validate that the requested status transition is allowed.
   */
  private validateTransition(currentStatus: string, targetStatus: string): void {
    const allowed = SUBMISSION_VALID_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${targetStatus}"`,
      });
    }
  }

  /**
   * Resolve the consent record expiry date based on consent type.
   *
   * - annual: end of academic year
   * - standing: never expires (null)
   * - one_time: event end_date if linked to an event, otherwise null
   */
  private async resolveConsentExpiry(
    db: PrismaService,
    tenantId: string,
    consentType: string,
    academicYearId: string,
    eventId: string | null,
  ): Promise<Date | null> {
    if (consentType === 'standing') {
      return null;
    }

    if (consentType === 'annual') {
      const academicYear = await db.academicYear.findFirst({
        where: { id: academicYearId, tenant_id: tenantId },
        select: { end_date: true },
      });

      return academicYear?.end_date ?? null;
    }

    // one_time: use event end date if linked to an event
    if (consentType === 'one_time' && eventId) {
      const event = await db.engagementEvent.findFirst({
        where: { id: eventId, tenant_id: tenantId },
        select: { end_date: true },
      });

      return event?.end_date ?? null;
    }

    return null;
  }
}
