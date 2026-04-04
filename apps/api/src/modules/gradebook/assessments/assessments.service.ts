import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassGradeConfigsService } from '../class-grade-configs.service';
import type { CreateAssessmentDto, UpdateAssessmentDto, TransitionAssessmentStatusDto } from '../dto/gradebook.dto';

interface ListAssessmentsParams {
  page: number;
  pageSize: number;
  class_id?: string;
  subject_id?: string;
  academic_period_id?: string;
  category_id?: string;
  status?: string;
  assignedClassIds?: string[];
}

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classGradeConfigsService: ClassGradeConfigsService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  /**
   * Create a new assessment.
   */
  async create(tenantId: string, userId: string, dto: CreateAssessmentDto) {
    // 1. Validate class exists
    await this.classesReadFacade.existsOrThrow(tenantId, dto.class_id);

    // 2. Validate subject exists and is academic
    const subject = await this.academicReadFacade.findSubjectById(tenantId, dto.subject_id);

    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject with id "${dto.subject_id}" not found`,
      });
    }

    if ((subject as { subject_type?: string }).subject_type !== 'academic') {
      throw new BadRequestException({
        code: 'SUBJECT_NOT_ACADEMIC',
        message: 'Assessments can only be created for academic subjects',
      });
    }

    // 3. Validate academic period exists
    const period = await this.academicReadFacade.findPeriodById(tenantId, dto.academic_period_id);

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${dto.academic_period_id}" not found`,
      });
    }

    // 4. Validate category exists
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

    // 5. Validate grade config exists for class+subject
    const gradeConfig = await this.prisma.classSubjectGradeConfig.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: dto.class_id,
        subject_id: dto.subject_id,
      },
      select: { id: true },
    });

    if (!gradeConfig) {
      throw new BadRequestException({
        code: 'GRADE_CONFIG_REQUIRED',
        message: 'A grade configuration must exist for this class and subject before creating assessments',
      });
    }

    // 6. Create assessment with status 'draft'
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.assessment.create({
        data: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          subject_id: dto.subject_id,
          academic_period_id: dto.academic_period_id,
          category_id: dto.category_id,
          title: dto.title,
          max_score: dto.max_score,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          grading_deadline: dto.grading_deadline ? new Date(dto.grading_deadline) : null,
          status: 'draft',
        },
      });
    });
  }

  /**
   * List assessments with filters and pagination.
   * Supports teacher-only filtering by assignedClassIds.
   */
  async findAll(tenantId: string, params: ListAssessmentsParams) {
    const { page, pageSize, class_id, subject_id, academic_period_id, category_id, status, assignedClassIds } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AssessmentWhereInput = { tenant_id: tenantId };

    if (class_id) {
      where.class_id = class_id;
    }

    if (subject_id) {
      where.subject_id = subject_id;
    }

    if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    }

    if (category_id) {
      where.category_id = category_id;
    }

    if (status) {
      where.status = status as $Enums.AssessmentStatus;
    }

    // Teacher filter: restrict to assigned classes
    if (assignedClassIds) {
      if (where.class_id) {
        // If a specific class_id filter is provided, validate it's in their assignments
        if (!assignedClassIds.includes(where.class_id as string)) {
          return { data: [], meta: { page, pageSize, total: 0 } };
        }
      } else {
        where.class_id = { in: assignedClassIds };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ created_at: 'desc' }],
        include: {
          class_entity: {
            select: { id: true, name: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          category: {
            select: { id: true, name: true },
          },
          _count: {
            select: { grades: true },
          },
        },
      }),
      this.prisma.assessment.count({ where }),
    ]);

    return {
      data: data.map((a) => ({
        ...a,
        max_score: a.max_score != null ? Number(a.max_score) : null,
      })),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single assessment with grade count and enrolled student count.
   */
  async findOne(tenantId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        class_entity: {
          select: { id: true, name: true },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
        academic_period: {
          select: { id: true, name: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${id}" not found`,
      });
    }

    // Count grades with raw_score not null
    const gradeCount = await this.prisma.grade.count({
      where: {
        tenant_id: tenantId,
        assessment_id: id,
        raw_score: { not: null },
      },
    });

    // Count enrolled students in the class
    const studentCount = await this.prisma.classEnrolment.count({
      where: {
        tenant_id: tenantId,
        class_id: assessment.class_id,
        status: 'active',
      },
    });

    return {
      ...assessment,
      max_score: assessment.max_score != null ? Number(assessment.max_score) : null,
      grade_count: gradeCount,
      student_count: studentCount,
    };
  }

  /**
   * Update an assessment. Only allowed when status is draft or open.
   * If max_score changes, validates no grade exceeds the new max.
   * Supports optimistic concurrency via expected_updated_at.
   */
  async update(tenantId: string, id: string, dto: UpdateAssessmentDto) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, updated_at: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${id}" not found`,
      });
    }

    if (assessment.status !== 'draft' && assessment.status !== 'open') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_EDITABLE',
        message: `Cannot update assessment with status "${assessment.status}". Only draft or open assessments can be updated.`,
      });
    }

    // Optimistic concurrency check
    if (dto.expected_updated_at) {
      const expectedDate = new Date(dto.expected_updated_at);
      if (assessment.updated_at.getTime() !== expectedDate.getTime()) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message: 'The assessment has been modified by another user. Please refresh and try again.',
        });
      }
    }

    // If max_score is changing, validate no grade exceeds the new max
    if (dto.max_score !== undefined) {
      const maxGrade = await this.prisma.grade.findFirst({
        where: {
          tenant_id: tenantId,
          assessment_id: id,
          raw_score: { not: null },
        },
        orderBy: { raw_score: 'desc' },
        select: { raw_score: true },
      });

      if (maxGrade?.raw_score !== null && maxGrade?.raw_score !== undefined) {
        if (Number(maxGrade.raw_score) > dto.max_score) {
          throw new BadRequestException({
            code: 'MAX_SCORE_TOO_LOW',
            message: `Cannot set max_score to ${dto.max_score} because a grade with score ${maxGrade.raw_score} already exists`,
          });
        }
      }
    }

    // Validate category if changing
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

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.AssessmentUpdateInput = {};
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.max_score !== undefined) updateData.max_score = dto.max_score;
      if (dto.due_date !== undefined) {
        updateData.due_date = dto.due_date ? new Date(dto.due_date) : null;
      }
      if (dto.grading_deadline !== undefined) {
        updateData.grading_deadline = dto.grading_deadline ? new Date(dto.grading_deadline) : null;
      }
      if (dto.category_id !== undefined) {
        updateData.category = { connect: { id: dto.category_id } };
      }

      return db.assessment.update({
        where: { id },
        data: updateData,
      });
    });
  }

  /**
   * Transition assessment status via state machine.
   * VALID: draft->open, open->closed, closed->locked, closed->open
   * BLOCKED: locked->anything, draft->closed, draft->locked
   */
  async transitionStatus(
    tenantId: string,
    id: string,
    dto: TransitionAssessmentStatusDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${id}" not found`,
      });
    }

    const currentStatus = assessment.status;
    const newStatus = dto.status;

    // Define valid transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['open'],
      open: ['closed'],
      closed: ['locked', 'open'],
      locked: [],
    };

    const allowed = validTransitions[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.assessment.update({
        where: { id },
        data: { status: newStatus as $Enums.AssessmentStatus },
      });
    });
  }

  /**
   * Delete an assessment. Only allowed when draft and no grades exist.
   */
  async delete(tenantId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${id}" not found`,
      });
    }

    if (assessment.status !== 'draft') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_DRAFT',
        message: 'Only draft assessments can be deleted',
      });
    }

    const gradeCount = await this.prisma.grade.count({
      where: {
        tenant_id: tenantId,
        assessment_id: id,
      },
    });

    if (gradeCount > 0) {
      throw new ConflictException({
        code: 'ASSESSMENT_HAS_GRADES',
        message: 'Cannot delete an assessment that has grades',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.assessment.delete({ where: { id } });
    });
  }
}
