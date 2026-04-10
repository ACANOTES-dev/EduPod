import { Injectable, NotFoundException } from '@nestjs/common';
import type { BillingFrequency } from '@prisma/client';

import { FinanceReadFacade } from '../finance/finance-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedAnnualFee {
  amount_cents: number;
  currency_code: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
// Annual multipliers by billing frequency. "term" assumes the standard 3-term
// academic year used by the tenants on this platform; once per-tenant term
// counts are modelled, this lookup should consult the academic-year config.

const ANNUAL_MULTIPLIER: Record<BillingFrequency, number> = {
  one_off: 1,
  term: 3,
  monthly: 12,
  custom: 1,
};

// ─── Facade ──────────────────────────────────────────────────────────────────

/**
 * Read-only adapter between admissions and finance. Admissions never reaches
 * into the finance module's private services — all fee lookups flow through
 * this facade so the dependency surface is a single file.
 */
@Injectable()
export class FinanceFeesFacade {
  constructor(
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  /**
   * Compute the annual net fee for a (year_group, academic_year) pair in
   * integer cents. Throws NO_FEE_STRUCTURE_CONFIGURED when no active fee
   * structure exists for the year group.
   */
  async resolveAnnualNetFeeCents(
    tenantId: string,
    _academicYearId: string,
    yearGroupId: string,
    _db: PrismaService,
  ): Promise<ResolvedAnnualFee> {
    const [feeStructures, currencyCode] = await Promise.all([
      this.financeReadFacade.findActiveFeeStructures(tenantId, yearGroupId),
      this.tenantReadFacade.findCurrencyCode(tenantId),
    ]);

    if (feeStructures.length === 0) {
      throw new NotFoundException({
        code: 'NO_FEE_STRUCTURE_CONFIGURED',
        message: `No active fee structure is configured for year group "${yearGroupId}". Configure fees in Finance → Fee Structures before approving applications into this year group.`,
      });
    }

    if (!currencyCode) {
      throw new NotFoundException({
        code: 'TENANT_CURRENCY_NOT_CONFIGURED',
        message: `Tenant "${tenantId}" has no currency configured.`,
      });
    }

    let totalCents = 0;
    for (const feeStructure of feeStructures) {
      const annualAmount =
        Number(feeStructure.amount) * ANNUAL_MULTIPLIER[feeStructure.billing_frequency];
      totalCents += Math.round(annualAmount * 100);
    }

    return { amount_cents: totalCents, currency_code: currencyCode };
  }
}
