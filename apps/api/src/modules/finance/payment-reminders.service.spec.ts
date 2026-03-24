import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { PaymentRemindersService } from './payment-reminders.service';

const TENANT_ID = 'tenant-uuid-1111';
const INVOICE_ID = 'invoice-uuid-1111';

const defaultSettings = {
  finance: {
    paymentReminderEnabled: true,
    dueSoonReminderDays: 3,
    finalNoticeAfterDays: 14,
    reminderChannel: 'email',
    requireApprovalForInvoiceIssue: false,
    defaultPaymentTermDays: 30,
    allowPartialPayment: true,
    autoIssueRecurringInvoices: false,
    lateFeeEnabled: false,
    defaultLateFeeConfigId: null,
  },
};

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
  },
  invoiceReminder: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue(defaultSettings),
};

describe('PaymentRemindersService', () => {
  let service: PaymentRemindersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRemindersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<PaymentRemindersService>(PaymentRemindersService);
    jest.clearAllMocks();
    mockSettingsService.getSettings.mockResolvedValue(defaultSettings);
  });

  describe('sendDueSoonReminders', () => {
    it('should return 0 when reminders are disabled', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { ...defaultSettings.finance, paymentReminderEnabled: false },
      });

      const count = await service.sendDueSoonReminders(TENANT_ID);
      expect(count).toBe(0);
      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('should skip invoices already reminded', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: INVOICE_ID,
          reminders: [{ id: 'reminder-1', reminder_type: 'due_soon' }],
        },
      ]);

      const count = await service.sendDueSoonReminders(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should dispatch reminders for un-reminded invoices', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: INVOICE_ID, reminders: [] },
      ]);
      mockPrisma.invoiceReminder.create.mockResolvedValue({ id: 'r1' });

      const count = await service.sendDueSoonReminders(TENANT_ID);
      expect(count).toBe(1);
      expect(mockPrisma.invoiceReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reminder_type: 'due_soon', invoice_id: INVOICE_ID }),
        }),
      );
    });
  });

  describe('sendOverdueReminders', () => {
    it('should skip invoices already reminded as overdue', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: INVOICE_ID, reminders: [{ reminder_type: 'overdue' }] },
      ]);

      const count = await service.sendOverdueReminders(TENANT_ID);
      expect(count).toBe(0);
    });
  });

  describe('sendFinalNotices', () => {
    it('should return 0 when reminders are disabled', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { ...defaultSettings.finance, paymentReminderEnabled: false },
      });

      const count = await service.sendFinalNotices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should dispatch final notices for qualifying invoices', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { id: INVOICE_ID, reminders: [] },
      ]);
      mockPrisma.invoiceReminder.create.mockResolvedValue({ id: 'r1' });

      const count = await service.sendFinalNotices(TENANT_ID);
      expect(count).toBe(1);
    });
  });

  describe('getRemindersForInvoice', () => {
    it('should return reminders for a given invoice', async () => {
      mockPrisma.invoiceReminder.findMany.mockResolvedValue([
        { id: 'r1', reminder_type: 'due_soon' },
      ]);

      const result = await service.getRemindersForInvoice(TENANT_ID, INVOICE_ID);
      expect(result).toHaveLength(1);
    });
  });
});
