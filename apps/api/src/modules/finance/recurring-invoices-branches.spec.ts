/**
 * Additional branch coverage for RecurringInvoicesService.
 * Targets: findAllConfigs active filter, generateDueInvoices branches
 * (autoIssue, no systemUserId, discount types, error handling, computeNextDate),
 * updateConfig partial fields.
 */
/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import {
  MOCK_FACADE_PROVIDERS,
  TenantReadFacade,
  RbacReadFacade,
} from '../../common/tests/mock-facades';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { RecurringInvoicesService } from './recurring-invoices.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'config-1';
const FEE_STRUCTURE_ID = 'fs-1';

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

describe('RecurringInvoicesService — branch coverage', () => {
  let service: RecurringInvoicesService;
  let mockPrisma: {
    recurringInvoiceConfig: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    feeStructure: {
      findFirst: jest.Mock;
    };
    invoice: {
      create: jest.Mock;
    };
  };
  let mockSettingsService: { getSettings: jest.Mock };
  let mockSequenceService: { nextNumber: jest.Mock };
  let mockTenantReadFacade: { findById: jest.Mock; findBranding: jest.Mock };
  let mockRbacReadFacade: { findFirstActiveMembershipUserId: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      recurringInvoiceConfig: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      feeStructure: { findFirst: jest.fn().mockResolvedValue(null) },
      invoice: { create: jest.fn() },
    };

    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue(defaultSettings),
    };
    mockSequenceService = {
      nextNumber: jest.fn().mockResolvedValue('INV-202603-001'),
    };
    mockTenantReadFacade = {
      findById: jest.fn().mockResolvedValue({ id: TENANT_ID, currency_code: 'USD' }),
      findBranding: jest.fn().mockResolvedValue({ invoice_prefix: 'INV' }),
    };
    mockRbacReadFacade = {
      findFirstActiveMembershipUserId: jest.fn().mockResolvedValue('admin-user-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: TenantReadFacade, useValue: mockTenantReadFacade },
        { provide: RbacReadFacade, useValue: mockRbacReadFacade },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SequenceService, useValue: mockSequenceService },
        RecurringInvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RecurringInvoicesService>(RecurringInvoicesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAllConfigs — active filter ───────────────────────────────────────

  describe('RecurringInvoicesService — findAllConfigs active filter', () => {
    it('should filter by active when provided', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);
      mockPrisma.recurringInvoiceConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20, active: true });

      expect(mockPrisma.recurringInvoiceConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('should not filter by active when undefined', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);
      mockPrisma.recurringInvoiceConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockPrisma.recurringInvoiceConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── findOneConfig — not found ────────────────────────────────────────────

  describe('RecurringInvoicesService — findOneConfig', () => {
    it('should throw NotFoundException when config not found', async () => {
      await expect(service.findOneConfig(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createConfig — fee structure validation ──────────────────────────────

  describe('RecurringInvoicesService — createConfig', () => {
    it('should throw NotFoundException when fee structure not found', async () => {
      await expect(
        service.createConfig(TENANT_ID, {
          fee_structure_id: 'nonexistent',
          frequency: 'monthly',
          next_generation_date: '2026-04-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateConfig — branches ──────────────────────────────────────────────

  describe('RecurringInvoicesService — updateConfig', () => {
    it('should throw NotFoundException when config not found', async () => {
      await expect(
        service.updateConfig(TENANT_ID, 'nonexistent', { active: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update frequency and next_generation_date', async () => {
      mockPrisma.recurringInvoiceConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      await service.updateConfig(TENANT_ID, CONFIG_ID, {
        frequency: 'term',
        next_generation_date: '2026-07-01',
        active: false,
      });

      expect(mockPrisma.recurringInvoiceConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            frequency: 'term',
            active: false,
          }),
        }),
      );
    });
  });

  // ─── generateDueInvoices — branches ───────────────────────────────────────

  describe('RecurringInvoicesService — generateDueInvoices', () => {
    it('should return 0 when no due configs exist', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);

      const count = await service.generateDueInvoices(TENANT_ID, 'system-user');

      expect(count).toBe(0);
    });

    it('should resolve systemUserId from rbac when not provided', async () => {
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);

      await service.generateDueInvoices(TENANT_ID);

      expect(mockRbacReadFacade.findFirstActiveMembershipUserId).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should fall back to tenantId when rbac returns null', async () => {
      mockRbacReadFacade.findFirstActiveMembershipUserId.mockResolvedValue(null);
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([]);

      const count = await service.generateDueInvoices(TENANT_ID);

      expect(count).toBe(0);
    });

    it('should generate invoices with percent discount', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: { toNumber: () => 1000 },
            household_fee_assignments: [
              {
                household: { id: 'hh-1', household_name: 'Smiths' },
                discount: { discount_type: 'percent', value: { toNumber: () => 10 } },
              },
            ],
          },
        },
      ]);
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(1);
      expect(mockPrisma.invoice.create).toHaveBeenCalled();
    });

    it('should generate invoices with fixed discount', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [
              {
                household: { id: 'hh-1', household_name: 'Smiths' },
                discount: { discount_type: 'fixed', value: 50 },
              },
            ],
          },
        },
      ]);
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(1);
    });

    it('should generate invoices without discount', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 1000,
            household_fee_assignments: [
              {
                household: { id: 'hh-1', household_name: 'Smiths' },
                discount: null,
              },
            ],
          },
        },
      ]);
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(1);
    });

    it('should use autoIssue status when enabled', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        finance: { ...defaultSettings.finance, autoIssueRecurringInvoices: true },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [
              {
                household: { id: 'hh-1', household_name: 'Smiths' },
                discount: null,
              },
            ],
          },
        },
      ]);
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'issued',
            issue_date: expect.any(Date),
          }),
        }),
      );
    });

    it('should return 0 when no assignments exist for config', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      // The config is processed but generates 0 invoices, then next_generation_date is updated
      expect(count).toBe(0);
    });

    it('should handle term frequency in computeNextDate', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'term',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [],
          },
        },
      ]);
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      await service.generateDueInvoices(TENANT_ID, 'sys-user');

      // Should update next_generation_date by ~90 days for term
      expect(mockPrisma.recurringInvoiceConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            next_generation_date: expect.any(Date),
          }),
        }),
      );
    });

    it('should return 0 when tenant not found', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [
              { household: { id: 'hh-1', household_name: 'Smiths' }, discount: null },
            ],
          },
        },
      ]);
      mockTenantReadFacade.findById.mockResolvedValue(null);
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(0);
    });

    it('should use default prefix when branding has none', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockTenantReadFacade.findBranding.mockResolvedValue(null);
      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [
              { household: { id: 'hh-1', household_name: 'Smiths' }, discount: null },
            ],
          },
        },
      ]);
      mockPrisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(1);
      // Should use 'INV' as default prefix
      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });

    it('should catch and log errors per-household without stopping', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.recurringInvoiceConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          frequency: 'monthly',
          next_generation_date: today,
          fee_structure: {
            id: FEE_STRUCTURE_ID,
            name: 'Tuition',
            amount: 500,
            household_fee_assignments: [
              { household: { id: 'hh-1', household_name: 'Smiths' }, discount: null },
              { household: { id: 'hh-2', household_name: 'Jones' }, discount: null },
            ],
          },
        },
      ]);
      // First invoice creation fails, second succeeds
      mockPrisma.invoice.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'inv-2' });
      mockPrisma.recurringInvoiceConfig.update.mockResolvedValue({ id: CONFIG_ID });

      const count = await service.generateDueInvoices(TENANT_ID, 'sys-user');

      expect(count).toBe(1); // Only the second one succeeded
    });
  });
});
