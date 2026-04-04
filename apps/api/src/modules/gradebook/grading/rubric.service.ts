import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateRubricTemplateDto,
  SaveRubricGradesDto,
  UpdateRubricTemplateDto,
} from '../dto/gradebook.dto';

interface ListRubricTemplatesParams {
  page: number;
  pageSize: number;
  subject_id?: string;
}

interface RubricCriterion {
  id: string;
  name: string;
  max_points: number;
  levels: Array<{ label: string; points: number; description: string }>;
}

@Injectable()
export class RubricService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  /**
   * Create a new rubric template.
   */
  async createTemplate(tenantId: string, userId: string, dto: CreateRubricTemplateDto) {
    // Validate subject if provided
    if (dto.subject_id) {
      const subject = await this.academicReadFacade.findSubjectById(tenantId, dto.subject_id);
      if (!subject) {
        throw new NotFoundException({
          code: 'SUBJECT_NOT_FOUND',
          message: `Subject with id "${dto.subject_id}" not found`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.rubricTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          subject_id: dto.subject_id ?? null,
          criteria_json: dto.criteria as unknown as Parameters<
            typeof db.rubricTemplate.create
          >[0]['data']['criteria_json'],
          created_by_user_id: userId,
        },
      });
    });
  }

  /**
   * Update a rubric template.
   */
  async updateTemplate(tenantId: string, id: string, dto: UpdateRubricTemplateDto) {
    const template = await this.prisma.rubricTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'RUBRIC_TEMPLATE_NOT_FOUND',
        message: `Rubric template with id "${id}" not found`,
      });
    }

    if (dto.subject_id) {
      const subject = await this.academicReadFacade.findSubjectById(tenantId, dto.subject_id);
      if (!subject) {
        throw new NotFoundException({
          code: 'SUBJECT_NOT_FOUND',
          message: `Subject with id "${dto.subject_id}" not found`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.rubricTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.subject_id !== undefined && { subject_id: dto.subject_id }),
          ...(dto.criteria !== undefined && {
            criteria_json: dto.criteria as unknown as Parameters<
              typeof db.rubricTemplate.update
            >[0]['data']['criteria_json'],
          }),
        },
      });
    });
  }

  /**
   * Delete a rubric template. Blocked if in use by any assessment.
   */
  async deleteTemplate(tenantId: string, id: string) {
    const template = await this.prisma.rubricTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'RUBRIC_TEMPLATE_NOT_FOUND',
        message: `Rubric template with id "${id}" not found`,
      });
    }

    const assessmentCount = await this.prisma.assessment.count({
      where: { tenant_id: tenantId, rubric_template_id: id },
    });

    if (assessmentCount > 0) {
      throw new ConflictException({
        code: 'RUBRIC_TEMPLATE_IN_USE',
        message: `Cannot delete rubric template because it is used by ${assessmentCount} assessment(s)`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.rubricTemplate.delete({ where: { id } });
    });
  }

  /**
   * List rubric templates with optional subject filter.
   */
  async listTemplates(tenantId: string, params: ListRubricTemplatesParams) {
    const { page, pageSize, subject_id } = params;
    const skip = (page - 1) * pageSize;

    const where = {
      tenant_id: tenantId,
      ...(subject_id ? { subject_id } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.rubricTemplate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          subject: { select: { id: true, name: true } },
          created_by: { select: { id: true, first_name: true, last_name: true } },
          _count: { select: { assessments: true } },
        },
      }),
      this.prisma.rubricTemplate.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Get a single rubric template.
   */
  async getTemplate(tenantId: string, id: string) {
    const template = await this.prisma.rubricTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        subject: { select: { id: true, name: true } },
        created_by: { select: { id: true, first_name: true, last_name: true } },
        _count: { select: { assessments: true } },
      },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'RUBRIC_TEMPLATE_NOT_FOUND',
        message: `Rubric template with id "${id}" not found`,
      });
    }

    return template;
  }

  /**
   * Save rubric grades for a grade record and compute the total raw_score sum.
   * All operations within a single transaction.
   */
  async saveRubricGrades(tenantId: string, gradeId: string, dto: SaveRubricGradesDto) {
    // 1. Verify the grade exists and belongs to this tenant
    const grade = await this.prisma.grade.findFirst({
      where: { id: gradeId, tenant_id: tenantId },
      select: {
        id: true,
        assessment: {
          select: {
            id: true,
            max_score: true,
            rubric_template_id: true,
            status: true,
          },
        },
      },
    });

    if (!grade) {
      throw new NotFoundException({
        code: 'GRADE_NOT_FOUND',
        message: `Grade with id "${gradeId}" not found`,
      });
    }

    if (grade.assessment.status !== 'draft' && grade.assessment.status !== 'open') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_GRADEABLE',
        message: `Cannot enter rubric grades for assessment with status "${grade.assessment.status}"`,
      });
    }

    // 2. Verify rubric template exists and matches assessment
    const template = await this.prisma.rubricTemplate.findFirst({
      where: { id: dto.rubric_template_id, tenant_id: tenantId },
      select: { id: true, criteria_json: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'RUBRIC_TEMPLATE_NOT_FOUND',
        message: `Rubric template with id "${dto.rubric_template_id}" not found`,
      });
    }

    // 3. Validate criterion IDs against template
    const criteria = template.criteria_json as unknown as RubricCriterion[];
    const criteriaIds = new Set(criteria.map((c) => c.id));
    for (const score of dto.criteria_scores) {
      if (!criteriaIds.has(score.criterion_id)) {
        throw new BadRequestException({
          code: 'INVALID_CRITERION_ID',
          message: `Criterion id "${score.criterion_id}" does not exist in this rubric template`,
        });
      }
    }

    // 4. Compute total raw score from criteria scores
    const totalRawScore = dto.criteria_scores.reduce((sum, s) => sum + s.points_awarded, 0);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 5. Upsert each criterion score
      for (const score of dto.criteria_scores) {
        await db.rubricGrade.upsert({
          where: {
            idx_rubric_grades_unique: {
              tenant_id: tenantId,
              grade_id: gradeId,
              criterion_id: score.criterion_id,
            },
          },
          update: {
            level_index: score.level_index,
            points_awarded: score.points_awarded,
            rubric_template_id: dto.rubric_template_id,
          },
          create: {
            tenant_id: tenantId,
            grade_id: gradeId,
            rubric_template_id: dto.rubric_template_id,
            criterion_id: score.criterion_id,
            level_index: score.level_index,
            points_awarded: score.points_awarded,
          },
        });
      }

      // 6. Update the grade's raw_score to the sum of criteria scores
      const updatedGrade = await db.grade.update({
        where: { id: gradeId },
        data: { raw_score: totalRawScore },
      });

      return {
        grade: updatedGrade,
        rubric_total: totalRawScore,
        criteria_saved: dto.criteria_scores.length,
      };
    });
  }
}
