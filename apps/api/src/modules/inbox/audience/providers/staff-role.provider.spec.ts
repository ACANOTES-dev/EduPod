import type { RbacReadFacade } from '../../../rbac/rbac-read.facade';

import { StaffRoleAudienceProvider } from './staff-role.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('StaffRoleAudienceProvider', () => {
  function build(map: Record<string, Record<string, string[]>>): StaffRoleAudienceProvider {
    const rbac = {
      findActiveUserIdsByRoleKey: jest.fn(async (tenantId: string, roleKey: string) => {
        return map[tenantId]?.[roleKey] ?? [];
      }),
    } as unknown as RbacReadFacade;
    return new StaffRoleAudienceProvider(rbac);
  }

  it('returns empty for a role with no members', async () => {
    const provider = build({ [TENANT_A]: { teacher: [] } });
    await expect(provider.resolve(TENANT_A, { roles: ['teacher'] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('unions user_ids across multiple role keys and dedupes', async () => {
    const provider = build({
      [TENANT_A]: {
        teacher: ['u1', 'u2'],
        admin: ['u2', 'u3'],
      },
    });
    const result = await provider.resolve(TENANT_A, { roles: ['teacher', 'admin'] });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('does not leak role members across tenants', async () => {
    const provider = build({
      [TENANT_A]: { teacher: ['a1'] },
      [TENANT_B]: { teacher: ['b1'] },
    });
    const result = await provider.resolve(TENANT_A, { roles: ['teacher'] });
    expect(result.user_ids).toEqual(['a1']);
  });

  it('rejects invalid params at the schema layer', async () => {
    const provider = build({});
    await expect(provider.resolve(TENANT_A, { roles: [] })).rejects.toThrow();
    await expect(provider.resolve(TENANT_A, {})).rejects.toThrow();
  });
});
