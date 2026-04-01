import { BadRequestException } from '@nestjs/common';

import type { CreateConcernDto, UpdateConcernMetadataDto } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

import type { ConcernRow } from './concern.types';

export class ConcernRelationsService {
  extractInvolvedStudentIds(
    studentsInvolved:
      | CreateConcernDto['students_involved']
      | UpdateConcernMetadataDto['students_involved'],
  ): string[] {
    return studentsInvolved?.map((student) => student.student_id) ?? [];
  }

  async assertInvolvedStudentsExist(
    db: PrismaService,
    tenantId: string,
    primaryStudentId: string,
    involvedStudentIds: string[],
  ): Promise<void> {
    const uniqueStudentIds = [...new Set(involvedStudentIds)];

    if (uniqueStudentIds.length === 0) {
      return;
    }

    if (uniqueStudentIds.includes(primaryStudentId)) {
      throw new BadRequestException({
        code: 'PRIMARY_STUDENT_DUPLICATED',
        message: 'students_involved cannot include the primary student',
      });
    }

    const students = await db.student.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: uniqueStudentIds },
      },
      select: { id: true },
    });

    if (students.length !== uniqueStudentIds.length) {
      const existingIds = new Set(students.map((student) => student.id));
      const missingIds = uniqueStudentIds.filter((id) => !existingIds.has(id));

      throw new BadRequestException({
        code: 'INVALID_INVOLVED_STUDENT_IDS',
        message: `One or more students involved were not found: ${missingIds.join(', ')}`,
      });
    }
  }

  async syncInvolvedStudents(
    db: PrismaService,
    tenantId: string,
    concernId: string,
    nextStudentIds: string[],
  ): Promise<void> {
    const existingLinks = await db.pastoralConcernInvolvedStudent.findMany({
      where: {
        tenant_id: tenantId,
        concern_id: concernId,
      },
      select: { student_id: true },
    });

    const existingStudentIds = existingLinks.map((link) => link.student_id);
    const toCreate = nextStudentIds.filter((studentId) => !existingStudentIds.includes(studentId));
    const toDelete = existingStudentIds.filter((studentId) => !nextStudentIds.includes(studentId));

    if (toDelete.length > 0) {
      await db.pastoralConcernInvolvedStudent.deleteMany({
        where: {
          tenant_id: tenantId,
          concern_id: concernId,
          student_id: { in: toDelete },
        },
      });
    }

    if (toCreate.length > 0) {
      await db.pastoralConcernInvolvedStudent.createMany({
        data: toCreate.map((studentId) => ({
          concern_id: concernId,
          student_id: studentId,
          tenant_id: tenantId,
        })),
      });
    }
  }

  async loadConcernWithRelations(db: PrismaService, concernId: string): Promise<ConcernRow | null> {
    return (await db.pastoralConcern.findUnique({
      where: { id: concernId },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        logged_by: { select: { first_name: true, last_name: true } },
        involved_students: {
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
          },
          orderBy: { added_at: 'asc' },
        },
        versions: { orderBy: { version_number: 'asc' } },
      },
    })) as ConcernRow | null;
  }
}
