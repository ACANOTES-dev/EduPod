import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';

import { AdmissionsCapacityService } from './admissions-capacity.service';

// ─── Job constants ───────────────────────────────────────────────────────────

export const ADMISSIONS_AUTO_PROMOTED_JOB = 'notifications:admissions-auto-promoted';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromotionResult {
  promoted_count: number;
  promoted_application_ids: string[];
  remaining_seats: number;
}

interface LockedApplicationRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  submitted_by_parent_id: string | null;
  status: string;
}

interface RawTx {
  $queryRaw: <T>(sql: Prisma.Sql) => Promise<T>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Auto-promotion engine for the waiting list. Three entry points, all of
 * which run inside the caller's interactive RLS transaction so freed seats
 * are visible to the capacity re-check in the same snapshot:
 *
 *   - `onClassAdded`            — fires after a new class is persisted
 *   - `onYearGroupActivated`    — fires when a (year, year_group) pair gets
 *                                  its first active class
 *   - `promoteYearGroup`        — generic FIFO pass (used by the two hooks
 *                                  above plus state-machine release paths)
 *
 * `promoteYearGroup` uses `SELECT ... FOR UPDATE SKIP LOCKED` so two
 * concurrent promotion passes (e.g. a seat-release running in parallel with
 * the expiry cron) never promote the same application twice.
 */
@Injectable()
export class AdmissionsAutoPromotionService {
  private readonly logger = new Logger(AdmissionsAutoPromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
    private readonly searchIndexService: SearchIndexService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Hook: new class added ────────────────────────────────────────────────

  async onClassAdded(
    db: PrismaService,
    params: { tenantId: string; classId: string },
  ): Promise<PromotionResult> {
    const { tenantId, classId } = params;

    const newClass = await db.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { academic_year_id: true, year_group_id: true },
    });

    if (!newClass) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class "${classId}" not found`,
      });
    }

    if (!newClass.year_group_id) {
      return { promoted_count: 0, promoted_application_ids: [], remaining_seats: 0 };
    }

    return this.promoteYearGroup(db, {
      tenantId,
      academicYearId: newClass.academic_year_id,
      yearGroupId: newClass.year_group_id,
    });
  }

  // ─── Hook: year group activated ───────────────────────────────────────────

  async onYearGroupActivated(
    db: PrismaService,
    params: { tenantId: string; academicYearId: string; yearGroupId: string },
  ): Promise<PromotionResult> {
    const { tenantId, academicYearId, yearGroupId } = params;

    const rawTx = db as unknown as RawTx;

    // eslint-disable-next-line school/no-raw-sql-outside-rls -- FOR UPDATE lock inside caller's RLS transaction; prevents a parallel promotion pass from racing the substatus drop
    await rawTx.$queryRaw(Prisma.sql`
      SELECT id FROM applications
      WHERE tenant_id = ${tenantId}::uuid
        AND status = 'waiting_list'
        AND waiting_list_substatus = 'awaiting_year_setup'
        AND target_academic_year_id = ${academicYearId}::uuid
        AND target_year_group_id = ${yearGroupId}::uuid
      ORDER BY apply_date ASC
      FOR UPDATE
    `);

    await db.application.updateMany({
      where: {
        tenant_id: tenantId,
        status: 'waiting_list',
        waiting_list_substatus: 'awaiting_year_setup',
        target_academic_year_id: academicYearId,
        target_year_group_id: yearGroupId,
      },
      data: { waiting_list_substatus: null },
    });

    return this.promoteYearGroup(db, { tenantId, academicYearId, yearGroupId });
  }

  // ─── Core: promote FIFO within a pair ─────────────────────────────────────

  async promoteYearGroup(
    db: PrismaService,
    params: { tenantId: string; academicYearId: string; yearGroupId: string },
  ): Promise<PromotionResult> {
    const { tenantId, academicYearId, yearGroupId } = params;

    const capacity = await this.capacityService.getAvailableSeats(db, {
      tenantId,
      academicYearId,
      yearGroupId,
    });

    if (capacity.available_seats === 0) {
      return { promoted_count: 0, promoted_application_ids: [], remaining_seats: 0 };
    }

    const limit = capacity.available_seats;
    const rawTx = db as unknown as RawTx;

    // eslint-disable-next-line school/no-raw-sql-outside-rls -- FIFO SELECT ... FOR UPDATE SKIP LOCKED concurrency guard inside caller's RLS transaction
    const candidates = await rawTx.$queryRaw<LockedApplicationRow[]>(Prisma.sql`
      SELECT id, application_number, student_first_name, student_last_name,
             submitted_by_parent_id, status::text AS status
      FROM applications
      WHERE tenant_id = ${tenantId}::uuid
        AND status = 'waiting_list'
        AND waiting_list_substatus IS NULL
        AND target_academic_year_id = ${academicYearId}::uuid
        AND target_year_group_id = ${yearGroupId}::uuid
      ORDER BY apply_date ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);

    if (candidates.length === 0) {
      return {
        promoted_count: 0,
        promoted_application_ids: [],
        remaining_seats: capacity.available_seats,
      };
    }

    const promotedIds: string[] = [];

    for (const application of candidates) {
      await db.application.update({
        where: { id: application.id },
        data: { status: 'ready_to_admit' },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: application.id,
          author_user_id: SYSTEM_USER_SENTINEL,
          note: `Auto-promoted from waiting list: a seat opened in the target year group.`,
          is_internal: true,
        },
      });

      promotedIds.push(application.id);

      try {
        await this.searchIndexService.indexEntity('applications', {
          id: application.id,
          tenant_id: tenantId,
          application_number: application.application_number,
          student_first_name: application.student_first_name,
          student_last_name: application.student_last_name,
          status: 'ready_to_admit',
        });
      } catch (err) {
        this.logger.warn(
          `[promoteYearGroup] search indexing failed for application ${application.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      try {
        await this.notificationsQueue.add(
          ADMISSIONS_AUTO_PROMOTED_JOB,
          {
            tenant_id: tenantId,
            application_id: application.id,
            application_number: application.application_number,
            submitted_by_parent_id: application.submitted_by_parent_id,
          },
          { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
        );
      } catch (err) {
        this.logger.error(
          `[promoteYearGroup] failed to enqueue auto-promoted notification for application ${application.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      promoted_count: promotedIds.length,
      promoted_application_ids: promotedIds,
      remaining_seats: Math.max(0, capacity.available_seats - promotedIds.length),
    };
  }
}
