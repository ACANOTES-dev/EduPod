/**
 * Single-pass data loader for solver input assembly.
 *
 * Loads all tenant scheduling data in one Promise.all, returning a
 * normalised ``TenantData`` record that every downstream builder consumes.
 * SCHED-013: RLS is handled by the caller's transaction context;
 * SCHED-028: archived teachers filtered at source (employment_status = 'active').
 */
import type { PrismaClient } from '@prisma/client';

import type { AcademicReadFacade } from '../../../academics/academic-read.facade';
import type { ClassesReadFacade } from '../../../classes/classes-read.facade';
import type { ConfigurationReadFacade } from '../../../configuration/configuration-read.facade';
import type { RoomsReadFacade } from '../../../rooms/rooms-read.facade';
import type { SchedulesReadFacade } from '../../../schedules/schedules-read.facade';
import type { StaffAvailabilityReadFacade } from '../../../staff-availability/staff-availability-read.facade';
import type { StaffPreferencesReadFacade } from '../../../staff-preferences/staff-preferences-read.facade';
import type { StaffProfileReadFacade } from '../../../staff-profiles/staff-profile-read.facade';

// ─── Facades bundle (injected by the service) ──────────────────────────────

export interface AssemblyFacades {
  prisma: PrismaClient;
  academicReadFacade: AcademicReadFacade;
  classesReadFacade: ClassesReadFacade;
  configurationReadFacade: ConfigurationReadFacade;
  roomsReadFacade: RoomsReadFacade;
  schedulesReadFacade: SchedulesReadFacade;
  staffAvailabilityReadFacade: StaffAvailabilityReadFacade;
  staffPreferencesReadFacade: StaffPreferencesReadFacade;
  staffProfileReadFacade: StaffProfileReadFacade;
}

// ─── TenantData shape ───────────────────────────────────────────────────────

export interface YearGroupWithClasses {
  id: string;
  name: string;
  classes: Array<{ id: string; name: string; enrolmentCount: number }>;
}

export interface PeriodTemplate {
  weekday: number;
  period_order: number;
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  period_type: string;
  supervision_mode: string;
  break_group_id: string | null;
  year_group_id: string | null;
}

export interface CurriculumRow {
  year_group_id: string;
  subject_id: string;
  subject_name: string;
  min_periods_per_week: number;
  max_periods_per_day: number;
  preferred_periods_per_week: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
}

export interface ClassSubjectOverrideRow {
  class_id: string;
  subject_id: string;
  subject_name: string;
  year_group_id: string;
  periods_per_week: number;
  max_periods_per_day: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
  required_room_type: string | null;
  preferred_room_id: string | null;
}

export interface TeacherRecord {
  staff_profile_id: string;
  name: string;
  competencies: Array<{ subject_id: string; year_group_id: string; class_id: string | null }>;
  availability: Array<{ weekday: number; from: string; to: string }>;
  preferences: Array<{
    id: string;
    preference_type: string;
    preference_payload: unknown;
    priority: string;
  }>;
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
  max_supervision_duties_per_week: number | null;
}

export interface RoomRecord {
  room_id: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
}

export interface RoomClosureRecord {
  room_id: string;
  date_from: string;
  date_to: string;
}

export interface BreakGroupRecord {
  break_group_id: string;
  name: string;
  year_group_ids: string[];
  required_supervisor_count: number;
}

export interface PinnedScheduleRecord {
  schedule_id: string;
  class_id: string;
  subject_id: string | null;
  year_group_id: string | null;
  room_id: string | null;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
}

export interface ClassRoomOverrideRecord {
  class_id: string;
  preferred_room_id: string | null;
  required_room_type: string | null;
}

export interface TenantData {
  yearGroups: YearGroupWithClasses[];
  periodTemplates: PeriodTemplate[];
  curriculum: CurriculumRow[];
  classSubjectOverrides: ClassSubjectOverrideRow[];
  teachers: TeacherRecord[];
  rooms: RoomRecord[];
  roomClosures: RoomClosureRecord[];
  breakGroups: BreakGroupRecord[];
  pinnedSchedules: PinnedScheduleRecord[];
  studentOverlapPairs: Array<{ class_id: string; student_id: string }>;
  classRoomOverrides: ClassRoomOverrideRecord[];
  tenantSettings: Record<string, unknown> | null;
  strictClassSubjectOverride: boolean;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loadTenantData(
  facades: AssemblyFacades,
  tenantId: string,
  academicYearId: string,
): Promise<TenantData> {
  const { prisma } = facades;

  const [
    yearGroupsRaw,
    periodTemplatesRaw,
    curriculumReqs,
    teacherCompetencies,
    staffAvailabilities,
    staffPreferences,
    teacherConfigs,
    roomsRaw,
    roomClosuresRaw,
    breakGroupsRaw,
    pinnedSchedulesRaw,
    classEnrolments,
    tenantSettingsRow,
    classRequirements,
    classSubjectRequirements,
  ] = await Promise.all([
    facades.academicReadFacade.findYearGroupsWithClassesAndCounts(tenantId, academicYearId),
    prisma.schedulePeriodTemplate.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    }),
    prisma.curriculumRequirement.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: { subject: { select: { name: true } } },
    }),
    prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    }),
    facades.staffAvailabilityReadFacade.findByAcademicYear(tenantId, academicYearId),
    facades.staffPreferencesReadFacade.findByAcademicYear(tenantId, academicYearId),
    prisma.teacherSchedulingConfig.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    }),
    facades.roomsReadFacade.findActiveRooms(tenantId),
    facades.roomsReadFacade.findAllClosures(tenantId),
    prisma.breakGroup.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: { year_groups: { select: { year_group_id: true } } },
    }),
    facades.schedulesReadFacade.findPinnedEntries(tenantId, academicYearId),
    facades.classesReadFacade.findEnrolmentPairsForAcademicYear(tenantId, academicYearId),
    facades.configurationReadFacade.findSettings(tenantId),
    prisma.classSchedulingRequirement.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        OR: [{ preferred_room_id: { not: null } }, { required_room_type: { not: null } }],
      },
      select: { class_id: true, preferred_room_id: true, required_room_type: true },
    }),
    prisma.classSubjectRequirement.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: {
        class_entity: { select: { year_group_id: true } },
        subject: { select: { name: true } },
      },
    }),
  ]);

  // ─── SCHED-028: filter to active teachers only ──────────────────────────

  const competencyTeacherIds = [...new Set(teacherCompetencies.map((tc) => tc.staff_profile_id))];
  const staffProfiles =
    competencyTeacherIds.length > 0
      ? await facades.staffProfileReadFacade.findByIds(tenantId, competencyTeacherIds)
      : [];

  const activeTeacherIds = new Set(
    staffProfiles.filter((sp) => sp.employment_status === 'active').map((sp) => sp.id),
  );
  const staffNameMap = new Map(
    staffProfiles
      .filter((sp) => activeTeacherIds.has(sp.id))
      .map((sp) => [sp.id, `${sp.user.first_name} ${sp.user.last_name}`.trim()]),
  );
  const configMap = new Map(teacherConfigs.map((tc) => [tc.staff_profile_id, tc]));

  // ─── Normalise into TenantData ────────────────────────────────────────────

  const yearGroups: YearGroupWithClasses[] = yearGroupsRaw.map((yg) => ({
    id: yg.id,
    name: yg.name,
    classes: yg.classes.map((c) => ({
      id: c.id,
      name: c.name,
      enrolmentCount: c._count.class_enrolments,
    })),
  }));

  const periodTemplates: PeriodTemplate[] = periodTemplatesRaw.map((pt) => ({
    weekday: pt.weekday,
    period_order: pt.period_order,
    start_time: pt.start_time.toISOString().slice(11, 16),
    end_time: pt.end_time.toISOString().slice(11, 16),
    period_type: pt.schedule_period_type,
    supervision_mode: pt.supervision_mode ?? 'none',
    break_group_id: pt.break_group_id,
    year_group_id: pt.year_group_id,
  }));

  const curriculum: CurriculumRow[] = curriculumReqs.map((cr) => ({
    year_group_id: cr.year_group_id,
    subject_id: cr.subject_id,
    subject_name: cr.subject.name,
    min_periods_per_week: cr.min_periods_per_week,
    max_periods_per_day: cr.max_periods_per_day,
    preferred_periods_per_week: cr.preferred_periods_per_week,
    requires_double_period: cr.requires_double_period,
    double_period_count: cr.double_period_count,
  }));

  const classSubjectOverrides: ClassSubjectOverrideRow[] = classSubjectRequirements
    .filter((o) => o.class_entity?.year_group_id)
    .map((o) => ({
      class_id: o.class_id,
      subject_id: o.subject_id,
      subject_name: o.subject?.name ?? 'Subject',
      year_group_id: o.class_entity!.year_group_id!,
      periods_per_week: o.periods_per_week,
      max_periods_per_day: o.max_periods_per_day,
      requires_double_period: o.requires_double_period,
      double_period_count: o.double_period_count,
      required_room_type: o.required_room_type ?? null,
      preferred_room_id: o.preferred_room_id ?? null,
    }));

  const teacherIds = competencyTeacherIds.filter((id) => activeTeacherIds.has(id));
  const teachers: TeacherRecord[] = teacherIds.map((teacherId) => {
    const config = configMap.get(teacherId);
    return {
      staff_profile_id: teacherId,
      name: staffNameMap.get(teacherId) ?? teacherId,
      competencies: teacherCompetencies
        .filter((tc) => tc.staff_profile_id === teacherId)
        .map((tc) => ({
          subject_id: tc.subject_id,
          year_group_id: tc.year_group_id,
          class_id: tc.class_id ?? null,
        })),
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
          preference_type: sp.preference_type,
          preference_payload: sp.preference_payload,
          priority: sp.priority,
        })),
      max_periods_per_week: config?.max_periods_per_week ?? null,
      max_periods_per_day: config?.max_periods_per_day ?? null,
      max_supervision_duties_per_week: config?.max_supervision_duties_per_week ?? null,
    };
  });

  const rooms: RoomRecord[] = roomsRaw.map((r) => ({
    room_id: r.id,
    room_type: r.room_type,
    capacity: r.capacity,
    is_exclusive: r.is_exclusive,
  }));

  const roomClosures: RoomClosureRecord[] = roomClosuresRaw.map((rc) => ({
    room_id: rc.room_id,
    date_from: rc.date_from.toISOString().slice(0, 10),
    date_to: rc.date_to.toISOString().slice(0, 10),
  }));

  const breakGroups: BreakGroupRecord[] = breakGroupsRaw.map((bg) => ({
    break_group_id: bg.id,
    name: bg.name,
    year_group_ids: bg.year_groups.map((yg) => yg.year_group_id),
    required_supervisor_count: bg.required_supervisor_count,
  }));

  const pinnedSchedules: PinnedScheduleRecord[] = pinnedSchedulesRaw.map((s) => ({
    schedule_id: s.id,
    class_id: s.class_id,
    subject_id: s.class_entity?.subject_id ?? null,
    year_group_id: s.class_entity?.year_group_id ?? null,
    room_id: s.room_id,
    teacher_staff_id: s.teacher_staff_id,
    weekday: s.weekday,
    period_order: s.period_order ?? 0,
  }));

  const tenantSettingsBlob =
    (tenantSettingsRow?.settings as Record<string, unknown> | null | undefined) ?? null;
  const schedulingSettings =
    (tenantSettingsBlob?.scheduling as Record<string, unknown> | undefined) ?? undefined;
  const strictClassSubjectOverride =
    (schedulingSettings?.['strict_class_subject_override'] as boolean | undefined) ?? false;

  return {
    yearGroups,
    periodTemplates,
    curriculum,
    classSubjectOverrides,
    teachers,
    rooms,
    roomClosures,
    breakGroups,
    pinnedSchedules,
    studentOverlapPairs: classEnrolments.map((e) => ({
      class_id: e.class_id,
      student_id: e.student_id,
    })),
    classRoomOverrides: classRequirements.map((r) => ({
      class_id: r.class_id,
      preferred_room_id: r.preferred_room_id,
      required_room_type: r.required_room_type,
    })),
    tenantSettings: schedulingSettings ?? null,
    strictClassSubjectOverride,
  };
}
