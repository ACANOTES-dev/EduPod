import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { ApplyRunDto, SchedulingResultEntry, SchedulingAdjustment } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PeriodGridService } from '../period-grid/period-grid.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulingApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodGridService: PeriodGridService,
  ) {}

  async apply(tenantId: string, runId: string, userId: string, dto: ApplyRunDto) {
    // ── Step 1: Load the run (with FOR UPDATE via RLS transaction) ────────────

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Lock the row
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE within RLS transaction
      const runs = await db.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM scheduling_runs WHERE id = ${runId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE
      `;

      if (!runs || runs.length === 0) {
        throw new NotFoundException({
          code: 'SCHEDULING_RUN_NOT_FOUND',
          message: `Scheduling run "${runId}" not found`,
        });
      }

      // Safe: checked runs.length > 0 above
      const run = runs[0]!;

      // ── Step 2: Verify status is 'completed' ─────────────────────────────

      if (run['status'] !== 'completed') {
        throw new BadRequestException({
          code: 'RUN_NOT_APPLICABLE',
          message: `Only completed runs can be applied. Current status: "${String(run['status'])}"`,
        });
      }

      // ── Step 3: Optimistic concurrency check ─────────────────────────────

      const updatedAt =
        run['updated_at'] instanceof Date
          ? run['updated_at'].toISOString()
          : String(run['updated_at']);

      const expectedAt = new Date(dto.expected_updated_at).toISOString();
      if (expectedAt !== updatedAt) {
        throw new ConflictException({
          code: 'STALE_RUN',
          message: 'The run has been modified since you last loaded it. Reload and try again.',
          details: { expected_updated_at: expectedAt, actual_updated_at: updatedAt },
        });
      }

      const academicYearId = String(run['academic_year_id']);

      // ── Step 4: Check period grid hash ────────────────────────────────────

      const currentGridHash = await this.periodGridService.getGridHash(tenantId, academicYearId);
      const configSnapshot = run['config_snapshot'] as Record<string, unknown> | null;
      const snapshotGridHash = configSnapshot?.['grid_hash'] as string | null;

      if (snapshotGridHash && snapshotGridHash !== currentGridHash) {
        throw new ConflictException({
          code: 'PERIOD_GRID_CHANGED',
          message:
            'The period grid has changed since this run was created. The results may no longer be valid. Please start a new run.',
          details: { snapshot_hash: snapshotGridHash, current_hash: currentGridHash },
        });
      }

      // ── Step 5: Merge result_json entries + proposed_adjustments ─────────

      const resultJson = run['result_json'] as {
        entries: SchedulingResultEntry[];
        unassigned: unknown[];
      } | null;
      if (!resultJson || !Array.isArray(resultJson.entries)) {
        throw new BadRequestException({
          code: 'NO_RESULT_JSON',
          message: 'The run has no result data to apply.',
        });
      }

      const proposedAdjustments = Array.isArray(run['proposed_adjustments'])
        ? (run['proposed_adjustments'] as SchedulingAdjustment[])
        : [];

      // Build a mutable copy of entries as a Map keyed by (class_id, weekday, period_order)
      const entryKey = (classId: string, weekday: number, periodOrder: number) =>
        `${classId}|${weekday}|${periodOrder}`;

      const entriesMap = new Map<string, SchedulingResultEntry>();
      for (const entry of resultJson.entries) {
        entriesMap.set(entryKey(entry.class_id, entry.weekday, entry.period_order), entry);
      }

      // Apply each adjustment in order
      for (const adj of proposedAdjustments) {
        if (adj.type === 'move') {
          const fromKey = entryKey(adj.class_id, adj.from_weekday, adj.from_period_order);
          const existing = entriesMap.get(fromKey);
          if (existing) {
            entriesMap.delete(fromKey);
            const newEntry: SchedulingResultEntry = {
              ...existing,
              weekday: adj.to_weekday,
              period_order: adj.to_period_order,
              room_id: adj.to_room_id ?? existing.room_id,
            };
            entriesMap.set(entryKey(adj.class_id, adj.to_weekday, adj.to_period_order), newEntry);
          }
        } else if (adj.type === 'swap') {
          const keyA = entryKey(
            adj.entry_a.class_id,
            adj.entry_a.weekday,
            adj.entry_a.period_order,
          );
          const keyB = entryKey(
            adj.entry_b.class_id,
            adj.entry_b.weekday,
            adj.entry_b.period_order,
          );
          const entA = entriesMap.get(keyA);
          const entB = entriesMap.get(keyB);
          if (entA && entB) {
            entriesMap.delete(keyA);
            entriesMap.delete(keyB);
            const newA: SchedulingResultEntry = {
              ...entA,
              weekday: entB.weekday,
              period_order: entB.period_order,
            };
            const newB: SchedulingResultEntry = {
              ...entB,
              weekday: entA.weekday,
              period_order: entA.period_order,
            };
            entriesMap.set(entryKey(newA.class_id, newA.weekday, newA.period_order), newA);
            entriesMap.set(entryKey(newB.class_id, newB.weekday, newB.period_order), newB);
          }
        } else if (adj.type === 'remove') {
          const key = entryKey(adj.class_id, adj.weekday, adj.period_order);
          entriesMap.delete(key);
        } else if (adj.type === 'add') {
          const newEntry: SchedulingResultEntry = {
            class_id: adj.class_id,
            room_id: adj.room_id,
            teacher_staff_id: adj.teacher_staff_id,
            weekday: adj.weekday,
            period_order: adj.period_order,
            start_time: '', // Will be filled from period template lookup below
            end_time: '',
            is_pinned: false,
            preference_satisfaction: [],
          };
          entriesMap.set(entryKey(adj.class_id, adj.weekday, adj.period_order), newEntry);
        }
      }

      const finalEntries = Array.from(entriesMap.values());

      // ── Step 6: Filter out inactive classes ──────────────────────────────

      const allClassIds = [...new Set(finalEntries.map((e) => e.class_id))];
      const activeClasses = await db.class.findMany({
        where: { id: { in: allClassIds }, tenant_id: tenantId, status: 'active' },
        select: { id: true },
      });
      const activeClassIdSet = new Set(activeClasses.map((c) => c.id));

      const activeEntries = finalEntries.filter((e) => activeClassIdSet.has(e.class_id));

      // ── Step 7: Load period templates to fill in start/end times ─────────
      // (for entries added via 'add' adjustment, start/end times may be blank)

      const periodTemplates = await db.schedulePeriodTemplate.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
        select: { weekday: true, period_order: true, start_time: true, end_time: true },
      });

      const periodMap = new Map<string, { start_time: Date; end_time: Date }>();
      for (const pt of periodTemplates) {
        periodMap.set(`${pt.weekday}|${pt.period_order}`, {
          start_time: pt.start_time,
          end_time: pt.end_time,
        });
      }

      // ── Step 8: Handle existing auto_generated schedules ─────────────────

      const existingAutoSchedules = await db.schedule.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          source: 'auto_generated',
        },
        select: {
          id: true,
          class_id: true,
          _count: { select: { attendance_sessions: true } },
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const existing of existingAutoSchedules) {
        const hasAttendance = existing._count.attendance_sessions > 0;
        if (hasAttendance) {
          // End-date rather than delete
          await db.schedule.update({
            where: { id: existing.id },
            data: { effective_end_date: today },
          });
        } else {
          await db.schedule.delete({ where: { id: existing.id } });
        }
      }

      // ── Step 9: Insert new entries from merged result ─────────────────────

      const effectiveStart = today;

      for (const entry of activeEntries) {
        // Resolve times from period template if not present
        const periodKey = `${entry.weekday}|${entry.period_order}`;
        const periodTimes = periodMap.get(periodKey);

        let startTime: Date;
        let endTime: Date;

        if (entry.start_time && entry.end_time) {
          startTime = new Date(`1970-01-01T${entry.start_time}:00.000Z`);
          endTime = new Date(`1970-01-01T${entry.end_time}:00.000Z`);
        } else if (periodTimes) {
          startTime = periodTimes.start_time;
          endTime = periodTimes.end_time;
        } else {
          // Skip entries with no resolvable time
          continue;
        }

        await db.schedule.create({
          data: {
            tenant_id: tenantId,
            class_id: entry.class_id,
            academic_year_id: academicYearId,
            room_id: entry.room_id ?? null,
            teacher_staff_id: entry.teacher_staff_id ?? null,
            schedule_period_template_id: null,
            period_order: entry.period_order,
            weekday: entry.weekday,
            start_time: startTime,
            end_time: endTime,
            effective_start_date: effectiveStart,
            effective_end_date: null,
            is_pinned: entry.is_pinned,
            source: 'auto_generated',
            scheduling_run_id: runId,
          },
        });
      }

      // ── Step 10: Mark run as applied ──────────────────────────────────────

      const applied = await db.schedulingRun.update({
        where: { id: runId },
        data: {
          status: 'applied',
          applied_by_user_id: userId,
          applied_at: new Date(),
        },
      });

      return applied;
    });

    return this.formatRun(result as Record<string, unknown>);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private formatRun(run: Record<string, unknown>): Record<string, unknown> {
    return {
      ...run,
      solver_seed:
        run['solver_seed'] !== null && run['solver_seed'] !== undefined
          ? Number(run['solver_seed'])
          : null,
      soft_preference_score:
        run['soft_preference_score'] !== null ? Number(run['soft_preference_score']) : null,
      soft_preference_max:
        run['soft_preference_max'] !== null ? Number(run['soft_preference_max']) : null,
      created_at:
        run['created_at'] instanceof Date
          ? (run['created_at'] as Date).toISOString()
          : run['created_at'],
      updated_at:
        run['updated_at'] instanceof Date
          ? (run['updated_at'] as Date).toISOString()
          : run['updated_at'],
      applied_at:
        run['applied_at'] instanceof Date
          ? (run['applied_at'] as Date).toISOString()
          : run['applied_at'],
    };
  }
}
