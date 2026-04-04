/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../common/middleware/rls.middleware');
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed'),
}));

import { Test, TestingModule } from '@nestjs/testing';

import type { ImportType } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { ImportExecutorService } from './import-executor.service';
import { ImportParserService } from './import-parser.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOUSEHOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STAFF_PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const ROLE_ID = '22222222-2222-2222-2222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-3333-3333-333333333333';
const FEE_STRUCTURE_ID = '44444444-4444-4444-4444-444444444444';
const SUBJECT_ID = '55555555-5555-5555-5555-555555555555';
const ASSESSMENT_ID = '66666666-6666-6666-6666-666666666666';
const YEAR_GROUP_ID = '77777777-7777-7777-7777-777777777777';

// ─── Mock model types ─────────────────────────────────────────────────────────

interface MockPrismaModel {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  count: jest.Mock;
}

function buildMockModel(overrides?: Partial<MockPrismaModel>): MockPrismaModel {
  return {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    ...overrides,
  };
}

interface MockTx {
  importJobRecord: MockPrismaModel;
  household: MockPrismaModel;
  parent: MockPrismaModel;
  householdParent: MockPrismaModel;
  student: MockPrismaModel;
  yearGroup: MockPrismaModel;
  staffProfile: MockPrismaModel;
  user: MockPrismaModel;
  tenantMembership: MockPrismaModel;
  membershipRole: MockPrismaModel;
  role: MockPrismaModel;
  feeStructure: MockPrismaModel;
  householdFeeAssignment: MockPrismaModel;
  subject: MockPrismaModel;
  assessment: MockPrismaModel;
  grade: MockPrismaModel;
  staffCompensation: MockPrismaModel;
}

function buildMockTx(): MockTx {
  return {
    importJobRecord: buildMockModel(),
    household: buildMockModel(),
    parent: buildMockModel(),
    householdParent: buildMockModel(),
    student: buildMockModel(),
    yearGroup: buildMockModel({ findMany: jest.fn().mockResolvedValue([]) }),
    staffProfile: buildMockModel(),
    user: buildMockModel(),
    tenantMembership: buildMockModel(),
    membershipRole: buildMockModel(),
    role: buildMockModel(),
    feeStructure: buildMockModel(),
    householdFeeAssignment: buildMockModel(),
    subject: buildMockModel(),
    assessment: buildMockModel(),
    grade: buildMockModel(),
    staffCompensation: buildMockModel(),
  };
}

interface MockRlsClient {
  $transaction: jest.Mock;
}

function buildMockRlsClient(tx: MockTx): MockRlsClient {
  return {
    $transaction: jest.fn().mockImplementation(async (cb: (t: MockTx) => Promise<unknown>) => {
      return cb(tx);
    }),
  };
}

interface MockSequenceService {
  generateHouseholdReference: jest.Mock;
  nextNumber: jest.Mock;
}

interface MockEncryptionService {
  encrypt: jest.Mock;
  decrypt: jest.Mock;
}

interface MockParserService {
  parseFlexibleDate: jest.Mock;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImportExecutorService', () => {
  let service: ImportExecutorService;
  let mockTx: MockTx;
  let mockRlsClient: MockRlsClient;
  let mockSequenceService: MockSequenceService;
  let mockEncryptionService: MockEncryptionService;
  let mockParser: MockParserService;

  beforeEach(async () => {
    mockTx = buildMockTx();
    mockRlsClient = buildMockRlsClient(mockTx);

    (createRlsClient as jest.Mock).mockReturnValue(mockRlsClient);

    mockSequenceService = {
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-202601-001'),
      nextNumber: jest.fn().mockResolvedValue('STU-202601-001'),
    };

    mockEncryptionService = {
      encrypt: jest.fn().mockReturnValue({ encrypted: 'enc-data', keyRef: 'key-v1' }),
      decrypt: jest.fn().mockReturnValue('decrypted-data'),
    };

    mockParser = {
      parseFlexibleDate: jest.fn().mockReturnValue(new Date('2010-06-15')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportExecutorService,
        { provide: PrismaService, useValue: {} },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ImportParserService, useValue: mockParser },
      ],
    }).compile();

    service = module.get<ImportExecutorService>(ImportExecutorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── trackRecord ──────────────────────────────────────────────────────────

  describe('ImportExecutorService — trackRecord', () => {
    it('should create an importJobRecord entry', async () => {
      await service.trackRecord(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        JOB_ID,
        'student',
        STUDENT_ID,
      );

      expect(mockTx.importJobRecord.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          import_job_id: JOB_ID,
          record_type: 'student',
          record_id: STUDENT_ID,
        },
      });
    });
  });

  // ─── processRow routing ───────────────────────────────────────────────────

  describe('ImportExecutorService — processRow', () => {
    it('should throw when import type is students', async () => {
      await expect(
        service.processRow(mockTx as unknown as PrismaService, TENANT_ID, 'students', {}, USER_ID),
      ).rejects.toThrow('Student rows should be processed via processStudentRows');
    });

    it('should throw for unknown import type', async () => {
      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'unknown_type' as ImportType,
          {},
          USER_ID,
        ),
      ).rejects.toThrow('Unknown import type: unknown_type');
    });

    it('should route parents type to parent DB operations', async () => {
      // Set up mocks for processParentRow path
      mockTx.household.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });

      const row = {
        first_name: 'Ahmed',
        last_name: 'Al-Sayed',
        email: 'ahmed@test.com',
        household_name: 'Al-Sayed Family',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'parents',
        row,
        USER_ID,
      );

      // Verify parent DB models were used (not staff, not fee, etc.)
      expect(mockTx.parent.create).toHaveBeenCalledTimes(1);
      expect(mockTx.household.findFirst).toHaveBeenCalled();
      expect(mockTx.staffProfile.create).not.toHaveBeenCalled();
      expect(mockTx.feeStructure.findFirst).not.toHaveBeenCalled();
    });

    it('should route staff type to user and staff profile DB operations', async () => {
      // Set up mocks for processStaffRow path
      mockTx.staffProfile.findFirst.mockResolvedValue(null); // no collision
      mockTx.user.findUnique.mockResolvedValue(null); // new user
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue(null); // no role
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      const row = {
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah@school.com',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        row,
        USER_ID,
      );

      expect(mockTx.user.create).toHaveBeenCalledTimes(1);
      expect(mockTx.staffProfile.create).toHaveBeenCalledTimes(1);
      expect(mockTx.parent.create).not.toHaveBeenCalled();
    });

    it('should route fees type to fee structure lookup and assignment', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID });
      mockTx.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

      const row = {
        fee_structure_name: 'Tuition Fee',
        household_name: 'Smith Family',
      };

      await service.processRow(mockTx as unknown as PrismaService, TENANT_ID, 'fees', row, USER_ID);

      expect(mockTx.feeStructure.findFirst).toHaveBeenCalled();
      expect(mockTx.householdFeeAssignment.create).toHaveBeenCalled();
    });

    it('should route exam_results type to grade creation', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      const row = {
        student_number: 'STU-001',
        subject: 'Mathematics',
        score: '85',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        row,
        USER_ID,
      );

      expect(mockTx.student.findFirst).toHaveBeenCalled();
      expect(mockTx.subject.findFirst).toHaveBeenCalled();
      expect(mockTx.grade.create).toHaveBeenCalledTimes(1);
      expect(mockTx.staffCompensation.create).not.toHaveBeenCalled();
    });

    it('should route staff_compensation type to compensation creation', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-1' });

      const row = {
        staff_number: 'ABC1234-5',
        compensation_type: 'salaried',
        base_salary: '50000',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffProfile.findFirst).toHaveBeenCalled();
      expect(mockTx.staffCompensation.create).toHaveBeenCalledTimes(1);
      expect(mockTx.grade.create).not.toHaveBeenCalled();
    });
  });

  // ─── processParentRow ─────────────────────────────────────────────────────

  describe('ImportExecutorService — processParentRow', () => {
    it('should create household and parent with junction when household_name provided', async () => {
      mockTx.household.findFirst.mockResolvedValue(null); // No existing household
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });

      const row = {
        first_name: 'Ahmed',
        last_name: 'Al-Sayed',
        email: 'ahmed@example.com',
        phone: '+1234567890',
        relationship: 'father',
        household_name: 'Al-Sayed Family',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'parents',
        row,
        USER_ID,
      );

      // Searched for existing household by name
      expect(mockTx.household.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          household_name: 'Al-Sayed Family',
        },
      });

      // Created new household
      expect(mockTx.household.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          household_name: 'Al-Sayed Family',
          needs_completion: true,
        },
      });

      // Created parent with correct fields
      expect(mockTx.parent.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          first_name: 'Ahmed',
          last_name: 'Al-Sayed',
          email: 'ahmed@example.com',
          phone: '+1234567890',
          relationship_label: 'father',
          preferred_contact_channels: ['email'],
        },
      });

      // Created junction record
      expect(mockTx.householdParent.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_ID,
        },
      });
    });

    it('should reuse existing household if found by name', async () => {
      mockTx.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });

      const row = {
        first_name: 'Sara',
        last_name: 'Al-Sayed',
        household_name: 'Al-Sayed Family',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'parents',
        row,
        USER_ID,
      );

      // Should NOT create a new household
      expect(mockTx.household.create).not.toHaveBeenCalled();

      // Should still create parent and junction
      expect(mockTx.parent.create).toHaveBeenCalledTimes(1);
      expect(mockTx.householdParent.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_ID,
        },
      });
    });

    it('should create parent without household junction when no household_name', async () => {
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });

      const row = {
        first_name: 'Omar',
        last_name: 'Hassan',
        email: 'omar@test.com',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'parents',
        row,
        USER_ID,
      );

      expect(mockTx.parent.create).toHaveBeenCalledTimes(1);
      expect(mockTx.household.findFirst).not.toHaveBeenCalled();
      expect(mockTx.household.create).not.toHaveBeenCalled();
      expect(mockTx.householdParent.create).not.toHaveBeenCalled();
    });

    it('should set empty fields to null in parent record', async () => {
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });

      const row = {
        first_name: 'Fatima',
        last_name: 'Ali',
        email: '',
        phone: '',
        relationship: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'parents',
        row,
        USER_ID,
      );

      expect(mockTx.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          phone: null,
          relationship_label: null,
        }),
      });
    });
  });

  // ─── processStaffRow ──────────────────────────────────────────────────────

  describe('ImportExecutorService — processStaffRow', () => {
    const baseStaffRow: Record<string, string> = {
      first_name: 'Sarah',
      last_name: 'Johnson',
      email: 'Sarah.Johnson@school.com',
      phone: '+441234567890',
      role: 'Teacher',
      job_title: 'Head of Maths',
      department: 'Mathematics',
      employment_type: 'full_time',
      employment_status: 'active',
      bank_name: '',
      bank_account_number: '',
      bank_iban: '',
    };

    function setupStaffMocks(): void {
      mockTx.staffProfile.findFirst.mockResolvedValue(null); // no collision
      mockTx.user.findUnique.mockResolvedValue(null); // new user
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue({ id: ROLE_ID });
      mockTx.membershipRole.findFirst.mockResolvedValue(null); // role not yet assigned
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });
    }

    it('should create user, membership, role assignment, and staff profile on happy path', async () => {
      setupStaffMocks();

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      // Created user with correct email (lowercased/trimmed)
      expect(mockTx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'Sarah',
          last_name: 'Johnson',
          email: 'sarah.johnson@school.com',
          phone: '+441234567890',
          global_status: 'active',
        }),
      });

      // Created tenant membership
      expect(mockTx.tenantMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          membership_status: 'active',
        }),
      });

      // Assigned role
      expect(mockTx.membershipRole.create).toHaveBeenCalledWith({
        data: {
          membership_id: MEMBERSHIP_ID,
          role_id: ROLE_ID,
          tenant_id: TENANT_ID,
        },
      });

      // Created staff profile
      expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          job_title: 'Head of Maths',
          department: 'Mathematics',
          employment_type: 'full_time',
          employment_status: 'active',
        }),
      });
    });

    it('should call EncryptionService.encrypt for bank account number and IBAN', async () => {
      setupStaffMocks();

      const row = {
        ...baseStaffRow,
        bank_name: 'ABC Bank',
        bank_account_number: '12345678',
        bank_iban: 'GB29NWBK60161331926819',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        row,
        USER_ID,
      );

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('12345678');
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('GB29NWBK60161331926819');
      expect(mockEncryptionService.encrypt).toHaveBeenCalledTimes(2);

      expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bank_name: 'ABC Bank',
          bank_account_number_encrypted: 'enc-data',
          bank_iban_encrypted: 'enc-data',
          bank_encryption_key_ref: 'key-v1',
        }),
      });
    });

    it('should not encrypt when bank fields are empty', async () => {
      setupStaffMocks();

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();

      expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bank_account_number_encrypted: null,
          bank_iban_encrypted: null,
          bank_encryption_key_ref: null,
        }),
      });
    });

    it('should retry staff number generation on collision', async () => {
      // First findFirst call returns existing (collision), second returns null
      mockTx.staffProfile.findFirst
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue(null);
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      // Should have checked staff_number uniqueness at least twice (collision + retry)
      expect(mockTx.staffProfile.findFirst).toHaveBeenCalledTimes(2);
      expect(mockTx.staffProfile.create).toHaveBeenCalledTimes(1);
    });

    it('should resolve employment type for various input formats', async () => {
      setupStaffMocks();

      const testCases: Array<{ input: string; expected: string }> = [
        { input: 'part_time', expected: 'part_time' },
        { input: 'part-time', expected: 'part_time' },
        { input: 'part time', expected: 'part_time' },
        { input: 'contract', expected: 'contract' },
        { input: 'contractor', expected: 'contract' },
        { input: 'substitute', expected: 'substitute' },
        { input: 'full_time', expected: 'full_time' },
        { input: '', expected: 'full_time' },
        { input: 'anything_else', expected: 'full_time' },
      ];

      for (const { input, expected } of testCases) {
        jest.clearAllMocks();
        setupStaffMocks();

        await service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'staff',
          { ...baseStaffRow, employment_type: input },
          USER_ID,
        );

        expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ employment_type: expected }),
        });
      }
    });

    it('should find existing user by email and skip user creation', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue({ id: 'existing-user-id' });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue(null);
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      expect(mockTx.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'sarah.johnson@school.com' },
        select: { id: true },
      });
      expect(mockTx.user.create).not.toHaveBeenCalled();
      expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ user_id: 'existing-user-id' }),
      });
    });

    it('should skip role assignment when role name not found', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue(null); // Role not found
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      expect(mockTx.membershipRole.create).not.toHaveBeenCalled();
    });

    it('should skip role assignment when role is already assigned', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue(null);
      mockTx.tenantMembership.create.mockResolvedValue({ id: MEMBERSHIP_ID });
      mockTx.role.findFirst.mockResolvedValue({ id: ROLE_ID });
      mockTx.membershipRole.findFirst.mockResolvedValue({ membership_id: MEMBERSHIP_ID }); // already assigned
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      expect(mockTx.membershipRole.create).not.toHaveBeenCalled();
    });

    it('should reuse existing membership if found', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue(null);
      mockTx.user.findUnique.mockResolvedValue(null);
      mockTx.user.create.mockResolvedValue({ id: USER_ID });
      mockTx.tenantMembership.findUnique.mockResolvedValue({ id: 'existing-membership' });
      mockTx.role.findFirst.mockResolvedValue(null);
      mockTx.staffProfile.create.mockResolvedValue({ id: STAFF_PROFILE_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow },
        USER_ID,
      );

      expect(mockTx.tenantMembership.create).not.toHaveBeenCalled();
    });

    it('should set employment_status to inactive when row says inactive', async () => {
      setupStaffMocks();

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff',
        { ...baseStaffRow, employment_status: 'inactive' },
        USER_ID,
      );

      expect(mockTx.staffProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ employment_status: 'inactive' }),
      });
    });
  });

  // ─── processExamResultRow ─────────────────────────────────────────────────

  describe('ImportExecutorService — processExamResultRow', () => {
    const baseExamRow: Record<string, string> = {
      student_number: 'STU-001',
      subject: 'Mathematics',
      assessment_name: 'Final Exam',
      score: '92',
      grade: 'A',
    };

    it('should find student, subject, assessment by title, and create grade', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        { ...baseExamRow },
        USER_ID,
      );

      // Looked up student by student_number
      expect(mockTx.student.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          student_number: 'STU-001',
        },
      });

      // Looked up subject by name
      expect(mockTx.subject.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          name: 'Mathematics',
        },
      });

      // Looked up assessment by title first
      expect(mockTx.assessment.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          subject_id: SUBJECT_ID,
          title: 'Final Exam',
        },
      });

      // Created grade
      expect(mockTx.grade.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          assessment_id: ASSESSMENT_ID,
          student_id: STUDENT_ID,
          raw_score: 92,
          comment: 'Grade: A',
          entered_by_user_id: USER_ID,
          entered_at: expect.any(Date),
        },
      });
    });

    it('should throw if student not found', async () => {
      mockTx.student.findFirst.mockResolvedValue(null);

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'exam_results',
          { ...baseExamRow },
          USER_ID,
        ),
      ).rejects.toThrow('Student with number "STU-001" not found');
    });

    it('should throw if subject not found', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue(null);

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'exam_results',
          { ...baseExamRow },
          USER_ID,
        ),
      ).rejects.toThrow('Subject "Mathematics" not found');
    });

    it('should throw if no assessment found for subject', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue(null); // neither by title nor latest

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'exam_results',
          { ...baseExamRow },
          USER_ID,
        ),
      ).rejects.toThrow('No assessment found for subject "Mathematics"');
    });

    it('should fall back to latest open/closed assessment when no title match', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      // First call (by title) returns null, second call (latest) returns assessment
      mockTx.assessment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        { ...baseExamRow, assessment_name: 'Non-Existent Exam' },
        USER_ID,
      );

      // Second call should search for latest open/closed assessment
      expect(mockTx.assessment.findFirst).toHaveBeenCalledTimes(2);
      expect(mockTx.assessment.findFirst).toHaveBeenLastCalledWith({
        where: {
          tenant_id: TENANT_ID,
          subject_id: SUBJECT_ID,
          status: { in: ['open', 'closed'] },
        },
        orderBy: { created_at: 'desc' },
      });

      expect(mockTx.grade.create).toHaveBeenCalledTimes(1);
    });

    it('should use latest assessment when no assessment_name provided', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      const row = { ...baseExamRow, assessment_name: '' };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        row,
        USER_ID,
      );

      // When assessment_name is empty, it goes straight to the latest lookup
      expect(mockTx.assessment.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          subject_id: SUBJECT_ID,
          status: { in: ['open', 'closed'] },
        },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should set comment to null when grade is empty', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      const row = { ...baseExamRow, grade: '' };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        row,
        USER_ID,
      );

      expect(mockTx.grade.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ comment: null }),
      });
    });

    it('should accept subject_name as legacy column alias', async () => {
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockTx.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockTx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockTx.grade.create.mockResolvedValue({ id: 'grade-1' });

      const row: Record<string, string> = {
        student_number: 'STU-001',
        subject_name: 'Science',
        score: '78',
        grade: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'exam_results',
        row,
        USER_ID,
      );

      expect(mockTx.subject.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          name: 'Science',
        },
      });
    });
  });

  // ─── processStaffCompensationRow ──────────────────────────────────────────

  describe('ImportExecutorService — processStaffCompensationRow', () => {
    it('should create salaried compensation with base_salary field', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-1' });

      const row: Record<string, string> = {
        staff_number: 'ABC1234-5',
        compensation_type: 'salaried',
        base_salary: '60000',
        per_class_rate: '',
        amount: '',
        effective_from: '2025-09-01',
        effective_to: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffProfile.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          staff_number: 'ABC1234-5',
        },
      });

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          base_salary: 60000,
          per_class_rate: null,
          effective_from: new Date('2025-09-01'),
          effective_to: null,
          created_by_user_id: USER_ID,
        },
      });
    });

    it('should create per_class compensation with per_class_rate field', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-2' });

      const row: Record<string, string> = {
        staff_number: 'XYZ9999-0',
        compensation_type: 'per_class',
        base_salary: '',
        per_class_rate: '150',
        amount: '',
        effective_from: '',
        effective_to: '2026-06-30',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 150,
          effective_to: new Date('2026-06-30'),
        }),
      });
    });

    it('should use amount field as fallback for salaried when base_salary absent', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-3' });

      const row: Record<string, string> = {
        staff_number: 'ABC1234-5',
        compensation_type: 'salaried',
        amount: '45000',
        effective_from: '',
        effective_to: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          base_salary: 45000,
          per_class_rate: null,
        }),
      });
    });

    it('should use amount field as fallback for per_class when per_class_rate absent', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-4' });

      const row: Record<string, string> = {
        staff_number: 'ABC1234-5',
        compensation_type: 'per_class',
        amount: '200',
        effective_from: '',
        effective_to: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          base_salary: null,
          per_class_rate: 200,
        }),
      });
    });

    it('should throw if staff profile not found', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue(null);

      const row: Record<string, string> = {
        staff_number: 'NONEXIST-0',
        compensation_type: 'salaried',
        base_salary: '50000',
      };

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'staff_compensation',
          row,
          USER_ID,
        ),
      ).rejects.toThrow('Staff member with number "NONEXIST-0" not found');
    });

    it('should default to salaried when compensation_type is unrecognised', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-5' });

      const row: Record<string, string> = {
        staff_number: 'ABC1234-5',
        compensation_type: 'gibberish',
        base_salary: '30000',
        effective_from: '',
        effective_to: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ compensation_type: 'salaried' }),
      });
    });

    it('should set both salary fields to null when no amount columns provided', async () => {
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      mockTx.staffCompensation.create.mockResolvedValue({ id: 'comp-6' });

      const row: Record<string, string> = {
        staff_number: 'ABC1234-5',
        compensation_type: 'salaried',
        effective_from: '',
        effective_to: '',
      };

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'staff_compensation',
        row,
        USER_ID,
      );

      expect(mockTx.staffCompensation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          base_salary: null,
          per_class_rate: null,
        }),
      });
    });
  });

  // ─── processFeeRow ────────────────────────────────────────────────────────

  describe('ImportExecutorService — processFeeRow', () => {
    it('should assign fee structure to household with active student', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID });
      mockTx.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'fees',
        { fee_structure_name: 'Tuition Fee', household_name: 'Smith Family' },
        USER_ID,
      );

      expect(mockTx.householdFeeAssignment.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          fee_structure_id: FEE_STRUCTURE_ID,
          student_id: STUDENT_ID,
          household_id: HOUSEHOLD_ID,
          effective_from: expect.any(Date),
        },
      });
    });

    it('should throw if fee structure not found', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'fees',
          { fee_structure_name: 'Missing', household_name: 'Smith Family' },
          USER_ID,
        ),
      ).rejects.toThrow('Fee structure "Missing" not found');
    });

    it('should throw if household not found', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID });
      mockTx.household.findFirst.mockResolvedValue(null);

      await expect(
        service.processRow(
          mockTx as unknown as PrismaService,
          TENANT_ID,
          'fees',
          { fee_structure_name: 'Tuition', household_name: 'Ghost Family' },
          USER_ID,
        ),
      ).rejects.toThrow('Household "Ghost Family" not found');
    });

    it('should set student_id to null when no active student in household', async () => {
      mockTx.feeStructure.findFirst.mockResolvedValue({ id: FEE_STRUCTURE_ID });
      mockTx.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.findFirst.mockResolvedValue(null); // No active student

      await service.processRow(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        'fees',
        { fee_structure_name: 'Tuition', household_name: 'Empty Family' },
        USER_ID,
      );

      expect(mockTx.householdFeeAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          student_id: null,
          household_id: HOUSEHOLD_ID,
        }),
      });
    });
  });

  // ─── processStudentRows ───────────────────────────────────────────────────

  describe('ImportExecutorService — processStudentRows', () => {
    it('should create standalone household for row without parent email', async () => {
      const rows = [{ last_name: 'Smith', first_name: 'John' }];
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(stats.households_created).toBe(1);
      expect(stats.students_created).toBe(1);
      expect(mockTx.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ household_name: 'Smith Family' }),
        }),
      );
      expect(mockTx.importJobRecord.create).toHaveBeenCalledTimes(2); // Household + Student
    });

    it('should group siblings under same household when emails match (case-insensitive)', async () => {
      const rows = [
        {
          parent1_email: 'fam@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Jones',
          first_name: 'Alice',
          last_name: 'Jones',
        },
        {
          parent1_email: 'FAM@TEST.COM',
          parent1_first_name: 'John',
          parent1_last_name: 'Jones',
          first_name: 'Bob',
          last_name: 'Jones',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(stats.households_created).toBe(1);
      expect(stats.parents_created).toBe(1);
      expect(stats.students_created).toBe(2);
      expect(stats.family_groups).toHaveLength(1);
      expect(stats.family_groups[0]?.rows).toEqual([2, 3]);
    });

    it('should reuse existing household if parent found in DB', async () => {
      const rows = [
        {
          parent1_email: 'exists@test.com',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue({
        id: 'existing-parent',
        household_parents: [{ household_id: 'existing-hh' }],
      });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(stats.households_created).toBe(0);
      expect(stats.households_reused).toBe(1);
      expect(mockTx.household.create).not.toHaveBeenCalled();
      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ household_id: 'existing-hh' }),
        }),
      );
    });

    it('should skip rows with validation errors', async () => {
      const rows = [
        { parent1_email: 'ok@test.com', first_name: 'Alice', last_name: 'A' },
        { parent1_email: 'bad@test.com', first_name: 'Bob', last_name: 'B' },
      ];

      const errorSet = new Set<number>([3]); // Row 3 (index 1 + 2)

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        errorSet,
        JOB_ID,
      );

      expect(stats.skipped_rows).toContainEqual({
        row: 3,
        reason: 'Validation error from preview',
      });
      expect(mockTx.household.create).toHaveBeenCalledTimes(1);
    });

    it('should catch error creating household and mark all family rows skipped', async () => {
      const rows = [
        { parent1_email: 'fail@test.com', first_name: 'A', last_name: 'Fail' },
        { parent1_email: 'fail@test.com', first_name: 'B', last_name: 'Fail' },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockRejectedValue(new Error('DB Failed'));

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(stats.students_created).toBe(0);
      expect(stats.skipped_rows).toContainEqual(
        expect.objectContaining({
          row: 2,
          reason: expect.stringContaining('Family group error'),
        }),
      );
      expect(stats.skipped_rows).toContainEqual(
        expect.objectContaining({
          row: 3,
          reason: expect.stringContaining('Family group error'),
        }),
      );
    });

    it('should resolve aliased year groups (e.g. Grade 1 -> Year 1)', async () => {
      const rows = [{ year_group: 'Grade 1', first_name: 'Ali', last_name: 'Test' }];
      mockTx.yearGroup.findMany.mockResolvedValue([{ id: YEAR_GROUP_ID, name: 'Year 1' }]);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ year_group_id: YEAR_GROUP_ID }),
        }),
      );
    });

    it('should normalise gender values', async () => {
      const rows = [
        { first_name: 'Ali', last_name: 'Test', gender: 'M' },
        { first_name: 'Sara', last_name: 'Test', gender: 'Female' },
      ];
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      // First student: 'M' -> 'male'
      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gender: 'male' }),
        }),
      );
      // Second student: 'Female' -> 'female'
      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gender: 'female' }),
        }),
      );
    });

    it('should set has_allergy true and allergy_details when allergies provided', async () => {
      const rows = [
        {
          first_name: 'Ali',
          last_name: 'Test',
          allergies: 'Peanuts, Shellfish',
        },
      ];
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            has_allergy: true,
            allergy_details: 'Peanuts, Shellfish',
          }),
        }),
      );
    });

    it('should set has_allergy false and allergy_details null when no allergies', async () => {
      const rows = [{ first_name: 'Ali', last_name: 'Test' }];
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(mockTx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            has_allergy: false,
            allergy_details: null,
          }),
        }),
      );
    });

    it('should create parent 2 when parent2 fields are provided', async () => {
      const rows = [
        {
          parent1_email: 'dad@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Smith',
          parent2_first_name: 'Jane',
          parent2_last_name: 'Smith',
          parent2_email: 'jane@test.com',
          parent2_phone: '+1234',
          parent2_relationship: 'mother',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      // Two parents created (parent1 + parent2)
      expect(stats.parents_created).toBe(2);
      expect(mockTx.parent.create).toHaveBeenCalledTimes(2);
      expect(mockTx.householdParent.create).toHaveBeenCalledTimes(2);
    });

    it('should use custom household_name from row when provided', async () => {
      const rows = [
        {
          parent1_email: 'test@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Smith',
          household_name: 'The Royal Household',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(mockTx.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ household_name: 'The Royal Household' }),
        }),
      );
    });

    it('should catch per-student creation errors without failing the family group', async () => {
      const rows = [
        {
          parent1_email: 'mixed@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Smith',
          first_name: 'Alice',
          last_name: 'Smith',
        },
        {
          parent1_email: 'mixed@test.com',
          parent1_first_name: 'John',
          parent1_last_name: 'Smith',
          first_name: 'Bob',
          last_name: 'Smith',
        },
      ];

      mockTx.parent.findFirst.mockResolvedValue(null);
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.parent.create.mockResolvedValue({ id: PARENT_ID });
      // First student succeeds, second fails
      mockTx.student.create
        .mockResolvedValueOnce({ id: STUDENT_ID })
        .mockRejectedValueOnce(new Error('Unique constraint'));

      const stats = await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(stats.students_created).toBe(1);
      expect(stats.skipped_rows).toContainEqual(
        expect.objectContaining({
          row: 3,
          reason: expect.stringContaining('Error'),
        }),
      );
    });

    it('should use address fields from first row for standalone household', async () => {
      const rows = [
        {
          first_name: 'Ali',
          last_name: 'Test',
          address_line1: '123 Main St',
          address_line2: 'Apt 4',
          city: 'Dubai',
          country: 'UAE',
          postal_code: '12345',
        },
      ];
      mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockTx.student.create.mockResolvedValue({ id: STUDENT_ID });

      await service.processStudentRows(
        mockRlsClient as unknown as ReturnType<typeof createRlsClient>,
        TENANT_ID,
        rows,
        new Set<number>(),
        JOB_ID,
      );

      expect(mockTx.household.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address_line_1: '123 Main St',
          address_line_2: 'Apt 4',
          city: 'Dubai',
          country: 'UAE',
          postal_code: '12345',
        }),
      });
    });
  });
});
