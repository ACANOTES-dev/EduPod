import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  isValidReferralTransition,
  type CreateProfessionalInvolvementDto,
  type ListProfessionalInvolvementsQuery,
  type SenReferralStatus,
  type UpdateProfessionalInvolvementDto,
} from '@school/shared/sen';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface ProfessionalInvolvementSummary {
  id: string;
  sen_profile_id: string;
  professional_type: string;
  professional_name: string | null;
  organisation: string | null;
  referral_date: Date | null;
  assessment_date: Date | null;
  report_received_date: Date | null;
  recommendations: string | null;
  status: string;
  pastoral_referral_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  sen_profile: {
    id: string;
    student_id: string;
    primary_category: string;
    support_level: string;
    is_active: boolean;
  };
}

type ProfessionalInvolvementRecord = Prisma.SenProfessionalInvolvementGetPayload<{
  include: {
    sen_profile: {
      select: {
        id: true;
        student_id: true;
        primary_category: true;
        support_level: true;
        is_active: true;
      };
    };
  };
}>;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SenProfessionalService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    profileId: string,
    dto: Omit<CreateProfessionalInvolvementDto, 'sen_profile_id'>,
  ): Promise<ProfessionalInvolvementSummary> {
    await this.assertProfileExists(tenantId, profileId);

    if (dto.pastoral_referral_id) {
      await this.assertPastoralReferralExists(tenantId, dto.pastoral_referral_id);
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senProfessionalInvolvement.create({
        data: {
          tenant_id: tenantId,
          sen_profile_id: profileId,
          professional_type: dto.professional_type,
          professional_name: dto.professional_name ?? null,
          organisation: dto.organisation ?? null,
          referral_date: dto.referral_date ? new Date(dto.referral_date) : null,
          assessment_date: dto.assessment_date ? new Date(dto.assessment_date) : null,
          report_received_date: dto.report_received_date
            ? new Date(dto.report_received_date)
            : null,
          recommendations: dto.recommendations ?? null,
          status: dto.status ?? 'pending',
          pastoral_referral_id: dto.pastoral_referral_id ?? null,
          notes: dto.notes ?? null,
        },
        include: this.involvementInclude,
      });
    })) as ProfessionalInvolvementRecord;

    return this.mapInvolvement(record);
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAllByProfile(
    tenantId: string,
    profileId: string,
    query: ListProfessionalInvolvementsQuery,
  ): Promise<PaginationResult<ProfessionalInvolvementSummary>> {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SenProfessionalInvolvementWhereInput = {
      tenant_id: tenantId,
      sen_profile_id: profileId,
    };

    if (query.professional_type) {
      where.professional_type = query.professional_type;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [records, total] = await Promise.all([
      this.prisma.senProfessionalInvolvement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ referral_date: 'desc' }, { created_at: 'desc' }],
        include: this.involvementInclude,
      }),
      this.prisma.senProfessionalInvolvement.count({ where }),
    ]);

    return {
      data: records.map((record) => this.mapInvolvement(record)),
      meta: { page, pageSize, total },
    };
  }

  // ─── Count (for users without sen.view_sensitive) ──────────────────────────

  async countByProfile(tenantId: string, profileId: string): Promise<{ total: number }> {
    const total = await this.prisma.senProfessionalInvolvement.count({
      where: { tenant_id: tenantId, sen_profile_id: profileId },
    });

    return { total };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProfessionalInvolvementDto,
  ): Promise<ProfessionalInvolvementSummary> {
    const existing = await this.prisma.senProfessionalInvolvement.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_INVOLVEMENT_NOT_FOUND',
        message: `Professional involvement record with id "${id}" not found`,
      });
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      if (
        !isValidReferralTransition(
          existing.status as SenReferralStatus,
          dto.status as SenReferralStatus,
        )
      ) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from "${existing.status}" to "${dto.status}"`,
        });
      }
    }

    if (dto.pastoral_referral_id) {
      await this.assertPastoralReferralExists(tenantId, dto.pastoral_referral_id);
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senProfessionalInvolvement.update({
        where: { id },
        data: {
          professional_type: dto.professional_type,
          professional_name: dto.professional_name,
          organisation: dto.organisation,
          referral_date:
            dto.referral_date === undefined
              ? undefined
              : dto.referral_date
                ? new Date(dto.referral_date)
                : null,
          assessment_date:
            dto.assessment_date === undefined
              ? undefined
              : dto.assessment_date
                ? new Date(dto.assessment_date)
                : null,
          report_received_date:
            dto.report_received_date === undefined
              ? undefined
              : dto.report_received_date
                ? new Date(dto.report_received_date)
                : null,
          recommendations: dto.recommendations,
          status: dto.status,
          pastoral_referral_id: dto.pastoral_referral_id,
          notes: dto.notes,
        },
        include: this.involvementInclude,
      });
    })) as ProfessionalInvolvementRecord;

    return this.mapInvolvement(record);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.senProfessionalInvolvement.findFirst({
        where: { id, tenant_id: tenantId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'PROFESSIONAL_INVOLVEMENT_NOT_FOUND',
          message: `Professional involvement record with id "${id}" not found`,
        });
      }

      await db.senProfessionalInvolvement.delete({ where: { id } });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private readonly involvementInclude = {
    sen_profile: {
      select: {
        id: true,
        student_id: true,
        primary_category: true,
        support_level: true,
        is_active: true,
      },
    },
  } satisfies Prisma.SenProfessionalInvolvementInclude;

  private mapInvolvement(record: ProfessionalInvolvementRecord): ProfessionalInvolvementSummary {
    return {
      id: record.id,
      sen_profile_id: record.sen_profile_id,
      professional_type: record.professional_type,
      professional_name: record.professional_name,
      organisation: record.organisation,
      referral_date: record.referral_date,
      assessment_date: record.assessment_date,
      report_received_date: record.report_received_date,
      recommendations: record.recommendations,
      status: record.status,
      pastoral_referral_id: record.pastoral_referral_id,
      notes: record.notes,
      created_at: record.created_at,
      updated_at: record.updated_at,
      sen_profile: record.sen_profile,
    };
  }

  private async assertProfileExists(tenantId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.senProfile.findFirst({
      where: { id: profileId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${profileId}" not found`,
      });
    }
  }

  private async assertInvolvementExists(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.senProfessionalInvolvement.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_INVOLVEMENT_NOT_FOUND',
        message: `Professional involvement record with id "${id}" not found`,
      });
    }
  }

  private async assertPastoralReferralExists(tenantId: string, referralId: string): Promise<void> {
    const referral = await this.prisma.pastoralReferral.findFirst({
      where: { id: referralId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!referral) {
      throw new NotFoundException({
        code: 'PASTORAL_REFERRAL_NOT_FOUND',
        message: `Pastoral referral with id "${referralId}" not found`,
      });
    }
  }
}
