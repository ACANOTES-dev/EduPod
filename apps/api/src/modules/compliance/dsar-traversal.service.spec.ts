import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  GdprReadFacade,
  AttendanceReadFacade,
  AuditLogReadFacade,
  CommunicationsReadFacade,
  AdmissionsReadFacade,
  ClassesReadFacade,
  ParentReadFacade,
  HouseholdReadFacade,
  StaffProfileReadFacade,
  PayrollReadFacade,
  ParentInquiriesReadFacade,
  AuthReadFacade,
  RbacReadFacade,
} from '../../common/tests/mock-facades';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
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

// Models still accessed directly by DSAR (compliance-owned or not served by facades)
interface MockPrisma {
  student: MockModel;
  attendanceRecord: Pick<MockModel, 'findMany'>;
  attendancePatternAlert: Pick<MockModel, 'findMany'>;
  application: MockModel;
  applicationNote: Pick<MockModel, 'findMany'>;
  classEnrolment: Pick<MockModel, 'findMany'>;
  consentRecord: Pick<MockModel, 'findMany'>;
  gdprAnonymisationToken: Pick<MockModel, 'findMany'>;
  gdprTokenUsageLog: Pick<MockModel, 'findMany'>;
  aiProcessingLog: Pick<MockModel, 'findMany'>;
  auditLog: Pick<MockModel, 'findMany'>;
  notification: Pick<MockModel, 'findMany'>;
  parent: Pick<MockModel, 'findFirst'>;
  studentParent: Pick<MockModel, 'findMany'>;
  householdParent: Pick<MockModel, 'findMany'>;
  parentInquiry: Pick<MockModel, 'findMany'>;
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

// Facade mocks — foreign-table reads are now via facades
interface MockFinanceReadFacade {
  findInvoicesByHousehold: jest.Mock;
  findPaymentsByHousehold: jest.Mock;
  findRefundsByHousehold: jest.Mock;
  findCreditNotesByHousehold: jest.Mock;
  findPaymentPlanRequestsByHousehold: jest.Mock;
  findScholarshipsByStudent: jest.Mock;
  findScholarshipsByHouseholds: jest.Mock;
  countInvoicesBeforeDate: jest.Mock;
  findFeeAssignmentsByHousehold: jest.Mock;
}

interface MockGradebookReadFacade {
  findGradesForStudent: jest.Mock;
  findPeriodSnapshotsForStudent: jest.Mock;
  findCompetencySnapshotsForStudent: jest.Mock;
  findGpaSnapshotsForStudent: jest.Mock;
  findAllRiskAlertsForStudent: jest.Mock;
  findProgressReportsForStudent: jest.Mock;
  findReportCardsForStudent: jest.Mock;
}

interface MockBehaviourReadFacade {
  findIncidentsForStudent: jest.Mock;
  findSanctionsForStudent: jest.Mock;
  findAppealsForStudent: jest.Mock;
  findExclusionCasesForStudent: jest.Mock;
  findRecognitionAwardsForStudent: jest.Mock;
}

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function buildMockFinanceFacade(): MockFinanceReadFacade {
  return {
    findInvoicesByHousehold: jest.fn().mockResolvedValue([]),
    findPaymentsByHousehold: jest.fn().mockResolvedValue([]),
    findRefundsByHousehold: jest.fn().mockResolvedValue([]),
    findCreditNotesByHousehold: jest.fn().mockResolvedValue([]),
    findPaymentPlanRequestsByHousehold: jest.fn().mockResolvedValue([]),
    findScholarshipsByStudent: jest.fn().mockResolvedValue([]),
    findScholarshipsByHouseholds: jest.fn().mockResolvedValue([]),
    countInvoicesBeforeDate: jest.fn().mockResolvedValue(0),
    findFeeAssignmentsByHousehold: jest.fn().mockResolvedValue([]),
  };
}

function buildMockGradebookFacade(): MockGradebookReadFacade {
  return {
    findGradesForStudent: jest.fn().mockResolvedValue([]),
    findPeriodSnapshotsForStudent: jest.fn().mockResolvedValue([]),
    findCompetencySnapshotsForStudent: jest.fn().mockResolvedValue([]),
    findGpaSnapshotsForStudent: jest.fn().mockResolvedValue([]),
    findAllRiskAlertsForStudent: jest.fn().mockResolvedValue([]),
    findProgressReportsForStudent: jest.fn().mockResolvedValue([]),
    findReportCardsForStudent: jest.fn().mockResolvedValue([]),
  };
}

function buildMockBehaviourFacade(): MockBehaviourReadFacade {
  return {
    findIncidentsForStudent: jest.fn().mockResolvedValue([]),
    findSanctionsForStudent: jest.fn().mockResolvedValue([]),
    findAppealsForStudent: jest.fn().mockResolvedValue([]),
    findExclusionCasesForStudent: jest.fn().mockResolvedValue([]),
    findRecognitionAwardsForStudent: jest.fn().mockResolvedValue([]),
  };
}

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
    gdprAnonymisationToken: {
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

// ─── Helper: typed facade mock refs ──────────────────────────────────────────

interface FacadeMocks {
  student: Record<string, jest.Mock>;
  gdpr: Record<string, jest.Mock>;
  attendance: Record<string, jest.Mock>;
  auditLog: Record<string, jest.Mock>;
  communications: Record<string, jest.Mock>;
  admissions: Record<string, jest.Mock>;
  classes: Record<string, jest.Mock>;
  parent: Record<string, jest.Mock>;
  household: Record<string, jest.Mock>;
  staffProfile: Record<string, jest.Mock>;
  payroll: Record<string, jest.Mock>;
  parentInquiries: Record<string, jest.Mock>;
  auth: Record<string, jest.Mock>;
  rbac: Record<string, jest.Mock>;
}

function buildFacadeMocks(): FacadeMocks {
  return {
    student: {
      findById: jest.fn().mockResolvedValue(null),
      findParentsForStudent: jest.fn().mockResolvedValue([]),
      findByHousehold: jest.fn().mockResolvedValue([]),
      findByIds: jest.fn().mockResolvedValue([]),
    },
    gdpr: {
      findAnonymisationTokensByEntity: jest.fn().mockResolvedValue([]),
      findConsentRecordsBySubject: jest.fn().mockResolvedValue([]),
      findTokenUsageLogs: jest.fn().mockResolvedValue([]),
      findAiProcessingLogsBySubject: jest.fn().mockResolvedValue([]),
    },
    attendance: {
      findAllRecordsForStudent: jest.fn().mockResolvedValue([]),
      getPatternAlerts: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      findByEntityId: jest.fn().mockResolvedValue([]),
    },
    communications: {
      findNotificationsBySourceEntity: jest.fn().mockResolvedValue([]),
      findNotificationsByRecipient: jest.fn().mockResolvedValue([]),
    },
    admissions: {
      findApplicationsByParentOrStudentName: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findNotesForApplication: jest.fn().mockResolvedValue([]),
    },
    classes: {
      findEnrolmentsForStudent: jest.fn().mockResolvedValue([]),
    },
    parent: {
      findById: jest.fn().mockResolvedValue(null),
      findStudentLinksForParent: jest.fn().mockResolvedValue([]),
    },
    household: {
      findHouseholdsForParent: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findParentsForHousehold: jest.fn().mockResolvedValue([]),
      findEmergencyContacts: jest.fn().mockResolvedValue([]),
    },
    staffProfile: {
      findById: jest.fn().mockResolvedValue(null),
    },
    payroll: {
      findCompensationsByStaff: jest.fn().mockResolvedValue([]),
      findPayrollEntriesByStaff: jest.fn().mockResolvedValue([]),
      findAllowancesByStaff: jest.fn().mockResolvedValue([]),
      findRecurringDeductionsByStaff: jest.fn().mockResolvedValue([]),
      findPayslipsByStaff: jest.fn().mockResolvedValue([]),
    },
    parentInquiries: {
      findByParentIdWithMessages: jest.fn().mockResolvedValue([]),
    },
    auth: {
      findUserById: jest.fn().mockResolvedValue(null),
    },
    rbac: {
      findAllMembershipsForUser: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('DsarTraversalService', () => {
  let service: DsarTraversalService;
  let mockPrisma: MockPrisma;
  let mockFinanceFacade: MockFinanceReadFacade;
  let mockGradebookFacade: MockGradebookReadFacade;
  let mockBehaviourFacade: MockBehaviourReadFacade;
  let facades: FacadeMocks;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockFinanceFacade = buildMockFinanceFacade();
    mockGradebookFacade = buildMockGradebookFacade();
    mockBehaviourFacade = buildMockBehaviourFacade();
    facades = buildFacadeMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        DsarTraversalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FinanceReadFacade, useValue: mockFinanceFacade },
        { provide: GradebookReadFacade, useValue: mockGradebookFacade },
        { provide: BehaviourReadFacade, useValue: mockBehaviourFacade },
        { provide: StudentReadFacade, useValue: facades.student },
        { provide: GdprReadFacade, useValue: facades.gdpr },
        { provide: AttendanceReadFacade, useValue: facades.attendance },
        { provide: AuditLogReadFacade, useValue: facades.auditLog },
        { provide: CommunicationsReadFacade, useValue: facades.communications },
        { provide: AdmissionsReadFacade, useValue: facades.admissions },
        { provide: ClassesReadFacade, useValue: facades.classes },
        { provide: ParentReadFacade, useValue: facades.parent },
        { provide: HouseholdReadFacade, useValue: facades.household },
        { provide: StaffProfileReadFacade, useValue: facades.staffProfile },
        { provide: PayrollReadFacade, useValue: facades.payroll },
        { provide: ParentInquiriesReadFacade, useValue: facades.parentInquiries },
        { provide: AuthReadFacade, useValue: facades.auth },
        { provide: RbacReadFacade, useValue: facades.rbac },
      ],
    }).compile();

    service = module.get<DsarTraversalService>(DsarTraversalService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Invalid subject type ───────────────────────────────────────────────

  describe('collectAllData — invalid subject type', () => {
    it('should throw BadRequestException for unsupported subject type', async () => {
      await expect(service.collectAllData(TENANT_ID, 'unknown', 'some-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include error code in exception', async () => {
      try {
        await service.collectAllData(TENANT_ID, 'invalid_type', 'id');
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err).toMatchObject({ response: { code: expect.any(String) } });
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
      expect(cats).toHaveProperty('period_grade_snapshots');
      expect(cats).toHaveProperty('competency_snapshots');
      expect(cats).toHaveProperty('gpa_snapshots');
      expect(cats).toHaveProperty('academic_risk_alerts');
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

      // Student profile via facade
      expect(facades.student.findById).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);

      // Attendance via facade
      expect(facades.attendance.findAllRecordsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );

      // Gradebook reads via facade — verify called with correct tenantId + studentId
      expect(mockGradebookFacade.findGradesForStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
      expect(mockGradebookFacade.findPeriodSnapshotsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(mockGradebookFacade.findCompetencySnapshotsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(mockGradebookFacade.findAllRiskAlertsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(mockGradebookFacade.findReportCardsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );

      // Consent records via facade
      expect(facades.gdpr.findConsentRecordsBySubject).toHaveBeenCalledWith(
        TENANT_ID,
        'student',
        STUDENT_ID,
      );

      // Audit logs via facade
      expect(facades.auditLog.findByEntityId).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    });

    it('should NOT pass take parameter to any findMany call', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      // Check every findMany call on every model does not include 'take'
      const prismaEntries = Object.entries(mockPrisma) as Array<[string, Partial<MockModel>]>;
      for (const [modelName, methods] of prismaEntries) {
        const findMany = methods.findMany;
        if (findMany && findMany.mock.calls.length > 0) {
          for (const call of findMany.mock.calls) {
            const args = call[0] as Record<string, unknown> | undefined;
            expect(args).not.toHaveProperty(
              'take',
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
      facades.classes.findEnrolmentsForStudent!.mockResolvedValue([
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

    it('should query behaviour incidents via facade', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(mockBehaviourFacade.findIncidentsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
    });

    it('should query progress reports via facade', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(mockGradebookFacade.findProgressReportsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
    });

    // ─── GAP-5: Application queries filtered by parent IDs and name ────────

    it('should query applications filtered by parent IDs when student has parents', async () => {
      facades.student.findById!.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      facades.student.findParentsForStudent!.mockResolvedValue([
        { parent_id: 'parent-1' },
        { parent_id: 'parent-2' },
      ]);

      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(facades.admissions.findApplicationsByParentOrStudentName).toHaveBeenCalledWith(
        TENANT_ID,
        {
          parentIds: ['parent-1', 'parent-2'],
          studentFirstName: 'Alice',
          studentLastName: 'Smith',
        },
      );
    });

    it('should query student parent links with correct filters', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(facades.student.findParentsForStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    });

    it('should not query applications when student has no profile and no parents', async () => {
      // Default mocks: student.findFirst returns null, studentParent.findMany returns []
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      // No application query should have been made — resolved to empty array
      expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
      expect(result.categories.admissions).toEqual([]);
    });

    it('should filter applications by name only when student has no parents', async () => {
      facades.student.findById!.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Bob',
        last_name: 'Jones',
      });
      facades.student.findParentsForStudent!.mockResolvedValue([]);

      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(facades.admissions.findApplicationsByParentOrStudentName).toHaveBeenCalledWith(
        TENANT_ID,
        {
          parentIds: undefined,
          studentFirstName: 'Bob',
          studentLastName: 'Jones',
        },
      );
    });

    // ─── GAP-6: Token usage logs filtered by student token IDs ─────────────

    it('should filter token usage logs to entries referencing student token IDs', async () => {
      const tokenId1 = 'token-uuid-1';
      const tokenId2 = 'token-uuid-2';

      facades.gdpr.findAnonymisationTokensByEntity!.mockResolvedValue([
        { id: tokenId1 },
        { id: tokenId2 },
      ]);

      facades.gdpr.findTokenUsageLogs!.mockResolvedValue([
        { id: 'log-1', tokens_used: [tokenId1, 'other-token'] },
        { id: 'log-2', tokens_used: ['unrelated-token'] },
        { id: 'log-3', tokens_used: [tokenId2] },
      ]);

      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);
      const tokenLogs = result.categories.gdpr_token_usage_logs as Array<Record<string, unknown>>;

      expect(tokenLogs).toHaveLength(2);
      expect(tokenLogs.map((l) => l.id)).toEqual(['log-1', 'log-3']);
    });

    it('should return empty token usage logs when student has no tokens', async () => {
      mockPrisma.gdprAnonymisationToken.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([
        { id: 'log-1', tokens_used: ['some-token'] },
      ]);

      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);
      expect(result.categories.gdpr_token_usage_logs).toEqual([]);
    });

    it('should query anonymisation tokens for the correct student', async () => {
      await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);

      expect(facades.gdpr.findAnonymisationTokensByEntity).toHaveBeenCalledWith(
        TENANT_ID,
        'student',
        STUDENT_ID,
      );
    });
  });

  // ─── Parent traversal ──────────────────────────────────────────────────

  describe('collectAllData — parent', () => {
    it('should return all expected parent categories', async () => {
      facades.parent.findById!.mockResolvedValue({
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

    it('should query financial data for all linked households via facade', async () => {
      facades.parent.findById!.mockResolvedValue({
        id: PARENT_ID,
        user_id: null,
      });
      facades.household.findHouseholdsForParent!.mockResolvedValue([
        {
          household_id: 'hh-1',
          parent_id: PARENT_ID,
          household: { id: 'hh-1', household_name: 'Smith' },
        },
        {
          household_id: 'hh-2',
          parent_id: PARENT_ID,
          household: { id: 'hh-2', household_name: 'Jones' },
        },
      ]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      // Finance facade called for each household
      expect(mockFinanceFacade.findInvoicesByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(mockFinanceFacade.findInvoicesByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-2');
      expect(mockFinanceFacade.findPaymentsByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(mockFinanceFacade.findPaymentsByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-2');
      expect(mockFinanceFacade.findScholarshipsByHouseholds).toHaveBeenCalledWith(TENANT_ID, [
        'hh-1',
        'hh-2',
      ]);
    });

    it('should query notifications via parent user_id', async () => {
      facades.parent.findById!.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
      });

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(facades.communications.findNotificationsByRecipient).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
    });

    it('should return empty notifications when parent has no user_id', async () => {
      facades.parent.findById!.mockResolvedValue({
        id: PARENT_ID,
        user_id: null,
      });

      const result = await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);
      expect(result.categories.notifications).toEqual([]);
    });

    it('should call finance facade for parent financial data', async () => {
      facades.parent.findById!.mockResolvedValue({ id: PARENT_ID, user_id: null });
      facades.household.findHouseholdsForParent!.mockResolvedValue([
        {
          household_id: 'hh-1',
          parent_id: PARENT_ID,
          household: { id: 'hh-1', household_name: 'X' },
        },
      ]);

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(mockFinanceFacade.findInvoicesByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(mockFinanceFacade.findRefundsByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(mockFinanceFacade.findCreditNotesByHousehold).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(mockFinanceFacade.findPaymentPlanRequestsByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        'hh-1',
      );
    });

    it('should query inquiries with messages included', async () => {
      facades.parent.findById!.mockResolvedValue({ id: PARENT_ID, user_id: null });

      await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);

      expect(facades.parentInquiries.findByParentIdWithMessages).toHaveBeenCalledWith(
        TENANT_ID,
        PARENT_ID,
      );
    });
  });

  // ─── Staff traversal ───────────────────────────────────────────────────

  describe('collectAllData — staff', () => {
    it('should return all expected staff categories', async () => {
      facades.staffProfile.findById!.mockResolvedValue({
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
      facades.staffProfile.findById!.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        bank_name: 'AIB',
        bank_account_number_encrypted: 'enc_abc_1234',
        bank_iban_encrypted: 'enc_iban_5678',
        bank_encryption_key_ref: 'ref-key-123',
        user: { id: USER_ID, email: 'test@test.com', first_name: 'A', last_name: 'B' },
      });

      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);
      const profile = result.categories.profile as Record<string, unknown>;

      // Masked details must show DPO message
      const masked = profile.bank_details_masked as Record<string, unknown>;
      expect(masked.note).toBe('[encrypted — available via DPO request]');
    });

    it('should handle null bank details gracefully', async () => {
      facades.staffProfile.findById!.mockResolvedValue({
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

      expect(masked.note).toBe('[encrypted — available via DPO request]');
    });

    it('should include linked user record in staff profile', async () => {
      await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);

      expect(facades.staffProfile.findById).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);
    });

    it('should query payslips via payroll facade', async () => {
      await service.collectAllData(TENANT_ID, 'staff', STAFF_PROFILE_ID);

      expect(facades.payroll.findPayslipsByStaff).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);
    });
  });

  // ─── Applicant traversal ───────────────────────────────────────────────

  describe('collectAllData — applicant', () => {
    it('should return all expected applicant categories', async () => {
      const result = await service.collectAllData(TENANT_ID, 'applicant', APPLICATION_ID);

      expect(result.subject_type).toBe('applicant');
      const cats = result.categories;
      expect(cats).toHaveProperty('application');
      expect(cats).toHaveProperty('application_notes');
      expect(cats).toHaveProperty('consent_records');
      expect(cats).toHaveProperty('audit_logs');
    });

    it('should query consent records with applicant subject_type', async () => {
      await service.collectAllData(TENANT_ID, 'applicant', APPLICATION_ID);

      expect(facades.gdpr.findConsentRecordsBySubject).toHaveBeenCalledWith(
        TENANT_ID,
        'applicant',
        APPLICATION_ID,
      );
    });
  });

  // ─── Household traversal ───────────────────────────────────────────────

  describe('collectAllData — household', () => {
    it('should return all expected household categories', async () => {
      const result = await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

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

    it('should call finance facade for household financial queries', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(mockFinanceFacade.findInvoicesByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSEHOLD_ID,
      );
      expect(mockFinanceFacade.findPaymentsByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSEHOLD_ID,
      );
      expect(mockFinanceFacade.findRefundsByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSEHOLD_ID,
      );
      expect(mockFinanceFacade.findCreditNotesByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSEHOLD_ID,
      );
    });

    it('should query emergency contacts', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(facades.household.findEmergencyContacts).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID);
    });

    it('should query fee assignments', async () => {
      await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(mockFinanceFacade.findFeeAssignmentsByHousehold).toHaveBeenCalledWith(
        TENANT_ID,
        HOUSEHOLD_ID,
      );
    });
  });

  // ─── User traversal ────────────────────────────────────────────────────

  describe('collectAllData — user', () => {
    it('should return profile and memberships', async () => {
      facades.auth.findUserById!.mockResolvedValue({
        id: USER_ID,
        email: 'user@example.com',
        first_name: 'Test',
        last_name: 'User',
      });
      facades.rbac.findAllMembershipsForUser!.mockResolvedValue([
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

      // User query should NOT include tenant_id — via authReadFacade
      expect(facades.auth.findUserById).toHaveBeenCalledWith('', USER_ID);

      // Membership query should filter by user_id only — via rbacReadFacade
      expect(facades.rbac.findAllMembershipsForUser).toHaveBeenCalledWith(USER_ID);
    });

    it('should query user via facade (no direct Prisma access)', async () => {
      await service.collectAllData(TENANT_ID, 'user', USER_ID);

      expect(facades.auth.findUserById).toHaveBeenCalledWith('', USER_ID);
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
