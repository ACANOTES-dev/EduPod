/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

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
        FeeGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: AuditLogService, useValue: mockAuditLogService },
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
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

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
  });

  describe('preview edge cases', () => {
    it('should filter by year group on fee structure', async () => {
      const assignment = makeAssignment({
        fee_structure: {
          id: FS_ID,
          name: 'Tuition',
          amount: '1000.00',
          year_group_id: YG_ID,
        },
        student: { year_group_id: 'different-yg' },
      });
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([assignment]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
    });

    it('should filter by year group on student when fee structure has no year group', async () => {
      const assignment = makeAssignment({
        fee_structure: {
          id: FS_ID,
          name: 'Tuition',
          amount: '1000.00',
          year_group_id: null,
        },
        student: {
          id: 'student-1',
          first_name: 'John',
          last_name: 'Doe',
          year_group_id: YG_ID,
        },
      });
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([assignment]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
    });

    it('should include household-level assignment without year group', async () => {
      const assignment = makeAssignment({
        fee_structure: {
          id: FS_ID,
          name: 'Tuition',
          amount: '1000.00',
          year_group_id: null,
        },
        student: null,
      });
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([assignment]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.preview(TENANT_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-15',
      });

      expect(result.preview_lines).toHaveLength(1);
    });

    it('should generate invoice number with default prefix', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([makeAssignment()]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.invoice.create.mockResolvedValue({
        id: 'inv-uuid',
        invoice_number: 'INV-202603-000001',
      });

      await service.confirm(TENANT_ID, USER_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-01',
        excluded_household_ids: [],
      });

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });

    it('should handle discount exceeding base amount', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([
        makeAssignment({
          discount: { name: 'Over Discount', discount_type: 'fixed', value: '1500.00' },
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

      // Discount capped at base amount
      expect(result.preview_lines[0]?.discount_amount).toBe(1000);
      expect(result.preview_lines[0]?.line_total).toBe(0);
    });

    it('should handle multiple households in same invoice', async () => {
      const assignment1 = makeAssignment({
        household_id: 'hh-1',
        household: { id: 'hh-1', household_name: 'Family 1', primary_billing_parent_id: 'p1' },
      });
      const assignment2 = makeAssignment({
        household_id: 'hh-2',
        household: { id: 'hh-2', household_name: 'Family 2', primary_billing_parent_id: 'p2' },
      });
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([assignment1, assignment2]);
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ invoice_prefix: 'INV' });
      let invoiceCount = 0;
      mockPrisma.invoice.create.mockImplementation(() => {
        invoiceCount++;
        return Promise.resolve({
          id: `inv-${invoiceCount}`,
          invoice_number: `INV-000${invoiceCount}`,
        });
      });

      const result = (await service.confirm(TENANT_ID, USER_ID, {
        fee_structure_ids: [FS_ID],
        year_group_ids: [YG_ID],
        billing_period_start: '2026-03-01',
        billing_period_end: '2026-03-31',
        due_date: '2026-04-01',
        excluded_household_ids: [],
      })) as { invoices_created: number; total_amount: number };

      expect(result.invoices_created).toBe(2);
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'fee_generation',
        null,
        'fee_generation_confirm',
        expect.objectContaining({
          households_affected: 2,
        }),
        null,
      );
    });
  });
});
