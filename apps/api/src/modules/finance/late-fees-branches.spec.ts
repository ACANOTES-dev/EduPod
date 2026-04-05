/**
 * Additional branch coverage for LateFeesService.
 * Targets: applyLateFee branches (configId provided, no configId fallback, grace period,
 * max applications, frequency_days check, percent vs fixed fee types),
 * findAllConfigs active filter, updateConfig partial fields.
 */
/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';

import { LateFeesService } from './late-fees.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVOICE_ID = 'inv-1';
const CONFIG_ID = 'config-1';

const mockPrisma = {
  lateFeeConfig: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoice: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  lateFeeApplication: { create: jest.fn() },
  invoiceLine: { create: jest.fn() },
};

describe('LateFeesService — branch coverage', () => {
  let service: LateFeesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LateFeesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<LateFeesService>(LateFeesService);
    jest.clearAllMocks();
  });

  // ─── findAllConfigs — active filter branch ────────────────────────────────

  describe('LateFeesService — findAllConfigs', () => {
    it('should filter by active when provided', async () => {
      mockPrisma.lateFeeConfig.findMany.mockResolvedValue([]);
      mockPrisma.lateFeeConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20, active: true });

      expect(mockPrisma.lateFeeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('should not include active filter when undefined', async () => {
      mockPrisma.lateFeeConfig.findMany.mockResolvedValue([]);
      mockPrisma.lateFeeConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockPrisma.lateFeeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── createConfig — optional field defaults ───────────────────────────────

  describe('LateFeesService — createConfig', () => {
    it('should use defaults for optional fields', async () => {
      mockPrisma.lateFeeConfig.create.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Late Fee',
        fee_type: 'fixed',
        value: { toNumber: () => 50 },
        grace_period_days: 0,
        max_applications: 1,
        frequency_days: null,
        active: true,
      });

      await service.createConfig(TENANT_ID, {
        name: 'Late Fee',
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 0,
        max_applications: 1,
      });

      expect(mockPrisma.lateFeeConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grace_period_days: 0,
            max_applications: 1,
            frequency_days: null,
          }),
        }),
      );
    });

    it('should use provided optional fields', async () => {
      mockPrisma.lateFeeConfig.create.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Recurring Late Fee',
        fee_type: 'percent',
        value: { toNumber: () => 5 },
        grace_period_days: 7,
        max_applications: 3,
        frequency_days: 30,
        active: true,
      });

      await service.createConfig(TENANT_ID, {
        name: 'Recurring Late Fee',
        fee_type: 'percent',
        value: 5,
        grace_period_days: 7,
        max_applications: 3,
        frequency_days: 30,
      });

      expect(mockPrisma.lateFeeConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grace_period_days: 7,
            max_applications: 3,
            frequency_days: 30,
          }),
        }),
      );
    });
  });

  // ─── applyLateFee — all branches ──────────────────────────────────────────

  describe('LateFeesService — applyLateFee', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.applyLateFee(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-payable invoice status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        late_fee_applications: [],
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use provided configId to find config', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        due_date: new Date('2026-01-01'),
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Standard Late Fee',
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: null,
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID);

      expect(result.late_fee_config_id).toBe(CONFIG_ID);
      expect(result.amount_applied).toBe(50);
    });

    it('should fall back to most recent active config when no configId', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: new Date('2026-01-01'),
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: 'fallback-config',
        name: 'Default Late Fee',
        fee_type: 'percent',
        value: 5,
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: null,
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID);

      expect(result.late_fee_config_id).toBe('fallback-config');
      expect(result.amount_applied).toBe(50); // 5% of 1000
    });

    it('should throw NotFoundException when no active config found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        due_date: new Date('2026-01-01'),
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue(null);

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException within grace period', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        due_date: yesterday,
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 7,
        max_applications: 5,
        frequency_days: null,
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when max applications reached', async () => {
      const oldDate = new Date('2026-01-01');

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: oldDate,
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [
          { late_fee_config_id: CONFIG_ID, applied_at: new Date('2026-02-01') },
        ],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 0,
        max_applications: 1,
        frequency_days: null,
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when too soon for next application', async () => {
      const oldDate = new Date('2026-01-01');
      const recentApp = new Date();
      recentApp.setDate(recentApp.getDate() - 5);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: oldDate,
        total_amount: 1000,
        balance_amount: 1000,
        late_fee_applications: [{ late_fee_config_id: CONFIG_ID, applied_at: recentApp }],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: 30, // 30 days between applications, but only 5 days since last
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── updateConfig — partial updates ───────────────────────────────────────

  describe('LateFeesService — updateConfig partial fields', () => {
    it('should update only provided fields', async () => {
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        value: { toNumber: () => 50 },
      });
      mockPrisma.lateFeeConfig.update.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Updated',
        value: { toNumber: () => 50 },
      });

      await service.updateConfig(TENANT_ID, CONFIG_ID, { name: 'Updated' });

      expect(mockPrisma.lateFeeConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
    });
  });
});
