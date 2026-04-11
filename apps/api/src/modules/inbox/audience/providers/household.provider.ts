import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { householdParamsSchema } from '@school/shared/inbox';

import { HouseholdReadFacade } from '../../../households/household-read.facade';
import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type HouseholdParams = z.infer<typeof householdParamsSchema>;

/**
 * `household` — parents linked to ANY of the listed households.
 */
@Injectable()
export class HouseholdAudienceProvider implements AudienceProvider {
  readonly key = 'household' as const;
  readonly displayName = 'Household';
  readonly paramsSchema = householdParamsSchema;
  readonly wired = true;

  constructor(
    private readonly households: HouseholdReadFacade,
    private readonly users: AudienceUserIdResolver,
  ) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = householdParamsSchema.parse(params) as HouseholdParams;

    const parentIds = await this.households.findParentIdsByHouseholdIds(
      tenantId,
      parsed.household_ids,
    );
    const user_ids = await this.users.parentIdsToUserIds(tenantId, parentIds);
    return { user_ids };
  }
}
