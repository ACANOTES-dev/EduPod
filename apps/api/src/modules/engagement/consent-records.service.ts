import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { SUBMISSION_VALID_TRANSITIONS } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Query types ──────────────────────────────────────────────────────────────

interface ListConsentRecordsQuery {
  page: number;
  pageSize: number;
  student_id?: string;
  consent_type?: string;
  form_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ConsentRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── findAll ──────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListConsentRecordsQuery) {
    const { page, pageSize, student_id, consent_type, form_type, status, date_from, date_to } =
      query;

    const where: Prisma.EngagementConsentRecordWhereInput = {
      tenant_id: tenantId,
    };

    if (student_id) {
      where.student_id = student_id;
    }

    if (consent_type) {
      where.consent_type = consent_type as Prisma.EngagementConsentRecordWhereInput['consent_type'];
    }

    if (status) {
      where.status = status as Prisma.EngagementConsentRecordWhereInput['status'];
    }

    if (form_type) {
      where.form_template = {
        form_type: form_type as Prisma.EngagementFormTemplateWhereInput['form_type'],
      };
    }

    if (date_from || date_to) {
      const grantedAtFilter: Prisma.DateTimeFilter = {};
      if (date_from) {
        grantedAtFilter.gte = new Date(date_from);
      }
      if (date_to) {
        grantedAtFilter.lte = new Date(date_to);
      }
      where.granted_at = grantedAtFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.engagementConsentRecord.findMany({
        where,
        include: {
          student: { select: { first_name: true, last_name: true } },
          form_template: { select: { name: true, form_type: true } },
        },
        orderBy: { granted_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.engagementConsentRecord.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── findByStudent ────────────────────────────────────────────────────────

  async findByStudent(tenantId: string, studentId: string) {
    return this.prisma.engagementConsentRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      include: {
        form_template: { select: { name: true, form_type: true } },
        form_submission: { select: { id: true, status: true, submitted_at: true } },
      },
      orderBy: { granted_at: 'desc' },
    });
  }

  // ─── revoke ───────────────────────────────────────────────────────────────

  /**
   * Revokes an active standing or annual consent record.
   * One-time consent (event-linked) cannot be revoked.
   * Also transitions the linked form submission to 'revoked'.
   */
  async revoke(tenantId: string, consentId: string, reason?: string) {
    const record = await this.prisma.engagementConsentRecord.findFirst({
      where: { id: consentId, tenant_id: tenantId },
      include: { form_submission: { select: { id: true, status: true } } },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CONSENT_RECORD_NOT_FOUND',
        message: `Consent record "${consentId}" not found.`,
      });
    }

    if (record.consent_type === 'one_time') {
      throw new BadRequestException({
        code: 'ONE_TIME_CONSENT_NOT_REVOCABLE',
        message: 'One-time consent linked to an event cannot be revoked.',
      });
    }

    if (record.status !== 'active') {
      throw new BadRequestException({
        code: 'CONSENT_NOT_ACTIVE',
        message: 'Only active consent records can be revoked.',
      });
    }

    // Validate submission transition is allowed
    const submissionStatus = record.form_submission.status;
    const allowed = SUBMISSION_VALID_TRANSITIONS[submissionStatus] ?? [];
    if (!allowed.includes('revoked')) {
      throw new BadRequestException({
        code: 'SUBMISSION_TRANSITION_BLOCKED',
        message: `Cannot revoke: linked submission status "${submissionStatus}" does not allow transition to "revoked".`,
      });
    }

    const now = new Date();

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const updatedConsent = await db.engagementConsentRecord.update({
        where: { id: consentId },
        data: {
          status: 'revoked',
          revoked_at: now,
        },
      });

      await db.engagementFormSubmission.update({
        where: { id: record.form_submission.id },
        data: {
          status: 'revoked',
          revoked_at: now,
          revocation_reason: reason ?? null,
        },
      });

      return updatedConsent;
    });
  }
}
