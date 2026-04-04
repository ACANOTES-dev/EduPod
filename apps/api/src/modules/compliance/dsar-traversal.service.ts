import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { CommunicationsReadFacade } from '../communications/communications-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GdprReadFacade } from '../gdpr/gdpr-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentInquiriesReadFacade } from '../parent-inquiries/parent-inquiries-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PayrollReadFacade } from '../payroll/payroll-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DsarDataPackage {
  subject_type: string;
  subject_id: string;
  collected_at: string;
  categories: Record<string, unknown>;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class DsarTraversalService {
  private readonly logger = new Logger(DsarTraversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly gradebookReadFacade: GradebookReadFacade,
    private readonly behaviourReadFacade: BehaviourReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly householdReadFacade: HouseholdReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly admissionsReadFacade: AdmissionsReadFacade,
    private readonly authReadFacade: AuthReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly gdprReadFacade: GdprReadFacade,
    private readonly auditLogReadFacade: AuditLogReadFacade,
    private readonly communicationsReadFacade: CommunicationsReadFacade,
    private readonly parentInquiriesReadFacade: ParentInquiriesReadFacade,
    private readonly payrollReadFacade: PayrollReadFacade,
  ) {}

  /**
   * Collects ALL data held about a given subject across every module.
   * Returns a structured package — no formatting, no S3 upload.
   */
  async collectAllData(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<DsarDataPackage> {
    this.logger.log(`Collecting DSAR data for ${subjectType}:${subjectId} in tenant ${tenantId}`);

    let categories: Record<string, unknown>;

    switch (subjectType) {
      case 'student':
        categories = await this.collectStudentData(tenantId, subjectId);
        break;
      case 'parent':
        categories = await this.collectParentData(tenantId, subjectId);
        break;
      case 'staff':
        categories = await this.collectStaffData(tenantId, subjectId);
        break;
      case 'applicant':
        categories = await this.collectApplicantData(tenantId, subjectId);
        break;
      case 'household':
        categories = await this.collectHouseholdData(tenantId, subjectId);
        break;
      case 'user':
        categories = await this.collectUserData(subjectId);
        break;
      default:
        throw new BadRequestException({
          code: 'INVALID_SUBJECT_TYPE',
          message: `Unsupported subject type: ${subjectType}`,
        });
    }

    return {
      subject_type: subjectType,
      subject_id: subjectId,
      collected_at: new Date().toISOString(),
      categories,
    };
  }

  // ─── Student ────────────────────────────────────────────────────────────────

  private async collectStudentData(
    tenantId: string,
    studentId: string,
  ): Promise<Record<string, unknown>> {
    // Phase 1: Fetch profile and parent links first — needed for application + token queries
    const [profile, studentParentLinks, studentTokens] = await Promise.all([
      this.studentReadFacade.findById(tenantId, studentId),
      this.studentReadFacade.findParentsForStudent(tenantId, studentId),
      this.gdprReadFacade.findAnonymisationTokensByEntity(tenantId, 'student', studentId),
    ]);

    const parentIds = studentParentLinks.map((sp) => sp.parent_id);
    const studentTokenIds = studentTokens.map((t) => t.id);

    // Phase 2: All remaining queries in parallel
    // Foreign-table reads use facades; own-table reads remain direct Prisma.
    const [
      attendanceRecords,
      attendancePatternAlerts,
      grades,
      periodGradeSnapshots,
      competencySnapshots,
      gpaSnapshots,
      academicRiskAlerts,
      progressReports,
      reportCards,
      behaviourParticipants,
      behaviourSanctions,
      behaviourAppeals,
      behaviourExclusionCases,
      behaviourRecognitionAwards,
      applications,
      classEnrolments,
      consentRecords,
      gdprTokenUsageLogs,
      aiProcessingLogs,
      auditLogs,
      notifications,
    ] = await Promise.all([
      // Attendance via facade
      this.attendanceReadFacade.findAllRecordsForStudent(tenantId, studentId),

      // Attendance pattern alerts via facade
      this.attendanceReadFacade.getPatternAlerts(tenantId, studentId),

      // Gradebook reads via facade
      this.gradebookReadFacade.findGradesForStudent(tenantId, studentId),
      this.gradebookReadFacade.findPeriodSnapshotsForStudent(tenantId, studentId),
      this.gradebookReadFacade.findCompetencySnapshotsForStudent(tenantId, studentId),
      this.gradebookReadFacade.findGpaSnapshotsForStudent(tenantId, studentId),
      this.gradebookReadFacade.findAllRiskAlertsForStudent(tenantId, studentId),
      this.gradebookReadFacade.findProgressReportsForStudent(tenantId, studentId),
      this.gradebookReadFacade.findReportCardsForStudent(tenantId, studentId),

      // Behaviour reads via facade
      this.behaviourReadFacade.findIncidentsForStudent(tenantId, studentId),
      this.behaviourReadFacade.findSanctionsForStudent(tenantId, studentId),
      this.behaviourReadFacade.findAppealsForStudent(tenantId, studentId),
      this.behaviourReadFacade.findExclusionCasesForStudent(tenantId, studentId),
      this.behaviourReadFacade.findRecognitionAwardsForStudent(tenantId, studentId),

      // Admissions via facade
      profile
        ? this.admissionsReadFacade.findApplicationsByParentOrStudentName(tenantId, {
            parentIds: parentIds.length > 0 ? parentIds : undefined,
            studentFirstName: profile.first_name,
            studentLastName: profile.last_name,
          })
        : Promise.resolve([]),

      // Class enrolments via facade
      this.classesReadFacade.findEnrolmentsForStudent(tenantId, studentId),

      // Consent records via GDPR facade
      this.gdprReadFacade.findConsentRecordsBySubject(tenantId, 'student', studentId),

      // GDPR token usage logs via facade
      this.gdprReadFacade.findTokenUsageLogs(tenantId),

      // AI processing logs via GDPR facade
      this.gdprReadFacade.findAiProcessingLogsBySubject(tenantId, 'student', studentId),

      // Audit logs via facade
      this.auditLogReadFacade.findByEntityId(tenantId, studentId),

      // Notifications via facade
      this.communicationsReadFacade.findNotificationsBySourceEntity(tenantId, 'student', studentId),
    ]);

    // Filter token usage logs to only those referencing the student's token IDs
    const relevantTokenLogs =
      studentTokenIds.length > 0
        ? gdprTokenUsageLogs.filter(
            (log) =>
              Array.isArray(log.tokens_used) &&
              log.tokens_used.some((tokenId) => studentTokenIds.includes(tokenId as string)),
          )
        : [];

    return {
      profile,
      attendance_records: attendanceRecords,
      attendance_pattern_alerts: attendancePatternAlerts,
      grades,
      period_grade_snapshots: periodGradeSnapshots,
      competency_snapshots: competencySnapshots,
      gpa_snapshots: gpaSnapshots,
      academic_risk_alerts: academicRiskAlerts,
      progress_reports: progressReports,
      report_cards: reportCards,
      behaviour_incidents: behaviourParticipants,
      behaviour_sanctions: behaviourSanctions,
      behaviour_appeals: behaviourAppeals,
      behaviour_exclusion_cases: behaviourExclusionCases,
      behaviour_recognition_awards: behaviourRecognitionAwards,
      admissions: applications,
      class_enrolments: classEnrolments.map((e) => ({
        ...e,
        class_name: e.class_entity.name,
      })),
      consent_records: consentRecords,
      gdpr_token_usage_logs: relevantTokenLogs,
      ai_processing_logs: aiProcessingLogs,
      audit_logs: auditLogs,
      notifications,
    };
  }

  // ─── Parent ─────────────────────────────────────────────────────────────────

  private async collectParentData(
    tenantId: string,
    parentId: string,
  ): Promise<Record<string, unknown>> {
    const [profile, studentLinks, householdLinks, inquiries, consentRecords, auditLogs] =
      await Promise.all([
        // Profile — ALL fields via facade
        this.parentReadFacade.findById(tenantId, parentId),

        // Linked students via facade
        this.parentReadFacade.findStudentLinksForParent(tenantId, parentId),

        // Household memberships via facade
        this.householdReadFacade.findHouseholdsForParent(tenantId, parentId),

        // Parent inquiries + messages via facade
        this.parentInquiriesReadFacade.findByParentIdWithMessages(tenantId, parentId),

        // Consent records via GDPR facade
        this.gdprReadFacade.findConsentRecordsBySubject(tenantId, 'parent', parentId),

        // Audit logs via facade
        this.auditLogReadFacade.findByEntityId(tenantId, parentId),
      ]);

    // Gather household IDs for financial data
    const householdIds = householdLinks.map((hl) => hl.household_id);

    // Financial data via facade — ALL records, no limits.
    // Facade methods are single-household; fan out across all households.
    const invoiceArrays = await Promise.all(
      householdIds.map((hhId) => this.financeReadFacade.findInvoicesByHousehold(tenantId, hhId)),
    );
    const paymentArrays = await Promise.all(
      householdIds.map((hhId) => this.financeReadFacade.findPaymentsByHousehold(tenantId, hhId)),
    );
    const refundArrays = await Promise.all(
      householdIds.map((hhId) => this.financeReadFacade.findRefundsByHousehold(tenantId, hhId)),
    );
    const creditNoteArrays = await Promise.all(
      householdIds.map((hhId) => this.financeReadFacade.findCreditNotesByHousehold(tenantId, hhId)),
    );
    const paymentPlanRequestArrays = await Promise.all(
      householdIds.map((hhId) =>
        this.financeReadFacade.findPaymentPlanRequestsByHousehold(tenantId, hhId),
      ),
    );

    const [
      invoices,
      payments,
      refunds,
      creditNotes,
      paymentPlanRequests,
      scholarships,
      notifications,
    ] = await Promise.all([
      Promise.resolve(invoiceArrays.flat()),
      Promise.resolve(paymentArrays.flat()),
      Promise.resolve(refundArrays.flat()),
      Promise.resolve(creditNoteArrays.flat()),
      Promise.resolve(paymentPlanRequestArrays.flat()),
      this.financeReadFacade.findScholarshipsByHouseholds(tenantId, householdIds),

      // Notifications sent to parent's user account via facade
      profile?.user_id
        ? this.communicationsReadFacade.findNotificationsByRecipient(tenantId, profile.user_id)
        : Promise.resolve([]),
    ]);

    return {
      profile,
      linked_students: studentLinks,
      household_memberships: householdLinks,
      financial: {
        invoices,
        payments,
        refunds,
        credit_notes: creditNotes,
        payment_plan_requests: paymentPlanRequests,
        scholarships,
      },
      inquiries,
      consent_records: consentRecords,
      audit_logs: auditLogs,
      notifications,
    };
  }

  // ─── Staff ──────────────────────────────────────────────────────────────────

  private async collectStaffData(
    tenantId: string,
    staffProfileId: string,
  ): Promise<Record<string, unknown>> {
    const [
      profile,
      compensations,
      payrollEntries,
      allowances,
      deductions,
      payslips,
      consentRecords,
      auditLogs,
    ] = await Promise.all([
      // Profile via facade
      this.staffProfileReadFacade.findById(tenantId, staffProfileId),

      // Compensation records via facade
      this.payrollReadFacade.findCompensationsByStaff(tenantId, staffProfileId),

      // Payroll entries via facade
      this.payrollReadFacade.findPayrollEntriesByStaff(tenantId, staffProfileId),

      // Allowances via facade
      this.payrollReadFacade.findAllowancesByStaff(tenantId, staffProfileId),

      // Recurring deductions via facade
      this.payrollReadFacade.findRecurringDeductionsByStaff(tenantId, staffProfileId),

      // Payslips via facade
      this.payrollReadFacade.findPayslipsByStaff(tenantId, staffProfileId),

      // Consent records via GDPR facade
      this.gdprReadFacade.findConsentRecordsBySubject(tenantId, 'staff', staffProfileId),

      // Audit logs via facade
      this.auditLogReadFacade.findByEntityId(tenantId, staffProfileId),
    ]);

    // Mask bank details — show bank_name only; encrypted fields cannot be meaningfully masked
    const maskedProfile = profile
      ? {
          ...profile,
          bank_details_masked: {
            note: '[encrypted — available via DPO request]',
          },
        }
      : null;

    return {
      profile: maskedProfile,
      compensations,
      payroll_entries: payrollEntries,
      allowances,
      deductions,
      payslips,
      consent_records: consentRecords,
      audit_logs: auditLogs,
    };
  }

  // ─── Applicant ──────────────────────────────────────────────────────────────

  private async collectApplicantData(
    tenantId: string,
    applicationId: string,
  ): Promise<Record<string, unknown>> {
    const [application, applicationNotes, consentRecords, auditLogs] = await Promise.all([
      // Application record via facade
      this.admissionsReadFacade.findById(tenantId, applicationId),

      // Application notes via facade
      this.admissionsReadFacade.findNotesForApplication(tenantId, applicationId),

      // Consent records via GDPR facade
      this.gdprReadFacade.findConsentRecordsBySubject(tenantId, 'applicant', applicationId),

      // Audit logs via facade
      this.auditLogReadFacade.findByEntityId(tenantId, applicationId),
    ]);

    return {
      application,
      application_notes: applicationNotes,
      consent_records: consentRecords,
      audit_logs: auditLogs,
    };
  }

  // ─── Household ──────────────────────────────────────────────────────────────

  private async collectHouseholdData(
    tenantId: string,
    householdId: string,
  ): Promise<Record<string, unknown>> {
    const [
      profile,
      parentLinks,
      students,
      emergencyContacts,
      feeAssignments,
      invoices,
      payments,
      refunds,
      creditNotes,
    ] = await Promise.all([
      // Profile via facade
      this.householdReadFacade.findById(tenantId, householdId),

      // Linked parents via facade
      this.householdReadFacade.findParentsForHousehold(tenantId, householdId),

      // Linked students via facade
      this.studentReadFacade.findByHousehold(tenantId, householdId),

      // Emergency contacts via facade
      this.householdReadFacade.findEmergencyContacts(tenantId, householdId),

      // Fee assignments via finance facade
      this.financeReadFacade.findFeeAssignmentsByHousehold(tenantId, householdId),

      // Finance reads via facade
      this.financeReadFacade.findInvoicesByHousehold(tenantId, householdId),
      this.financeReadFacade.findPaymentsByHousehold(tenantId, householdId),
      this.financeReadFacade.findRefundsByHousehold(tenantId, householdId),
      this.financeReadFacade.findCreditNotesByHousehold(tenantId, householdId),
    ]);

    return {
      profile,
      linked_parents: parentLinks,
      linked_students: students,
      emergency_contacts: emergencyContacts,
      fee_assignments: feeAssignments,
      financial: {
        invoices,
        payments,
        refunds,
        credit_notes: creditNotes,
      },
    };
  }

  // ─── User (platform-level) ────────────────────────────────────────────────

  private async collectUserData(userId: string): Promise<Record<string, unknown>> {
    const [profile, memberships] = await Promise.all([
      // User record — basic fields via facade
      this.authReadFacade.findUserById('', userId),

      // Tenant memberships via facade
      this.rbacReadFacade.findAllMembershipsForUser(userId),
    ]);

    return {
      profile,
      memberships,
    };
  }
}
