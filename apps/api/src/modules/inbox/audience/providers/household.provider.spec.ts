import type { HouseholdReadFacade } from '../../../households/household-read.facade';
import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { HouseholdAudienceProvider } from './household.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const HOUSEHOLD_1 = '33333333-3333-3333-3333-333333333333';

describe('HouseholdAudienceProvider', () => {
  function build(fixtures: {
    parentIdsByTenantAndHousehold: Record<string, Record<string, string[]>>;
    userIdsByParentIds?: Record<string, string[]>;
  }): HouseholdAudienceProvider {
    const households = {
      findParentIdsByHouseholdIds: jest.fn(async (tenantId: string, householdIds: string[]) => {
        const map = fixtures.parentIdsByTenantAndHousehold[tenantId] ?? {};
        return [...new Set(householdIds.flatMap((id) => map[id] ?? []))];
      }),
    } as unknown as HouseholdReadFacade;

    const users = {
      parentIdsToUserIds: jest.fn(async (_t: string, parentIds: string[]) => {
        const map = fixtures.userIdsByParentIds ?? {};
        return [...new Set(parentIds.flatMap((id) => map[id] ?? []))];
      }),
    } as unknown as AudienceUserIdResolver;

    return new HouseholdAudienceProvider(households, users);
  }

  it('returns empty when no parents in the households', async () => {
    const provider = build({
      parentIdsByTenantAndHousehold: { [TENANT_A]: { [HOUSEHOLD_1]: [] } },
    });
    await expect(provider.resolve(TENANT_A, { household_ids: [HOUSEHOLD_1] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('resolves household → parent → user_ids', async () => {
    const provider = build({
      parentIdsByTenantAndHousehold: { [TENANT_A]: { [HOUSEHOLD_1]: ['p1', 'p2'] } },
      userIdsByParentIds: { p1: ['u1'], p2: ['u2'] },
    });
    const result = await provider.resolve(TENANT_A, { household_ids: [HOUSEHOLD_1] });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2']);
  });

  it('does not leak cross-tenant households', async () => {
    const provider = build({
      parentIdsByTenantAndHousehold: {
        [TENANT_A]: { [HOUSEHOLD_1]: ['pa'] },
        [TENANT_B]: { [HOUSEHOLD_1]: ['pb'] },
      },
      userIdsByParentIds: { pa: ['ua'], pb: ['ub'] },
    });
    const result = await provider.resolve(TENANT_A, { household_ids: [HOUSEHOLD_1] });
    expect(result.user_ids).toEqual(['ua']);
  });
});
