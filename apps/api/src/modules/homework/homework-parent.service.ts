import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaginationQuery {
  page: number;
  pageSize: number;
}

interface StudentHomework {
  student: { id: string; first_name: string; last_name: string };
  assignments: Array<{
    id: string;
    title: string;
    description: string | null;
    homework_type: string;
    due_date: Date;
    due_time: Date | null;
    max_points: number | null;
    subject: { id: string; name: string } | null;
    class_entity: { id: string; name: string };
    completion: {
      status: string;
      completed_at: Date | null;
      points_awarded: number | null;
    } | null;
  }>;
}

@Injectable()
export class HomeworkParentService {
  private readonly logger = new Logger(HomeworkParentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public Methods ───────────────────────────────────────────────────────

  /** List all published homework for all linked children, with pagination. */
  async listAll(tenantId: string, userId: string, query: PaginationQuery) {
    const parent = await this.resolveParent(tenantId, userId);
    const studentIds = await this.getLinkedStudentIds(tenantId, parent.id);

    if (studentIds.length === 0) {
      return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
    }

    const classIds = await this.getActiveClassIds(tenantId, studentIds);

    if (classIds.length === 0) {
      return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
    }

    const where = {
      tenant_id: tenantId,
      class_id: { in: classIds },
      status: 'published' as const,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [assignments, total] = await Promise.all([
      this.prisma.homeworkAssignment.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { due_date: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          homework_type: true,
          due_date: true,
          due_time: true,
          max_points: true,
          subject: { select: { id: true, name: true } },
          class_entity: { select: { id: true, name: true } },
          completions: {
            where: { student_id: { in: studentIds } },
            select: {
              student_id: true,
              status: true,
              completed_at: true,
              points_awarded: true,
            },
          },
        },
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);

    // Group by student with per-student class scoping
    const students = await this.getStudentNames(tenantId, studentIds);
    const studentClassMap = await this.getStudentClassMap(tenantId, studentIds);
    const grouped = this.groupByStudent(students, assignments, studentClassMap);

    return {
      data: grouped,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** List today's published homework for all linked children. */
  async listToday(tenantId: string, userId: string) {
    const parent = await this.resolveParent(tenantId, userId);
    const studentIds = await this.getLinkedStudentIds(tenantId, parent.id);

    if (studentIds.length === 0) {
      return { data: [] };
    }

    const classIds = await this.getActiveClassIds(tenantId, studentIds);

    if (classIds.length === 0) {
      return { data: [] };
    }

    const today = this.todayDate();

    const assignments = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'published',
        due_date: today,
      },
      orderBy: { due_time: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        homework_type: true,
        due_date: true,
        due_time: true,
        max_points: true,
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
        completions: {
          where: { student_id: { in: studentIds } },
          select: {
            student_id: true,
            status: true,
            completed_at: true,
            points_awarded: true,
          },
        },
      },
    });

    const students = await this.getStudentNames(tenantId, studentIds);
    const studentClassMap = await this.getStudentClassMap(tenantId, studentIds);
    const grouped = this.groupByStudent(students, assignments, studentClassMap);

    return { data: grouped };
  }

  /** List overdue homework across all linked children. */
  async listOverdue(tenantId: string, userId: string) {
    const parent = await this.resolveParent(tenantId, userId);
    const studentIds = await this.getLinkedStudentIds(tenantId, parent.id);

    if (studentIds.length === 0) {
      return { data: [] };
    }

    const classIds = await this.getActiveClassIds(tenantId, studentIds);

    if (classIds.length === 0) {
      return { data: [] };
    }

    const today = this.todayDate();

    // Fetch published assignments past due date
    const assignments = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'published',
        due_date: { lt: today },
      },
      orderBy: { due_date: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        homework_type: true,
        due_date: true,
        due_time: true,
        max_points: true,
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
        completions: {
          where: { student_id: { in: studentIds } },
          select: {
            student_id: true,
            status: true,
            completed_at: true,
            points_awarded: true,
          },
        },
      },
    });

    // Filter to only assignments where at least one linked student has NOT completed
    const students = await this.getStudentNames(tenantId, studentIds);
    const studentClassMap = await this.getStudentClassMap(tenantId, studentIds);

    const overdueByStudent: StudentHomework[] = [];

    for (const student of students) {
      const studentClassIds = studentClassMap.get(student.id) ?? [];
      const overdueAssignments = assignments
        .filter((a) => studentClassIds.includes(a.class_entity.id))
        .filter((a) => {
          const completion = a.completions.find((c) => c.student_id === student.id);
          return !completion || completion.status !== 'completed';
        })
        .map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          homework_type: a.homework_type,
          due_date: a.due_date,
          due_time: a.due_time,
          max_points: a.max_points,
          subject: a.subject,
          class_entity: a.class_entity,
          completion: a.completions.find((c) => c.student_id === student.id) ?? null,
        }));

      if (overdueAssignments.length > 0) {
        overdueByStudent.push({
          student: { id: student.id, first_name: student.first_name, last_name: student.last_name },
          assignments: overdueAssignments,
        });
      }
    }

    return { data: overdueByStudent };
  }

  /** List homework for the current week (Mon-Sun) for all linked children, grouped by day. */
  async listWeek(tenantId: string, userId: string) {
    const parent = await this.resolveParent(tenantId, userId);
    const studentIds = await this.getLinkedStudentIds(tenantId, parent.id);

    if (studentIds.length === 0) {
      return { data: [] };
    }

    const classIds = await this.getActiveClassIds(tenantId, studentIds);

    if (classIds.length === 0) {
      return { data: [] };
    }

    const { weekStart, weekEnd } = this.currentWeekRange();

    const assignments = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'published',
        due_date: { gte: weekStart, lte: weekEnd },
      },
      orderBy: [{ due_date: 'asc' }, { due_time: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        homework_type: true,
        due_date: true,
        due_time: true,
        max_points: true,
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
        completions: {
          where: { student_id: { in: studentIds } },
          select: {
            student_id: true,
            status: true,
            completed_at: true,
            points_awarded: true,
          },
        },
      },
    });

    const students = await this.getStudentNames(tenantId, studentIds);
    const studentClassMap = await this.getStudentClassMap(tenantId, studentIds);

    // Group by day string (YYYY-MM-DD)
    const dayMap = new Map<string, { date: string; students: StudentHomework[] }>();

    for (const assignment of assignments) {
      const dayKey = assignment.due_date.toISOString().slice(0, 10);

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { date: dayKey, students: [] });
      }

      const dayEntry = dayMap.get(dayKey)!;

      for (const student of students) {
        const studentClassIds = studentClassMap.get(student.id) ?? [];

        if (!studentClassIds.includes(assignment.class_entity.id)) {
          continue;
        }

        let studentEntry = dayEntry.students.find((s) => s.student.id === student.id);
        if (!studentEntry) {
          studentEntry = {
            student: { id: student.id, first_name: student.first_name, last_name: student.last_name },
            assignments: [],
          };
          dayEntry.students.push(studentEntry);
        }

        studentEntry.assignments.push({
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          homework_type: assignment.homework_type,
          due_date: assignment.due_date,
          due_time: assignment.due_time,
          max_points: assignment.max_points,
          subject: assignment.subject,
          class_entity: assignment.class_entity,
          completion: assignment.completions.find((c) => c.student_id === student.id) ?? null,
        });
      }
    }

    return { data: Array.from(dayMap.values()) };
  }

  /** Summary stats for a specific linked student. */
  async studentSummary(tenantId: string, userId: string, studentId: string) {
    const parent = await this.resolveParent(tenantId, userId);
    await this.validateStudentAccess(tenantId, parent.id, studentId);

    const classIds = await this.getActiveClassIds(tenantId, [studentId]);

    if (classIds.length === 0) {
      return {
        data: {
          total_assigned: 0,
          completed: 0,
          in_progress: 0,
          overdue: 0,
          completion_rate: 0,
          recent: [],
        },
      };
    }

    const today = this.todayDate();

    // Get all published assignments for the student's classes
    const assignments = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'published',
      },
      select: {
        id: true,
        title: true,
        description: true,
        homework_type: true,
        due_date: true,
        due_time: true,
        max_points: true,
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
        completions: {
          where: { student_id: studentId },
          select: {
            status: true,
            completed_at: true,
            points_awarded: true,
          },
        },
      },
      orderBy: { due_date: 'desc' },
    });

    let completed = 0;
    let inProgress = 0;
    let overdue = 0;

    for (const assignment of assignments) {
      const completion = assignment.completions[0];
      if (completion?.status === 'completed') {
        completed++;
      } else if (completion?.status === 'in_progress') {
        inProgress++;
      } else if (assignment.due_date < today) {
        overdue++;
      }
    }

    const totalAssigned = assignments.length;
    const completionRate = totalAssigned > 0
      ? Math.round((completed / totalAssigned) * 100)
      : 0;

    // Recent 10 assignments
    const recent = assignments.slice(0, 10).map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      homework_type: a.homework_type,
      due_date: a.due_date,
      due_time: a.due_time,
      max_points: a.max_points,
      subject: a.subject,
      class_entity: a.class_entity,
      completion: a.completions[0]
        ? {
            status: a.completions[0].status,
            completed_at: a.completions[0].completed_at,
            points_awarded: a.completions[0].points_awarded,
          }
        : null,
    }));

    return {
      data: {
        total_assigned: totalAssigned,
        completed,
        in_progress: inProgress,
        overdue,
        completion_rate: completionRate,
        recent,
      },
    };
  }

  /** Diary parent notes for a specific linked student with pagination. */
  async studentDiary(
    tenantId: string,
    userId: string,
    studentId: string,
    query: PaginationQuery,
  ) {
    const parent = await this.resolveParent(tenantId, userId);
    await this.validateStudentAccess(tenantId, parent.id, studentId);

    const skip = (query.page - 1) * query.pageSize;

    const where = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    const [notes, total] = await Promise.all([
      this.prisma.diaryParentNote.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { note_date: 'desc' },
        select: {
          id: true,
          note_date: true,
          content: true,
          acknowledged: true,
          acknowledged_at: true,
          created_at: true,
          author: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.diaryParentNote.count({ where }),
    ]);

    return {
      data: notes,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async resolveParent(tenantId: string, userId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent record linked to your account',
      });
    }

    return parent;
  }

  private async getLinkedStudentIds(tenantId: string, parentId: string): Promise<string[]> {
    const links = await this.prisma.studentParent.findMany({
      where: { tenant_id: tenantId, parent_id: parentId },
      select: { student_id: true },
    });
    return links.map((l) => l.student_id);
  }

  private async validateStudentAccess(tenantId: string, parentId: string, studentId: string) {
    const link = await this.prisma.studentParent.findFirst({
      where: { tenant_id: tenantId, parent_id: parentId, student_id: studentId },
    });

    if (!link) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_LINKED',
        message: 'Student is not linked to your account',
      });
    }
  }

  private async getActiveClassIds(tenantId: string, studentIds: string[]): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        status: 'active',
      },
      select: { class_id: true },
    });

    return [...new Set(enrolments.map((e) => e.class_id))];
  }

  /** Returns a map of studentId -> array of active classIds */
  private async getStudentClassMap(
    tenantId: string,
    studentIds: string[],
  ): Promise<Map<string, string[]>> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        status: 'active',
      },
      select: { student_id: true, class_id: true },
    });

    const map = new Map<string, string[]>();
    for (const e of enrolments) {
      const existing = map.get(e.student_id) ?? [];
      existing.push(e.class_id);
      map.set(e.student_id, existing);
    }
    return map;
  }

  private async getStudentNames(
    tenantId: string,
    studentIds: string[],
  ): Promise<Array<{ id: string; first_name: string; last_name: string }>> {
    return this.prisma.student.findMany({
      where: { tenant_id: tenantId, id: { in: studentIds } },
      select: { id: true, first_name: true, last_name: true },
    });
  }

  /** Group assignments by which student is enrolled in the assignment's class. */
  private groupByStudent(
    students: Array<{ id: string; first_name: string; last_name: string }>,
    assignments: Array<{
      id: string;
      title: string;
      description: string | null;
      homework_type: string;
      due_date: Date;
      due_time: Date | null;
      max_points: number | null;
      subject: { id: string; name: string } | null;
      class_entity: { id: string; name: string };
      completions: Array<{
        student_id: string;
        status: string;
        completed_at: Date | null;
        points_awarded: number | null;
      }>;
    }>,
    studentClassMap: Map<string, string[]>,
  ): StudentHomework[] {
    return students.map((student) => {
      const studentClassIds = studentClassMap.get(student.id) ?? [];

      return {
        student: { id: student.id, first_name: student.first_name, last_name: student.last_name },
        assignments: assignments
          .filter((a) => studentClassIds.includes(a.class_entity.id))
          .map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            homework_type: a.homework_type,
            due_date: a.due_date,
            due_time: a.due_time,
            max_points: a.max_points,
            subject: a.subject,
            class_entity: a.class_entity,
            completion: a.completions.find((c) => c.student_id === student.id) ?? null,
          })),
      };
    });
  }

  /** Get today as a UTC Date with time zeroed out. */
  private todayDate(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  /** Get the current week range (Monday to Sunday). */
  private currentWeekRange(): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + diffToMonday,
    ));

    const sunday = new Date(Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate() + 6,
    ));

    return { weekStart: monday, weekEnd: sunday };
  }
}
