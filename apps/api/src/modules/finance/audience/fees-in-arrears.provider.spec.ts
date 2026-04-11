import type { HouseholdReadFacade } from '../../households/household-read.facade';
import type { AudienceUserIdResolver } from '../../inbox/audience/audience-user-id.resolver';
import type { FinanceReadFacade } from '../finance-read.facade';

import { FeesInArrearsProvider } from './fees-in-arrears.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface InvoiceFixture {
  tenant_id: string;
  household_id: string;
  balance_amount: number;
  daysOverdue: number;
}

describe('FeesInArrearsProvider', () => {
  function build(
    invoices: InvoiceFixture[],
    parentIdsByHousehold: Record<string, string[]> = {},
    userIdsByParent: Record<string, string[]> = {},
  ): FeesInArrearsProvider {
    const finance = {
      findHouseholdIdsWithOverdueInvoices: jest.fn(
        async (tenantId: string, filter: { minAmount?: number; minDays?: number } = {}) => {
          const minAmount = filter.minAmount ?? 0;
          const minDays = filter.minDays ?? 0;
          const matching = invoices.filter(
            (inv) =>
              inv.tenant_id === tenantId &&
              inv.balance_amount >= minAmount &&
              inv.daysOverdue >= minDays,
          );
          return [...new Set(matching.map((inv) => inv.household_id))];
        },
      ),
    } as unknown as FinanceReadFacade;

    const households = {
      findParentIdsByHouseholdIds: jest.fn(async (_t: string, ids: string[]) => {
        return [...new Set(ids.flatMap((id) => parentIdsByHousehold[id] ?? []))];
      }),
    } as unknown as HouseholdReadFacade;

    const users = {
      parentIdsToUserIds: jest.fn(async (_t: string, parentIds: string[]) => {
        return [...new Set(parentIds.flatMap((id) => userIdsByParent[id] ?? []))];
      }),
    } as unknown as AudienceUserIdResolver;

    return new FeesInArrearsProvider(finance, households, users);
  }

  it('returns empty when no invoices are overdue', async () => {
    const provider = build([]);
    await expect(provider.resolve(TENANT_A, {})).resolves.toEqual({ user_ids: [] });
  });

  it('filters by min_overdue_amount threshold', async () => {
    const provider = build(
      [
        { tenant_id: TENANT_A, household_id: 'h1', balance_amount: 50, daysOverdue: 10 },
        { tenant_id: TENANT_A, household_id: 'h2', balance_amount: 600, daysOverdue: 10 },
      ],
      { h2: ['p2'] },
      { p2: ['u2'] },
    );
    const result = await provider.resolve(TENANT_A, { min_overdue_amount: 500 });
    expect(result.user_ids).toEqual(['u2']);
  });

  it('filters by min_overdue_days threshold', async () => {
    const provider = build(
      [
        { tenant_id: TENANT_A, household_id: 'h1', balance_amount: 100, daysOverdue: 3 },
        { tenant_id: TENANT_A, household_id: 'h2', balance_amount: 100, daysOverdue: 40 },
      ],
      { h2: ['p2'] },
      { p2: ['u2'] },
    );
    const result = await provider.resolve(TENANT_A, { min_overdue_days: 30 });
    expect(result.user_ids).toEqual(['u2']);
  });

  it('dedupes parents that belong to multiple overdue households', async () => {
    const provider = build(
      [
        { tenant_id: TENANT_A, household_id: 'h1', balance_amount: 100, daysOverdue: 10 },
        { tenant_id: TENANT_A, household_id: 'h2', balance_amount: 100, daysOverdue: 10 },
      ],
      { h1: ['p-shared'], h2: ['p-shared'] },
      { 'p-shared': ['u1'] },
    );
    const result = await provider.resolve(TENANT_A, {});
    expect(result.user_ids).toEqual(['u1']);
  });

  it('does not leak households from another tenant', async () => {
    const provider = build(
      [
        { tenant_id: TENANT_A, household_id: 'h-a', balance_amount: 100, daysOverdue: 10 },
        { tenant_id: TENANT_B, household_id: 'h-b', balance_amount: 100, daysOverdue: 10 },
      ],
      { 'h-a': ['pa'], 'h-b': ['pb'] },
      { pa: ['ua'], pb: ['ub'] },
    );
    const result = await provider.resolve(TENANT_A, {});
    expect(result.user_ids).toEqual(['ua']);
  });
});
