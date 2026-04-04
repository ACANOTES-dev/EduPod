import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

// ─── Filter Types ────────────────────────────────────────────────────────────

interface AnalyticsFilters {
  academic_year_id?: string;
  academic_period_id?: string;
  date_from?: string;
  date_to?: string;
}

interface LoadFilters extends AnalyticsFilters {
  class_id?: string;
}

// ─── Helper: Build base where clause from filters ────────────────────────────

function buildAssignmentWhere(
  tenantId: string,
  filters: AnalyticsFilters,
): Prisma.HomeworkAssignmentWhereInput {
  const where: Prisma.HomeworkAssignmentWhereInput = {
    tenant_id: tenantId,
    status: 'published',
  };

  if (filters.academic_year_id) {
    where.academic_year_id = filters.academic_year_id;
  }
  if (filters.academic_period_id) {
    where.academic_period_id = filters.academic_period_id;
  }
  if (filters.date_from || filters.date_to) {
    where.due_date = {};
    if (filters.date_from) {
      where.due_date.gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      where.due_date.lte = new Date(filters.date_to);
    }
  }

  return where;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkAnalyticsService {
  private readonly logger = new Logger(HomeworkAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Completion Rates ────────────────────────────────────────────────────────

  /** Per-class (and optionally per-subject) completion rates. */
  async completionRates(tenantId: string, filters: AnalyticsFilters) {
    try {
      const where = buildAssignmentWhere(tenantId, filters);

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          class_id: true,
          subject_id: true,
          class_entity: { select: { name: true } },
          subject: { select: { name: true } },
          completions: {
            select: { status: true },
          },
        },
      });

      // Group by class_id + subject_id
      const groupMap = new Map<
        string,
        {
          class_id: string;
          class_name: string;
          subject_id: string | null;
          subject_name: string | null;
          total_assignments: number;
          total_completions: number;
          total_possible: number;
        }
      >();

      for (const a of assignments) {
        const key = `${a.class_id}::${a.subject_id ?? 'none'}`;
        let group = groupMap.get(key);
        if (!group) {
          group = {
            class_id: a.class_id,
            class_name: a.class_entity.name,
            subject_id: a.subject_id,
            subject_name: a.subject?.name ?? null,
            total_assignments: 0,
            total_completions: 0,
            total_possible: 0,
          };
          groupMap.set(key, group);
        }

        group.total_assignments += 1;
        const completed = a.completions.filter((c) => c.status === 'completed').length;
        group.total_completions += completed;
        group.total_possible += a.completions.length;
      }

      return Array.from(groupMap.values()).map((g) => ({
        class_id: g.class_id,
        class_name: g.class_name,
        subject_id: g.subject_id,
        subject_name: g.subject_name,
        total_assignments: g.total_assignments,
        avg_completion_rate:
          g.total_possible > 0
            ? Math.round((g.total_completions / g.total_possible) * 10000) / 100
            : 0,
      }));
    } catch (err) {
      this.logger.error('[completionRates] Failed to compute', err);
      throw err;
    }
  }

  // ─── Student Trends ──────────────────────────────────────────────────────────

  /** Individual student homework trends with per-subject breakdown. */
  async studentTrends(tenantId: string, studentId: string, filters: AnalyticsFilters) {
    try {
      // Find classes the student is actively enrolled in
      const classIds = await this.classesReadFacade.findClassIdsForStudent(tenantId, studentId);
      if (classIds.length === 0) {
        return {
          student_id: studentId,
          overall: {
            total_assigned: 0,
            total_completed: 0,
            completion_rate: 0,
            avg_points_awarded: null,
          },
          by_subject: [],
          trend: { current_period: 0, previous_period: 0 },
        };
      }

      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = {
        ...baseWhere,
        class_id: { in: classIds },
      };

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          subject_id: true,
          due_date: true,
          subject: { select: { name: true } },
          completions: {
            where: { student_id: studentId },
            select: { status: true, points_awarded: true },
          },
        },
        orderBy: { due_date: 'asc' },
      });

      // Overall stats
      let totalAssigned = 0;
      let totalCompleted = 0;
      const pointsList: number[] = [];

      // Per-subject breakdown
      const subjectMap = new Map<
        string,
        {
          subject_id: string | null;
          subject_name: string | null;
          total_assigned: number;
          total_completed: number;
          points: number[];
        }
      >();

      // Trend buckets: last 30 days vs previous 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
      let currentPeriodAssigned = 0;
      let currentPeriodCompleted = 0;
      let previousPeriodAssigned = 0;
      let previousPeriodCompleted = 0;

      for (const a of assignments) {
        totalAssigned += 1;
        const completion = a.completions[0];
        const isCompleted = completion?.status === 'completed';
        if (isCompleted) {
          totalCompleted += 1;
        }
        if (completion?.points_awarded != null) {
          pointsList.push(completion.points_awarded);
        }

        // Subject grouping
        const subKey = a.subject_id ?? 'none';
        let subGroup = subjectMap.get(subKey);
        if (!subGroup) {
          subGroup = {
            subject_id: a.subject_id,
            subject_name: a.subject?.name ?? null,
            total_assigned: 0,
            total_completed: 0,
            points: [],
          };
          subjectMap.set(subKey, subGroup);
        }
        subGroup.total_assigned += 1;
        if (isCompleted) subGroup.total_completed += 1;
        if (completion?.points_awarded != null) {
          subGroup.points.push(completion.points_awarded);
        }

        // Trend buckets
        const dueDate = new Date(a.due_date);
        if (dueDate >= thirtyDaysAgo && dueDate <= now) {
          currentPeriodAssigned += 1;
          if (isCompleted) currentPeriodCompleted += 1;
        } else if (dueDate >= sixtyDaysAgo && dueDate < thirtyDaysAgo) {
          previousPeriodAssigned += 1;
          if (isCompleted) previousPeriodCompleted += 1;
        }
      }

      const avgPoints =
        pointsList.length > 0
          ? Math.round((pointsList.reduce((s, v) => s + v, 0) / pointsList.length) * 100) / 100
          : null;

      return {
        student_id: studentId,
        overall: {
          total_assigned: totalAssigned,
          total_completed: totalCompleted,
          completion_rate:
            totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 10000) / 100 : 0,
          avg_points_awarded: avgPoints,
        },
        by_subject: Array.from(subjectMap.values()).map((s) => ({
          subject_id: s.subject_id,
          subject_name: s.subject_name,
          total_assigned: s.total_assigned,
          total_completed: s.total_completed,
          completion_rate:
            s.total_assigned > 0
              ? Math.round((s.total_completed / s.total_assigned) * 10000) / 100
              : 0,
          avg_points:
            s.points.length > 0
              ? Math.round((s.points.reduce((a, b) => a + b, 0) / s.points.length) * 100) / 100
              : null,
        })),
        trend: {
          current_period:
            currentPeriodAssigned > 0
              ? Math.round((currentPeriodCompleted / currentPeriodAssigned) * 10000) / 100
              : 0,
          previous_period:
            previousPeriodAssigned > 0
              ? Math.round((previousPeriodCompleted / previousPeriodAssigned) * 10000) / 100
              : 0,
        },
      };
    } catch (err) {
      this.logger.error('[studentTrends] Failed to compute', err);
      throw err;
    }
  }

  // ─── Class Patterns ──────────────────────────────────────────────────────────

  /** Homework volume, completion rates, type breakdown and student rankings for a class. */
  async classPatterns(tenantId: string, classId: string, filters: AnalyticsFilters) {
    try {
      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = {
        ...baseWhere,
        class_id: classId,
      };

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          homework_type: true,
          due_date: true,
          completions: {
            select: {
              student_id: true,
              status: true,
            },
          },
        },
        orderBy: { due_date: 'asc' },
      });

      const assignmentsCount = assignments.length;

      // Overall completion rate
      let totalCompletions = 0;
      let totalPossible = 0;

      // By type
      const typeMap = new Map<
        string,
        { type: string; count: number; completed: number; possible: number }
      >();

      // Per student
      const studentMap = new Map<
        string,
        { student_id: string; assigned: number; completed: number }
      >();

      for (const a of assignments) {
        const completedCount = a.completions.filter((c) => c.status === 'completed').length;
        totalCompletions += completedCount;
        totalPossible += a.completions.length;

        // By type
        const typeKey = a.homework_type;
        let typeGroup = typeMap.get(typeKey);
        if (!typeGroup) {
          typeGroup = { type: typeKey, count: 0, completed: 0, possible: 0 };
          typeMap.set(typeKey, typeGroup);
        }
        typeGroup.count += 1;
        typeGroup.completed += completedCount;
        typeGroup.possible += a.completions.length;

        // Per student
        for (const c of a.completions) {
          let student = studentMap.get(c.student_id);
          if (!student) {
            student = {
              student_id: c.student_id,
              assigned: 0,
              completed: 0,
            };
            studentMap.set(c.student_id, student);
          }
          student.assigned += 1;
          if (c.status === 'completed') student.completed += 1;
        }
      }

      // Sort students by completion rate
      const studentRankings = Array.from(studentMap.values())
        .map((s) => ({
          student_id: s.student_id,
          assigned: s.assigned,
          completed: s.completed,
          completion_rate:
            s.assigned > 0 ? Math.round((s.completed / s.assigned) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.completion_rate - a.completion_rate);

      const topStudents = studentRankings.slice(0, 5);
      const strugglingStudents = studentRankings
        .slice()
        .sort((a, b) => a.completion_rate - b.completion_rate)
        .slice(0, 5);

      return {
        class_id: classId,
        assignments_count: assignmentsCount,
        avg_completion_rate:
          totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 10000) / 100 : 0,
        by_type: Array.from(typeMap.values()).map((t) => ({
          type: t.type,
          count: t.count,
          completion_rate:
            t.possible > 0 ? Math.round((t.completed / t.possible) * 10000) / 100 : 0,
        })),
        top_students: topStudents,
        struggling_students: strugglingStudents,
      };
    } catch (err) {
      this.logger.error('[classPatterns] Failed to compute', err);
      throw err;
    }
  }

  // ─── Load Analysis ─────────────────────────────────────────────────────────

  /** Cross-subject load analysis per class per week. */
  async loadAnalysis(tenantId: string, filters: LoadFilters) {
    try {
      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = { ...baseWhere };
      if (filters.class_id) {
        where.class_id = filters.class_id;
      }

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          class_id: true,
          subject_id: true,
          due_date: true,
          class_entity: { select: { name: true } },
          subject: { select: { name: true } },
        },
        orderBy: { due_date: 'asc' },
      });

      // Group by class, calculate weekly averages and subject breakdown
      const classMap = new Map<
        string,
        {
          class_id: string;
          class_name: string;
          weeks: Set<string>;
          total: number;
          subjects: Map<
            string,
            { subject_id: string | null; subject_name: string | null; count: number }
          >;
        }
      >();

      for (const a of assignments) {
        let group = classMap.get(a.class_id);
        if (!group) {
          group = {
            class_id: a.class_id,
            class_name: a.class_entity.name,
            weeks: new Set<string>(),
            total: 0,
            subjects: new Map(),
          };
          classMap.set(a.class_id, group);
        }

        group.total += 1;

        // Week key (ISO week start — Monday)
        const d = new Date(a.due_date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d);
        weekStart.setDate(diff);
        group.weeks.add(weekStart.toISOString().slice(0, 10));

        // Subject breakdown
        const subKey = a.subject_id ?? 'none';
        let sub = group.subjects.get(subKey);
        if (!sub) {
          sub = {
            subject_id: a.subject_id,
            subject_name: a.subject?.name ?? null,
            count: 0,
          };
          group.subjects.set(subKey, sub);
        }
        sub.count += 1;
      }

      return {
        by_class: Array.from(classMap.values()).map((g) => ({
          class_id: g.class_id,
          class_name: g.class_name,
          total_assignments: g.total,
          weekly_avg: g.weeks.size > 0 ? Math.round((g.total / g.weeks.size) * 100) / 100 : 0,
          subject_breakdown: Array.from(g.subjects.values()),
        })),
      };
    } catch (err) {
      this.logger.error('[loadAnalysis] Failed to compute', err);
      throw err;
    }
  }

  // ─── Daily Load Heatmap ────────────────────────────────────────────────────

  /** Assignment counts by date and day of week for heatmap rendering. */
  async dailyLoadHeatmap(tenantId: string, filters: AnalyticsFilters) {
    try {
      const where = buildAssignmentWhere(tenantId, filters);

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: { due_date: true },
        orderBy: { due_date: 'asc' },
      });

      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];

      // Count per date
      const dateMap = new Map<string, number>();
      for (const a of assignments) {
        const dateStr = new Date(a.due_date).toISOString().slice(0, 10);
        dateMap.set(dateStr, (dateMap.get(dateStr) ?? 0) + 1);
      }

      return Array.from(dateMap.entries()).map(([date, count]) => ({
        date,
        day_of_week: dayNames[new Date(date).getDay()],
        count,
      }));
    } catch (err) {
      this.logger.error('[dailyLoadHeatmap] Failed to compute', err);
      throw err;
    }
  }

  // ─── Non-Completers ───────────────────────────────────────────────────────

  /** Students with completion rate below 50% across 3+ assignments. */
  async nonCompleters(tenantId: string, filters: AnalyticsFilters) {
    try {
      const where = buildAssignmentWhere(tenantId, filters);

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          class_id: true,
          class_entity: { select: { name: true } },
          completions: {
            select: {
              student_id: true,
              status: true,
            },
          },
        },
      });

      // Aggregate per student
      const studentMap = new Map<
        string,
        {
          student_id: string;
          total_assigned: number;
          total_completed: number;
          classes: Map<string, { class_id: string; class_name: string; count: number }>;
        }
      >();

      for (const a of assignments) {
        for (const c of a.completions) {
          let student = studentMap.get(c.student_id);
          if (!student) {
            student = {
              student_id: c.student_id,
              total_assigned: 0,
              total_completed: 0,
              classes: new Map(),
            };
            studentMap.set(c.student_id, student);
          }

          student.total_assigned += 1;
          if (c.status === 'completed') student.total_completed += 1;

          let cls = student.classes.get(a.class_id);
          if (!cls) {
            cls = {
              class_id: a.class_id,
              class_name: a.class_entity.name,
              count: 0,
            };
            student.classes.set(a.class_id, cls);
          }
          cls.count += 1;
        }
      }

      // Filter: min 3 assignments, rate < 50%
      const struggling = Array.from(studentMap.values())
        .filter((s) => s.total_assigned >= 3 && s.total_completed / s.total_assigned < 0.5)
        .sort(
          (a, b) => a.total_completed / a.total_assigned - b.total_completed / b.total_assigned,
        );

      // Enrich with student names
      const studentIds = struggling.map((s) => s.student_id);

      const studentRecords =
        studentIds.length > 0 ? await this.studentReadFacade.findByIds(tenantId, studentIds) : [];

      const nameMap = new Map(
        studentRecords.map((s) => [s.id, { first_name: s.first_name, last_name: s.last_name }]),
      );

      return {
        students: struggling.map((s) => {
          const names = nameMap.get(s.student_id);
          const rate =
            s.total_assigned > 0
              ? Math.round((s.total_completed / s.total_assigned) * 10000) / 100
              : 0;
          return {
            student_id: s.student_id,
            first_name: names?.first_name ?? '',
            last_name: names?.last_name ?? '',
            total_assigned: s.total_assigned,
            total_completed: s.total_completed,
            rate,
            classes: Array.from(s.classes.values()),
          };
        }),
      };
    } catch (err) {
      this.logger.error('[nonCompleters] Failed to compute', err);
      throw err;
    }
  }

  // ─── Subject Trends ────────────────────────────────────────────────────────

  /** Cross-class analytics for a single subject. */
  async subjectTrends(tenantId: string, subjectId: string, filters: AnalyticsFilters) {
    try {
      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = {
        ...baseWhere,
        subject_id: subjectId,
      };

      const [subject, assignments] = await Promise.all([
        this.academicReadFacade.findSubjectById(tenantId, subjectId),
        this.prisma.homeworkAssignment.findMany({
          where,
          select: {
            id: true,
            class_id: true,
            homework_type: true,
            class_entity: { select: { name: true } },
            completions: {
              select: { status: true },
            },
          },
        }),
      ]);

      let totalCompletions = 0;
      let totalPossible = 0;

      // Per class
      const classMap = new Map<
        string,
        {
          class_id: string;
          class_name: string;
          count: number;
          completed: number;
          possible: number;
        }
      >();

      // Per type
      const typeMap = new Map<
        string,
        { type: string; count: number; completed: number; possible: number }
      >();

      for (const a of assignments) {
        const completed = a.completions.filter((c) => c.status === 'completed').length;
        totalCompletions += completed;
        totalPossible += a.completions.length;

        // Per class
        let cls = classMap.get(a.class_id);
        if (!cls) {
          cls = {
            class_id: a.class_id,
            class_name: a.class_entity.name,
            count: 0,
            completed: 0,
            possible: 0,
          };
          classMap.set(a.class_id, cls);
        }
        cls.count += 1;
        cls.completed += completed;
        cls.possible += a.completions.length;

        // Per type
        const typeKey = a.homework_type;
        let typeGroup = typeMap.get(typeKey);
        if (!typeGroup) {
          typeGroup = { type: typeKey, count: 0, completed: 0, possible: 0 };
          typeMap.set(typeKey, typeGroup);
        }
        typeGroup.count += 1;
        typeGroup.completed += completed;
        typeGroup.possible += a.completions.length;
      }

      return {
        subject_id: subjectId,
        subject_name: subject?.name ?? null,
        total_assignments: assignments.length,
        avg_completion_rate:
          totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 10000) / 100 : 0,
        by_class: Array.from(classMap.values()).map((c) => ({
          class_id: c.class_id,
          class_name: c.class_name,
          assignments_count: c.count,
          completion_rate:
            c.possible > 0 ? Math.round((c.completed / c.possible) * 10000) / 100 : 0,
        })),
        by_type: Array.from(typeMap.values()).map((t) => ({
          type: t.type,
          count: t.count,
          completion_rate:
            t.possible > 0 ? Math.round((t.completed / t.possible) * 10000) / 100 : 0,
        })),
      };
    } catch (err) {
      this.logger.error('[subjectTrends] Failed to compute', err);
      throw err;
    }
  }

  // ─── Teacher Patterns ──────────────────────────────────────────────────────

  /** Homework setting patterns for a specific teacher. */
  async teacherPatterns(tenantId: string, staffId: string, filters: AnalyticsFilters) {
    try {
      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = {
        ...baseWhere,
        assigned_by_user_id: staffId,
      };

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          homework_type: true,
          due_date: true,
          completions: {
            select: { status: true },
          },
        },
        orderBy: { due_date: 'asc' },
      });

      let totalCompletions = 0;
      let totalPossible = 0;

      // By type
      const typeMap = new Map<string, { type: string; count: number }>();

      // Monthly trend
      const monthMap = new Map<
        string,
        { month: string; set: number; completed: number; possible: number }
      >();

      for (const a of assignments) {
        const completed = a.completions.filter((c) => c.status === 'completed').length;
        totalCompletions += completed;
        totalPossible += a.completions.length;

        // Type
        const typeKey = a.homework_type;
        let typeGroup = typeMap.get(typeKey);
        if (!typeGroup) {
          typeGroup = { type: typeKey, count: 0 };
          typeMap.set(typeKey, typeGroup);
        }
        typeGroup.count += 1;

        // Monthly trend
        const monthKey = new Date(a.due_date).toISOString().slice(0, 7);
        let monthGroup = monthMap.get(monthKey);
        if (!monthGroup) {
          monthGroup = { month: monthKey, set: 0, completed: 0, possible: 0 };
          monthMap.set(monthKey, monthGroup);
        }
        monthGroup.set += 1;
        monthGroup.completed += completed;
        monthGroup.possible += a.completions.length;
      }

      return {
        staff_id: staffId,
        total_set: assignments.length,
        by_type: Array.from(typeMap.values()),
        avg_completion_rate:
          totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 10000) / 100 : 0,
        trend: Array.from(monthMap.values()).map((m) => ({
          month: m.month,
          assignments_set: m.set,
          completion_rate:
            m.possible > 0 ? Math.round((m.completed / m.possible) * 10000) / 100 : 0,
        })),
      };
    } catch (err) {
      this.logger.error('[teacherPatterns] Failed to compute', err);
      throw err;
    }
  }

  // ─── Year Group Overview ───────────────────────────────────────────────────

  /** Aggregate homework analytics across all classes in a year group. */
  async yearGroupOverview(tenantId: string, yearGroupId: string, filters: AnalyticsFilters) {
    try {
      // Find all classes in this year group
      const classes = await this.classesReadFacade.findByYearGroup(tenantId, yearGroupId);

      const classIds = classes.map((c) => c.id);
      if (classIds.length === 0) {
        return {
          year_group_id: yearGroupId,
          classes: [],
          total_assignments: 0,
          avg_completion_rate: 0,
        };
      }

      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = {
        ...baseWhere,
        class_id: { in: classIds },
      };

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          class_id: true,
          completions: {
            select: { status: true },
          },
        },
      });

      // Per class aggregation
      const classStatsMap = new Map<
        string,
        { count: number; completed: number; possible: number }
      >();

      let totalCompleted = 0;
      let totalPossible = 0;

      for (const a of assignments) {
        let stats = classStatsMap.get(a.class_id);
        if (!stats) {
          stats = { count: 0, completed: 0, possible: 0 };
          classStatsMap.set(a.class_id, stats);
        }
        stats.count += 1;
        const completed = a.completions.filter((c) => c.status === 'completed').length;
        stats.completed += completed;
        stats.possible += a.completions.length;
        totalCompleted += completed;
        totalPossible += a.completions.length;
      }

      const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

      return {
        year_group_id: yearGroupId,
        classes: Array.from(classStatsMap.entries()).map(([classId, stats]) => ({
          class_id: classId,
          class_name: classNameMap.get(classId) ?? '',
          assignments_count: stats.count,
          completion_rate:
            stats.possible > 0 ? Math.round((stats.completed / stats.possible) * 10000) / 100 : 0,
        })),
        total_assignments: assignments.length,
        avg_completion_rate:
          totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 10000) / 100 : 0,
      };
    } catch (err) {
      this.logger.error('[yearGroupOverview] Failed to compute', err);
      throw err;
    }
  }

  // ─── Correlation Analysis ──────────────────────────────────────────────────

  /** Students grouped by completion rate buckets with average points. */
  async correlationAnalysis(tenantId: string, filters: AnalyticsFilters) {
    try {
      const where = buildAssignmentWhere(tenantId, filters);

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          completions: {
            select: {
              student_id: true,
              status: true,
              points_awarded: true,
            },
          },
        },
      });

      // Aggregate per student
      const studentMap = new Map<
        string,
        {
          total: number;
          completed: number;
          points: number[];
        }
      >();

      for (const a of assignments) {
        for (const c of a.completions) {
          let student = studentMap.get(c.student_id);
          if (!student) {
            student = { total: 0, completed: 0, points: [] };
            studentMap.set(c.student_id, student);
          }
          student.total += 1;
          if (c.status === 'completed') student.completed += 1;
          if (c.points_awarded != null) {
            student.points.push(c.points_awarded);
          }
        }
      }

      // Bucket definitions
      const buckets = [
        { label: '0-25%', min: 0, max: 25, students: 0, pointsSum: 0, pointsCount: 0 },
        { label: '25-50%', min: 25, max: 50, students: 0, pointsSum: 0, pointsCount: 0 },
        { label: '50-75%', min: 50, max: 75, students: 0, pointsSum: 0, pointsCount: 0 },
        { label: '75-100%', min: 75, max: 101, students: 0, pointsSum: 0, pointsCount: 0 },
      ];

      for (const s of studentMap.values()) {
        const rate = s.total > 0 ? (s.completed / s.total) * 100 : 0;
        const avgPts =
          s.points.length > 0 ? s.points.reduce((a, b) => a + b, 0) / s.points.length : 0;

        for (const bucket of buckets) {
          if (rate >= bucket.min && rate < bucket.max) {
            bucket.students += 1;
            if (s.points.length > 0) {
              bucket.pointsSum += avgPts;
              bucket.pointsCount += 1;
            }
            break;
          }
        }
      }

      return {
        buckets: buckets.map((b) => ({
          range: b.label,
          student_count: b.students,
          avg_points:
            b.pointsCount > 0 ? Math.round((b.pointsSum / b.pointsCount) * 100) / 100 : null,
        })),
      };
    } catch (err) {
      this.logger.error('[correlationAnalysis] Failed to compute', err);
      throw err;
    }
  }
}
