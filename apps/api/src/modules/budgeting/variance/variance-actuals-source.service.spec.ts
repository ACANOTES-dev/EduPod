import { Test, TestingModule } from '@nestjs/testing';

import { FinanceReadFacade } from '../../finance/finance-read.facade';
import { PayrollReadFacade } from '../../payroll/payroll-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import { VarianceActualsSourceService } from './variance-actuals-source.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '22222222-2222-4222-8222-222222222222';

function buildMockPrisma() {
  return {
    varianceCache: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('VarianceActualsSourceService', () => {
  let service: VarianceActualsSourceService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockFinance: { sumPaymentsForPeriod: jest.Mock };
  let mockPayroll: { sumPayrollEntriesByDepartmentForPeriod: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockFinance = {
      sumPaymentsForPeriod: jest.fn().mockResolvedValue({ received: 0, refunded: 0 }),
    };
    mockPayroll = {
      sumPayrollEntriesByDepartmentForPeriod: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VarianceActualsSourceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FinanceReadFacade, useValue: mockFinance },
        { provide: PayrollReadFacade, useValue: mockPayroll },
      ],
    }).compile();

    service = module.get<VarianceActualsSourceService>(VarianceActualsSourceService);
    jest.clearAllMocks();
  });

  it('derives income.tuition_net from received minus refunded', async () => {
    mockFinance.sumPaymentsForPeriod.mockResolvedValueOnce({
      received: 50_000,
      refunded: 1_000,
    });

    const result = await service.getActualsForPeriod(
      TENANT_ID,
      MODEL_ID,
      'month',
      'Sep 2026',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.byLineItemKey['income.tuition_gross']).toBe(50_000);
    expect(result.byLineItemKey['income.tuition_net']).toBe(49_000);
  });

  it('emits staff_costs.<department_id> keys from payroll aggregation', async () => {
    mockPayroll.sumPayrollEntriesByDepartmentForPeriod.mockResolvedValueOnce([
      { department_id: 'teaching', total_pay: 30_000 },
      { department_id: 'admin', total_pay: 12_000 },
    ]);

    const result = await service.getActualsForPeriod(
      TENANT_ID,
      MODEL_ID,
      'month',
      'Sep 2026',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.byLineItemKey['staff_costs.teaching']).toBe(30_000);
    expect(result.byLineItemKey['staff_costs.admin']).toBe(12_000);
  });

  it('manual cache rows override the auto-derived value for the same key', async () => {
    mockFinance.sumPaymentsForPeriod.mockResolvedValueOnce({
      received: 50_000,
      refunded: 0,
    });
    mockPrisma.varianceCache.findMany.mockResolvedValueOnce([
      {
        line_item_key: 'income.tuition_net',
        actual: 47_500,
        drivers_json: { manual: true },
      },
    ]);

    const result = await service.getActualsForPeriod(
      TENANT_ID,
      MODEL_ID,
      'month',
      'Sep 2026',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.byLineItemKey['income.tuition_net']).toBe(47_500);
    expect(result.manual_overrides['income.tuition_net']).toBe(47_500);
  });

  it('cache rows without drivers_json.manual=true do not override', async () => {
    mockFinance.sumPaymentsForPeriod.mockResolvedValueOnce({
      received: 50_000,
      refunded: 0,
    });
    mockPrisma.varianceCache.findMany.mockResolvedValueOnce([
      {
        line_item_key: 'income.tuition_net',
        actual: 47_500,
        drivers_json: { manual: false },
      },
    ]);

    const result = await service.getActualsForPeriod(
      TENANT_ID,
      MODEL_ID,
      'month',
      'Sep 2026',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.byLineItemKey['income.tuition_net']).toBe(50_000);
    expect(result.manual_overrides).toEqual({});
  });

  it('operations / capital keys are absent when no manual entries exist', async () => {
    const result = await service.getActualsForPeriod(
      TENANT_ID,
      MODEL_ID,
      'month',
      'Sep 2026',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );

    expect(result.byLineItemKey['operations.maintenance']).toBeUndefined();
    expect(result.byLineItemKey['capital.building']).toBeUndefined();
  });
});
