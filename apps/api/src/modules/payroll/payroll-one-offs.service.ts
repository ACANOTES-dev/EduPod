import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import type { CreateOneOffItemDto, UpdateOneOffItemDto } from '@school/shared';

import { withRls } from '../../common/helpers/with-rls';
import { PrismaService } from '../prisma/prisma.service';

// item_type values that subtract from net_pay. Anything else (bonus,
// award, correction-positive) adds. Mapping derived from the audit's
// findings on the live schema.
const NEGATIVE_ONE_OFF_TYPES = new Set<string>(['deduction', 'correction-negative']);

@Injectable()
export class PayrollOneOffsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOneOffItem(
    tenantId: string,
    entryId: string,
    userId: string,
    dto: CreateOneOffItemDto,
  ) {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
      include: { payroll_run: { select: { status: true } } },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry "${entryId}" not found`,
      });
    }

    if (entry.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'One-off items can only be added when the payroll run is in draft status',
      });
    }

    return withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      const item = await tx.payrollOneOffItem.create({
        data: {
          tenant_id: tenantId,
          payroll_entry_id: entryId,
          description: dto.description,
          amount: dto.amount,
          item_type: dto.item_type,
          created_by_user_id: userId,
        },
      });

      return this.serializeItem(item);
    });
  }

  async listOneOffItems(tenantId: string, entryId: string) {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry "${entryId}" not found`,
      });
    }

    const items = await this.prisma.payrollOneOffItem.findMany({
      where: { payroll_entry_id: entryId, tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    return { data: items.map((i) => this.serializeItem(i)) };
  }

  async getOneOffItem(tenantId: string, itemId: string) {
    const item = await this.prisma.payrollOneOffItem.findFirst({
      where: { id: itemId, tenant_id: tenantId },
    });

    if (!item) {
      throw new NotFoundException({
        code: 'ONE_OFF_ITEM_NOT_FOUND',
        message: `One-off item "${itemId}" not found`,
      });
    }

    return this.serializeItem(item);
  }

  async updateOneOffItem(tenantId: string, itemId: string, dto: UpdateOneOffItemDto) {
    const item = await this.prisma.payrollOneOffItem.findFirst({
      where: { id: itemId, tenant_id: tenantId },
      include: {
        payroll_entry: {
          include: { payroll_run: { select: { status: true } } },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({
        code: 'ONE_OFF_ITEM_NOT_FOUND',
        message: `One-off item "${itemId}" not found`,
      });
    }

    if (item.payroll_entry.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'One-off items can only be modified when the payroll run is in draft status',
      });
    }

    const updated = await this.prisma.payrollOneOffItem.update({
      where: { id: itemId },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.item_type !== undefined && { item_type: dto.item_type }),
      },
    });

    return this.serializeItem(updated);
  }

  async deleteOneOffItem(tenantId: string, itemId: string) {
    const item = await this.prisma.payrollOneOffItem.findFirst({
      where: { id: itemId, tenant_id: tenantId },
      include: {
        payroll_entry: {
          include: { payroll_run: { select: { status: true } } },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({
        code: 'ONE_OFF_ITEM_NOT_FOUND',
        message: `One-off item "${itemId}" not found`,
      });
    }

    if (item.payroll_entry.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'One-off items can only be deleted when the payroll run is in draft status',
      });
    }

    await this.prisma.payrollOneOffItem.delete({ where: { id: itemId } });
    return { id: itemId, deleted: true };
  }

  /**
   * Wave-2 PayrollInputResolver — split one-offs by sign.
   * Returns { positive, negative } magnitudes (both always >= 0). The
   * calculation engine applies positives to gross and subtracts negatives
   * from gross. Splits by `item_type` first; falls back to the sign of
   * `amount` if the type is unrecognised.
   */
  async sumByEntry(
    tenantId: string,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ positive: Decimal; negative: Decimal }> {
    const db = tx ?? this.prisma;
    const rows = await db.payrollOneOffItem.findMany({
      where: { tenant_id: tenantId, payroll_entry_id: entryId },
    });

    let positive = new Decimal(0);
    let negative = new Decimal(0);
    for (const r of rows) {
      const amount = new Decimal(r.amount.toString());
      const isNegative = NEGATIVE_ONE_OFF_TYPES.has(r.item_type) || amount.isNegative();
      if (isNegative) {
        negative = negative.plus(amount.abs());
      } else {
        positive = positive.plus(amount);
      }
    }
    return { positive, negative };
  }

  private serializeItem(item: Record<string, unknown>): Record<string, unknown> {
    return {
      ...item,
      amount: Number(item['amount']),
    };
  }
}
