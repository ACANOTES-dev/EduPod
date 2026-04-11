import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { feesInArrearsParamsSchema } from '@school/shared/inbox';

import { HouseholdReadFacade } from '../../households/household-read.facade';
import { AudienceUserIdResolver } from '../../inbox/audience/audience-user-id.resolver';
import type {
  AudienceProvider,
  AudienceResolveResult,
} from '../../inbox/audience/providers/provider.interface';
import { FinanceReadFacade } from '../finance-read.facade';

type FeesInArrearsParams = z.infer<typeof feesInArrearsParamsSchema>;

/**
 * `fees_in_arrears` — parents of households with at least one overdue
 * invoice meeting the supplied thresholds.
 *
 * Deviation from the impl spec: the spec pseudo-code maps student_ids →
 * parent_ids via `ParentReadFacade.findParentIdsByStudentIds`, but the
 * platform schema bills households (`Invoice.household_id`), not
 * individual students. Going through households is simpler, safer, and
 * returns the correct set — every parent linked to a household with
 * overdue fees, not just parents of enrolled children. The parent user
 * conversion flows through `AudienceUserIdResolver` so the provider
 * returns a deduped `user_ids` array.
 *
 * Lives in the finance module so the inbox module never touches
 * `prisma.invoice` directly — self-registers with the
 * `AudienceProviderRegistry` from `FinanceModule.onModuleInit`.
 */
@Injectable()
export class FeesInArrearsProvider implements AudienceProvider {
  readonly key = 'fees_in_arrears' as const;
  readonly displayName = 'Parents in arrears';
  readonly paramsSchema = feesInArrearsParamsSchema;
  readonly wired = true;

  constructor(
    private readonly finance: FinanceReadFacade,
    private readonly households: HouseholdReadFacade,
    private readonly users: AudienceUserIdResolver,
  ) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = feesInArrearsParamsSchema.parse(params) as FeesInArrearsParams;

    const householdIds = await this.finance.findHouseholdIdsWithOverdueInvoices(tenantId, {
      minAmount: parsed.min_overdue_amount,
      minDays: parsed.min_overdue_days,
    });
    if (householdIds.length === 0) return { user_ids: [] };

    const parentIds = await this.households.findParentIdsByHouseholdIds(tenantId, householdIds);
    const user_ids = await this.users.parentIdsToUserIds(tenantId, parentIds);
    return { user_ids };
  }
}
