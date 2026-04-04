import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import type { BulkClassAssignmentDto } from './dto/bulk-class-assignment.dto';

@Injectable()
export class ClassAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async getAssignments(tenantId: string) {
    // Find the current (active) academic year for this tenant
    const activeAcademicYear = await this.academicReadFacade.findCurrentYear(tenantId);

    if (!activeAcademicYear) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found',
      });
    }

    // Fetch all active students with a year_group assigned
    const students = await this.studentReadFacade.findManyGeneric(tenantId, {
      where: {
        status: 'active',
        year_group_id: { not: null },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        year_group_id: true,
        class_homeroom_id: true,
        homeroom_class: {
          select: { id: true, name: true },
        },
      },
      orderBy: { last_name: 'asc' },
    }) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      student_number: string | null;
      year_group_id: string | null;
      class_homeroom_id: string | null;
      homeroom_class: { id: string; name: string } | null;
    }>;

    // Fetch all active homeroom classes for the current academic year
    const homeroomClasses = await this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        subject_id: null,
        status: 'active',
        academic_year_id: activeAcademicYear.id,
      },
      select: {
        id: true,
        name: true,
        year_group_id: true,
        max_capacity: true,
        _count: {
          select: {
            class_enrolments: {
              where: { status: 'active' },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch all year groups for this tenant
    const yearGroups = await this.academicReadFacade.findAllYearGroupsWithOrder(tenantId);

    // Group students by year_group
    const studentsByYearGroup = new Map<string, typeof students>();
    for (const student of students) {
      const ygId = student.year_group_id as string;
      if (!studentsByYearGroup.has(ygId)) {
        studentsByYearGroup.set(ygId, []);
      }
      studentsByYearGroup.get(ygId)!.push(student);
    }

    // Group homeroom classes by year_group
    const classesByYearGroup = new Map<string, typeof homeroomClasses>();
    for (const cls of homeroomClasses) {
      const ygId = cls.year_group_id;
      if (ygId) {
        if (!classesByYearGroup.has(ygId)) {
          classesByYearGroup.set(ygId, []);
        }
        classesByYearGroup.get(ygId)!.push(cls);
      }
    }

    let unassignedCount = 0;

    const yearGroupResults = yearGroups
      .filter((yg) => studentsByYearGroup.has(yg.id) || classesByYearGroup.has(yg.id))
      .map((yg) => {
        const ygStudents = studentsByYearGroup.get(yg.id) ?? [];
        const ygClasses = classesByYearGroup.get(yg.id) ?? [];

        const mappedStudents = ygStudents.map((s) => {
          if (!s.class_homeroom_id) {
            unassignedCount++;
          }
          return {
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            student_number: s.student_number,
            current_homeroom_class_id: s.class_homeroom_id,
            current_homeroom_class_name: s.homeroom_class?.name ?? null,
          };
        });

        const mappedClasses = ygClasses.map((c) => ({
          id: c.id,
          name: c.name,
          enrolled_count: c._count.class_enrolments,
          max_capacity: c.max_capacity,
        }));

        return {
          id: yg.id,
          name: yg.name,
          display_order: yg.display_order,
          homeroom_classes: mappedClasses,
          students: mappedStudents,
        };
      });

    return {
      year_groups: yearGroupResults,
      unassigned_count: unassignedCount,
    };
  }

  async bulkAssign(
    tenantId: string,
    dto: BulkClassAssignmentDto,
  ): Promise<{
    assigned: number;
    skipped: number;
    errors: Array<{ student_id: string; reason: string }>;
  }> {
    let assigned = 0;
    let skipped = 0;
    const errors: Array<{ student_id: string; reason: string }> = [];

    const startDate = new Date(dto.start_date);
    const today = new Date();

    const studentIds = [...new Set(dto.assignments.map((a) => a.student_id))];
    const classIds = [...new Set(dto.assignments.map((a) => a.class_id))];

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx: Prisma.TransactionClient) => {
      // Fetch all referenced students and classes inside the transaction for RLS + consistency
      const [studentRows, classRows] = await Promise.all([
        tx.student.findMany({
          where: { id: { in: studentIds }, tenant_id: tenantId },
          select: { id: true, status: true, year_group_id: true, class_homeroom_id: true },
        }),
        tx.class.findMany({
          where: { id: { in: classIds }, tenant_id: tenantId },
          select: { id: true, status: true, subject_id: true, year_group_id: true },
        }),
      ]);

      const studentsMap = new Map(studentRows.map((r) => [r.id, r]));
      const classesMap = new Map(classRows.map((r) => [r.id, r]));

      for (const assignment of dto.assignments) {
        const { student_id, class_id } = assignment;

        // 1. Validate student
        const student = studentsMap.get(student_id);
        if (!student) {
          errors.push({ student_id, reason: 'Student not found' });
          continue;
        }
        if (student.status !== 'active') {
          errors.push({ student_id, reason: 'Student is not active' });
          continue;
        }

        // 2. Validate class
        const classEntity = classesMap.get(class_id);
        if (!classEntity) {
          errors.push({ student_id, reason: `Class "${class_id}" not found` });
          continue;
        }
        if (classEntity.status !== 'active') {
          errors.push({ student_id, reason: `Class "${class_id}" is not active` });
          continue;
        }
        if (classEntity.subject_id !== null) {
          errors.push({ student_id, reason: `Class "${class_id}" is not a homeroom class` });
          continue;
        }

        // 3. Validate year group match
        if (student.year_group_id !== classEntity.year_group_id) {
          errors.push({
            student_id,
            reason: 'Student year group does not match class year group',
          });
          continue;
        }

        // 4. Check if already enrolled in this same class
        if (student.class_homeroom_id === class_id) {
          skipped++;
          continue;
        }

        // 5. Drop existing active homeroom enrolment (different class)
        if (student.class_homeroom_id && student.class_homeroom_id !== class_id) {
          await tx.classEnrolment.updateMany({
            where: {
              tenant_id: tenantId,
              student_id,
              class_id: student.class_homeroom_id,
              status: 'active',
            },
            data: {
              status: 'dropped',
              end_date: today,
            },
          });
        }

        // 6. Check for existing active enrolment in the target class
        const existingEnrolment = await tx.classEnrolment.findFirst({
          where: {
            tenant_id: tenantId,
            student_id,
            class_id,
            status: 'active',
          },
          select: { id: true },
        });

        if (existingEnrolment) {
          // Already has an active enrolment — just update homeroom pointer
          await tx.student.update({
            where: { id: student_id },
            data: { class_homeroom_id: class_id },
          });
          assigned++;
          continue;
        }

        // 7. Create new enrolment
        await tx.classEnrolment.create({
          data: {
            tenant_id: tenantId,
            class_id,
            student_id,
            status: 'active',
            start_date: startDate,
          },
        });

        // 8. Update student homeroom pointer
        await tx.student.update({
          where: { id: student_id },
          data: { class_homeroom_id: class_id },
        });

        assigned++;
      }
    });

    return { assigned, skipped, errors };
  }

  /**
   * Get export data: students grouped by subclass with full details + branding.
   */
  async getExportData(tenantId: string) {
    const activeAcademicYear = await this.academicReadFacade.findCurrentYear(tenantId);

    if (!activeAcademicYear) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found',
      });
    }

    // Fetch students with gender and DOB
    const students = await this.studentReadFacade.findManyGeneric(tenantId, {
      where: {
        status: 'active',
        year_group_id: { not: null },
        class_homeroom_id: { not: null },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        middle_name: true,
        student_number: true,
        national_id: true,
        nationality: true,
        city_of_birth: true,
        gender: true,
        date_of_birth: true,
        medical_notes: true,
        has_allergy: true,
        allergy_details: true,
        class_homeroom_id: true,
        year_group_id: true,
        student_parents: {
          include: {
            parent: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { last_name: 'asc' },
    }) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      middle_name: string | null;
      student_number: string | null;
      national_id: string | null;
      nationality: string | null;
      city_of_birth: string | null;
      gender: string | null;
      date_of_birth: Date | null;
      medical_notes: string | null;
      has_allergy: boolean;
      allergy_details: string | null;
      class_homeroom_id: string | null;
      year_group_id: string | null;
      student_parents: Array<{
        parent: { first_name: string; last_name: string; email: string | null; phone: string | null };
      }>;
    }>;

    // Fetch homeroom classes
    const classes = await this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        subject_id: null,
        status: 'active',
        academic_year_id: activeAcademicYear.id,
      },
      select: {
        id: true,
        name: true,
        year_group_id: true,
        year_group: { select: { name: true, display_order: true } },
      },
      orderBy: [
        { year_group: { display_order: 'asc' } },
        { name: 'asc' },
      ],
    });

    // Fetch branding
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    const tenantName = await this.tenantReadFacade.findNameById(tenantId);

    // Group students by class
    const studentsByClass = new Map<string, typeof students>();
    for (const student of students) {
      const classId = student.class_homeroom_id as string;
      if (!studentsByClass.has(classId)) {
        studentsByClass.set(classId, []);
      }
      studentsByClass.get(classId)!.push(student);
    }

    const classLists = classes.map((cls) => ({
      class_id: cls.id,
      class_name: cls.name,
      year_group_name: cls.year_group?.name ?? '',
      students: (studentsByClass.get(cls.id) ?? []).map((s) => ({
        student_number: s.student_number,
        first_name: s.first_name,
        middle_name: s.middle_name,
        last_name: s.last_name,
        national_id: s.national_id,
        nationality: s.nationality,
        city_of_birth: s.city_of_birth,
        gender: s.gender,
        date_of_birth: s.date_of_birth,
        medical_notes: s.medical_notes,
        has_allergy: s.has_allergy,
        allergy_details: s.allergy_details,
        parents: s.student_parents.map((sp: { parent: { first_name: string; last_name: string; email: string | null; phone: string | null } }) => ({
          first_name: sp.parent.first_name,
          last_name: sp.parent.last_name,
          email: sp.parent.email,
          phone: sp.parent.phone,
        })),
      })),
    }));

    return {
      academic_year: activeAcademicYear.name,
      school_name: branding?.school_name_display ?? tenantName ?? '',
      logo_url: branding?.logo_url ?? null,
      class_lists: classLists,
    };
  }
}
