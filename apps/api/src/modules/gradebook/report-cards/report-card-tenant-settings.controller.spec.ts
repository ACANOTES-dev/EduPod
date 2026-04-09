import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardTenantSettingsController } from './report-card-tenant-settings.controller';
import { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser: Pick<JwtPayload, 'sub' | 'email'> = {
  sub: USER_ID,
  email: 'admin@school.test',
};

const mockSettingsService = {
  get: jest.fn(),
  update: jest.fn(),
  uploadPrincipalSignature: jest.fn(),
  deletePrincipalSignature: jest.fn(),
};

const mockPrisma = {};
const mockPermissionCacheService = { getPermissions: jest.fn() };

describe('ReportCardTenantSettingsController', () => {
  let controller: ReportCardTenantSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardTenantSettingsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCardTenantSettingsService, useValue: mockSettingsService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ReportCardTenantSettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('get', () => {
    it('delegates to service.get', async () => {
      const row = { id: 'x', settings: { matrix_display_mode: 'grade' } };
      mockSettingsService.get.mockResolvedValue(row);

      const result = await controller.get(tenantContext);
      expect(mockSettingsService.get).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(row);
    });
  });

  describe('update', () => {
    it('delegates to service.update with the actor id and DTO', async () => {
      const dto = { matrix_display_mode: 'score' as const };
      const updated = { id: 'x', settings: { ...dto } };
      mockSettingsService.update.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, jwtUser as JwtPayload, dto);

      expect(mockSettingsService.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toBe(updated);
    });
  });

  describe('uploadPrincipalSignature', () => {
    it('rejects when no file is present', async () => {
      await expect(
        controller.uploadPrincipalSignature(
          tenantContext,
          jwtUser as JwtPayload,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to service with file + principal_name from body', async () => {
      const file = {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 8,
      };
      mockSettingsService.uploadPrincipalSignature.mockResolvedValue({ id: 'x' });

      await controller.uploadPrincipalSignature(tenantContext, jwtUser as JwtPayload, file, {
        principal_name: 'Dr Smith',
      });

      expect(mockSettingsService.uploadPrincipalSignature).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        file,
        { principalName: 'Dr Smith' },
      );
    });
  });

  describe('deletePrincipalSignature', () => {
    it('delegates to service.deletePrincipalSignature', async () => {
      mockSettingsService.deletePrincipalSignature.mockResolvedValue({ id: 'x' });
      await controller.deletePrincipalSignature(tenantContext, jwtUser as JwtPayload);
      expect(mockSettingsService.deletePrincipalSignature).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });
});
