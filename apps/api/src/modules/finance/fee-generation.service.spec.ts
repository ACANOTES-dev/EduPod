/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { MOCK_FACADE_PROVIDERS, TenantReadFacade } from '../../common/tests/mock-facades';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { FeeGenerationService } from './fee-generation.service';

const FS_ID = 'fs-uuid-1111';
const YG_ID = 'yg-uuid-1111';
const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const HOUSEHOLD_ID = 'hh-uuid-1111';

const mockPrisma = {
  householdFeeAssignment: {
    findMany: jest.fn(),
  },
  invoiceLine: {
    findMany: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  invoice: {
    create: jest.fn(),
  },
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('INV-202603-000001'),
};

const mockAuditLogService = {
  write: jest.fn().mockResolvedValue(undefined),
};

const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
  household_id: HOUSEHOLD_ID,
  fee_structure_id: FS_ID,
  student_id: null,
  fee_structure: {
    id: FS_ID,
    name: 'Tuition',
    amount: '1000.00',
    year_group_id: YG_ID,
  },
  discount: null,
  household: {
    id: HOUSEHOLD_ID,
    household_name: 'Smith Family',
    primary_billing_parent_id: 'parent-uuid',
  },
  student: null,
  ...overrides,
});

describe('FeeGenerationService', () => {
  let service: FeeGenerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        FeeGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        {
          provide: TenantReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' }),
            findBranding: jest.fn().mockResolvedValue({ invoice_prefix: 'INV' }),
          },
        },
      ],
    }).compile();

    service = module.get<FeeGenerationService>(FeeGenerationService);
    jest.clearAllMocks();
  });

  describe('preview', () => {
    it('should return preview with line totals and summary', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]); // no duplicates

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
      expect(result.preview_lines[0]?.base_amount).toBe(1000);
      expect(result.preview_lines[0]?.line_total).toBe(1000);
      expect(result.summary.total_amount).toBe(1000);
      expect(result.summary.total_households).toBe(1);
    });

    it('should apply percentage discount correctly', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          discount: { name: '10% Off', discount_type: 'percent', value: '10.00' },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines[0]?.discount_amount).toBe(100);
      expect(result.preview_lines[0]?.line_total).toBe(900);
    });

    it('should apply fixed discount correctly', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          discount: { name: 'Fixed Off', discount_type: 'fixed', value: '200.00' },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines[0]?.discount_amount).toBe(200);
      expect(result.preview_lines[0]?.line_total).toBe(800);
    });

    it('should mark duplicate invoice lines', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          fee_structure_id: FS_ID,
          student_id: null,
          invoice: { household_id: HOUSEHOLD_ID },
        },
      ]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines[0]?.is_duplicate).toBe(true);
      expect(result.summary.duplicates_excluded).toBe(1);
    });

    it('should flag missing billing parent', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          household: {
            id: HOUSEHOLD_ID,
            household_name: 'No Billing',
            primary_billing_parent_id: null,
          },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines[0]?.missing_billing_parent).toBe(true);
      expect(result.summary.missing_billing_parent_count).toBe(1);
    });
  });

  describe('confirm', () => {
    it('should create invoices from valid preview lines', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'INV' });
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'inv-uuid',
        invoice_number: 'INV-202603-000001',
      });

      const result = (await service.confirm(TENANT_ID, USER_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-01',
        excluded_household_ids: [],
      })) as { invoices_created: number; total_amount: number };

      expect(result.invoices_created).toBe(1);
      expect(result.total_amount).toBe(1000);
      expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException when no valid lines remain', async () => {
      // All lines are duplicates
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          fee_structure_id: FS_ID,
          student_id: null,
          invoice: { household_id: HOUSEHOLD_ID },
        },
      ]);

      await expect(
        service.confirm(TENANT_ID, USER_ID, {
          fee_structure_ids: [FS_ID],
          year_group_ids: [YG_ID],
          billing_period_start: '2026-03-01',
          billing_period_end: '2026-03-31',
          due_date: '2026-04-01',
          excluded_household_ids: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should exclude households in excluded_household_ids', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      await expect(
        service.confirm(TENANT_ID, USER_ID, {
          fee_structure_ids: [FS_ID],
          year_group_ids: [YG_ID],
          billing_period_start: '2026-03-01',
          billing_period_end: '2026-03-31',
          due_date: '2026-04-01',
          excluded_household_ids: [HOUSEHOLD_ID],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant not found', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      // Override the TenantReadFacade to return null
      const badModule: TestingModule = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          FeeGenerationService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: SequenceService, useValue: mockSequenceService },
          { provide: AuditLogService, useValue: mockAuditLogService },
          {
            provide: TenantReadFacade,
            useValue: {
              findById: jest.fn().mockResolvedValue(null),
              findBranding: jest.fn().mockResolvedValue(null),
            },
          },
        ],
      }).compile();

      const svc = badModule.get<FeeGenerationService>(FeeGenerationService);

      await expect(
        svc.confirm(TENANT_ID, USER_ID, {
          fee_structure_ids: [FS_ID],
          year_group_ids: [YG_ID],
          billing_period_start: '2026-03-01',
          billing_period_end: '2026-03-31',
          due_date: '2026-04-01',
          excluded_household_ids: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('preview — year group filtering', () => {
    it('should include assignment when student year_group matches', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          fee_structure: {
            id: FS_ID,
            name: 'Tuition',
            amount: '500.00',
            year_group_id: null, // Fee structure has no year group
          },
          student: {
            id: 'stu-1',
            first_name: 'Alice',
            last_name: 'Smith',
            year_group_id: YG_ID, // Student year group matches filter
          },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
      expect(result.preview_lines[0]?.student_name).toBe('Alice Smith');
    });

    it('should include household-level assignment (no year group on fee structure or student)', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          fee_structure: {
            id: FS_ID,
            name: 'Admin Fee',
            amount: '200.00',
            year_group_id: null,
          },
          student: null,
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
      expect(result.preview_lines[0]?.student_name).toBeNull();
    });

    it('should exclude assignment when student year_group does NOT match', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          fee_structure: {
            id: FS_ID,
            name: 'Tuition',
            amount: '500.00',
            year_group_id: null,
          },
          student: {
            id: 'stu-1',
            first_name: 'Alice',
            last_name: 'Smith',
            year_group_id: 'different-yg',
          },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(0);
    });

    it('should cap fixed discount at base amount', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          discount: { name: 'Big Discount', discount_type: 'fixed', value: '5000.00' },
        }),
      ]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      // Discount should be capped at base amount (1000), not 5000
      expect(result.preview_lines[0]?.discount_amount).toBe(1000);
      expect(result.preview_lines[0]?.line_total).toBe(0);
    });
  });

  describe('confirm — invoice uses default branding prefix', () => {
    it('should use default INV prefix when branding is null', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const noPrefix = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          FeeGenerationService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: SequenceService, useValue: mockSequenceService },
          { provide: AuditLogService, useValue: mockAuditLogService },
          {
            provide: TenantReadFacade,
            useValue: {
              findById: jest.fn().mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' }),
              findBranding: jest.fn().mockResolvedValue(null),
            },
          },
        ],
      }).compile();

      const svc = noPrefix.get<FeeGenerationService>(FeeGenerationService);
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'inv-uuid',
        invoice_number: 'INV-202603-000001',
      });

      const result = (await svc.confirm(TENANT_ID, USER_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-01',
        excluded_household_ids: [],
      })) as { invoices_created: number };

      expect(result.invoices_created).toBe(1);
      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });
  });
});
