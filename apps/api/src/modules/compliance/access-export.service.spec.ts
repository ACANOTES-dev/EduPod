import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { AccessExportService } from './access-export.service';

// Mock createRlsClient
const mockTx: Record<string, unknown> = {};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

// eslint-disable-next-line import/order -- must come after jest.mock
import { createRlsClient } from '../../common/middleware/rls.middleware';

describe('AccessExportService', () => {
  let service: AccessExportService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const PARENT_ID = '22222222-2222-2222-2222-222222222222';
  const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
  const HOUSEHOLD_ID = '44444444-4444-4444-4444-444444444444';
  const USER_ID = '55555555-5555-5555-5555-555555555555';
  const REQUEST_ID = '66666666-6666-6666-6666-666666666666';

  const mockPrisma = {};

  const mockS3Service = {
    upload: jest.fn(),
  };

  const mockParent = {
    findFirst: jest.fn(),
  };

  const mockStudentParent = {
    findMany: jest.fn(),
  };

  const mockHouseholdParent = {
    findMany: jest.fn(),
  };

  const mockStudent = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };

  const mockAttendanceRecord = {
    findMany: jest.fn(),
  };

  const mockGrade = {
    findMany: jest.fn(),
  };

  const mockClassEnrolment = {
    findMany: jest.fn(),
  };

  const mockHousehold = {
    findFirst: jest.fn(),
  };

  const mockInvoice = {
    findMany: jest.fn(),
  };

  const mockPayment = {
    findMany: jest.fn(),
  };

  const mockUser = {
    findFirst: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Wire mockTx models
    mockTx['parent'] = mockParent;
    mockTx['studentParent'] = mockStudentParent;
    mockTx['householdParent'] = mockHouseholdParent;
    mockTx['student'] = mockStudent;
    mockTx['attendanceRecord'] = mockAttendanceRecord;
    mockTx['grade'] = mockGrade;
    mockTx['classEnrolment'] = mockClassEnrolment;
    mockTx['household'] = mockHousehold;
    mockTx['invoice'] = mockInvoice;
    mockTx['payment'] = mockPayment;
    mockTx['user'] = mockUser;

    const module = await Test.createTestingModule({
      providers: [
        AccessExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<AccessExportService>(AccessExportService);
  });

  describe('exportSubjectData()', () => {
    it('should export parent data with profile, students, households', async () => {
      const parentProfile = {
        id: PARENT_ID,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        whatsapp_phone: '+1234567890',
        preferred_contact_channels: ['email'],
        relationship_label: 'father',
        is_primary_contact: true,
        is_billing_contact: false,
        status: 'active',
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-06-01'),
      };

      mockParent.findFirst.mockResolvedValue(parentProfile);
      mockStudentParent.findMany.mockResolvedValue([
        {
          relationship_label: 'father',
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Doe',
            student_number: 'STU-001',
          },
        },
      ]);
      mockHouseholdParent.findMany.mockResolvedValue([
        {
          role_label: 'head',
          household: {
            id: HOUSEHOLD_ID,
            household_name: 'The Does',
          },
        },
      ]);

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      const result = await service.exportSubjectData(TENANT_ID, 'parent', PARENT_ID, REQUEST_ID);

      expect(result.s3Key).toBe(expectedS3Key);

      // Verify the uploaded JSON contains expected structure
      const uploadCall = mockS3Service.upload.mock.calls[0];
      const uploadedJson = JSON.parse(uploadCall[2].toString('utf-8'));

      expect(uploadedJson.data.profile).toEqual(expect.objectContaining({
        id: PARENT_ID,
        first_name: 'John',
        last_name: 'Doe',
      }));
      expect(uploadedJson.data.linked_students).toHaveLength(1);
      expect(uploadedJson.data.linked_students[0]).toEqual(expect.objectContaining({
        student_id: STUDENT_ID,
        student_name: 'Alice Doe',
        relationship: 'father',
      }));
      expect(uploadedJson.data.household_memberships).toHaveLength(1);
      expect(uploadedJson.data.household_memberships[0]).toEqual(expect.objectContaining({
        household_id: HOUSEHOLD_ID,
        household_name: 'The Does',
        role: 'head',
      }));
    });

    it('should export student data with profile, attendance, grades, enrolments', async () => {
      const studentProfile = {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Doe',
        full_name: 'Alice Doe',
        first_name_ar: null,
        last_name_ar: null,
        full_name_ar: null,
        student_number: 'STU-001',
        date_of_birth: new Date('2015-03-10'),
        gender: 'female',
        status: 'active',
        entry_date: new Date('2024-09-01'),
        exit_date: null,
        medical_notes: null,
        has_allergy: false,
        allergy_details: null,
        created_at: new Date('2024-09-01'),
        updated_at: new Date('2025-01-01'),
      };

      mockStudent.findFirst.mockResolvedValue(studentProfile);
      mockAttendanceRecord.findMany.mockResolvedValue([
        {
          id: 'att-1',
          status: 'present',
          reason: null,
          marked_at: new Date('2025-03-15'),
          created_at: new Date('2025-03-15'),
        },
      ]);
      mockGrade.findMany.mockResolvedValue([
        {
          id: 'grade-1',
          raw_score: 95,
          is_missing: false,
          comment: 'Excellent',
          entered_at: new Date('2025-03-01'),
          created_at: new Date('2025-03-01'),
        },
      ]);
      mockClassEnrolment.findMany.mockResolvedValue([
        {
          id: 'enrol-1',
          status: 'active',
          start_date: new Date('2024-09-01'),
          end_date: null,
          class_entity: {
            id: 'class-1',
            name: 'Grade 5A',
          },
        },
      ]);

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      const result = await service.exportSubjectData(TENANT_ID, 'student', STUDENT_ID, REQUEST_ID);

      expect(result.s3Key).toBe(expectedS3Key);

      const uploadCall = mockS3Service.upload.mock.calls[0];
      const uploadedJson = JSON.parse(uploadCall[2].toString('utf-8'));

      expect(uploadedJson.data.profile).toEqual(expect.objectContaining({
        id: STUDENT_ID,
        first_name: 'Alice',
        student_number: 'STU-001',
      }));
      expect(uploadedJson.data.attendance_records).toHaveLength(1);
      expect(uploadedJson.data.grades).toHaveLength(1);
      expect(uploadedJson.data.class_enrolments).toHaveLength(1);
      expect(uploadedJson.data.class_enrolments[0]).toEqual(expect.objectContaining({
        class_id: 'class-1',
        class_name: 'Grade 5A',
      }));
    });

    it('should export household data with profile, parents, students, invoices, payments', async () => {
      const householdProfile = {
        id: HOUSEHOLD_ID,
        household_name: 'The Does',
        address_line_1: '123 Main St',
        address_line_2: null,
        city: 'Riyadh',
        country: 'SA',
        postal_code: '12345',
        status: 'active',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2025-01-01'),
      };

      mockHousehold.findFirst.mockResolvedValue(householdProfile);
      mockHouseholdParent.findMany.mockResolvedValue([
        {
          role_label: 'head',
          parent: {
            id: PARENT_ID,
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
          },
        },
      ]);
      mockStudent.findMany.mockResolvedValue([
        {
          id: STUDENT_ID,
          first_name: 'Alice',
          last_name: 'Doe',
          student_number: 'STU-001',
        },
      ]);
      mockInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoice_number: 'INV-202503-001',
          status: 'paid',
          issue_date: new Date('2025-03-01'),
          due_date: new Date('2025-03-31'),
          total_amount: 5000,
          balance_amount: 0,
          currency_code: 'SAR',
          created_at: new Date('2025-03-01'),
        },
      ]);
      mockPayment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          payment_method: 'bank_transfer',
          amount: 5000,
          currency_code: 'SAR',
          status: 'completed',
          received_at: new Date('2025-03-10'),
          created_at: new Date('2025-03-10'),
        },
      ]);

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      const result = await service.exportSubjectData(TENANT_ID, 'household', HOUSEHOLD_ID, REQUEST_ID);

      expect(result.s3Key).toBe(expectedS3Key);

      const uploadCall = mockS3Service.upload.mock.calls[0];
      const uploadedJson = JSON.parse(uploadCall[2].toString('utf-8'));

      expect(uploadedJson.data.profile).toEqual(expect.objectContaining({
        id: HOUSEHOLD_ID,
        household_name: 'The Does',
      }));
      expect(uploadedJson.data.linked_parents).toHaveLength(1);
      expect(uploadedJson.data.linked_parents[0]).toEqual(expect.objectContaining({
        parent_id: PARENT_ID,
        parent_name: 'John Doe',
      }));
      expect(uploadedJson.data.linked_students).toHaveLength(1);
      expect(uploadedJson.data.invoices).toHaveLength(1);
      expect(uploadedJson.data.payments).toHaveLength(1);
    });

    it('should export user data with basic profile', async () => {
      const userProfile = {
        id: USER_ID,
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@school.edu',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2025-01-01'),
      };

      mockUser.findFirst.mockResolvedValue(userProfile);

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      const result = await service.exportSubjectData(TENANT_ID, 'user', USER_ID, REQUEST_ID);

      expect(result.s3Key).toBe(expectedS3Key);

      const uploadCall = mockS3Service.upload.mock.calls[0];
      const uploadedJson = JSON.parse(uploadCall[2].toString('utf-8'));

      expect(uploadedJson.data.profile).toEqual(expect.objectContaining({
        id: USER_ID,
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@school.edu',
      }));
    });

    it('should upload JSON to S3 with correct key format', async () => {
      mockUser.findFirst.mockResolvedValue({
        id: USER_ID,
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@school.edu',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2025-01-01'),
      });

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      await service.exportSubjectData(TENANT_ID, 'user', USER_ID, REQUEST_ID);

      expect(mockS3Service.upload).toHaveBeenCalledWith(
        TENANT_ID,
        `compliance-exports/${REQUEST_ID}.json`,
        expect.any(Buffer),
        'application/json',
      );
    });

    it('should include metadata envelope', async () => {
      mockUser.findFirst.mockResolvedValue({
        id: USER_ID,
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@school.edu',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2025-01-01'),
      });

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      await service.exportSubjectData(TENANT_ID, 'user', USER_ID, REQUEST_ID);

      const uploadCall = mockS3Service.upload.mock.calls[0];
      const uploadedJson = JSON.parse(uploadCall[2].toString('utf-8'));

      expect(uploadedJson).toHaveProperty('export_generated_at');
      expect(uploadedJson.subject_type).toBe('user');
      expect(uploadedJson.subject_id).toBe(USER_ID);
      expect(uploadedJson.tenant_id).toBe(TENANT_ID);
      expect(uploadedJson).toHaveProperty('data');
    });

    it('should use RLS-scoped transaction', async () => {
      mockUser.findFirst.mockResolvedValue({
        id: USER_ID,
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@school.edu',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2025-01-01'),
      });

      const expectedS3Key = `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`;
      mockS3Service.upload.mockResolvedValue(expectedS3Key);

      await service.exportSubjectData(TENANT_ID, 'user', USER_ID, REQUEST_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
    });
  });
});
