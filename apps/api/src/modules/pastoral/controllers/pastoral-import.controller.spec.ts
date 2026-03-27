import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PastoralImportService } from '../services/pastoral-import.service';

import { PastoralImportController } from './pastoral-import.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';

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
  email: 'test@example.com',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockImportService = {
  validate: jest.fn(),
  confirm: jest.fn(),
  generateTemplate: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralImportController', () => {
  let controller: PastoralImportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PastoralImportController],
      providers: [
        { provide: PastoralImportService, useValue: mockImportService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PastoralImportController>(PastoralImportController);

    jest.clearAllMocks();
  });

  // ─── Guard / Decorator Metadata ─────────────────────────────────────────

  describe('class-level metadata', () => {
    it('should have @ModuleEnabled("pastoral") on the class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, PastoralImportController);
      expect(moduleKey).toBe('pastoral');
    });
  });

  describe('endpoint permissions', () => {
    it('should require pastoral.import_historical on validate', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralImportController.prototype.validate,
      );
      expect(permission).toBe('pastoral.import_historical');
    });

    it('should require pastoral.import_historical on confirm', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralImportController.prototype.confirm,
      );
      expect(permission).toBe('pastoral.import_historical');
    });

    it('should require pastoral.import_historical on getTemplate', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralImportController.prototype.getTemplate,
      );
      expect(permission).toBe('pastoral.import_historical');
    });
  });

  // ─── validate ───────────────────────────────────────────────────────────

  describe('validate', () => {
    it('should delegate to importService.validate with the file buffer', async () => {
      const fileBuffer = Buffer.from('col1,col2\nval1,val2');
      const file = {
        buffer: fileBuffer,
        originalname: 'import.csv',
        mimetype: 'text/csv',
        size: fileBuffer.length,
      };
      const expectedResult = { valid: true, errors: [], rows: 1 };
      mockImportService.validate.mockResolvedValue(expectedResult);

      const result = await controller.validate(TENANT, USER, file);

      expect(mockImportService.validate).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        fileBuffer,
      );
      expect(result).toBe(expectedResult);
    });

    it('should throw BadRequestException when no file is uploaded', async () => {
      await expect(
        controller.validate(TENANT, USER, undefined),
      ).rejects.toThrow(BadRequestException);

      expect(mockImportService.validate).not.toHaveBeenCalled();
    });
  });

  // ─── confirm ────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('should delegate to importService.confirm with the validation_token', async () => {
      const body = { validation_token: 'tok_abc123' };
      const expectedResult = { imported: 42, skipped: 0 };
      mockImportService.confirm.mockResolvedValue(expectedResult);

      const result = await controller.confirm(TENANT, USER, body);

      expect(mockImportService.confirm).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'tok_abc123',
      );
      expect(result).toBe(expectedResult);
    });
  });

  // ─── getTemplate ────────────────────────────────────────────────────────

  describe('getTemplate', () => {
    it('should call generateTemplate and send CSV with correct headers', () => {
      const csvBuffer = Buffer.from('col1,col2\n');
      mockImportService.generateTemplate.mockReturnValue(csvBuffer);

      const mockRes = {
        set: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      controller.getTemplate(mockRes as unknown as import('express').Response);

      expect(mockImportService.generateTemplate).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="pastoral-import-template.csv"',
      });
      expect(mockRes.send).toHaveBeenCalledWith(csvBuffer);
    });
  });
});
