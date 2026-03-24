import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PayrollEntriesController } from './payroll-entries.controller';
import { PayrollEntriesService } from './payroll-entries.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ENTRY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  updateEntry: jest.fn(),
  calculatePreview: jest.fn(),
};

describe('PayrollEntriesController', () => {
  let controller: PayrollEntriesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayrollEntriesController],
      providers: [
        { provide: PayrollEntriesService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollEntriesController>(PayrollEntriesController);
  });

  describe('update', () => {
    it('should delegate to service.updateEntry with tenant_id, entry id, and dto', async () => {
      const dto = { days_worked: 20, expected_updated_at: '2026-03-15T10:00:00.000Z' };
      const updated = { id: ENTRY_ID, days_worked: 20, basic_pay: 4545.45 };
      mockService.updateEntry.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, ENTRY_ID, dto);

      expect(mockService.updateEntry).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID, dto);
      expect(result).toEqual(updated);
    });

    it('should delegate classes_taught update for per_class entry', async () => {
      const dto = { classes_taught: 18, expected_updated_at: '2026-03-15T10:00:00.000Z' };
      const updated = { id: ENTRY_ID, classes_taught: 18, basic_pay: 3600 };
      mockService.updateEntry.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, ENTRY_ID, dto);

      expect(mockService.updateEntry).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('calculate', () => {
    it('should delegate to service.calculatePreview with tenant_id, entry id, and dto', async () => {
      const dto = { days_worked: 18 };
      const preview = { basic_pay: 4090.91, bonus_pay: 0, total_pay: 4090.91 };
      mockService.calculatePreview.mockResolvedValue(preview);

      const result = await controller.calculate(tenantContext, ENTRY_ID, dto);

      expect(mockService.calculatePreview).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID, dto);
      expect(result).toEqual(preview);
    });

    it('should return service preview result directly without modification', async () => {
      const dto = { classes_taught: 22 };
      const preview = { basic_pay: 4000, bonus_pay: 500, total_pay: 4500 };
      mockService.calculatePreview.mockResolvedValue(preview);

      const result = await controller.calculate(tenantContext, ENTRY_ID, dto);

      expect(result).toEqual(preview);
    });
  });
});
