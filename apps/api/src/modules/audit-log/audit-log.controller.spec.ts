import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { AuditLogController, PlatformAuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockGuard: CanActivate = { canActivate: () => true };

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let mockService: {
    list: jest.Mock;
    listPlatform: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      listPlatform: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list()', () => {
    const tenant: TenantContext = {
      tenant_id: TENANT_ID,
      slug: 'test-school',
      name: 'Test School',
      status: 'active',
      default_locale: 'en',
      timezone: 'Europe/Dublin',
    };

    it('should call auditLogService.list with tenant id and query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.list.mockResolvedValue(expected);

      const result = await controller.list(tenant, query);

      expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(expected);
    });

    it('should forward filters to service', async () => {
      const query = { page: 2, pageSize: 10, entity_type: 'student', action: 'create' };
      mockService.list.mockResolvedValue({ data: [], meta: { page: 2, pageSize: 10, total: 0 } });

      await controller.list(tenant, query);

      expect(mockService.list).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('should return audit log data from the service', async () => {
      const query = { page: 1, pageSize: 20 };
      const logEntry = {
        id: 'log-1',
        tenant_id: TENANT_ID,
        entity_type: 'student',
        action: 'create',
        created_at: '2026-03-15T10:00:00.000Z',
      };
      const expected = { data: [logEntry], meta: { page: 1, pageSize: 20, total: 1 } };
      mockService.list.mockResolvedValue(expected);

      const result = await controller.list(tenant, query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});

describe('PlatformAuditLogController', () => {
  let controller: PlatformAuditLogController;
  let mockService: {
    list: jest.Mock;
    listPlatform: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn(),
      listPlatform: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformAuditLogController],
      providers: [{ provide: AuditLogService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PlatformOwnerGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<PlatformAuditLogController>(PlatformAuditLogController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list()', () => {
    it('should call auditLogService.listPlatform with query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listPlatform.mockResolvedValue(expected);

      const result = await controller.list(query);

      expect(mockService.listPlatform).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });

    it('should forward tenant_id filter to service', async () => {
      const query = { page: 1, pageSize: 20, tenant_id: TENANT_ID };
      mockService.listPlatform.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.list(query);

      expect(mockService.listPlatform).toHaveBeenCalledWith(query);
    });

    it('should return platform audit log data', async () => {
      const query = { page: 1, pageSize: 20 };
      const logEntry = {
        id: 'log-1',
        tenant_id: TENANT_ID,
        tenant_name: 'Al Noor School',
        entity_type: 'tenant',
        action: 'update',
        created_at: '2026-03-15T12:00:00.000Z',
      };
      const expected = { data: [logEntry], meta: { page: 1, pageSize: 20, total: 1 } };
      mockService.listPlatform.mockResolvedValue(expected);

      const result = await controller.list(query);

      expect(result.data).toHaveLength(1);
    });
  });
});
