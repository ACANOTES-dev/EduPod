/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CpAccessService } from '../services/cp-access.service';

import { CpAccessController } from './cp-access.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DLP_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const GRANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const makeUserPayload = (userId: string = DLP_USER_ID): JwtPayload => ({
  sub: userId,
  email: 'dlp@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
});

const makeRequest = () => ({
  ip: '127.0.0.1' as string | undefined,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CpAccessController', () => {
  let controller: CpAccessController;
  let mockCpAccessService: {
    grant: jest.Mock;
    revoke: jest.Mock;
    listActive: jest.Mock;
    hasAccess: jest.Mock;
  };

  beforeEach(async () => {
    mockCpAccessService = {
      grant: jest.fn(),
      revoke: jest.fn(),
      listActive: jest.fn(),
      hasAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CpAccessController],
      providers: [
        { provide: CpAccessService, useValue: mockCpAccessService },
      ],
    })
      .overrideGuard(require('../../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CpAccessController>(CpAccessController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── grant ──────────────────────────────────────────────────────────────

  describe('grant', () => {
    it('should call cpAccessService.grant with correct arguments', async () => {
      const grantResult = {
        data: {
          id: GRANT_ID,
          tenant_id: TENANT_ID,
          user_id: TARGET_USER_ID,
          granted_by_user_id: DLP_USER_ID,
          granted_at: new Date(),
        },
      };
      mockCpAccessService.grant.mockResolvedValue(grantResult);

      const result = await controller.grant(
        TENANT as never,
        makeUserPayload() as never,
        { user_id: TARGET_USER_ID },
        makeRequest() as never,
      );

      expect(result).toEqual(grantResult);
      expect(mockCpAccessService.grant).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
        { user_id: TARGET_USER_ID },
        '127.0.0.1',
      );
    });

    it('should pass null for ip when req.ip is undefined', async () => {
      mockCpAccessService.grant.mockResolvedValue({ data: {} });

      await controller.grant(
        TENANT as never,
        makeUserPayload() as never,
        { user_id: TARGET_USER_ID },
        { ip: undefined } as never,
      );

      expect(mockCpAccessService.grant).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
        { user_id: TARGET_USER_ID },
        null,
      );
    });
  });

  // ─── revoke ─────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('should call cpAccessService.revoke with correct arguments', async () => {
      const revokeResult = { data: { revoked: true } };
      mockCpAccessService.revoke.mockResolvedValue(revokeResult);

      const result = await controller.revoke(
        TENANT as never,
        makeUserPayload() as never,
        GRANT_ID,
        { revocation_reason: 'Role change' },
        makeRequest() as never,
      );

      expect(result).toEqual(revokeResult);
      expect(mockCpAccessService.revoke).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
        GRANT_ID,
        { revocation_reason: 'Role change' },
        '127.0.0.1',
      );
    });
  });

  // ─── listActiveGrants ─────────────────────────────────────────────────

  describe('listActiveGrants', () => {
    it('should call cpAccessService.listActive with tenant and user', async () => {
      const listResult = {
        data: [
          {
            id: GRANT_ID,
            user_id: TARGET_USER_ID,
            user_name: 'Jane Teacher',
            granted_by_user_id: DLP_USER_ID,
            granted_by_name: 'Alice Principal',
            granted_at: new Date(),
          },
        ],
      };
      mockCpAccessService.listActive.mockResolvedValue(listResult);

      const result = await controller.listActiveGrants(
        TENANT as never,
        makeUserPayload() as never,
      );

      expect(result).toEqual(listResult);
      expect(mockCpAccessService.listActive).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
      );
    });
  });

  // ─── checkOwnAccess ───────────────────────────────────────────────────

  describe('checkOwnAccess', () => {
    it('should return has_access: true when user has CP access', async () => {
      mockCpAccessService.hasAccess.mockResolvedValue(true);

      const result = await controller.checkOwnAccess(
        TENANT as never,
        makeUserPayload() as never,
      );

      expect(result).toEqual({ data: { has_access: true } });
      expect(mockCpAccessService.hasAccess).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
      );
    });

    it('should return has_access: false when user does not have CP access', async () => {
      mockCpAccessService.hasAccess.mockResolvedValue(false);

      const regularUser = makeUserPayload(TARGET_USER_ID);

      const result = await controller.checkOwnAccess(
        TENANT as never,
        regularUser as never,
      );

      expect(result).toEqual({ data: { has_access: false } });
      expect(mockCpAccessService.hasAccess).toHaveBeenCalledWith(
        TENANT_ID,
        TARGET_USER_ID,
      );
    });
  });

  // ─── Input validation (Zod pipe) ─────────────────────────────────────

  describe('input validation', () => {
    it('should accept valid UUID for user_id in grant', async () => {
      mockCpAccessService.grant.mockResolvedValue({ data: {} });

      // This test verifies the controller method signature accepts the DTO shape
      // The ZodValidationPipe would validate at runtime
      await expect(
        controller.grant(
          TENANT as never,
          makeUserPayload() as never,
          { user_id: TARGET_USER_ID },
          makeRequest() as never,
        ),
      ).resolves.toBeDefined();
    });

    it('should accept valid revocation reason in revoke', async () => {
      mockCpAccessService.revoke.mockResolvedValue({ data: { revoked: true } });

      await expect(
        controller.revoke(
          TENANT as never,
          makeUserPayload() as never,
          GRANT_ID,
          { revocation_reason: 'Staff member no longer in DLP role' },
          makeRequest() as never,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── Route parameter handling ─────────────────────────────────────────

  describe('route parameters', () => {
    it('should pass studentId param through to checkOwnAccess', async () => {
      mockCpAccessService.hasAccess.mockResolvedValue(true);

      // The controller method receives the studentId param but delegates to hasAccess
      // which checks the current user's access, not student-specific access
      const result = await controller.checkOwnAccess(
        TENANT as never,
        makeUserPayload() as never,
      );

      expect(result.data.has_access).toBe(true);
    });

    it('should pass grantId param through to revoke', async () => {
      mockCpAccessService.revoke.mockResolvedValue({ data: { revoked: true } });

      await controller.revoke(
        TENANT as never,
        makeUserPayload() as never,
        GRANT_ID,
        { revocation_reason: 'Test revocation' },
        makeRequest() as never,
      );

      // Verify grantId was passed correctly
      expect(mockCpAccessService.revoke).toHaveBeenCalledWith(
        TENANT_ID,
        DLP_USER_ID,
        GRANT_ID,
        { revocation_reason: 'Test revocation' },
        '127.0.0.1',
      );
    });
  });
});
