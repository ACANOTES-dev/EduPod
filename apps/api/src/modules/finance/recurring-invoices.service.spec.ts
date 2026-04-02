import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { RecurringInvoicesService } from './recurring-invoices.service';

const TENANT_ID = 'tenant-uuid-1111';
const CONFIG_ID = 'config-uuid-1111';
const FEE_STRUCTURE_ID = 'fee-structure-uuid-1111';

const defaultSettings = {
  finance: {
    autoIssueRecurringInvoices: false,
    requireApprovalForInvoiceIssue: false,
    defaultPaymentTermDays: 30,
    allowPartialPayment: true,
    paymentReminderEnabled: true,
    dueSoonReminderDays: 3,
    finalNoticeAfterDays: 14,
    reminderChannel: 'email',
    lateFeeEnabled: false,
    defaultLateFeeConfigId: null,
  },
};

const mockPrisma = {
  recurringInvoiceConfig: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  feeStructure: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn().mockResolvedValue({ invoice_prefix: 'INV' }),
  },
  tenantMembership: {
    findFirst: jest.fn().mockResolvedValue({ user_id: 'system-user-uuid' }),
  },
  invoice: {
    create: jest.fn(),
  },
};

const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue(defaultSettings),
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('INV-202603-000001'),
};

describe('RecurringInvoicesService', () => {
  let service: RecurringInvoicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringInvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SequenceService, useValue: mockSequenceService },
      ],
    }).compile();

    service = module.get<RecurringInvoicesService>(RecurringInvoicesService);
    jest.clearAllMocks();
    mockSettingsService.getSettings.mockResolvedValue(defaultSettings);
    mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'INV' });
  });

  describe('findAllConfigs', () => {
    it('should return paginated configs', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([{ id: CONFIG_ID }]);
      mockPrisma.recurringInvoiceConfig.count.mockResolvedValue(1);

      const result = await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('createConfig', () => {
    it('should create a config', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue({
        id: FEE_STRUCTURE_ID,
        name: 'Tuition',
      });
      mockPrisma.recurringInvoiceConfig.create.mockResolvedValue({
        id: CONFIG_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'monthly',
        next_generation_date: new Date('2026-04-01'),
        active: true,
      });

      const result = await service.createConfig(TENANT_ID, {
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'monthly',
        next_generation_date: '2026-04-01',
      });

      expect(result.frequency).toBe('monthly');
      expect(result.active).toBe(true);
    });

    it('should throw NotFoundException when fee structure not found', async () => {
      mockPrisma.feeStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.createConfig(TENANT_ID, {
          fee_structure_id: FEE_STRUCTURE_ID,
          frequency: 'monthly',
          next_generation_date: '2026-04-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneConfig', () => {
    it('should throw NotFoundException when config not found', async () => {
      mockPrisma.recurringInvoiceConfig.findFirst.mockResolvedValue(null);

      await expect(service.findOneConfig(TENANT_ID, CONFIG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateDueInvoices', () => {
    it('should return 0 when no configs are due', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should skip generation when tenant not found', async () => {
      const today = new Date();
      today.setDate(today.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should generate invoices for termly frequency', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'termly',
          next_generation_date: yesterday,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should generate invoices with discounts', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: yesterday,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: { toNumber: () => 1000 },
            household_fee_assignments: [
              {
                household: { id: 'hh-1', household_name: 'Smith' },
                discount: {
                  discount_type: 'percent',
                  value: { toNumber: () => 10 },
                },
              },
            ],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(1);
    });

    it('should auto-issue when configured', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        ...defaultSettings,
        finance: { ...defaultSettings.finance, autoIssueRecurringInvoices: true },
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: yesterday,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should fall back to first admin when no system user provided', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: yesterday,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ user_id: 'admin-1' });

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should use tenant ID when no admin found', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: yesterday,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({});
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const count = await service.generateDueInvoices(TENANT_ID);
      expect(count).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update frequency and next generation date', async () => {
      mockPrisma.recurringInvoiceConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'monthly',
      });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({
        id: CONFIG_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'termly',
        next_generation_date: new Date('2026-06-01'),
        active: true,
      });

      const result = await service.updateConfig(TENANT_ID, CONFIG_ID, {
        frequency: 'termly',
        next_generation_date: '2026-06-01',
      });

      expect(result.frequency).toBe('termly');
    });

    it('should toggle active status', async () => {
      mockPrisma.recurringInvoiceConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'monthly',
      });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({
        id: CONFIG_ID,
        fee_structure_id: FEE_STRUCTURE_ID,
        frequency: 'monthly',
        active: false,
      });

      const result = await service.updateConfig(TENANT_ID, CONFIG_ID, { active: false });

      expect(result.active).toBe(false);
    });
  });

  describe('findAllConfigs', () => {
    it('should filter by active status', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);
      mockPrisma.recurringInvoiceConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20, active: true });

      expect(mockPrisma.recurringInvoiceConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('should filter by inactive status', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);
      mockPrisma.recurringInvoiceConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20, active: false });

      expect(mockPrisma.recurringInvoiceConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );
    });
  });
});
