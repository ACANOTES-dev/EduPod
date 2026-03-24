import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
      providers: [
        LateFeesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
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

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(BadRequestException);
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

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(BadRequestException);
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

      await expect(service.applyLateFee(TENANT_ID, INVOICE_ID, CONFIG_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
