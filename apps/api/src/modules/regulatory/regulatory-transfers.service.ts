import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransferDirection, TransferStatus } from '@prisma/client';

import type {
  CreateTransferDto,
  ListTransfersQueryDto,
  UpdateTransferDto,
} from '@school/shared/regulatory';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── State machine ────────────────────────────────────────────────────────────

const VALID_TRANSFER_TRANSITIONS: Record<string, string[]> = {
  transfer_pending: ['transfer_accepted', 'transfer_rejected', 'transfer_cancelled'],
  transfer_accepted: ['transfer_completed', 'transfer_cancelled'],
  transfer_rejected: [],
  transfer_completed: [],
  transfer_cancelled: [],
};

// ─── API-to-Prisma enum mappings ──────────────────────────────────────────────

const API_STATUS_TO_PRISMA: Record<string, TransferStatus> = {
  pending: TransferStatus.transfer_pending,
  accepted: TransferStatus.transfer_accepted,
  rejected: TransferStatus.transfer_rejected,
  completed: TransferStatus.transfer_completed,
  cancelled: TransferStatus.transfer_cancelled,
};

const API_DIRECTION_TO_PRISMA: Record<string, TransferDirection> = {
  inbound: TransferDirection.inbound,
  outbound: TransferDirection.outbound,
};

@Injectable()
export class RegulatoryTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, params: ListTransfersQueryDto) {
    const { page, pageSize, direction, status, student_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.InterSchoolTransferWhereInput = { tenant_id: tenantId };

    if (direction) where.direction = API_DIRECTION_TO_PRISMA[direction];
    if (status) where.status = API_STATUS_TO_PRISMA[status];
    if (student_id) where.student_id = student_id;

    const [data, total] = await Promise.all([
      this.prisma.interSchoolTransfer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          initiated_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.interSchoolTransfer.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const transfer = await this.prisma.interSchoolTransfer.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        initiated_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!transfer) {
      throw new NotFoundException({
        code: 'TRANSFER_NOT_FOUND',
        message: `Inter-school transfer with id "${id}" not found`,
      });
    }

    return transfer;
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateTransferDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.student_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${dto.student_id}" not found`,
      });
    }

    const prismaDirection = API_DIRECTION_TO_PRISMA[dto.direction] ?? TransferDirection.outbound;
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.interSchoolTransfer.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          direction: prismaDirection,
          other_school_roll_no: dto.other_school_roll_no,
          other_school_name: dto.other_school_name ?? null,
          transfer_date: new Date(dto.transfer_date),
          leaving_reason: dto.leaving_reason ?? null,
          notes: dto.notes ?? null,
          initiated_by_id: userId,
        },
      });
    });
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateTransferDto) {
    const existing = await this.findOne(tenantId, id);

    const data: Prisma.InterSchoolTransferUncheckedUpdateInput = {};

    if (dto.status !== undefined) {
      const newStatus = API_STATUS_TO_PRISMA[dto.status] ?? TransferStatus.transfer_pending;
      const allowed = VALID_TRANSFER_TRANSITIONS[existing.status] ?? [];

      if (!allowed.includes(newStatus)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSFER_TRANSITION',
          message: `Cannot transition from "${existing.status}" to "${newStatus}"`,
        });
      }

      data.status = newStatus;
    }

    if (dto.ppod_confirmed !== undefined) {
      data.ppod_confirmed = dto.ppod_confirmed;
      if (dto.ppod_confirmed) {
        data.ppod_confirmed_at = new Date();
      }
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.interSchoolTransfer.update({ where: { id }, data });
    });
  }
}
