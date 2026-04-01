import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';

import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { DpaService } from '../dpa.service';
import { LegalDpaController } from '../legal-dpa.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'admin@test-school.ie',
  tenant_id: TENANT_ID,
  membership_id: 'membership-id',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock Service ───────────────────────────────────────────────────────────

const mockDpaService = {
  getCurrentVersion: jest.fn(),
  getStatus: jest.fn(),
  acceptCurrentVersion: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('LegalDpaController', () => {
  let controller: LegalDpaController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalDpaController],
      providers: [{ provide: DpaService, useValue: mockDpaService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LegalDpaController>(LegalDpaController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── GET /v1/legal/dpa/current ─────────────────────────────────────────────

  describe('LegalDpaController -- getCurrent', () => {
    it('should call service.getCurrentVersion and return the result', async () => {
      const version = {
        id: 'version-id',
        version: '2026.03',
        content_html: '<section>DPA content</section>',
      };
      mockDpaService.getCurrentVersion.mockResolvedValue(version);

      const result = await controller.getCurrent();

      expect(mockDpaService.getCurrentVersion).toHaveBeenCalledTimes(1);
      expect(result).toBe(version);
    });

    it('should require legal.view permission', () => {
      expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getCurrent)).toBe(
        'legal.view',
      );
    });
  });

  // ─── GET /v1/legal/dpa/status ──────────────────────────────────────────────

  describe('LegalDpaController -- getStatus', () => {
    it('should call service.getStatus with tenant ID', async () => {
      const status = {
        accepted: true,
        current_version: { version: '2026.03' },
        accepted_version: '2026.03',
        accepted_at: new Date(),
        accepted_by_user_id: USER_ID,
        history: [],
      };
      mockDpaService.getStatus.mockResolvedValue(status);

      const result = await controller.getStatus(TENANT);

      expect(mockDpaService.getStatus).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(status);
    });

    it('should require legal.view permission', () => {
      expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getStatus)).toBe('legal.view');
    });
  });

  // ─── POST /v1/legal/dpa/accept ────────────────────────────────────────────

  describe('LegalDpaController -- accept', () => {
    it('should call service.acceptCurrentVersion with tenant, user, and IP', async () => {
      const acceptance = { id: 'acceptance-id', dpa_version: '2026.03' };
      mockDpaService.acceptCurrentVersion.mockResolvedValue(acceptance);

      const mockRequest = { ip: '192.168.1.1' } as Request;

      const result = await controller.accept(TENANT, USER, mockRequest);

      expect(mockDpaService.acceptCurrentVersion).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        '192.168.1.1',
      );
      expect(result).toBe(acceptance);
    });

    it('should require legal.manage permission', () => {
      expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.accept)).toBe('legal.manage');
    });
  });
});
