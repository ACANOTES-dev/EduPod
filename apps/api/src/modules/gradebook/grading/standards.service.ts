import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  BulkImportStandardsDto,
  CreateCurriculumStandardDto,
  MapAssessmentStandardsDto,
} from '../dto/gradebook.dto';

interface ListStandardsParams {
  page: number;
  pageSize: number;
  subject_id?: string;
  year_group_id?: string;
}

interface CompetencyLevel {
  label: string;
  threshold_min: number;
}

@Injectable()
export class StandardsService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * Create a single curriculum standard.
   */
  async createStandard(tenantId: string, dto: CreateCurriculumStandardDto) {
    await this.validateSubjectAndYearGroup(tenantId, dto.subject_id, dto.year_group_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.curriculumStandard.create({
        data: {
          tenant_id: tenantId,
          subject_id: dto.subject_id,
          year_group_id: dto.year_group_id,
          code: dto.code,
          description: dto.description,
        },
      });
    });
  }

  /**
   * Bulk import standards (upsert by code within subject).
   * Returns counts of created and updated records.
   */
  async bulkImportStandards(tenantId: string, dto: BulkImportStandardsDto) {
    await this.validateSubjectAndYearGroup(
      tenantId,
      dto.subject_id,
      dto.year_group_id,
    );

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      let created = 0;
      let updated = 0;

      for (const standard of dto.standards) {
        const existing = await db.curriculumStandard.findFirst({
          where: {
            tenant_id: tenantId,
            subject_id: dto.subject_id,
            code: standard.code,
          },
          select: { id: true },
        });

        if (existing) {
          await db.curriculumStandard.update({
            where: { id: existing.id },
            data: {
              description: standard.description,
              year_group_id: dto.year_group_id,
            },
          });
          updated++;
        } else {
          await db.curriculumStandard.create({
            data: {
              tenant_id: tenantId,
              subject_id: dto.subject_id,
              year_group_id: dto.year_group_id,
              code: standard.code,
              description: standard.description,
            },
          });
          created++;
        }
      }

      return { created, updated, total: dto.standards.length };
    });

    return results;
  }

  /**
   * List curriculum standards with optional filters.
   */
  async listStandards(tenantId: string, params: ListStandardsParams) {
    const { page, pageSize, subject_id, year_group_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CurriculumStandardWhereInput = { tenant_id: tenantId };
    if (subject_id) where.subject_id = subject_id;
    if (year_group_id) where.year_group_id = year_group_id;

    const [data, total] = await Promise.all([
      this.prisma.curriculumStandard.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ subject_id: 'asc' }, { code: 'asc' }],
        include: {
          subject: { select: { id: true, name: true, code: true } },
          year_group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.curriculumStandard.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Delete a curriculum standard.
   */
  async deleteStandard(tenantId: string, id: string) {
    const standard = await this.prisma.curriculumStandard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!standard) {
      throw new NotFoundException({
        code: 'STANDARD_NOT_FOUND',
        message: `Curriculum standard with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.curriculumStandard.delete({ where: { id } });
    });
  }

  /**
   * Map an assessment to a set of standards (replaces existing mappings).
   */
  async mapAssessmentStandards(
    tenantId: string,
    assessmentId: string,
    dto: MapAssessmentStandardsDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    // Validate all standard IDs exist
    if (dto.standard_ids.length > 0) {
      const foundStandards = await this.prisma.curriculumStandard.findMany({
        where: {
          tenant_id: tenantId,
          id: { in: dto.standard_ids },
        },
        select: { id: true },
      });

      if (foundStandards.length !== dto.standard_ids.length) {
        const foundIds = new Set(foundStandards.map((s) => s.id));
        const missing = dto.standard_ids.filter((id) => !foundIds.has(id));
        throw new NotFoundException({
          code: 'STANDARDS_NOT_FOUND',
          message: `Standards not found: ${missing.join(', ')}`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete existing mappings
      await db.assessmentStandardMapping.deleteMany({
        where: { tenant_id: tenantId, assessment_id: assessmentId },
      });

      // Create new mappings
      if (dto.standard_ids.length > 0) {
        await db.assessmentStandardMapping.createMany({
          data: dto.standard_ids.map((standardId) => ({
            tenant_id: tenantId,
            assessment_id: assessmentId,
            standard_id: standardId,
          })),
        });
      }

      return { mapped_count: dto.standard_ids.length };
    });
  }

  /**
   * Compute competency snapshots for a student/period.
   * For each standard, averages scores from all assessments mapped to it.
   * Uses the active competency scale to determine the level label.
   */
  async computeCompetencySnapshots(
    tenantId: string,
    studentId: string,
    periodId: string,
  ) {
    // 1. Get all assessments in this period that have standard mappings
    const assessmentsWithMappings = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: periodId,
        status: { not: 'draft' },
        standard_mappings: { some: {} },
      },
      include: {
        standard_mappings: {
          select: { standard_id: true },
        },
        grades: {
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            raw_score: { not: null },
          },
          select: { raw_score: true },
        },
      },
    });

    if (assessmentsWithMappings.length === 0) {
      return { snapshots_computed: 0 };
    }

    // 2. Find active competency scale (first one for this tenant)
    const competencyScale = await this.prisma.competencyScale.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
      select: { levels_json: true },
    });

    const scaleLevels = (competencyScale?.levels_json as unknown as CompetencyLevel[]) ?? [
      { label: 'Beginning', threshold_min: 0 },
      { label: 'Developing', threshold_min: 40 },
      { label: 'Proficient', threshold_min: 70 },
      { label: 'Mastered', threshold_min: 90 },
    ];

    // 3. Group scores by standard_id
    const standardScoreMap = new Map<string, { total: number; count: number; maxTotal: number }>();

    for (const assessment of assessmentsWithMappings) {
      const grade = assessment.grades[0];
      if (!grade?.raw_score) continue;

      const rawScore = Number(grade.raw_score);
      const maxScore = Number(assessment.max_score);

      for (const mapping of assessment.standard_mappings) {
        const existing = standardScoreMap.get(mapping.standard_id) ?? {
          total: 0,
          count: 0,
          maxTotal: 0,
        };
        existing.total += rawScore;
        existing.maxTotal += maxScore;
        existing.count++;
        standardScoreMap.set(mapping.standard_id, existing);
      }
    }

    if (standardScoreMap.size === 0) {
      return { snapshots_computed: 0 };
    }

    // 4. Compute and upsert snapshots
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const snapshotCount = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      let count = 0;

      for (const [standardId, scores] of standardScoreMap) {
        if (scores.maxTotal === 0) continue;

        const scoreAverage = (scores.total / scores.maxTotal) * 100;
        const competencyLevel = this.resolveCompetencyLevel(scoreAverage, scaleLevels);

        await db.studentCompetencySnapshot.upsert({
          where: {
            idx_competency_snapshots_unique: {
              tenant_id: tenantId,
              student_id: studentId,
              standard_id: standardId,
              academic_period_id: periodId,
            },
          },
          update: {
            competency_level: competencyLevel,
            score_average: Math.round(scoreAverage * 10000) / 10000,
            computed_from_count: scores.count,
            last_updated: now,
          },
          create: {
            tenant_id: tenantId,
            student_id: studentId,
            standard_id: standardId,
            academic_period_id: periodId,
            competency_level: competencyLevel,
            score_average: Math.round(scoreAverage * 10000) / 10000,
            computed_from_count: scores.count,
            last_updated: now,
          },
        });

        count++;
      }

      return count;
    });

    return { snapshots_computed: snapshotCount };
  }

  /**
   * Get competency snapshots for a student, optionally filtered by period.
   */
  async getCompetencySnapshots(
    tenantId: string,
    studentId: string,
    periodId?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const data = await this.prisma.studentCompetencySnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        ...(periodId ? { academic_period_id: periodId } : {}),
      },
      include: {
        standard: {
          select: { id: true, code: true, description: true, subject_id: true },
        },
        academic_period: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ academic_period: { start_date: 'desc' } }, { standard: { code: 'asc' } }],
    });

    return { student, data };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async validateSubjectAndYearGroup(
    tenantId: string,
    subjectId: string,
    yearGroupId: string,
  ) {
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject with id "${subjectId}" not found`,
      });
    }

    const yearGroup = await this.prisma.yearGroup.findFirst({
      where: { id: yearGroupId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!yearGroup) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group with id "${yearGroupId}" not found`,
      });
    }
  }

  private resolveCompetencyLevel(
    scorePercentage: number,
    levels: CompetencyLevel[],
  ): string {
    // Sort descending by threshold_min, find first level where score >= threshold
    const sorted = [...levels].sort((a, b) => b.threshold_min - a.threshold_min);
    for (const level of sorted) {
      if (scorePercentage >= level.threshold_min) {
        return level.label;
      }
    }
    // Return lowest level if none match
    return sorted[sorted.length - 1]?.label ?? 'Beginning';
  }
}
