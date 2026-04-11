import type { StudentReadFacade } from '../../../students/student-read.facade';
import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { YearGroupParentsAudienceProvider } from './year-group-parents.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const YG_1 = '11111111-1111-1111-1111-111111111111';
const YG_2 = '22222222-2222-2222-2222-222222222222';

describe('YearGroupParentsAudienceProvider', () => {
  function build(fixtures: {
    studentsByTenant: Record<string, Array<{ id: string; year_group_id: string }>>;
    parentIdsByStudentIds?: Record<string, string[]>;
    userIdsByParentIds?: Record<string, string[]>;
  }): YearGroupParentsAudienceProvider {
    const students = {
      findManyGeneric: jest.fn(
        async (tenantId: string, options: { where?: { year_group_id?: { in?: string[] } } }) => {
          const wanted = options.where?.year_group_id?.in ?? [];
          return (fixtures.studentsByTenant[tenantId] ?? [])
            .filter((s) => wanted.includes(s.year_group_id))
            .map((s) => ({ id: s.id }));
        },
      ),
      findParentIdsByStudentIds: jest.fn(async (_t: string, studentIds: string[]) => {
        const map = fixtures.parentIdsByStudentIds ?? {};
        return [...new Set(studentIds.flatMap((id) => map[id] ?? []))];
      }),
    } as unknown as StudentReadFacade;

    const users = {
      parentIdsToUserIds: jest.fn(async (_t: string, parentIds: string[]) => {
        const map = fixtures.userIdsByParentIds ?? {};
        return [...new Set(parentIds.flatMap((id) => map[id] ?? []))];
      }),
    } as unknown as AudienceUserIdResolver;

    return new YearGroupParentsAudienceProvider(students, users);
  }

  it('returns empty when no students in the year group', async () => {
    const provider = build({ studentsByTenant: { [TENANT_A]: [] } });
    await expect(provider.resolve(TENANT_A, { year_group_ids: [YG_1] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('resolves student → parent → user chain with dedupe', async () => {
    const provider = build({
      studentsByTenant: {
        [TENANT_A]: [
          { id: 'st1', year_group_id: YG_1 },
          { id: 'st2', year_group_id: YG_1 },
          { id: 'st3', year_group_id: YG_2 },
        ],
      },
      parentIdsByStudentIds: { st1: ['p1', 'p2'], st2: ['p2'] },
      userIdsByParentIds: { p1: ['u1'], p2: ['u2'] },
    });
    const result = await provider.resolve(TENANT_A, { year_group_ids: [YG_1] });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2']);
  });

  it('does not leak cross-tenant students', async () => {
    const provider = build({
      studentsByTenant: {
        [TENANT_A]: [{ id: 'a-st', year_group_id: YG_1 }],
        [TENANT_B]: [{ id: 'b-st', year_group_id: YG_1 }],
      },
      parentIdsByStudentIds: { 'a-st': ['pa'], 'b-st': ['pb'] },
      userIdsByParentIds: { pa: ['ua'], pb: ['ub'] },
    });
    const result = await provider.resolve(TENANT_A, { year_group_ids: [YG_1] });
    expect(result.user_ids).toEqual(['ua']);
  });
});
