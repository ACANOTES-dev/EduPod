import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { HandpickedAudienceProvider } from './handpicked.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('HandpickedAudienceProvider', () => {
  function build(membersByTenant: Record<string, string[]>): HandpickedAudienceProvider {
    const users = {
      filterToTenantMembers: jest.fn(async (tenantId: string, userIds: string[]) => {
        const allowed = new Set(membersByTenant[tenantId] ?? []);
        return userIds.filter((id) => allowed.has(id));
      }),
    } as unknown as AudienceUserIdResolver;
    return new HandpickedAudienceProvider(users);
  }

  const u1 = '11111111-1111-1111-1111-111111111111';
  const u2 = '22222222-2222-2222-2222-222222222222';
  const u3 = '33333333-3333-3333-3333-333333333333';

  it('returns empty when none of the ids belong to the tenant', async () => {
    const provider = build({ [TENANT_A]: [] });
    await expect(provider.resolve(TENANT_A, { user_ids: [u1, u2] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('returns only user_ids that belong to the tenant', async () => {
    const provider = build({ [TENANT_A]: [u1, u3] });
    const result = await provider.resolve(TENANT_A, { user_ids: [u1, u2, u3] });
    expect(result.user_ids.sort()).toEqual([u1, u3].sort());
  });

  it('drops user_ids that belong to a different tenant', async () => {
    const provider = build({ [TENANT_A]: [u1], [TENANT_B]: [u2] });
    const result = await provider.resolve(TENANT_A, { user_ids: [u1, u2] });
    expect(result.user_ids).toEqual([u1]);
  });

  it('rejects an empty user_ids array at the schema layer', async () => {
    const provider = build({ [TENANT_A]: [] });
    await expect(provider.resolve(TENANT_A, { user_ids: [] })).rejects.toThrow();
  });
});
