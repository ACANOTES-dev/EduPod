import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../base/tenant-aware-job';
import { solve } from '../../../../packages/shared/src/scheduler';
import type {
  SolverInput,
  PeriodSlot,
  ClassRequirement,
  TeacherInfo,
  RoomInfo,
  PinnedEntry,
  StudentOverlap,
} from '../../../../packages/shared/src/scheduler';

export interface SchedulingSolverPayload extends TenantJobPayload {
  tenant_id: string;
  run_id: string;
}

export const SCHEDULING_SOLVE_JOB = 'scheduling:solve';

@Processor(QUEUE_NAMES.SCHEDULING)
export class SchedulingSolverProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulingSolverProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SchedulingSolverPayload>): Promise<void> {
    if (job.name !== SCHEDULING_SOLVE_JOB) return;

    this.logger.log(`Processing ${SCHEDULING_SOLVE_JOB} — run ${job.data.run_id}`);

    const solverJob = new SchedulingSolverJob(this.prisma);
    try {
      await solverJob.execute(job.data);
    } catch (err) {
      // Update status outside any transaction so the update is not rolled back
      const message = err instanceof Error ? err.message : 'Unknown solver error';
      this.logger.error(`Solver failed for run ${job.data.run_id}: ${message}`);
      try {
        await this.prisma.schedulingRun.update({
          where: { id: job.data.run_id },
          data: { status: 'failed', failure_reason: message },
        });
      } catch (updateErr) {
        this.logger.error(`Failed to mark run ${job.data.run_id} as failed: ${updateErr}`);
      }
      throw err; // Re-throw for BullMQ retry
    }
  }
}

class SchedulingSolverJob extends TenantAwareJob<SchedulingSolverPayload> {
  private readonly logger = new Logger(SchedulingSolverJob.name);

  protected async processJob(
    data: SchedulingSolverPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, run_id } = data;

    // 1. Load the run
    const run = await tx.schedulingRun.findFirst({
      where: { id: run_id, tenant_id },
    });

    if (!run || run.status !== 'queued') {
      this.logger.warn(`Run ${run_id} not found or not in queued status, skipping`);
      return;
    }

    // 2. Update status to running
    await tx.schedulingRun.update({
      where: { id: run_id },
      data: { status: 'running' },
    });

    // 3. Load all data for config snapshot
    const academicYearId = run.academic_year_id;

    // Period grid
    const periodTemplates = await tx.schedulePeriodTemplate.findMany({
      where: { tenant_id, academic_year_id: academicYearId },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    });

    const periodGrid: PeriodSlot[] = periodTemplates.map(p => ({
      weekday: p.weekday,
      period_order: p.period_order,
      start_time: p.start_time.toISOString().slice(11, 16),
      end_time: p.end_time.toISOString().slice(11, 16),
      period_type: p.schedule_period_type as PeriodSlot['period_type'],
    }));

    // Class requirements with class details
    const requirements = await tx.classSchedulingRequirement.findMany({
      where: { tenant_id, academic_year_id: academicYearId, class_entity: { status: 'active' } },
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            status: true,
            subject: { select: { id: true, subject_type: true } },
            class_staff: {
              where: { assignment_role: { in: ['teacher', 'homeroom'] } },
              select: { staff_profile_id: true, assignment_role: true },
            },
          },
        },
      },
    });

    const classes: ClassRequirement[] = requirements.map(r => ({
      class_id: r.class_id,
      periods_per_week: r.periods_per_week,
      required_room_type: r.required_room_type,
      preferred_room_id: r.preferred_room_id,
      max_consecutive: r.max_consecutive_periods,
      min_consecutive: r.min_consecutive_periods,
      spread_preference: r.spread_preference as ClassRequirement['spread_preference'],
      student_count: r.student_count,
      teachers: r.class_entity.class_staff.map(cs => ({
        staff_profile_id: cs.staff_profile_id,
        assignment_role: cs.assignment_role,
      })),
      is_supervision: r.class_entity.subject?.subject_type !== 'academic',
    }));

    // Teacher availability
    const allTeacherIds = [...new Set(classes.flatMap(c => c.teachers.map(t => t.staff_profile_id)))];

    const availabilities = await tx.staffAvailability.findMany({
      where: { tenant_id, academic_year_id: academicYearId, staff_profile_id: { in: allTeacherIds } },
    });

    const preferences = await tx.staffSchedulingPreference.findMany({
      where: { tenant_id, academic_year_id: academicYearId, staff_profile_id: { in: allTeacherIds } },
    });

    const teacherMap = new Map<string, TeacherInfo>();
    for (const tid of allTeacherIds) {
      teacherMap.set(tid, {
        staff_profile_id: tid,
        availability: availabilities
          .filter(a => a.staff_profile_id === tid)
          .map(a => ({
            weekday: a.weekday,
            from: a.available_from.toISOString().slice(11, 16),
            to: a.available_to.toISOString().slice(11, 16),
          })),
        preferences: preferences
          .filter(p => p.staff_profile_id === tid)
          .map(p => ({
            id: p.id,
            preference_type: p.preference_type as TeacherInfo['preferences'][0]['preference_type'],
            preference_payload: p.preference_payload,
            priority: p.priority as TeacherInfo['preferences'][0]['priority'],
          })),
      });
    }

    // Rooms
    const rooms = await tx.room.findMany({
      where: { tenant_id, active: true },
    });

    const roomInfos: RoomInfo[] = rooms.map(r => ({
      room_id: r.id,
      room_type: r.room_type,
      capacity: r.capacity,
      is_exclusive: r.is_exclusive,
    }));

    // Pinned entries (only in hybrid mode)
    const pinnedEntries = run.mode === 'hybrid'
      ? await tx.schedule.findMany({
          where: {
            tenant_id,
            academic_year_id: academicYearId,
            is_pinned: true,
            OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
          },
        })
      : [];

    const pinned: PinnedEntry[] = pinnedEntries.map(e => ({
      schedule_id: e.id,
      class_id: e.class_id,
      room_id: e.room_id,
      teacher_staff_id: e.teacher_staff_id,
      weekday: e.weekday,
      period_order: e.period_order ?? 0,
    }));

    // Student overlaps — find pairs of classes sharing students
    const classIds = classes.map(c => c.class_id);
    const enrolments = await tx.classEnrolment.findMany({
      where: { tenant_id, class_id: { in: classIds }, status: 'active' },
      select: { class_id: true, student_id: true },
    });

    const studentToClasses = new Map<string, Set<string>>();
    for (const e of enrolments) {
      if (!studentToClasses.has(e.student_id)) studentToClasses.set(e.student_id, new Set());
      studentToClasses.get(e.student_id)!.add(e.class_id);
    }

    const overlapSet = new Set<string>();
    const studentOverlaps: StudentOverlap[] = [];
    for (const classSet of studentToClasses.values()) {
      const arr = [...classSet];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = [arr[i], arr[j]].sort().join(':');
          if (!overlapSet.has(key)) {
            overlapSet.add(key);
            studentOverlaps.push({ class_id_a: arr[i], class_id_b: arr[j] });
          }
        }
      }
    }

    // Read tenant settings for solver config
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const settings = (tenantSettings?.settings as Record<string, unknown>)?.scheduling as Record<string, unknown> ?? {};
    const maxDuration = (settings.maxSolverDurationSeconds as number) ?? 120;
    const prefWeights = (settings.preferenceWeights as Record<string, number>) ?? { low: 1, medium: 2, high: 3 };
    const globalWeights = (settings.globalSoftWeights as Record<string, number>) ?? {
      evenSubjectSpread: 2,
      minimiseTeacherGaps: 1,
      roomConsistency: 1,
      workloadBalance: 1,
    };
    const solverSeed = run.solver_seed ? Number(run.solver_seed) : null;

    // Build config snapshot
    const configSnapshot = {
      period_grid: periodGrid,
      classes: classes.map(c => ({ ...c })),
      teachers: [...teacherMap.values()],
      rooms: roomInfos,
      pinned_entries: pinned,
      student_overlaps: studentOverlaps,
      settings: {
        max_solver_duration_seconds: maxDuration,
        preference_weights: prefWeights,
        solver_seed: solverSeed,
      },
    };

    // Save config snapshot
    await tx.schedulingRun.update({
      where: { id: run_id },
      data: { config_snapshot: configSnapshot as unknown as Record<string, unknown> },
    });

    // 4. Build solver input
    const solverInput: SolverInput = {
      period_grid: periodGrid,
      classes,
      teachers: [...teacherMap.values()],
      rooms: roomInfos,
      pinned_entries: pinned,
      student_overlaps: studentOverlaps,
      settings: {
        max_solver_duration_seconds: maxDuration,
        preference_weights: {
          low: prefWeights.low ?? 1,
          medium: prefWeights.medium ?? 2,
          high: prefWeights.high ?? 3,
        },
        global_soft_weights: {
          even_subject_spread: globalWeights.evenSubjectSpread ?? 2,
          minimise_teacher_gaps: globalWeights.minimiseTeacherGaps ?? 1,
          room_consistency: globalWeights.roomConsistency ?? 1,
          workload_balance: globalWeights.workloadBalance ?? 1,
        },
        solver_seed: solverSeed,
      },
    };

    // 5. Run solver
    const result = solve(solverInput, {
      onProgress: (assigned, total) => {
        this.logger.debug(`Solver progress: ${assigned}/${total}`);
      },
    });

    // 6. Save results
    const resultJson = {
      entries: result.entries,
      unassigned: result.unassigned,
    };

    await tx.schedulingRun.update({
      where: { id: run_id },
      data: {
        status: 'completed',
        result_json: resultJson as unknown as Record<string, unknown>,
        hard_constraint_violations: 0,
        soft_preference_score: result.score,
        soft_preference_max: result.max_score,
        entries_generated: result.entries.filter(e => !e.is_pinned).length,
        entries_pinned: result.entries.filter(e => e.is_pinned).length,
        entries_unassigned: result.unassigned.length,
        solver_duration_ms: result.duration_ms,
        solver_seed: BigInt(solverInput.settings.solver_seed ?? 0),
      },
    });

    this.logger.log(
      `Solver completed for run ${run_id}: ${result.entries.length} entries, ${result.unassigned.length} unassigned, score ${result.score}/${result.max_score} in ${result.duration_ms}ms`,
    );
  }
}
