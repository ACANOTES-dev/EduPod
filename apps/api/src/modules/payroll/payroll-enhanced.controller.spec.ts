import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ClassDeliveryService } from './class-delivery.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollAnalyticsService } from './payroll-analytics.service';
import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollCalendarService } from './payroll-calendar.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollEnhancedController } from './payroll-enhanced.controller';
import { PayrollExportsService } from './payroll-exports.service';
import { PayrollOneOffsService } from './payroll-one-offs.service';
import { StaffAttendanceService } from './staff-attendance.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RUN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ENTRY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const RECORD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const userPayload = { sub: USER_ID, membership_id: 'mem-1', email: 'test@test.com', tenant_id: TENANT_ID, type: 'access' as const, iat: 0, exp: 9999999999 };

const mockStaffAttendanceService = {
  markAttendance: jest.fn(),
  bulkMarkAttendance: jest.fn(),
  getDailyAttendance: jest.fn(),
  getMonthlyAttendance: jest.fn(),
  getRecord: jest.fn(),
  deleteRecord: jest.fn(),
  calculateDaysWorked: jest.fn(),
};

const mockClassDeliveryService = {
  autoPopulateFromSchedule: jest.fn(),
  getDeliveryRecords: jest.fn(),
  confirmDelivery: jest.fn(),
  calculateClassesTaught: jest.fn(),
};

const mockAdjustmentsService = {
  createAdjustment: jest.fn(),
  listAdjustments: jest.fn(),
  updateAdjustment: jest.fn(),
  deleteAdjustment: jest.fn(),
};

const mockExportsService = {
  createTemplate: jest.fn(),
  listTemplates: jest.fn(),
  getTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  generateExport: jest.fn(),
  getExportHistory: jest.fn(),
  emailToAccountant: jest.fn(),
};

const mockAllowancesService = {
  createAllowanceType: jest.fn(),
  listAllowanceTypes: jest.fn(),
  getAllowanceType: jest.fn(),
  updateAllowanceType: jest.fn(),
  deleteAllowanceType: jest.fn(),
  createStaffAllowance: jest.fn(),
  listStaffAllowances: jest.fn(),
  updateStaffAllowance: jest.fn(),
  deleteStaffAllowance: jest.fn(),
};

const mockOneOffsService = {
  createOneOffItem: jest.fn(),
  listOneOffItems: jest.fn(),
  updateOneOffItem: jest.fn(),
  deleteOneOffItem: jest.fn(),
};

const mockDeductionsService = {
  createDeduction: jest.fn(),
  listDeductions: jest.fn(),
  getDeduction: jest.fn(),
  updateDeduction: jest.fn(),
  deleteDeduction: jest.fn(),
};

const mockAnalyticsService = {
  getCostDashboard: jest.fn(),
  getVarianceReport: jest.fn(),
  getMonthOverMonth: jest.fn(),
  getStaffCostForecast: jest.fn(),
};

const mockAnomalyService = {
  scanForAnomalies: jest.fn(),
};

const mockCalendarService = {
  getPayrollCalendar: jest.fn(),
  getNextPayDate: jest.fn(),
  checkPreparationDeadline: jest.fn(),
};

describe('PayrollEnhancedController', () => {
  let controller: PayrollEnhancedController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayrollEnhancedController],
      providers: [
        { provide: StaffAttendanceService, useValue: mockStaffAttendanceService },
        { provide: ClassDeliveryService, useValue: mockClassDeliveryService },
        { provide: PayrollAdjustmentsService, useValue: mockAdjustmentsService },
        { provide: PayrollExportsService, useValue: mockExportsService },
        { provide: PayrollAllowancesService, useValue: mockAllowancesService },
        { provide: PayrollOneOffsService, useValue: mockOneOffsService },
        { provide: PayrollDeductionsService, useValue: mockDeductionsService },
        { provide: PayrollAnalyticsService, useValue: mockAnalyticsService },
        { provide: PayrollAnomalyService, useValue: mockAnomalyService },
        { provide: PayrollCalendarService, useValue: mockCalendarService },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollEnhancedController>(PayrollEnhancedController);
  });

  // ─── Staff Attendance ────────────────────────────────────────────────────────

  describe('markAttendance', () => {
    it('should delegate to staffAttendanceService.markAttendance', async () => {
      const dto = { staff_profile_id: STAFF_ID, date: '2026-03-15', status: 'present' as const };
      const record = { id: RECORD_ID, ...dto };
      mockStaffAttendanceService.markAttendance.mockResolvedValue(record);

      const result = await controller.markAttendance(tenantContext, userPayload, dto);

      expect(mockStaffAttendanceService.markAttendance).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(record);
    });
  });

  describe('bulkMarkAttendance', () => {
    it('should delegate to staffAttendanceService.bulkMarkAttendance', async () => {
      const dto = { date: '2026-03-15', records: [{ staff_profile_id: STAFF_ID, date: '2026-03-15', status: 'present' as const }] };
      const batchResult = { created: 1, updated: 0 };
      mockStaffAttendanceService.bulkMarkAttendance.mockResolvedValue(batchResult);

      const result = await controller.bulkMarkAttendance(tenantContext, userPayload, dto);

      expect(mockStaffAttendanceService.bulkMarkAttendance).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(batchResult);
    });
  });

  describe('getDailyAttendance', () => {
    it('should delegate to staffAttendanceService.getDailyAttendance', async () => {
      const query = { date: '2026-03-15', page: 1, pageSize: 50 };
      const attendance = [{ staff_profile_id: STAFF_ID, status: 'present' }];
      mockStaffAttendanceService.getDailyAttendance.mockResolvedValue(attendance);

      const result = await controller.getDailyAttendance(tenantContext, query);

      expect(mockStaffAttendanceService.getDailyAttendance).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(attendance);
    });
  });

  describe('deleteAttendanceRecord', () => {
    it('should delegate to staffAttendanceService.deleteRecord', async () => {
      mockStaffAttendanceService.deleteRecord.mockResolvedValue({ deleted: true });

      const result = await controller.deleteAttendanceRecord(tenantContext, RECORD_ID);

      expect(mockStaffAttendanceService.deleteRecord).toHaveBeenCalledWith(TENANT_ID, RECORD_ID);
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('calculateDaysWorked', () => {
    it('should delegate to staffAttendanceService.calculateDaysWorked', async () => {
      const dto = { staff_profile_id: STAFF_ID, date_from: '2026-03-01', date_to: '2026-03-31' };
      const calc = { days_worked: 20 };
      mockStaffAttendanceService.calculateDaysWorked.mockResolvedValue(calc);

      const result = await controller.calculateDaysWorked(tenantContext, dto);

      expect(mockStaffAttendanceService.calculateDaysWorked).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(calc);
    });
  });

  // ─── Class Delivery ──────────────────────────────────────────────────────────

  describe('autoPopulateDelivery', () => {
    it('should delegate to classDeliveryService.autoPopulateFromSchedule', async () => {
      const dto = { month: 3, year: 2026 };
      const result_data = { populated: 5 };
      mockClassDeliveryService.autoPopulateFromSchedule.mockResolvedValue(result_data);

      const result = await controller.autoPopulateDelivery(tenantContext, userPayload, dto);

      expect(mockClassDeliveryService.autoPopulateFromSchedule).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(result_data);
    });
  });

  describe('confirmDelivery', () => {
    it('should delegate to classDeliveryService.confirmDelivery', async () => {
      const dto = { status: 'delivered' as const };
      const confirmed = { id: RECORD_ID, status: 'delivered' };
      mockClassDeliveryService.confirmDelivery.mockResolvedValue(confirmed);

      const result = await controller.confirmDelivery(tenantContext, userPayload, RECORD_ID, dto);

      expect(mockClassDeliveryService.confirmDelivery).toHaveBeenCalledWith(TENANT_ID, RECORD_ID, USER_ID, dto);
      expect(result).toEqual(confirmed);
    });
  });

  // ─── Adjustments ─────────────────────────────────────────────────────────────

  describe('createAdjustment', () => {
    it('should delegate to adjustmentsService.createAdjustment', async () => {
      const dto = { payroll_entry_id: ENTRY_ID, amount: 500, adjustment_type: 'bonus' as const, description: 'Bonus' };
      const adjustment = { id: 'adj-1', ...dto };
      mockAdjustmentsService.createAdjustment.mockResolvedValue(adjustment);

      const result = await controller.createAdjustment(tenantContext, userPayload, RUN_ID, dto);

      expect(mockAdjustmentsService.createAdjustment).toHaveBeenCalledWith(TENANT_ID, RUN_ID, USER_ID, dto);
      expect(result).toEqual(adjustment);
    });
  });

  describe('listAdjustments', () => {
    it('should delegate to adjustmentsService.listAdjustments', async () => {
      const adjustments = [{ id: 'adj-1', amount: 500 }];
      mockAdjustmentsService.listAdjustments.mockResolvedValue(adjustments);

      const result = await controller.listAdjustments(tenantContext, ENTRY_ID);

      expect(mockAdjustmentsService.listAdjustments).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID);
      expect(result).toEqual(adjustments);
    });
  });

  describe('deleteAdjustment', () => {
    it('should delegate to adjustmentsService.deleteAdjustment', async () => {
      mockAdjustmentsService.deleteAdjustment.mockResolvedValue({ deleted: true });

      const result = await controller.deleteAdjustment(tenantContext, 'adj-1');

      expect(mockAdjustmentsService.deleteAdjustment).toHaveBeenCalledWith(TENANT_ID, 'adj-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  // ─── Analytics ───────────────────────────────────────────────────────────────

  describe('getCostDashboard', () => {
    it('should delegate to analyticsService.getCostDashboard', async () => {
      const dashboard = { total_cost: 50000, headcount: 10 };
      mockAnalyticsService.getCostDashboard.mockResolvedValue(dashboard);

      const result = await controller.getCostDashboard(tenantContext, { months: 6 });

      expect(mockAnalyticsService.getCostDashboard).toHaveBeenCalledWith(TENANT_ID, 6);
      expect(result).toEqual(dashboard);
    });
  });

  describe('scanForAnomalies', () => {
    it('should delegate to anomalyService.scanForAnomalies', async () => {
      const anomalies = [{ type: 'salary_spike', entry_id: ENTRY_ID }];
      mockAnomalyService.scanForAnomalies.mockResolvedValue(anomalies);

      const result = await controller.scanForAnomalies(tenantContext, RUN_ID);

      expect(mockAnomalyService.scanForAnomalies).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(anomalies);
    });
  });

  // ─── Payroll Calendar ────────────────────────────────────────────────────────

  describe('getPayrollCalendar', () => {
    it('should delegate to calendarService.getPayrollCalendar', async () => {
      const calendar = { year: 2026, runs: [] };
      mockCalendarService.getPayrollCalendar.mockResolvedValue(calendar);

      const result = await controller.getPayrollCalendar(tenantContext, { year: 2026 });

      expect(mockCalendarService.getPayrollCalendar).toHaveBeenCalledWith(TENANT_ID, 2026);
      expect(result).toEqual(calendar);
    });
  });

  describe('getNextPayDate', () => {
    it('should delegate to calendarService.getNextPayDate', async () => {
      const nextPay = { next_pay_date: '2026-04-25' };
      mockCalendarService.getNextPayDate.mockResolvedValue(nextPay);

      const result = await controller.getNextPayDate(tenantContext);

      expect(mockCalendarService.getNextPayDate).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(nextPay);
    });
  });

  // ─── Allowances ───────────────────────────────────────────────────────────────

  describe('createAllowanceType', () => {
    it('should delegate to allowancesService.createAllowanceType', async () => {
      const dto = { name: 'Transport', is_recurring: true };
      const allowanceType = { id: 'at-1', ...dto };
      mockAllowancesService.createAllowanceType.mockResolvedValue(allowanceType);

      const result = await controller.createAllowanceType(tenantContext, dto);

      expect(mockAllowancesService.createAllowanceType).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(allowanceType);
    });
  });

  // ─── One-Off Items ───────────────────────────────────────────────────────────

  describe('createOneOffItem', () => {
    it('should delegate to oneOffsService.createOneOffItem', async () => {
      const dto = { description: 'Equipment', amount: 300, item_type: 'reimbursement' as const };
      const item = { id: 'oo-1', ...dto };
      mockOneOffsService.createOneOffItem.mockResolvedValue(item);

      const result = await controller.createOneOffItem(tenantContext, userPayload, ENTRY_ID, dto);

      expect(mockOneOffsService.createOneOffItem).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID, USER_ID, dto);
      expect(result).toEqual(item);
    });
  });

  // ─── Deductions ──────────────────────────────────────────────────────────────

  describe('createDeduction', () => {
    it('should delegate to deductionsService.createDeduction', async () => {
      const dto = { staff_profile_id: STAFF_ID, description: 'Loan', total_amount: 600, monthly_amount: 100, start_date: '2026-03-01' };
      const deduction = { id: 'ded-1', ...dto };
      mockDeductionsService.createDeduction.mockResolvedValue(deduction);

      const result = await controller.createDeduction(tenantContext, userPayload, dto);

      expect(mockDeductionsService.createDeduction).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(deduction);
    });
  });

  describe('getVarianceReport', () => {
    it('should delegate to analyticsService.getVarianceReport', async () => {
      const report = { variances: [] };
      mockAnalyticsService.getVarianceReport.mockResolvedValue(report);

      const result = await controller.getVarianceReport(tenantContext, RUN_ID);

      expect(mockAnalyticsService.getVarianceReport).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(report);
    });
  });
});
