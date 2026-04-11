import type { ClassesReadFacade } from '../../../classes/classes-read.facade';
import type { StudentReadFacade } from '../../../students/student-read.facade';
import type { AudienceUserIdResolver } from '../audience-user-id.resolver';

import { ClassParentsAudienceProvider } from './class-parents.provider';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const CLASS_1 = '11111111-1111-1111-1111-111111111111';
const CLASS_2 = '22222222-2222-2222-2222-222222222222';

describe('ClassParentsAudienceProvider', () => {
  function build(fixtures: {
    enrolmentsByTenant: Record<string, Record<string, string[]>>;
    parentIdsByStudentIds?: Record<string, string[]>;
    userIdsByParentIds?: Record<string, string[]>;
  }): ClassParentsAudienceProvider {
    const classes = {
      findEnrolledStudentIds: jest.fn(async (tenantId: string, classId: string) => {
        return fixtures.enrolmentsByTenant[tenantId]?.[classId] ?? [];
      }),
    } as unknown as ClassesReadFacade;

    const students = {
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

    return new ClassParentsAudienceProvider(classes, students, users);
  }

  it('returns empty when no students enrolled', async () => {
    const provider = build({ enrolmentsByTenant: { [TENANT_A]: { [CLASS_1]: [] } } });
    await expect(provider.resolve(TENANT_A, { class_ids: [CLASS_1] })).resolves.toEqual({
      user_ids: [],
    });
  });

  it('unions enrolments across multiple classes', async () => {
    const provider = build({
      enrolmentsByTenant: {
        [TENANT_A]: { [CLASS_1]: ['s1', 's2'], [CLASS_2]: ['s2', 's3'] },
      },
      parentIdsByStudentIds: { s1: ['p1'], s2: ['p2'], s3: ['p3'] },
      userIdsByParentIds: { p1: ['u1'], p2: ['u2'], p3: ['u3'] },
    });
    const result = await provider.resolve(TENANT_A, { class_ids: [CLASS_1, CLASS_2] });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('does not leak cross-tenant enrolments', async () => {
    const provider = build({
      enrolmentsByTenant: {
        [TENANT_A]: { [CLASS_1]: ['sa'] },
        [TENANT_B]: { [CLASS_1]: ['sb'] },
      },
      parentIdsByStudentIds: { sa: ['pa'], sb: ['pb'] },
      userIdsByParentIds: { pa: ['ua'], pb: ['ub'] },
    });
    const result = await provider.resolve(TENANT_A, { class_ids: [CLASS_1] });
    expect(result.user_ids).toEqual(['ua']);
  });
});
