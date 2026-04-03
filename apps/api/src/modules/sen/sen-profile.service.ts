import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  CreateSenProfileDto,
  ListSenProfilesQuery,
  UpdateSenProfileDto,
} from '@school/shared/sen';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { SenScopeService } from './sen-scope.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface SenProfileWithRelations {
  id: string;
  tenant_id: string;
  student_id: string;
  sen_coordinator_user_id: string | null;
  sen_categories: Prisma.JsonValue;
  primary_category: string;
  support_level: string;
  diagnosis: string | null;
  diagnosis_date: Date | null;
  diagnosis_source: string | null;
  assessment_notes: string | null;
  is_active: boolean;
  flagged_date: Date | null;
  unflagged_date: Date | null;
  created_at: Date;
  updated_at: Date;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group_id: string | null;
  } | null;
  sen_coordinator: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  support_plans: Array<{
    id: string;
    plan_number: string;
    status: string;
    version: number;
  }>;
  accommodations: Array<{
    id: string;
    accommodation_type: string;
    description: string;
    is_active: boolean;
  }>;
  involvements: Array<{
    id: string;
    professional_type: string;
    professional_name: string | null;
    status: string;
  }>;
}

interface OverviewResult {
  totalSenStudents: number;
  byCategory: Record<string, number>;
  bySupportLevel: Record<string, number>;
  byYearGroup: Array<{
    yearGroupId: string;
    yearGroupName: string;
    count: number;
  }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SenProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: SenScopeService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateSenProfileDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as typeof this.prisma;

        return await db.senProfile.create({
          data: {
            tenant_id: tenantId,
            student_id: dto.student_id,
            sen_coordinator_user_id: dto.sen_coordinator_user_id ?? null,
            sen_categories: dto.sen_categories as unknown as Prisma.InputJsonValue,
            primary_category: dto.primary_category,
            support_level: dto.support_level,
            diagnosis: dto.diagnosis ?? null,
            diagnosis_date: dto.diagnosis_date ? new Date(dto.diagnosis_date) : null,
            diagnosis_source: dto.diagnosis_source ?? null,
            assessment_notes: dto.assessment_notes ?? null,
            is_active: dto.is_active ?? true,
            flagged_date: dto.flagged_date ? new Date(dto.flagged_date) : null,
            unflagged_date: dto.unflagged_date ? new Date(dto.unflagged_date) : null,
          },
          include: {
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                year_group_id: true,
              },
            },
            sen_coordinator: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'SEN_PROFILE_ALREADY_EXISTS',
          message: 'SEN profile already exists for this student',
        });
      }
      throw error;
    }
  }

  // ─── List with Scope Filtering ────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListSenProfilesQuery,
  ): Promise<PaginationResult<SenProfileWithRelations>> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return {
        data: [],
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
        },
      };
    }

    const where: Prisma.SenProfileWhereInput = {
      tenant_id: tenantId,
    };

    // Apply scope filtering
    if (scope.scope === 'class' && scope.studentIds) {
      where.student_id = { in: scope.studentIds };
    }

    // Apply query filters
    if (query.is_active !== undefined) {
      where.is_active = query.is_active;
    }

    if (query.primary_category) {
      where.primary_category = query.primary_category;
    }

    if (query.support_level) {
      where.support_level = query.support_level;
    }

    if (query.student_id) {
      where.student_id = query.student_id;
    }

    if (query.sen_coordinator_user_id) {
      where.sen_coordinator_user_id = query.sen_coordinator_user_id;
    }

    if (query.search) {
      where.student = {
        OR: [
          { first_name: { contains: query.search, mode: 'insensitive' } },
          { last_name: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.senProfile.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group_id: true,
            },
          },
          sen_coordinator: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.senProfile.count({ where }),
    ]);

    return {
      data: data as unknown as SenProfileWithRelations[],
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  // ─── Get Single Profile ─────────────────────────────────────────────────────

  async findOne(
    tenantId: string,
    userId: string,
    permissions: string[],
    id: string,
  ): Promise<SenProfileWithRelations> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${id}" not found`,
      });
    }

    const profile = await this.prisma.senProfile.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        ...(scope.scope === 'class' && scope.studentIds
          ? { student_id: { in: scope.studentIds } }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group_id: true,
          },
        },
        sen_coordinator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        support_plans: {
          select: {
            id: true,
            plan_number: true,
            status: true,
            version: true,
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
        accommodations: {
          select: {
            id: true,
            accommodation_type: true,
            description: true,
            is_active: true,
          },
          where: { is_active: true },
        },
        involvements: {
          select: {
            id: true,
            professional_type: true,
            professional_name: true,
            status: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${id}" not found`,
      });
    }

    // Apply sensitive field redaction
    const canViewSensitive = permissions.includes('sen.view_sensitive');
    if (!canViewSensitive) {
      const redactedProfile = {
        ...profile,
        diagnosis: null,
        diagnosis_date: null,
        diagnosis_source: null,
        assessment_notes: null,
        involvements: [],
      };
      return redactedProfile as unknown as SenProfileWithRelations;
    }

    return profile as unknown as SenProfileWithRelations;
  }

  // ─── Get Profile by Student ID ──────────────────────────────────────────────

  async findByStudent(
    tenantId: string,
    userId: string,
    permissions: string[],
    studentId: string,
  ): Promise<SenProfileWithRelations> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile for student "${studentId}" not found`,
      });
    }

    if (scope.scope === 'class' && scope.studentIds && !scope.studentIds.includes(studentId)) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile for student "${studentId}" not found`,
      });
    }

    const profile = await this.prisma.senProfile.findFirst({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group_id: true,
          },
        },
        sen_coordinator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        support_plans: {
          select: {
            id: true,
            plan_number: true,
            status: true,
            version: true,
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
        accommodations: {
          select: {
            id: true,
            accommodation_type: true,
            description: true,
            is_active: true,
          },
          where: { is_active: true },
        },
        involvements: {
          select: {
            id: true,
            professional_type: true,
            professional_name: true,
            status: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile for student "${studentId}" not found`,
      });
    }

    // Apply sensitive field redaction
    const canViewSensitive = permissions.includes('sen.view_sensitive');
    if (!canViewSensitive) {
      const redactedProfile = {
        ...profile,
        diagnosis: null,
        diagnosis_date: null,
        diagnosis_source: null,
        assessment_notes: null,
        involvements: [],
      };
      return redactedProfile as unknown as SenProfileWithRelations;
    }

    return profile as unknown as SenProfileWithRelations;
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateSenProfileDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      // Check existence first
      const existing = await db.senProfile.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SEN_PROFILE_NOT_FOUND',
          message: `SEN profile with id "${id}" not found`,
        });
      }

      return await db.senProfile.update({
        where: { id },
        data: {
          sen_coordinator_user_id: dto.sen_coordinator_user_id ?? undefined,
          sen_categories: dto.sen_categories
            ? (dto.sen_categories as unknown as Prisma.InputJsonValue)
            : undefined,
          primary_category: dto.primary_category ?? undefined,
          support_level: dto.support_level ?? undefined,
          diagnosis: dto.diagnosis !== undefined ? dto.diagnosis : undefined,
          diagnosis_date:
            dto.diagnosis_date !== undefined
              ? dto.diagnosis_date
                ? new Date(dto.diagnosis_date)
                : null
              : undefined,
          diagnosis_source: dto.diagnosis_source !== undefined ? dto.diagnosis_source : undefined,
          assessment_notes: dto.assessment_notes !== undefined ? dto.assessment_notes : undefined,
          is_active: dto.is_active ?? undefined,
          flagged_date:
            dto.flagged_date !== undefined
              ? dto.flagged_date
                ? new Date(dto.flagged_date)
                : null
              : undefined,
          unflagged_date:
            dto.unflagged_date !== undefined
              ? dto.unflagged_date
                ? new Date(dto.unflagged_date)
                : null
              : undefined,
        },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group_id: true,
            },
          },
          sen_coordinator: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });
    });
  }

  // ─── Dashboard Overview ───────────────────────────────────────────────────────

  async getOverview(tenantId: string): Promise<OverviewResult> {
    const [totalSenStudents, byCategory, bySupportLevel, byYearGroup] = await Promise.all([
      // Total SEN students
      this.prisma.senProfile.count({
        where: { tenant_id: tenantId, is_active: true },
      }),

      // By category
      this.prisma.senProfile.groupBy({
        by: ['primary_category'],
        where: { tenant_id: tenantId, is_active: true },
        _count: { id: true },
      }),

      // By support level
      this.prisma.senProfile.groupBy({
        by: ['support_level'],
        where: { tenant_id: tenantId, is_active: true },
        _count: { id: true },
      }),

      // By year group (via student relation)
      this.prisma.senProfile.findMany({
        where: { tenant_id: tenantId, is_active: true },
        select: {
          student: {
            select: {
              year_group_id: true,
            },
          },
        },
      }),
    ]);

    // Transform category counts
    const categoryMap: Record<string, number> = {};
    byCategory.forEach((item) => {
      categoryMap[item.primary_category] = item._count.id;
    });

    // Transform support level counts
    const supportLevelMap: Record<string, number> = {};
    bySupportLevel.forEach((item) => {
      supportLevelMap[item.support_level] = item._count.id;
    });

    // Transform year group counts
    const yearGroupCounts: Record<string, number> = {};
    byYearGroup.forEach((profile) => {
      const yearGroupId = profile.student?.year_group_id;
      if (yearGroupId) {
        yearGroupCounts[yearGroupId] = (yearGroupCounts[yearGroupId] || 0) + 1;
      }
    });

    // Fetch year group names
    const yearGroupIds = Object.keys(yearGroupCounts);
    let yearGroupNames: Record<string, string> = {};
    if (yearGroupIds.length > 0) {
      const yearGroups = await this.prisma.yearGroup.findMany({
        where: { id: { in: yearGroupIds }, tenant_id: tenantId },
        select: { id: true, name: true },
      });
      yearGroupNames = yearGroups.reduce(
        (acc, yg) => {
          acc[yg.id] = yg.name;
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    return {
      totalSenStudents,
      byCategory: categoryMap,
      bySupportLevel: supportLevelMap,
      byYearGroup: Object.entries(yearGroupCounts).map(([yearGroupId, count]) => ({
        yearGroupId,
        yearGroupName: yearGroupNames[yearGroupId] || 'Unknown',
        count,
      })),
    };
  }
}
