import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { StaffAllAudienceProvider } from './staff-all.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('StaffAllAudienceProvider', () => {
  function build(byTenant: Record<string, string[]>): StaffAllAudienceProvider {
    const users = {
      allActiveStaffUserIds: jest.fn(async (tenantId: string) => byTenant[tenantId] ?? []),
    } as unknown as AudienceUserIdResolver;
    return new StaffAllAudienceProvider(users);
  }

  it('returns empty when no staff exist', async () => {
    const provider = build({ [TENANT_A]: [] });
    await expect(provider.resolve(TENANT_A, {})).resolves.toEqual({ user_ids: [] });
  });

  it('returns every active staff user_id for the tenant', async () => {
    const provider = build({ [TENANT_A]: ['s1', 's2', 's3'] });
    await expect(provider.resolve(TENANT_A, {})).resolves.toEqual({
      user_ids: ['s1', 's2', 's3'],
    });
  });

  it('does not leak staff from another tenant', async () => {
    const provider = build({ [TENANT_A]: ['staffA'], [TENANT_B]: ['staffB'] });
    const result = await provider.resolve(TENANT_A, {});
    expect(result.user_ids).toEqual(['staffA']);
  });
});
