import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsCapacityService } from './admissions-capacity.service';

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface DashboardSummary {
  counts: {
    ready_to_admit: number;
    waiting_list: number;
    waiting_list_awaiting_year_setup: number;
    conditional_approval: number;
    conditional_approval_near_expiry: number;
    rejected_total: number;
    approved_this_month: number;
    rejected_this_month: number;
    overrides_total: number;
  };
  capacity_pressure: Array<{
    year_group_id: string;
    year_group_name: string;
    waiting_list_count: number;
    total_capacity: number;
    enrolled_count: number;
    conditional_count: number;
  }>;
}

type WaitingListAggregate = {
  target_academic_year_id: string | null;
  target_year_group_id: string | null;
  _count: { _all: number };
};

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Powers the Admissions dashboard hub. Executes a batch of `count` queries
 * against the applications table plus a batched capacity lookup for the
 * highest-pressure year groups, all inside one RLS-scoped transaction so the
 * dashboard snapshot is internally consistent.
 */
@Injectable()
export class AdmissionsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
  ) {}

  async getSummary(tenantId: string): Promise<DashboardSummary> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const baseTenant: Prisma.ApplicationWhereInput = { tenant_id: tenantId };

      const [
        readyToAdmit,
        waitingList,
        waitingListAwaitingYearSetup,
        conditionalApproval,
        conditionalNearExpiry,
        rejectedTotal,
        approvedThisMonth,
        rejectedThisMonth,
        overridesTotal,
        waitingListByYearGroup,
      ] = await Promise.all([
        db.application.count({ where: { ...baseTenant, status: 'ready_to_admit' } }),
        db.application.count({ where: { ...baseTenant, status: 'waiting_list' } }),
        db.application.count({
          where: {
            ...baseTenant,
            status: 'waiting_list',
            waiting_list_substatus: 'awaiting_year_setup',
          },
        }),
        db.application.count({ where: { ...baseTenant, status: 'conditional_approval' } }),
        db.application.count({
          where: {
            ...baseTenant,
            status: 'conditional_approval',
            payment_deadline: { not: null, lte: twoDaysFromNow },
          },
        }),
        db.application.count({ where: { ...baseTenant, status: 'rejected' } }),
        db.application.count({
          where: {
            ...baseTenant,
            status: 'approved',
            reviewed_at: { gte: startOfMonth },
          },
        }),
        db.application.count({
          where: {
            ...baseTenant,
            status: 'rejected',
            reviewed_at: { gte: startOfMonth },
          },
        }),
        db.admissionOverride.count({ where: { tenant_id: tenantId } }),
        db.application.groupBy({
          by: ['target_academic_year_id', 'target_year_group_id'],
          where: {
            ...baseTenant,
            status: 'waiting_list',
            target_academic_year_id: { not: null },
            target_year_group_id: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
      ]);

      const typedAggregates: WaitingListAggregate[] = waitingListByYearGroup.map((row) => ({
        target_academic_year_id: row.target_academic_year_id,
        target_year_group_id: row.target_year_group_id,
        _count: { _all: row._count._all },
      }));

      const capacityPressure = await this.buildCapacityPressure(db, tenantId, typedAggregates);

      return {
        counts: {
          ready_to_admit: readyToAdmit,
          waiting_list: waitingList,
          waiting_list_awaiting_year_setup: waitingListAwaitingYearSetup,
          conditional_approval: conditionalApproval,
          conditional_approval_near_expiry: conditionalNearExpiry,
          rejected_total: rejectedTotal,
          approved_this_month: approvedThisMonth,
          rejected_this_month: rejectedThisMonth,
          overrides_total: overridesTotal,
        },
        capacity_pressure: capacityPressure,
      };
    });
  }

  private async buildCapacityPressure(
    db: PrismaService,
    tenantId: string,
    aggregates: WaitingListAggregate[],
  ): Promise<DashboardSummary['capacity_pressure']> {
    const pairs = aggregates
      .filter(
        (
          row,
        ): row is WaitingListAggregate & {
          target_academic_year_id: string;
          target_year_group_id: string;
        } => row.target_academic_year_id !== null && row.target_year_group_id !== null,
      )
      .map((row) => ({
        academicYearId: row.target_academic_year_id,
        yearGroupId: row.target_year_group_id,
      }));

    if (pairs.length === 0) {
      return [];
    }

    const [capacityMap, yearGroups] = await Promise.all([
      this.capacityService.getAvailableSeatsBatch(db, { tenantId, pairs }),
      db.yearGroup.findMany({
        where: {
          tenant_id: tenantId,
          id: { in: pairs.map((p) => p.yearGroupId) },
        },
        select: { id: true, name: true },
      }),
    ]);

    const nameById = new Map(yearGroups.map((yg) => [yg.id, yg.name]));

    return aggregates
      .filter(
        (
          row,
        ): row is WaitingListAggregate & {
          target_academic_year_id: string;
          target_year_group_id: string;
        } => row.target_academic_year_id !== null && row.target_year_group_id !== null,
      )
      .map((row) => {
        const key = `${row.target_academic_year_id}:${row.target_year_group_id}`;
        const capacity = capacityMap.get(key);
        return {
          year_group_id: row.target_year_group_id,
          year_group_name: nameById.get(row.target_year_group_id) ?? 'Unknown',
          waiting_list_count: row._count._all,
          total_capacity: capacity?.total_capacity ?? 0,
          enrolled_count: capacity?.enrolled_student_count ?? 0,
          conditional_count: capacity?.conditional_approval_count ?? 0,
        };
      });
  }
}
