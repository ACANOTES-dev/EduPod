import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collects ALL data held about a given subject across every module.
   * Returns a structured package — no formatting, no S3 upload.
   */
  async collectAllData(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<DsarDataPackage> {
    this.logger.log(
      `Collecting DSAR data for ${subjectType}:${subjectId} in tenant ${tenantId}`,
    );

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
    const where = { tenant_id: tenantId };

    const [
      profile,
      attendanceRecords,
      attendancePatternAlerts,
      grades,
      gpaSnapshots,
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
      // Profile — ALL fields
      this.prisma.student.findFirst({
        where: { id: studentId, ...where },
      }),

      // Attendance — ALL records, no limit
      this.prisma.attendanceRecord.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { marked_at: 'desc' },
      }),

      // Attendance pattern alerts
      this.prisma.attendancePatternAlert.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { detected_date: 'desc' },
      }),

      // Grades — ALL records
      this.prisma.grade.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // GPA snapshots
      this.prisma.gpaSnapshot.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { snapshot_at: 'desc' },
      }),

      // Progress reports + entries
      this.prisma.progressReport.findMany({
        where: { student_id: studentId, ...where },
        include: { entries: true },
        orderBy: { created_at: 'desc' },
      }),

      // Report cards — including snapshot payload
      this.prisma.reportCard.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Behaviour — via participant join
      this.prisma.behaviourIncidentParticipant.findMany({
        where: { student_id: studentId, ...where },
        include: { incident: true },
      }),

      // Behaviour sanctions
      this.prisma.behaviourSanction.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Behaviour appeals
      this.prisma.behaviourAppeal.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Behaviour exclusion cases
      this.prisma.behaviourExclusionCase.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Behaviour recognition awards
      this.prisma.behaviourRecognitionAward.findMany({
        where: { student_id: studentId, ...where },
        orderBy: { awarded_at: 'desc' },
      }),

      // Admissions — applications submitted by parents for this student
      // Link is via parent who submitted, with student name match, or direct lookup
      this.prisma.application.findMany({
        where: { ...where },
        include: { notes: true },
      }),

      // Class enrolments with class name
      this.prisma.classEnrolment.findMany({
        where: { student_id: studentId, ...where },
        include: {
          class_entity: {
            select: { id: true, name: true },
          },
        },
      }),

      // Consent records
      this.prisma.consentRecord.findMany({
        where: { subject_type: 'student', subject_id: studentId, ...where },
      }),

      // GDPR token usage logs referencing the student
      this.prisma.gdprTokenUsageLog.findMany({
        where: { ...where },
      }),

      // AI processing logs
      this.prisma.aiProcessingLog.findMany({
        where: { subject_type: 'student', subject_id: studentId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Audit logs about this student
      this.prisma.auditLog.findMany({
        where: { entity_id: studentId, tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
      }),

      // Notifications about the student
      this.prisma.notification.findMany({
        where: {
          source_entity_type: 'student',
          source_entity_id: studentId,
          ...where,
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Filter applications to those matching this student by name or linked parent
    const studentProfile = profile;
    const relevantApplications = studentProfile
      ? applications.filter(
          (app) =>
            app.student_first_name === studentProfile.first_name &&
            app.student_last_name === studentProfile.last_name,
        )
      : [];

    // Filter token usage logs that reference this student's tokens
    const relevantTokenLogs = gdprTokenUsageLogs.filter(
      (log) =>
        Array.isArray(log.tokens_used) &&
        log.tokens_used.length > 0,
    );

    return {
      profile,
      attendance_records: attendanceRecords,
      attendance_pattern_alerts: attendancePatternAlerts,
      grades,
      gpa_snapshots: gpaSnapshots,
      progress_reports: progressReports,
      report_cards: reportCards,
      behaviour_incidents: behaviourParticipants,
      behaviour_sanctions: behaviourSanctions,
      behaviour_appeals: behaviourAppeals,
      behaviour_exclusion_cases: behaviourExclusionCases,
      behaviour_recognition_awards: behaviourRecognitionAwards,
      admissions: relevantApplications,
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
    const where = { tenant_id: tenantId };

    const [
      profile,
      studentLinks,
      householdLinks,
      inquiries,
      consentRecords,
      auditLogs,
    ] = await Promise.all([
      // Profile — ALL fields
      this.prisma.parent.findFirst({
        where: { id: parentId, ...where },
      }),

      // Linked students
      this.prisma.studentParent.findMany({
        where: { parent_id: parentId, ...where },
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true, student_number: true },
          },
        },
      }),

      // Household memberships
      this.prisma.householdParent.findMany({
        where: { parent_id: parentId, ...where },
        include: {
          household: {
            select: { id: true, household_name: true },
          },
        },
      }),

      // Parent inquiries + messages
      this.prisma.parentInquiry.findMany({
        where: { parent_id: parentId, ...where },
        include: { messages: true },
        orderBy: { created_at: 'desc' },
      }),

      // Consent records
      this.prisma.consentRecord.findMany({
        where: { subject_type: 'parent', subject_id: parentId, ...where },
      }),

      // Audit logs
      this.prisma.auditLog.findMany({
        where: { entity_id: parentId, tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Gather household IDs for financial data
    const householdIds = householdLinks.map((hl) => hl.household_id);

    // Financial data — ALL records, no limits
    const [invoices, payments, refunds, creditNotes, paymentPlanRequests, scholarships, notifications] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { household_id: { in: householdIds }, ...where },
          orderBy: { created_at: 'desc' },
        }),

        this.prisma.payment.findMany({
          where: { household_id: { in: householdIds }, ...where },
          orderBy: { created_at: 'desc' },
        }),

        this.prisma.refund.findMany({
          where: {
            ...where,
            payment: { household_id: { in: householdIds } },
          },
          orderBy: { created_at: 'desc' },
        }),

        this.prisma.creditNote.findMany({
          where: { household_id: { in: householdIds }, ...where },
          orderBy: { created_at: 'desc' },
        }),

        this.prisma.paymentPlanRequest.findMany({
          where: { household_id: { in: householdIds }, ...where },
          orderBy: { created_at: 'desc' },
        }),

        this.prisma.scholarship.findMany({
          where: {
            ...where,
            student: { household_id: { in: householdIds } },
          },
          orderBy: { created_at: 'desc' },
        }),

        // Notifications sent to parent's user account
        profile?.user_id
          ? this.prisma.notification.findMany({
              where: { recipient_user_id: profile.user_id, ...where },
              orderBy: { created_at: 'desc' },
            })
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
    const where = { tenant_id: tenantId };

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
      // Profile — ALL fields + linked user
      this.prisma.staffProfile.findFirst({
        where: { id: staffProfileId, ...where },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              phone: true,
              preferred_locale: true,
              created_at: true,
            },
          },
        },
      }),

      // Compensation records
      this.prisma.staffCompensation.findMany({
        where: { staff_profile_id: staffProfileId, ...where },
        orderBy: { effective_from: 'desc' },
      }),

      // Payroll entries
      this.prisma.payrollEntry.findMany({
        where: { staff_profile_id: staffProfileId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Allowances
      this.prisma.staffAllowance.findMany({
        where: { staff_profile_id: staffProfileId, ...where },
        orderBy: { effective_from: 'desc' },
      }),

      // Recurring deductions
      this.prisma.staffRecurringDeduction.findMany({
        where: { staff_profile_id: staffProfileId, ...where },
        orderBy: { start_date: 'desc' },
      }),

      // Payslips — via payroll entries
      this.prisma.payslip.findMany({
        where: {
          ...where,
          payroll_entry: { staff_profile_id: staffProfileId },
        },
        orderBy: { issued_at: 'desc' },
      }),

      // Consent records
      this.prisma.consentRecord.findMany({
        where: { subject_type: 'staff', subject_id: staffProfileId, ...where },
      }),

      // Audit logs
      this.prisma.auditLog.findMany({
        where: { entity_id: staffProfileId, tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Mask bank details — only expose bank_name and last 4 chars
    const maskedProfile = profile
      ? {
          ...profile,
          bank_account_number_encrypted: undefined,
          bank_iban_encrypted: undefined,
          bank_encryption_key_ref: undefined,
          bank_details_masked: {
            bank_name: profile.bank_name,
            account_last_4: profile.bank_account_number_encrypted
              ? `****${profile.bank_account_number_encrypted.slice(-4)}`
              : null,
            iban_last_4: profile.bank_iban_encrypted
              ? `****${profile.bank_iban_encrypted.slice(-4)}`
              : null,
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
    const where = { tenant_id: tenantId };

    const [application, applicationNotes, consentRecords, auditLogs] =
      await Promise.all([
        // Application record with payload
        this.prisma.application.findFirst({
          where: { id: applicationId, ...where },
        }),

        // Application notes
        this.prisma.applicationNote.findMany({
          where: { application_id: applicationId, ...where },
          orderBy: { created_at: 'desc' },
        }),

        // Consent records
        this.prisma.consentRecord.findMany({
          where: { subject_type: 'applicant', subject_id: applicationId, ...where },
        }),

        // Audit logs
        this.prisma.auditLog.findMany({
          where: { entity_id: applicationId, tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
        }),
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
    const where = { tenant_id: tenantId };

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
      // Profile — ALL fields
      this.prisma.household.findFirst({
        where: { id: householdId, ...where },
      }),

      // Linked parents
      this.prisma.householdParent.findMany({
        where: { household_id: householdId, ...where },
        include: {
          parent: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      }),

      // Linked students
      this.prisma.student.findMany({
        where: { household_id: householdId, ...where },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          student_number: true,
        },
      }),

      // Emergency contacts
      this.prisma.householdEmergencyContact.findMany({
        where: { household_id: householdId, ...where },
        orderBy: { display_order: 'asc' },
      }),

      // Fee assignments
      this.prisma.householdFeeAssignment.findMany({
        where: { household_id: householdId, ...where },
        orderBy: { effective_from: 'desc' },
      }),

      // Invoices — ALL, no limit
      this.prisma.invoice.findMany({
        where: { household_id: householdId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Payments — ALL, no limit
      this.prisma.payment.findMany({
        where: { household_id: householdId, ...where },
        orderBy: { created_at: 'desc' },
      }),

      // Refunds
      this.prisma.refund.findMany({
        where: {
          ...where,
          payment: { household_id: householdId },
        },
        orderBy: { created_at: 'desc' },
      }),

      // Credit notes
      this.prisma.creditNote.findMany({
        where: { household_id: householdId, ...where },
        orderBy: { created_at: 'desc' },
      }),
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

  private async collectUserData(
    userId: string,
  ): Promise<Record<string, unknown>> {
    const [profile, memberships] = await Promise.all([
      // User record — basic fields only (platform-level, no tenant_id)
      this.prisma.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          phone: true,
          preferred_locale: true,
          global_status: true,
          email_verified_at: true,
          mfa_enabled: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      }),

      // Tenant memberships
      this.prisma.tenantMembership.findMany({
        where: { user_id: userId },
      }),
    ]);

    return {
      profile,
      memberships,
    };
  }
}
