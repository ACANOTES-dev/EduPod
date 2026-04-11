/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { MOCK_FACADE_PROVIDERS, AuthReadFacade } from '../../common/tests/mock-facades';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { InvoicesService } from '../finance/invoices.service';
import { HouseholdNumberService } from '../households/household-number.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { RegistrationService } from './registration.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let mockPrisma: {
    user: { findUnique: jest.Mock };
  };
  let mockSequenceService: {
    nextNumber: jest.Mock;
  };
  let mockInvoicesService: {
    issue: jest.Mock;
  };
  let mockHouseholdNumberService: {
    generateUniqueForTenant: jest.Mock;
    generateStudentNumber: jest.Mock;
  };
  let mockAuthReadFacade: { findUserByEmail: jest.Mock };
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockSequenceService = {
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-202603-0001'),
      nextNumber: jest.fn().mockResolvedValue('INV-202603-0001'),
    };
    mockHouseholdNumberService = {
      generateUniqueForTenant: jest.fn().mockResolvedValue('ABC123'),
      generateStudentNumber: jest.fn().mockResolvedValue('ABC123-01'),
    };
    mockInvoicesService = {
      issue: jest.fn().mockResolvedValue({ status: 'issued' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        RegistrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: HouseholdNumberService, useValue: mockHouseholdNumberService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        {
          provide: AuthReadFacade,
          useValue: (mockAuthReadFacade = { findUserByEmail: jest.fn().mockResolvedValue(null) }),
        },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Result types for assertions ──────────────────────────────────────
  interface PreviewFee {
    annual_amount: number;
  }
  interface PreviewStudent {
    year_group_name: string;
    fees: PreviewFee[];
    subtotal: number;
  }
  interface PreviewResult {
    students: PreviewStudent[];
    available_discounts: { name: string }[];
    grand_total: number;
  }
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
      secondary_parent: undefined as
        | undefined
        | {
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
      consents: {
        health_data: false,
        whatsapp_channel: false,
        ai_features: {
          ai_grading: false,
          ai_comments: false,
          ai_risk_detection: false,
          ai_progress_summary: false,
        },
      },
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
        create: jest.fn().mockResolvedValueOnce({ id: 'p-1' }).mockResolvedValue({ id: 'p-2' }),
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
      consentRecord: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
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
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = (await service.previewFees(TENANT_ID, dto as never)) as PreviewResult;

      expect(result.students).toHaveLength(1);
      expect(result.students[0]!.year_group_name).toBe('Year 10');
      expect(result.students[0]!.fees).toHaveLength(1);
      expect(result.students[0]!.fees[0]!.annual_amount).toBe(3000); // 1000 * 3 terms
      expect(result.grand_total).toBe(3000);
    });

    it('should calculate annual amount for monthly billing frequency', async () => {
      const mockTx = {
        academicYear: {
          findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }),
        },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'fs-1',
              name: 'Lunch',
              amount: 100,
              billing_frequency: 'monthly',
              year_group_id: null,
              year_group: null,
              active: true,
            },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = (await service.previewFees(TENANT_ID, dto as never)) as PreviewResult;

      expect(result.students[0]!.fees[0]!.annual_amount).toBe(1200); // 100 * 12
    });

    it('should calculate annual amount for one_off billing frequency', async () => {
      const mockTx = {
        academicYear: {
          findFirst: jest.fn().mockResolvedValue({ id: 'ay-1', _count: { periods: 3 } }),
        },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'fs-1',
              name: 'Registration',
              amount: 500,
              billing_frequency: 'one_off',
              year_group_id: null,
              year_group: null,
              active: true,
            },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = (await service.previewFees(TENANT_ID, dto as never)) as PreviewResult;

      expect(result.students[0]!.fees[0]!.annual_amount).toBe(500);
    });

    it('should return available discounts', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
        feeStructure: { findMany: jest.fn().mockResolvedValue([]) },
        yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
        discount: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'd-1',
              name: 'Sibling Discount',
              discount_type: 'percent',
              value: 10,
              active: true,
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = (await service.previewFees(TENANT_ID, dto as never)) as PreviewResult;

      expect(result.available_discounts).toHaveLength(1);
      expect(result.available_discounts[0]!.name).toBe('Sibling Discount');
    });

    it('should default term count to 3 when no active academic year', async () => {
      const mockTx = {
        academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'fs-1',
              name: 'Tuition',
              amount: 500,
              billing_frequency: 'term',
              year_group_id: 'yg-1',
              year_group: { id: 'yg-1', name: 'Year 10' },
              active: true,
            },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 10' }]) },
        discount: { findMany: jest.fn().mockResolvedValue([]) },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const result = (await service.previewFees(TENANT_ID, dto as never)) as PreviewResult;

      // 500 * 3 (default term count)
      expect(result.students[0]!.fees[0]!.annual_amount).toBe(1500);
    });
  });

  describe('registerFamily()', () => {
    it('should create consent records from registration consent selections', async () => {
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, {
        ...buildMinimalDto(),
        consents: {
          health_data: true,
          whatsapp_channel: true,
          ai_features: {
            ai_grading: true,
            ai_comments: false,
            ai_risk_detection: false,
            ai_progress_summary: false,
          },
        },
      } as never);

      expect(mockTx.consentRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            subject_type: 'student',
            consent_type: 'health_data',
          }),
          expect.objectContaining({
            subject_type: 'student',
            consent_type: 'ai_grading',
          }),
        ]),
      });
      expect(mockTx.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject_type: 'parent',
          consent_type: 'whatsapp_channel',
        }),
      });
    });
  });

  // ── registerFamily ──────────────────────────────────────────────────

  describe('registerFamily()', () => {
    it('should create household, parent, student, and invoice', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      const result = (await service.registerFamily(
        TENANT_ID,
        USER_ID,
        dto as never,
      )) as RegistrationResult;

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

      const result = (await service.registerFamily(
        TENANT_ID,
        USER_ID,
        dto as never,
      )) as RegistrationResult;

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
      mockAuthReadFacade.findUserByEmail.mockResolvedValue({ id: 'user-existing' });
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockAuthReadFacade.findUserByEmail).toHaveBeenCalledWith(
        TENANT_ID,
        'john@example.com',
      );
    });

    it('should throw BadRequestException for invalid student_index in fee_assignments', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 99, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await expect(service.registerFamily(TENANT_ID, USER_ID, dto as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when tenant is not found', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      mockTx.tenant.findUnique.mockResolvedValue(null);
      setupMockTransaction(mockTx);

      await expect(service.registerFamily(TENANT_ID, USER_ID, dto as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should still return result when invoice issuing fails', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);
      mockInvoicesService.issue.mockRejectedValue(new Error('Approval needed'));

      const result = (await service.registerFamily(
        TENANT_ID,
        USER_ID,
        dto as never,
      )) as RegistrationResult;

      // Should fall back to draft status
      expect(result.invoice.status).toBe('draft');
    });

    it('should update invoice status when issuing succeeds', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);
      mockInvoicesService.issue.mockResolvedValue({ status: 'issued' });

      const result = (await service.registerFamily(
        TENANT_ID,
        USER_ID,
        dto as never,
      )) as RegistrationResult;

      expect(result.invoice.status).toBe('issued');
    });

    it('should apply fixed discount on fee assignment', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      dto.applied_discounts = [{ fee_assignment_index: 0, discount_id: 'd-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Tuition',
        amount: 3000,
        billing_frequency: 'one_off',
      });
      mockTx.discount.findFirst.mockResolvedValue({
        id: 'd-1',
        name: 'Sibling',
        discount_type: 'fixed',
        value: 500,
      });
      setupMockTransaction(mockTx);

      const result = (await service.registerFamily(
        TENANT_ID,
        USER_ID,
        dto as never,
      )) as RegistrationResult;

      // Invoice line should include discount line
      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discount_amount: 500,
          }),
        }),
      );
      expect(result.invoice).toBeDefined();
    });

    it('should apply percent discount on fee assignment', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      dto.applied_discounts = [{ fee_assignment_index: 0, discount_id: 'd-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Tuition',
        amount: 1000,
        billing_frequency: 'one_off',
      });
      mockTx.discount.findFirst.mockResolvedValue({
        id: 'd-1',
        name: '10% Off',
        discount_type: 'percent',
        value: 10,
      });
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discount_amount: 100, // 10% of 1000
          }),
        }),
      );
    });

    it('should handle adhoc_adjustments as negative invoice lines', async () => {
      const dto = buildMinimalDto();
      dto.adhoc_adjustments = [{ label: 'Early-bird discount', amount: 200 }];
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            discount_amount: 200,
            total_amount: -200,
          }),
        }),
      );
    });

    it('should throw BadRequestException when fee structure not found', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-nonexistent' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue(null);
      setupMockTransaction(mockTx);

      await expect(service.registerFamily(TENANT_ID, USER_ID, dto as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should calculate term billing frequency in invoice lines', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Tuition',
        amount: 1000,
        billing_frequency: 'term',
      });
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      // 1000 * 3 terms = 3000
      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 3000,
          }),
        }),
      );
    });

    it('should calculate monthly billing frequency in invoice lines', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Transport',
        amount: 100,
        billing_frequency: 'monthly',
      });
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      // 100 * 12 months = 1200
      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 1200,
          }),
        }),
      );
    });

    it('should use default invoice prefix INV when no branding', async () => {
      const dto = buildMinimalDto();
      const mockTx = buildMockTx();
      mockTx.tenantBranding.findUnique.mockResolvedValue(null);
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });

    it('should link secondary parent user_id when email matches existing user', async () => {
      const dto = buildMinimalDto();
      dto.secondary_parent = {
        first_name: 'Mary',
        last_name: 'Smith',
        phone: '+353111222',
        email: 'mary@example.com',
        relationship_label: 'Mother',
      };
      mockAuthReadFacade.findUserByEmail
        .mockResolvedValueOnce(null) // primary
        .mockResolvedValueOnce({ id: 'user-secondary' }); // secondary
      const mockTx = buildMockTx();
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockAuthReadFacade.findUserByEmail).toHaveBeenCalledWith(
        TENANT_ID,
        'mary@example.com',
      );
      expect(mockTx.parent.create).toHaveBeenCalledTimes(2);
    });

    it('should handle custom billing frequency as base amount', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Custom Fee',
        amount: 750,
        billing_frequency: 'custom',
      });
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 750,
          }),
        }),
      );
    });

    it('should handle default (unknown) billing frequency as base amount', async () => {
      const dto = buildMinimalDto();
      dto.fee_assignments = [{ student_index: 0, fee_structure_id: 'fs-1' }];
      const mockTx = buildMockTx();
      mockTx.feeStructure.findFirst.mockResolvedValue({
        id: 'fs-1',
        name: 'Misc Fee',
        amount: 250,
        billing_frequency: 'unknown_type',
      });
      setupMockTransaction(mockTx);

      await service.registerFamily(TENANT_ID, USER_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 250,
          }),
        }),
      );
    });
  });

  // ── addStudentToHousehold ─────────────────────────────────────────────

  describe('addStudentToHousehold()', () => {
    const HOUSEHOLD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    function buildAddStudentDto() {
      return {
        first_name: 'Alex',
        last_name: 'Smith',
        middle_name: undefined as string | undefined,
        date_of_birth: '2016-05-15',
        gender: 'male',
        year_group_id: 'yg-2',
        national_id: '67890',
        nationality: undefined as string | undefined,
        city_of_birth: undefined as string | undefined,
      };
    }

    function buildAddStudentMockTx() {
      return {
        household: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: HOUSEHOLD_ID, household_name: 'Smith Family' }),
        },
        householdParent: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ parent_id: 'p-1', role_label: 'Father', parent: { id: 'p-1' } }]),
        },
        student: {
          create: jest.fn().mockResolvedValue({ id: 'stu-new' }),
        },
        studentParent: {
          create: jest.fn().mockResolvedValue({}),
        },
        feeStructure: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        householdFeeAssignment: {
          create: jest.fn().mockResolvedValue({ id: 'fa-new' }),
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
        invoice: {
          create: jest.fn().mockResolvedValue({
            id: 'inv-new',
            invoice_number: 'INV-202603-0002',
            total_amount: 0,
            balance_amount: 0,
            status: 'draft',
          }),
        },
      };
    }

    beforeEach(() => {
      mockHouseholdNumberService.generateStudentNumber = jest.fn().mockResolvedValue('ABC123-02');
      mockSequenceService.nextNumber = jest.fn().mockResolvedValue('INV-202603-0002');
    });

    it('should add a student to an existing household', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = (await service.addStudentToHousehold(
        TENANT_ID,
        USER_ID,
        HOUSEHOLD_ID,
        dto as never,
      )) as {
        student: { first_name: string; student_number: string };
        invoice: { status: string };
      };

      expect(result.student.first_name).toBe('Alex');
      expect(result.student.student_number).toBe('ABC123-02');
      expect(mockTx.student.create).toHaveBeenCalledTimes(1);
      expect(mockTx.studentParent.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when household not found', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.household.findFirst.mockResolvedValue(null);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await expect(
        service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when household has no parents', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.householdParent.findMany.mockResolvedValue([]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await expect(
        service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('should derive last_name from household_name when not provided', async () => {
      const dto = buildAddStudentDto();
      dto.last_name = '';
      const mockTx = buildAddStudentMockTx();
      mockTx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'The Johnson Family',
      });
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            last_name: 'Johnson',
          }),
        }),
      );
    });

    it('should throw NotFoundException when tenant not found during add student', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.tenant.findUnique.mockResolvedValue(null);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await expect(
        service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('should auto-assign fees for the student year group', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.feeStructure.findMany.mockResolvedValue([
        { id: 'fs-1', name: 'Tuition', amount: 1000, billing_frequency: 'term' },
        { id: 'fs-2', name: 'Lunch', amount: 100, billing_frequency: 'monthly' },
      ]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      expect(mockTx.householdFeeAssignment.create).toHaveBeenCalledTimes(2);
    });

    it('should use default INV prefix when no branding', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.tenantBranding.findUnique.mockResolvedValue(null);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'invoice',
        expect.anything(),
        'INV',
      );
    });

    it('should still return result when invoice issuing fails for addStudent', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });
      mockInvoicesService.issue.mockRejectedValue(new Error('Approval required'));

      const result = (await service.addStudentToHousehold(
        TENANT_ID,
        USER_ID,
        HOUSEHOLD_ID,
        dto as never,
      )) as {
        invoice: { status: string };
      };

      expect(result.invoice.status).toBe('draft');
    });

    it('should calculate term and monthly billing in invoice lines', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.feeStructure.findMany.mockResolvedValue([
        { id: 'fs-1', name: 'Tuition', amount: 1000, billing_frequency: 'term' },
        { id: 'fs-2', name: 'Lunch', amount: 100, billing_frequency: 'monthly' },
      ]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      // Tuition: 1000 * 3 terms = 3000, Lunch: 100 * 12 = 1200 => subtotal = 4200
      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 4200,
            total_amount: 4200,
          }),
        }),
      );
    });

    it('should handle one_off and custom billing frequency in addStudent', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.feeStructure.findMany.mockResolvedValue([
        { id: 'fs-1', name: 'Registration', amount: 500, billing_frequency: 'one_off' },
        { id: 'fs-2', name: 'Custom', amount: 300, billing_frequency: 'custom' },
      ]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 800,
            total_amount: 800,
          }),
        }),
      );
    });

    it('should handle default (unknown) billing frequency in addStudent', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.feeStructure.findMany.mockResolvedValue([
        { id: 'fs-1', name: 'Misc', amount: 150, billing_frequency: 'weekly' },
      ]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 150,
          }),
        }),
      );
    });

    it('should default term count to 3 when no active academic year in addStudent', async () => {
      const dto = buildAddStudentDto();
      const mockTx = buildAddStudentMockTx();
      mockTx.academicYear.findFirst.mockResolvedValue(null);
      mockTx.feeStructure.findMany.mockResolvedValue([
        { id: 'fs-1', name: 'Tuition', amount: 500, billing_frequency: 'term' },
      ]);
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.addStudentToHousehold(TENANT_ID, USER_ID, HOUSEHOLD_ID, dto as never);

      // 500 * 3 (default) = 1500
      expect(mockTx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal_amount: 1500,
          }),
        }),
      );
    });
  });
});
