import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { BulkEnrolDto } from './dto/bulk-enrol.dto';
import type { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import type { UpdateEnrolmentStatusDto } from './dto/update-enrolment-status.dto';

type EnrolmentStatus = 'active' | 'dropped' | 'completed';

const VALID_ENROLMENT_TRANSITIONS: Record<EnrolmentStatus, EnrolmentStatus[]> = {
  active: ['dropped', 'completed'],
  dropped: ['active'],
  completed: [],
};

@Injectable()
export class ClassEnrolmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, classId: string, dto: CreateEnrolmentDto) {
    // Check class exists and belongs to tenant
    const classEntity = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    // Check student is not already actively enrolled in this class
    const existingEnrolment = await this.prisma.classEnrolment.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        student_id: dto.student_id,
        status: 'active',
      },
    });

    if (existingEnrolment) {
      throw new ConflictException({
        code: 'STUDENT_ALREADY_ENROLLED',
        message: `Student is already actively enrolled in this class`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.classEnrolment.create({
        data: {
          tenant_id: tenantId,
          class_id: classId,
          student_id: dto.student_id,
          status: 'active',
          start_date: new Date(dto.start_date),
        },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              full_name: true,
              student_number: true,
            },
          },
        },
      });
    });
  }

  async findAllForClass(
    tenantId: string,
    classId: string,
    statusFilter?: string,
  ) {
    // Verify class belongs to tenant
    const classEntity = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    const where: Prisma.ClassEnrolmentWhereInput = {
      tenant_id: tenantId,
      class_id: classId,
    };

    if (statusFilter) {
      where.status = statusFilter as $Enums.ClassEnrolmentStatus;
    }

    const enrolments = await this.prisma.classEnrolment.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { start_date: 'desc' },
      ],
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            full_name: true,
            student_number: true,
          },
        },
      },
    });

    return { data: enrolments };
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateEnrolmentStatusDto) {
    const enrolment = await this.prisma.classEnrolment.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!enrolment) {
      throw new NotFoundException({
        code: 'ENROLMENT_NOT_FOUND',
        message: `Class enrolment with id "${id}" not found`,
      });
    }

    const currentStatus = enrolment.status as EnrolmentStatus;
    const newStatus = dto.status as EnrolmentStatus;
    const allowedTransitions = VALID_ENROLMENT_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition enrolment from "${currentStatus}" to "${newStatus}"`,
      });
    }

    // When dropping or completing, set end_date
    let endDate: Date | undefined;
    if (newStatus === 'dropped' || newStatus === 'completed') {
      endDate = dto.end_date ? new Date(dto.end_date) : new Date();
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.classEnrolment.update({
        where: { id },
        data: {
          status: newStatus,
          ...(endDate !== undefined ? { end_date: endDate } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              full_name: true,
              student_number: true,
            },
          },
        },
      });
    });
  }

  async bulkEnrol(
    tenantId: string,
    classId: string,
    dto: BulkEnrolDto,
  ): Promise<{
    enrolled: number;
    skipped: number;
    errors: Array<{ student_id: string; reason: string }>;
  }> {
    // Verify class belongs to tenant
    const classEntity = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    let enrolled = 0;
    let skipped = 0;
    const errors: Array<{ student_id: string; reason: string }> = [];

    for (const studentId of dto.student_ids) {
      try {
        // Check for existing active enrolment
        const existing = await this.prisma.classEnrolment.findFirst({
          where: {
            tenant_id: tenantId,
            class_id: classId,
            student_id: studentId,
            status: 'active',
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

        await prismaWithRls.$transaction(async (tx) => {
          const db = tx as unknown as PrismaService;
          await db.classEnrolment.create({
            data: {
              tenant_id: tenantId,
              class_id: classId,
              student_id: studentId,
              status: 'active',
              start_date: new Date(dto.start_date),
            },
          });
        });

        enrolled++;
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : 'Unknown error';
        errors.push({ student_id: studentId, reason });
      }
    }

    return { enrolled, skipped, errors };
  }

  /**
   * Drop all active class enrolments for a student.
   * Used by StudentsService for withdrawal side-effects.
   * Accepts an optional transaction client to run within an existing transaction.
   */
  async dropAllActiveForStudent(
    tenantId: string,
    studentId: string,
    tx?: PrismaService,
  ): Promise<void> {
    const today = new Date();
    const db = tx ?? this.prisma;

    await db.classEnrolment.updateMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
      },
      data: {
        status: 'dropped',
        end_date: today,
      },
    });
  }
}
