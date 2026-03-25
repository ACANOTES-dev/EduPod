import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface MatrixCell {
  class_id: string;
  subject_id: string;
  config_id: string;
}

interface MatrixData {
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
      const configs = classIds.length > 0
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
            message: 'No grading scale configured. Please create a grading scale in Settings first.',
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
            created_by_user_id: userId,
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
}
