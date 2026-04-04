import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateTeacherCompetencyDto,
  BulkCreateTeacherCompetenciesDto,
  CopyCompetenciesToYearsDto,
} from '@school/shared';

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
} as const;

@Injectable()
export class TeacherCompetenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly gradebookReadFacade: GradebookReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── List All ──────────────────────────────────────────────────────────────

  async listAll(tenantId: string, academicYearId: string) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: INCLUDE_RELATIONS,
      orderBy: [{ staff_profile_id: 'asc' }, { subject_id: 'asc' }],
    });
    return { data };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: { is_primary?: boolean }) {
    const existing = await this.prisma.teacherCompetency.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Teacher competency not found' });
    }
    return this.prisma.teacherCompetency.update({
      where: { id },
      data: { is_primary: dto.is_primary },
      include: INCLUDE_RELATIONS,
    });
  }

  // ─── List by Teacher ───────────────────────────────────────────────────────

  async listByTeacher(tenantId: string, academicYearId: string, staffProfileId: string) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: staffProfileId,
      },
      include: INCLUDE_RELATIONS,
      orderBy: [{ subject_id: 'asc' }, { year_group_id: 'asc' }],
    });

    return { data };
  }

  // ─── List by Subject + Year Group ─────────────────────────────────────────

  async listBySubjectYear(
    tenantId: string,
    academicYearId: string,
    subjectId: string,
    yearGroupId: string,
  ) {
    const data = await this.prisma.teacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        subject_id: subjectId,
        year_group_id: yearGroupId,
      },
      include: INCLUDE_RELATIONS,
      orderBy: { is_primary: 'desc' },
    });

    return { data };
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

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherCompetency.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          staff_profile_id: dto.staff_profile_id,
          subject_id: dto.subject_id,
          year_group_id: dto.year_group_id,
          is_primary: dto.is_primary,
        },
        include: INCLUDE_RELATIONS,
      });
    });

    return record;
  }

  // ─── Bulk Create ───────────────────────────────────────────────────────────

  async bulkCreate(tenantId: string, dto: BulkCreateTeacherCompetenciesDto) {
    // Validate staff profile exists
    await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.staff_profile_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

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
            is_primary: comp.is_primary,
          },
          include: INCLUDE_RELATIONS,
        });
        created.push(record);
      }

      return created;
    })) as unknown as Record<string, unknown>[];

    return { data: result, meta: { created: result.length } };
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
            is_primary: src.is_primary,
          },
        });
        created.push(record);
      }

      return created;
    })) as unknown as Record<string, unknown>[];

    return { data: result, meta: { copied: result.length } };
  }

  // ─── Copy to Multiple Year Groups ─────────────────────────────────────────

  async copyToYears(tenantId: string, dto: CopyCompetenciesToYearsDto) {
    // Fetch source competencies for the requested subjects
    const allSubjectIds = [...new Set(dto.targets.flatMap((t) => t.subject_ids))];

    const sourceCompetencies = await this.prisma.teacherCompetency.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: dto.source_year_group_id,
        subject_id: { in: allSubjectIds },
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
          // Check if this exact competency already exists in the target
          const existing = await db.teacherCompetency.findFirst({
            where: {
              tenant_id: tenantId,
              academic_year_id: dto.academic_year_id,
              staff_profile_id: src.staff_profile_id,
              subject_id: src.subject_id,
              year_group_id: target.year_group_id,
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
                is_primary: src.is_primary,
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

  // ─── Coverage Matrix ─────────────────────────────────────────────────────

  async getCoverage(tenantId: string, academicYearId: string) {
    // 1. Get all year groups for this tenant
    const yearGroups = await this.academicReadFacade.findAllYearGroups(tenantId);

    // 2. Get all active classes grouped by year group
    const classSummaries = await this.classesReadFacade.findByAcademicYear(tenantId, academicYearId);
    const classes = classSummaries
      .filter((c) => c.status === 'active')
      .map((c) => ({ id: c.id, year_group_id: c.year_group_id }));
    const classIdsByYg = new Map<string, string[]>();
    for (const c of classes) {
      if (!c.year_group_id) continue;
      const list = classIdsByYg.get(c.year_group_id) ?? [];
      list.push(c.id);
      classIdsByYg.set(c.year_group_id, list);
    }

    // 3. Get all class-subject assignments (curriculum matrix)
    const allClassIds = classes.map((c) => c.id);
    const configsFull =
      allClassIds.length > 0
        ? await this.gradebookReadFacade.findClassSubjectConfigs(tenantId, allClassIds)
        : [];
    const configs = configsFull.map((c) => ({ class_id: c.class_id, subject_id: c.subject_id }));

    // Build set of subject IDs per year group
    const subjectIdsByYg = new Map<string, Set<string>>();
    for (const cfg of configs) {
      for (const [ygId, classIds] of classIdsByYg) {
        if (classIds.includes(cfg.class_id)) {
          const set = subjectIdsByYg.get(ygId) ?? new Set<string>();
          set.add(cfg.subject_id);
          subjectIdsByYg.set(ygId, set);
        }
      }
    }

    // 4. Get all competencies with teacher names
    const competencies = await this.prisma.teacherCompetency.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: {
        year_group_id: true,
        subject_id: true,
        staff_profile: {
          select: {
            id: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    // Group: ygId:subjectId -> teacher names
    const teacherMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const c of competencies) {
      const key = `${c.year_group_id}:${c.subject_id}`;
      const list = teacherMap.get(key) ?? [];
      const name = c.staff_profile.user
        ? `${c.staff_profile.user.first_name} ${c.staff_profile.user.last_name}`
        : c.staff_profile.id;
      list.push({ id: c.staff_profile.id, name });
      teacherMap.set(key, list);
    }

    // 5. Collect all unique subject IDs across all year groups
    const allSubjectIds = new Set<string>();
    for (const subs of subjectIdsByYg.values()) {
      for (const sid of subs) allSubjectIds.add(sid);
    }

    const subjectRecords =
      allSubjectIds.size > 0
        ? await this.academicReadFacade.findSubjectsByIdsWithOrder(tenantId, [...allSubjectIds])
        : [];

    // 6. Build the matrix
    let gaps = 0;
    let atRisk = 0;
    let covered = 0;
    let total = 0;

    const rows = yearGroups
      .filter((yg) => subjectIdsByYg.has(yg.id))
      .map((yg) => {
        const ygSubjects = subjectIdsByYg.get(yg.id) ?? new Set<string>();
        const cells = subjectRecords.map((subject) => {
          const inCurriculum = ygSubjects.has(subject.id);
          if (!inCurriculum)
            return {
              subject_id: subject.id,
              in_curriculum: false as const,
              count: 0,
              teachers: [],
            };

          const key = `${yg.id}:${subject.id}`;
          const teachers = teacherMap.get(key) ?? [];
          total++;
          if (teachers.length === 0) gaps++;
          else if (teachers.length === 1) atRisk++;
          else covered++;

          return {
            subject_id: subject.id,
            in_curriculum: true as const,
            count: teachers.length,
            teachers,
          };
        });
        return { year_group_id: yg.id, year_group_name: yg.name, cells };
      });

    return {
      subjects: subjectRecords,
      rows,
      summary: { gaps, at_risk: atRisk, covered, total },
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

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
}
