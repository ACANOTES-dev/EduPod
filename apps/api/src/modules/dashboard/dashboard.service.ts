import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ParentDashboard,
  ParentDashboardStudent,
  SchoolAdminDashboard,
  TeacherDashboardData,
  TimetableEntry,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────

function buildGreeting(firstName: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async schoolAdmin(tenantId: string, userId: string): Promise<SchoolAdminDashboard & { greeting: string; summary: string }> {
    // Load the user from the platform users table (no RLS — users table is platform-level)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const stats = await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const [
        activeStudents,
        totalStudents,
        applicants,
        activeStaff,
        totalStaff,
        activeClasses,
        pendingApprovals,
        activeAcademicYear,
        incompleteHouseholds,
        recentApplications,
        pendingApplications,
        acceptedApplications,
      ] = await Promise.all([
        txClient.student.count({ where: { tenant_id: tenantId, status: 'active' } }),
        txClient.student.count({ where: { tenant_id: tenantId } }),
        txClient.student.count({ where: { tenant_id: tenantId, status: 'applicant' } }),
        txClient.staffProfile.count({ where: { tenant_id: tenantId, employment_status: 'active' } }),
        txClient.staffProfile.count({ where: { tenant_id: tenantId } }),
        txClient.class.count({ where: { tenant_id: tenantId, status: 'active' } }),
        txClient.approvalRequest.count({ where: { tenant_id: tenantId, status: 'pending_approval' } }),
        txClient.academicYear.findFirst({
          where: { tenant_id: tenantId, status: 'active' },
          select: { name: true },
          orderBy: { start_date: 'desc' },
        }),
        txClient.household.findMany({
          where: { tenant_id: tenantId, needs_completion: true },
          take: 10,
          select: { id: true, household_name: true },
        }),
        txClient.application.count({ where: { tenant_id: tenantId, status: 'submitted' } }),
        txClient.application.count({ where: { tenant_id: tenantId, status: { in: ['submitted', 'under_review', 'pending_acceptance_approval'] } } }),
        txClient.application.count({ where: { tenant_id: tenantId, status: 'accepted' } }),
      ]);

      return {
        activeStudents,
        totalStudents,
        applicants,
        activeStaff,
        totalStaff,
        activeClasses,
        pendingApprovals,
        activeAcademicYear,
        incompleteHouseholds,
        recentApplications,
        pendingApplications,
        acceptedApplications,
      };
    }) as {
      activeStudents: number;
      totalStudents: number;
      applicants: number;
      activeStaff: number;
      totalStaff: number;
      activeClasses: number;
      pendingApprovals: number;
      activeAcademicYear: { name: string } | null;
      incompleteHouseholds: { id: string; household_name: string }[];
      recentApplications: number;
      pendingApplications: number;
      acceptedApplications: number;
    };

    const greeting = buildGreeting(user.first_name);
    const summary = `${stats.activeStudents} active students · ${stats.activeStaff} staff · ${stats.activeClasses} classes`;

    return {
      greeting,
      summary,
      stats: {
        total_students: stats.totalStudents,
        active_students: stats.activeStudents,
        applicants: stats.applicants,
        total_staff: stats.totalStaff,
        active_staff: stats.activeStaff,
        total_classes: stats.activeClasses,
        active_academic_year_name: stats.activeAcademicYear?.name ?? null,
      },
      pending_approvals: stats.pendingApprovals,
      incomplete_households: stats.incompleteHouseholds,
      admissions: {
        recent_submissions: stats.recentApplications,
        pending_review: stats.pendingApplications,
        accepted: stats.acceptedApplications,
      },
      recent_activity: [],
    } as SchoolAdminDashboard & {
      greeting: string;
      summary: string;
      pending_approvals: number;
      incomplete_households: { id: string; household_name: string }[];
      admissions: { recent_submissions: number; pending_review: number; accepted: number };
    };
  }

  async parent(tenantId: string, userId: string): Promise<ParentDashboard & { greeting: string }> {
    // Load the user from the platform users table (no RLS)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const dashboardData = await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      // Find the parent record linked to this user_id in this tenant
      const parentRecord = await txClient.parent.findFirst({
        where: { tenant_id: tenantId, user_id: userId },
        select: { id: true },
      });

      if (!parentRecord) {
        return { students: [] };
      }

      // Load linked students via student_parents
      const studentLinks = await txClient.studentParent.findMany({
        where: { tenant_id: tenantId, parent_id: parentRecord.id },
        include: {
          student: {
            include: {
              year_group: { select: { name: true } },
              homeroom_class: { select: { name: true } },
            },
          },
        },
      });

      const students: ParentDashboardStudent[] = studentLinks.map((link) => ({
        student_id: link.student.id,
        first_name: link.student.first_name,
        last_name: link.student.last_name,
        student_number: link.student.student_number,
        status: link.student.status,
        year_group_name: link.student.year_group?.name ?? null,
        class_homeroom_name: link.student.homeroom_class?.name ?? null,
      }));

      return { students };
    }) as { students: ParentDashboardStudent[] };

    const greeting = buildGreeting(user.first_name);

    return {
      greeting,
      students: dashboardData.students,
      announcements: [],
    };
  }

  async teacher(tenantId: string, userId: string): Promise<TeacherDashboardData & { greeting: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const data = await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      // Find teacher's staff profile
      const staffProfile = await txClient.staffProfile.findFirst({
        where: { tenant_id: tenantId, user_id: userId },
        select: { id: true },
      });

      if (!staffProfile) {
        return {
          todays_schedule: [] as TimetableEntry[],
          todays_sessions: [] as TeacherDashboardData['todays_sessions'],
          pending_submissions: 0,
        };
      }

      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      // Convert JS day (0=Sun) to plan day (0=Mon)
      const jsDay = today.getDay();
      const planWeekday = jsDay === 0 ? 6 : jsDay - 1;

      // Get today's schedule entries
      const schedules = await txClient.schedule.findMany({
        where: {
          tenant_id: tenantId,
          teacher_staff_id: staffProfile.id,
          weekday: planWeekday,
          effective_start_date: { lte: todayDate },
          OR: [
            { effective_end_date: null },
            { effective_end_date: { gte: todayDate } },
          ],
        },
        include: {
          class_entity: { select: { name: true } },
          room: { select: { name: true } },
        },
        orderBy: { start_time: 'asc' },
      });

      const todaysSchedule: TimetableEntry[] = schedules.map((s) => ({
        schedule_id: s.id,
        weekday: s.weekday,
        start_time: s.start_time.toISOString().slice(11, 16),
        end_time: s.end_time.toISOString().slice(11, 16),
        class_id: s.class_id,
        class_name: s.class_entity.name,
        room_id: s.room_id ?? undefined,
        room_name: s.room?.name ?? undefined,
        teacher_staff_id: s.teacher_staff_id ?? undefined,
      }));

      // Get classes this teacher is assigned to
      const classAssignments = await txClient.classStaff.findMany({
        where: { tenant_id: tenantId, staff_profile_id: staffProfile.id },
        select: { class_id: true },
      });
      const assignedClassIds = classAssignments.map((ca) => ca.class_id);

      // Get today's attendance sessions for assigned classes
      const sessions = await txClient.attendanceSession.findMany({
        where: {
          tenant_id: tenantId,
          class_id: { in: assignedClassIds },
          session_date: todayDate,
        },
        include: {
          class_entity: { select: { name: true } },
          _count: { select: { records: true } },
        },
      });

      const todaysSessions = await Promise.all(
        sessions.map(async (s) => {
          const enrolledCount = await txClient.classEnrolment.count({
            where: { tenant_id: tenantId, class_id: s.class_id, status: 'active' },
          });
          return {
            session: {
              id: s.id,
              tenant_id: s.tenant_id,
              class_id: s.class_id,
              schedule_id: s.schedule_id,
              session_date: s.session_date.toISOString().slice(0, 10),
              status: s.status,
              override_reason: s.override_reason,
              submitted_by_user_id: s.submitted_by_user_id,
              submitted_at: s.submitted_at?.toISOString() ?? null,
              created_at: s.created_at.toISOString(),
              updated_at: s.updated_at.toISOString(),
            },
            class_name: s.class_entity.name,
            marked_count: s._count.records,
            enrolled_count: enrolledCount,
          };
        }),
      );

      const pendingSubmissions = sessions.filter((s) => s.status === 'open').length;

      return { todays_schedule: todaysSchedule, todays_sessions: todaysSessions, pending_submissions: pendingSubmissions };
    }) as TeacherDashboardData;

    const greeting = buildGreeting(user.first_name);

    return { greeting, ...data };
  }
}
