import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateResourceAllocationDto,
  CreateSenStudentHoursDto,
  ListResourceAllocationsQuery,
  ListSenStudentHoursQuery,
  ResourceUtilisationQuery,
  UpdateResourceAllocationDto,
  UpdateSenStudentHoursDto,
} from '@school/shared';

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

interface ResourceAllocationSummary {
  id: string;
  academic_year_id: string;
  total_hours: number;
  source: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  academic_year: {
    id: string;
    name: string;
    status: string;
    start_date: Date;
    end_date: Date;
  };
}

interface StudentHoursSummary {
  id: string;
  resource_allocation_id: string;
  student_id: string;
  sen_profile_id: string;
  allocated_hours: number;
  used_hours: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  assigned_percentage: number;
  used_percentage: number;
  resource_allocation: {
    id: string;
    academic_year_id: string;
    total_hours: number;
    source: string;
    academic_year: {
      id: string;
      name: string;
    };
  };
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group: {
      id: string;
      name: string;
    } | null;
  };
  sen_profile: {
    id: string;
    primary_category: string;
    support_level: string;
    is_active: boolean;
  };
}

interface UtilisationTotals {
  total_allocated_hours: number;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationBySource extends UtilisationTotals {
  source: string;
}

interface UtilisationByYearGroup {
  year_group_id: string | null;
  year_group_name: string;
  total_assigned_hours: number;
  total_used_hours: number;
  assigned_percentage: number;
  used_percentage: number;
}

interface UtilisationResult {
  academic_year_id: string | null;
  totals: UtilisationTotals;
  bySource: UtilisationBySource[];
  byYearGroup: UtilisationByYearGroup[];
}

type ResourceAllocationRecord = Prisma.SenResourceAllocationGetPayload<{
  include: {
    academic_year: {
      select: {
        id: true;
        name: true;
        status: true;
        start_date: true;
        end_date: true;
      };
    };
  };
}>;

type StudentHoursRecord = Prisma.SenStudentHoursGetPayload<{
  include: {
    resource_allocation: {
      select: {
        id: true;
        academic_year_id: true;
        total_hours: true;
        source: true;
        academic_year: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
    student: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
        year_group: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
    sen_profile: {
      select: {
        id: true;
        primary_category: true;
        support_level: true;
        is_active: true;
      };
    };
  };
}>;

// ─── Constants ────────────────────────────────────────────────────────────────

const ZERO_DECIMAL = new Prisma.Decimal(0);
const RESOURCE_SOURCE_ORDER = ['seno', 'school'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number(value.toFixed(2));
  return Number(value.toFixed(2));
}

function calculatePercentage(
  value: Prisma.Decimal | number,
  total: Prisma.Decimal | number,
): number {
  const numericValue = toNumber(value);
  const numericTotal = toNumber(total);

  if (numericTotal <= 0) {
    return 0;
  }

  return Number(((numericValue / numericTotal) * 100).toFixed(2));
}

function addDecimal(
  total: Prisma.Decimal,
  value: Prisma.Decimal | number | null | undefined,
): Prisma.Decimal {
  return total.plus(value ?? 0);
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SenResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: SenScopeService,
  ) {}

  // ─── Resource Allocations ─────────────────────────────────────────────────

  async createAllocation(
    tenantId: string,
    dto: CreateResourceAllocationDto,
  ): Promise<ResourceAllocationSummary> {
    await this.ensureAcademicYearExists(tenantId, dto.academic_year_id);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const allocation = (await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.senResourceAllocation.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            total_hours: dto.total_hours,
            source: dto.source,
            notes: dto.notes ?? null,
          },
          include: {
            academic_year: {
              select: {
                id: true,
                name: true,
                status: true,
                start_date: true,
                end_date: true,
              },
            },
          },
        });
      })) as ResourceAllocationRecord;

      return this.mapAllocation(allocation);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'RESOURCE_ALLOCATION_ALREADY_EXISTS',
          message: 'A resource allocation already exists for this academic year and source',
        });
      }

      throw error;
    }
  }

  async findAllAllocations(
    tenantId: string,
    query: ListResourceAllocationsQuery,
  ): Promise<PaginationResult<ResourceAllocationSummary>> {
    const { page, pageSize, academic_year_id, source } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SenResourceAllocationWhereInput = {
      tenant_id: tenantId,
    };

    if (academic_year_id) {
      where.academic_year_id = academic_year_id;
    }

    if (source) {
      where.source = source;
    }

    const [allocations, total] = await Promise.all([
      this.prisma.senResourceAllocation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ academic_year: { start_date: 'desc' } }, { source: 'asc' }],
        include: {
          academic_year: {
            select: {
              id: true,
              name: true,
              status: true,
              start_date: true,
              end_date: true,
            },
          },
        },
      }),
      this.prisma.senResourceAllocation.count({ where }),
    ]);

    return {
      data: allocations.map((allocation) => this.mapAllocation(allocation)),
      meta: { page, pageSize, total },
    };
  }

  async updateAllocation(
    tenantId: string,
    id: string,
    dto: UpdateResourceAllocationDto,
  ): Promise<ResourceAllocationSummary> {
    const existing = await this.prisma.senResourceAllocation.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        total_hours: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_ALLOCATION_NOT_FOUND',
        message: `Resource allocation with id "${id}" not found`,
      });
    }

    if (dto.total_hours !== undefined) {
      const assigned = await this.prisma.senStudentHours.aggregate({
        where: {
          tenant_id: tenantId,
          resource_allocation_id: id,
        },
        _sum: {
          allocated_hours: true,
        },
      });

      const assignedHours = assigned._sum.allocated_hours ?? ZERO_DECIMAL;
      if (new Prisma.Decimal(dto.total_hours).lessThan(assignedHours)) {
        throw new BadRequestException({
          code: 'HOURS_EXCEEDED',
          message: 'Total hours cannot be reduced below the hours already assigned to students',
          details: {
            assigned_hours: toNumber(assignedHours),
          },
        });
      }
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const allocation = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senResourceAllocation.update({
        where: { id },
        data: {
          total_hours: dto.total_hours,
          notes: dto.notes,
        },
        include: {
          academic_year: {
            select: {
              id: true,
              name: true,
              status: true,
              start_date: true,
              end_date: true,
            },
          },
        },
      });
    })) as ResourceAllocationRecord;

    return this.mapAllocation(allocation);
  }

  // ─── Student Hours ────────────────────────────────────────────────────────

  async assignStudentHours(
    tenantId: string,
    dto: CreateSenStudentHoursDto,
  ): Promise<StudentHoursSummary> {
    const [allocation, senProfile] = await Promise.all([
      this.prisma.senResourceAllocation.findFirst({
        where: {
          id: dto.resource_allocation_id,
          tenant_id: tenantId,
        },
        select: {
          id: true,
          total_hours: true,
        },
      }),
      this.prisma.senProfile.findFirst({
        where: {
          id: dto.sen_profile_id,
          tenant_id: tenantId,
        },
        select: {
          id: true,
          student_id: true,
          is_active: true,
          primary_category: true,
          support_level: true,
        },
      }),
    ]);

    if (!allocation) {
      throw new NotFoundException({
        code: 'RESOURCE_ALLOCATION_NOT_FOUND',
        message: `Resource allocation with id "${dto.resource_allocation_id}" not found`,
      });
    }

    this.assertValidSenProfile(senProfile, dto.student_id, dto.sen_profile_id);
    await this.ensureAllocationCapacity(
      tenantId,
      allocation.id,
      allocation.total_hours,
      dto.allocated_hours,
    );

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const assignment = (await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.senStudentHours.create({
          data: {
            tenant_id: tenantId,
            resource_allocation_id: dto.resource_allocation_id,
            student_id: dto.student_id,
            sen_profile_id: dto.sen_profile_id,
            allocated_hours: dto.allocated_hours,
            notes: dto.notes ?? null,
          },
          include: this.studentHoursInclude,
        });
      })) as StudentHoursRecord;

      return this.mapStudentHours(assignment);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'STUDENT_HOURS_ALREADY_EXISTS',
          message:
            'This student already has an hours assignment for the selected resource allocation',
        });
      }

      throw error;
    }
  }

  async findStudentHours(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListSenStudentHoursQuery,
  ): Promise<StudentHoursSummary[]> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return [];
    }

    const where: Prisma.SenStudentHoursWhereInput = {
      tenant_id: tenantId,
    };

    if (scope.scope === 'class' && scope.studentIds) {
      where.student_id = { in: scope.studentIds };
    }

    if (query.resource_allocation_id) {
      where.resource_allocation_id = query.resource_allocation_id;
    }

    if (query.student_id) {
      if (
        scope.scope === 'class' &&
        scope.studentIds &&
        !scope.studentIds.includes(query.student_id)
      ) {
        return [];
      }

      where.student_id = query.student_id;
    }

    if (query.sen_profile_id) {
      where.sen_profile_id = query.sen_profile_id;
    }

    const assignments = await this.prisma.senStudentHours.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: this.studentHoursInclude,
    });

    return assignments.map((assignment) => this.mapStudentHours(assignment));
  }

  async updateStudentHours(
    tenantId: string,
    id: string,
    dto: UpdateSenStudentHoursDto,
  ): Promise<StudentHoursSummary> {
    const existing = await this.prisma.senStudentHours.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        resource_allocation: {
          select: {
            id: true,
            total_hours: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'STUDENT_HOURS_NOT_FOUND',
        message: `Student hours assignment with id "${id}" not found`,
      });
    }

    const nextAllocatedHours = dto.allocated_hours ?? toNumber(existing.allocated_hours);
    const nextUsedHours = dto.used_hours ?? toNumber(existing.used_hours);

    if (nextUsedHours > nextAllocatedHours) {
      throw new BadRequestException({
        code: 'USED_HOURS_EXCEED_ALLOCATED',
        message: 'Used hours cannot exceed allocated hours',
      });
    }

    if (dto.allocated_hours !== undefined) {
      await this.ensureAllocationCapacity(
        tenantId,
        existing.resource_allocation.id,
        existing.resource_allocation.total_hours,
        dto.allocated_hours,
        id,
      );
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const assignment = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senStudentHours.update({
        where: { id },
        data: {
          allocated_hours: dto.allocated_hours,
          used_hours: dto.used_hours,
          notes: dto.notes,
        },
        include: this.studentHoursInclude,
      });
    })) as StudentHoursRecord;

    return this.mapStudentHours(assignment);
  }

  // ─── Utilisation ──────────────────────────────────────────────────────────

  async getUtilisation(
    tenantId: string,
    query: ResourceUtilisationQuery,
  ): Promise<UtilisationResult> {
    const allocations = await this.prisma.senResourceAllocation.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: query.academic_year_id,
      },
      include: {
        student_allocations: {
          include: {
            student: {
              select: {
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
      orderBy: [{ academic_year_id: 'asc' }, { source: 'asc' }],
    });

    const sourceMap = new Map<
      string,
      { totalAllocated: Prisma.Decimal; totalAssigned: Prisma.Decimal; totalUsed: Prisma.Decimal }
    >();
    const yearGroupMap = new Map<
      string,
      {
        year_group_id: string | null;
        year_group_name: string;
        totalAssigned: Prisma.Decimal;
        totalUsed: Prisma.Decimal;
      }
    >();

    let totalAllocated = ZERO_DECIMAL;
    let totalAssigned = ZERO_DECIMAL;
    let totalUsed = ZERO_DECIMAL;

    for (const source of RESOURCE_SOURCE_ORDER) {
      sourceMap.set(source, {
        totalAllocated: ZERO_DECIMAL,
        totalAssigned: ZERO_DECIMAL,
        totalUsed: ZERO_DECIMAL,
      });
    }

    for (const allocation of allocations) {
      totalAllocated = addDecimal(totalAllocated, allocation.total_hours);

      const sourceEntry = sourceMap.get(allocation.source) ?? {
        totalAllocated: ZERO_DECIMAL,
        totalAssigned: ZERO_DECIMAL,
        totalUsed: ZERO_DECIMAL,
      };

      sourceEntry.totalAllocated = addDecimal(sourceEntry.totalAllocated, allocation.total_hours);

      for (const assignment of allocation.student_allocations) {
        totalAssigned = addDecimal(totalAssigned, assignment.allocated_hours);
        totalUsed = addDecimal(totalUsed, assignment.used_hours);

        sourceEntry.totalAssigned = addDecimal(
          sourceEntry.totalAssigned,
          assignment.allocated_hours,
        );
        sourceEntry.totalUsed = addDecimal(sourceEntry.totalUsed, assignment.used_hours);

        const yearGroupId = assignment.student.year_group?.id ?? null;
        const yearGroupName = assignment.student.year_group?.name ?? 'Unassigned';
        const yearGroupKey = yearGroupId ?? 'unassigned';

        const yearGroupEntry = yearGroupMap.get(yearGroupKey) ?? {
          year_group_id: yearGroupId,
          year_group_name: yearGroupName,
          totalAssigned: ZERO_DECIMAL,
          totalUsed: ZERO_DECIMAL,
        };

        yearGroupEntry.totalAssigned = addDecimal(
          yearGroupEntry.totalAssigned,
          assignment.allocated_hours,
        );
        yearGroupEntry.totalUsed = addDecimal(yearGroupEntry.totalUsed, assignment.used_hours);
        yearGroupMap.set(yearGroupKey, yearGroupEntry);
      }

      sourceMap.set(allocation.source, sourceEntry);
    }

    return {
      academic_year_id: query.academic_year_id ?? null,
      totals: {
        total_allocated_hours: toNumber(totalAllocated),
        total_assigned_hours: toNumber(totalAssigned),
        total_used_hours: toNumber(totalUsed),
        assigned_percentage: calculatePercentage(totalAssigned, totalAllocated),
        used_percentage: calculatePercentage(totalUsed, totalAllocated),
      },
      bySource: [...sourceMap.entries()]
        .map(([source, entry]) => ({
          source,
          total_allocated_hours: toNumber(entry.totalAllocated),
          total_assigned_hours: toNumber(entry.totalAssigned),
          total_used_hours: toNumber(entry.totalUsed),
          assigned_percentage: calculatePercentage(entry.totalAssigned, entry.totalAllocated),
          used_percentage: calculatePercentage(entry.totalUsed, entry.totalAllocated),
        }))
        .sort(
          (left, right) =>
            RESOURCE_SOURCE_ORDER.indexOf(left.source) -
            RESOURCE_SOURCE_ORDER.indexOf(right.source),
        ),
      byYearGroup: [...yearGroupMap.values()]
        .map((entry) => ({
          year_group_id: entry.year_group_id,
          year_group_name: entry.year_group_name,
          total_assigned_hours: toNumber(entry.totalAssigned),
          total_used_hours: toNumber(entry.totalUsed),
          assigned_percentage: calculatePercentage(entry.totalAssigned, totalAllocated),
          used_percentage: calculatePercentage(entry.totalUsed, totalAllocated),
        }))
        .sort((left, right) => left.year_group_name.localeCompare(right.year_group_name)),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private readonly studentHoursInclude = {
    resource_allocation: {
      select: {
        id: true,
        academic_year_id: true,
        total_hours: true,
        source: true,
        academic_year: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
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
    sen_profile: {
      select: {
        id: true,
        primary_category: true,
        support_level: true,
        is_active: true,
      },
    },
  } satisfies Prisma.SenStudentHoursInclude;

  private mapAllocation(allocation: ResourceAllocationRecord): ResourceAllocationSummary {
    return {
      id: allocation.id,
      academic_year_id: allocation.academic_year_id,
      total_hours: toNumber(allocation.total_hours),
      source: allocation.source,
      notes: allocation.notes,
      created_at: allocation.created_at,
      updated_at: allocation.updated_at,
      academic_year: {
        id: allocation.academic_year.id,
        name: allocation.academic_year.name,
        status: allocation.academic_year.status,
        start_date: allocation.academic_year.start_date,
        end_date: allocation.academic_year.end_date,
      },
    };
  }

  private mapStudentHours(assignment: StudentHoursRecord): StudentHoursSummary {
    return {
      id: assignment.id,
      resource_allocation_id: assignment.resource_allocation_id,
      student_id: assignment.student_id,
      sen_profile_id: assignment.sen_profile_id,
      allocated_hours: toNumber(assignment.allocated_hours),
      used_hours: toNumber(assignment.used_hours),
      notes: assignment.notes,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      assigned_percentage: calculatePercentage(
        assignment.allocated_hours,
        assignment.resource_allocation.total_hours,
      ),
      used_percentage: calculatePercentage(
        assignment.used_hours,
        assignment.resource_allocation.total_hours,
      ),
      resource_allocation: {
        id: assignment.resource_allocation.id,
        academic_year_id: assignment.resource_allocation.academic_year_id,
        total_hours: toNumber(assignment.resource_allocation.total_hours),
        source: assignment.resource_allocation.source,
        academic_year: {
          id: assignment.resource_allocation.academic_year.id,
          name: assignment.resource_allocation.academic_year.name,
        },
      },
      student: {
        id: assignment.student.id,
        first_name: assignment.student.first_name,
        last_name: assignment.student.last_name,
        year_group: assignment.student.year_group,
      },
      sen_profile: {
        id: assignment.sen_profile.id,
        primary_category: assignment.sen_profile.primary_category,
        support_level: assignment.sen_profile.support_level,
        is_active: assignment.sen_profile.is_active,
      },
    };
  }

  private async ensureAcademicYearExists(tenantId: string, academicYearId: string): Promise<void> {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        tenant_id: tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${academicYearId}" not found`,
      });
    }
  }

  private assertValidSenProfile(
    senProfile: {
      id: string;
      student_id: string;
      is_active: boolean;
    } | null,
    studentId: string,
    senProfileId: string,
  ): asserts senProfile is { id: string; student_id: string; is_active: boolean } {
    if (!senProfile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${senProfileId}" not found`,
      });
    }

    if (!senProfile.is_active) {
      throw new BadRequestException({
        code: 'SEN_PROFILE_INACTIVE',
        message: 'Student hours can only be assigned to an active SEN profile',
      });
    }

    if (senProfile.student_id !== studentId) {
      throw new BadRequestException({
        code: 'SEN_PROFILE_STUDENT_MISMATCH',
        message: 'The selected SEN profile does not belong to the selected student',
      });
    }
  }

  private async ensureAllocationCapacity(
    tenantId: string,
    allocationId: string,
    totalHours: Prisma.Decimal,
    requestedHours: number,
    excludeAssignmentId?: string,
  ): Promise<void> {
    const assigned = await this.prisma.senStudentHours.aggregate({
      where: {
        tenant_id: tenantId,
        resource_allocation_id: allocationId,
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
      },
      _sum: {
        allocated_hours: true,
      },
    });

    const assignedHours = assigned._sum.allocated_hours ?? ZERO_DECIMAL;
    const nextAssignedHours = assignedHours.plus(requestedHours);

    if (nextAssignedHours.greaterThan(totalHours)) {
      throw new BadRequestException({
        code: 'HOURS_EXCEEDED',
        message: 'The requested hours exceed the remaining capacity for this resource allocation',
        details: {
          available_hours: toNumber(totalHours.minus(assignedHours)),
        },
      });
    }
  }
}
