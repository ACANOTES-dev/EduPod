import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface MatrixCell {
  class_id: string;
  subject_id: string;
  config_id: string;
}

export interface MatrixData {
  classes: Array<{
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
    academic_year: { id: string; name: string } | null;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string | null;
  }>;
  assignments: MatrixCell[];
}

export interface ExamCurriculumPair {
  year_group_id: string;
  year_group_name: string;
  subject_id: string;
  subject_name: string;
  student_count: number;
}

@Injectable()
export class CurriculumMatrixService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatrix(tenantId: string, academicYearId?: string): Promise<MatrixData> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get all homeroom classes (these are the ones on the X-axis)
      const classWhere: Record<string, unknown> = {
        tenant_id: tenantId,
        subject_id: null, // homeroom only
        status: 'active',
      };
      if (academicYearId) {
        classWhere.academic_year_id = academicYearId;
      }

      const classes = await db.class.findMany({
        where: classWhere,
        orderBy: [{ year_group: { display_order: 'asc' } }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          year_group: { select: { id: true, name: true } },
          academic_year: { select: { id: true, name: true } },
        },
      });

      // Get all active academic subjects (Y-axis)
      const subjects = await db.subject.findMany({
        where: {
          tenant_id: tenantId,
          active: true,
          subject_type: 'academic',
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });

      // Get all existing class-subject grade configs (the checked cells)
      const classIds = classes.map((c) => c.id);
      const configs =
        classIds.length > 0
          ? await db.classSubjectGradeConfig.findMany({
              where: {
                tenant_id: tenantId,
                class_id: { in: classIds },
              },
              select: {
                id: true,
                class_id: true,
                subject_id: true,
              },
            })
          : [];

      return {
        classes,
        subjects,
        assignments: configs.map((c) => ({
          class_id: c.class_id,
          subject_id: c.subject_id,
          config_id: c.id,
        })),
      };
    })) as MatrixData;
  }

  async toggle(
    tenantId: string,
    classId: string,
    subjectId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean; config_id: string | null }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate class exists
      const classEntity = await db.class.findFirst({
        where: { id: classId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!classEntity) {
        throw new NotFoundException({
          code: 'CLASS_NOT_FOUND',
          message: `Class with id "${classId}" not found`,
        });
      }

      // Validate subject exists
      const subject = await db.subject.findFirst({
        where: { id: subjectId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!subject) {
        throw new NotFoundException({
          code: 'SUBJECT_NOT_FOUND',
          message: `Subject with id "${subjectId}" not found`,
        });
      }

      if (enabled) {
        // Check if already exists
        const existing = await db.classSubjectGradeConfig.findFirst({
          where: { tenant_id: tenantId, class_id: classId, subject_id: subjectId },
          select: { id: true },
        });
        if (existing) {
          return { enabled: true, config_id: existing.id };
        }

        // Get the tenant's first grading scale as default
        const defaultScale = await db.gradingScale.findFirst({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'asc' },
          select: { id: true },
        });
        if (!defaultScale) {
          throw new BadRequestException({
            code: 'NO_GRADING_SCALE',
            message:
              'No grading scale configured. Please create a grading scale in Settings first.',
          });
        }

        const config = await db.classSubjectGradeConfig.create({
          data: {
            tenant_id: tenantId,
            class_id: classId,
            subject_id: subjectId,
            grading_scale_id: defaultScale.id,
            category_weight_json: {},
          },
        });

        return { enabled: true, config_id: config.id };
      } else {
        // Check if assessments exist for this class+subject
        const assessmentCount = await db.assessment.count({
          where: { tenant_id: tenantId, class_id: classId, subject_id: subjectId },
        });
        if (assessmentCount > 0) {
          throw new BadRequestException({
            code: 'ASSESSMENTS_EXIST',
            message: `Cannot unassign: ${assessmentCount} assessment(s) exist for this class+subject combination. Delete the assessments first.`,
          });
        }

        // Delete the config
        await db.classSubjectGradeConfig.deleteMany({
          where: { tenant_id: tenantId, class_id: classId, subject_id: subjectId },
        });

        return { enabled: false, config_id: null };
      }
    })) as { enabled: boolean; config_id: string | null };
  }

  async yearGroupAssign(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
    assignments: Array<{ subject_id: string; enabled: boolean }>,
  ): Promise<{ created: number; removed: number }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get all homeroom classes in this year group
      const classes = await db.class.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          year_group_id: yearGroupId,
          subject_id: null, // homeroom only
          status: 'active',
        },
        select: { id: true },
      });

      if (classes.length === 0) {
        throw new NotFoundException({
          code: 'NO_CLASSES_IN_YEAR_GROUP',
          message: 'No active classes found in this year group',
        });
      }

      // Get tenant's default grading scale (needed for creates)
      const defaultScale = await db.gradingScale.findFirst({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!defaultScale) {
        throw new BadRequestException({
          code: 'NO_GRADING_SCALE',
          message: 'No grading scale configured. Please create one in Settings first.',
        });
      }

      let created = 0;
      let removed = 0;
      const classIds = classes.map((c) => c.id);

      for (const assignment of assignments) {
        if (assignment.enabled) {
          // Create for each class that doesn't already have it
          for (const classId of classIds) {
            const existing = await db.classSubjectGradeConfig.findFirst({
              where: { tenant_id: tenantId, class_id: classId, subject_id: assignment.subject_id },
              select: { id: true },
            });
            if (!existing) {
              await db.classSubjectGradeConfig.create({
                data: {
                  tenant_id: tenantId,
                  class_id: classId,
                  subject_id: assignment.subject_id,
                  grading_scale_id: defaultScale.id,
                  category_weight_json: {},
                },
              });
              created++;
            }
          }
        } else {
          // Remove from all classes (but skip if assessments exist)
          for (const classId of classIds) {
            const assessmentCount = await db.assessment.count({
              where: { tenant_id: tenantId, class_id: classId, subject_id: assignment.subject_id },
            });
            if (assessmentCount === 0) {
              const deleteResult = await db.classSubjectGradeConfig.deleteMany({
                where: {
                  tenant_id: tenantId,
                  class_id: classId,
                  subject_id: assignment.subject_id,
                },
              });
              removed += deleteResult.count;
            }
          }
        }
      }

      return { created, removed };
    })) as { created: number; removed: number };
  }

  async bulkCreateAssessments(
    tenantId: string,
    userId: string,
    dto: {
      class_ids: string[];
      subject_ids: string[];
      academic_period_id: string;
      category_id: string;
      title: string;
      max_score: number;
      due_date?: string | null;
    },
  ): Promise<{ created: number; skipped: number }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate academic period
      const period = await db.academicPeriod.findFirst({
        where: { id: dto.academic_period_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!period) {
        throw new NotFoundException({
          code: 'PERIOD_NOT_FOUND',
          message: 'Academic period not found',
        });
      }

      // Validate category
      const category = await db.assessmentCategory.findFirst({
        where: { id: dto.category_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException({
          code: 'CATEGORY_NOT_FOUND',
          message: 'Assessment category not found',
        });
      }

      // Find which class+subject combos have a grade config (are assigned)
      const configs = await db.classSubjectGradeConfig.findMany({
        where: {
          tenant_id: tenantId,
          class_id: { in: dto.class_ids },
          subject_id: { in: dto.subject_ids },
        },
        select: {
          class_id: true,
          subject_id: true,
        },
      });

      let created = 0;
      let skipped = 0;

      for (const config of configs) {
        // Check if assessment with same title already exists
        const existing = await db.assessment.findFirst({
          where: {
            tenant_id: tenantId,
            class_id: config.class_id,
            subject_id: config.subject_id,
            title: dto.title,
            academic_period_id: dto.academic_period_id,
          },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await db.assessment.create({
          data: {
            tenant_id: tenantId,
            class_id: config.class_id,
            subject_id: config.subject_id,
            academic_period_id: dto.academic_period_id,
            category_id: dto.category_id,
            title: dto.title,
            max_score: dto.max_score,
            due_date: dto.due_date ? new Date(dto.due_date) : null,
            status: 'draft',
            counts_toward_report_card: true,
          },
        });
        created++;
      }

      // Report combos that weren't assigned
      const totalRequested = dto.class_ids.length * dto.subject_ids.length;
      skipped += totalRequested - configs.length - skipped;

      return { created, skipped };
    })) as { created: number; skipped: number };
  }

  /**
   * Return (year_group, subject) pairs that exist in the curriculum, with
   * aggregate student counts summed across all classes in the year group
   * that have the subject configured. Used by the exam scheduling subject
   * matrix to show ONLY subjects each year group actually studies — never
   * a cartesian product of every year group × every subject.
   *
   * Only active classes with a non-null year_group are considered. Subjects
   * are restricted to academic type (same filter the curriculum matrix UI uses).
   */
  async findExamCurriculumPairs(tenantId: string): Promise<ExamCurriculumPair[]> {
    const [configs, yearGroups, subjects] = await Promise.all([
      // eslint-disable-next-line school/no-cross-module-prisma-access -- curriculum matrix joins ClassSubjectGradeConfig (gradebook-owned model) with Class + Subject to surface curriculum membership; this is the same cross-module read already used elsewhere in this file via tx wrapper
      this.prisma.classSubjectGradeConfig.findMany({
        where: {
          tenant_id: tenantId,
          class_entity: { status: 'active', year_group_id: { not: null } },
          subject: { active: true, subject_type: 'academic' },
        },
        select: {
          subject_id: true,
          class_entity: {
            select: {
              year_group_id: true,
              _count: { select: { class_enrolments: { where: { status: 'active' } } } },
            },
          },
        },
      }),
      this.prisma.yearGroup.findMany({
        where: { tenant_id: tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.subject.findMany({
        where: { tenant_id: tenantId, active: true, subject_type: 'academic' },
        select: { id: true, name: true },
      }),
    ]);

    const ygName = new Map(yearGroups.map((yg) => [yg.id, yg.name]));
    const subjName = new Map(subjects.map((s) => [s.id, s.name]));

    const pairTotals = new Map<string, { ygId: string; subjId: string; students: number }>();
    for (const c of configs) {
      const ygId = c.class_entity.year_group_id;
      if (!ygId) continue;
      const key = `${ygId}:${c.subject_id}`;
      const prev = pairTotals.get(key);
      const students = c.class_entity._count.class_enrolments;
      if (prev) {
        prev.students += students;
      } else {
        pairTotals.set(key, { ygId, subjId: c.subject_id, students });
      }
    }

    const rows: ExamCurriculumPair[] = [];
    for (const pair of pairTotals.values()) {
      rows.push({
        year_group_id: pair.ygId,
        year_group_name: ygName.get(pair.ygId) ?? '',
        subject_id: pair.subjId,
        subject_name: subjName.get(pair.subjId) ?? '',
        student_count: pair.students,
      });
    }

    rows.sort((a, b) => {
      const yg = a.year_group_name.localeCompare(b.year_group_name);
      return yg !== 0 ? yg : a.subject_name.localeCompare(b.subject_name);
    });

    return rows;
  }
}
