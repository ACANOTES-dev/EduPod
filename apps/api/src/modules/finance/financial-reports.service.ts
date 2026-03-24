import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { roundMoney } from './helpers/invoice-status.helper';

export interface DateRangeFilter {
  date_from?: string;
  date_to?: string;
}

export interface AgingBucket {
  label: string;
  count: number;
  total: number;
  households: Array<{ household_id: string; household_name: string; balance: number }>;
}

export interface AgingReport {
  current: AgingBucket;
  overdue_1_30: AgingBucket;
  overdue_31_60: AgingBucket;
  overdue_61_90: AgingBucket;
  overdue_90_plus: AgingBucket;
  grand_total: number;
}

export interface RevenuePeriodItem {
  period: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  collection_rate: number;
}

export interface CollectionByYearGroup {
  year_group_id: string | null;
  year_group_name: string | null;
  total_billed: number;
  total_collected: number;
  pct_collected: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
  pct_of_total: number;
}

export interface FeeStructurePerformance {
  fee_structure_id: string;
  name: string;
  total_assigned: number;
  total_billed: number;
  total_collected: number;
  default_rate: number;
}

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async agingReport(tenantId: string, _filters: DateRangeFilter): Promise<AgingReport> {
    const cacheKey = `finance:aging:${tenantId}`;

    const cached = await this.tryGetCache<AgingReport>(cacheKey);
    if (cached) return cached;

    const now = new Date();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
      },
      select: {
        balance_amount: true,
        due_date: true,
        household_id: true,
        household: { select: { household_name: true } },
      },
    });

    const buckets: AgingReport = {
      current: { label: 'Current (not yet due)', count: 0, total: 0, households: [] },
      overdue_1_30: { label: '1-30 days overdue', count: 0, total: 0, households: [] },
      overdue_31_60: { label: '31-60 days overdue', count: 0, total: 0, households: [] },
      overdue_61_90: { label: '61-90 days overdue', count: 0, total: 0, households: [] },
      overdue_90_plus: { label: '90+ days overdue', count: 0, total: 0, households: [] },
      grand_total: 0,
    };

    for (const inv of invoices) {
      const balance = roundMoney(Number(inv.balance_amount));
      if (balance <= 0) continue;

      const due = new Date(inv.due_date);
      const daysPastDue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      let bucket: AgingBucket;
      if (daysPastDue <= 0) {
        bucket = buckets.current;
      } else if (daysPastDue <= 30) {
        bucket = buckets.overdue_1_30;
      } else if (daysPastDue <= 60) {
        bucket = buckets.overdue_31_60;
      } else if (daysPastDue <= 90) {
        bucket = buckets.overdue_61_90;
      } else {
        bucket = buckets.overdue_90_plus;
      }

      bucket.count++;
      bucket.total = roundMoney(bucket.total + balance);
      bucket.households.push({
        household_id: inv.household_id,
        household_name: inv.household.household_name,
        balance,
      });
      buckets.grand_total = roundMoney(buckets.grand_total + balance);
    }

    await this.trySetCache(cacheKey, buckets);
    return buckets;
  }

  async revenueByPeriod(tenantId: string, filters: DateRangeFilter): Promise<RevenuePeriodItem[]> {
    const cacheKey = `finance:revenue-period:${tenantId}:${filters.date_from ?? ''}:${filters.date_to ?? ''}`;

    const cached = await this.tryGetCache<RevenuePeriodItem[]>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { notIn: ['void', 'cancelled'] },
    };
    if (filters.date_from || filters.date_to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.date_from) dateFilter.gte = new Date(filters.date_from);
      if (filters.date_to) dateFilter.lte = new Date(filters.date_to);
      where.issue_date = dateFilter;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        issue_date: true,
        created_at: true,
        total_amount: true,
        balance_amount: true,
      },
    });

    // Group by YYYY-MM
    const periodMap = new Map<string, { invoiced: number; collected: number }>();

    for (const inv of invoices) {
      const date = inv.issue_date ?? inv.created_at;
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = periodMap.get(period) ?? { invoiced: 0, collected: 0 };
      const total = Number(inv.total_amount);
      const balance = Number(inv.balance_amount);
      const collected = total - balance;

      existing.invoiced = roundMoney(existing.invoiced + total);
      existing.collected = roundMoney(existing.collected + collected);
      periodMap.set(period, existing);
    }

    const result: RevenuePeriodItem[] = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { invoiced, collected }]) => ({
        period,
        invoiced,
        collected,
        outstanding: roundMoney(invoiced - collected),
        collection_rate: invoiced > 0 ? roundMoney((collected / invoiced) * 100) : 0,
      }));

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async collectionByYearGroup(tenantId: string, _filters: DateRangeFilter): Promise<CollectionByYearGroup[]> {
    const cacheKey = `finance:collection-year-group:${tenantId}`;

    const cached = await this.tryGetCache<CollectionByYearGroup[]>(cacheKey);
    if (cached) return cached;

    const invoiceLines = await this.prisma.invoiceLine.findMany({
      where: {
        tenant_id: tenantId,
        student: { isNot: null },
        invoice: {
          status: { notIn: ['void', 'cancelled', 'draft'] },
        },
      },
      select: {
        line_total: true,
        student: {
          select: {
            year_group: {
              select: { id: true, name: true },
            },
          },
        },
        invoice: {
          select: {
            total_amount: true,
            balance_amount: true,
          },
        },
      },
    });

    const groupMap = new Map<
      string | null,
      { name: string | null; billed: number; collected: number }
    >();

    for (const line of invoiceLines) {
      const yg = line.student?.year_group;
      const key = yg?.id ?? 'null';
      const name = yg?.name ?? null;

      const existing = groupMap.get(key) ?? { name, billed: 0, collected: 0 };
      const total = Number(line.invoice.total_amount);
      const balance = Number(line.invoice.balance_amount);
      const lineTotal = Number(line.line_total);
      // Proportion collected for this line
      const lineFraction = total > 0 ? lineTotal / total : 0;
      const lineCollected = roundMoney(lineFraction * (total - balance));

      existing.billed = roundMoney(existing.billed + lineTotal);
      existing.collected = roundMoney(existing.collected + lineCollected);
      groupMap.set(key, existing);
    }

    const result: CollectionByYearGroup[] = Array.from(groupMap.entries()).map(
      ([key, { name, billed, collected }]) => ({
        year_group_id: key === 'null' ? null : key,
        year_group_name: name,
        total_billed: billed,
        total_collected: collected,
        pct_collected: billed > 0 ? roundMoney((collected / billed) * 100) : 0,
      }),
    );

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async paymentMethodBreakdown(tenantId: string, filters: DateRangeFilter): Promise<PaymentMethodBreakdown[]> {
    const cacheKey = `finance:payment-methods:${tenantId}:${filters.date_from ?? ''}:${filters.date_to ?? ''}`;

    const cached = await this.tryGetCache<PaymentMethodBreakdown[]>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
    };
    if (filters.date_from || filters.date_to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.date_from) dateFilter.gte = new Date(filters.date_from);
      if (filters.date_to) dateFilter.lte = new Date(filters.date_to);
      where.received_at = dateFilter;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      select: { payment_method: true, amount: true },
    });

    const methodMap = new Map<string, { amount: number; count: number }>();
    let grandTotal = 0;

    for (const payment of payments) {
      const method = payment.payment_method;
      const amount = roundMoney(Number(payment.amount));
      const existing = methodMap.get(method) ?? { amount: 0, count: 0 };
      existing.amount = roundMoney(existing.amount + amount);
      existing.count++;
      methodMap.set(method, existing);
      grandTotal = roundMoney(grandTotal + amount);
    }

    const result: PaymentMethodBreakdown[] = Array.from(methodMap.entries()).map(
      ([method, { amount, count }]) => ({
        method,
        amount,
        count,
        pct_of_total: grandTotal > 0 ? roundMoney((amount / grandTotal) * 100) : 0,
      }),
    );

    await this.trySetCache(cacheKey, result);
    return result;
  }

  async feeStructurePerformance(tenantId: string, _filters: DateRangeFilter): Promise<FeeStructurePerformance[]> {
    const cacheKey = `finance:fee-structure-perf:${tenantId}`;

    const cached = await this.tryGetCache<FeeStructurePerformance[]>(cacheKey);
    if (cached) return cached;

    const feeStructures = await this.prisma.feeStructure.findMany({
      where: { tenant_id: tenantId },
      include: {
        household_fee_assignments: {
          select: { id: true },
          where: { effective_to: null },
        },
        invoice_lines: {
          where: {
            invoice: { status: { notIn: ['void', 'cancelled', 'draft'] } },
          },
          select: {
            line_total: true,
            invoice: {
              select: { total_amount: true, balance_amount: true },
            },
          },
        },
      },
    });

    const result: FeeStructurePerformance[] = feeStructures.map((fs) => {
      let totalBilled = 0;
      let totalCollected = 0;

      for (const line of fs.invoice_lines) {
        const lineTotal = Number(line.line_total);
        const invoiceTotal = Number(line.invoice.total_amount);
        const invoiceBalance = Number(line.invoice.balance_amount);
        const fraction = invoiceTotal > 0 ? lineTotal / invoiceTotal : 0;
        const collected = roundMoney(fraction * (invoiceTotal - invoiceBalance));

        totalBilled = roundMoney(totalBilled + lineTotal);
        totalCollected = roundMoney(totalCollected + collected);
      }

      return {
        fee_structure_id: fs.id,
        name: fs.name,
        total_assigned: fs.household_fee_assignments.length,
        total_billed: totalBilled,
        total_collected: totalCollected,
        default_rate: totalBilled > 0
          ? roundMoney(((totalBilled - totalCollected) / totalBilled) * 100)
          : 0,
      };
    });

    await this.trySetCache(cacheKey, result);
    return result;
  }

  private async tryGetCache<T>(key: string): Promise<T | null> {
    try {
      const redis = this.redisService.getClient();
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch (error: unknown) {
      this.logger.warn(`Redis get failed for key ${key}`, error);
    }
    return null;
  }

  private async trySetCache(key: string, data: unknown): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.setex(key, CACHE_TTL, JSON.stringify(data));
    } catch (error: unknown) {
      this.logger.warn(`Redis set failed for key ${key}`, error);
    }
  }
}
