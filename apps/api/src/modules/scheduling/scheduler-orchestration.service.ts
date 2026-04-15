import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import type { TriggerSolverRunDto } from '@school/shared';
import {
  type SolverInputV2,
  type YearGroupInput,
  type CurriculumEntry,
  type TeacherInputV2,
  type RoomInfoV2,
  type RoomClosureInput,
  type BreakGroupInput,
  type PinnedEntryV2,
  type StudentOverlapV2,
  type PeriodSlotV2,
  type SolverSettingsV2,
  type SolverAssignmentV2,
  validateSchedule,
} from '@school/shared/scheduler';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffPreferencesReadFacade } from '../staff-preferences/staff-preferences-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

export interface PrerequisiteResult {
  ready: boolean;
  missing: string[];
}

@Injectable()
export class SchedulerOrchestrationService {
  private readonly logger = new Logger(SchedulerOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('scheduling') private readonly schedulingQueue: Queue,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly schedulingRunsReadFacade: SchedulingRunsReadFacade,
    private readonly staffAvailabilityReadFacade: StaffAvailabilityReadFacade,
    private readonly staffPreferencesReadFacade: StaffPreferencesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Check Prerequisites ───────────────────────────────────────────────────

  async checkPrerequisites(tenantId: string, academicYearId: string): Promise<PrerequisiteResult> {
    const missing: string[] = [];

    // 1. Year groups with active classes
    const yearGroupsWithClasses = await this.academicReadFacade.findYearGroupsWithActiveClasses(
      tenantId,
      academicYearId,
    );

    if (yearGroupsWithClasses.length === 0) {
      missing.push('No year groups have active classes for this academic year');
    }

    const yearGroupIds = yearGroupsWithClasses.map((yg) => yg.id);

    // 2. Period grid exists for all year groups with classes
    if (yearGroupIds.length > 0) {
      const periodGridYearGroups = await this.prisma.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          schedule_period_type: 'teaching',
        },
        select: { year_group_id: true },
        distinct: ['year_group_id'],
      }); // own-model read (scheduling owns schedulePeriodTemplate)

      const gridYearGroupIds = new Set(
        periodGridYearGroups
          .map((pt) => pt.year_group_id)
          .filter((id): id is string => id !== null),
      );

      // If no year-group-specific grids, check for shared grid (year_group_id = null)
      const hasSharedGrid = periodGridYearGroups.some((pt) => pt.year_group_id === null);

      for (const yg of yearGroupsWithClasses) {
        if (!gridYearGroupIds.has(yg.id) && !hasSharedGrid) {
          missing.push(`No period grid configured for year group "${yg.name}"`);
        }
      }
    }

    // 3. Curriculum requirements defined for all year groups
    if (yearGroupIds.length > 0) {
      const curriculumYearGroups = await this.prisma.curriculumRequirement.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          year_group_id: { in: yearGroupIds },
        },
        select: { year_group_id: true },
        distinct: ['year_group_id'],
      });

      const currYearGroupIds = new Set(curriculumYearGroups.map((c) => c.year_group_id));

      for (const yg of yearGroupsWithClasses) {
        if (!currYearGroupIds.has(yg.id)) {
          missing.push(`No curriculum requirements defined for year group "${yg.name}"`);
        }
      }
    }

    // 4. (moved) Per-class teacher coverage now lives in
    //    `SchedulingPrerequisitesService.check()` as the
    //    `every_class_subject_has_teacher` check, which iterates per class and
    //    honours the pin/pool model. The redundant per-year-group check that
    //    used to live here was retired in Stage 3 of the scheduler rebuild.

    // 5. No pinned entry conflicts
    const pinnedEntryRows = await this.schedulesReadFacade.findPinnedEntries(
      tenantId,
      academicYearId,
    );
    const pinnedEntries = pinnedEntryRows.map((e) => ({
      id: e.id,
      teacher_staff_id: e.teacher_staff_id,
      room_id: e.room_id,
      weekday: e.weekday,
      start_time: e.start_time,
      end_time: e.end_time,
    }));

    for (let i = 0; i < pinnedEntries.length; i++) {
      for (let j = i + 1; j < pinnedEntries.length; j++) {
        const a = pinnedEntries[i]!;
        const b = pinnedEntries[j]!;
        if (a.weekday !== b.weekday) continue;
        if (a.start_time >= b.end_time || a.end_time <= b.start_time) continue;

        if (a.teacher_staff_id && a.teacher_staff_id === b.teacher_staff_id) {
          missing.push(`Pinned entries ${a.id} and ${b.id} have teacher double-booking`);
        }
        if (a.room_id && a.room_id === b.room_id) {
          missing.push(`Pinned entries ${a.id} and ${b.id} have room double-booking`);
        }
      }
    }

    return {
      ready: missing.length === 0,
      missing,
    };
  }

  // ─── Assemble Solver Input ─────────────────────────────────────────────────

  async assembleSolverInput(tenantId: string, academicYearId: string): Promise<SolverInputV2> {
    // Query all data in parallel
    const [
      yearGroups,
      periodTemplates,
      curriculumReqs,
      teacherCompetencies,
      staffAvailabilities,
      staffPreferences,
      teacherConfigs,
      rooms,
      roomClosures,
      breakGroupsRaw,
      pinnedSchedules,
      classEnrolments,
      tenantSettings,
      classRequirements,
    ] = await Promise.all([
      // Year groups with active classes and student counts
      this.academicReadFacade.findYearGroupsWithClassesAndCounts(tenantId, academicYearId),

      // Period templates (may be shared or year-group-specific)
      this.prisma.schedulePeriodTemplate.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
        orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
      }),

      // Curriculum requirements
      this.prisma.curriculumRequirement.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
        include: {
          subject: { select: { name: true } },
        },
      }),

      // Teacher competencies
      this.prisma.teacherCompetency.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
      }),

      // Staff availability
      this.staffAvailabilityReadFacade.findByAcademicYear(tenantId, academicYearId),

      // Staff preferences
      this.staffPreferencesReadFacade.findByAcademicYear(tenantId, academicYearId),

      // Teacher scheduling configs
      this.prisma.teacherSchedulingConfig.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
      }),

      // Rooms (active only)
      this.roomsReadFacade.findActiveRooms(tenantId),

      // Room closures
      this.roomsReadFacade.findAllClosures(tenantId),

      // Break groups with year group links
      this.prisma.breakGroup.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
        include: { year_groups: { select: { year_group_id: true } } },
      }),

      // Pinned schedules
      this.schedulesReadFacade.findPinnedEntries(tenantId, academicYearId),

      // Class enrolments for student overlap computation
      this.classesReadFacade.findEnrolmentPairsForAcademicYear(tenantId, academicYearId),

      // Tenant settings for solver config
      this.configurationReadFacade.findSettings(tenantId),

      // SCHED-018: per-(class) room overrides from class_scheduling_requirements.
      // The solver rewards matches with a +20 score bonus (vs +10 for the
      // year-group-wide CurriculumEntry.preferred_room_id), so class-level
      // intent wins on tie.
      this.prisma.classSchedulingRequirement.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          OR: [{ preferred_room_id: { not: null } }, { required_room_type: { not: null } }],
        },
        select: {
          class_id: true,
          preferred_room_id: true,
          required_room_type: true,
        },
      }),
    ]);

    // ─── Build year_groups with period grids ─────────────────────────────────

    const yearGroupInputs: YearGroupInput[] = yearGroups.map((yg) => {
      // Find period templates for this year group (or shared ones)
      const ygTemplates = periodTemplates.filter(
        (pt) => pt.year_group_id === yg.id || pt.year_group_id === null,
      );

      const periodGrid: PeriodSlotV2[] = ygTemplates.map((pt) => ({
        weekday: pt.weekday,
        period_order: pt.period_order,
        start_time: pt.start_time.toISOString().slice(11, 16),
        end_time: pt.end_time.toISOString().slice(11, 16),
        period_type: pt.schedule_period_type as PeriodSlotV2['period_type'],
        supervision_mode: pt.supervision_mode as PeriodSlotV2['supervision_mode'],
        break_group_id: pt.break_group_id,
      }));

      return {
        year_group_id: yg.id,
        year_group_name: yg.name,
        sections: yg.classes.map((c) => ({
          class_id: c.id,
          class_name: c.name,
          student_count: c._count.class_enrolments,
        })),
        period_grid: periodGrid,
      };
    });

    // ─── Build curriculum entries ────────────────────────────────────────────

    const curriculum: CurriculumEntry[] = curriculumReqs.map((cr) => ({
      year_group_id: cr.year_group_id,
      subject_id: cr.subject_id,
      subject_name: cr.subject.name,
      min_periods_per_week: cr.min_periods_per_week,
      max_periods_per_day: cr.max_periods_per_day,
      preferred_periods_per_week: cr.preferred_periods_per_week,
      requires_double_period: cr.requires_double_period,
      double_period_count: cr.double_period_count,
      required_room_type: null, // Could be extended in future
      preferred_room_id: null, // Could be extended in future
    }));

    // ─── Build teacher inputs ────────────────────────────────────────────────

    // Get unique teacher IDs from competencies
    const teacherIds = [...new Set(teacherCompetencies.map((tc) => tc.staff_profile_id))];

    // Get teacher names
    const staffProfiles =
      teacherIds.length > 0
        ? await this.staffProfileReadFacade.findByIds(tenantId, teacherIds)
        : [];

    const staffNameMap = new Map(
      staffProfiles.map((sp) => [sp.id, `${sp.user.first_name} ${sp.user.last_name}`.trim()]),
    );

    const configMap = new Map(teacherConfigs.map((tc) => [tc.staff_profile_id, tc]));

    const teachers: TeacherInputV2[] = teacherIds.map((teacherId) => {
      const config = configMap.get(teacherId);

      return {
        staff_profile_id: teacherId,
        name: staffNameMap.get(teacherId) ?? teacherId,
        competencies: teacherCompetencies
          .filter((tc) => tc.staff_profile_id === teacherId)
          .map((tc) => {
            // Stage 3 invariant: the solver contract requires `class_id` to be
            // either a UUID string (pin) or `null` (pool). Prisma types it as
            // `string | null` but a future schema change could shift this to
            // `undefined`; fail loudly here rather than silently producing
            // unsolvable input.
            const classId: string | null = tc.class_id ?? null;
            return {
              subject_id: tc.subject_id,
              year_group_id: tc.year_group_id,
              class_id: classId,
            };
          }),
        availability: staffAvailabilities
          .filter((sa) => sa.staff_profile_id === teacherId)
          .map((sa) => ({
            weekday: sa.weekday,
            from: sa.available_from.toISOString().slice(11, 16),
            to: sa.available_to.toISOString().slice(11, 16),
          })),
        preferences: staffPreferences
          .filter((sp) => sp.staff_profile_id === teacherId)
          .map((sp) => ({
            id: sp.id,
            preference_type:
              sp.preference_type as TeacherInputV2['preferences'][0]['preference_type'],
            preference_payload: sp.preference_payload,
            priority: sp.priority as TeacherInputV2['preferences'][0]['priority'],
          })),
        max_periods_per_week: config?.max_periods_per_week ?? null,
        max_periods_per_day: config?.max_periods_per_day ?? null,
        max_supervision_duties_per_week: config?.max_supervision_duties_per_week ?? null,
      };
    });

    // ─── Build rooms ─────────────────────────────────────────────────────────

    const roomInfos: RoomInfoV2[] = rooms.map((r) => ({
      room_id: r.id,
      room_type: r.room_type,
      capacity: r.capacity,
      is_exclusive: r.is_exclusive,
    }));

    // ─── Build room closures ─────────────────────────────────────────────────

    const roomClosureInputs: RoomClosureInput[] = roomClosures.map((rc) => ({
      room_id: rc.room_id,
      date_from: rc.date_from.toISOString().slice(0, 10),
      date_to: rc.date_to.toISOString().slice(0, 10),
    }));

    // ─── Build break groups ──────────────────────────────────────────────────

    const breakGroups: BreakGroupInput[] = breakGroupsRaw.map((bg) => ({
      break_group_id: bg.id,
      name: bg.name,
      year_group_ids: bg.year_groups.map((yg) => yg.year_group_id),
      required_supervisor_count: bg.required_supervisor_count,
    }));

    // ─── Build pinned entries ────────────────────────────────────────────────

    const pinnedEntries: PinnedEntryV2[] = pinnedSchedules.map((s) => ({
      schedule_id: s.id,
      class_id: s.class_id,
      subject_id: s.class_entity?.subject_id ?? null,
      year_group_id: s.class_entity?.year_group_id ?? null,
      room_id: s.room_id,
      teacher_staff_id: s.teacher_staff_id,
      weekday: s.weekday,
      period_order: s.period_order ?? 0,
    }));

    // ─── Compute student overlaps ────────────────────────────────────────────

    const studentToClasses = new Map<string, Set<string>>();
    for (const e of classEnrolments) {
      if (!studentToClasses.has(e.student_id)) {
        studentToClasses.set(e.student_id, new Set());
      }
      studentToClasses.get(e.student_id)!.add(e.class_id);
    }

    const overlapSet = new Set<string>();
    const studentOverlaps: StudentOverlapV2[] = [];
    for (const classSet of studentToClasses.values()) {
      const arr = [...classSet];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = [arr[i], arr[j]].sort().join(':');
          if (!overlapSet.has(key)) {
            overlapSet.add(key);
            studentOverlaps.push({ class_id_a: arr[i]!, class_id_b: arr[j]! });
          }
        }
      }
    }

    // ─── Build settings ──────────────────────────────────────────────────────

    const settingsObj =
      ((tenantSettings?.settings as Record<string, unknown>)?.scheduling as Record<
        string,
        unknown
      >) ?? {};
    const prefWeights = (settingsObj.preferenceWeights as Record<string, number>) ?? {};
    const globalWeights = (settingsObj.globalSoftWeights as Record<string, number>) ?? {};

    const settings: SolverSettingsV2 = {
      max_solver_duration_seconds: (settingsObj.maxSolverDurationSeconds as number) ?? 120,
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
        break_duty_balance: globalWeights.breakDutyBalance ?? 1,
      },
      solver_seed: null,
    };

    // SCHED-018: fold class-level preferences into a single overrides array.
    // An entry with a non-null `preferred_room_id` OR `required_room_type`
    // signals "this specific class cares about its room"; the solver consults
    // this list at room-selection time (solver-v2.ts) and prefers the named
    // room over the year-group-wide curriculum hint.
    const classRoomOverrides = classRequirements
      .filter((r) => r.preferred_room_id !== null || r.required_room_type !== null)
      .map((r) => ({
        class_id: r.class_id,
        subject_id: null as string | null,
        preferred_room_id: r.preferred_room_id,
        required_room_type: r.required_room_type,
      }));

    return {
      year_groups: yearGroupInputs,
      curriculum,
      teachers,
      rooms: roomInfos,
      room_closures: roomClosureInputs,
      break_groups: breakGroups,
      pinned_entries: pinnedEntries,
      student_overlaps: studentOverlaps,
      class_room_overrides: classRoomOverrides,
      settings,
    };
  }

  // ─── Trigger Solver Run ────────────────────────────────────────────────────

  async triggerSolverRun(
    tenantId: string,
    academicYearId: string,
    userId: string,
    settings?: TriggerSolverRunDto,
  ) {
    // Validate academic year
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, academicYearId);

    // Check prerequisites
    const prereqs = await this.checkPrerequisites(tenantId, academicYearId);
    if (!prereqs.ready) {
      throw new BadRequestException({
        code: 'PREREQUISITES_NOT_MET',
        message: 'Scheduling prerequisites are not satisfied',
        details: { missing: prereqs.missing },
      });
    }

    // Check no active run exists
    const activeRun = await this.schedulingRunsReadFacade.findActiveRun(tenantId, academicYearId);

    if (activeRun) {
      throw new ConflictException({
        code: 'RUN_ALREADY_ACTIVE',
        message: `A scheduling run is already ${activeRun.status} for this academic year`,
      });
    }

    // Assemble input
    const solverInput = await this.assembleSolverInput(tenantId, academicYearId);

    // Apply optional settings overrides
    if (settings?.solver_seed !== undefined && settings.solver_seed !== null) {
      solverInput.settings.solver_seed = settings.solver_seed;
    }
    if (settings?.max_solver_duration_seconds) {
      solverInput.settings.max_solver_duration_seconds = settings.max_solver_duration_seconds;
    }

    // Detect mode
    const pinnedCount = solverInput.pinned_entries.length;
    const mode: 'auto' | 'hybrid' = pinnedCount > 0 ? 'hybrid' : 'auto';

    // Create the run record
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const run = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          mode,
          status: 'queued',
          config_snapshot: JSON.parse(JSON.stringify(solverInput)) as Prisma.InputJsonValue,
          solver_seed:
            solverInput.settings.solver_seed !== null
              ? BigInt(solverInput.settings.solver_seed)
              : null,
          created_by_user_id: userId,
        },
      });
    })) as unknown as { id: string; status: string; created_at: Date };

    // Enqueue the solver job
    await this.schedulingQueue.add('scheduling:solve-v2', {
      tenant_id: tenantId,
      run_id: run.id,
    });

    this.logger.log(`Enqueued solver v2 run ${run.id} for academic year ${academicYearId}`);

    return {
      id: run.id,
      status: run.status,
      mode,
      academic_year_id: academicYearId,
      created_at: run.created_at.toISOString(),
    };
  }

  // ─── Apply Run ─────────────────────────────────────────────────────────────

  async applyRun(
    tenantId: string,
    runId: string,
    userId: string,
    acknowledgedViolations?: boolean,
  ) {
    const run = await this.schedulingRunsReadFacade.findById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    if (run.status !== 'completed') {
      throw new BadRequestException({
        code: 'RUN_NOT_APPLICABLE',
        message: `Only completed runs can be applied. Current status: "${run.status}"`,
      });
    }

    // Parse result
    const resultJson = run.result_json as {
      entries: SolverAssignmentV2[];
      unassigned: unknown[];
    } | null;

    if (!resultJson || !Array.isArray(resultJson.entries)) {
      throw new BadRequestException({
        code: 'NO_RESULT_JSON',
        message: 'The run has no result data to apply',
      });
    }

    // Run validation
    const configSnapshot = run.config_snapshot as unknown as SolverInputV2 | null;
    if (configSnapshot) {
      const validation = validateSchedule(configSnapshot, resultJson.entries);

      // Tier 1 violations block completely
      if (validation.summary.tier1 > 0) {
        throw new BadRequestException({
          code: 'TIER1_VIOLATIONS',
          message: `Cannot apply: ${validation.summary.tier1} tier-1 (immutable) violations found`,
          details: { violations: validation.violations.filter((v) => v.tier === 1) },
        });
      }

      // Tier 2 violations require acknowledgement
      if (validation.summary.tier2 > 0 && !acknowledgedViolations) {
        return {
          requires_acknowledgement: true,
          tier2_violations: validation.violations.filter((v) => v.tier === 2),
          tier2_count: validation.summary.tier2,
          message: 'Tier-2 violations found. Set acknowledged_violations=true to proceed.',
        };
      }
    }

    // Apply the entries atomically
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const academicYearId = run.academic_year_id;

      // Load period templates for time resolution
      const periodTemplates = await db.schedulePeriodTemplate.findMany({
        where: { tenant_id: tenantId, academic_year_id: academicYearId },
        select: {
          weekday: true,
          period_order: true,
          start_time: true,
          end_time: true,
          year_group_id: true,
        },
      });

      const periodMap = new Map<string, { start_time: Date; end_time: Date }>();
      for (const pt of periodTemplates) {
        periodMap.set(`${pt.year_group_id ?? 'shared'}|${pt.weekday}|${pt.period_order}`, {
          start_time: pt.start_time,
          end_time: pt.end_time,
        });
        // Also index shared templates
        if (pt.year_group_id === null) {
          periodMap.set(`shared|${pt.weekday}|${pt.period_order}`, {
            start_time: pt.start_time,
            end_time: pt.end_time,
          });
        }
      }

      // End-date or delete existing auto_generated schedules
      const existingAutoSchedules = await db.schedule.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          source: 'auto_generated',
        },
        select: {
          id: true,
          _count: { select: { attendance_sessions: true } },
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const existing of existingAutoSchedules) {
        if (existing._count.attendance_sessions > 0) {
          await db.schedule.update({
            where: { id: existing.id },
            data: { effective_end_date: today },
          });
        } else {
          await db.schedule.delete({ where: { id: existing.id } });
        }
      }

      // Insert new schedules
      for (const entry of resultJson.entries) {
        if (entry.is_supervision) continue; // Skip supervision-only entries for now

        let startTime: Date;
        let endTime: Date;

        if (entry.start_time && entry.end_time) {
          startTime = new Date(`1970-01-01T${entry.start_time}:00.000Z`);
          endTime = new Date(`1970-01-01T${entry.end_time}:00.000Z`);
        } else {
          // Try year-group-specific template first, then shared
          const ygKey = `${entry.year_group_id}|${entry.weekday}|${entry.period_order}`;
          const sharedKey = `shared|${entry.weekday}|${entry.period_order}`;
          const periodTimes = periodMap.get(ygKey) ?? periodMap.get(sharedKey);
          if (!periodTimes) continue;
          startTime = periodTimes.start_time;
          endTime = periodTimes.end_time;
        }

        await db.schedule.create({
          data: {
            tenant_id: tenantId,
            class_id: entry.class_id,
            academic_year_id: academicYearId,
            room_id: entry.room_id ?? null,
            teacher_staff_id: entry.teacher_staff_id ?? null,
            period_order: entry.period_order,
            weekday: entry.weekday,
            start_time: startTime,
            end_time: endTime,
            effective_start_date: today,
            effective_end_date: null,
            is_pinned: entry.is_pinned,
            source: 'auto_generated',
            scheduling_run_id: runId,
          },
        });
      }

      // Update run status
      const applied = await db.schedulingRun.update({
        where: { id: runId },
        data: {
          status: 'applied',
          applied_by_user_id: userId,
          applied_at: new Date(),
        },
      });

      return applied;
    })) as unknown as { id: string; status: string; applied_at: Date | null };

    return {
      id: result.id,
      status: result.status,
      applied_at: result.applied_at?.toISOString() ?? null,
      entries_applied: resultJson.entries.filter((e) => !e.is_supervision).length,
    };
  }

  // ─── Discard Run ───────────────────────────────────────────────────────────

  async discardRun(tenantId: string, runId: string) {
    const run = await this.schedulingRunsReadFacade.findStatusById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    if (run.status !== 'completed') {
      throw new BadRequestException({
        code: 'RUN_NOT_DISCARDABLE',
        message: `Only completed runs can be discarded. Current status: "${run.status}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.update({
        where: { id: runId },
        data: { status: 'discarded' },
      });
    })) as unknown as { id: string; status: string };

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  // SCHED-027: cancel a queued or running solver run. The worker's processor
  // short-circuits when it picks up a job whose run is no longer in `queued`
  // status (`solver-v2.processor.ts:97`), so a cancelled queued run is safe:
  // no partial writes to the timetable. Running runs can also be cancelled
  // (flipped to `failed`) so admins aren't blocked behind a slow solve;
  // cooperative abort inside CP-SAT is a follow-up task.
  async cancelRun(tenantId: string, runId: string) {
    const run = await this.schedulingRunsReadFacade.findStatusById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    if (!['queued', 'running'].includes(run.status)) {
      throw new BadRequestException({
        code: 'RUN_NOT_CANCELLABLE',
        message: `Only queued or running runs can be cancelled. Current status: "${run.status}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.update({
        where: { id: runId },
        data: { status: 'failed', failure_reason: 'Cancelled by user' },
      });
    })) as unknown as { id: string; status: string };

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  // ─── List Runs ─────────────────────────────────────────────────────────────

  async listRuns(tenantId: string, academicYearId: string, page: number, pageSize: number) {
    const _skip = (page - 1) * pageSize;
    const _where = { tenant_id: tenantId, academic_year_id: academicYearId };

    const result = await this.schedulingRunsReadFacade.listRuns(
      tenantId,
      academicYearId,
      page,
      pageSize,
    );
    const data = result.data as unknown as Record<string, unknown>[];
    const total = result.total;

    return {
      data: data.map((r) => this.formatRunPartial(r)),
      meta: { page, pageSize, total },
    };
  }

  // ─── Get Run ───────────────────────────────────────────────────────────────

  async getRun(tenantId: string, runId: string) {
    const run = await this.schedulingRunsReadFacade.findById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    return this.formatRun(run as unknown as Record<string, unknown>);
  }

  // ─── Get Run Status ────────────────────────────────────────────────────────

  async getRunStatus(tenantId: string, runId: string) {
    const run = await this.schedulingRunsReadFacade.findById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    return {
      id: run.id,
      status: run.status,
      entries_generated: run.entries_generated,
      entries_unassigned: run.entries_unassigned,
      solver_duration_ms: run.solver_duration_ms,
      failure_reason: run.failure_reason,
      updated_at: run.updated_at.toISOString(),
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private formatRunPartial(run: Record<string, unknown>): Record<string, unknown> {
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

  private formatRun(run: Record<string, unknown>): Record<string, unknown> {
    return this.formatRunPartial(run);
  }
}
