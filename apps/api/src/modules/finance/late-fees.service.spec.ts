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

const TENANT_ID = 'tenant-uuid-1111';
const INVOICE_ID = 'invoice-uuid-1111';
const CONFIG_ID = 'config-uuid-1111';

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
  lateFeeApplication: {
    create: jest.fn(),
  },
  invoiceLine: {
    create: jest.fn(),
  },
};

describe('LateFeesService', () => {
  let service: LateFeesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LateFeesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<LateFeesService>(LateFeesService);
    jest.clearAllMocks();
  });

  describe('findAllConfigs', () => {
    it('should return paginated configs', async () => {
      mockPrisma.lateFeeConfig.findMany.mockResolvedValue([{ id: CONFIG_ID, value: '50.00' }]);
      mockPrisma.lateFeeConfig.count.mockResolvedValue(1);

      const result = await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.value).toBe(50);
    });

    it('should filter by active status', async () => {
      mockPrisma.lateFeeConfig.findMany.mockResolvedValue([]);
      mockPrisma.lateFeeConfig.count.mockResolvedValue(0);

      await service.findAllConfigs(TENANT_ID, { page: 1, pageSize: 20, active: true });

      expect(mockPrisma.lateFeeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });
  });

  describe('findOneConfig', () => {
    it('should return config with numeric value', async () => {
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Standard',
        value: '50.00',
      });

      const result = await service.findOneConfig(TENANT_ID, CONFIG_ID);

      expect(result.value).toBe(50);
    });

    it('should throw NotFoundException when config not found', async () => {
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue(null);

      await expect(service.findOneConfig(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConfig', () => {
    it('should update a config', async () => {
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockPrisma.lateFeeConfig.update.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Updated',
        value: '75.00',
      });

      const result = await service.updateConfig(TENANT_ID, CONFIG_ID, {
        name: 'Updated',
        value: 75,
      });

      expect(result.value).toBe(75);
    });

    it('should throw NotFoundException when config not found', async () => {
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue(null);

      await expect(service.updateConfig(TENANT_ID, 'bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createConfig', () => {
    it('should create a late fee config', async () => {
      mockPrisma.lateFeeConfig.create.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Standard Late Fee',
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 7,
        max_applications: 1,
        active: true,
      });

      const result = await service.createConfig(TENANT_ID, {
        name: 'Standard Late Fee',
        fee_type: 'fixed',
        value: 50,
        grace_period_days: 7,
        max_applications: 1,
      });

      expect(result.value).toBe(50);
      expect(result.name).toBe('Standard Late Fee');
    });

    it('should use defaults when optional fields omitted', async () => {
      mockPrisma.lateFeeConfig.create.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Minimal',
        fee_type: 'fixed',
        value: '25.00',
        grace_period_days: 0,
        max_applications: 1,
        frequency_days: null,
        active: true,
      });

      await service.createConfig(TENANT_ID, {
        name: 'Minimal',
        fee_type: 'fixed',
        value: 25,
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
  });

  describe('applyLateFee', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no active config found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: new Date('2020-01-01'),
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue(null);

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid invoice status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        late_fee_applications: [],
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when within grace period', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: new Date(), // due today — within grace period
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 7,
        max_applications: 1,
        frequency_days: null,
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when max applications reached', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [{ late_fee_config_id: CONFIG_ID, applied_at: past }],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 0,
        max_applications: 1,
        frequency_days: null,
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should apply a fixed late fee successfully', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Fixed Late Fee',
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 0,
        max_applications: 3,
        frequency_days: null,
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID);

      expect(result).toEqual({
        invoice_id: INVOICE_ID,
        late_fee_config_id: CONFIG_ID,
        amount_applied: 50,
      });
      // Total should become 1050
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total_amount: 1050,
            balance_amount: 1050,
          }),
        }),
      );
    });

    it('should apply a percentage late fee successfully', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '800.00',
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Percent Late Fee',
        fee_type: 'percent',
        value: '5.00',
        grace_period_days: 0,
        max_applications: 3,
        frequency_days: null,
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID);

      expect(result.amount_applied).toBe(50); // 5% of 1000
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total_amount: 1050,
            balance_amount: 850,
          }),
        }),
      );
    });

    it('should fall back to latest active config when configId not provided', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: 'auto-config',
        name: 'Auto Config',
        fee_type: 'fixed',
        value: '25.00',
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: null,
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID);

      expect(result.amount_applied).toBe(25);
      expect(result.late_fee_config_id).toBe('auto-config');
    });

    it('should throw BadRequestException when frequency_days not met for recurring fee', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const recentApplication = new Date();
      recentApplication.setDate(recentApplication.getDate() - 3);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [{ late_fee_config_id: CONFIG_ID, applied_at: recentApplication }],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: 7, // Must wait 7 days between applications
      });

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow application when frequency_days threshold is met', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const oldApplication = new Date();
      oldApplication.setDate(oldApplication.getDate() - 10);

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        due_date: past,
        total_amount: '1000.00',
        balance_amount: '1000.00',
        late_fee_applications: [{ late_fee_config_id: CONFIG_ID, applied_at: oldApplication }],
      });
      mockPrisma.lateFeeConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        name: 'Recurring Fee',
        fee_type: 'fixed',
        value: '50.00',
        grace_period_days: 0,
        max_applications: 5,
        frequency_days: 7, // 10 days > 7 days, so should be allowed
      });
      mockPrisma.lateFeeApplication.create.mockResolvedValue({});
      mockPrisma.invoiceLine.create.mockResolvedValue({});
      mockPrisma.invoice.update.mockResolvedValue({});

      const result = await service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID);

      expect(result.amount_applied).toBe(50);
    });
  });
});
