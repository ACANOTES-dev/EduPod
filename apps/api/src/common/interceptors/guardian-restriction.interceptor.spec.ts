import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';

import { BehaviourReadFacade } from '../../modules/behaviour/behaviour-read.facade';
import { ParentReadFacade } from '../../modules/parents/parent-read.facade';

import { GuardianRestrictionInterceptor } from './guardian-restriction.interceptor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PARENT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const OTHER_STUDENT_ID = '55555555-5555-5555-5555-555555555555';

interface MockRequest {
  path: string;
  originalUrl: string;
  params: Record<string, string | undefined>;
  query: Record<string, string | string[] | undefined>;
  currentUser?: { sub: string; tenant_id?: string | null };
  tenantContext?: { tenant_id: string } | null;
}

function buildContext(req: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function buildNext(): CallHandler {
  return { handle: () => of('ok') } as CallHandler;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GuardianRestrictionInterceptor', () => {
  let parentFacade: jest.Mocked<ParentReadFacade>;
  let behaviourFacade: jest.Mocked<BehaviourReadFacade>;
  let interceptor: GuardianRestrictionInterceptor;

  beforeEach(() => {
    parentFacade = {
      resolveIdByUserId: jest.fn(),
    } as unknown as jest.Mocked<ParentReadFacade>;
    behaviourFacade = {
      findActiveRestrictionsForParent: jest.fn(),
    } as unknown as jest.Mocked<BehaviourReadFacade>;

    interceptor = new GuardianRestrictionInterceptor(parentFacade, behaviourFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('passes through non-parent paths unchanged', async () => {
    const ctx = buildContext({
      path: '/api/v1/students',
      originalUrl: '/api/v1/students',
      params: {},
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
    expect(parentFacade.resolveIdByUserId).not.toHaveBeenCalled();
  });

  it('passes through when user is not a parent', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(null);
    const ctx = buildContext({
      path: '/api/v1/parent/behaviour/incidents',
      originalUrl: '/api/v1/parent/behaviour/incidents',
      params: {},
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
    expect(behaviourFacade.findActiveRestrictionsForParent).not.toHaveBeenCalled();
  });

  it('passes through when parent has no active restrictions', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
    behaviourFacade.findActiveRestrictionsForParent.mockResolvedValue([]);
    const ctx = buildContext({
      path: '/api/v1/parent/behaviour/incidents',
      originalUrl: '/api/v1/parent/behaviour/incidents',
      params: { student_id: STUDENT_ID },
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
  });

  it('passes through list endpoints with no specific student in path/query', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
    behaviourFacade.findActiveRestrictionsForParent.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        restriction_type: 'no_contact_full' as never,
      },
    ]);
    const ctx = buildContext({
      path: '/api/v1/parent/behaviour/recognition',
      originalUrl: '/api/v1/parent/behaviour/recognition',
      params: {},
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
  });

  it('throws GUARDIAN_RESTRICTED when restriction targets the requested student', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
    behaviourFacade.findActiveRestrictionsForParent.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        restriction_type: 'no_contact_full' as never,
      },
    ]);
    const ctx = buildContext({
      path: `/api/v1/parent/behaviour/incidents`,
      originalUrl: `/api/v1/parent/behaviour/incidents?student_id=${STUDENT_ID}`,
      params: {},
      query: { student_id: STUDENT_ID },
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    await expect(interceptor.intercept(ctx, buildNext())).rejects.toThrow(ForbiddenException);
  });

  it('passes through when restriction targets a DIFFERENT student than the requested one', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
    behaviourFacade.findActiveRestrictionsForParent.mockResolvedValue([
      {
        student_id: OTHER_STUDENT_ID,
        restriction_type: 'no_contact_full' as never,
      },
    ]);
    const ctx = buildContext({
      path: `/api/v1/parent/homework/students/${STUDENT_ID}`,
      originalUrl: `/api/v1/parent/homework/students/${STUDENT_ID}`,
      params: { student_id: STUDENT_ID },
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
  });

  it('passes through when there is no current user (auth guard will reject)', async () => {
    const ctx = buildContext({
      path: '/api/v1/parent/behaviour/incidents',
      originalUrl: '/api/v1/parent/behaviour/incidents',
      params: {},
      query: {},
    });

    const result = await interceptor.intercept(ctx, buildNext());
    await expect((result as ReturnType<typeof of>).toPromise()).resolves.toBe('ok');
    expect(parentFacade.resolveIdByUserId).not.toHaveBeenCalled();
  });

  it('matches the studentId camelCase param', async () => {
    parentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
    behaviourFacade.findActiveRestrictionsForParent.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        restriction_type: 'no_messaging' as never,
      },
    ]);
    const ctx = buildContext({
      path: `/api/v1/parent/students/${STUDENT_ID}`,
      originalUrl: `/api/v1/parent/students/${STUDENT_ID}`,
      params: { studentId: STUDENT_ID },
      query: {},
      currentUser: { sub: USER_ID, tenant_id: TENANT_ID },
    });

    await expect(interceptor.intercept(ctx, buildNext())).rejects.toThrow(ForbiddenException);
  });
});
