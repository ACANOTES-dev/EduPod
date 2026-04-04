import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  CreateRecurringInvoiceConfigDto,
  RecurringInvoiceConfigQueryDto,
  UpdateRecurringInvoiceConfigDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { SequenceService } from '../sequence/sequence.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { roundMoney } from './helpers/invoice-status.helper';

@Injectable()
export class RecurringInvoicesService {
  private readonly logger = new Logger(RecurringInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly sequenceService: SequenceService,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

  // ─── Config CRUD ──────────────────────────────────────────────────────────

  async findAllConfigs(tenantId: string, query: RecurringInvoiceConfigQueryDto) {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (query.active !== undefined) where.active = query.active;

    const [data, total] = await Promise.all([
      this.prisma.recurringInvoiceConfig.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          fee_structure: { select: { id: true, name: true } },
        },
      }),
      this.prisma.recurringInvoiceConfig.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async findOneConfig(tenantId: string, id: string) {
    const config = await this.prisma.recurringInvoiceConfig.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        fee_structure: { select: { id: true, name: true } },
      },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'RECURRING_CONFIG_NOT_FOUND',
        message: `Recurring invoice config "${id}" not found`,
      });
    }

    return config;
  }

  async createConfig(tenantId: string, dto: CreateRecurringInvoiceConfigDto) {
    const feeStructure = await this.prisma.feeStructure.findFirst({
      where: { id: dto.fee_structure_id, tenant_id: tenantId },
    });
    if (!feeStructure) {
      throw new NotFoundException({
        code: 'FEE_STRUCTURE_NOT_FOUND',
        message: `Fee structure "${dto.fee_structure_id}" not found`,
      });
    }

    const config = await this.prisma.recurringInvoiceConfig.create({
      data: {
        tenant_id: tenantId,
        fee_structure_id: dto.fee_structure_id,
        frequency: dto.frequency,
        next_generation_date: new Date(dto.next_generation_date),
        active: true,
      },
      include: {
        fee_structure: { select: { id: true, name: true } },
      },
    });

    return config;
  }

  async updateConfig(tenantId: string, id: string, dto: UpdateRecurringInvoiceConfigDto) {
    const existing = await this.prisma.recurringInvoiceConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'RECURRING_CONFIG_NOT_FOUND',
        message: `Recurring invoice config "${id}" not found`,
      });
    }

    const updated = await this.prisma.recurringInvoiceConfig.update({
      where: { id },
      data: {
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.next_generation_date !== undefined && {
          next_generation_date: new Date(dto.next_generation_date),
        }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: {
        fee_structure: { select: { id: true, name: true } },
      },
    });

    return updated;
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  /**
   * Run for all tenants or a specific tenant. Called by the daily worker job.
   * systemUserId: the user whose identity is used for created_by_user_id on generated invoices.
   * Returns count of invoices generated.
   */
  async generateDueInvoices(tenantId: string, systemUserId?: string): Promise<number> {
    const settings = await this.settingsService.getSettings(tenantId);
    const autoIssue = settings.finance.autoIssueRecurringInvoices ?? false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueConfigs = await this.prisma.recurringInvoiceConfig.findMany({
      where: {
        tenant_id: tenantId,
        active: true,
        next_generation_date: { lte: today },
      },
      include: {
        fee_structure: {
          include: {
            household_fee_assignments: {
              where: { effective_to: null },
              include: {
                household: { select: { id: true, household_name: true } },
                discount: true,
              },
            },
          },
        },
      },
    });

    let totalGenerated = 0;

    // Look up the first admin user for this tenant to attribute invoices to if no systemUserId given
    let resolvedSystemUserId = systemUserId;
    if (!resolvedSystemUserId) {
      const memberUserId = await this.rbacReadFacade.findFirstActiveMembershipUserId(tenantId);
      resolvedSystemUserId = memberUserId ?? tenantId;
    }

    for (const config of dueConfigs) {
      try {
        const count = await this.generateForConfig(
          tenantId,
          config,
          autoIssue,
          resolvedSystemUserId,
        );
        totalGenerated += count;

        // Update next_generation_date
        const nextDate = this.computeNextDate(config.next_generation_date, config.frequency);

        await this.prisma.recurringInvoiceConfig.update({
          where: { id: config.id },
          data: {
            next_generation_date: nextDate,
            last_generated_at: new Date(),
          },
        });
      } catch (error: unknown) {
        this.logger.error(`Failed to generate invoices for config ${config.id}`, error);
      }
    }

    return totalGenerated;
  }

  private async generateForConfig(
    tenantId: string,
    config: {
      id: string;
      fee_structure: {
        id: string;
        name: string;
        amount: { toNumber: () => number } | number;
        household_fee_assignments: Array<{
          household: { id: string; household_name: string };
          discount: { discount_type: string; value: { toNumber: () => number } | number } | null;
        }>;
      };
    },
    autoIssue: boolean,
    systemUserId: string,
  ): Promise<number> {
    const feeStructure = config.fee_structure;
    const assignments = feeStructure.household_fee_assignments;

    if (assignments.length === 0) return 0;

    const tenant = await this.tenantReadFacade.findById(tenantId);
    if (!tenant) return 0;

    const branding = await this.tenantReadFacade.findBranding(tenantId);
    const prefix = branding?.invoice_prefix ?? 'INV';

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (tenant.currency_code ? 30 : 30));

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    let created = 0;

    for (const assignment of assignments) {
      try {
        await rlsClient.$transaction(async (tx) => {
          const db = tx as unknown as typeof this.prisma;

          const invoiceNumber = await this.sequenceService.nextNumber(
            tenantId,
            'invoice',
            tx,
            prefix,
          );

          const feeAmount =
            typeof feeStructure.amount === 'object'
              ? feeStructure.amount.toNumber()
              : Number(feeStructure.amount);

          let lineTotal = feeAmount;
          let discountAmount = 0;

          if (assignment.discount) {
            const discountValue =
              typeof assignment.discount.value === 'object'
                ? assignment.discount.value.toNumber()
                : Number(assignment.discount.value);

            discountAmount =
              assignment.discount.discount_type === 'percent'
                ? roundMoney(feeAmount * (discountValue / 100))
                : roundMoney(discountValue);
            lineTotal = roundMoney(feeAmount - discountAmount);
          }

          await db.invoice.create({
            data: {
              tenant_id: tenantId,
              household_id: assignment.household.id,
              invoice_number: invoiceNumber,
              status: autoIssue ? 'issued' : 'draft',
              due_date: dueDate,
              subtotal_amount: feeAmount,
              discount_amount: discountAmount,
              total_amount: lineTotal,
              balance_amount: lineTotal,
              currency_code: tenant.currency_code,
              created_by_user_id: systemUserId,
              issue_date: autoIssue ? new Date() : null,
              lines: {
                create: {
                  tenant_id: tenantId,
                  description: `${feeStructure.name} (auto-generated)`,
                  quantity: 1,
                  unit_amount: feeAmount,
                  line_total: lineTotal,
                  fee_structure_id: feeStructure.id,
                },
              },
            },
          });
        });

        created++;
      } catch (error: unknown) {
        this.logger.error(
          `Failed to generate invoice for household ${assignment.household.id}`,
          error,
        );
      }
    }

    return created;
  }

  private computeNextDate(current: Date, frequency: string): Date {
    const next = new Date(current);
    if (frequency === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    } else {
      // term: advance by ~3 months (90 days) as a safe default
      next.setDate(next.getDate() + 90);
    }
    return next;
  }
}
