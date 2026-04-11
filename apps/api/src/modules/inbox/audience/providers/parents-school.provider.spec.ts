import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { ParentsSchoolAudienceProvider } from './parents-school.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('ParentsSchoolAudienceProvider', () => {
  function build(byTenant: Record<string, string[]>): ParentsSchoolAudienceProvider {
    const users = {
      allActiveParentUserIds: jest.fn(async (tenantId: string) => byTenant[tenantId] ?? []),
    } as unknown as AudienceUserIdResolver;
    return new ParentsSchoolAudienceProvider(users);
  }

  it('returns empty array when no parents exist', async () => {
    const provider = build({ [TENANT_A]: [] });
    await expect(provider.resolve(TENANT_A, {})).resolves.toEqual({ user_ids: [] });
  });

  it('returns every active parent user_id for the tenant', async () => {
    const provider = build({ [TENANT_A]: ['p1', 'p2'] });
    await expect(provider.resolve(TENANT_A, {})).resolves.toEqual({ user_ids: ['p1', 'p2'] });
  });

  it('does not leak parents from another tenant', async () => {
    const provider = build({ [TENANT_A]: ['parentA'], [TENANT_B]: ['parentB'] });
    const result = await provider.resolve(TENANT_A, {});
    expect(result.user_ids).toEqual(['parentA']);
  });
});
