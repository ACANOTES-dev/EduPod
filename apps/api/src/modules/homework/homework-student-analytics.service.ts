import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import type { AnalyticsFilters } from './homework-analytics.helpers';
import { buildAssignmentWhere } from './homework-analytics.helpers';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkStudentAnalyticsService {
  private readonly logger = new Logger(HomeworkStudentAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

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
