import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  CreateAccommodationDto,
  ExamReportQuery,
  ListAccommodationsQuery,
  UpdateAccommodationDto,
} from '@school/shared';

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

interface AccommodationSummary {
  id: string;
  sen_profile_id: string;
  accommodation_type: string;
  description: string;
  details: Record<string, unknown>;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
  sen_profile: {
    id: string;
    student_id: string;
    primary_category: string;
  };
  approved_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface ExamReportEntry {
  year_group: { id: string; name: string };
  students: Array<{
    student_id: string;
    student_name: string;
    accommodation_id: string;
    description: string;
    details: Record<string, unknown>;
  }>;
}

type AccommodationRecord = Prisma.SenAccommodationGetPayload<{
  include: {
    sen_profile: {
      select: {
        id: true;
        student_id: true;
        primary_category: true;
      };
    };
    approved_by: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
      };
    };
  };
}>;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SenAccommodationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    profileId: string,
    dto: Omit<CreateAccommodationDto, 'sen_profile_id'>,
  ): Promise<AccommodationSummary> {
    await this.assertProfileExists(tenantId, profileId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const accommodation = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senAccommodation.create({
        data: {
          tenant_id: tenantId,
          sen_profile_id: profileId,
          accommodation_type: dto.accommodation_type,
          description: dto.description,
          details: (dto.details ?? {}) as Prisma.InputJsonValue,
          start_date: dto.start_date ? new Date(dto.start_date) : null,
          end_date: dto.end_date ? new Date(dto.end_date) : null,
          is_active: dto.is_active ?? true,
        },
        include: this.accommodationInclude,
      });
    })) as AccommodationRecord;

    return this.mapAccommodation(accommodation);
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAllByProfile(
    tenantId: string,
    profileId: string,
    query: ListAccommodationsQuery,
  ): Promise<PaginationResult<AccommodationSummary>> {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SenAccommodationWhereInput = {
      tenant_id: tenantId,
      sen_profile_id: profileId,
    };

    if (query.accommodation_type) {
      where.accommodation_type = query.accommodation_type;
    }

    if (query.is_active !== undefined) {
      where.is_active = query.is_active;
    }

    const [accommodations, total] = await Promise.all([
      this.prisma.senAccommodation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
        include: this.accommodationInclude,
      }),
      this.prisma.senAccommodation.count({ where }),
    ]);

    return {
      data: accommodations.map((accommodation) => this.mapAccommodation(accommodation)),
      meta: { page, pageSize, total },
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAccommodationDto,
  ): Promise<AccommodationSummary> {
    await this.assertAccommodationExists(tenantId, id);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const accommodation = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senAccommodation.update({
        where: { id },
        data: {
          accommodation_type: dto.accommodation_type,
          description: dto.description,
          details: dto.details !== undefined ? (dto.details as Prisma.InputJsonValue) : undefined,
          start_date:
            dto.start_date === undefined
              ? undefined
              : dto.start_date
                ? new Date(dto.start_date)
                : null,
          end_date:
            dto.end_date === undefined ? undefined : dto.end_date ? new Date(dto.end_date) : null,
          is_active: dto.is_active,
          approved_by_user_id:
            dto.approved_by_user_id === undefined ? undefined : dto.approved_by_user_id,
          approved_at:
            dto.approved_at === undefined
              ? undefined
              : dto.approved_at
                ? new Date(dto.approved_at)
                : null,
        },
        include: this.accommodationInclude,
      });
    })) as AccommodationRecord;

    return this.mapAccommodation(accommodation);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string): Promise<void> {
    await this.assertAccommodationExists(tenantId, id);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      await db.senAccommodation.delete({ where: { id } });
    });
  }

  // ─── Exam Report ──────────────────────────────────────────────────────────

  async getExamReport(tenantId: string, query: ExamReportQuery): Promise<ExamReportEntry[]> {
    const where: Prisma.SenAccommodationWhereInput = {
      tenant_id: tenantId,
      accommodation_type: 'exam',
      is_active: true,
    };

    if (query.year_group_id) {
      where.sen_profile = {
        student: { is: { year_group_id: query.year_group_id } },
      };
    }

    const accommodations = await this.prisma.senAccommodation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        sen_profile: {
          select: {
            id: true,
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                year_group: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const yearGroupMap = new Map<
      string,
      {
        year_group: { id: string; name: string };
        students: Array<{
          student_id: string;
          student_name: string;
          accommodation_id: string;
          description: string;
          details: Record<string, unknown>;
        }>;
      }
    >();

    for (const accommodation of accommodations) {
      const student = accommodation.sen_profile.student;
      const yearGroup = student.year_group;

      if (!yearGroup) continue;

      const key = yearGroup.id;
      const entry = yearGroupMap.get(key) ?? {
        year_group: { id: yearGroup.id, name: yearGroup.name },
        students: [],
      };

      entry.students.push({
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        accommodation_id: accommodation.id,
        description: accommodation.description,
        details: accommodation.details as Record<string, unknown>,
      });

      yearGroupMap.set(key, entry);
    }

    return [...yearGroupMap.values()].sort((left, right) =>
      left.year_group.name.localeCompare(right.year_group.name),
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private readonly accommodationInclude = {
    sen_profile: {
      select: {
        id: true,
        student_id: true,
        primary_category: true,
      },
    },
    approved_by: {
      select: {
        id: true,
        first_name: true,
        last_name: true,
      },
    },
  } satisfies Prisma.SenAccommodationInclude;

  private mapAccommodation(accommodation: AccommodationRecord): AccommodationSummary {
    return {
      id: accommodation.id,
      sen_profile_id: accommodation.sen_profile_id,
      accommodation_type: accommodation.accommodation_type,
      description: accommodation.description,
      details: accommodation.details as Record<string, unknown>,
      start_date: accommodation.start_date,
      end_date: accommodation.end_date,
      is_active: accommodation.is_active,
      approved_by_user_id: accommodation.approved_by_user_id,
      approved_at: accommodation.approved_at,
      created_at: accommodation.created_at,
      updated_at: accommodation.updated_at,
      sen_profile: accommodation.sen_profile,
      approved_by: accommodation.approved_by,
    };
  }

  private async assertProfileExists(tenantId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.senProfile.findFirst({
      where: {
        id: profileId,
        tenant_id: tenantId,
      },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${profileId}" not found`,
      });
    }
  }

  private async assertAccommodationExists(tenantId: string, id: string): Promise<void> {
    const accommodation = await this.prisma.senAccommodation.findFirst({
      where: {
        id,
        tenant_id: tenantId,
      },
      select: { id: true },
    });

    if (!accommodation) {
      throw new NotFoundException({
        code: 'ACCOMMODATION_NOT_FOUND',
        message: `Accommodation with id "${id}" not found`,
      });
    }
  }
}
