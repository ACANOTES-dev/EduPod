import { DpaAcceptedGuard } from '../dpa-accepted.guard';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const ACCESS_USER = {
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  email: 'admin@test-school.ie',
  tenant_id: TENANT_ID,
  membership_id: 'membership-id',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

function buildHttpContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('DpaAcceptedGuard', () => {
  const mockDpaService = {
    getCurrentVersion: jest.fn(),
    hasAccepted: jest.fn(),
  };

  let guard: DpaAcceptedGuard;
  let originalNodeEnv: string | undefined;
  let originalJestWorkerId: string | undefined;

  beforeEach(() => {
    guard = new DpaAcceptedGuard(mockDpaService as never);
    originalNodeEnv = process.env.NODE_ENV;
    originalJestWorkerId = process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalJestWorkerId) {
      process.env.JEST_WORKER_ID = originalJestWorkerId;
    } else {
      delete process.env.JEST_WORKER_ID;
    }
    jest.clearAllMocks();
  });

  it('should allow exempt legal routes without checking acceptance', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/legal/dpa/status',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should throw a redirect-aware forbidden error when the tenant has not accepted the DPA', async () => {
    mockDpaService.getCurrentVersion.mockResolvedValue({ version: '2026.03' });
    mockDpaService.hasAccepted.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        buildHttpContext({
          method: 'GET',
          originalUrl: '/api/v1/students',
          tenantContext: { tenant_id: TENANT_ID },
          currentUser: ACCESS_USER,
        }) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'DPA_NOT_ACCEPTED',
          redirect: '/settings/legal/dpa',
        },
      },
    });
  });

  it('should allow access when the current DPA version has been accepted', async () => {
    mockDpaService.getCurrentVersion.mockResolvedValue({ version: '2026.03' });
    mockDpaService.hasAccepted.mockResolvedValue(true);

    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/students',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.hasAccepted).toHaveBeenCalledWith(TENANT_ID, '2026.03');
  });

  it('should allow OPTIONS requests without checking acceptance', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'OPTIONS',
        originalUrl: '/api/v1/students',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should allow access when no tenant context is present (platform-level)', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/platform/users',
        tenantContext: null,
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should allow access when no currentUser is present (unauthenticated)', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/students',
        tenantContext: { tenant_id: TENANT_ID },
        headers: {},
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should allow access for non-access token types (e.g., refresh tokens)', async () => {
    const refreshUser = { ...ACCESS_USER, type: 'refresh' as const };

    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/students',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: refreshUser,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should exempt auth routes', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'POST',
        originalUrl: '/api/v1/auth/login',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should exempt public routes', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'GET',
        originalUrl: '/api/v1/public/sub-processors',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });

  it('should exempt invitation acceptance routes', async () => {
    const allowed = await guard.canActivate(
      buildHttpContext({
        method: 'POST',
        originalUrl: '/api/v1/invitations/accept/some-token',
        tenantContext: { tenant_id: TENANT_ID },
        currentUser: ACCESS_USER,
      }) as never,
    );

    expect(allowed).toBe(true);
    expect(mockDpaService.getCurrentVersion).not.toHaveBeenCalled();
  });
});
