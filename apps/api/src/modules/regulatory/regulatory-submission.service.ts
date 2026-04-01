import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegulatorySubmissionStatus } from '@prisma/client';

import type { CreateSubmissionDto, UpdateSubmissionDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const API_STATUS_TO_PRISMA: Record<string, RegulatorySubmissionStatus> = {
  not_started: RegulatorySubmissionStatus.reg_not_started,
  in_progress: RegulatorySubmissionStatus.reg_in_progress,
  ready_for_review: RegulatorySubmissionStatus.ready_for_review,
  submitted: RegulatorySubmissionStatus.reg_submitted,
  accepted: RegulatorySubmissionStatus.reg_accepted,
  rejected: RegulatorySubmissionStatus.reg_rejected,
  overdue: RegulatorySubmissionStatus.overdue,
};

interface ListSubmissionsParams {
  page: number;
  pageSize: number;
  domain?: string;
  status?: string;
  academic_year?: string;
}

@Injectable()
export class RegulatorySubmissionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSubmissionDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.regulatorySubmission.create({
        data: {
          tenant_id: tenantId,
          domain: dto.domain,
          submission_type: dto.submission_type,
          academic_year: dto.academic_year,
          period_label: dto.period_label ?? null,
          status: API_STATUS_TO_PRISMA[dto.status] ?? RegulatorySubmissionStatus.reg_not_started,
          generated_at: new Date(),
          generated_by_id: userId,
          record_count: dto.record_count ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, params: ListSubmissionsParams) {
    const { page, pageSize, domain, status, academic_year } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.RegulatorySubmissionWhereInput = { tenant_id: tenantId };

    if (domain) where.domain = domain as Prisma.EnumRegulatoryDomainFilter;
    if (status) where.status = API_STATUS_TO_PRISMA[status];
    if (academic_year) where.academic_year = academic_year;

    const [data, total] = await Promise.all([
      this.prisma.regulatorySubmission.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          generated_by: { select: { id: true, first_name: true, last_name: true } },
          submitted_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.regulatorySubmission.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const submission = await this.prisma.regulatorySubmission.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        generated_by: { select: { id: true, first_name: true, last_name: true } },
        submitted_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: `Regulatory submission with id "${id}" not found`,
      });
    }

    return submission;
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, userId: string, dto: UpdateSubmissionDto) {
    await this.findOne(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Prisma.RegulatorySubmissionUncheckedUpdateInput = {};
      if (dto.status !== undefined) {
        data.status = API_STATUS_TO_PRISMA[dto.status];
        if (dto.status === 'submitted') {
          data.submitted_at = new Date();
          data.submitted_by_id = userId;
        }
      }
      if (dto.file_key !== undefined) data.file_key = dto.file_key;
      if (dto.file_hash !== undefined) data.file_hash = dto.file_hash;
      if (dto.record_count !== undefined) data.record_count = dto.record_count;
      if (dto.validation_errors !== undefined) {
        data.validation_errors = dto.validation_errors ?? Prisma.DbNull;
      }
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.submitted_at !== undefined) {
        data.submitted_at = dto.submitted_at ? new Date(dto.submitted_at) : null;
      }

      return db.regulatorySubmission.update({ where: { id }, data });
    });
  }
}
