import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  AbsenceQuery,
  AssignSubstituteDto,
  CancelAbsenceDto,
  ReportAbsenceDto,
  SelfReportAbsenceDto,
  SubstitutionRecordQuery,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

export interface SubstituteCandidate {
  staff_profile_id: string;
  name: string;
  is_competent: boolean;
  is_primary: boolean;
  is_available: boolean;
  cover_count: number;
  rank_score: number;
}

@Injectable()
export class SubstitutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  /**
   * Resolve the subject for one or more schedule rows via their originating
   * scheduling_run_id. `Schedule` has no subject_id column — the solver stores
   * each lesson's subject in the run's result_json, keyed by
   * (class_id, weekday, period_order).
   *
   * Returns a Map keyed by schedule_id with { subject_id, subject_name }. Any
   * row whose run/class/period combination can't be located is simply absent
   * from the map; the caller falls back to whatever context is available.
   */
  private async resolveSubjectsFromRuns(
    tenantId: string,
    rows: Array<{
      schedule_id: string;
      class_id: string;
      weekday: number;
      period_order: number | null;
      scheduling_run_id: string | null;
    }>,
  ): Promise<Map<string, { subject_id: string; subject_name: string }>> {
    const result = new Map<string, { subject_id: string; subject_name: string }>();
    const runIds = new Set<string>();
    for (const r of rows) if (r.scheduling_run_id) runIds.add(r.scheduling_run_id);
    if (runIds.size === 0) return result;

    // eslint-disable-next-line school/no-cross-module-prisma-access -- read-only lookup of scheduling_run result/config to recover subject for applied schedule entries (Schedule table has no subject_id column; subject lives per-lesson in the solver output)
    const runs = await this.prisma.schedulingRun.findMany({
      where: { tenant_id: tenantId, id: { in: [...runIds] } },
      select: { id: true, result_json: true, config_snapshot: true },
    });

    const nameByRun = new Map<string, Map<string, string>>();
    const entryByRun = new Map<string, Map<string, string>>();
    for (const run of runs) {
      const snap = (run.config_snapshot ?? {}) as Record<string, unknown>;
      const nameMap = new Map<string, string>();
      const subjects = Array.isArray(snap['subjects'])
        ? (snap['subjects'] as Array<Record<string, unknown>>)
        : [];
      for (const s of subjects) {
        if (typeof s['subject_id'] === 'string' && typeof s['subject_name'] === 'string') {
          nameMap.set(s['subject_id'], s['subject_name']);
        }
      }
      const curriculum = Array.isArray(snap['curriculum'])
        ? (snap['curriculum'] as Array<Record<string, unknown>>)
        : [];
      for (const c of curriculum) {
        if (
          typeof c['subject_id'] === 'string' &&
          typeof c['subject_name'] === 'string' &&
          !nameMap.has(c['subject_id'])
        ) {
          nameMap.set(c['subject_id'], c['subject_name']);
        }
      }
      nameByRun.set(run.id, nameMap);

      const res = (run.result_json ?? {}) as Record<string, unknown>;
      const entries = Array.isArray(res['entries'])
        ? (res['entries'] as Array<Record<string, unknown>>)
        : [];
      const entryMap = new Map<string, string>();
      for (const e of entries) {
        const cid = typeof e['class_id'] === 'string' ? e['class_id'] : null;
        const wd = Number(e['weekday'] ?? -1);
        const po = Number(e['period_order'] ?? -1);
        const sid = typeof e['subject_id'] === 'string' ? e['subject_id'] : null;
        if (cid && sid && wd >= 0 && po >= 0) {
          entryMap.set(`${cid}|${wd}|${po}`, sid);
        }
      }
      entryByRun.set(run.id, entryMap);
    }

    for (const r of rows) {
      if (!r.scheduling_run_id || r.period_order === null) continue;
      const entryMap = entryByRun.get(r.scheduling_run_id);
      const nameMap = nameByRun.get(r.scheduling_run_id);
      if (!entryMap || !nameMap) continue;
      const subjectId = entryMap.get(`${r.class_id}|${r.weekday}|${r.period_order}`);
      if (!subjectId) continue;
      const subjectName = nameMap.get(subjectId);
      if (subjectName)
        result.set(r.schedule_id, { subject_id: subjectId, subject_name: subjectName });
    }
    return result;
  }

  // ─── Report Absence ───────────────────────────────────────────────────────

  async reportAbsence(tenantId: string, userId: string, dto: ReportAbsenceDto) {
    // Verify staff exists in tenant
    await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.staff_id);

    await this.assertNoOverlappingAbsence(tenantId, dto.staff_id, dto.date, dto.date_to ?? null);

    return this.createAbsence(tenantId, userId, {
      staffProfileId: dto.staff_id,
      date: dto.date,
      dateTo: dto.date_to ?? null,
      fullDay: dto.full_day ?? true,
      periodFrom: dto.period_from ?? null,
      periodTo: dto.period_to ?? null,
      reason: dto.reason ?? null,
      absenceType: 'self_reported',
      nominatedSubstituteId: null,
      leaveTypeId: null,
      leaveRequestId: null,
      isPaid: true,
      daysCounted: this.computeDaysCounted(dto.date, dto.date_to ?? null, dto.full_day ?? true),
    });
  }

  // ─── Self-Report Absence (Teacher) ───────────────────────────────────────
  // Teacher-initiated flow. Uses auth context to locate the staff_profile;
  // accepts an optional nominated substitute. No approval required — the sick
  // absence is effective immediately and the cascade engine runs from here.

  async selfReportAbsence(tenantId: string, userId: string, dto: SelfReportAbsenceDto) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      throw new BadRequestException({
        error: {
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: 'No staff profile linked to the current user',
        },
      });
    }

    // Nominee must be an active teacher in the same tenant (no competency check —
    // per Decision 10, Sarah may nominate any active colleague).
    if (dto.nominated_substitute_staff_id) {
      if (dto.nominated_substitute_staff_id === staff.id) {
        throw new BadRequestException({
          error: {
            code: 'CANNOT_NOMINATE_SELF',
            message: 'You cannot nominate yourself as a substitute',
          },
        });
      }
      await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.nominated_substitute_staff_id);
    }

    await this.assertNoOverlappingAbsence(tenantId, staff.id, dto.date, dto.date_to ?? null);

    return this.createAbsence(tenantId, userId, {
      staffProfileId: staff.id,
      date: dto.date,
      dateTo: dto.date_to ?? null,
      fullDay: dto.full_day ?? true,
      periodFrom: dto.period_from ?? null,
      periodTo: dto.period_to ?? null,
      reason: dto.reason ?? null,
      absenceType: 'self_reported',
      nominatedSubstituteId: dto.nominated_substitute_staff_id ?? null,
      leaveTypeId: null,
      leaveRequestId: null,
      isPaid: true,
      daysCounted: this.computeDaysCounted(dto.date, dto.date_to ?? null, dto.full_day ?? true),
    });
  }

  // ─── Cancel Absence ──────────────────────────────────────────────────────
  // Soft-cancel: sets cancelled_at + reason. Cascade revocation of pending
  // offers + confirmed records lands in S4.

  async cancelAbsence(
    tenantId: string,
    userId: string,
    absenceId: string,
    dto: CancelAbsenceDto,
    opts: { requireOwnStaffProfileId?: string } = {},
  ) {
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { tenant_id: tenantId, id: absenceId },
    });
    if (!absence) {
      throw new NotFoundException({
        error: {
          code: 'ABSENCE_NOT_FOUND',
          message: `Absence with id "${absenceId}" not found`,
        },
      });
    }
    if (absence.cancelled_at) {
      throw new ConflictException({
        error: { code: 'ABSENCE_ALREADY_CANCELLED', message: 'This absence is already cancelled' },
      });
    }
    if (
      opts.requireOwnStaffProfileId &&
      absence.staff_profile_id !== opts.requireOwnStaffProfileId
    ) {
      throw new NotFoundException({
        error: {
          code: 'ABSENCE_NOT_FOUND',
          message: `Absence with id "${absenceId}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherAbsence.update({
        where: { id: absenceId },
        data: {
          cancelled_at: new Date(),
          cancelled_by_user_id: userId,
          cancellation_reason: dto.cancellation_reason ?? null,
        },
      });
    });

    return { id: absenceId, cancelled_at: new Date().toISOString() };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async assertNoOverlappingAbsence(
    tenantId: string,
    staffProfileId: string,
    date: string,
    dateTo: string | null,
  ) {
    const rangeStart = new Date(date);
    const rangeEnd = dateTo ? new Date(dateTo) : rangeStart;

    // Find any active absence whose range intersects the requested range.
    // Overlap condition: existing.absence_date <= requested.rangeEnd AND
    // COALESCE(existing.date_to, existing.absence_date) >= requested.rangeStart.
    const overlapping = await this.prisma.teacherAbsence.findFirst({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        cancelled_at: null,
        absence_date: { lte: rangeEnd },
        OR: [
          { date_to: null, absence_date: { gte: rangeStart } },
          { date_to: { gte: rangeStart } },
        ],
      },
    });

    if (overlapping) {
      throw new ConflictException({
        error: {
          code: 'ABSENCE_OVERLAPS_EXISTING',
          message: 'An active absence already exists covering part or all of this date range',
        },
      });
    }
  }

  private async createAbsence(
    tenantId: string,
    userId: string,
    args: {
      staffProfileId: string;
      date: string;
      dateTo: string | null;
      fullDay: boolean;
      periodFrom: number | null;
      periodTo: number | null;
      reason: string | null;
      absenceType: 'self_reported' | 'approved_leave';
      nominatedSubstituteId: string | null;
      leaveTypeId: string | null;
      leaveRequestId: string | null;
      isPaid: boolean;
      daysCounted: number;
    },
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const absence = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherAbsence.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: args.staffProfileId,
          absence_date: new Date(args.date),
          date_to: args.dateTo ? new Date(args.dateTo) : null,
          absence_type: args.absenceType,
          leave_type_id: args.leaveTypeId,
          leave_request_id: args.leaveRequestId,
          nominated_substitute_id: args.nominatedSubstituteId,
          full_day: args.fullDay,
          period_from: args.periodFrom,
          period_to: args.periodTo,
          is_paid: args.isPaid,
          days_counted: args.daysCounted,
          reason: args.reason,
          reported_by_user_id: userId,
          reported_at: new Date(),
        },
      });
    })) as unknown as { id: string; absence_date: Date; date_to: Date | null; created_at: Date };

    // SCHED-019 part 2: if the newly-absent teacher has any pending cover
    // offers that overlap this absence, revoke them. Otherwise the staff
    // member could accept an offer for a period they can no longer cover.
    await this.revokeOverlappingPendingOffers(tenantId, args);

    return {
      id: absence.id,
      staff_id: args.staffProfileId,
      date: args.date,
      date_to: args.dateTo,
      full_day: args.fullDay,
      absence_type: args.absenceType,
      nominated_substitute_staff_id: args.nominatedSubstituteId,
      days_counted: args.daysCounted,
      created_at: absence.created_at.toISOString(),
    };
  }

  private async revokeOverlappingPendingOffers(
    tenantId: string,
    args: {
      staffProfileId: string;
      date: string;
      dateTo: string | null;
      fullDay: boolean;
      periodFrom: number | null;
      periodTo: number | null;
    },
  ): Promise<void> {
    const start = new Date(args.date);
    start.setHours(0, 0, 0, 0);
    const end = args.dateTo ? new Date(args.dateTo) : new Date(args.date);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);

    const pending = await this.prisma.substitutionOffer.findMany({
      where: {
        tenant_id: tenantId,
        candidate_staff_id: args.staffProfileId,
        status: 'pending',
        absence_date: { gte: start, lt: end },
      },
      select: { id: true, schedule: { select: { period_order: true } } },
    });

    const ids: string[] = [];
    for (const o of pending) {
      if (args.fullDay) {
        ids.push(o.id);
        continue;
      }
      const p = o.schedule.period_order;
      const from = args.periodFrom ?? Number.POSITIVE_INFINITY;
      const to = args.periodTo ?? Number.NEGATIVE_INFINITY;
      if (p != null && p >= from && p <= to) ids.push(o.id);
    }
    if (ids.length === 0) return;

    await this.prisma.substitutionOffer.updateMany({
      where: { id: { in: ids }, status: 'pending' },
      data: { status: 'revoked', responded_at: new Date() },
    });
  }

  private computeDaysCounted(date: string, dateTo: string | null, fullDay: boolean): number {
    // Partial-day absences count as 0.5 regardless of how many periods — payroll
    // cares about paid-vs-unpaid day fractions, not precise period math.
    if (!fullDay) return 0.5;
    if (!dateTo) return 1;
    const start = new Date(date);
    const end = new Date(dateTo);
    const ms = end.getTime() - start.getTime();
    const days = Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
    return days;
  }

  // ─── Find Eligible Substitutes ────────────────────────────────────────────

  async findEligibleSubstitutes(
    tenantId: string,
    scheduleId: string,
    date: string,
  ): Promise<{ data: SubstituteCandidate[] }> {
    // Load the schedule to understand context
    const schedule = await this.schedulesReadFacade.findByIdWithSubstitutionContext(
      tenantId,
      scheduleId,
    );
    if (!schedule) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      });
    }

    const targetDate = new Date(date);
    const weekday = targetDate.getDay();
    const classId = schedule.class_id;
    const yearGroupId = schedule.class_entity?.year_group_id ?? null;
    const academicYearId = schedule.class_entity?.academic_year_id ?? schedule.academic_year_id;

    // Resolve the subject for this slot. Legacy subject-specific classes carry
    // `class.subject_id`; shared classes don't, in which case the subject lives
    // in the scheduling run that placed the lesson. Without this fallback the
    // competency lookup below returns empty and every cover search for a
    // shared-class tenant says "no eligible substitutes" — which is the bug
    // the NHQS pilot hit on 2026-04-18.
    const resolved = await this.resolveSubjectsFromRuns(tenantId, [
      {
        schedule_id: schedule.id,
        class_id: classId,
        weekday: schedule.weekday,
        period_order: schedule.period_order,
        scheduling_run_id: schedule.scheduling_run_id,
      },
    ]);
    const subjectId =
      resolved.get(schedule.id)?.subject_id ?? schedule.class_entity?.subject_id ?? null;

    // Find teachers already busy at this time slot on that date.
    // Busy = (a) has a scheduled class at the same weekday/time window, OR
    //        (b) has already been assigned as a substitute for *another*
    //            absence covering this same date + overlapping time.
    // Case (b) is the one `findBusyTeacherIds` misses — a teacher who
    // accepted a cover for an earlier-reported absence at Mon P1 must not
    // now be offered a second Mon P1 cover.
    const busyIdsScheduled = await this.schedulesReadFacade.findBusyTeacherIds(tenantId, {
      weekday,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      effectiveDate: targetDate,
    });

    const busyIds = new Set(busyIdsScheduled);
    const alreadyCoveringRows = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        absence_date: targetDate,
        status: { in: ['assigned', 'confirmed'] },
        schedule: {
          weekday,
          start_time: { lt: schedule.end_time },
          end_time: { gt: schedule.start_time },
        },
      },
      select: { substitute_staff_id: true },
    });
    for (const r of alreadyCoveringRows) {
      if (r.substitute_staff_id) busyIds.add(r.substitute_staff_id);
    }

    // Find teachers who themselves have an active absence covering this
    // date+period. An absence is disqualifying if it is not cancelled AND
    // (a) full-day, OR (b) the schedule's period_order falls inside the
    // absence's period_from..period_to range. Without this filter the
    // cascade would happily offer a cover to someone who's on leave for
    // that exact period — SCHED-019.
    const targetPeriod = schedule.period_order ?? null;
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const absenceRows = await this.prisma.teacherAbsence.findMany({
      where: {
        tenant_id: tenantId,
        cancelled_at: null,
        absence_date: { gte: dayStart, lt: dayEnd },
      },
      select: {
        staff_profile_id: true,
        full_day: true,
        period_from: true,
        period_to: true,
      },
    });
    const absentStaffIds = new Set<string>();
    for (const a of absenceRows) {
      if (a.full_day) {
        absentStaffIds.add(a.staff_profile_id);
        continue;
      }
      if (targetPeriod == null) continue;
      const from = a.period_from ?? Number.POSITIVE_INFINITY;
      const to = a.period_to ?? Number.NEGATIVE_INFINITY;
      if (targetPeriod >= from && targetPeriod <= to) {
        absentStaffIds.add(a.staff_profile_id);
      }
    }

    // All staff
    const allStaff = await this.staffProfileReadFacade.findActiveStaff(tenantId);

    // Stage 7: substitute competencies live in their own table. Pin for this
    // specific class ranks higher than a pool entry for the year group; both
    // outrank non-competent candidates.
    const competencyRows =
      subjectId && yearGroupId
        ? await this.prisma.substituteTeacherCompetency.findMany({
            where: {
              tenant_id: tenantId,
              academic_year_id: academicYearId,
              subject_id: subjectId,
              OR: [{ class_id: classId }, { class_id: null, year_group_id: yearGroupId }],
            },
            select: { staff_profile_id: true, class_id: true },
          })
        : [];

    const pinnedStaffIds = new Set<string>();
    const pooledStaffIds = new Set<string>();
    for (const row of competencyRows) {
      if (row.class_id === classId) pinnedStaffIds.add(row.staff_profile_id);
      else pooledStaffIds.add(row.staff_profile_id);
    }

    // Cover counts (substitution_records from last 30 days for fairness)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const coverRecords = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: thirtyDaysAgo },
      },
      select: { substitute_staff_id: true },
    });

    const coverCountMap = new Map<string, number>();
    for (const r of coverRecords) {
      coverCountMap.set(r.substitute_staff_id, (coverCountMap.get(r.substitute_staff_id) ?? 0) + 1);
    }

    const results: SubstituteCandidate[] = [];

    for (const staff of allStaff) {
      if (busyIds.has(staff.id)) continue;
      // Skip the absent teacher themselves
      if (staff.id === schedule.teacher_staff_id) continue;
      // Skip teachers whose own active absence covers this period — SCHED-019.
      if (absentStaffIds.has(staff.id)) continue;

      const name = `${staff.user.first_name} ${staff.user.last_name}`.trim();
      const isPinned = pinnedStaffIds.has(staff.id);
      const isPooled = pooledStaffIds.has(staff.id);
      const isCompetent = subjectId ? isPinned || isPooled : true;
      const coverCount = coverCountMap.get(staff.id) ?? 0;

      let rankScore = 0;
      if (isPinned) rankScore += 30;
      else if (isPooled) rankScore += 20;
      else if (isCompetent) rankScore += 10;
      rankScore -= coverCount * 2; // Penalise frequent cover teachers for fairness

      results.push({
        staff_profile_id: staff.id,
        name,
        is_competent: isCompetent,
        is_primary: isPinned,
        is_available: true, // Availability already filtered by busy check
        cover_count: coverCount,
        rank_score: rankScore,
      });
    }

    results.sort((a, b) => b.rank_score - a.rank_score);

    return { data: results };
  }

  // ─── Assign Substitute ────────────────────────────────────────────────────

  async assignSubstitute(tenantId: string, userId: string, dto: AssignSubstituteDto) {
    // Verify absence exists and pull its date — needed so the record carries
    // a valid absence_date. Without it the cover-overlay on My Timetable
    // can't filter by week and the conflict check in findEligibleSubstitutes
    // can't exclude already-covering teachers.
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { id: dto.absence_id, tenant_id: tenantId },
      select: { id: true, absence_date: true },
    });
    if (!absence) {
      throw new NotFoundException({
        error: { code: 'ABSENCE_NOT_FOUND', message: 'Absence record not found' },
      });
    }

    // Verify schedule exists
    const scheduleCheck = await this.schedulesReadFacade.existsById(tenantId, dto.schedule_id);
    if (!scheduleCheck) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      });
    }

    // Verify substitute staff exists
    await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.substitute_staff_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.substitutionRecord.create({
        data: {
          tenant_id: tenantId,
          absence_id: dto.absence_id,
          schedule_id: dto.schedule_id,
          substitute_staff_id: dto.substitute_staff_id,
          absence_date: absence.absence_date,
          source: 'manual',
          status: 'assigned',
          assigned_by_user_id: userId,
          assigned_at: new Date(),
          notes: dto.notes ?? null,
        },
      });
    })) as unknown as { id: string; status: string; created_at: Date };

    return {
      id: (record as { id: string }).id,
      absence_id: dto.absence_id,
      schedule_id: dto.schedule_id,
      substitute_staff_id: dto.substitute_staff_id,
      status: (record as { status: string }).status,
      created_at: (record as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Get Absences ─────────────────────────────────────────────────────────

  async getAbsences(tenantId: string, query: AbsenceQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: {
      tenant_id: string;
      staff_profile_id?: string;
      absence_date?: { gte?: Date; lte?: Date };
    } = { tenant_id: tenantId };

    if (query.staff_id) {
      where.staff_profile_id = query.staff_id;
    }
    if (query.date_from || query.date_to) {
      where.absence_date = {};
      if (query.date_from) where.absence_date.gte = new Date(query.date_from);
      if (query.date_to) where.absence_date.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.teacherAbsence.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { absence_date: 'desc' },
        include: {
          staff_profile: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
          substitution_records: {
            select: {
              id: true,
              status: true,
              schedule_id: true,
              substitute_staff_id: true,
              substitute: { select: { user: { select: { first_name: true, last_name: true } } } },
            },
          },
        },
      }),
      this.prisma.teacherAbsence.count({ where }),
    ]);

    // Build per-absence slots by pulling the teacher's effective schedule for
    // the absence date. This gives the UI one row per lesson the absent
    // teacher would have taught, each annotated with its substitution status.
    const slotsByAbsenceId = new Map<
      string,
      Array<{
        schedule_id: string;
        period_name: string;
        period_order: number;
        subject_name: string;
        class_name: string;
        substitute_status: 'unassigned' | 'assigned' | 'confirmed' | 'declined' | 'completed';
        substitute_name: string | null;
        substitution_record_id: string | null;
      }>
    >();

    for (const absence of data) {
      const schedules = await this.schedulesReadFacade.findTeacherSchedulesForDate(
        tenantId,
        absence.staff_profile_id,
        absence.absence_date,
      );

      // Narrow to the absence window when not full-day.
      const inWindow = (periodOrder: number | null): boolean => {
        if (absence.full_day) return true;
        if (periodOrder == null) return false;
        const from = absence.period_from ?? Number.NEGATIVE_INFINITY;
        const to = absence.period_to ?? Number.POSITIVE_INFINITY;
        return periodOrder >= from && periodOrder <= to;
      };

      const recBySchedule = new Map(absence.substitution_records.map((r) => [r.schedule_id, r]));

      const windowed = schedules.filter((s) => inWindow(s.period_order));

      // Resolve subject_name per slot via the scheduling run (applied schedule
      // rows carry a run_id but no subject_id — the subject lives in the run's
      // result_json). Falls back to class.subject.name where that legacy column
      // is populated (subject-specific classes), then to '—' as a last resort.
      const runSubjects = await this.resolveSubjectsFromRuns(
        tenantId,
        windowed.map((s) => ({
          schedule_id: s.id,
          class_id: s.class_id,
          weekday: s.weekday,
          period_order: s.period_order,
          scheduling_run_id: s.scheduling_run_id,
        })),
      );

      const slots = windowed.map((s) => {
        const rec = recBySchedule.get(s.id);
        const status = rec?.status ?? 'unassigned';
        const resolvedSubject =
          runSubjects.get(s.id)?.subject_name ?? s.class_entity?.subject?.name ?? null;
        return {
          schedule_id: s.id,
          period_name:
            s.schedule_period_template?.period_name ??
            (s.period_order != null ? `P${s.period_order}` : '—'),
          period_order: s.period_order ?? 0,
          subject_name: resolvedSubject ?? '—',
          class_name: s.class_entity?.name ?? '—',
          substitute_status: status as
            | 'unassigned'
            | 'assigned'
            | 'confirmed'
            | 'declined'
            | 'completed',
          substitute_name: rec?.substitute
            ? `${rec.substitute.user.first_name} ${rec.substitute.user.last_name}`.trim()
            : null,
          substitution_record_id: rec?.id ?? null,
        };
      });

      slotsByAbsenceId.set(absence.id, slots);
    }

    return {
      data: data.map((a) => {
        const name = `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim();
        return {
          id: a.id,
          staff_profile_id: a.staff_profile_id,
          // Keep legacy `staff_name` and expose `teacher_name` alias for the
          // substitutions UI that renders per absence row.
          staff_name: name,
          teacher_name: name,
          absence_date: a.absence_date.toISOString().slice(0, 10),
          full_day: a.full_day,
          period_from: a.period_from,
          period_to: a.period_to,
          reason: a.reason,
          reported_at: a.reported_at.toISOString(),
          substitution_count: a.substitution_records.length,
          substitutions: a.substitution_records.map((sr) => ({
            id: sr.id,
            status: sr.status,
            substitute_staff_id: sr.substitute_staff_id,
            substitute_name:
              `${sr.substitute.user.first_name} ${sr.substitute.user.last_name}`.trim(),
          })),
          slots: slotsByAbsenceId.get(a.id) ?? [],
        };
      }),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Substitution Records ─────────────────────────────────────────────

  async getSubstitutionRecords(tenantId: string, query: SubstitutionRecordQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: {
      tenant_id: string;
      substitute_staff_id?: string;
      status?: 'assigned' | 'confirmed' | 'declined' | 'completed' | 'revoked';
      created_at?: { gte?: Date; lte?: Date };
    } = { tenant_id: tenantId };

    if (query.staff_id) {
      where.substitute_staff_id = query.staff_id;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) where.created_at.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.substitutionRecord.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { assigned_at: 'desc' },
        include: {
          absence: {
            select: {
              absence_date: true,
              staff_profile: {
                select: { user: { select: { first_name: true, last_name: true } } },
              },
            },
          },
          substitute: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
        },
      }),
      this.prisma.substitutionRecord.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        absence_id: r.absence_id,
        schedule_id: r.schedule_id,
        substitute_staff_id: r.substitute_staff_id,
        substitute_name: `${r.substitute.user.first_name} ${r.substitute.user.last_name}`.trim(),
        absent_staff_name:
          `${r.absence.staff_profile.user.first_name} ${r.absence.staff_profile.user.last_name}`.trim(),
        absence_date: r.absence.absence_date.toISOString().slice(0, 10),
        status: r.status,
        assigned_at: r.assigned_at.toISOString(),
        confirmed_at: r.confirmed_at?.toISOString() ?? null,
        notes: r.notes,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Today Board ──────────────────────────────────────────────────────

  async getTodayBoard(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const absences = await this.prisma.teacherAbsence.findMany({
      where: {
        tenant_id: tenantId,
        absence_date: { gte: today, lte: endOfWeek },
      },
      orderBy: { absence_date: 'asc' },
      include: {
        staff_profile: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
        substitution_records: {
          // Only active covers belong on the board. Revoked (cancelled
          // absence) and declined offers must not clutter the staffroom
          // display — SCHED-020.
          where: { status: { notIn: ['revoked', 'declined'] } },
          include: {
            substitute: {
              select: { user: { select: { first_name: true, last_name: true } } },
            },
            schedule: {
              select: {
                weekday: true,
                period_order: true,
                start_time: true,
                end_time: true,
                room: { select: { name: true } },
                class_entity: { select: { name: true, subject: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const todayStr = today.toISOString().slice(0, 10);

    const [tenantName, branding] = await Promise.all([
      this.tenantReadFacade.findNameById(tenantId),
      this.tenantReadFacade.findBranding(tenantId),
    ]);

    const todayAbsences = absences.filter(
      (a) => a.absence_date.toISOString().slice(0, 10) === todayStr,
    );
    const upcomingAbsences = absences.filter(
      (a) => a.absence_date.toISOString().slice(0, 10) !== todayStr,
    );

    // Flatten today's substitution records into per-slot rows for the board.
    const slots = todayAbsences.flatMap((a) =>
      a.substitution_records.map((sr) => ({
        schedule_id: sr.schedule_id,
        period_name: `P${sr.schedule.period_order}`,
        period_order: sr.schedule.period_order,
        start_time: sr.schedule.start_time.toISOString().slice(11, 16),
        end_time: sr.schedule.end_time.toISOString().slice(11, 16),
        absent_teacher_name:
          `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim(),
        substitute_name: `${sr.substitute.user.first_name} ${sr.substitute.user.last_name}`.trim(),
        subject_name: sr.schedule.class_entity?.subject?.name ?? null,
        class_name: sr.schedule.class_entity?.name ?? null,
        room_name: sr.schedule.room?.name ?? null,
        status: sr.status,
      })),
    );

    const upcoming = upcomingAbsences.map((a) => ({
      absence_date: a.absence_date.toISOString().slice(0, 10),
      teacher_name: `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim(),
      coverage_count: a.substitution_records.length,
      total_slots: a.substitution_records.length,
    }));

    return {
      today_date: todayStr,
      slots,
      upcoming,
      school_name: tenantName ?? null,
      school_logo_url: branding?.logo_url ?? null,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Validate Absence Update ──────────────────────────────────────────────

  async validateAbsenceExists(tenantId: string, absenceId: string) {
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { id: absenceId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!absence) {
      throw new NotFoundException({
        error: { code: 'ABSENCE_NOT_FOUND', message: 'Absence not found' },
      });
    }
  }

  // ─── Delete Absence ───────────────────────────────────────────────────────

  async deleteAbsence(tenantId: string, absenceId: string) {
    await this.validateAbsenceExists(tenantId, absenceId);

    const hasRecords = await this.prisma.substitutionRecord.findFirst({
      where: { absence_id: absenceId, tenant_id: tenantId },
      select: { id: true },
    });
    if (hasRecords) {
      throw new BadRequestException({
        error: {
          code: 'ABSENCE_HAS_SUBSTITUTIONS',
          message: 'Cannot delete absence with assigned substitutions',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherAbsence.delete({ where: { id: absenceId } });
    });

    return { deleted: true };
  }
}
