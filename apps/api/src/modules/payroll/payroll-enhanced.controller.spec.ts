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
const userPayload = {
  sub: USER_ID,
  membership_id: 'mem-1',
  email: 'test@test.com',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 9999999999,
};

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
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
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

      expect(mockStaffAttendanceService.markAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(record);
    });
  });

  describe('bulkMarkAttendance', () => {
    it('should delegate to staffAttendanceService.bulkMarkAttendance', async () => {
      const dto = {
        date: '2026-03-15',
        records: [{ staff_profile_id: STAFF_ID, date: '2026-03-15', status: 'present' as const }],
      };
      const batchResult = { created: 1, updated: 0 };
      mockStaffAttendanceService.bulkMarkAttendance.mockResolvedValue(batchResult);

      const result = await controller.bulkMarkAttendance(tenantContext, userPayload, dto);

      expect(mockStaffAttendanceService.bulkMarkAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
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

      expect(mockClassDeliveryService.autoPopulateFromSchedule).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(result_data);
    });
  });

  describe('confirmDelivery', () => {
    it('should delegate to classDeliveryService.confirmDelivery', async () => {
      const dto = { status: 'delivered' as const };
      const confirmed = { id: RECORD_ID, status: 'delivered' };
      mockClassDeliveryService.confirmDelivery.mockResolvedValue(confirmed);

      const result = await controller.confirmDelivery(tenantContext, userPayload, RECORD_ID, dto);

      expect(mockClassDeliveryService.confirmDelivery).toHaveBeenCalledWith(
        TENANT_ID,
        RECORD_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(confirmed);
    });
  });

  // ─── Adjustments ─────────────────────────────────────────────────────────────

  describe('createAdjustment', () => {
    it('should delegate to adjustmentsService.createAdjustment', async () => {
      const dto = {
        payroll_entry_id: ENTRY_ID,
        amount: 500,
        adjustment_type: 'bonus' as const,
        description: 'Bonus',
      };
      const adjustment = { id: 'adj-1', ...dto };
      mockAdjustmentsService.createAdjustment.mockResolvedValue(adjustment);

      const result = await controller.createAdjustment(tenantContext, userPayload, RUN_ID, dto);

      expect(mockAdjustmentsService.createAdjustment).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        dto,
      );
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

      expect(mockOneOffsService.createOneOffItem).toHaveBeenCalledWith(
        TENANT_ID,
        ENTRY_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(item);
    });
  });

  // ─── Deductions ──────────────────────────────────────────────────────────────

  describe('createDeduction', () => {
    it('should delegate to deductionsService.createDeduction', async () => {
      const dto = {
        staff_profile_id: STAFF_ID,
        description: 'Loan',
        total_amount: 600,
        monthly_amount: 100,
        start_date: '2026-03-01',
      };
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

  // ─── Missing branch coverage ──────────────────────────────────────────────

  describe('getMonthlyAttendance', () => {
    it('should delegate to staffAttendanceService.getMonthlyAttendance', async () => {
      const monthly = [{ staff_profile_id: STAFF_ID, month: 3, year: 2026, total: 20 }];
      mockStaffAttendanceService.getMonthlyAttendance.mockResolvedValue(monthly);

      const query = { date: '2026-03-01', page: 1, pageSize: 50 };
      const result = await controller.getMonthlyAttendance(tenantContext, query);

      expect(mockStaffAttendanceService.getMonthlyAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        query,
      );
      expect(result).toEqual(monthly);
    });
  });

  describe('getAttendanceRecord', () => {
    it('should delegate to staffAttendanceService.getRecord', async () => {
      const record = { id: RECORD_ID, status: 'present' };
      mockStaffAttendanceService.getRecord.mockResolvedValue(record);

      const result = await controller.getAttendanceRecord(tenantContext, RECORD_ID);

      expect(mockStaffAttendanceService.getRecord).toHaveBeenCalledWith(TENANT_ID, RECORD_ID);
      expect(result).toEqual(record);
    });
  });

  describe('getDeliveryRecords', () => {
    it('should delegate to classDeliveryService.getDeliveryRecords', async () => {
      const records = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockClassDeliveryService.getDeliveryRecords.mockResolvedValue(records);

      const query = { month: 3, year: 2026, page: 1, pageSize: 20 };
      const result = await controller.getDeliveryRecords(tenantContext, query);

      expect(mockClassDeliveryService.getDeliveryRecords).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(records);
    });
  });

  describe('calculateClassesTaught', () => {
    it('should delegate to classDeliveryService.calculateClassesTaught', async () => {
      const calc = { classes_taught: 15 };
      mockClassDeliveryService.calculateClassesTaught.mockResolvedValue(calc);

      const dto = { staff_profile_id: STAFF_ID, date_from: '2026-03-01', date_to: '2026-03-31' };
      const result = await controller.calculateClassesTaught(tenantContext, dto);

      expect(mockClassDeliveryService.calculateClassesTaught).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(calc);
    });
  });

  describe('updateAdjustment', () => {
    it('should delegate to adjustmentsService.updateAdjustment', async () => {
      const updated = { id: 'adj-1', amount: 600 };
      mockAdjustmentsService.updateAdjustment.mockResolvedValue(updated);

      const dto = { amount: 600 };
      const result = await controller.updateAdjustment(tenantContext, 'adj-1', dto);

      expect(mockAdjustmentsService.updateAdjustment).toHaveBeenCalledWith(TENANT_ID, 'adj-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('createExportTemplate', () => {
    it('should delegate to exportsService.createTemplate', async () => {
      const template = { id: 'tpl-1', name: 'Default' };
      mockExportsService.createTemplate.mockResolvedValue(template);

      const dto = {
        name: 'Default',
        columns_json: [{ field: 'staff_name', header: 'Name' }],
        file_format: 'csv' as const,
      };
      const result = await controller.createExportTemplate(tenantContext, userPayload, dto);

      expect(mockExportsService.createTemplate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(template);
    });
  });

  describe('listExportTemplates', () => {
    it('should delegate to exportsService.listTemplates', async () => {
      const templates = { data: [] };
      mockExportsService.listTemplates.mockResolvedValue(templates);

      const result = await controller.listExportTemplates(tenantContext);

      expect(mockExportsService.listTemplates).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(templates);
    });
  });

  describe('getExportTemplate', () => {
    it('should delegate to exportsService.getTemplate', async () => {
      const template = { id: 'tpl-1' };
      mockExportsService.getTemplate.mockResolvedValue(template);

      const result = await controller.getExportTemplate(tenantContext, 'tpl-1');

      expect(mockExportsService.getTemplate).toHaveBeenCalledWith(TENANT_ID, 'tpl-1');
      expect(result).toEqual(template);
    });
  });

  describe('updateExportTemplate', () => {
    it('should delegate to exportsService.updateTemplate', async () => {
      const updated = { id: 'tpl-1', name: 'Updated' };
      mockExportsService.updateTemplate.mockResolvedValue(updated);

      const dto = { name: 'Updated' };
      const result = await controller.updateExportTemplate(tenantContext, 'tpl-1', dto);

      expect(mockExportsService.updateTemplate).toHaveBeenCalledWith(TENANT_ID, 'tpl-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('deleteExportTemplate', () => {
    it('should delegate to exportsService.deleteTemplate', async () => {
      mockExportsService.deleteTemplate.mockResolvedValue({ deleted: true });

      const result = await controller.deleteExportTemplate(tenantContext, 'tpl-1');

      expect(mockExportsService.deleteTemplate).toHaveBeenCalledWith(TENANT_ID, 'tpl-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('generateExport', () => {
    it('should delegate to exportsService.generateExport', async () => {
      const exportResult = { file_name: 'export.csv', row_count: 10 };
      mockExportsService.generateExport.mockResolvedValue(exportResult);

      const dto = { template_id: 'tpl-1' };
      const result = await controller.generateExport(tenantContext, userPayload, RUN_ID, dto);

      expect(mockExportsService.generateExport).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(exportResult);
    });
  });

  describe('getExportHistory', () => {
    it('should delegate to exportsService.getExportHistory', async () => {
      const history = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockExportsService.getExportHistory.mockResolvedValue(history);

      const result = await controller.getExportHistory(tenantContext, RUN_ID);

      expect(mockExportsService.getExportHistory).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(history);
    });
  });

  describe('emailToAccountant', () => {
    it('should delegate to exportsService.emailToAccountant', async () => {
      const emailResult = { sent_to: 'acc@school.ie' };
      mockExportsService.emailToAccountant.mockResolvedValue(emailResult);

      const dto = { template_id: 'tpl-1' };
      const result = await controller.emailToAccountant(tenantContext, userPayload, RUN_ID, dto);

      expect(mockExportsService.emailToAccountant).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(emailResult);
    });
  });

  describe('getAllowanceType', () => {
    it('should delegate to allowancesService.getAllowanceType', async () => {
      const allowance = { id: 'at-1', name: 'Transport' };
      mockAllowancesService.getAllowanceType.mockResolvedValue(allowance);

      const result = await controller.getAllowanceType(tenantContext, 'at-1');

      expect(mockAllowancesService.getAllowanceType).toHaveBeenCalledWith(TENANT_ID, 'at-1');
      expect(result).toEqual(allowance);
    });
  });

  describe('listAllowanceTypes', () => {
    it('should delegate to allowancesService.listAllowanceTypes', async () => {
      const types = [{ id: 'at-1', name: 'Transport' }];
      mockAllowancesService.listAllowanceTypes.mockResolvedValue(types);

      const result = await controller.listAllowanceTypes(tenantContext);

      expect(mockAllowancesService.listAllowanceTypes).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(types);
    });
  });

  describe('updateAllowanceType', () => {
    it('should delegate to allowancesService.updateAllowanceType', async () => {
      const updated = { id: 'at-1', name: 'Updated' };
      mockAllowancesService.updateAllowanceType.mockResolvedValue(updated);

      const dto = { name: 'Updated' };
      const result = await controller.updateAllowanceType(tenantContext, 'at-1', dto);

      expect(mockAllowancesService.updateAllowanceType).toHaveBeenCalledWith(
        TENANT_ID,
        'at-1',
        dto,
      );
      expect(result).toEqual(updated);
    });
  });

  describe('deleteAllowanceType', () => {
    it('should delegate to allowancesService.deleteAllowanceType', async () => {
      mockAllowancesService.deleteAllowanceType.mockResolvedValue({ deleted: true });

      const result = await controller.deleteAllowanceType(tenantContext, 'at-1');

      expect(mockAllowancesService.deleteAllowanceType).toHaveBeenCalledWith(TENANT_ID, 'at-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('listStaffAllowances', () => {
    it('should delegate to allowancesService.listStaffAllowances', async () => {
      const allowances = [{ id: 'sa-1' }];
      mockAllowancesService.listStaffAllowances.mockResolvedValue(allowances);

      const result = await controller.listStaffAllowances(tenantContext, STAFF_ID);

      expect(mockAllowancesService.listStaffAllowances).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
      expect(result).toEqual(allowances);
    });
  });

  describe('createStaffAllowance', () => {
    it('should delegate to allowancesService.createStaffAllowance', async () => {
      const created = { id: 'sa-1' };
      mockAllowancesService.createStaffAllowance.mockResolvedValue(created);

      const dto = {
        staff_profile_id: STAFF_ID,
        allowance_type_id: 'at-1',
        amount: 100,
        effective_from: '2026-01-01',
      };
      const result = await controller.createStaffAllowance(tenantContext, dto);

      expect(mockAllowancesService.createStaffAllowance).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(created);
    });
  });

  describe('updateStaffAllowance', () => {
    it('should delegate to allowancesService.updateStaffAllowance', async () => {
      const updated = { id: 'sa-1', amount: 200 };
      mockAllowancesService.updateStaffAllowance.mockResolvedValue(updated);

      const dto = { amount: 200 };
      const result = await controller.updateStaffAllowance(tenantContext, 'sa-1', dto);

      expect(mockAllowancesService.updateStaffAllowance).toHaveBeenCalledWith(
        TENANT_ID,
        'sa-1',
        dto,
      );
      expect(result).toEqual(updated);
    });
  });

  describe('deleteStaffAllowance', () => {
    it('should delegate to allowancesService.deleteStaffAllowance', async () => {
      mockAllowancesService.deleteStaffAllowance.mockResolvedValue({ deleted: true });

      const result = await controller.deleteStaffAllowance(tenantContext, 'sa-1');

      expect(mockAllowancesService.deleteStaffAllowance).toHaveBeenCalledWith(TENANT_ID, 'sa-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('listOneOffItems', () => {
    it('should delegate to oneOffsService.listOneOffItems', async () => {
      const items = [{ id: 'oo-1' }];
      mockOneOffsService.listOneOffItems.mockResolvedValue(items);

      const result = await controller.listOneOffItems(tenantContext, ENTRY_ID);

      expect(mockOneOffsService.listOneOffItems).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID);
      expect(result).toEqual(items);
    });
  });

  describe('updateOneOffItem', () => {
    it('should delegate to oneOffsService.updateOneOffItem', async () => {
      const updated = { id: 'oo-1', amount: 400 };
      mockOneOffsService.updateOneOffItem.mockResolvedValue(updated);

      const dto = { amount: 400 };
      const result = await controller.updateOneOffItem(tenantContext, 'oo-1', dto);

      expect(mockOneOffsService.updateOneOffItem).toHaveBeenCalledWith(TENANT_ID, 'oo-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('deleteOneOffItem', () => {
    it('should delegate to oneOffsService.deleteOneOffItem', async () => {
      mockOneOffsService.deleteOneOffItem.mockResolvedValue({ deleted: true });

      const result = await controller.deleteOneOffItem(tenantContext, 'oo-1');

      expect(mockOneOffsService.deleteOneOffItem).toHaveBeenCalledWith(TENANT_ID, 'oo-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('listDeductions', () => {
    it('should delegate to deductionsService.listDeductions', async () => {
      const deductions = [{ id: 'ded-1' }];
      mockDeductionsService.listDeductions.mockResolvedValue(deductions);

      const result = await controller.listDeductions(tenantContext, STAFF_ID);

      expect(mockDeductionsService.listDeductions).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
      expect(result).toEqual(deductions);
    });
  });

  describe('getDeduction', () => {
    it('should delegate to deductionsService.getDeduction', async () => {
      const deduction = { id: 'ded-1' };
      mockDeductionsService.getDeduction.mockResolvedValue(deduction);

      const result = await controller.getDeduction(tenantContext, 'ded-1');

      expect(mockDeductionsService.getDeduction).toHaveBeenCalledWith(TENANT_ID, 'ded-1');
      expect(result).toEqual(deduction);
    });
  });

  describe('updateDeduction', () => {
    it('should delegate to deductionsService.updateDeduction', async () => {
      const updated = { id: 'ded-1', monthly_amount: 200 };
      mockDeductionsService.updateDeduction.mockResolvedValue(updated);

      const dto = { monthly_amount: 200 };
      const result = await controller.updateDeduction(tenantContext, 'ded-1', dto);

      expect(mockDeductionsService.updateDeduction).toHaveBeenCalledWith(TENANT_ID, 'ded-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('deleteDeduction', () => {
    it('should delegate to deductionsService.deleteDeduction', async () => {
      mockDeductionsService.deleteDeduction.mockResolvedValue({ deleted: true });

      const result = await controller.deleteDeduction(tenantContext, 'ded-1');

      expect(mockDeductionsService.deleteDeduction).toHaveBeenCalledWith(TENANT_ID, 'ded-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('getMonthOverMonth', () => {
    it('should delegate to analyticsService.getMonthOverMonth', async () => {
      const report = { variance: 5 };
      mockAnalyticsService.getMonthOverMonth.mockResolvedValue(report);

      const result = await controller.getMonthOverMonth(tenantContext, RUN_ID);

      expect(mockAnalyticsService.getMonthOverMonth).toHaveBeenCalledWith(TENANT_ID, RUN_ID);
      expect(result).toEqual(report);
    });
  });

  describe('getStaffCostForecast', () => {
    it('should delegate to analyticsService.getStaffCostForecast', async () => {
      const forecast = { months: [] };
      mockAnalyticsService.getStaffCostForecast.mockResolvedValue(forecast);

      const result = await controller.getStaffCostForecast(tenantContext, { months: 3 });

      expect(mockAnalyticsService.getStaffCostForecast).toHaveBeenCalledWith(TENANT_ID, 3);
      expect(result).toEqual(forecast);
    });
  });

  describe('checkPreparationDeadline', () => {
    it('should delegate to calendarService.checkPreparationDeadline', async () => {
      const deadline = { is_past_deadline: false, days_overdue: 0 };
      mockCalendarService.checkPreparationDeadline.mockResolvedValue(deadline);

      const result = await controller.checkPreparationDeadline(tenantContext);

      expect(mockCalendarService.checkPreparationDeadline).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(deadline);
    });
  });
});
