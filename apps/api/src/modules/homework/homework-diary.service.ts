import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import type { CreateDiaryNoteDto } from './dto/create-diary-note.dto';
import type { CreateParentNoteDto } from './dto/create-parent-note.dto';

// ─── Query types ──────────────────────────────────────────────────────────────

interface DiaryQuery {
  page: number;
  pageSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkDiaryService {
  private readonly logger = new Logger(HomeworkDiaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
  ) {}

  // ─── Personal diary notes ─────────────────────────────────────────────────

  /**
   * Paginated list of diary notes for a student, ordered by note_date desc.
   */
  async listNotes(tenantId: string, studentId: string, query: DiaryQuery) {
    await this.verifyStudentExists(tenantId, studentId);

    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DiaryNoteWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    const [data, total] = await Promise.all([
      this.prisma.diaryNote.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { note_date: 'desc' },
      }),
      this.prisma.diaryNote.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Create a diary note for a student. One note per date is enforced via unique constraint.
   */
  async createNote(tenantId: string, studentId: string, dto: CreateDiaryNoteDto) {
    await this.verifyStudentExists(tenantId, studentId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      try {
        const note = await db.diaryNote.create({
          data: {
            tenant_id: tenantId,
            student_id: studentId,
            note_date: new Date(dto.note_date),
            content: dto.content,
          },
        });

        return note;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BadRequestException({
            code: 'DIARY_NOTE_EXISTS',
            message: 'A diary note already exists for this date',
          });
        }
        throw err;
      }
    });
  }

  /**
   * Update the content of a diary note identified by student + note_date.
   */
  async updateNote(tenantId: string, studentId: string, noteDate: string, content: string) {
    const existing = await this.prisma.diaryNote.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        note_date: new Date(noteDate),
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DIARY_NOTE_NOT_FOUND',
        message: `Diary note for student "${studentId}" on date "${noteDate}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.diaryNote.update({
        where: { id: existing.id },
        data: { content },
      });
    });
  }

  // ─── Parent-teacher notes ─────────────────────────────────────────────────

  /**
   * Paginated list of parent-teacher notes for a student, ordered by note_date desc.
   * Includes parent and author info.
   */
  async listParentNotes(tenantId: string, studentId: string, query: DiaryQuery) {
    await this.verifyStudentExists(tenantId, studentId);

    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DiaryParentNoteWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    const [data, total] = await Promise.all([
      this.prisma.diaryParentNote.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { note_date: 'desc' },
        include: {
          parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          author: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.diaryParentNote.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Create a parent-teacher note for a student.
   * Resolves parent_id if the author is a parent user.
   */
  async createParentNote(
    tenantId: string,
    studentId: string,
    userId: string,
    dto: CreateParentNoteDto,
  ) {
    await this.verifyStudentExists(tenantId, studentId);

    // Resolve parent_id if the user is linked to a parent record
    const parentId = await this.parentReadFacade.resolveIdByUserId(tenantId, userId);
    const parentRecord = parentId ? { id: parentId } : null;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.diaryParentNote.create({
        data: {
          tenant_id: tenantId,
          student_id: studentId,
          parent_id: parentRecord?.id ?? null,
          author_user_id: userId,
          note_date: new Date(dto.note_date),
          content: dto.content,
        },
        include: {
          parent: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          author: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });
    });
  }

  /**
   * Acknowledge a parent-teacher note. Sets acknowledged = true and records the timestamp.
   */
  async acknowledgeNote(tenantId: string, noteId: string, _userId: string) {
    const existing = await this.prisma.diaryParentNote.findFirst({
      where: { id: noteId, tenant_id: tenantId },
      select: { id: true, acknowledged: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'DIARY_NOTE_NOT_FOUND',
        message: `Parent note with id "${noteId}" not found`,
      });
    }

    if (existing.acknowledged) {
      throw new BadRequestException({
        code: 'NOTE_ALREADY_ACKNOWLEDGED',
        message: 'This note has already been acknowledged',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.diaryParentNote.update({
        where: { id: noteId },
        data: {
          acknowledged: true,
          acknowledged_at: new Date(),
        },
      });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Verify that a student exists within the tenant. Throws NotFoundException if not found.
   */
  private async verifyStudentExists(tenantId: string, studentId: string) {
    await this.studentReadFacade.existsOrThrow(tenantId, studentId);
  }
}
