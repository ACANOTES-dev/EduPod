import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { senDailyScheduleSchema, senWeeklyScheduleSchema } from '@school/shared';
import type {
  CreateSnaAssignmentDto,
  EndSnaAssignmentDto,
  ListSnaAssignmentsQuery,
  UpdateSnaAssignmentDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
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

interface SnaAssignmentSummary {
  id: string;
  sna_staff_profile_id: string;
  student_id: string;
  sen_profile_id: string;
  schedule: Record<string, unknown>;
  status: string;
  start_date: Date;
  end_date: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  staff_profile: {
    id: string;
    staff_number: string | null;
    job_title: string | null;
    user: {
      id: string;
      first_name: string;
      last_name: string;
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

type SnaAssignmentRecord = Prisma.SenSnaAssignmentGetPayload<{
  include: {
    staff_profile: {
      select: {
        id: true;
        staff_number: true;
        job_title: true;
        user: {
          select: {
            id: true;
            first_name: true;
            last_name: true;
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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SenSnaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly scopeService: SenScopeService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateSnaAssignmentDto): Promise<SnaAssignmentSummary> {
    const [staffProfile, senProfile, schedule] = await Promise.all([
      this.prisma.staffProfile.findFirst({
        where: {
          id: dto.sna_staff_profile_id,
          tenant_id: tenantId,
        },
        select: {
          id: true,
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
        },
      }),
      this.validateSchedule(tenantId, dto.schedule),
    ]);

    if (!staffProfile) {
      throw new NotFoundException({
        code: 'SNA_STAFF_PROFILE_NOT_FOUND',
        message: `SNA staff profile with id "${dto.sna_staff_profile_id}" not found`,
      });
    }

    this.assertValidSenProfile(senProfile, dto.student_id, dto.sen_profile_id);
    this.assertValidDateRange(dto.start_date, dto.end_date ?? null);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const assignment = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senSnaAssignment.create({
        data: {
          tenant_id: tenantId,
          sna_staff_profile_id: dto.sna_staff_profile_id,
          student_id: dto.student_id,
          sen_profile_id: dto.sen_profile_id,
          schedule,
          start_date: new Date(dto.start_date),
          end_date: dto.end_date ? new Date(dto.end_date) : null,
          notes: dto.notes ?? null,
        },
        include: this.snaAssignmentInclude,
      });
    })) as SnaAssignmentRecord;

    return this.mapAssignment(assignment);
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListSnaAssignmentsQuery,
  ): Promise<PaginationResult<SnaAssignmentSummary>> {
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

    const where: Prisma.SenSnaAssignmentWhereInput = {
      tenant_id: tenantId,
      status: query.status ?? 'active',
    };

    if (scope.scope === 'class' && scope.studentIds) {
      where.student_id = { in: scope.studentIds };
    }

    if (query.sna_staff_profile_id) {
      where.sna_staff_profile_id = query.sna_staff_profile_id;
    }

    if (query.student_id) {
      if (
        scope.scope === 'class' &&
        scope.studentIds &&
        !scope.studentIds.includes(query.student_id)
      ) {
        return {
          data: [],
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: 0,
          },
        };
      }

      where.student_id = query.student_id;
    }

    if (query.sen_profile_id) {
      where.sen_profile_id = query.sen_profile_id;
    }

    const skip = (query.page - 1) * query.pageSize;

    const [assignments, total] = await Promise.all([
      this.prisma.senSnaAssignment.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ status: 'asc' }, { start_date: 'desc' }, { created_at: 'desc' }],
        include: this.snaAssignmentInclude,
      }),
      this.prisma.senSnaAssignment.count({ where }),
    ]);

    return {
      data: assignments.map((assignment) => this.mapAssignment(assignment)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSnaAssignmentDto,
  ): Promise<SnaAssignmentSummary> {
    const existing = await this.prisma.senSnaAssignment.findFirst({
      where: {
        id,
        tenant_id: tenantId,
      },
      select: {
        id: true,
        start_date: true,
        end_date: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SNA_ASSIGNMENT_NOT_FOUND',
        message: `SNA assignment with id "${id}" not found`,
      });
    }

    const schedule = dto.schedule ? await this.validateSchedule(tenantId, dto.schedule) : undefined;
    const startDate = dto.start_date ?? existing.start_date.toISOString().slice(0, 10);
    const endDate =
      dto.end_date !== undefined
        ? dto.end_date
        : existing.end_date
          ? existing.end_date.toISOString().slice(0, 10)
          : null;

    this.assertValidDateRange(startDate, endDate);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const assignment = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senSnaAssignment.update({
        where: { id },
        data: {
          schedule,
          status: dto.status,
          start_date: dto.start_date ? new Date(dto.start_date) : undefined,
          end_date:
            dto.end_date === undefined ? undefined : dto.end_date ? new Date(dto.end_date) : null,
          notes: dto.notes,
        },
        include: this.snaAssignmentInclude,
      });
    })) as SnaAssignmentRecord;

    return this.mapAssignment(assignment);
  }

  async endAssignment(
    tenantId: string,
    id: string,
    dto: EndSnaAssignmentDto,
  ): Promise<SnaAssignmentSummary> {
    const existing = await this.prisma.senSnaAssignment.findFirst({
      where: {
        id,
        tenant_id: tenantId,
      },
      select: {
        id: true,
        start_date: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SNA_ASSIGNMENT_NOT_FOUND',
        message: `SNA assignment with id "${id}" not found`,
      });
    }

    this.assertValidDateRange(existing.start_date.toISOString().slice(0, 10), dto.end_date);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const assignment = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senSnaAssignment.update({
        where: { id },
        data: {
          status: 'ended',
          end_date: new Date(dto.end_date),
        },
        include: this.snaAssignmentInclude,
      });
    })) as SnaAssignmentRecord;

    return this.mapAssignment(assignment);
  }

  // ─── Student/SNA detail lookups ───────────────────────────────────────────

  async findBySna(
    tenantId: string,
    userId: string,
    permissions: string[],
    staffId: string,
  ): Promise<SnaAssignmentSummary[]> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return [];
    }

    const where: Prisma.SenSnaAssignmentWhereInput = {
      tenant_id: tenantId,
      sna_staff_profile_id: staffId,
    };

    if (scope.scope === 'class' && scope.studentIds) {
      where.student_id = { in: scope.studentIds };
    }

    const assignments = await this.prisma.senSnaAssignment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { start_date: 'desc' }, { created_at: 'desc' }],
      include: this.snaAssignmentInclude,
    });

    return assignments.map((assignment) => this.mapAssignment(assignment));
  }

  async findByStudent(
    tenantId: string,
    userId: string,
    permissions: string[],
    studentId: string,
  ): Promise<SnaAssignmentSummary[]> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return [];
    }

    if (scope.scope === 'class' && scope.studentIds && !scope.studentIds.includes(studentId)) {
      return [];
    }

    const assignments = await this.prisma.senSnaAssignment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      orderBy: [{ status: 'asc' }, { start_date: 'desc' }, { created_at: 'desc' }],
      include: this.snaAssignmentInclude,
    });

    return assignments.map((assignment) => this.mapAssignment(assignment));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private readonly snaAssignmentInclude = {
    staff_profile: {
      select: {
        id: true,
        staff_number: true,
        job_title: true,
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
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
  } satisfies Prisma.SenSnaAssignmentInclude;

  private mapAssignment(assignment: SnaAssignmentRecord): SnaAssignmentSummary {
    return {
      id: assignment.id,
      sna_staff_profile_id: assignment.sna_staff_profile_id,
      student_id: assignment.student_id,
      sen_profile_id: assignment.sen_profile_id,
      schedule: assignment.schedule as Record<string, unknown>,
      status: assignment.status,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
      notes: assignment.notes,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      staff_profile: assignment.staff_profile,
      student: assignment.student,
      sen_profile: assignment.sen_profile,
    };
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
        message: 'SNA assignments can only be created for an active SEN profile',
      });
    }

    if (senProfile.student_id !== studentId) {
      throw new BadRequestException({
        code: 'SEN_PROFILE_STUDENT_MISMATCH',
        message: 'The selected SEN profile does not belong to the selected student',
      });
    }
  }

  private assertValidDateRange(startDate: string, endDate: string | null): void {
    if (endDate && endDate < startDate) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'End date must be on or after the start date',
      });
    }
  }

  private async validateSchedule(
    tenantId: string,
    schedule: Record<string, unknown>,
  ): Promise<Prisma.InputJsonValue> {
    const senSettings = await this.settingsService.getModuleSettings(tenantId, 'sen');
    const scheduleSchema =
      senSettings.sna_schedule_format === 'daily'
        ? senDailyScheduleSchema
        : senWeeklyScheduleSchema;

    try {
      return scheduleSchema.parse(schedule) as Prisma.InputJsonValue;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: 'INVALID_SNA_SCHEDULE',
          message: `SNA schedule does not match the tenant's ${senSettings.sna_schedule_format} schedule format`,
          details: error.errors.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      throw error;
    }
  }
}
