import type { StaffProfileReadFacade } from '../../../staff-profiles/staff-profile-read.facade';

import { DepartmentAudienceProvider } from './department.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeRow {
  user_id: string;
  tenant_id: string;
  department: string;
}

describe('DepartmentAudienceProvider', () => {
  function build(rows: FakeRow[]): DepartmentAudienceProvider {
    const facade = {
      findManyGeneric: jest.fn(
        async (
          tenantId: string,
          options: {
            where?: { department?: { in?: string[] }; employment_status?: string };
          },
        ) => {
          const wanted = options.where?.department?.in ?? [];
          return rows
            .filter((r) => r.tenant_id === tenantId)
            .filter((r) => wanted.includes(r.department))
            .map((r) => ({ user_id: r.user_id }));
        },
      ),
    } as unknown as StaffProfileReadFacade;
    return new DepartmentAudienceProvider(facade);
  }

  it('returns empty when no staff match the department set', async () => {
    const provider = build([{ tenant_id: TENANT_A, user_id: 's1', department: 'maths' }]);
    await expect(provider.resolve(TENANT_A, { departments: ['science'] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('returns user_ids for staff across multiple departments', async () => {
    const provider = build([
      { tenant_id: TENANT_A, user_id: 's1', department: 'maths' },
      { tenant_id: TENANT_A, user_id: 's2', department: 'english' },
      { tenant_id: TENANT_A, user_id: 's3', department: 'pe' },
    ]);
    const result = await provider.resolve(TENANT_A, {
      departments: ['maths', 'english'],
    });
    expect(result.user_ids.sort()).toEqual(['s1', 's2']);
  });

  it('does not leak cross-tenant staff', async () => {
    const provider = build([
      { tenant_id: TENANT_A, user_id: 'a1', department: 'maths' },
      { tenant_id: TENANT_B, user_id: 'b1', department: 'maths' },
    ]);
    const result = await provider.resolve(TENANT_A, { departments: ['maths'] });
    expect(result.user_ids).toEqual(['a1']);
  });
});
