import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

import type { ApplyCreditNoteDto, CreateCreditNoteDto, CreditNoteQueryDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { isPayableStatus, roundMoney } from './helpers/invoice-status.helper';
import { serializeDecimal } from './helpers/serialize-decimal.helper';
import { InvoicesService } from './invoices.service';

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async findAll(tenantId: string, query: CreditNoteQueryDto) {
    const { page, pageSize, household_id } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (household_id) where.household_id = household_id;

    const [data, total] = await Promise.all([
      this.prisma.creditNote.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          household: { select: { id: true, household_name: true } },
          applications: {
            select: {
              id: true,
              invoice_id: true,
              applied_amount: true,
              applied_at: true,
            },
          },
        },
      }),
      this.prisma.creditNote.count({ where }),
    ]);

    return {
      data: data.map((cn) => this.serialize(cn)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const cn = await this.prisma.creditNote.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        household: { select: { id: true, household_name: true } },
        applications: {
          include: {
            invoice: {
              select: { id: true, invoice_number: true },
            },
          },
          orderBy: { applied_at: 'desc' },
        },
      },
    });

    if (!cn) {
      throw new NotFoundException({
        code: 'CREDIT_NOTE_NOT_FOUND',
        message: `Credit note "${id}" not found`,
      });
    }

    return this.serialize(cn);
  }

  async create(tenantId: string, userId: string, dto: CreateCreditNoteDto) {
    const household = await this.prisma.household.findFirst({
      where: { id: dto.household_id, tenant_id: tenantId },
    });
    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household "${dto.household_id}" not found`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const number = await this.sequenceService.nextNumber(tenantId, 'credit_note', tx, 'CN');

      const cn = await db.creditNote.create({
        data: {
          tenant_id: tenantId,
          household_id: dto.household_id,
          credit_note_number: number,
          amount: dto.amount,
          remaining_balance: dto.amount,
          reason: dto.reason,
          issued_by_user_id: userId,
          issued_at: new Date(),
        },
        include: {
          household: { select: { id: true, household_name: true } },
          applications: true,
        },
      });

      return this.serialize(cn);
    });
  }

  async applyToInvoice(tenantId: string, userId: string, dto: ApplyCreditNoteDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const cn = await db.creditNote.findFirst({
        where: { id: dto.credit_note_id, tenant_id: tenantId },
      });
      if (!cn) {
        throw new NotFoundException({
          code: 'CREDIT_NOTE_NOT_FOUND',
          message: `Credit note "${dto.credit_note_id}" not found`,
        });
      }

      if (Number(cn.remaining_balance) < dto.applied_amount - 0.005) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_CREDIT_BALANCE',
          message: `Credit note remaining balance (${cn.remaining_balance}) is less than applied amount (${dto.applied_amount})`,
        });
      }

      const invoice = await db.invoice.findFirst({
        where: { id: dto.invoice_id, tenant_id: tenantId },
      });
      if (!invoice) {
        throw new NotFoundException({
          code: 'INVOICE_NOT_FOUND',
          message: `Invoice "${dto.invoice_id}" not found`,
        });
      }

      if (!isPayableStatus(invoice.status)) {
        throw new BadRequestException({
          code: 'INVALID_INVOICE_STATUS',
          message: `Cannot apply credit to invoice with status "${invoice.status}"`,
        });
      }

      const appliedAmount = roundMoney(
        Math.min(dto.applied_amount, Number(invoice.balance_amount)),
      );
      if (appliedAmount <= 0) {
        throw new BadRequestException({
          code: 'INVOICE_ALREADY_PAID',
          message: 'Invoice has no remaining balance',
        });
      }

      // Create application record
      await db.creditNoteApplication.create({
        data: {
          tenant_id: tenantId,
          credit_note_id: dto.credit_note_id,
          invoice_id: dto.invoice_id,
          applied_amount: appliedAmount,
          applied_at: new Date(),
          applied_by_user_id: userId,
        },
      });

      // Reduce credit note remaining balance
      await db.creditNote.update({
        where: { id: dto.credit_note_id },
        data: { remaining_balance: roundMoney(Number(cn.remaining_balance) - appliedAmount) },
      });

      // Recalculate invoice balance (credit reduces balance like a payment)
      const newBalance = roundMoney(Number(invoice.balance_amount) - appliedAmount);
      const newStatus = newBalance < 0.005 ? 'paid' : 'partially_paid';

      await db.invoice.update({
        where: { id: dto.invoice_id },
        data: {
          balance_amount: newBalance,
          status: newStatus as never,
        },
      });

      return {
        applied_amount: appliedAmount,
        invoice_id: dto.invoice_id,
        credit_note_id: dto.credit_note_id,
      };
    });
  }

  private serialize<
    A extends { applied_amount: Decimal },
    T extends { amount: Decimal; remaining_balance: Decimal; applications?: A[] },
  >(
    cn: T,
  ): Omit<T, 'amount' | 'remaining_balance' | 'applications'> & {
    amount: number;
    remaining_balance: number;
    applications: (Omit<A, 'applied_amount'> & { applied_amount: number })[] | undefined;
  } {
    return {
      ...cn,
      amount: serializeDecimal(cn.amount),
      remaining_balance: serializeDecimal(cn.remaining_balance),
      applications: Array.isArray(cn.applications)
        ? cn.applications.map((a) => ({ ...a, applied_amount: serializeDecimal(a.applied_amount) }))
        : undefined,
    };
  }
}
