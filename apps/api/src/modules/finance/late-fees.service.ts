import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateLateFeeConfigDto,
  LateFeeConfigQueryDto,
  UpdateLateFeeConfigDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { roundMoney } from './helpers/invoice-status.helper';

@Injectable()
export class LateFeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Config CRUD ──────────────────────────────────────────────────────────

  async findAllConfigs(tenantId: string, query: LateFeeConfigQueryDto) {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (query.active !== undefined) where.active = query.active;

    const [data, total] = await Promise.all([
      this.prisma.lateFeeConfig.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.lateFeeConfig.count({ where }),
    ]);

    return {
      data: data.map((c) => this.serializeConfig(c)),
      meta: { page, pageSize, total },
    };
  }

  async findOneConfig(tenantId: string, id: string) {
    const config = await this.prisma.lateFeeConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'LATE_FEE_CONFIG_NOT_FOUND',
        message: `Late fee config "${id}" not found`,
      });
    }

    return this.serializeConfig(config);
  }

  async createConfig(tenantId: string, dto: CreateLateFeeConfigDto) {
    const config = await this.prisma.lateFeeConfig.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        fee_type: dto.fee_type,
        value: dto.value,
        grace_period_days: dto.grace_period_days ?? 0,
        max_applications: dto.max_applications ?? 1,
        frequency_days: dto.frequency_days ?? null,
        active: true,
      },
    });

    return this.serializeConfig(config);
  }

  async updateConfig(tenantId: string, id: string, dto: UpdateLateFeeConfigDto) {
    const existing = await this.prisma.lateFeeConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'LATE_FEE_CONFIG_NOT_FOUND',
        message: `Late fee config "${id}" not found`,
      });
    }

    const updated = await this.prisma.lateFeeConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.fee_type !== undefined && { fee_type: dto.fee_type }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.grace_period_days !== undefined && { grace_period_days: dto.grace_period_days }),
        ...(dto.max_applications !== undefined && { max_applications: dto.max_applications }),
        ...(dto.frequency_days !== undefined && { frequency_days: dto.frequency_days }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return this.serializeConfig(updated);
  }

  // ─── Apply Late Fee ────────────────────────────────────────────────────────

  async applyLateFee(tenantId: string, invoiceId: string, configId?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
      include: { late_fee_applications: true },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice "${invoiceId}" not found`,
      });
    }

    if (!['issued', 'overdue', 'partially_paid'].includes(invoice.status)) {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_STATUS',
        message: `Cannot apply late fee to invoice with status "${invoice.status}"`,
      });
    }

    // Resolve config: use provided configId or fall back to most recently created active config
    let config;
    if (configId) {
      config = await this.prisma.lateFeeConfig.findFirst({
        where: { id: configId, tenant_id: tenantId, active: true },
      });
    } else {
      config = await this.prisma.lateFeeConfig.findFirst({
        where: { tenant_id: tenantId, active: true },
        orderBy: { created_at: 'desc' },
      });
    }

    if (!config) {
      throw new NotFoundException({
        code: 'LATE_FEE_CONFIG_NOT_FOUND',
        message: 'No active late fee config found',
      });
    }

    // Check grace period
    const now = new Date();
    const dueDate = new Date(invoice.due_date);
    const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysPastDue < config.grace_period_days) {
      throw new BadRequestException({
        code: 'WITHIN_GRACE_PERIOD',
        message: `Invoice is within grace period (${daysPastDue} days past due, grace period is ${config.grace_period_days} days)`,
      });
    }

    // Check max applications
    const existingApplications = invoice.late_fee_applications.filter(
      (a) => a.late_fee_config_id === config.id,
    );

    if (existingApplications.length >= config.max_applications) {
      throw new BadRequestException({
        code: 'MAX_LATE_FEE_APPLICATIONS_REACHED',
        message: `Maximum late fee applications (${config.max_applications}) already reached`,
      });
    }

    // Check frequency_days if recurring
    if (config.frequency_days && existingApplications.length > 0) {
      const lastApplication = existingApplications[existingApplications.length - 1];
      if (lastApplication) {
        const daysSinceLastApplication = Math.floor(
          (now.getTime() - new Date(lastApplication.applied_at).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceLastApplication < config.frequency_days) {
          throw new BadRequestException({
            code: 'TOO_SOON_FOR_NEXT_APPLICATION',
            message: `Next late fee application not due for ${config.frequency_days - daysSinceLastApplication} more days`,
          });
        }
      }
    }

    // Calculate late fee amount
    const invoiceTotal = Number(invoice.total_amount);
    const lateFeeAmount = config.fee_type === 'percent'
      ? roundMoney(invoiceTotal * (Number(config.value) / 100))
      : roundMoney(Number(config.value));

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      // Create late fee application record
      await db.lateFeeApplication.create({
        data: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          late_fee_config_id: config.id,
          amount: lateFeeAmount,
          applied_at: now,
        },
      });

      // Add invoice line for late fee
      await db.invoiceLine.create({
        data: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          description: `Late fee: ${config.name}`,
          quantity: 1,
          unit_amount: lateFeeAmount,
          line_total: lateFeeAmount,
        },
      });

      // Update invoice totals
      const newTotal = roundMoney(invoiceTotal + lateFeeAmount);
      const newBalance = roundMoney(Number(invoice.balance_amount) + lateFeeAmount);

      await db.invoice.update({
        where: { id: invoiceId },
        data: {
          total_amount: newTotal,
          balance_amount: newBalance,
        },
      });

      return {
        invoice_id: invoiceId,
        late_fee_config_id: config.id,
        amount_applied: lateFeeAmount,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Decimal conversion
  private serializeConfig(config: any) {
    return {
      ...config,
      value: Number(config.value),
    };
  }
}
