import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsService } from './payslips.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MEMBERSHIP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const userPayload = {
  sub: USER_ID,
  membership_id: MEMBERSHIP_ID,
  email: 'test@test.com',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 9999999999,
};

const mockPayrollRunsService = {
  listRuns: jest.fn(),
  getRun: jest.fn(),
  createRun: jest.fn(),
  updateRun: jest.fn(),
  listEntries: jest.fn(),
  refreshEntries: jest.fn(),
  triggerSessionGeneration: jest.fn(),
  getSessionGenerationStatus: jest.fn(),
  finalise: jest.fn(),
  cancelRun: jest.fn(),
};

const mockPayslipsService = {
  triggerMassExport: jest.fn(),
  getMassExportStatus: jest.fn(),
};

const mockAllowancesService = { listForRun: jest.fn() };
const mockAdjustmentsService = { listForRun: jest.fn() };
const mockAnomalyService = { scanForAnomalies: jest.fn() };
const mockReportsService = { getRunComparison: jest.fn() };
const mockPermissionCache = { isOwner: jest.fn() };

describe('PayrollRunsController', () => {
  let controller: PayrollRunsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayrollRunsController],
      providers: [
        { provide: PayrollRunsService, useValue: mockPayrollRunsService },
        { provide: PayslipsService, useValue: mockPayslipsService },
        { provide: PayrollAllowancesService, useValue: mockAllowancesService },
        { provide: PayrollAdjustmentsService, useValue: mockAdjustmentsService },
        { provide: PayrollAnomalyService, useValue: mockAnomalyService },
        { provide: PayrollReportsService, useValue: mockReportsService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollRunsController>(PayrollRunsController);
  });

  describe('list', () => {
    it('should delegate to payrollRunsService.listRuns with tenant_id and query', async () => {
      const runs = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockPayrollRunsService.listRuns.mockResolvedValue(runs);

      const result = await controller.list(tenantContext, { page: 1, pageSize: 20 });

      expect(mockPayrollRunsService.listRuns).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(runs);
    });
  });

  describe('get', () => {
    it('should delegate to payrollRunsService.getRun with tenant_id and run id', async () => {
      const run = { id: RUN_ID, status: 'draft' };
      mockPayrollRunsService.getRun.mockResolvedValue(run);

      const result = await controller.get(tenantContext, RUN_ID);

      expect(mockPayrollRunsService.getRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(run);
    });
  });

  describe('create', () => {
    it('should delegate to payrollRunsService.createRun with tenant_id, user sub, and dto', async () => {
      const dto = {
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
      };
      const run = { id: RUN_ID, ...dto, status: 'draft' };
      mockPayrollRunsService.createRun.mockResolvedValue(run);

      const result = await controller.create(tenantContext, userPayload, dto);

      expect(mockPayrollRunsService.createRun).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(run);
    });
  });

  describe('update', () => {
    it('should delegate to payrollRunsService.updateRun with tenant_id, id, and dto', async () => {
      const dto = { total_working_days: 20, expected_updated_at: '2026-03-15T10:00:00.000Z' };
      const updated = { id: RUN_ID, total_working_days: 20 };
      mockPayrollRunsService.updateRun.mockResolvedValue(updated);

      const result = await controller.update(tenantContext, RUN_ID, dto);

      expect(mockPayrollRunsService.updateRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID, dto);
      expect(result).toEqual(updated);
    });
  });

  describe('listEntries', () => {
    it('should delegate to payrollRunsService.listEntries', async () => {
      const entries = [{ id: 'entry-1' }];
      mockPayrollRunsService.listEntries.mockResolvedValue(entries);

      const result = await controller.listEntries(tenantContext, RUN_ID);

      expect(mockPayrollRunsService.listEntries).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(entries);
    });
  });

  describe('cancel', () => {
    it('should delegate to payrollRunsService.cancelRun', async () => {
      const cancelled = { id: RUN_ID, status: 'cancelled' };
      mockPayrollRunsService.cancelRun.mockResolvedValue(cancelled);

      const result = await controller.cancel(tenantContext, RUN_ID);

      expect(mockPayrollRunsService.cancelRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(cancelled);
    });
  });

  describe('massExport', () => {
    it('should delegate to payslipsService.triggerMassExport', async () => {
      const exportResult = { job_id: 'job-1', status: 'queued' };
      mockPayslipsService.triggerMassExport.mockResolvedValue(exportResult);

      const result = await controller.massExport(tenantContext, userPayload, RUN_ID, {
        locale: 'en',
      });

      expect(mockPayslipsService.triggerMassExport).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        'en',
        USER_ID,
      );
      expect(result).toEqual(exportResult);
    });
  });

  describe('getMassExportStatus', () => {
    it('should delegate to payslipsService.getMassExportStatus', async () => {
      const status = { status: 'processing', progress: 50 };
      mockPayslipsService.getMassExportStatus.mockResolvedValue(status);

      const result = await controller.getMassExportStatus(tenantContext, RUN_ID);

      expect(mockPayslipsService.getMassExportStatus).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(status);
    });
  });

  // ─── Wave 3 — run sub-resources, aliases, isSchoolOwner ──────────────

  describe('listRunAllowances', () => {
    it('should delegate to allowancesService.listForRun', async () => {
      mockAllowancesService.listForRun.mockResolvedValue({ data: [] });
      const out = await controller.listRunAllowances(tenantContext, RUN_ID);
      expect(mockAllowancesService.listForRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(out).toEqual({ data: [] });
    });
  });

  describe('listRunAdjustments', () => {
    it('should delegate to adjustmentsService.listForRun', async () => {
      mockAdjustmentsService.listForRun.mockResolvedValue({ data: [] });
      const out = await controller.listRunAdjustments(tenantContext, RUN_ID);
      expect(mockAdjustmentsService.listForRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(out).toEqual({ data: [] });
    });
  });

  describe('listRunAnomalies', () => {
    it('should delegate to anomalyService.scanForAnomalies', async () => {
      mockAnomalyService.scanForAnomalies.mockResolvedValue({
        run_id: RUN_ID,
        anomaly_count: 0,
        anomalies: [],
      });
      const out = await controller.listRunAnomalies(tenantContext, RUN_ID);
      expect(mockAnomalyService.scanForAnomalies).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(out.anomaly_count).toBe(0);
    });
  });

  describe('getRunComparison', () => {
    it('should delegate to reportsService.getRunComparison', async () => {
      mockReportsService.getRunComparison.mockResolvedValue({
        this_run: { id: RUN_ID },
        prior_run: null,
        deltas: null,
      });
      await controller.getRunComparison(tenantContext, RUN_ID);
      expect(mockReportsService.getRunComparison).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
    });
  });

  describe('autoPopulateClasses (alias)', () => {
    it('should route to triggerSessionGeneration', async () => {
      mockPayrollRunsService.triggerSessionGeneration.mockResolvedValue({ status: 'queued' });
      await controller.autoPopulateClasses(tenantContext, RUN_ID);
      expect(mockPayrollRunsService.triggerSessionGeneration).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
      );
    });
  });

  describe('sendPayslips (alias)', () => {
    it('should route to triggerMassExport', async () => {
      mockPayslipsService.triggerMassExport.mockResolvedValue({ status: 'queued' });
      await controller.sendPayslips(tenantContext, userPayload, RUN_ID, { locale: 'en' });
      expect(mockPayslipsService.triggerMassExport).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        'en',
        USER_ID,
      );
    });
  });

  describe('finalise — isSchoolOwner resolution', () => {
    it('should call permissionCache.isOwner with the actor membership_id', async () => {
      mockPermissionCache.isOwner.mockResolvedValue(true);
      mockPayrollRunsService.finalise.mockResolvedValue({ status: 'finalised' });

      await controller.finalise(tenantContext, userPayload, RUN_ID, {
        expected_updated_at: '2026-04-26T00:00:00Z',
      });

      expect(mockPermissionCache.isOwner).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockPayrollRunsService.finalise).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: '2026-04-26T00:00:00Z' },
        true,
      );
    });

    it('should return false isSchoolOwner when user has no membership', async () => {
      mockPayrollRunsService.finalise.mockResolvedValue({ status: 'pending_approval' });

      const userNoMembership = { ...userPayload, membership_id: null };
      await controller.finalise(tenantContext, userNoMembership, RUN_ID, {
        expected_updated_at: '2026-04-26T00:00:00Z',
      });

      expect(mockPermissionCache.isOwner).not.toHaveBeenCalled();
      expect(mockPayrollRunsService.finalise).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: '2026-04-26T00:00:00Z' },
        false,
      );
    });
  });
});
