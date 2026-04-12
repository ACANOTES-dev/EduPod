import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import type { BulkExportDto, BulkInvoiceIdsDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { PaymentRemindersService } from './payment-reminders.service';

export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ invoice_id: string; error: string }>;
}

@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);

  /**
   * FIN-021: hard cap on synchronous bulk operations. Perf spec budgets 6s p95
   * at 100 invoices; extrapolated ~12s at 200. Above that we risk the API
   * gateway timeout. Admins with larger batches split across multiple calls.
   */
  private static readonly MAX_BULK_SIZE = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentRemindersService: PaymentRemindersService,
  ) {}

  private assertBulkSize(invoiceIds: string[]): void {
    if (invoiceIds.length > BulkOperationsService.MAX_BULK_SIZE) {
      throw new BadRequestException({
        code: 'BULK_LIMIT_EXCEEDED',
        message: `Max ${BulkOperationsService.MAX_BULK_SIZE} invoices per request. Split the operation across multiple calls.`,
        details: { limit: BulkOperationsService.MAX_BULK_SIZE, submitted: invoiceIds.length },
      });
    }
  }

  async bulkIssue(
    tenantId: string,
    userId: string,
    dto: BulkInvoiceIdsDto,
  ): Promise<BulkOperationResult> {
    this.assertBulkSize(dto.invoice_ids);
    const result: BulkOperationResult = {
      total: dto.invoice_ids.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    for (const invoiceId of dto.invoice_ids) {
      try {
        await this.invoicesService.issue(tenantId, invoiceId, userId, false);
        result.succeeded++;
      } catch (error: unknown) {
        result.failed++;
        result.errors.push({
          invoice_id: invoiceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.logger.warn(`Bulk issue failed for invoice ${invoiceId}`, error);
      }
    }

    return result;
  }

  async bulkVoid(tenantId: string, dto: BulkInvoiceIdsDto): Promise<BulkOperationResult> {
    this.assertBulkSize(dto.invoice_ids);
    const result: BulkOperationResult = {
      total: dto.invoice_ids.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    for (const invoiceId of dto.invoice_ids) {
      try {
        await this.invoicesService.voidInvoice(tenantId, invoiceId);
        result.succeeded++;
      } catch (error: unknown) {
        result.failed++;
        result.errors.push({
          invoice_id: invoiceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.logger.warn(`Bulk void failed for invoice ${invoiceId}`, error);
      }
    }

    return result;
  }

  async bulkRemind(tenantId: string, dto: BulkInvoiceIdsDto): Promise<BulkOperationResult> {
    if (dto.invoice_ids.length === 0) {
      throw new BadRequestException({
        code: 'NO_INVOICE_IDS',
        message: 'At least one invoice ID is required',
      });
    }
    this.assertBulkSize(dto.invoice_ids);

    const result: BulkOperationResult = {
      total: dto.invoice_ids.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    for (const invoiceId of dto.invoice_ids) {
      try {
        // Check no reminder already sent for this invoice today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const recentReminder = await this.prisma.invoiceReminder.findFirst({
          where: {
            tenant_id: tenantId,
            invoice_id: invoiceId,
            sent_at: { gte: todayStart },
          },
        });

        if (recentReminder) {
          // Already reminded today — skip but count as success
          result.succeeded++;
          continue;
        }

        await this.prisma.invoiceReminder.create({
          data: {
            tenant_id: tenantId,
            invoice_id: invoiceId,
            reminder_type: 'overdue' as never,
            channel: 'email' as never,
            sent_at: new Date(),
          },
        });

        result.succeeded++;
      } catch (error: unknown) {
        result.failed++;
        result.errors.push({
          invoice_id: invoiceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.logger.warn(`Bulk remind failed for invoice ${invoiceId}`, error);
      }
    }

    return result;
  }

  async bulkExport(
    tenantId: string,
    dto: BulkExportDto,
  ): Promise<{ invoices: unknown[]; format: string }> {
    this.assertBulkSize(dto.invoice_ids);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: dto.invoice_ids },
        tenant_id: tenantId,
      },
      include: {
        household: { select: { id: true, household_name: true } },
        lines: true,
      },
    });

    // Return serialized data — rendering is done in the controller layer
    return {
      invoices: invoices.map((inv) => ({
        ...inv,
        total_amount: Number(inv.total_amount),
        balance_amount: Number(inv.balance_amount),
        subtotal_amount: Number(inv.subtotal_amount),
        discount_amount: Number(inv.discount_amount),
        lines: inv.lines.map((l) => ({
          ...l,
          quantity: Number(l.quantity),
          unit_amount: Number(l.unit_amount),
          line_total: Number(l.line_total),
        })),
      })),
      format: dto.format ?? 'csv',
    };
  }
}
