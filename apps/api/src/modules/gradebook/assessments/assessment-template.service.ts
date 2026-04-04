import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateAssessmentFromTemplateDto,
  CreateAssessmentTemplateDto,
  UpdateAssessmentTemplateDto,
} from '../dto/gradebook.dto';

interface ListTemplatesParams {
  page: number;
  pageSize: number;
  subject_id?: string;
}

@Injectable()
export class AssessmentTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new assessment template.
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateAssessmentTemplateDto,
  ) {
    await this.validateRefs(tenantId, dto);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.assessmentTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          subject_id: dto.subject_id ?? null,
          category_id: dto.category_id,
          max_score: dto.max_score,
          rubric_template_id: dto.rubric_template_id ?? null,
          standard_ids_json: dto.standard_ids ?? Prisma.JsonNull,
          counts_toward_report_card: dto.counts_toward_report_card ?? true,
          created_by_user_id: userId,
        },
        include: {
          subject: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          rubric_template: { select: { id: true, name: true } },
          created_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
  }

  /**
   * List assessment templates with optional subject filter.
   */
  async list(tenantId: string, params: ListTemplatesParams) {
    const { page, pageSize, subject_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AssessmentTemplateWhereInput = { tenant_id: tenantId };
    if (subject_id) where.subject_id = subject_id;

    const [data, total] = await Promise.all([
      this.prisma.assessmentTemplate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          subject: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          rubric_template: { select: { id: true, name: true } },
          created_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.assessmentTemplate.count({ where }),
    ]);

    return {
      data: data.map((t) => ({
        ...t,
        max_score: Number(t.max_score),
      })),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single assessment template.
   */
  async findOne(tenantId: string, id: string) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        subject: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        rubric_template: { select: { id: true, name: true } },
        created_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'ASSESSMENT_TEMPLATE_NOT_FOUND',
        message: `Assessment template with id "${id}" not found`,
      });
    }

    return { ...template, max_score: Number(template.max_score) };
  }

  /**
   * Update an assessment template.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateAssessmentTemplateDto,
  ) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'ASSESSMENT_TEMPLATE_NOT_FOUND',
        message: `Assessment template with id "${id}" not found`,
      });
    }

    // Validate referenced entities if changing
    if (dto.category_id) {
      const category = await this.prisma.assessmentCategory.findFirst({
        where: { id: dto.category_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException({
          code: 'CATEGORY_NOT_FOUND',
          message: `Assessment category with id "${dto.category_id}" not found`,
        });
      }
    }

    if (dto.subject_id) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: dto.subject_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!subject) {
        throw new NotFoundException({
          code: 'SUBJECT_NOT_FOUND',
          message: `Subject with id "${dto.subject_id}" not found`,
        });
      }
    }

    if (dto.rubric_template_id) {
      const rubric = await this.prisma.rubricTemplate.findFirst({
        where: { id: dto.rubric_template_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!rubric) {
        throw new NotFoundException({
          code: 'RUBRIC_TEMPLATE_NOT_FOUND',
          message: `Rubric template with id "${dto.rubric_template_id}" not found`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.AssessmentTemplateUncheckedUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.subject_id !== undefined) updateData.subject_id = dto.subject_id;
      if (dto.category_id !== undefined) updateData.category_id = dto.category_id;
      if (dto.max_score !== undefined) updateData.max_score = dto.max_score;
      if (dto.rubric_template_id !== undefined) {
        updateData.rubric_template_id = dto.rubric_template_id;
      }
      if (dto.standard_ids !== undefined) {
        updateData.standard_ids_json = dto.standard_ids ?? Prisma.JsonNull;
      }
      if (dto.counts_toward_report_card !== undefined) {
        updateData.counts_toward_report_card = dto.counts_toward_report_card;
      }

      const updated = await db.assessmentTemplate.update({
        where: { id },
        data: updateData,
        include: {
          subject: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          rubric_template: { select: { id: true, name: true } },
        },
      });

      return { ...updated, max_score: Number(updated.max_score) };
    });
  }

  /**
   * Delete an assessment template.
   */
  async delete(tenantId: string, id: string) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'ASSESSMENT_TEMPLATE_NOT_FOUND',
        message: `Assessment template with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.assessmentTemplate.delete({ where: { id } });
    });
  }

  /**
   * Create an assessment from a template.
   * Pre-fills all fields except class/period/dates from the template.
   * Filters out deleted standards at runtime.
   */
  async createAssessmentFromTemplate(
    tenantId: string,
    templateId: string,
    userId: string,
    dto: CreateAssessmentFromTemplateDto,
  ) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'ASSESSMENT_TEMPLATE_NOT_FOUND',
        message: `Assessment template with id "${templateId}" not found`,
      });
    }

    // Validate class exists
    const classEntity = await this.prisma.class.findFirst({
      where: { id: dto.class_id, tenant_id: tenantId },
      select: { id: true, subject_id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${dto.class_id}" not found`,
      });
    }

    // Validate period exists
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: dto.academic_period_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${dto.academic_period_id}" not found`,
      });
    }

    // Resolve subject: use template subject if set, otherwise use class subject
    const subjectId = template.subject_id ?? classEntity.subject_id;
    if (!subjectId) {
      throw new BadRequestException({
        code: 'SUBJECT_REQUIRED',
        message: 'Cannot determine subject for assessment. Set a subject on the template or class.',
      });
    }

    // Validate grade config exists
    const gradeConfig = await this.prisma.classSubjectGradeConfig.findFirst({
      where: { tenant_id: tenantId, class_id: dto.class_id, subject_id: subjectId },
      select: { id: true },
    });

    if (!gradeConfig) {
      throw new BadRequestException({
        code: 'GRADE_CONFIG_REQUIRED',
        message: 'A grade configuration must exist for this class and subject before creating assessments',
      });
    }

    // Filter standard_ids to only existing standards
    const rawStandardIds = template.standard_ids_json as string[] | null;
    let validStandardIds: string[] = [];

    if (rawStandardIds && rawStandardIds.length > 0) {
      const existingStandards = await this.prisma.curriculumStandard.findMany({
        where: { tenant_id: tenantId, id: { in: rawStandardIds } },
        select: { id: true },
      });
      validStandardIds = existingStandards.map((s) => s.id);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Create the assessment
      const assessment = await db.assessment.create({
        data: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          subject_id: subjectId,
          academic_period_id: dto.academic_period_id,
          category_id: template.category_id,
          title: dto.title ?? template.name,
          max_score: template.max_score,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          grading_deadline: dto.grading_deadline ? new Date(dto.grading_deadline) : null,
          counts_toward_report_card: template.counts_toward_report_card,
          rubric_template_id: template.rubric_template_id,
          status: 'draft',
        },
      });

      // Create standard mappings for valid standards
      if (validStandardIds.length > 0) {
        await db.assessmentStandardMapping.createMany({
          data: validStandardIds.map((standardId) => ({
            tenant_id: tenantId,
            assessment_id: assessment.id,
            standard_id: standardId,
          })),
        });
      }

      return {
        assessment,
        standards_mapped: validStandardIds.length,
        standards_filtered_out: (rawStandardIds?.length ?? 0) - validStandardIds.length,
      };
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async validateRefs(
    tenantId: string,
    dto: CreateAssessmentTemplateDto,
  ) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id: dto.category_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${dto.category_id}" not found`,
      });
    }

    if (dto.subject_id) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: dto.subject_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!subject) {
        throw new NotFoundException({
          code: 'SUBJECT_NOT_FOUND',
          message: `Subject with id "${dto.subject_id}" not found`,
        });
      }
    }

    if (dto.rubric_template_id) {
      const rubric = await this.prisma.rubricTemplate.findFirst({
        where: { id: dto.rubric_template_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!rubric) {
        throw new NotFoundException({
          code: 'RUBRIC_TEMPLATE_NOT_FOUND',
          message: `Rubric template with id "${dto.rubric_template_id}" not found`,
        });
      }
    }
  }
}
