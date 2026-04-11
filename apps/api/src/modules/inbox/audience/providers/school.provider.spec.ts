import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { SchoolAudienceProvider } from './school.provider';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('SchoolAudienceProvider', () => {
  function build(
    overrides: Partial<Record<'tenantA' | 'tenantB', string[]>> = {},
  ): SchoolAudienceProvider {
    const users = {
      buildTenantUniverse: jest.fn(async (tenantId: string) => {
        if (tenantId === TENANT_ID) return overrides.tenantA ?? [];
        if (tenantId === OTHER_TENANT) return overrides.tenantB ?? [];
        return [];
      }),
    } as unknown as AudienceUserIdResolver;
    return new SchoolAudienceProvider(users);
  }

  it('returns empty array when the tenant has no active users', async () => {
    const provider = build({ tenantA: [] });
    await expect(provider.resolve(TENANT_ID, {})).resolves.toEqual({ user_ids: [] });
  });

  it('returns the tenant universe when populated', async () => {
    const provider = build({ tenantA: ['u1', 'u2', 'u3'] });
    await expect(provider.resolve(TENANT_ID, {})).resolves.toEqual({
      user_ids: ['u1', 'u2', 'u3'],
    });
  });

  it('does not leak users from another tenant', async () => {
    const provider = build({
      tenantA: ['tenantA-user'],
      tenantB: ['tenantB-user'],
    });
    const result = await provider.resolve(TENANT_ID, {});
    expect(result.user_ids).toEqual(['tenantA-user']);
    expect(result.user_ids).not.toContain('tenantB-user');
  });
});
