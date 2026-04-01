/* eslint-disable @typescript-eslint/no-require-imports */
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

// ─── Mock factories ─────────────────────────────────────────────────────────

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

// ─── Test suite ─────────────────────────────────────────────────────────────

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

  describe('AuthController -- login', () => {
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

    it('should set refresh token as httpOnly cookie on successful login', async () => {
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
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );
    });

    it('should not include refresh_token in the response body', async () => {
      const loginResult = {
        access_token: 'at-123',
        refresh_token: 'rt-456',
        user: { id: USER_ID },
      };
      service.login.mockResolvedValue(loginResult);

      const result = await controller.login(
        { email: 'user@school.test', password: 'pass123' },
        buildMockRequest(),
        buildMockResponse(),
        null,
      );

      expect(result).not.toHaveProperty('refresh_token');
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

    it('should use tenant_id from dto body over tenant context', async () => {
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

    it('should extract IP from x-forwarded-for header', async () => {
      const loginResult = {
        access_token: 'at',
        refresh_token: 'rt',
        user: { id: USER_ID },
      };
      service.login.mockResolvedValue(loginResult);

      const req = buildMockRequest({
        headers: {
          'x-forwarded-for': '203.0.113.1, 10.0.0.1',
          'user-agent': 'jest-test',
        },
      });

      await controller.login(
        { email: 'user@school.test', password: 'pass123' },
        req,
        buildMockResponse(),
        null,
      );

      expect(service.login).toHaveBeenCalledWith(
        'user@school.test',
        'pass123',
        '203.0.113.1',
        'jest-test',
        undefined,
        undefined,
      );
    });

    it('should pass mfa_code from dto when present', async () => {
      const loginResult = {
        access_token: 'at',
        refresh_token: 'rt',
        user: { id: USER_ID },
      };
      service.login.mockResolvedValue(loginResult);

      await controller.login(
        {
          email: 'user@school.test',
          password: 'pass123',
          mfa_code: '123456',
        },
        buildMockRequest(),
        buildMockResponse(),
        null,
      );

      expect(service.login).toHaveBeenCalledWith(
        'user@school.test',
        'pass123',
        '127.0.0.1',
        'jest-test',
        undefined,
        '123456',
      );
    });

    it('should use req.ip when x-forwarded-for is absent', async () => {
      const loginResult = {
        access_token: 'at',
        refresh_token: 'rt',
        user: { id: USER_ID },
      };
      service.login.mockResolvedValue(loginResult);

      const req = buildMockRequest({
        headers: { 'user-agent': 'jest-test' },
        ip: '192.168.1.100',
      });

      await controller.login(
        { email: 'user@school.test', password: 'pass123' },
        req,
        buildMockResponse(),
        null,
      );

      expect(service.login).toHaveBeenCalledWith(
        'user@school.test',
        'pass123',
        '192.168.1.100',
        'jest-test',
        undefined,
        undefined,
      );
    });
  });

  // ─── refresh ──────────────────────────────────────────────────────────────

  describe('AuthController -- refresh', () => {
    it('should call refresh with cookie token and return new access token', async () => {
      const expected = { access_token: 'new-at' };
      service.refresh.mockResolvedValue(expected);

      const req = buildMockRequest({ cookies: { refresh_token: 'rt-cookie' } });
      const result = await controller.refresh(req);

      expect(service.refresh).toHaveBeenCalledWith('rt-cookie');
      expect(result).toBe(expected);
    });

    it('should throw UnauthorizedException when no refresh token cookie present', async () => {
      const req = buildMockRequest({ cookies: {} });

      await expect(controller.refresh(req)).rejects.toThrow(UnauthorizedException);
      expect(service.refresh).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException with MISSING_REFRESH_TOKEN code', async () => {
      const req = buildMockRequest({ cookies: {} });

      await expect(controller.refresh(req)).rejects.toMatchObject({
        response: {
          error: expect.objectContaining({ code: 'MISSING_REFRESH_TOKEN' }),
        },
      });
    });

    it('should throw UnauthorizedException when cookies object is undefined', async () => {
      const req = buildMockRequest();
      // Remove cookies entirely
      delete (req as unknown as Record<string, unknown>).cookies;

      await expect(controller.refresh(req)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('AuthController -- logout', () => {
    it('should call logout with session_id from refresh token and clear cookie', async () => {
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
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/v1/auth/refresh',
        }),
      );
    });

    it('should still clear cookie even when no refresh token present', async () => {
      const req = buildMockRequest({ cookies: {} });
      const res = buildMockResponse();

      await controller.logout(mockJwtPayload, req, res);

      expect(service.verifyRefreshToken).not.toHaveBeenCalled();
      expect(service.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
    });

    it('should still clear cookie when refresh token is invalid', async () => {
      service.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const req = buildMockRequest({
        cookies: { refresh_token: 'invalid-rt' },
      });
      const res = buildMockResponse();

      await controller.logout(mockJwtPayload, req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
      // logout should not have been called since verifyRefreshToken threw
      expect(service.logout).not.toHaveBeenCalled();
    });
  });

  // ─── requestPasswordReset ─────────────────────────────────────────────────

  describe('AuthController -- requestPasswordReset', () => {
    it('should call requestPasswordReset with email from body', async () => {
      const expected = { message: 'If email exists, reset link sent' };
      service.requestPasswordReset.mockResolvedValue(expected);

      const result = await controller.requestPasswordReset({
        email: 'user@school.test',
      });

      expect(service.requestPasswordReset).toHaveBeenCalledWith('user@school.test');
      expect(result).toBe(expected);
    });
  });

  // ─── confirmPasswordReset ─────────────────────────────────────────────────

  describe('AuthController -- confirmPasswordReset', () => {
    it('should call confirmPasswordReset with token and new_password', async () => {
      const expected = { message: 'Password reset successfully' };
      service.confirmPasswordReset.mockResolvedValue(expected);

      const result = await controller.confirmPasswordReset({
        token: 'reset-token',
        new_password: 'NewSecure123!',
      });

      expect(service.confirmPasswordReset).toHaveBeenCalledWith('reset-token', 'NewSecure123!');
      expect(result).toBe(expected);
    });
  });

  // ─── setupMfa ─────────────────────────────────────────────────────────────

  describe('AuthController -- setupMfa', () => {
    it('should call setupMfa with user id from JWT', async () => {
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
  });

  // ─── verifyMfaSetup ──────────────────────────────────────────────────────

  describe('AuthController -- verifyMfaSetup', () => {
    it('should call verifyMfaSetup with user id and code from body', async () => {
      const expected = { recovery_codes: ['abc', 'def'] };
      service.verifyMfaSetup.mockResolvedValue(expected);

      const result = await controller.verifyMfaSetup(mockJwtPayload, {
        code: '123456',
      });

      expect(service.verifyMfaSetup).toHaveBeenCalledWith(USER_ID, '123456');
      expect(result).toBe(expected);
    });
  });

  // ─── loginWithRecoveryCode ────────────────────────────────────────────────

  describe('AuthController -- loginWithRecoveryCode', () => {
    it('should call loginWithRecoveryCode and set cookie on success', async () => {
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

    it('should not include refresh_token in the response body', async () => {
      const loginResult = {
        access_token: 'at-new',
        refresh_token: 'rt-new',
        user: { id: USER_ID },
      };
      service.loginWithRecoveryCode.mockResolvedValue(loginResult);

      const result = await controller.loginWithRecoveryCode(
        {
          email: 'user@school.test',
          password: 'pass123',
          recovery_code: 'rec-code',
        },
        buildMockRequest(),
        buildMockResponse(),
      );

      expect(result).not.toHaveProperty('refresh_token');
    });

    it('should extract IP from x-forwarded-for for recovery login', async () => {
      service.loginWithRecoveryCode.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        user: { id: USER_ID },
      });

      const req = buildMockRequest({
        headers: {
          'x-forwarded-for': '198.51.100.5',
          'user-agent': 'test-browser',
        },
      });

      await controller.loginWithRecoveryCode(
        {
          email: 'user@school.test',
          password: 'pass123',
          recovery_code: 'rec-code',
        },
        req,
        buildMockResponse(),
      );

      expect(service.loginWithRecoveryCode).toHaveBeenCalledWith(
        'user@school.test',
        'pass123',
        'rec-code',
        '198.51.100.5',
        'test-browser',
      );
    });
  });

  // ─── switchTenant ─────────────────────────────────────────────────────────

  describe('AuthController -- switchTenant', () => {
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
  });

  // ─── getMe ────────────────────────────────────────────────────────────────

  describe('AuthController -- getMe', () => {
    it('should call getMe with user sub and tenant_id from JWT', async () => {
      const expected = {
        user: { id: USER_ID, email: 'user@school.test' },
        memberships: [],
      };
      service.getMe.mockResolvedValue(expected);

      const result = await controller.getMe(mockJwtPayload);

      expect(service.getMe).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(result).toBe(expected);
    });

    it('should pass null tenant_id when JWT has null tenant_id', async () => {
      const payloadNoTenant: JwtPayload = {
        ...mockJwtPayload,
        tenant_id: null,
      };
      service.getMe.mockResolvedValue({
        user: { id: USER_ID },
        memberships: [],
      });

      await controller.getMe(payloadNoTenant);

      expect(service.getMe).toHaveBeenCalledWith(USER_ID, null);
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────────

  describe('AuthController -- listSessions', () => {
    it('should call listSessions and wrap result in data envelope', async () => {
      const sessions = [
        {
          session_id: SESSION_ID,
          ip_address: '127.0.0.1',
          user_agent: 'Chrome',
          created_at: '2026-01-01T00:00:00.000Z',
          last_active_at: '2026-01-01T01:00:00.000Z',
          tenant_id: null,
        },
      ];
      service.listSessions.mockResolvedValue(sessions);

      const result = await controller.listSessions(mockJwtPayload);

      expect(service.listSessions).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({ data: sessions });
    });

    it('should return empty data array when no sessions', async () => {
      service.listSessions.mockResolvedValue([]);

      const result = await controller.listSessions(mockJwtPayload);

      expect(result).toEqual({ data: [] });
    });
  });

  // ─── revokeSession ────────────────────────────────────────────────────────

  describe('AuthController -- revokeSession', () => {
    it('should call revokeSession with user sub and session id param', async () => {
      service.revokeSession.mockResolvedValue(undefined);

      await controller.revokeSession(mockJwtPayload, SESSION_ID);

      expect(service.revokeSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    });
  });
});
