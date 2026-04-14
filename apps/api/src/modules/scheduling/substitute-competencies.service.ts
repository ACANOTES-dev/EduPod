import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  BulkCreateSubstituteTeacherCompetenciesDto,
  CopySubstituteCompetenciesToYearsDto,
  CreateSubstituteTeacherCompetencyDto,
  ListSubstituteTeacherCompetenciesQuery,
  SuggestSubstitutesQuery,
  UpdateSubstituteTeacherCompetencyDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

const INCLUDE_RELATIONS = {
  staff_profile: {
    select: {
      id: true,
      user: { select: { first_name: true, last_name: true } },
    },
  },
  subject: { select: { id: true, name: true } },
  year_group: { select: { id: true, name: true } },
  class: { select: { id: true, name: true } },
} as const;

const P2002 = 'P2002';

export interface SubstituteSuggestion {
  staff_profile_id: string;
  name: string;
  is_pinned: boolean;
  is_available: boolean;
  cover_count: number;
  rank_score: number;
}

@Injectable()
export class SubstituteCompetenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffAvailabilityReadFacade: StaffAvailabilityReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── List ───────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListSubstituteTeacherCompetenciesQuery) {
    const where: Prisma.SubstituteTeacherCompetencyWhereInput = {
      tenant_id: tenantId,
      academic_year_id: query.academic_year_id,
    };

    if (query.staff_profile_id) where.staff_profile_id = query.staff_profile_id;
    if (query.subject_id) where.subject_id = query.subject_id;
    if (query.year_group_id) where.year_group_id = query.year_group_id;

    if (query.class_id === 'null') {
      where.class_id = null;
    } else if (query.class_id !== undefined) {
      where.class_id = query.class_id;
    }

    const data = await this.prisma.substituteTeacherCompetency.findMany({
      where,
      include: INCLUDE_RELATIONS,
      orderBy: [{ staff_profile_id: 'asc' }, { subject_id: 'asc' }, { year_group_id: 'asc' }],
    });
    return { data };
  }

  async listByTeacher(tenantId: string, academicYearId: string, staffProfileId: string) {
    return this.list(tenantId, {
      academic_year_id: academicYearId,
      staff_profile_id: staffProfileId,
    });
  }

  async listBySubjectYear(
    tenantId: string,
    academicYearId: string,
    subjectId: string,
    yearGroupId: string,
  ) {
    return this.list(tenantId, {
      academic_year_id: academicYearId,
      subject_id: subjectId,
      year_group_id: yearGroupId,
    });
  }

  // ─── Create Single ─────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateSubstituteTeacherCompetencyDto) {
    await this.validateRelations(
      tenantId,
      dto.staff_profile_id,
      dto.subject_id,
      dto.year_group_id,
      dto.academic_year_id,
    );

    const classId = dto.class_id ?? null;
    if (classId !== null) {
      await this.assertClassMatchesYearGroup(tenantId, classId, dto.year_group_id);
    } else {
      await this.assertPoolRowUnique(
        tenantId,
        dto.academic_year_id,
        dto.staff_profile_id,
        dto.subject_id,
        dto.year_group_id,
      );
    }

    return this.createOneWithClass(tenantId, {
      academic_year_id: dto.academic_year_id,
      staff_profile_id: dto.staff_profile_id,
      subject_id: dto.subject_id,
      year_group_id: dto.year_group_id,
      class_id: classId,
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateSubstituteTeacherCompetencyDto) {
    const existing = await this.prisma.substituteTeacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
      include: INCLUDE_RELATIONS,
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SUBSTITUTE_TEACHER_COMPETENCY_NOT_FOUND',
        message: `Substitute teacher competency "${id}" not found`,
      });
    }

    if (dto.class_id === undefined) {
      return existing;
    }

    const nextClassId = dto.class_id;
    if (nextClassId === existing.class_id) {
      return existing;
    }

    if (nextClassId !== null) {
      await this.assertClassMatchesYearGroup(tenantId, nextClassId, existing.year_group_id);
    } else {
      await this.assertPoolRowUnique(
        tenantId,
        existing.academic_year_id,
        existing.staff_profile_id,
        existing.subject_id,
        existing.year_group_id,
        { excludeId: id },
      );
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.substituteTeacherCompetency.update({
          where: { id },
          data: { class_id: nextClassId },
          include: INCLUDE_RELATIONS,
        });
      });
    } catch (err) {
      throw this.translatePrismaError(err);
    }
  }

  // ─── Bulk Create ───────────────────────────────────────────────────────────

  async bulkCreate(tenantId: string, dto: BulkCreateSubstituteTeacherCompetenciesDto) {
    await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.staff_profile_id);

    for (const comp of dto.competencies) {
      if (comp.class_id != null) {
        await this.assertClassMatchesYearGroup(tenantId, comp.class_id, comp.year_group_id);
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        const created = [];
        for (const comp of dto.competencies) {
          const record = await db.substituteTeacherCompetency.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              staff_profile_id: dto.staff_profile_id,
              subject_id: comp.subject_id,
              year_group_id: comp.year_group_id,
              class_id: comp.class_id ?? null,
            },
            include: INCLUDE_RELATIONS,
          });
          created.push(record);
        }
        return created;
      })) as unknown as Record<string, unknown>[];

      return { data: result, meta: { created: result.length } };
    } catch (err) {
      throw this.translatePrismaError(err);
    }
  }

  // ─── Delete Single ─────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.substituteTeacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SUBSTITUTE_TEACHER_COMPETENCY_NOT_FOUND',
        message: `Substitute teacher competency "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.substituteTeacherCompetency.delete({ where: { id } });
    });

    return { message: 'Substitute teacher competency deleted' };
  }

  // ─── Delete All for Teacher ────────────────────────────────────────────────

  async deleteAllForTeacher(tenantId: string, academicYearId: string, staffProfileId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.substituteTeacherCompetency.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          staff_profile_id: staffProfileId,
        },
      });
    })) as unknown as { count: number };

    return { message: 'All substitute competencies deleted', meta: { deleted: result.count } };
  }

  // ─── Copy from Academic Year ───────────────────────────────────────────────

  async copyFromAcademicYear(tenantId: string, sourceYearId: string, targetYearId: string) {
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, sourceYearId);
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, targetYearId);

    const sourceRecords = await this.prisma.substituteTeacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: sourceYearId },
    });

    if (sourceRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message: 'No substitute teacher competencies found in the source academic year',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        const created = [];
        for (const src of sourceRecords) {
          const record = await db.substituteTeacherCompetency.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: targetYearId,
              staff_profile_id: src.staff_profile_id,
              subject_id: src.subject_id,
              year_group_id: src.year_group_id,
              class_id: src.class_id,
            },
          });
          created.push(record);
        }
        return created;
      })) as unknown as Record<string, unknown>[];

      return { data: result, meta: { copied: result.length } };
    } catch (err) {
      throw this.translatePrismaError(err);
    }
  }

  // ─── Copy to Multiple Year Groups ─────────────────────────────────────────

  async copyToYears(tenantId: string, dto: CopySubstituteCompetenciesToYearsDto) {
    const allSubjectIds = [...new Set(dto.targets.flatMap((t) => t.subject_ids))];

    const sourceCompetencies = await this.prisma.substituteTeacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: dto.source_year_group_id,
        subject_id: { in: allSubjectIds },
        class_id: null,
      },
    });

    if (sourceCompetencies.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message:
          'No substitute teacher competencies found in the source year group for the selected subjects',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      let copied = 0;
      let skipped = 0;

      for (const target of dto.targets) {
        const targetSubjectSet = new Set(target.subject_ids);
        const relevantSource = sourceCompetencies.filter((c) => targetSubjectSet.has(c.subject_id));

        for (const src of relevantSource) {
          const existing = await db.substituteTeacherCompetency.findFirst({
            where: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              staff_profile_id: src.staff_profile_id,
              subject_id: src.subject_id,
              year_group_id: target.year_group_id,
              class_id: null,
            },
            select: { id: true },
          });

          if (existing) {
            skipped++;
          } else {
            await db.substituteTeacherCompetency.create({
              data: {
                tenant_id: tenantId,
                academic_year_id: dto.academic_year_id,
                staff_profile_id: src.staff_profile_id,
                subject_id: src.subject_id,
                year_group_id: target.year_group_id,
                class_id: null,
              },
            });
            copied++;
          }
        }
      }

      return { copied, skipped };
    })) as unknown as { copied: number; skipped: number };

    return { data: result };
  }

  // ─── Suggest (ranked cover candidates) ────────────────────────────────────

  /**
   * Rank substitute candidates for a `(class_id, subject_id, date)` triple.
   * Pin (explicit class) > pool (year-group) > ineligible. Availability on
   * the target weekday adds weight; weekly cover count subtracts weight for
   * fairness. The ranker returns ALL staff with a non-ineligible relationship
   * so the UI can decide how many to show.
   */
  async suggest(tenantId: string, academicYearId: string, query: SuggestSubstitutesQuery) {
    const cls = await this.classesReadFacade.findById(tenantId, query.class_id);
    if (!cls) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class "${query.class_id}" not found`,
      });
    }
    if (!cls.year_group_id) {
      throw new BadRequestException({
        code: 'CLASS_MISSING_YEAR_GROUP',
        message: `Class "${query.class_id}" is not attached to a year group`,
      });
    }

    const targetDate = new Date(query.date);
    const weekday = targetDate.getDay();

    // Candidate set: pin for this (class, subject) OR pool for (year_group, subject).
    const rows = await this.prisma.substituteTeacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        subject_id: query.subject_id,
        OR: [{ class_id: query.class_id }, { class_id: null, year_group_id: cls.year_group_id }],
      },
      select: { staff_profile_id: true, class_id: true },
    });

    const pinnedIds = new Set<string>();
    const pooledIds = new Set<string>();
    for (const r of rows) {
      if (r.class_id === query.class_id) pinnedIds.add(r.staff_profile_id);
      else pooledIds.add(r.staff_profile_id);
    }

    const candidateIds = new Set<string>([...pinnedIds, ...pooledIds]);
    if (candidateIds.size === 0) {
      return { data: [] as SubstituteSuggestion[] };
    }

    const allStaff = await this.staffProfileReadFacade.findActiveStaff(tenantId);
    const staffById = new Map(allStaff.map((s) => [s.id, s]));

    const availabilities = await this.staffAvailabilityReadFacade.findByWeekday(
      tenantId,
      academicYearId,
      weekday,
    );
    const availableSet = new Set(availabilities.map((a) => a.staff_profile_id));

    const coverCountMap = await this.schedulesReadFacade.countWeeklyPeriodsPerTeacher(
      tenantId,
      academicYearId,
    );

    const results: SubstituteSuggestion[] = [];
    for (const id of candidateIds) {
      const staff = staffById.get(id);
      if (!staff) continue;
      const isPinned = pinnedIds.has(id);
      const isAvailable = availableSet.size === 0 ? true : availableSet.has(id);
      const coverCount = coverCountMap.get(id) ?? 0;

      // Ranking: pin (+25) > pool (+20). Available (+15). Cover-count penalty (−1/period).
      let rankScore = isPinned ? 25 : 20;
      if (isAvailable) rankScore += 15;
      rankScore -= coverCount;

      results.push({
        staff_profile_id: id,
        name: `${staff.user.first_name} ${staff.user.last_name}`.trim(),
        is_pinned: isPinned,
        is_available: isAvailable,
        cover_count: coverCount,
        rank_score: rankScore,
      });
    }

    results.sort((a, b) => b.rank_score - a.rank_score);
    return { data: results };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async createOneWithClass(
    tenantId: string,
    data: {
      academic_year_id: string;
      staff_profile_id: string;
      subject_id: string;
      year_group_id: string;
      class_id: string | null;
    },
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.substituteTeacherCompetency.create({
          data: { tenant_id: tenantId, ...data },
          include: INCLUDE_RELATIONS,
        });
      });
    } catch (err) {
      throw this.translatePrismaError(err);
    }
  }

  private async validateRelations(
    tenantId: string,
    staffProfileId: string,
    subjectId: string,
    yearGroupId: string,
    academicYearId: string,
  ) {
    await Promise.all([
      this.staffProfileReadFacade.existsOrThrow(tenantId, staffProfileId),
      this.academicReadFacade.findSubjectByIdOrThrow(tenantId, subjectId),
      this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, yearGroupId),
      this.academicReadFacade.findYearByIdOrThrow(tenantId, academicYearId),
    ]);
  }

  private async assertClassMatchesYearGroup(
    tenantId: string,
    classId: string,
    yearGroupId: string,
  ) {
    const cls = await this.classesReadFacade.findById(tenantId, classId);
    if (!cls) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }
    if (cls.year_group_id !== yearGroupId) {
      throw new BadRequestException({
        code: 'CLASS_YEAR_GROUP_MISMATCH',
        message: `Class "${classId}" belongs to year_group "${cls.year_group_id ?? 'null'}", not "${yearGroupId}"`,
      });
    }
  }

  private async assertPoolRowUnique(
    tenantId: string,
    academicYearId: string,
    staffProfileId: string,
    subjectId: string,
    yearGroupId: string,
    opts?: { excludeId?: string },
  ) {
    const existing = await this.prisma.substituteTeacherCompetency.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: staffProfileId,
        subject_id: subjectId,
        year_group_id: yearGroupId,
        class_id: null,
        ...(opts?.excludeId ? { id: { not: opts.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SUBSTITUTE_TEACHER_COMPETENCY_DUPLICATE',
        message:
          'A pool substitute competency for this teacher, subject, and year group already exists — edit that row instead of creating a second one.',
      });
    }
  }

  private translatePrismaError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
      return new ConflictException({
        code: 'SUBSTITUTE_TEACHER_COMPETENCY_DUPLICATE',
        message:
          'A substitute competency for this teacher, subject, year group, and class already exists.',
      });
    }
    return err as Error;
  }
}
