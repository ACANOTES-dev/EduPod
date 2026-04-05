import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BulkOperationsService } from './bulk-operations.service';
import { CreditNotesService } from './credit-notes.service';
import { FinanceAuditService } from './finance-audit.service';
import { FinanceEnhancedController } from './finance-enhanced.controller';
import { FinancialReportsService } from './financial-reports.service';
import { LateFeesService } from './late-fees.service';
import { PaymentPlansService } from './payment-plans.service';
import { PaymentRemindersService } from './payment-reminders.service';
import { RecurringInvoicesService } from './recurring-invoices.service';
import { ScholarshipsService } from './scholarships.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockCreditNotes = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  applyToInvoice: jest.fn(),
};

const mockLateFees = {
  findAllConfigs: jest.fn(),
  findOneConfig: jest.fn(),
  createConfig: jest.fn(),
  updateConfig: jest.fn(),
  applyLateFee: jest.fn(),
};

const mockScholarships = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  revoke: jest.fn(),
};

const mockReminders = {
  sendDueSoonReminders: jest.fn(),
  sendOverdueReminders: jest.fn(),
  sendFinalNotices: jest.fn(),
};

const mockRecurring = {
  findAllConfigs: jest.fn(),
  findOneConfig: jest.fn(),
  createConfig: jest.fn(),
  updateConfig: jest.fn(),
  generateDueInvoices: jest.fn(),
};

const mockReports = {
  agingReport: jest.fn(),
  revenueByPeriod: jest.fn(),
  collectionByYearGroup: jest.fn(),
  paymentMethodBreakdown: jest.fn(),
  feeStructurePerformance: jest.fn(),
};

const mockPaymentPlans = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  approvePlan: jest.fn(),
  rejectPlan: jest.fn(),
  counterOffer: jest.fn(),
};

const mockAudit = {
  getAuditTrail: jest.fn(),
};

const mockBulkOps = {
  bulkIssue: jest.fn(),
  bulkVoid: jest.fn(),
  bulkRemind: jest.fn(),
  bulkExport: jest.fn(),
};

describe('FinanceEnhancedController', () => {
  let controller: FinanceEnhancedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanceEnhancedController],
      providers: [
        { provide: CreditNotesService, useValue: mockCreditNotes },
        { provide: LateFeesService, useValue: mockLateFees },
        { provide: ScholarshipsService, useValue: mockScholarships },
        { provide: PaymentRemindersService, useValue: mockReminders },
        { provide: RecurringInvoicesService, useValue: mockRecurring },
        { provide: FinancialReportsService, useValue: mockReports },
        { provide: PaymentPlansService, useValue: mockPaymentPlans },
        { provide: FinanceAuditService, useValue: mockAudit },
        { provide: BulkOperationsService, useValue: mockBulkOps },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<FinanceEnhancedController>(FinanceEnhancedController);
    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Credit Notes ─────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getCreditNotes', () => {
    it('should call creditNotesService.findAll with tenant and query', async () => {
      mockCreditNotes.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      await controller.getCreditNotes(TENANT, { page: 1, pageSize: 20 });
      expect(mockCreditNotes.findAll).toHaveBeenCalledWith(TENANT.tenant_id, {
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('FinanceEnhancedController — getCreditNote', () => {
    it('should call creditNotesService.findOne with tenant and id', async () => {
      mockCreditNotes.findOne.mockResolvedValue({ id: 'cn-1' });
      await controller.getCreditNote(TENANT, 'cn-1');
      expect(mockCreditNotes.findOne).toHaveBeenCalledWith(TENANT.tenant_id, 'cn-1');
    });
  });

  describe('FinanceEnhancedController — createCreditNote', () => {
    it('should call creditNotesService.create with tenant, user.sub and dto', async () => {
      const dto = { invoice_id: 'inv-1', amount: 100 } as never;
      mockCreditNotes.create.mockResolvedValue({ id: 'cn-1' });
      await controller.createCreditNote(TENANT, USER, dto);
      expect(mockCreditNotes.create).toHaveBeenCalledWith(TENANT.tenant_id, USER.sub, dto);
    });
  });

  describe('FinanceEnhancedController — applyCreditNote', () => {
    it('should call creditNotesService.applyToInvoice', async () => {
      const dto = { credit_note_id: 'cn-1', invoice_id: 'inv-1', amount: 50 } as never;
      mockCreditNotes.applyToInvoice.mockResolvedValue({ success: true });
      await controller.applyCreditNote(TENANT, USER, dto);
      expect(mockCreditNotes.applyToInvoice).toHaveBeenCalledWith(TENANT.tenant_id, USER.sub, dto);
    });
  });

  // ─── Late Fees ────────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getLateFeeConfigs', () => {
    it('should call lateFeesService.findAllConfigs with tenant and query', async () => {
      mockLateFees.findAllConfigs.mockResolvedValue({ data: [], meta: { total: 0 } });
      const query = { page: 1, pageSize: 20 } as never;
      await controller.getLateFeeConfigs(TENANT, query);
      expect(mockLateFees.findAllConfigs).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  describe('FinanceEnhancedController — getLateFeeConfig', () => {
    it('should call lateFeesService.findOneConfig with tenant and id', async () => {
      mockLateFees.findOneConfig.mockResolvedValue({ id: 'lf-1' });
      await controller.getLateFeeConfig(TENANT, 'lf-1');
      expect(mockLateFees.findOneConfig).toHaveBeenCalledWith(TENANT.tenant_id, 'lf-1');
    });
  });

  describe('FinanceEnhancedController — createLateFeeConfig', () => {
    it('should call lateFeesService.createConfig with tenant and dto', async () => {
      const dto = { name: 'Standard Late Fee' } as never;
      mockLateFees.createConfig.mockResolvedValue({ id: 'lf-1' });
      await controller.createLateFeeConfig(TENANT, dto);
      expect(mockLateFees.createConfig).toHaveBeenCalledWith(TENANT.tenant_id, dto);
    });
  });

  describe('FinanceEnhancedController — updateLateFeeConfig', () => {
    it('should call lateFeesService.updateConfig with tenant, id and dto', async () => {
      const dto = { name: 'Updated Late Fee' } as never;
      mockLateFees.updateConfig.mockResolvedValue({ id: 'lf-1' });
      await controller.updateLateFeeConfig(TENANT, 'lf-1', dto);
      expect(mockLateFees.updateConfig).toHaveBeenCalledWith(TENANT.tenant_id, 'lf-1', dto);
    });
  });

  describe('FinanceEnhancedController — applyLateFee', () => {
    it('should call lateFeesService.applyLateFee with tenant, invoice id and config id', async () => {
      mockLateFees.applyLateFee.mockResolvedValue({ success: true });
      await controller.applyLateFee(TENANT, 'inv-1', 'config-1');
      expect(mockLateFees.applyLateFee).toHaveBeenCalledWith(TENANT.tenant_id, 'inv-1', 'config-1');
    });

    it('should call lateFeesService.applyLateFee without config_id when not provided', async () => {
      mockLateFees.applyLateFee.mockResolvedValue({ success: true });
      await controller.applyLateFee(TENANT, 'inv-1', undefined);
      expect(mockLateFees.applyLateFee).toHaveBeenCalledWith(TENANT.tenant_id, 'inv-1', undefined);
    });
  });

  // ─── Scholarships ─────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getScholarships', () => {
    it('should call scholarshipsService.findAll with tenant and query', async () => {
      mockScholarships.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const query = { page: 1, pageSize: 20 } as never;
      await controller.getScholarships(TENANT, query);
      expect(mockScholarships.findAll).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  describe('FinanceEnhancedController — getScholarship', () => {
    it('should call scholarshipsService.findOne with tenant and id', async () => {
      mockScholarships.findOne.mockResolvedValue({ id: 'sch-1' });
      await controller.getScholarship(TENANT, 'sch-1');
      expect(mockScholarships.findOne).toHaveBeenCalledWith(TENANT.tenant_id, 'sch-1');
    });
  });

  describe('FinanceEnhancedController — createScholarship', () => {
    it('should call scholarshipsService.create with tenant, user.sub and dto', async () => {
      const dto = { name: 'Merit' } as never;
      mockScholarships.create.mockResolvedValue({ id: 'sch-1' });
      await controller.createScholarship(TENANT, USER, dto);
      expect(mockScholarships.create).toHaveBeenCalledWith(TENANT.tenant_id, USER.sub, dto);
    });
  });

  describe('FinanceEnhancedController — revokeScholarship', () => {
    it('should call scholarshipsService.revoke with tenant, id and dto', async () => {
      const dto = { reason: 'Academic performance' } as never;
      mockScholarships.revoke.mockResolvedValue({ id: 'sch-1', status: 'revoked' });
      await controller.revokeScholarship(TENANT, 'sch-1', dto);
      expect(mockScholarships.revoke).toHaveBeenCalledWith(TENANT.tenant_id, 'sch-1', dto);
    });
  });

  // ─── Reminders ────────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — sendDueSoonReminders', () => {
    it('should call paymentRemindersService.sendDueSoonReminders and return count', async () => {
      mockReminders.sendDueSoonReminders.mockResolvedValue(5);
      const result = await controller.sendDueSoonReminders(TENANT);
      expect(mockReminders.sendDueSoonReminders).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual({ sent: 5 });
    });
  });

  describe('FinanceEnhancedController — sendOverdueReminders', () => {
    it('should call paymentRemindersService.sendOverdueReminders and return count', async () => {
      mockReminders.sendOverdueReminders.mockResolvedValue(3);
      const result = await controller.sendOverdueReminders(TENANT);
      expect(mockReminders.sendOverdueReminders).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual({ sent: 3 });
    });
  });

  describe('FinanceEnhancedController — sendFinalNotices', () => {
    it('should call paymentRemindersService.sendFinalNotices and return count', async () => {
      mockReminders.sendFinalNotices.mockResolvedValue(1);
      const result = await controller.sendFinalNotices(TENANT);
      expect(mockReminders.sendFinalNotices).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual({ sent: 1 });
    });
  });

  // ─── Recurring Invoices ───────────────────────────────────────────────────

  describe('FinanceEnhancedController — getRecurringConfigs', () => {
    it('should call recurringInvoicesService.findAllConfigs', async () => {
      mockRecurring.findAllConfigs.mockResolvedValue({ data: [], meta: { total: 0 } });
      const query = { page: 1, pageSize: 20 } as never;
      await controller.getRecurringConfigs(TENANT, query);
      expect(mockRecurring.findAllConfigs).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  describe('FinanceEnhancedController — getRecurringConfig', () => {
    it('should call recurringInvoicesService.findOneConfig', async () => {
      mockRecurring.findOneConfig.mockResolvedValue({ id: 'rc-1' });
      await controller.getRecurringConfig(TENANT, 'rc-1');
      expect(mockRecurring.findOneConfig).toHaveBeenCalledWith(TENANT.tenant_id, 'rc-1');
    });
  });

  describe('FinanceEnhancedController — createRecurringConfig', () => {
    it('should call recurringInvoicesService.createConfig', async () => {
      const dto = { name: 'Monthly Tuition' } as never;
      mockRecurring.createConfig.mockResolvedValue({ id: 'rc-1' });
      await controller.createRecurringConfig(TENANT, dto);
      expect(mockRecurring.createConfig).toHaveBeenCalledWith(TENANT.tenant_id, dto);
    });
  });

  describe('FinanceEnhancedController — updateRecurringConfig', () => {
    it('should call recurringInvoicesService.updateConfig', async () => {
      const dto = { name: 'Updated Config' } as never;
      mockRecurring.updateConfig.mockResolvedValue({ id: 'rc-1' });
      await controller.updateRecurringConfig(TENANT, 'rc-1', dto);
      expect(mockRecurring.updateConfig).toHaveBeenCalledWith(TENANT.tenant_id, 'rc-1', dto);
    });
  });

  describe('FinanceEnhancedController — generateDueInvoices', () => {
    it('should call recurringInvoicesService.generateDueInvoices', async () => {
      mockRecurring.generateDueInvoices.mockResolvedValue(3);
      const result = await controller.generateDueInvoices(TENANT);
      expect(mockRecurring.generateDueInvoices).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual({ generated: 3 });
    });
  });

  // ─── Reports ──────────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getAgingReport', () => {
    it('should call financialReportsService.agingReport with tenant and query', async () => {
      const report = { current: { count: 0, total: 0 } };
      mockReports.agingReport.mockResolvedValue(report);
      const result = await controller.getAgingReport(TENANT, {});
      expect(mockReports.agingReport).toHaveBeenCalledWith(TENANT.tenant_id, {});
      expect(result).toEqual(report);
    });

    it('should pass date filters to agingReport', async () => {
      const report = { grand_total: 0 };
      mockReports.agingReport.mockResolvedValue(report);
      const query = { date_from: '2026-01-01', date_to: '2026-12-31' };
      await controller.getAgingReport(TENANT, query);
      expect(mockReports.agingReport).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  describe('FinanceEnhancedController — getRevenueByPeriod', () => {
    it('should call financialReportsService.revenueByPeriod', async () => {
      mockReports.revenueByPeriod.mockResolvedValue([]);
      const result = await controller.getRevenueByPeriod(TENANT, {});
      expect(mockReports.revenueByPeriod).toHaveBeenCalledWith(TENANT.tenant_id, {});
      expect(result).toEqual([]);
    });
  });

  describe('FinanceEnhancedController — getCollectionByYearGroup', () => {
    it('should call financialReportsService.collectionByYearGroup', async () => {
      mockReports.collectionByYearGroup.mockResolvedValue([]);
      const result = await controller.getCollectionByYearGroup(TENANT, {});
      expect(mockReports.collectionByYearGroup).toHaveBeenCalledWith(TENANT.tenant_id, {});
      expect(result).toEqual([]);
    });
  });

  describe('FinanceEnhancedController — getPaymentMethodBreakdown', () => {
    it('should call financialReportsService.paymentMethodBreakdown', async () => {
      mockReports.paymentMethodBreakdown.mockResolvedValue([]);
      const result = await controller.getPaymentMethodBreakdown(TENANT, {});
      expect(mockReports.paymentMethodBreakdown).toHaveBeenCalledWith(TENANT.tenant_id, {});
      expect(result).toEqual([]);
    });
  });

  describe('FinanceEnhancedController — getFeeStructurePerformance', () => {
    it('should call financialReportsService.feeStructurePerformance', async () => {
      mockReports.feeStructurePerformance.mockResolvedValue([]);
      const result = await controller.getFeeStructurePerformance(TENANT, {});
      expect(mockReports.feeStructurePerformance).toHaveBeenCalledWith(TENANT.tenant_id, {});
      expect(result).toEqual([]);
    });
  });

  // ─── Payment Plans ────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getPaymentPlans', () => {
    it('should call paymentPlansService.findAll', async () => {
      mockPaymentPlans.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const query = { page: 1, pageSize: 20 } as never;
      await controller.getPaymentPlans(TENANT, query);
      expect(mockPaymentPlans.findAll).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  describe('FinanceEnhancedController — getPaymentPlan', () => {
    it('should call paymentPlansService.findOne', async () => {
      mockPaymentPlans.findOne.mockResolvedValue({ id: 'pp-1' });
      await controller.getPaymentPlan(TENANT, 'pp-1');
      expect(mockPaymentPlans.findOne).toHaveBeenCalledWith(TENANT.tenant_id, 'pp-1');
    });
  });

  describe('FinanceEnhancedController — approvePlan', () => {
    it('should call paymentPlansService.approvePlan', async () => {
      const dto = { notes: 'Approved' } as never;
      mockPaymentPlans.approvePlan.mockResolvedValue({ id: 'pp-1', status: 'approved' });
      await controller.approvePlan(TENANT, USER, 'pp-1', dto);
      expect(mockPaymentPlans.approvePlan).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        'pp-1',
        dto,
      );
    });
  });

  describe('FinanceEnhancedController — rejectPlan', () => {
    it('should call paymentPlansService.rejectPlan', async () => {
      const dto = { reason: 'Denied' } as never;
      mockPaymentPlans.rejectPlan.mockResolvedValue({ id: 'pp-1', status: 'rejected' });
      await controller.rejectPlan(TENANT, USER, 'pp-1', dto);
      expect(mockPaymentPlans.rejectPlan).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        'pp-1',
        dto,
      );
    });
  });

  describe('FinanceEnhancedController — counterOffer', () => {
    it('should call paymentPlansService.counterOffer', async () => {
      const dto = { proposed_installments: 6 } as never;
      mockPaymentPlans.counterOffer.mockResolvedValue({ id: 'pp-1', status: 'counter_offered' });
      await controller.counterOffer(TENANT, USER, 'pp-1', dto);
      expect(mockPaymentPlans.counterOffer).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        'pp-1',
        dto,
      );
    });
  });

  // ─── Audit Trail ──────────────────────────────────────────────────────────

  describe('FinanceEnhancedController — getAuditTrail', () => {
    it('should call financeAuditService.getAuditTrail', async () => {
      const query = { page: 1, pageSize: 20 } as never;
      mockAudit.getAuditTrail.mockResolvedValue({ data: [], meta: { total: 0 } });
      await controller.getAuditTrail(TENANT, query);
      expect(mockAudit.getAuditTrail).toHaveBeenCalledWith(TENANT.tenant_id, query);
    });
  });

  // ─── Bulk Operations ─────────────────────────────────────────────────────

  describe('FinanceEnhancedController — bulkIssue', () => {
    it('should call bulkOperationsService.bulkIssue', async () => {
      const dto = { invoice_ids: ['inv-1', 'inv-2'] } as never;
      mockBulkOps.bulkIssue.mockResolvedValue({ success: 2, failed: 0 });
      await controller.bulkIssue(TENANT, USER, dto);
      expect(mockBulkOps.bulkIssue).toHaveBeenCalledWith(TENANT.tenant_id, USER.sub, dto);
    });
  });

  describe('FinanceEnhancedController — bulkVoid', () => {
    it('should call bulkOperationsService.bulkVoid', async () => {
      const dto = { invoice_ids: ['inv-1'] } as never;
      mockBulkOps.bulkVoid.mockResolvedValue({ success: 1, failed: 0 });
      await controller.bulkVoid(TENANT, dto);
      expect(mockBulkOps.bulkVoid).toHaveBeenCalledWith(TENANT.tenant_id, dto);
    });
  });

  describe('FinanceEnhancedController — bulkRemind', () => {
    it('should call bulkOperationsService.bulkRemind', async () => {
      const dto = { invoice_ids: ['inv-1'] } as never;
      mockBulkOps.bulkRemind.mockResolvedValue({ success: 1, failed: 0 });
      await controller.bulkRemind(TENANT, dto);
      expect(mockBulkOps.bulkRemind).toHaveBeenCalledWith(TENANT.tenant_id, dto);
    });
  });

  describe('FinanceEnhancedController — bulkExport', () => {
    it('should call bulkOperationsService.bulkExport', async () => {
      const dto = { format: 'csv' } as never;
      mockBulkOps.bulkExport.mockResolvedValue({ url: 'https://export.url' });
      await controller.bulkExport(TENANT, dto);
      expect(mockBulkOps.bulkExport).toHaveBeenCalledWith(TENANT.tenant_id, dto);
    });
  });
});
