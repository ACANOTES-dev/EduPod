import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import type { AnalyticsFilters } from './homework-analytics.helpers';
import { buildAssignmentWhere } from './homework-analytics.helpers';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkCompletionAnalyticsService {
  private readonly logger = new Logger(HomeworkCompletionAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
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
}
