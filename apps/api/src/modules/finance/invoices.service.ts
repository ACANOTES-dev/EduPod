import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateInvoiceDto, InvoiceStatus, UpdateInvoiceDto, WriteOffDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { deriveInvoiceStatus, roundMoney, validateInvoiceTransition } from './helpers/invoice-status.helper';

interface InvoiceFilters {
  page: number;
  pageSize: number;
  status?: string | string[];
  household_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(tenantId: string, filters: InvoiceFilters, parentHouseholdIds?: string[]) {
    const { page, pageSize, status, household_id, date_from, date_to, search, sort, order } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    // Parent scoping: filter to their household IDs and visible statuses
    if (parentHouseholdIds) {
      where.household_id = { in: parentHouseholdIds };
      where.status = { notIn: ['draft', 'pending_approval', 'cancelled'] };
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      // Don't override parent filter if already set
      if (!parentHouseholdIds) {
        where.status = { in: statuses };
      }
    }
    if (household_id && !parentHouseholdIds) {
      where.household_id = household_id;
    }
    if (date_from || date_to) {
      const dateFilter: Record<string, unknown> = {};
      if (date_from) dateFilter.gte = new Date(date_from);
      if (date_to) dateFilter.lte = new Date(date_to);
      where.due_date = dateFilter;
    }
    if (search) {
      where.invoice_number = { contains: search, mode: 'insensitive' };
    }

    const orderBy: Record<string, string> = {};
    if (sort && ['due_date', 'created_at', 'total_amount', 'invoice_number'].includes(sort)) {
      orderBy[sort] = order ?? 'desc';
    } else {
      orderBy.created_at = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          household: {
            select: { id: true, household_name: true },
          },
          lines: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unit_amount: true,
              line_total: true,
              student_id: true,
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((inv) => this.serializeInvoice(inv)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        household: {
          select: { id: true, household_name: true },
        },
        lines: {
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
            fee_structure: { select: { id: true, name: true } },
          },
        },
        installments: {
          orderBy: { due_date: 'asc' },
        },
        payment_allocations: {
          include: {
            payment: {
              select: {
                id: true,
                payment_reference: true,
                payment_method: true,
                received_at: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
        approval_request: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    return this.serializeInvoiceFull(invoice);
  }

  async create(tenantId: string, userId: string, dto: CreateInvoiceDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      // Validate household
      const household = await (tx as unknown as typeof this.prisma).household.findFirst({
        where: { id: dto.household_id, tenant_id: tenantId },
      });
      if (!household) {
        throw new BadRequestException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: `Household with id "${dto.household_id}" not found`,
        });
      }

      // Get tenant for currency
      const tenant = await (tx as unknown as typeof this.prisma).tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      // Get branding for invoice prefix
      const branding = await (tx as unknown as typeof this.prisma).tenantBranding.findUnique({
        where: { tenant_id: tenantId },
      });
      const prefix = branding?.invoice_prefix ?? 'INV';

      // Generate invoice number
      const invoiceNumber = await this.sequenceService.nextNumber(tenantId, 'invoice', tx, prefix);

      // Calculate totals from lines
      let subtotal = 0;
      const lineData = dto.lines.map((line) => {
        const lineTotal = roundMoney(line.quantity * line.unit_amount);
        subtotal += lineTotal;
        return {
          tenant_id: tenantId,
          description: line.description,
          quantity: line.quantity,
          unit_amount: line.unit_amount,
          line_total: lineTotal,
          student_id: line.student_id ?? null,
          fee_structure_id: line.fee_structure_id ?? null,
        };
      });
      subtotal = roundMoney(subtotal);
      const totalAmount = subtotal;
      const balanceAmount = totalAmount;

      const invoice = await (tx as unknown as typeof this.prisma).invoice.create({
        data: {
          tenant_id: tenantId,
          household_id: dto.household_id,
          invoice_number: invoiceNumber,
          status: 'draft',
          due_date: new Date(dto.due_date),
          subtotal_amount: subtotal,
          discount_amount: 0,
          total_amount: totalAmount,
          balance_amount: balanceAmount,
          currency_code: tenant.currency_code,
          created_by_user_id: userId,
          lines: {
            create: lineData,
          },
        },
        include: {
          household: { select: { id: true, household_name: true } },
          lines: true,
        },
      });

      return this.serializeInvoice(invoice);
    });
  }

  async update(tenantId: string, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Only draft invoices can be updated',
      });
    }

    // Optimistic concurrency
    if (dto.expected_updated_at) {
      const expectedTime = new Date(dto.expected_updated_at).getTime();
      const actualTime = existing.updated_at.getTime();
      if (Math.abs(expectedTime - actualTime) > 1000) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message: 'Invoice was modified by another user. Please refresh and try again.',
        });
      }
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;

      // Replace lines if provided
      if (dto.lines) {
        await prisma.invoiceLine.deleteMany({ where: { invoice_id: id } });

        let subtotal = 0;
        const lineData = dto.lines.map((line) => {
          const lineTotal = roundMoney(line.quantity * line.unit_amount);
          subtotal += lineTotal;
          return {
            tenant_id: tenantId,
            invoice_id: id,
            description: line.description,
            quantity: line.quantity,
            unit_amount: line.unit_amount,
            line_total: lineTotal,
            student_id: line.student_id ?? null,
            fee_structure_id: line.fee_structure_id ?? null,
          };
        });
        subtotal = roundMoney(subtotal);
        const totalAmount = subtotal;

        await prisma.invoiceLine.createMany({ data: lineData });
        await prisma.invoice.update({
          where: { id },
          data: {
            subtotal_amount: subtotal,
            total_amount: totalAmount,
            balance_amount: totalAmount,
            ...(dto.due_date && { due_date: new Date(dto.due_date) }),
          },
        });
      } else if (dto.due_date) {
        await prisma.invoice.update({
          where: { id },
          data: { due_date: new Date(dto.due_date) },
        });
      }

      return this.findOne(tenantId, id);
    });
  }

  async issue(tenantId: string, id: string, userId: string, hasDirectAuthority: boolean) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    // User-initiated issue can only happen from draft.
    // pending_approval -> issued is handled exclusively by the approval callback worker.
    if (invoice.status !== 'draft') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot issue an invoice with status "${invoice.status}". Only draft invoices can be issued directly.`,
      });
    }

    // Check if approval is required
    const settings = await this.settingsService.getSettings(tenantId);
    if (settings.finance.requireApprovalForInvoiceIssue) {
      const approvalResult = await this.approvalRequestsService.checkAndCreateIfNeeded(
        tenantId,
        'invoice_issue',
        'invoice',
        id,
        userId,
        hasDirectAuthority,
      );

      if (!approvalResult.approved) {
        // Set invoice to pending_approval
        const updated = await this.prisma.invoice.update({
          where: { id },
          data: {
            status: 'pending_approval',
            approval_request_id: approvalResult.request_id,
          },
        });
        return {
          ...this.serializeInvoice(updated),
          approval_status: 'pending_approval',
          approval_request_id: approvalResult.request_id,
        };
      }
    }

    // Issue directly
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'issued',
        issue_date: new Date(),
      },
    });

    return this.serializeInvoice(updated);
  }

  async voidInvoice(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    // Can only void if no payments allocated (balance ≈ total within epsilon)
    if (Math.abs(Number(invoice.balance_amount) - Number(invoice.total_amount)) > 0.01) {
      throw new BadRequestException({
        code: 'PAYMENTS_EXIST',
        message: 'Cannot void an invoice that has payments allocated',
      });
    }

    validateInvoiceTransition(invoice.status as InvoiceStatus, 'void');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'void' },
    });

    return this.serializeInvoice(updated);
  }

  async cancel(tenantId: string, id: string, userId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    validateInvoiceTransition(invoice.status as InvoiceStatus, 'cancelled');

    // If pending_approval, cancel linked approval request
    if (invoice.status === 'pending_approval' && invoice.approval_request_id) {
      await this.approvalRequestsService.cancel(
        tenantId,
        invoice.approval_request_id,
        userId,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return this.serializeInvoice(updated);
  }

  async writeOff(tenantId: string, id: string, dto: WriteOffDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    validateInvoiceTransition(invoice.status as InvoiceStatus, 'written_off');

    const balance = Number(invoice.balance_amount);
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'written_off',
        write_off_amount: balance,
        write_off_reason: dto.write_off_reason,
        balance_amount: 0,
      },
    });

    return this.serializeInvoice(updated);
  }

  async recalculateBalance(tenantId: string, invoiceId: string, client?: typeof this.prisma) {
    const db = client ?? this.prisma;
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
      include: { payment_allocations: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Cannot recalculate balance: invoice ${invoiceId} not found`,
      });
    }

    const sumAllocated = invoice.payment_allocations.reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0,
    );
    const writeOff = Number(invoice.write_off_amount ?? 0);
    const totalAmount = Number(invoice.total_amount);
    const newBalance = roundMoney(totalAmount - sumAllocated - writeOff);

    const newStatus = deriveInvoiceStatus(
      invoice.status,
      newBalance,
      totalAmount,
      invoice.due_date,
      writeOff,
    );

    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        balance_amount: newBalance,
        status: newStatus as never,
      },
    });
  }

  async getPreview(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        invoice_number: true,
        status: true,
        due_date: true,
        total_amount: true,
        balance_amount: true,
        currency_code: true,
        household: {
          select: { id: true, household_name: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${id}" not found`,
      });
    }

    return {
      ...invoice,
      total_amount: Number(invoice.total_amount),
      balance_amount: Number(invoice.balance_amount),
    };
  }

  async getInstallments(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${invoiceId}" not found`,
      });
    }

    const installments = await this.prisma.installment.findMany({
      where: { invoice_id: invoiceId, tenant_id: tenantId },
      orderBy: { due_date: 'asc' },
    });

    return installments.map((i) => ({
      ...i,
      amount: Number(i.amount),
    }));
  }

  async createInstallments(
    tenantId: string,
    invoiceId: string,
    installments: Array<{ due_date: string; amount: number }>,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${invoiceId}" not found`,
      });
    }

    // Validate installment amounts sum to invoice total
    const totalInstallments = roundMoney(
      installments.reduce((sum, i) => sum + i.amount, 0),
    );
    const invoiceTotal = Number(invoice.total_amount);
    if (Math.abs(totalInstallments - invoiceTotal) > 0.01) {
      throw new BadRequestException({
        code: 'INSTALLMENT_SUM_MISMATCH',
        message: `Installments total (${totalInstallments}) must equal invoice total (${invoiceTotal})`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const prisma = tx as unknown as typeof this.prisma;

      // Delete existing installments
      await prisma.installment.deleteMany({ where: { invoice_id: invoiceId } });

      // Create new installments
      await prisma.installment.createMany({
        data: installments.map((i) => ({
          tenant_id: tenantId,
          invoice_id: invoiceId,
          due_date: new Date(i.due_date),
          amount: i.amount,
          status: 'pending',
        })),
      });

      const created = await prisma.installment.findMany({
        where: { invoice_id: invoiceId },
        orderBy: { due_date: 'asc' },
      });

      return created.map((i) => ({
        ...i,
        amount: Number(i.amount),
      }));
    });
  }

  async deleteInstallments(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice with id "${invoiceId}" not found`,
      });
    }

    await this.prisma.installment.deleteMany({
      where: { invoice_id: invoiceId, tenant_id: tenantId },
    });

    return { deleted: true };
  }

  // ─── Serializers ────────────────────────────────────────────────

  /* eslint-disable @typescript-eslint/no-explicit-any -- Prisma models use Decimal; we convert to number for the API */

  private serializeInvoice(invoice: { subtotal_amount?: unknown; discount_amount?: unknown; total_amount?: unknown; balance_amount?: unknown; write_off_amount?: unknown; lines?: Array<{ quantity: unknown; unit_amount: unknown; line_total: unknown; [key: string]: unknown }>; [key: string]: unknown }) {
    return {
      ...invoice,
      subtotal_amount: invoice.subtotal_amount !== undefined ? Number(invoice.subtotal_amount) : undefined,
      discount_amount: invoice.discount_amount !== undefined ? Number(invoice.discount_amount) : undefined,
      total_amount: invoice.total_amount !== undefined ? Number(invoice.total_amount) : undefined,
      balance_amount: invoice.balance_amount !== undefined ? Number(invoice.balance_amount) : undefined,
      write_off_amount: invoice.write_off_amount != null ? Number(invoice.write_off_amount) : null,
      lines: Array.isArray(invoice.lines)
        ? invoice.lines.map((l) => ({
            ...l,
            quantity: Number(l.quantity),
            unit_amount: Number(l.unit_amount),
            line_total: Number(l.line_total),
          }))
        : undefined,
    };
  }

  private serializeInvoiceFull(invoice: { installments?: Array<{ amount: unknown; [key: string]: unknown }>; payment_allocations?: Array<{ allocated_amount: unknown; [key: string]: unknown }>; [key: string]: unknown }) {
    const base = this.serializeInvoice(invoice);
    return {
      ...base,
      installments: Array.isArray(invoice.installments)
        ? invoice.installments.map((i) => ({
            ...i,
            amount: Number(i.amount),
          }))
        : undefined,
      payment_allocations: Array.isArray(invoice.payment_allocations)
        ? invoice.payment_allocations.map((a) => ({
            ...a,
            allocated_amount: Number(a.allocated_amount),
          }))
        : undefined,
    };
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */
}
