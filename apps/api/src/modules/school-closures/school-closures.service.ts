import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateClosureDto, BulkCreateClosureDto } from './dto/closure.dto';

interface ListClosuresParams {
  page: number;
  pageSize: number;
  start_date?: string;
  end_date?: string;
  affects_scope?: 'all' | 'year_group' | 'class';
}

interface ClosureSideEffectReport {
  cancelled_sessions: number;
  flagged_sessions: Array<{
    id: string;
    class_id: string;
    session_date: Date;
    status: string;
  }>;
}

@Injectable()
export class SchoolClosuresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateClosureDto) {
    // Validate scope references
    await this.validateScope(tenantId, dto.affects_scope, dto.scope_entity_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const closure = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.schoolClosure.create({
          data: {
            tenant_id: tenantId,
            closure_date: new Date(dto.closure_date),
            reason: dto.reason,
            affects_scope: dto.affects_scope,
            scope_entity_id: dto.affects_scope === 'all' ? null : (dto.scope_entity_id ?? null),
            created_by_user_id: userId,
          },
          include: {
            created_by: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        });
      });

      // Apply side-effects on attendance sessions
      const sideEffects = await this.applyClosureSideEffects(
        tenantId,
        new Date(dto.closure_date),
        dto.affects_scope,
        dto.scope_entity_id,
      );

      return { closure, ...sideEffects };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CLOSURE_ALREADY_EXISTS',
          message: `A closure already exists for this date and scope`,
        });
      }
      throw err;
    }
  }

  async bulkCreate(tenantId: string, userId: string, dto: BulkCreateClosureDto) {
    // Validate scope references
    await this.validateScope(tenantId, dto.affects_scope, dto.scope_entity_id);

    const dates = this.generateDateRange(
      dto.start_date,
      dto.end_date,
      dto.skip_weekends,
    );

    const closures: unknown[] = [];
    let createdCount = 0;
    let skippedCount = 0;
    let totalCancelledSessions = 0;
    const allFlaggedSessions: ClosureSideEffectReport['flagged_sessions'] = [];

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    for (const date of dates) {
      try {
        const closure = await prismaWithRls.$transaction(async (tx) => {
          const db = tx as unknown as PrismaService;
          return db.schoolClosure.create({
            data: {
              tenant_id: tenantId,
              closure_date: date,
              reason: dto.reason,
              affects_scope: dto.affects_scope,
              scope_entity_id: dto.affects_scope === 'all' ? null : (dto.scope_entity_id ?? null),
              created_by_user_id: userId,
            },
            include: {
              created_by: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          });
        });

        closures.push(closure);
        createdCount++;

        // Apply side-effects for each created closure
        const sideEffects = await this.applyClosureSideEffects(
          tenantId,
          date,
          dto.affects_scope,
          dto.scope_entity_id,
        );
        totalCancelledSessions += sideEffects.cancelled_sessions;
        allFlaggedSessions.push(...sideEffects.flagged_sessions);
      } catch (err) {
        // Skip if closure already exists for this date+scope
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          skippedCount++;
          continue;
        }
        throw err;
      }
    }

    return {
      closures,
      created_count: createdCount,
      skipped_count: skippedCount,
      cancelled_sessions: totalCancelledSessions,
      flagged_sessions: allFlaggedSessions,
    };
  }

  async findAll(tenantId: string, params: ListClosuresParams) {
    const { page, pageSize, start_date, end_date, affects_scope } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SchoolClosureWhereInput = { tenant_id: tenantId };

    if (start_date || end_date) {
      where.closure_date = {};
      if (start_date) {
        where.closure_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.closure_date.lte = new Date(end_date);
      }
    }

    if (affects_scope) {
      where.affects_scope = affects_scope;
    }

    const [closures, total] = await Promise.all([
      this.prisma.schoolClosure.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { closure_date: 'asc' },
        include: {
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.schoolClosure.count({ where }),
    ]);

    // Resolve scope entity names for non-'all' scopes
    const yearGroupIds = closures
      .filter((c) => c.affects_scope === 'year_group' && c.scope_entity_id)
      .map((c) => c.scope_entity_id as string);

    const classIds = closures
      .filter((c) => c.affects_scope === 'class' && c.scope_entity_id)
      .map((c) => c.scope_entity_id as string);

    const [yearGroups, classes] = await Promise.all([
      yearGroupIds.length > 0
        ? this.prisma.yearGroup.findMany({
            where: { id: { in: yearGroupIds }, tenant_id: tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      classIds.length > 0
        ? this.prisma.class.findMany({
            where: { id: { in: classIds }, tenant_id: tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg.name]));
    const classMap = new Map(classes.map((c) => [c.id, c.name]));

    const data = closures.map((c) => {
      let scope_entity_name: string | null = null;
      if (c.affects_scope === 'year_group' && c.scope_entity_id) {
        scope_entity_name = yearGroupMap.get(c.scope_entity_id) ?? null;
      } else if (c.affects_scope === 'class' && c.scope_entity_id) {
        scope_entity_name = classMap.get(c.scope_entity_id) ?? null;
      }
      return { ...c, scope_entity_name };
    });

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async remove(tenantId: string, id: string) {
    const closure = await this.prisma.schoolClosure.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!closure) {
      throw new NotFoundException({
        code: 'CLOSURE_NOT_FOUND',
        message: `School closure with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.schoolClosure.delete({ where: { id } });
    });
  }

  /**
   * Check if a date is a closure for a given class.
   * Checks all three scopes: all, year_group, class.
   */
  async isClosureDate(
    tenantId: string,
    date: Date,
    classId: string,
    yearGroupId?: string,
  ): Promise<boolean> {
    // Build OR conditions for the three scopes
    const orConditions: Prisma.SchoolClosureWhereInput[] = [
      // Scope: all
      { affects_scope: 'all' },
      // Scope: class
      { affects_scope: 'class', scope_entity_id: classId },
    ];

    // If the class has a year group, also check year_group scope
    if (yearGroupId) {
      orConditions.push({
        affects_scope: 'year_group',
        scope_entity_id: yearGroupId,
      });
    } else {
      // Look up the class's year_group_id if not provided
      const classEntity = await this.prisma.class.findFirst({
        where: { id: classId, tenant_id: tenantId },
        select: { year_group_id: true },
      });
      if (classEntity?.year_group_id) {
        orConditions.push({
          affects_scope: 'year_group',
          scope_entity_id: classEntity.year_group_id,
        });
      }
    }

    const closure = await this.prisma.schoolClosure.findFirst({
      where: {
        tenant_id: tenantId,
        closure_date: date,
        OR: orConditions,
      },
      select: { id: true },
    });

    return closure !== null;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async validateScope(
    tenantId: string,
    affectsScope: string,
    scopeEntityId?: string,
  ) {
    if (affectsScope === 'all') {
      // scope_entity_id must be null for 'all' scope
      return;
    }

    if (!scopeEntityId) {
      throw new BadRequestException({
        code: 'SCOPE_ENTITY_REQUIRED',
        message: `scope_entity_id is required when affects_scope is "${affectsScope}"`,
      });
    }

    if (affectsScope === 'year_group') {
      const yearGroup = await this.prisma.yearGroup.findFirst({
        where: { id: scopeEntityId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!yearGroup) {
        throw new NotFoundException({
          code: 'YEAR_GROUP_NOT_FOUND',
          message: `Year group with id "${scopeEntityId}" not found`,
        });
      }
    }

    if (affectsScope === 'class') {
      const classEntity = await this.prisma.class.findFirst({
        where: { id: scopeEntityId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!classEntity) {
        throw new NotFoundException({
          code: 'CLASS_NOT_FOUND',
          message: `Class with id "${scopeEntityId}" not found`,
        });
      }
    }
  }

  private generateDateRange(
    startDate: string,
    endDate: string,
    skipWeekends: boolean,
  ): Date[] {
    const dates: Date[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      if (skipWeekends) {
        const dayOfWeek = current.getDay();
        // Skip Saturday (6) and Sunday (0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dates.push(new Date(current));
        }
      } else {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Find and update attendance sessions affected by a closure.
   * - open sessions -> cancelled
   * - submitted/locked sessions -> flagged (returned for review)
   */
  private async applyClosureSideEffects(
    tenantId: string,
    closureDate: Date,
    affectsScope: string,
    scopeEntityId?: string,
  ): Promise<ClosureSideEffectReport> {
    // Build the where clause to find affected sessions
    const sessionWhere: Prisma.AttendanceSessionWhereInput = {
      tenant_id: tenantId,
      session_date: closureDate,
    };

    if (affectsScope === 'year_group' && scopeEntityId) {
      // Find classes belonging to this year group
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, year_group_id: scopeEntityId },
        select: { id: true },
      });
      sessionWhere.class_id = { in: classes.map((c) => c.id) };
    } else if (affectsScope === 'class' && scopeEntityId) {
      sessionWhere.class_id = scopeEntityId;
    }
    // For scope 'all', no additional class filter needed — all sessions for the date

    // Find open sessions to cancel
    const openSessions = await this.prisma.attendanceSession.findMany({
      where: { ...sessionWhere, status: 'open' },
      select: { id: true },
    });

    // Cancel open sessions
    let cancelledCount = 0;
    if (openSessions.length > 0) {
      const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
      await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        const result = await db.attendanceSession.updateMany({
          where: {
            id: { in: openSessions.map((s) => s.id) },
            tenant_id: tenantId,
          },
          data: { status: 'cancelled' },
        });
        cancelledCount = result.count;
      });
    }

    // Find submitted/locked sessions to flag
    const flaggedSessions = await this.prisma.attendanceSession.findMany({
      where: {
        ...sessionWhere,
        status: { in: ['submitted', 'locked'] },
      },
      select: {
        id: true,
        class_id: true,
        session_date: true,
        status: true,
      },
    });

    return {
      cancelled_sessions: cancelledCount,
      flagged_sessions: flaggedSessions,
    };
  }
}
