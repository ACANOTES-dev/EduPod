import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';
import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'ssssssss-ssss-ssss-ssss-ssssssssssss';

const mockJwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockTenantContext: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

function buildMockAuthService() {
  return {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    verifyRefreshToken: jest.fn(),
    requestPasswordReset: jest.fn(),
    confirmPasswordReset: jest.fn(),
    setupMfa: jest.fn(),
    verifyMfaSetup: jest.fn(),
    loginWithRecoveryCode: jest.fn(),
    switchTenant: jest.fn(),
    getMe: jest.fn(),
    listSessions: jest.fn(),
    revokeSession: jest.fn(),
  };
}

function buildMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: { 'user-agent': 'jest-test' },
    ip: '127.0.0.1',
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function buildMockResponse(): Response {
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  return res as unknown as Response;
}

describe('AuthController', () => {
  let controller: AuthController;
  let service: ReturnType<typeof buildMockAuthService>;

  beforeEach(async () => {
    service = buildMockAuthService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── login ────────────────────────────────────────────────────────────────

  it('should call login with email, password, ip, userAgent, and tenantId', async () => {
    const loginResult = {
      access_token: 'at-123',
      refresh_token: 'rt-456',
      user: { id: USER_ID, email: 'user@school.test' },
    };
    service.login.mockResolvedValue(loginResult);
    const req = buildMockRequest();
    const res = buildMockResponse();

    const result = await controller.login(
      { email: 'user@school.test', password: 'pass123' },
      req,
      res,
      mockTenantContext,
    );

    expect(service.login).toHaveBeenCalledWith(
      'user@school.test',
      'pass123',
      '127.0.0.1',
      'jest-test',
      TENANT_ID,
      undefined,
    );
    expect(result).toEqual({
      access_token: 'at-123',
      user: loginResult.user,
    });
  });

  it('should set refresh token cookie on successful login', async () => {
    const loginResult = {
      access_token: 'at-123',
      refresh_token: 'rt-456',
      user: { id: USER_ID },
    };
    service.login.mockResolvedValue(loginResult);
    const res = buildMockResponse();

    await controller.login(
      { email: 'user@school.test', password: 'pass123' },
      buildMockRequest(),
      res,
      null,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'rt-456',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
      }),
    );
  });

  it('should return mfa_required result without setting cookie', async () => {
    const mfaResult = { mfa_required: true as const, mfa_token: 'mfa-tok' };
    service.login.mockResolvedValue(mfaResult);
    const res = buildMockResponse();

    const result = await controller.login(
      { email: 'user@school.test', password: 'pass123' },
      buildMockRequest(),
      res,
      null,
    );

    expect(result).toEqual(mfaResult);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('should use tenant_id from dto.tenant_id over tenant context', async () => {
    const loginResult = {
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: USER_ID },
    };
    service.login.mockResolvedValue(loginResult);

    const dtoTenantId = 'dto-tenant-id';
    await controller.login(
      {
        email: 'user@school.test',
        password: 'pass123',
        tenant_id: dtoTenantId,
      },
      buildMockRequest(),
      buildMockResponse(),
      mockTenantContext,
    );

    expect(service.login).toHaveBeenCalledWith(
      'user@school.test',
      'pass123',
      '127.0.0.1',
      'jest-test',
      dtoTenantId,
      undefined,
    );
  });

  // ─── refresh ──────────────────────────────────────────────────────────────

  it('should call refresh with cookie token', async () => {
    const expected = { access_token: 'new-at' };
    service.refresh.mockResolvedValue(expected);

    const req = buildMockRequest({ cookies: { refresh_token: 'rt-cookie' } });
    const result = await controller.refresh(req);

    expect(service.refresh).toHaveBeenCalledWith('rt-cookie');
    expect(result).toBe(expected);
  });

  it('should throw UnauthorizedException when no refresh token cookie', async () => {
    const req = buildMockRequest({ cookies: {} });

    await expect(controller.refresh(req)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.refresh).not.toHaveBeenCalled();
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  it('should call logout and clear cookie', async () => {
    service.verifyRefreshToken.mockReturnValue({ session_id: SESSION_ID });
    service.logout.mockResolvedValue(undefined);

    const req = buildMockRequest({
      cookies: { refresh_token: 'valid-rt' },
    });
    const res = buildMockResponse();

    await controller.logout(mockJwtPayload, req, res);

    expect(service.verifyRefreshToken).toHaveBeenCalledWith('valid-rt');
    expect(service.logout).toHaveBeenCalledWith(SESSION_ID, USER_ID);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  // ─── password reset ───────────────────────────────────────────────────────

  it('should call requestPasswordReset with email', async () => {
    const expected = { message: 'If email exists, reset link sent' };
    service.requestPasswordReset.mockResolvedValue(expected);

    const result = await controller.requestPasswordReset({
      email: 'user@school.test',
    });

    expect(service.requestPasswordReset).toHaveBeenCalledWith(
      'user@school.test',
    );
    expect(result).toBe(expected);
  });

  it('should call confirmPasswordReset with token and new_password', async () => {
    const expected = { message: 'Password reset successfully' };
    service.confirmPasswordReset.mockResolvedValue(expected);

    const result = await controller.confirmPasswordReset({
      token: 'reset-token',
      new_password: 'NewSecure123!',
    });

    expect(service.confirmPasswordReset).toHaveBeenCalledWith(
      'reset-token',
      'NewSecure123!',
    );
    expect(result).toBe(expected);
  });

  // ─── MFA ──────────────────────────────────────────────────────────────────

  it('should call setupMfa with user id', async () => {
    const expected = {
      secret: 'JBSWY3DPEHPK3PXP',
      qr_code_url: 'data:image/png;...',
      otpauth_uri: 'otpauth://...',
    };
    service.setupMfa.mockResolvedValue(expected);

    const result = await controller.setupMfa(mockJwtPayload);

    expect(service.setupMfa).toHaveBeenCalledWith(USER_ID);
    expect(result).toBe(expected);
  });

  it('should call verifyMfaSetup with user id and code', async () => {
    const expected = { recovery_codes: ['abc', 'def'] };
    service.verifyMfaSetup.mockResolvedValue(expected);

    const result = await controller.verifyMfaSetup(mockJwtPayload, {
      code: '123456',
    });

    expect(service.verifyMfaSetup).toHaveBeenCalledWith(USER_ID, '123456');
    expect(result).toBe(expected);
  });

  // ─── recovery code login ─────────────────────────────────────────────────

  it('should call loginWithRecoveryCode and set cookie', async () => {
    const loginResult = {
      access_token: 'at-new',
      refresh_token: 'rt-new',
      user: { id: USER_ID },
    };
    service.loginWithRecoveryCode.mockResolvedValue(loginResult);
    const res = buildMockResponse();

    const result = await controller.loginWithRecoveryCode(
      {
        email: 'user@school.test',
        password: 'pass123',
        recovery_code: 'rec-code',
      },
      buildMockRequest(),
      res,
    );

    expect(service.loginWithRecoveryCode).toHaveBeenCalledWith(
      'user@school.test',
      'pass123',
      'rec-code',
      '127.0.0.1',
      'jest-test',
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'rt-new',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result).toEqual({
      access_token: 'at-new',
      user: loginResult.user,
    });
  });

  // ─── switch tenant ────────────────────────────────────────────────────────

  it('should call switchTenant with user sub, email, and target tenant_id', async () => {
    const expected = { access_token: 'switched-at' };
    service.switchTenant.mockResolvedValue(expected);

    const result = await controller.switchTenant(mockJwtPayload, {
      tenant_id: 'new-tenant-id',
    });

    expect(service.switchTenant).toHaveBeenCalledWith(
      USER_ID,
      'user@school.test',
      'new-tenant-id',
    );
    expect(result).toBe(expected);
  });

  // ─── getMe ────────────────────────────────────────────────────────────────

  it('should call getMe with user sub and tenant_id', async () => {
    const expected = {
      user: { id: USER_ID, email: 'user@school.test' },
      memberships: [],
    };
    service.getMe.mockResolvedValue(expected);

    const result = await controller.getMe(mockJwtPayload);

    expect(service.getMe).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    expect(result).toBe(expected);
  });

  // ─── sessions ─────────────────────────────────────────────────────────────

  it('should call listSessions and wrap result in data', async () => {
    const sessions = [
      { session_id: SESSION_ID, ip_address: '127.0.0.1' },
    ];
    service.listSessions.mockResolvedValue(sessions);

    const result = await controller.listSessions(mockJwtPayload);

    expect(service.listSessions).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual({ data: sessions });
  });

  it('should call revokeSession with user sub and session id', async () => {
    service.revokeSession.mockResolvedValue(undefined);

    await controller.revokeSession(mockJwtPayload, SESSION_ID);

    expect(service.revokeSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });
});
