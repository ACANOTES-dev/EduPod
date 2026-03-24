/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { InvoicesService } from '../finance/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { RegistrationService } from './registration.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let mockPrisma: {
    user: { findUnique: jest.Mock };
  };
  let mockSequenceService: {
    generateHouseholdReference: jest.Mock;
    nextNumber: jest.Mock;
  };
  let mockInvoicesService: {
    issue: jest.Mock;
  };
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockSequenceService = {
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-202603-0001'),
      nextNumber: jest.fn()
        .mockResolvedValueOnce('STU-202603-0001')
        .mockResolvedValueOnce('INV-202603-0001'),
    };
    mockInvoicesService = {
      issue: jest.fn().mockResolvedValue({ status: 'issued' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: InvoicesService, useValue: mockInvoicesService },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Result types for assertions ──────────────────────────────────────
  interface PreviewFee { annual_amount: number }
  interface PreviewStudent { year_group_name: string; fees: PreviewFee[]; subtotal: number }
  interface PreviewResult { students: PreviewStudent[]; available_discounts: { name: string }[]; grand_total: number }
  interface RegistrationResult {
    household: { household_name: string };
    parents: unknown[];
    students: unknown[];
    invoice: { status: string };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  function buildMinimalDto() {
    return {
      household: { household_name: 'Smith Family' },
      primary_parent: {
        first_name: 'John',
        last_name: 'Smith',
        phone: '+353123456',
        relationship_label: 'Father',
      },
      secondary_parent: undefined as undefined | {
        first_name: string;
        last_name: string;
        phone?: string;
        email?: string;
        relationship_label: string;
      },
      students: [
        {
          first_name: 'Jane',
          last_name: 'Smith',
          middle_name: undefined as string | undefined,
          date_of_birth: '2015-01-01',
          gender: 'female',
          year_group_id: 'yg-1',
          national_id: '12345',
        },
      ],
      emergency_contacts: [
        { contact_name: 'Bob Smith', phone: '+353654321', relationship_label: 'Uncle' },
      ],
      fee_assignments: [] as Array<{ student_index: number; fee_structure_id: string }>,
      applied_discounts: [] as Array<{ fee_assignment_index: number; discount_id: string }>,
      adhoc_adjustments: [] as Array<{ label: string; amount: number }>,
    };
  }

  function buildMockTx() {
    return {
      household: {
        create: jest.fn().mockResolvedValue({ id: 'hh-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      householdEmergencyContact: {
        create: jest.fn().mockResolvedValue({}),
      },
      parent: {
        create: jest.fn()
          .mockResolvedValueOnce({ id: 'p-1' })
          .mockResolvedValue({ id: 'p-2' }),
      },
      householdParent: {
        create: jest.fn().mockResolvedValue({}),
      },
      student: {
        create: jest.fn().mockResolvedValue({ id: 'stu-1' }),
      },
      studentParent: {
        create: jest.fn().mockResolvedValue({}),
      },
      householdFeeAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'fa-1' }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: TENANT_ID, currency_code: 'EUR' }),
      },
      tenantBranding: {
        findUnique: jest.fn().mockResolvedValue({ invoice_prefix: 'INV' }),
      },
      academicYear: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }),
      },
      feeStructure: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      discount: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      yearGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]),
      },
      invoice: {
        create: jest.fn().mockResolvedValue({
          id: 'inv-1',
          invoice_number: 'INV-202603-0001',
          total_amount: 0,
          balance_amount: 0,
          status: 'draft',
          household: { id: 'hh-1', household_name: 'Smith Family' },
          lines: [],
        }),
      },
    };
  }

  function setupMockTransaction(mockTx: ReturnType<typeof buildMockTx>) {
    mockCreateRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(
        (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
      ),
    });
  }

  // ── previewFees ──────────────────────────────────────────────────────

  describe('previewFees()', () => {
    it('should return fee preview with student data and grand total', async () => {
      const mockTx = {
        academicYear: {
          findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }),
        },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'fs-1',
              name: 'Tuition',
              amount: 1000,
              billing_frequency: 'term',
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 10' },
              active: true,
            },
          ]),
        },
        yearGroup: {
          findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]),
        },
        discount: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(
          (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
        ),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = await service.previewFees(TENANT_ID, dto as never) as PreviewResult;

      expect(result.students).toHaveLength(1);
      expect(result.students[0]!.year_group_name).toBe('Year 10');
      expect(result.students[0]!.fees).toHaveLength(1);
      expect(result.students[0]!.fees[0]!.annual_amount).toBe(3000); // 1000 * 3 terms
      expect(result.grand_total).toBe(3000);
    });

    it('should calculate annual amount for monthly billing frequency', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }) },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'fs-1', name: 'Lunch', amount: 100, billing_frequency: 'monthly', year_group_id: null, year_group: null, active: true },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = await service.previewFees(TENANT_ID, dto as never) as PreviewResult;

      expect(result.students[0]!.fees[0]!.annual_amount).toBe(1200); // 100 * 12
    });

    it('should calculate annual amount for one_off billing frequency', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }) },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'fs-1', name: 'Registration', amount: 500, billing_frequency: 'one_off', year_group_id: null, year_group: null, active: true },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = await service.previewFees(TENANT_ID, dto as never) as PreviewResult;

      expect(result.students[0]!.fees[0]!.annual_amount).toBe(500);
    });

    it('should return available discounts', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
        feeStructure: { findMany: jest.fn().mockResolvedValue([]) },
        yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
        discount: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'd-1', name: 'Sibling Discount', discount_type: 'percent', value: 10, active: true },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = await service.previewFees(TENANT_ID, dto as never) as PreviewResult;

      expect(result.available_discounts).toHaveLength(1);
      expect(result.available_discounts[0]!.name).toBe('Sibling Discount');
    });

    it('should default term count to 3 when no active academic year', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'fs-1', name: 'Tuition', amount: 500, billing_frequency: 'term', year_group_id: 'yg-1', year_group: { id: 'yg-1', name: 'Year 10' }, active: true },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = await service.previewFees(TENANT_ID, dto as never) as PreviewResult;

      // 500 * 3 (default term count)
      expect(result.students[0]!.fees[0]!.annual_amount).toBe(1500);
    });
  });

  // ── registerFamily ──────────────────────────────────────────────────

  describe('registerFamily()', () => {
    it('should create household, parent, student, and invoice', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      const result = await service.registerFamily(TENANT_ID, USER_ID, dto as never) as RegistrationResult;

      expect(mockTx.household.create).toHaveBeenCalledTimes(1);
      expect(mockTx.parent.create).toHaveBeenCalledTimes(1);
      expect(mockTx.student.create).toHaveBeenCalledTimes(1);
      expect(mockTx.invoice.create).toHaveBeenCalledTimes(1);
      expect(result.household.household_name).toBe('Smith Family');
      expect(result.parents).toHaveLength(1);
      expect(result.students).toHaveLength(1);
    });

    it('should create emergency contacts', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockTx.householdEmergencyContact.create).toHaveBeenCalledTimes(1);
      expect(mockTx.householdEmergencyContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contact_name: 'Bob Smith',
          phone: '+353654321',
        }),
      });
    });

    it('should create secondary parent when provided', async () => {
      const dto = buildMinimalDto();
      dto.secondary_parent = {
        first_name: 'Mary',
        last_name: 'Smith',
        phone: '+353111222',
        relationship_label: 'Mother',
      };
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      const result = await service.registerFamily(TENANT_ID, USER_ID, dto as never) as RegistrationResult;

      // primary + secondary
      expect(mockTx.parent.create).toHaveBeenCalledTimes(2);
      expect(result.parents).toHaveLength(2);
    });

    it('should link parent user_id when user with matching email exists', async () => {
      const dto = buildMinimalDto();
      dto.primary_parent = {
        ...dto.primary_parent,
        email: 'john@example.com',
      } as typeof dto.primary_parent & { email: string };
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-existing' });
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
        select: { id: true },
      });
    });

    it('should throw BadRequestException for invalid student_index in fee_assignments', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 99, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await expect(service.registerFamily(TENANT_ID, USER_ID, dto as never))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tenant is not found', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      mockTx.tenant.findUnique.mockResolvedValue(null);
      setupMockTransaction(mockTx);

      await expect(service.registerFamily(TENANT_ID, USER_ID, dto as never))
        .rejects.toThrow(NotFoundException);
    });

    it('should still return result when invoice issuing fails', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);
      mockInvoicesService.issue.mockRejectedValue(new Error('Approval needed'));

      const result = await service.registerFamily(TENANT_ID, USER_ID, dto as never) as RegistrationResult;

      // Should fall back to draft status
      expect(result.invoice.status).toBe('draft');
    });

    it('should update invoice status when issuing succeeds', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);
      mockInvoicesService.issue.mockResolvedValue({ status: 'issued' });

      const result = await service.registerFamily(TENANT_ID, USER_ID, dto as never) as RegistrationResult;

      expect(result.invoice.status).toBe('issued');
    });
  });
});
