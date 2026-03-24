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
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
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

  // ─── Credit Notes ────────────────────────────────────────────────────────
  it('should call creditNotesService.findAll', async () => {
    mockCreditNotes.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.getCreditNotes(TENANT, { page: 1, pageSize: 20 });
    expect(mockCreditNotes.findAll).toHaveBeenCalledWith('tenant-uuid', { page: 1, pageSize: 20 });
  });

  it('should call creditNotesService.create with tenant, user.sub and dto', async () => {
    const dto = { invoice_id: 'inv-1', amount: 100 } as never;
    mockCreditNotes.create.mockResolvedValue({ id: 'cn-1' });
    await controller.createCreditNote(TENANT, USER, dto);
    expect(mockCreditNotes.create).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  // ─── Late Fees ────────────────────────────────────────────────────────────
  it('should call lateFeesService.createConfig with tenant and dto', async () => {
    const dto = { name: 'Standard Late Fee' } as never;
    mockLateFees.createConfig.mockResolvedValue({ id: 'lf-1' });
    await controller.createLateFeeConfig(TENANT, dto);
    expect(mockLateFees.createConfig).toHaveBeenCalledWith('tenant-uuid', dto);
  });

  // ─── Scholarships ────────────────────────────────────────────────────────
  it('should call scholarshipsService.create with tenant, user.sub and dto', async () => {
    const dto = { name: 'Merit' } as never;
    mockScholarships.create.mockResolvedValue({ id: 'sch-1' });
    await controller.createScholarship(TENANT, USER, dto);
    expect(mockScholarships.create).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  // ─── Reminders ────────────────────────────────────────────────────────────
  it('should call paymentRemindersService.sendDueSoonReminders', async () => {
    mockReminders.sendDueSoonReminders.mockResolvedValue(5);
    const result = await controller.sendDueSoonReminders(TENANT);
    expect(mockReminders.sendDueSoonReminders).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual({ sent: 5 });
  });

  // ─── Reports ──────────────────────────────────────────────────────────────
  it('should call financialReportsService.agingReport with tenant and query', async () => {
    const report = { current: { count: 0, total: 0 } };
    mockReports.agingReport.mockResolvedValue(report);
    const result = await controller.getAgingReport(TENANT, {});
    expect(mockReports.agingReport).toHaveBeenCalledWith('tenant-uuid', {});
    expect(result).toEqual(report);
  });

  // ─── Payment Plans ────────────────────────────────────────────────────────
  it('should call paymentPlansService.approvePlan with tenant, user.sub, id and dto', async () => {
    const dto = { notes: 'Approved' } as never;
    mockPaymentPlans.approvePlan.mockResolvedValue({ id: 'pp-1', status: 'approved' });
    await controller.approvePlan(TENANT, USER, 'pp-1', dto);
    expect(mockPaymentPlans.approvePlan).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'pp-1', dto);
  });

  // ─── Audit Trail ──────────────────────────────────────────────────────────
  it('should call financeAuditService.getAuditTrail with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 } as never;
    mockAudit.getAuditTrail.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.getAuditTrail(TENANT, query);
    expect(mockAudit.getAuditTrail).toHaveBeenCalledWith('tenant-uuid', query);
  });

  // ─── Bulk Operations ─────────────────────────────────────────────────────
  it('should call bulkOperationsService.bulkIssue with tenant, user.sub and dto', async () => {
    const dto = { invoice_ids: ['inv-1', 'inv-2'] } as never;
    mockBulkOps.bulkIssue.mockResolvedValue({ success: 2, failed: 0 });
    await controller.bulkIssue(TENANT, USER, dto);
    expect(mockBulkOps.bulkIssue).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  // ─── Recurring Invoices ───────────────────────────────────────────────────
  it('should call recurringInvoicesService.generateDueInvoices', async () => {
    mockRecurring.generateDueInvoices.mockResolvedValue(3);
    const result = await controller.generateDueInvoices(TENANT);
    expect(mockRecurring.generateDueInvoices).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual({ generated: 3 });
  });
});
