import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DsarTraversalService } from './dsar-traversal.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const STUDENT_ID = 'student-uuid-1';
const PARENT_ID = 'parent-uuid-1';
const STAFF_PROFILE_ID = 'staff-uuid-1';
const APPLICATION_ID = 'application-uuid-1';
const HOUSEHOLD_ID = 'household-uuid-1';
const USER_ID = 'user-uuid-1';

// ─── Mock Type ────────────────────────────────────────────────────────────────

interface MockModel {
  findFirst: jest.Mock;
  findMany: jest.Mock;
}

interface MockPrisma {
  student: MockModel;
  attendanceRecord: Pick<MockModel, 'findMany'>;
  attendancePatternAlert: Pick<MockModel, 'findMany'>;
  grade: Pick<MockModel, 'findMany'>;
  gpaSnapshot: Pick<MockModel, 'findMany'>;
  progressReport: Pick<MockModel, 'findMany'>;
  reportCard: Pick<MockModel, 'findMany'>;
  behaviourIncidentParticipant: Pick<MockModel, 'findMany'>;
  behaviourSanction: Pick<MockModel, 'findMany'>;
  behaviourAppeal: Pick<MockModel, 'findMany'>;
  behaviourExclusionCase: Pick<MockModel, 'findMany'>;
  behaviourRecognitionAward: Pick<MockModel, 'findMany'>;
  application: MockModel;
  applicationNote: Pick<MockModel, 'findMany'>;
  classEnrolment: Pick<MockModel, 'findMany'>;
  consentRecord: Pick<MockModel, 'findMany'>;
  gdprTokenUsageLog: Pick<MockModel, 'findMany'>;
  aiProcessingLog: Pick<MockModel, 'findMany'>;
  auditLog: Pick<MockModel, 'findMany'>;
  notification: Pick<MockModel, 'findMany'>;
  parent: Pick<MockModel, 'findFirst'>;
  studentParent: Pick<MockModel, 'findMany'>;
  householdParent: Pick<MockModel, 'findMany'>;
  parentInquiry: Pick<MockModel, 'findMany'>;
  invoice: Pick<MockModel, 'findMany'>;
  payment: Pick<MockModel, 'findMany'>;
  refund: Pick<MockModel, 'findMany'>;
  creditNote: Pick<MockModel, 'findMany'>;
  paymentPlanRequest: Pick<MockModel, 'findMany'>;
  scholarship: Pick<MockModel, 'findMany'>;
  staffProfile: Pick<MockModel, 'findFirst'>;
  staffCompensation: Pick<MockModel, 'findMany'>;
  payrollEntry: Pick<MockModel, 'findMany'>;
  staffAllowance: Pick<MockModel, 'findMany'>;
  staffRecurringDeduction: Pick<MockModel, 'findMany'>;
  payslip: Pick<MockModel, 'findMany'>;
  household: Pick<MockModel, 'findFirst'>;
  householdEmergencyContact: Pick<MockModel, 'findMany'>;
  householdFeeAssignment: Pick<MockModel, 'findMany'>;
  user: Pick<MockModel, 'findFirst'>;
  tenantMembership: Pick<MockModel, 'findMany'>;
}

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function buildMockPrisma(): MockPrisma {
  return {
    student: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    attendanceRecord: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    attendancePatternAlert: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    grade: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    gpaSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    progressReport: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    reportCard: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourIncidentParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourAppeal: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourExclusionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourRecognitionAward: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    application: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    applicationNote: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    consentRecord: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    gdprTokenUsageLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiProcessingLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    parent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    householdParent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    parentInquiry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    refund: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    creditNote: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    paymentPlanRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    scholarship: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    staffCompensation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffAllowance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffRecurringDeduction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payslip: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    household: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    householdEmergencyContact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    householdFeeAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tenantMembership: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DsarTraversalService', () => {
  let service: DsarTraversalService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DsarTraversalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DsarTraversalService>(DsarTraversalService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Invalid subject type ───────────────────────────────────────────────

  describe('collectAllData — invalid subject type', () => {
    it('should throw BadRequestException for unsupported subject type', async () => {
      await expect(
        service.collectAllData(TENANT_ID, 'unknown', 'some-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include error code in exception', async () => {
      try {
        await service.collectAllData(TENANT_ID, 'invalid_type', 'id');
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            code: 'INVALID_SUBJECT_TYPE',
          }),
        );
      }
    });
  });

  // ─── Student traversal ──────────────────────────────────────────────────

  describe('collectAllData — student', () => {
    it('should return all expected student categories', async () => {
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(result.subject_type).toBe('student');
      expect(result.subject_id).toBe(STUDENT_ID);
      expect(result.collected_at).toBeDefined();

      const cats = result.categories;
      expect(cats).toHaveProperty('profile');
      expect(cats).toHaveProperty('attendance_records');
      expect(cats).toHaveProperty('attendance_pattern_alerts');
      expect(cats).toHaveProperty('grades');
      expect(cats).toHaveProperty('gpa_snapshots');
      expect(cats).toHaveProperty('progress_reports');
      expect(cats).toHaveProperty('report_cards');
      expect(cats).toHaveProperty('behaviour_incidents');
      expect(cats).toHaveProperty('behaviour_sanctions');
      expect(cats).toHaveProperty('behaviour_appeals');
      expect(cats).toHaveProperty('behaviour_exclusion_cases');
      expect(cats).toHaveProperty('behaviour_recognition_awards');
      expect(cats).toHaveProperty('admissions');
      expect(cats).toHaveProperty('class_enrolments');
      expect(cats).toHaveProperty('consent_records');
      expect(cats).toHaveProperty('gdpr_token_usage_logs');
      expect(cats).toHaveProperty('ai_processing_logs');
      expect(cats).toHaveProperty('audit_logs');
      expect(cats).toHaveProperty('notifications');
    });

    it('should query all student models with correct tenant and student filters', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      // Student profile
      expect(mockPrisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );

      // Attendance — no take limit
      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );

      // Grades — no take limit
      expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );

      // Report cards
      expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );

      // Consent records
      expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subject_type: 'student',
            subject_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );

      // Audit logs
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );
    });

    it('should NOT pass take parameter to any findMany call', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      // Check every findMany call on every model does not include 'take'
      const prismaEntries = Object.entries(mockPrisma) as Array<
        [string, Partial<MockModel>]
      >;
      for (const [modelName, methods] of prismaEntries) {
        const findMany = methods.findMany;
        if (findMany && findMany.mock.calls.length > 0) {
          for (const call of findMany.mock.calls) {
            const args = call[0] as Record<string, unknown> | undefined;
            expect(args).not.toHaveProperty('take',
              `${modelName}.findMany was called with 'take' — DSAR must return ALL records`,
            );
          }
        }
      }
    });

    it('should return empty arrays when no data exists', async () => {
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(result.categories.profile).toBeNull();
      expect(result.categories.attendance_records).toEqual([]);
      expect(result.categories.grades).toEqual([]);
      expect(result.categories.report_cards).toEqual([]);
      expect(result.categories.behaviour_incidents).toEqual([]);
      expect(result.categories.admissions).toEqual([]);
      expect(result.categories.class_enrolments).toEqual([]);
    });

    it('should include class name in class enrolments', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          id: 'enrol-1',
          student_id: STUDENT_ID,
          class_id: 'class-1',
          status: 'active',
          class_entity: { id: 'class-1', name: 'Math 101' },
        },
      ]);

      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);
      const enrolments = result.categories.class_enrolments as Array<Record<string, unknown>>;

      expect(enrolments).toHaveLength(1);
      expect(enrolments[0]).toHaveProperty('class_name', 'Math 101');
    });

    it('should query behaviour incidents via participant join', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            tenant_id: TENANT_ID,
          }),
          include: expect.objectContaining({
            incident: true,
          }),
        }),
      );
    });

    it('should query progress reports with entries included', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(mockPrisma.progressReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            entries: true,
          }),
        }),
      );
    });
  });

  // ─── Parent traversal ──────────────────────────────────────────────────

  describe('collectAllData — parent', () => {
    it('should return all expected parent categories', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: null,
        first_name: 'Jane',
        last_name: 'Doe',
      });

      const result = await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(result.subject_type).toBe('parent');
      const cats = result.categories;
      expect(cats).toHaveProperty('profile');
      expect(cats).toHaveProperty('linked_students');
      expect(cats).toHaveProperty('household_memberships');
      expect(cats).toHaveProperty('financial');
      expect(cats).toHaveProperty('inquiries');
      expect(cats).toHaveProperty('consent_records');
      expect(cats).toHaveProperty('audit_logs');
      expect(cats).toHaveProperty('notifications');
    });

    it('should query financial data for all linked households', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: null,
      });
      mockPrisma.householdParent.findMany.mockResolvedValue([
        { household_id: 'hh-1', parent_id: PARENT_ID, household: { id: 'hh-1', household_name: 'Smith' } },
        { household_id: 'hh-2', parent_id: PARENT_ID, household: { id: 'hh-2', household_name: 'Jones' } },
      ]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: { in: ['hh-1', 'hh-2'] },
          }),
        }),
      );

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: { in: ['hh-1', 'hh-2'] },
          }),
        }),
      );
    });

    it('should query notifications via parent user_id', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
      });
      mockPrisma.householdParent.findMany.mockResolvedValue([]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipient_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should return empty notifications when parent has no user_id', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: null,
      });
      mockPrisma.householdParent.findMany.mockResolvedValue([]);

      const result = await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);
      expect(result.categories.notifications).toEqual([]);
    });

    it('should NOT pass take parameter to financial queries', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, user_id: null });
      mockPrisma.householdParent.findMany.mockResolvedValue([
        { household_id: 'hh-1', parent_id: PARENT_ID, household: { id: 'hh-1', household_name: 'X' } },
      ]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      for (const call of mockPrisma.invoice.findMany.mock.calls) {
        expect(call[0]).not.toHaveProperty('take');
      }
      for (const call of mockPrisma.payment.findMany.mock.calls) {
        expect(call[0]).not.toHaveProperty('take');
      }
    });

    it('should query inquiries with messages included', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, user_id: null });
      mockPrisma.householdParent.findMany.mockResolvedValue([]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ messages: true }),
        }),
      );
    });
  });

  // ─── Staff traversal ───────────────────────────────────────────────────

  describe('collectAllData — staff', () => {
    it('should return all expected staff categories', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        bank_name: 'Test Bank',
        bank_account_number_encrypted: null,
        bank_iban_encrypted: null,
        user: { id: USER_ID, email: 'staff@example.com', first_name: 'John', last_name: 'Staff' },
      });

      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);

      expect(result.subject_type).toBe('staff');
      const cats = result.categories;
      expect(cats).toHaveProperty('profile');
      expect(cats).toHaveProperty('compensations');
      expect(cats).toHaveProperty('payroll_entries');
      expect(cats).toHaveProperty('allowances');
      expect(cats).toHaveProperty('deductions');
      expect(cats).toHaveProperty('payslips');
      expect(cats).toHaveProperty('consent_records');
      expect(cats).toHaveProperty('audit_logs');
    });

    it('should mask bank details — never expose encrypted fields', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        bank_name: 'AIB',
        bank_account_number_encrypted: 'enc_abc_1234',
        bank_iban_encrypted: 'enc_iban_5678',
        bank_encryption_key_ref: 'ref-key-123',
        user: { id: USER_ID, email: 'test@test.com', first_name: 'A', last_name: 'B' },
      });

      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);
      const profile = result.categories.profile as Record<string, unknown>;

      // Encrypted fields must be removed
      expect(profile.bank_account_number_encrypted).toBeUndefined();
      expect(profile.bank_iban_encrypted).toBeUndefined();
      expect(profile.bank_encryption_key_ref).toBeUndefined();

      // Masked details must be present
      const masked = profile.bank_details_masked as Record<string, unknown>;
      expect(masked.bank_name).toBe('AIB');
      expect(masked.account_last_4).toBe('****1234');
      expect(masked.iban_last_4).toBe('****5678');
    });

    it('should handle null bank details gracefully', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        bank_name: null,
        bank_account_number_encrypted: null,
        bank_iban_encrypted: null,
        bank_encryption_key_ref: null,
        user: { id: USER_ID, email: 'test@test.com', first_name: 'A', last_name: 'B' },
      });

      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);
      const profile = result.categories.profile as Record<string, unknown>;
      const masked = profile.bank_details_masked as Record<string, unknown>;

      expect(masked.bank_name).toBeNull();
      expect(masked.account_last_4).toBeNull();
      expect(masked.iban_last_4).toBeNull();
    });

    it('should include linked user record in staff profile', async () => {
      await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);

      expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              }),
            }),
          }),
        }),
      );
    });

    it('should query payslips via payroll entry staff profile join', async () => {
      await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);

      expect(mockPrisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payroll_entry: { staff_profile_id: STAFF_PROFILE_ID },
          }),
        }),
      );
    });
  });

  // ─── Applicant traversal ───────────────────────────────────────────────

  describe('collectAllData — applicant', () => {
    it('should return all expected applicant categories', async () => {
      const result = await service.collectAllData(
        TENANT_ID,
        'applicant',
        APPLICATION_ID,
      );

      expect(result.subject_type).toBe('applicant');
      const cats = result.categories;
      expect(cats).toHaveProperty('application');
      expect(cats).toHaveProperty('application_notes');
      expect(cats).toHaveProperty('consent_records');
      expect(cats).toHaveProperty('audit_logs');
    });

    it('should query consent records with applicant subject_type', async () => {
      await service.collectAllData(TENANT_ID, 'applicant', APPLICATION_ID);

      expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subject_type: 'applicant',
            subject_id: APPLICATION_ID,
          }),
        }),
      );
    });
  });

  // ─── Household traversal ───────────────────────────────────────────────

  describe('collectAllData — household', () => {
    it('should return all expected household categories', async () => {
      const result = await service.collectAllData(
        TENANT_ID,
        'household',
        HOUSEHOLD_ID,
      );

      expect(result.subject_type).toBe('household');
      const cats = result.categories;
      expect(cats).toHaveProperty('profile');
      expect(cats).toHaveProperty('linked_parents');
      expect(cats).toHaveProperty('linked_students');
      expect(cats).toHaveProperty('emergency_contacts');
      expect(cats).toHaveProperty('fee_assignments');
      expect(cats).toHaveProperty('financial');

      const financial = cats.financial as Record<string, unknown>;
      expect(financial).toHaveProperty('invoices');
      expect(financial).toHaveProperty('payments');
      expect(financial).toHaveProperty('refunds');
      expect(financial).toHaveProperty('credit_notes');
    });

    it('should NOT pass take parameter to household financial queries', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      for (const call of mockPrisma.invoice.findMany.mock.calls) {
        expect(call[0]).not.toHaveProperty('take');
      }
      for (const call of mockPrisma.payment.findMany.mock.calls) {
        expect(call[0]).not.toHaveProperty('take');
      }
    });

    it('should query emergency contacts', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(mockPrisma.householdEmergencyContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: HOUSEHOLD_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );
    });

    it('should query fee assignments', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: HOUSEHOLD_ID,
            tenant_id: TENANT_ID,
          }),
        }),
      );
    });
  });

  // ─── User traversal ────────────────────────────────────────────────────

  describe('collectAllData — user', () => {
    it('should return profile and memberships', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'user@example.com',
        first_name: 'Test',
        last_name: 'User',
      });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { id: 'tm-1', tenant_id: TENANT_ID, user_id: USER_ID, membership_status: 'active' },
      ]);

      const result = await service.collectAllData(TENANT_ID, 'user', USER_ID);

      expect(result.subject_type).toBe('user');
      expect(result.categories.profile).toEqual(
        expect.objectContaining({
          id: USER_ID,
          email: 'user@example.com',
        }),
      );
      expect(result.categories.memberships).toHaveLength(1);
    });

    it('should query user without tenant_id (platform-level)', async () => {
      await service.collectAllData(TENANT_ID, 'user', USER_ID);

      // User query should NOT include tenant_id
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
        }),
      );

      // Membership query should filter by user_id only
      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID },
        }),
      );
    });

    it('should select only safe user fields (no password_hash, mfa_secret)', async () => {
      await service.collectAllData(TENANT_ID, 'user', USER_ID);

      const selectArg = mockPrisma.user.findFirst.mock.calls[0][0].select;
      expect(selectArg).toBeDefined();
      expect(selectArg.password_hash).toBeUndefined();
      expect(selectArg.mfa_secret).toBeUndefined();
      expect(selectArg.id).toBe(true);
      expect(selectArg.email).toBe(true);
    });
  });

  // ─── Empty data handling ────────────────────────────────────────────────

  describe('collectAllData — empty data handling', () => {
    it('should return null profile and empty arrays when student has no data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(result.categories.profile).toBeNull();
      expect(result.categories.attendance_records).toEqual([]);
      expect(result.categories.grades).toEqual([]);
      expect(result.categories.consent_records).toEqual([]);
      expect(result.categories.audit_logs).toEqual([]);
    });

    it('should return null profile for staff with no data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);
      expect(result.categories.profile).toBeNull();
      expect(result.categories.payslips).toEqual([]);
    });

    it('should return null application for applicant with no data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'applicant', APPLICATION_ID);
      expect(result.categories.application).toBeNull();
      expect(result.categories.application_notes).toEqual([]);
    });
  });

  // ─── Timestamp ──────────────────────────────────────────────────────────

  describe('collectAllData — metadata', () => {
    it('should include valid ISO timestamp in collected_at', async () => {
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      const parsed = new Date(result.collected_at);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });
});
