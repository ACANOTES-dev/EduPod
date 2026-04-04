import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  addSchoolDays,
  type BulkMarkServedDto,
  type ClosureChecker,
  isValidSanctionTransition,
  type SanctionCalendarQuery,
  type SanctionStatusKey,
} from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Sanction lifecycle: status transitions, scheduling, calendar ─────────────

@Injectable()
export class BehaviourSanctionsLifecycleService {
  private readonly logger = new Logger(BehaviourSanctionsLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Status Transition ─────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    id: string,
    newStatus: SanctionStatusKey,
    reason: string | undefined,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const sanction = await db.behaviourSanction.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!sanction) {
        throw new NotFoundException({
          code: 'SANCTION_NOT_FOUND',
          message: 'Sanction not found',
        });
      }

      const currentStatus = sanction.status as SanctionStatusKey;
      if (!isValidSanctionTransition(currentStatus, newStatus)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
        });
      }

      const updateData: Prisma.BehaviourSanctionUpdateInput = {
        status: newStatus as $Enums.SanctionStatus,
      };

      // Handle special transition side-effects
      if (newStatus === 'served') {
        updateData.served_at = new Date();
        updateData.served_by = { connect: { id: userId } };
      }

      if (newStatus === 'appealed') {
        // Verify appeal exists for this sanction
        const appeal = await db.behaviourAppeal.findFirst({
          where: {
            tenant_id: tenantId,
            sanction_id: id,
            status: { not: 'withdrawn' as $Enums.AppealStatus },
          },
        });
        if (!appeal) {
          throw new BadRequestException({
            code: 'NO_APPEAL_EXISTS',
            message: 'Cannot transition to appealed without an active appeal',
          });
        }
      }

      const updated = await db.behaviourSanction.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'sanction',
        id,
        userId,
        'status_changed',
        { status: currentStatus },
        { status: newStatus },
        reason,
      );

      return updated;
    });
  }

  // ─── Today's Sanctions ─────────────────────────────────────────────────

  async getTodaySanctions(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        scheduled_date: { gte: today, lt: tomorrow },
        retention_status: 'active',
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        supervised_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        scheduled_room: { select: { id: true, name: true } },
      },
      orderBy: { scheduled_start_time: 'asc' },
    });

    // Group by type
    const grouped: Record<string, typeof sanctions> = {};
    for (const s of sanctions) {
      const key = s.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }

    return { data: grouped, total: sanctions.length };
  }

  // ─── My Supervision ────────────────────────────────────────────────────

  async getMySupervision(tenantId: string, userId: string) {
    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        supervised_by_id: userId,
        status: { in: ['scheduled', 'pending_approval'] },
        retention_status: 'active',
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        incident: {
          select: { id: true, incident_number: true },
        },
        scheduled_room: { select: { id: true, name: true } },
      },
      orderBy: { scheduled_date: 'asc' },
    });

    return { data: sanctions };
  }

  // ─── Calendar View ─────────────────────────────────────────────────────

  async getCalendarView(tenantId: string, query: SanctionCalendarQuery) {
    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        scheduled_date: {
          gte: new Date(query.date_from),
          lte: new Date(query.date_to),
        },
        retention_status: 'active',
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        supervised_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        scheduled_room: { select: { id: true, name: true } },
      },
      orderBy: [{ scheduled_date: 'asc' }, { scheduled_start_time: 'asc' }],
    });

    return { data: sanctions };
  }

  // ─── Active Suspensions ────────────────────────────────────────────────

  async getActiveSuspensions(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        type: {
          in: ['suspension_internal', 'suspension_external', 'expulsion'],
        },
        status: 'scheduled',
        suspension_start_date: { lte: today },
        suspension_end_date: { gte: today },
        retention_status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { id: true, name: true } },
          },
        },
        incident: {
          select: { id: true, incident_number: true },
        },
      },
      orderBy: { suspension_end_date: 'asc' },
    });

    return { data: sanctions };
  }

  // ─── Returning Soon ────────────────────────────────────────────────────

  async getReturningSoon(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Approximate 5 school days as 7 calendar days for the DB query
    // (the exact school-day computation happens after fetching)
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 10);

    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        type: {
          in: ['suspension_internal', 'suspension_external', 'expulsion'],
        },
        status: 'scheduled',
        suspension_end_date: { gte: today, lte: windowEnd },
        retention_status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { id: true, name: true } },
          },
        },
        incident: {
          select: { id: true, incident_number: true },
        },
      },
      orderBy: { suspension_end_date: 'asc' },
    });

    // Filter precisely by 5 school days using calendar-aware check
    const closureChecker = this.buildClosureChecker(this.prisma, tenantId);
    const fiveSchoolDaysOut = await addSchoolDays(today, 5, closureChecker);

    const filtered = sanctions.filter((s) => {
      if (!s.suspension_end_date) return false;
      return s.suspension_end_date <= fiveSchoolDaysOut;
    });

    return { data: filtered };
  }

  // ─── Bulk Mark Served ──────────────────────────────────────────────────

  async bulkMarkServed(tenantId: string, dto: BulkMarkServedDto, userId: string) {
    const succeeded: Array<{ id: string; sanction_number: string }> = [];
    const failed: Array<{ id: string; reason: string }> = [];

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const sanctionId of dto.sanction_ids) {
        const sanction = await db.behaviourSanction.findFirst({
          where: { id: sanctionId, tenant_id: tenantId },
        });

        if (!sanction) {
          failed.push({ id: sanctionId, reason: 'Sanction not found' });
          continue;
        }

        const currentStatus = sanction.status as SanctionStatusKey;
        if (!isValidSanctionTransition(currentStatus, 'served')) {
          failed.push({
            id: sanctionId,
            reason: `Cannot transition from "${currentStatus}" to "served"`,
          });
          continue;
        }

        await db.behaviourSanction.update({
          where: { id: sanctionId },
          data: {
            status: 'served',
            served_at: dto.served_at ? new Date(dto.served_at) : new Date(),
            served_by_id: userId,
          },
        });

        await this.historyService.recordHistory(
          db,
          tenantId,
          'sanction',
          sanctionId,
          userId,
          'status_changed',
          { status: currentStatus },
          { status: 'served' },
          'Bulk mark served',
        );

        succeeded.push({
          id: sanctionId,
          sanction_number: sanction.sanction_number,
        });
      }
    });

    return { succeeded, failed };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private buildClosureChecker(db: PrismaService, tenantId: string): ClosureChecker {
    return async (date: Date): Promise<boolean> => {
      const dateStr = date.toISOString().split('T')[0] ?? '';
      const closure = await db.schoolClosure.findFirst({
        where: {
          tenant_id: tenantId,
          closure_date: new Date(dateStr),
        },
      });
      return closure !== null;
    };
  }
}
