import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

// ─── Public types ────────────────────────────────────────────────────────────

export type AnonymisationSearchEntityType =
  | 'applications'
  | 'households'
  | 'parents'
  | 'staff'
  | 'students';

export interface AnonymisationSearchRemoval {
  entityType: AnonymisationSearchEntityType;
  entityId: string;
}

export interface AnonymisationCleanupPlan {
  searchRemovals: AnonymisationSearchRemoval[];
  previewKeys: string[];
  cachePatterns: string[];
  unreadNotificationUserIds: string[];
  sessionUserIds: string[];
  permissionMembershipIds: string[];
  s3ObjectKeys: string[];
  complianceRequestIdsToClear: string[];
}

export interface AnonymisationResult {
  anonymised_entities: string[];
  cleanup: AnonymisationCleanupPlan;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ANONYMISED_PREFIX = 'ANONYMISED-';

type JsonLike = Prisma.JsonValue;
type JsonObject = Record<string, JsonLike>;
type SubjectType = 'household' | 'parent' | 'student' | 'user';
type ApplicationScope = 'household' | 'parent' | 'student';

interface CleanupAccumulator {
  searchRemovals: Set<string>;
  previewKeys: Set<string>;
  cachePatterns: Set<string>;
  unreadNotificationUserIds: Set<string>;
  sessionUserIds: Set<string>;
  permissionMembershipIds: Set<string>;
  s3ObjectKeys: Set<string>;
  complianceRequestIdsToClear: Set<string>;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class ComplianceAnonymisationCore {
  async anonymiseSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
    tx: PrismaClient,
  ): Promise<AnonymisationResult> {
    const cleanup = this.createCleanupAccumulator();
    const anonymisedEntities = new Set<string>();
    const tokenEntityIds = new Set<string>([subjectId]);
    let performedAnonymisation = false;

    switch (subjectType as SubjectType) {
      case 'parent': {
        const result = await this.anonymiseParentRecord(
          tx,
          tenantId,
          subjectId,
          cleanup,
          tokenEntityIds,
        );
        if (result.anonymised) {
          anonymisedEntities.add('parent');
        }
        if (result.anonymised && !result.alreadyAnonymised) {
          performedAnonymisation = true;
        }
        break;
      }
      case 'student': {
        const result = await this.anonymiseStudentRecord(
          tx,
          tenantId,
          subjectId,
          cleanup,
          tokenEntityIds,
        );
        if (result.anonymised) {
          anonymisedEntities.add('student');
        }
        if (result.anonymised && !result.alreadyAnonymised) {
          performedAnonymisation = true;
        }
        break;
      }
      case 'household': {
        const result = await this.anonymiseHouseholdRecord(
          tx,
          tenantId,
          subjectId,
          cleanup,
          tokenEntityIds,
        );
        if (result.anonymised) {
          anonymisedEntities.add('household');
        }
        if (result.anonymised && !result.alreadyAnonymised) {
          performedAnonymisation = true;
        }
        break;
      }
      case 'user': {
        cleanup.unreadNotificationUserIds.add(subjectId);
        cleanup.sessionUserIds.add(subjectId);
        await this.addMembershipCleanup(tx, tenantId, subjectId, cleanup);
        await this.anonymiseNotificationRecipientRecords(tx, tenantId, subjectId, buildTag(subjectId));

        const linkedParentIds = await this.findLinkedParentIds(tx, tenantId, subjectId);
        for (const parentId of linkedParentIds) {
          const result = await this.anonymiseParentRecord(
            tx,
            tenantId,
            parentId,
            cleanup,
            tokenEntityIds,
          );
          if (result.anonymised) {
            anonymisedEntities.add('parent');
          }
          if (result.anonymised && !result.alreadyAnonymised) {
            performedAnonymisation = true;
          }
        }

        const staffProfile = await tx.staffProfile.findFirst({
          where: { tenant_id: tenantId, user_id: subjectId },
          select: { id: true },
        });

        if (staffProfile) {
          tokenEntityIds.add(staffProfile.id);
          const result = await this.anonymiseStaffRecord(
            tx,
            tenantId,
            staffProfile.id,
            subjectId,
            cleanup,
          );
          if (result.anonymised) {
            anonymisedEntities.add('staff_profile');
          }
          if (result.anonymised && !result.alreadyAnonymised) {
            performedAnonymisation = true;
          }
        }
        break;
      }
      default:
        return {
          anonymised_entities: [],
          cleanup: this.finalizeCleanup(cleanup),
        };
    }

    if (performedAnonymisation) {
      await this.collectComplianceExportCleanup(tx, tenantId, subjectId, cleanup);

      if (tokenEntityIds.size > 0) {
        await tx.gdprAnonymisationToken.deleteMany({
          where: {
            tenant_id: tenantId,
            entity_id: { in: Array.from(tokenEntityIds) },
          },
        });
      }
    }

    return {
      anonymised_entities: Array.from(anonymisedEntities),
      cleanup: this.finalizeCleanup(cleanup),
    };
  }

  async anonymiseParent(
    tenantId: string,
    parentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const cleanup = this.createCleanupAccumulator();
    const tokenEntityIds = new Set<string>([parentId]);
    const result = await this.anonymiseParentRecord(tx, tenantId, parentId, cleanup, tokenEntityIds);

    if (result.anonymised && !result.alreadyAnonymised && tokenEntityIds.size > 0) {
      await tx.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_id: { in: Array.from(tokenEntityIds) },
        },
      });
    }
  }

  async anonymiseStudent(
    tenantId: string,
    studentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const cleanup = this.createCleanupAccumulator();
    const tokenEntityIds = new Set<string>([studentId]);
    const result = await this.anonymiseStudentRecord(tx, tenantId, studentId, cleanup, tokenEntityIds);

    if (result.anonymised && !result.alreadyAnonymised && tokenEntityIds.size > 0) {
      await tx.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_id: { in: Array.from(tokenEntityIds) },
        },
      });
    }
  }

  async anonymiseHousehold(
    tenantId: string,
    householdId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const cleanup = this.createCleanupAccumulator();
    const tokenEntityIds = new Set<string>([householdId]);
    const result = await this.anonymiseHouseholdRecord(tx, tenantId, householdId, cleanup, tokenEntityIds);

    if (result.anonymised && !result.alreadyAnonymised && tokenEntityIds.size > 0) {
      await tx.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_id: { in: Array.from(tokenEntityIds) },
        },
      });
    }
  }

  async anonymiseStaff(
    tenantId: string,
    staffProfileId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const cleanup = this.createCleanupAccumulator();
    const result = await this.anonymiseStaffRecord(tx, tenantId, staffProfileId, null, cleanup);

    if (result.anonymised && !result.alreadyAnonymised) {
      await tx.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_id: { in: [staffProfileId] },
        },
      });
    }
  }

  // ─── Parent ───────────────────────────────────────────────────────────────

  private async anonymiseParentRecord(
    tx: PrismaClient,
    tenantId: string,
    parentId: string,
    cleanup: CleanupAccumulator,
    tokenEntityIds: Set<string>,
  ): Promise<{ anonymised: boolean; alreadyAnonymised?: boolean }> {
    const parent = await tx.parent.findFirst({
      where: { id: parentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        user_id: true,
      },
    });

    if (!parent) {
      return { anonymised: false };
    }

    if (isAnonymisedValue(parent.first_name)) {
      return { anonymised: true, alreadyAnonymised: true };
    }

    const tag = buildTag(parentId);
    cleanup.searchRemovals.add(encodeSearchRemoval('parents', parentId));
    tokenEntityIds.add(parentId);

    if (parent.user_id) {
      cleanup.unreadNotificationUserIds.add(parent.user_id);
      cleanup.sessionUserIds.add(parent.user_id);
      await this.addMembershipCleanup(tx, tenantId, parent.user_id, cleanup);
      await this.anonymiseNotificationRecipientRecords(tx, tenantId, parent.user_id, tag);
    }

    const inquiryIds = await this.findParentInquiryIds(tx, tenantId, {
      parentIds: [parentId],
      studentIds: [],
    });
    await this.anonymiseInquiryThreads(tx, tenantId, inquiryIds, tag, { clearStudentLink: false });

    const applicationIds = await this.findApplicationsByParent(tx, tenantId, parentId);
    await this.anonymiseApplications(tx, tenantId, applicationIds, 'parent', tokenEntityIds, cleanup);

    await tx.parent.update({
      where: { id: parentId },
      data: {
        first_name: tag,
        last_name: tag,
        email: `${tag}@anonymised.local`,
        phone: tag,
        whatsapp_phone: tag,
      },
    });

    return { anonymised: true };
  }

  // ─── Student ──────────────────────────────────────────────────────────────

  private async anonymiseStudentRecord(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    cleanup: CleanupAccumulator,
    tokenEntityIds: Set<string>,
  ): Promise<{ anonymised: boolean; alreadyAnonymised?: boolean }> {
    const student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        date_of_birth: true,
        student_parents: {
          select: { parent_id: true },
        },
      },
    });

    if (!student) {
      return { anonymised: false };
    }

    if (isAnonymisedValue(student.first_name)) {
      return { anonymised: true, alreadyAnonymised: true };
    }

    const tag = buildTag(studentId);
    const parentIds = student.student_parents.map((link) => link.parent_id);
    const attendanceRecordIds = await this.findAttendanceRecordIds(tx, tenantId, studentId);

    cleanup.searchRemovals.add(encodeSearchRemoval('students', studentId));
    cleanup.previewKeys.add(`preview:student:${studentId}`);
    cleanup.cachePatterns.add(`ai:progress_summary:${tenantId}:${studentId}:*`);
    cleanup.cachePatterns.add(`behaviour:points:${tenantId}:${studentId}:*`);
    cleanup.cachePatterns.add(`transcript:${tenantId}:${studentId}`);
    tokenEntityIds.add(studentId);

    await tx.student.update({
      where: { id: studentId },
      data: {
        first_name: tag,
        middle_name: tag,
        last_name: tag,
        full_name: tag,
        first_name_ar: tag,
        last_name_ar: tag,
        full_name_ar: tag,
        student_number: tag,
        date_of_birth: toYearOnlyDate(student.date_of_birth),
        national_id: null,
        gender: null,
        nationality: null,
        city_of_birth: null,
        medical_notes: null,
        allergy_details: null,
        has_allergy: false,
      },
    });

    await tx.attendanceRecord.updateMany({
      where: { tenant_id: tenantId, student_id: studentId },
      data: {
        reason: null,
        amendment_reason: null,
      },
    });

    await tx.grade.updateMany({
      where: { tenant_id: tenantId, student_id: studentId },
      data: {
        comment: null,
      },
    });

    await tx.periodGradeSnapshot.updateMany({
      where: { tenant_id: tenantId, student_id: studentId },
      data: {
        override_reason: null,
      },
    });

    await this.anonymiseAttendanceNotifications(tx, tenantId, attendanceRecordIds, tag);
    await this.anonymiseReportCards(tx, tenantId, studentId, tag);

    const inquiryIds = await this.findParentInquiryIds(tx, tenantId, {
      parentIds: [],
      studentIds: [studentId],
    });
    await this.anonymiseInquiryThreads(tx, tenantId, inquiryIds, tag, { clearStudentLink: true });

    const applicationIds = await this.findApplicationsByStudent(
      tx,
      tenantId,
      {
        student_first_name: student.first_name,
        student_last_name: student.last_name,
        date_of_birth: student.date_of_birth,
      },
      parentIds,
    );
    await this.anonymiseApplications(tx, tenantId, applicationIds, 'student', tokenEntityIds, cleanup);

    return { anonymised: true };
  }

  // ─── Household ────────────────────────────────────────────────────────────

  private async anonymiseHouseholdRecord(
    tx: PrismaClient,
    tenantId: string,
    householdId: string,
    cleanup: CleanupAccumulator,
    tokenEntityIds: Set<string>,
  ): Promise<{ anonymised: boolean; alreadyAnonymised?: boolean }> {
    const household = await tx.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        household_name: true,
      },
    });

    if (!household) {
      return { anonymised: false };
    }

    if (isAnonymisedValue(household.household_name)) {
      return { anonymised: true, alreadyAnonymised: true };
    }

    const tag = buildTag(householdId);
    const parentIds = await this.findHouseholdParentIds(tx, tenantId, householdId);
    const students = await tx.student.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        date_of_birth: true,
      },
    });
    const studentIds = students.map((student) => student.id);

    cleanup.searchRemovals.add(encodeSearchRemoval('households', householdId));
    cleanup.previewKeys.add(`preview:household:${householdId}`);
    for (const studentId of studentIds) {
      cleanup.previewKeys.add(`preview:student:${studentId}`);
    }
    tokenEntityIds.add(householdId);

    await tx.household.update({
      where: { id: householdId },
      data: {
        household_name: tag,
        address_line_1: null,
        address_line_2: null,
        city: null,
        country: null,
        postal_code: null,
      },
    });

    const inquiryIds = await this.findParentInquiryIds(tx, tenantId, {
      parentIds,
      studentIds,
    });
    await this.anonymiseInquiryThreads(tx, tenantId, inquiryIds, tag, { clearStudentLink: true });

    const applicationIds = await this.findApplicationsByHousehold(
      tx,
      tenantId,
      students,
      parentIds,
    );
    await this.anonymiseApplications(tx, tenantId, applicationIds, 'household', tokenEntityIds, cleanup);

    return { anonymised: true };
  }

  // ─── Staff ────────────────────────────────────────────────────────────────

  private async anonymiseStaffRecord(
    tx: PrismaClient,
    tenantId: string,
    staffProfileId: string,
    userId: string | null,
    cleanup: CleanupAccumulator,
  ): Promise<{ anonymised: boolean; alreadyAnonymised?: boolean }> {
    const staffProfile = await tx.staffProfile.findFirst({
      where: { id: staffProfileId, tenant_id: tenantId },
      select: {
        id: true,
        job_title: true,
      },
    });

    if (!staffProfile) {
      return { anonymised: false };
    }

    if (isAnonymisedValue(staffProfile.job_title)) {
      return { anonymised: true, alreadyAnonymised: true };
    }

    const tag = buildTag(staffProfileId);
    cleanup.searchRemovals.add(encodeSearchRemoval('staff', staffProfileId));
    cleanup.previewKeys.add(`preview:staff:${staffProfileId}`);

    if (userId) {
      cleanup.unreadNotificationUserIds.add(userId);
      cleanup.sessionUserIds.add(userId);
    }

    await tx.staffProfile.update({
      where: { id: staffProfileId },
      data: {
        staff_number: tag,
        job_title: tag,
        department: tag,
        bank_account_number_encrypted: null,
        bank_iban_encrypted: null,
      },
    });

    await tx.payrollEntry.updateMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      data: {
        notes: tag,
        override_note: tag,
      },
    });

    await this.anonymisePayslips(tx, tenantId, staffProfileId, tag);

    return { anonymised: true };
  }

  // ─── Applications ─────────────────────────────────────────────────────────

  private async findApplicationsByParent(
    tx: PrismaClient,
    tenantId: string,
    parentId: string,
  ): Promise<string[]> {
    const applications = await tx.application.findMany({
      where: {
        tenant_id: tenantId,
        submitted_by_parent_id: parentId,
      },
      select: { id: true },
    });

    return applications.map((application) => application.id);
  }

  private async findApplicationsByStudent(
    tx: PrismaClient,
    tenantId: string,
    student: {
      student_first_name: string;
      student_last_name: string;
      date_of_birth: Date;
    },
    parentIds: string[],
  ): Promise<string[]> {
    const where: Prisma.ApplicationWhereInput = {
      tenant_id: tenantId,
      student_first_name: {
        equals: student.student_first_name,
        mode: 'insensitive',
      },
      student_last_name: {
        equals: student.student_last_name,
        mode: 'insensitive',
      },
      date_of_birth: student.date_of_birth,
    };

    if (parentIds.length > 0) {
      where.submitted_by_parent_id = { in: parentIds };
    } else {
      return [];
    }

    const applications = await tx.application.findMany({
      where,
      select: { id: true },
    });

    return applications.map((application) => application.id);
  }

  private async findApplicationsByHousehold(
    tx: PrismaClient,
    tenantId: string,
    students: Array<{
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: Date;
    }>,
    parentIds: string[],
  ): Promise<string[]> {
    if (students.length === 0 || parentIds.length === 0) {
      return [];
    }

    const applications = await tx.application.findMany({
      where: {
        tenant_id: tenantId,
        submitted_by_parent_id: { in: parentIds },
        OR: students.map((student) => ({
          student_first_name: {
            equals: student.first_name,
            mode: 'insensitive',
          },
          student_last_name: {
            equals: student.last_name,
            mode: 'insensitive',
          },
          date_of_birth: student.date_of_birth,
        })),
      },
      select: { id: true },
    });

    return applications.map((application) => application.id);
  }

  private async anonymiseApplications(
    tx: PrismaClient,
    tenantId: string,
    applicationIds: string[],
    scope: ApplicationScope,
    tokenEntityIds: Set<string>,
    cleanup: CleanupAccumulator,
  ): Promise<void> {
    if (applicationIds.length === 0) {
      return;
    }

    const applications = await tx.application.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: applicationIds },
      },
      select: {
        id: true,
        date_of_birth: true,
      },
    });

    for (const application of applications) {
      const tag = buildTag(application.id);
      tokenEntityIds.add(application.id);
      cleanup.searchRemovals.add(encodeSearchRemoval('applications', application.id));

      const data: Prisma.ApplicationUpdateInput = {
        submitted_by: { disconnect: true },
        payload_json: buildApplicationPayload(scope, tag) as Prisma.InputJsonValue,
        rejection_reason: null,
      };

      if (scope !== 'parent') {
        data.student_first_name = tag;
        data.student_last_name = tag;
        data.date_of_birth = application.date_of_birth
          ? toYearOnlyDate(application.date_of_birth)
          : null;
      }

      await tx.application.update({
        where: { id: application.id },
        data,
      });
    }

    const notes = await tx.applicationNote.findMany({
      where: {
        tenant_id: tenantId,
        application_id: { in: applicationIds },
      },
      select: {
        id: true,
      },
    });

    for (const note of notes) {
      await tx.applicationNote.update({
        where: { id: note.id },
        data: {
          note: buildTag(note.id),
        },
      });
    }
  }

  // ─── Inquiries ────────────────────────────────────────────────────────────

  private async findParentInquiryIds(
    tx: PrismaClient,
    tenantId: string,
    params: {
      parentIds: string[];
      studentIds: string[];
    },
  ): Promise<string[]> {
    if (params.parentIds.length === 0 && params.studentIds.length === 0) {
      return [];
    }

    const inquiries = await tx.parentInquiry.findMany({
      where: {
        tenant_id: tenantId,
        OR: [
          ...(params.parentIds.length > 0
            ? [{ parent_id: { in: params.parentIds } }]
            : []),
          ...(params.studentIds.length > 0
            ? [{ student_id: { in: params.studentIds } }]
            : []),
        ],
      },
      select: { id: true },
    });

    return inquiries.map((inquiry) => inquiry.id);
  }

  private async anonymiseInquiryThreads(
    tx: PrismaClient,
    tenantId: string,
    inquiryIds: string[],
    tag: string,
    options: { clearStudentLink: boolean },
  ): Promise<void> {
    if (inquiryIds.length === 0) {
      return;
    }

    for (const inquiryId of inquiryIds) {
      const updateData: Prisma.ParentInquiryUpdateInput = {
        subject: buildTag(inquiryId),
      };

      if (options.clearStudentLink) {
        updateData.student = { disconnect: true };
      }

      await tx.parentInquiry.update({
        where: { id: inquiryId },
        data: updateData,
      });
    }

    const messages = await tx.parentInquiryMessage.findMany({
      where: {
        tenant_id: tenantId,
        inquiry_id: { in: inquiryIds },
      },
      select: { id: true },
    });

    for (const message of messages) {
      await tx.parentInquiryMessage.update({
        where: { id: message.id },
        data: {
          message: buildTag(message.id),
        },
      });
    }

    // Keep status/channel metadata intact; only strip message payload.
    await this.anonymiseInquiryNotifications(tx, tenantId, inquiryIds, tag);
  }

  private async anonymiseInquiryNotifications(
    tx: PrismaClient,
    tenantId: string,
    inquiryIds: string[],
    tag: string,
  ): Promise<void> {
    if (inquiryIds.length === 0) {
      return;
    }

    await tx.notification.updateMany({
      where: {
        tenant_id: tenantId,
        source_entity_type: 'parent_inquiry',
        source_entity_id: { in: inquiryIds },
      },
      data: buildNotificationAnonymisationPayload(tag),
    });
  }

  // ─── Attendance / Grades / Report Cards ──────────────────────────────────

  private async findAttendanceRecordIds(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const attendanceRecords = await tx.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      select: { id: true },
    });

    return attendanceRecords.map((record) => record.id);
  }

  private async anonymiseAttendanceNotifications(
    tx: PrismaClient,
    tenantId: string,
    attendanceRecordIds: string[],
    tag: string,
  ): Promise<void> {
    if (attendanceRecordIds.length === 0) {
      return;
    }

    await tx.notification.updateMany({
      where: {
        tenant_id: tenantId,
        source_entity_type: 'attendance_record',
        source_entity_id: { in: attendanceRecordIds },
      },
      data: buildNotificationAnonymisationPayload(tag),
    });
  }

  private async anonymiseReportCards(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    tag: string,
  ): Promise<void> {
    const reportCards = await tx.reportCard.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: {
        id: true,
        snapshot_payload_json: true,
      },
    });

    await tx.reportCard.updateMany({
      where: { tenant_id: tenantId, student_id: studentId },
      data: {
        teacher_comment: null,
        principal_comment: null,
      },
    });

    for (const reportCard of reportCards) {
      const payload = reportCard.snapshot_payload_json as JsonLike;
      await tx.reportCard.update({
        where: { id: reportCard.id },
        data: {
          snapshot_payload_json: anonymiseReportCardPayload(payload, tag) as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ─── Staff / Payslips ─────────────────────────────────────────────────────

  private async anonymisePayslips(
    tx: PrismaClient,
    tenantId: string,
    staffProfileId: string,
    tag: string,
  ): Promise<void> {
    const payslips = await tx.payslip.findMany({
      where: {
        tenant_id: tenantId,
        payroll_entry: {
          staff_profile_id: staffProfileId,
        },
      },
      select: {
        id: true,
        snapshot_payload_json: true,
      },
    });

    for (const payslip of payslips) {
      const payload = payslip.snapshot_payload_json as JsonLike;
      await tx.payslip.update({
        where: { id: payslip.id },
        data: {
          snapshot_payload_json: anonymisePayslipPayload(payload, tag) as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ─── Notifications / Memberships / Exports ───────────────────────────────

  private async anonymiseNotificationRecipientRecords(
    tx: PrismaClient,
    tenantId: string,
    userId: string,
    tag: string,
  ): Promise<void> {
    await tx.notification.updateMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
      },
      data: buildNotificationAnonymisationPayload(tag),
    });
  }

  private async addMembershipCleanup(
    tx: PrismaClient,
    tenantId: string,
    userId: string,
    cleanup: CleanupAccumulator,
  ): Promise<void> {
    const memberships = await tx.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
      select: { id: true },
    });

    for (const membership of memberships) {
      cleanup.permissionMembershipIds.add(membership.id);
    }
  }

  private async collectComplianceExportCleanup(
    tx: PrismaClient,
    tenantId: string,
    subjectId: string,
    cleanup: CleanupAccumulator,
  ): Promise<void> {
    const requests = await tx.complianceRequest.findMany({
      where: {
        tenant_id: tenantId,
        subject_id: subjectId,
        export_file_key: { not: null },
      },
      select: {
        id: true,
        export_file_key: true,
      },
    });

    for (const request of requests) {
      if (request.export_file_key) {
        cleanup.s3ObjectKeys.add(request.export_file_key);
        cleanup.complianceRequestIdsToClear.add(request.id);
      }
    }
  }

  private async findLinkedParentIds(
    tx: PrismaClient,
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const parents = await tx.parent.findMany({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
      select: { id: true },
    });

    return parents.map((parent) => parent.id);
  }

  private async findHouseholdParentIds(
    tx: PrismaClient,
    tenantId: string,
    householdId: string,
  ): Promise<string[]> {
    const parents = await tx.householdParent.findMany({
      where: {
        tenant_id: tenantId,
        household_id: householdId,
      },
      select: { parent_id: true },
    });

    return parents.map((parent) => parent.parent_id);
  }

  // ─── Cleanup helpers ──────────────────────────────────────────────────────

  private createCleanupAccumulator(): CleanupAccumulator {
    return {
      searchRemovals: new Set<string>(),
      previewKeys: new Set<string>(),
      cachePatterns: new Set<string>(),
      unreadNotificationUserIds: new Set<string>(),
      sessionUserIds: new Set<string>(),
      permissionMembershipIds: new Set<string>(),
      s3ObjectKeys: new Set<string>(),
      complianceRequestIdsToClear: new Set<string>(),
    };
  }

  private finalizeCleanup(cleanup: CleanupAccumulator): AnonymisationCleanupPlan {
    return {
      searchRemovals: Array.from(cleanup.searchRemovals)
        .map(decodeSearchRemoval)
        .sort((left, right) =>
          `${left.entityType}:${left.entityId}`.localeCompare(
            `${right.entityType}:${right.entityId}`,
          ),
        ),
      previewKeys: Array.from(cleanup.previewKeys).sort(),
      cachePatterns: Array.from(cleanup.cachePatterns).sort(),
      unreadNotificationUserIds: Array.from(cleanup.unreadNotificationUserIds).sort(),
      sessionUserIds: Array.from(cleanup.sessionUserIds).sort(),
      permissionMembershipIds: Array.from(cleanup.permissionMembershipIds).sort(),
      s3ObjectKeys: Array.from(cleanup.s3ObjectKeys).sort(),
      complianceRequestIdsToClear: Array.from(cleanup.complianceRequestIdsToClear).sort(),
    };
  }
}

// ─── JSON transforms ────────────────────────────────────────────────────────

function anonymiseReportCardPayload(payload: JsonLike, tag: string): JsonLike {
  if (!isJsonObject(payload)) {
    return payload;
  }

  const clone = { ...payload };

  if ('student_name' in clone) {
    clone['student_name'] = tag;
  }
  if ('student_first_name' in clone) {
    clone['student_first_name'] = tag;
  }
  if ('student_last_name' in clone) {
    clone['student_last_name'] = tag;
  }
  if ('teacher_comment' in clone) {
    clone['teacher_comment'] = null;
  }
  if ('principal_comment' in clone) {
    clone['principal_comment'] = null;
  }

  const student = clone['student'] ?? null;
  if (isJsonObject(student)) {
    clone['student'] = {
      ...student,
      full_name: tag,
      first_name: tag,
      last_name: tag,
      student_number: tag,
    } as JsonObject;
  }

  return clone;
}

function anonymisePayslipPayload(payload: JsonLike, tag: string): JsonLike {
  if (!isJsonObject(payload)) {
    return payload;
  }

  const clone = { ...payload };

  if ('staff_name' in clone) {
    clone['staff_name'] = tag;
  }
  if ('employee_name' in clone) {
    clone['employee_name'] = tag;
  }
  if ('job_title' in clone) {
    clone['job_title'] = tag;
  }
  if ('department' in clone) {
    clone['department'] = tag;
  }

  const staff = clone['staff'] ?? null;
  if (isJsonObject(staff)) {
    clone['staff'] = {
      ...staff,
      full_name: tag,
      staff_number: tag,
      department: tag,
      job_title: tag,
      bank_account_last4: null,
      bank_iban_last4: null,
    } as JsonObject;
  }

  return clone;
}

function buildApplicationPayload(scope: ApplicationScope, tag: string): JsonObject {
  return {
    anonymised: true,
    anonymisation_scope: scope,
    anonymisation_tag: tag,
  };
}

function buildNotificationAnonymisationPayload(
  tag: string,
): Prisma.NotificationUpdateManyMutationInput {
  return {
    payload_json: {
      anonymised: true,
      anonymisation_tag: tag,
    } as Prisma.InputJsonValue,
    failure_reason: null,
  };
}

// ─── Generic helpers ────────────────────────────────────────────────────────

function buildTag(id: string): string {
  return `${ANONYMISED_PREFIX}${id}`;
}

function isAnonymisedValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ANONYMISED_PREFIX);
}

function toYearOnlyDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function isJsonObject(value: JsonLike): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeSearchRemoval(
  entityType: AnonymisationSearchEntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

function decodeSearchRemoval(value: string): AnonymisationSearchRemoval {
  const [entityType, ...rest] = value.split(':');
  return {
    entityType: entityType as AnonymisationSearchEntityType,
    entityId: rest.join(':'),
  };
}
