import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STAFF_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const userPayload = { sub: USER_ID, membership_id: 'mem-1', email: 'test@test.com', tenant_id: TENANT_ID, type: 'access' as const, iat: 0, exp: 9999999999 };

const mockService = {
  listCompensation: jest.fn(),
  getCompensation: jest.fn(),
  createCompensation: jest.fn(),
  updateCompensation: jest.fn(),
  bulkImport: jest.fn(),
};

describe('CompensationController', () => {
  let controller: CompensationController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [CompensationController],
      providers: [
        { provide: CompensationService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompensationController>(CompensationController);
  });

  describe('list', () => {
    it('should delegate to service.listCompensation with tenant_id and query', async () => {
      const comps = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listCompensation.mockResolvedValue(comps);

      const result = await controller.list(tenantContext, { page: 1, pageSize: 20, active_only: true });

      expect(mockService.listCompensation).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20, active_only: true });
      expect(result).toEqual(comps);
    });
  });

  describe('get', () => {
    it('should delegate to service.getCompensation with tenant_id and id', async () => {
      const comp = { id: COMP_ID, compensation_type: 'salaried' };
      mockService.getCompensation.mockResolvedValue(comp);

      const result = await controller.get(tenantContext, COMP_ID);

      expect(mockService.getCompensation).toHaveBeenCalledWith(TENANT_ID, COMP_ID);
      expect(result).toEqual(comp);
    });
  });

  describe('create', () => {
    it('should delegate to service.createCompensation with tenant_id, user sub, and dto', async () => {
      const dto = {
        staff_profile_id: STAFF_ID,
        compensation_type: 'salaried' as const,
        base_salary: 5000,
        per_class_rate: null,
        assigned_class_count: null,
        bonus_class_rate: null,
        bonus_day_multiplier: 1.5,
        effective_from: '2026-03-01',
      };
      const created = { id: COMP_ID, ...dto };
      mockService.createCompensation.mockResolvedValue(created);

      const result = await controller.create(tenantContext, userPayload, dto);

      expect(mockService.createCompensation).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('should delegate to service.updateCompensation with tenant_id, id, and dto', async () => {
      const dto = { base_salary: 6000, expected_updated_at: '2026-03-01T00:00:00.000Z' };
      const updated = { id: COMP_ID, base_salary: 6000 };
      mockService.updateCompensation.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, COMP_ID, dto);

      expect(mockService.updateCompensation).toHaveBeenCalledWith(TENANT_ID, COMP_ID, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('bulkImport', () => {
    it('should throw BadRequestException when no file is provided', async () => {
      await expect(controller.bulkImport(tenantContext, userPayload, undefined)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.bulkImport(tenantContext, userPayload, undefined)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FILE_REQUIRED' }),
      });

      expect(mockService.bulkImport).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file is not CSV', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'data.xlsx',
        mimetype: 'application/vnd.ms-excel',
        size: 100,
      };

      await expect(controller.bulkImport(tenantContext, userPayload, file)).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.bulkImport(tenantContext, userPayload, file)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_FILE_TYPE' }),
      });
    });

    it('should delegate to service.bulkImport when a valid CSV file is provided', async () => {
      const file = {
        buffer: Buffer.from('staff_profile_id,compensation_type\n'),
        originalname: 'import.csv',
        mimetype: 'text/csv',
        size: 50,
      };
      mockService.bulkImport.mockResolvedValue({ imported: 1, errors: [] });

      const result = await controller.bulkImport(tenantContext, userPayload, file);

      expect(mockService.bulkImport).toHaveBeenCalledWith(TENANT_ID, USER_ID, file.buffer);
      expect(result).toEqual({ imported: 1, errors: [] });
    });
  });
});
