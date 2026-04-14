import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  BulkCreateTeacherCompetenciesDto,
  CopyCompetenciesToYearsDto,
  CreateTeacherCompetencyDto,
  ListTeacherCompetenciesQuery,
  UpdateTeacherCompetencyDto,
} from '@school/shared';
import { resolveTeacherCandidates } from '@school/shared/scheduler';
import type { TeacherInputV2 } from '@school/shared/scheduler';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { PrismaService } from '../prisma/prisma.service';
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

// The unique index on `teacher_competencies` is
// (tenant, academic_year, staff, subject, year_group, class_id). Postgres
// treats NULL as distinct for uniqueness, so the DB cannot prevent two pool
// rows (class_id IS NULL) with otherwise identical keys. The service layer
// enforces the pool-row invariant before insert.
const P2002 = 'P2002';

@Injectable()
export class TeacherCompetenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly gradebookReadFacade: GradebookReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── List ───────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListTeacherCompetenciesQuery) {
    const where: Prisma.TeacherCompetencyWhereInput = {
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

    const data = await this.prisma.teacherCompetency.findMany({
      where,
      include: INCLUDE_RELATIONS,
      orderBy: [{ staff_profile_id: 'asc' }, { subject_id: 'asc' }, { year_group_id: 'asc' }],
    });
    return { data };
  }

  // Backwards-compatible convenience used by the controller's legacy GET /.
  async listAll(tenantId: string, academicYearId: string) {
    return this.list(tenantId, { academic_year_id: academicYearId });
  }

  // ─── List by Teacher ───────────────────────────────────────────────────────

  async listByTeacher(tenantId: string, academicYearId: string, staffProfileId: string) {
    return this.list(tenantId, {
      academic_year_id: academicYearId,
      staff_profile_id: staffProfileId,
    });
  }

  // ─── List by Subject + Year Group ─────────────────────────────────────────

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

  async create(tenantId: string, dto: CreateTeacherCompetencyDto) {
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
      // Enforce pool-row uniqueness at the application layer (DB can't: NULL != NULL).
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

  async update(tenantId: string, id: string, dto: UpdateTeacherCompetencyDto) {
    const existing = await this.prisma.teacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
      include: INCLUDE_RELATIONS,
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_COMPETENCY_NOT_FOUND',
        message: `Teacher competency "${id}" not found`,
      });
    }

    // No-op body → return current row (keeps the PATCH endpoint friendly for
    // frontends that issue "refresh" PATCHes).
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
        return db.teacherCompetency.update({
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

  async bulkCreate(tenantId: string, dto: BulkCreateTeacherCompetenciesDto) {
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
          const record = await db.teacherCompetency.create({
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
    const existing = await this.prisma.teacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_COMPETENCY_NOT_FOUND',
        message: `Teacher competency "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherCompetency.delete({ where: { id } });
    });

    return { message: 'Teacher competency deleted' };
  }

  // ─── Delete All for Teacher ────────────────────────────────────────────────

  async deleteAllForTeacher(tenantId: string, academicYearId: string, staffProfileId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherCompetency.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          staff_profile_id: staffProfileId,
        },
      });
    })) as unknown as { count: number };

    return { message: 'All competencies deleted', meta: { deleted: result.count } };
  }

  // ─── Copy from Academic Year ───────────────────────────────────────────────

  async copyFromAcademicYear(tenantId: string, sourceYearId: string, targetYearId: string) {
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, sourceYearId);
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, targetYearId);

    const sourceRecords = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: sourceYearId },
    });

    if (sourceRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message: 'No teacher competencies found in the source academic year',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        const created = [];
        for (const src of sourceRecords) {
          const record = await db.teacherCompetency.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: targetYearId,
              staff_profile_id: src.staff_profile_id,
              subject_id: src.subject_id,
              year_group_id: src.year_group_id,
              // Pins carry over verbatim — the target academic year is assumed
              // to have the same class_id values (Stage 5 seeding handles fresh
              // years). Missing target classes will surface as FK errors that
              // the caller should treat as CONFLICT.
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

  async copyToYears(tenantId: string, dto: CopyCompetenciesToYearsDto) {
    const allSubjectIds = [...new Set(dto.targets.flatMap((t) => t.subject_ids))];

    // Copy operates on pool entries only — pins are tied to a specific class
    // that does not exist in the target year group.
    const sourceCompetencies = await this.prisma.teacherCompetency.findMany({
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
        message: 'No teacher competencies found in the source year group for the selected subjects',
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
          const existing = await db.teacherCompetency.findFirst({
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
            await db.teacherCompetency.create({
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

  // ─── Coverage Matrix (per-class) ──────────────────────────────────────────

  /**
   * Returns per-class coverage: every `(class, subject)` combination from the
   * curriculum matrix resolved through the pin-first, pool-fallback model from
   * `resolveTeacherCandidates`. Each row reports `mode`, the eligible teacher
   * count for that cell, and enough naming context for the UI to group rows
   * by year group.
   */
  async getCoverage(tenantId: string, academicYearId: string) {
    const yearGroups = await this.academicReadFacade.findAllYearGroups(tenantId);
    const yearGroupNameById = new Map(yearGroups.map((yg) => [yg.id, yg.name]));

    const classSummaries = await this.classesReadFacade.findByAcademicYear(
      tenantId,
      academicYearId,
    );
    const activeClasses = classSummaries.filter((c) => c.status === 'active' && c.year_group_id);

    // curriculum: (class, subject) -> subject name
    const allClassIds = activeClasses.map((c) => c.id);
    const configsFull =
      allClassIds.length > 0
        ? await this.gradebookReadFacade.findClassSubjectConfigs(tenantId, allClassIds)
        : [];

    const subjectIdsByClass = new Map<string, Set<string>>();
    for (const cfg of configsFull) {
      const set = subjectIdsByClass.get(cfg.class_id) ?? new Set<string>();
      set.add(cfg.subject_id);
      subjectIdsByClass.set(cfg.class_id, set);
    }

    const allSubjectIds = new Set<string>();
    for (const subs of subjectIdsByClass.values()) {
      for (const s of subs) allSubjectIds.add(s);
    }
    const subjectRecords =
      allSubjectIds.size > 0
        ? await this.academicReadFacade.findSubjectsByIdsWithOrder(tenantId, [...allSubjectIds])
        : [];
    const subjectNameById = new Map(subjectRecords.map((s) => [s.id, s.name]));

    const competencies = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: {
        staff_profile_id: true,
        subject_id: true,
        year_group_id: true,
        class_id: true,
      },
    });

    // Build the minimal `TeacherInputV2` shape required by
    // `resolveTeacherCandidates`. The helper only reads `staff_profile_id` and
    // `competencies`; the other fields are inert defaults that keep the type
    // contract honest without touching unrelated facades here.
    const teachersByStaffId = new Map<string, TeacherInputV2>();
    for (const c of competencies) {
      const entry: TeacherInputV2 = teachersByStaffId.get(c.staff_profile_id) ?? {
        staff_profile_id: c.staff_profile_id,
        name: '',
        competencies: [],
        availability: [],
        preferences: [],
        max_periods_per_week: null,
        max_periods_per_day: null,
        max_supervision_duties_per_week: null,
      };
      entry.competencies.push({
        subject_id: c.subject_id,
        year_group_id: c.year_group_id,
        class_id: c.class_id,
      });
      teachersByStaffId.set(c.staff_profile_id, entry);
    }
    const teachers = [...teachersByStaffId.values()];

    type CoverageRow = {
      class_id: string;
      class_name: string;
      year_group_id: string;
      year_group_name: string;
      subject_id: string;
      subject_name: string;
      mode: 'pinned' | 'pool' | 'missing';
      eligible_teacher_count: number;
    };

    const rows: CoverageRow[] = [];
    let pinned = 0;
    let pool = 0;
    let missing = 0;

    for (const cls of activeClasses) {
      if (!cls.year_group_id) continue;
      const subjectsForClass = subjectIdsByClass.get(cls.id) ?? new Set<string>();
      for (const subjectId of subjectsForClass) {
        const resolution = resolveTeacherCandidates(teachers, cls.id, cls.year_group_id, subjectId);

        let eligibleTeacherCount: number;
        let mode: CoverageRow['mode'];
        if (resolution.mode === 'pinned') {
          mode = 'pinned';
          eligibleTeacherCount = 1;
          pinned++;
        } else if (resolution.mode === 'pool') {
          mode = 'pool';
          eligibleTeacherCount = resolution.teacher_ids.length;
          pool++;
        } else {
          mode = 'missing';
          eligibleTeacherCount = 0;
          missing++;
        }

        rows.push({
          class_id: cls.id,
          class_name: cls.name,
          year_group_id: cls.year_group_id,
          year_group_name: yearGroupNameById.get(cls.year_group_id) ?? '',
          subject_id: subjectId,
          subject_name: subjectNameById.get(subjectId) ?? '',
          mode,
          eligible_teacher_count: eligibleTeacherCount,
        });
      }
    }

    return {
      rows,
      summary: { pinned, pool, missing, total: rows.length },
    };
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
        return db.teacherCompetency.create({
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
    const existing = await this.prisma.teacherCompetency.findFirst({
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
        code: 'TEACHER_COMPETENCY_DUPLICATE',
        message:
          'A pool competency for this teacher, subject, and year group already exists — edit that row instead of creating a second one.',
      });
    }
  }

  private translatePrismaError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
      return new ConflictException({
        code: 'TEACHER_COMPETENCY_DUPLICATE',
        message: 'A competency for this teacher, subject, year group, and class already exists.',
      });
    }
    return err as Error;
  }
}
