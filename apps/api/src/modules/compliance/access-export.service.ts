import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class AccessExportService {
  private readonly logger = new Logger(AccessExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Export all subject-visible data as JSON and upload to S3.
   * Returns the S3 key for the uploaded file.
   */
  async exportSubjectData(
    tenantId: string,
    subjectType: string,
    subjectId: string,
    requestId: string,
  ): Promise<{ s3Key: string }> {
    let exportData: Record<string, unknown> = {};

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx: PrismaClient) => {
      switch (subjectType) {
        case 'parent':
          exportData = await this.exportParentData(tenantId, subjectId, tx);
          break;
        case 'student':
          exportData = await this.exportStudentData(tenantId, subjectId, tx);
          break;
        case 'household':
          exportData = await this.exportHouseholdData(tenantId, subjectId, tx);
          break;
        case 'user':
          exportData = await this.exportUserData(subjectId, tx);
          break;
      }
    });

    const jsonPayload = JSON.stringify(
      {
        export_generated_at: new Date().toISOString(),
        subject_type: subjectType,
        subject_id: subjectId,
        tenant_id: tenantId,
        data: exportData,
      },
      null,
      2,
    );

    const s3Key = `compliance-exports/${requestId}.json`;
    const buffer = Buffer.from(jsonPayload, 'utf-8');

    const fullKey = await this.s3Service.upload(
      tenantId,
      s3Key,
      buffer,
      'application/json',
    );

    this.logger.log(
      `Exported ${subjectType}:${subjectId} data to S3 key: ${fullKey}`,
    );

    return { s3Key: fullKey };
  }

  /**
   * Export parent data: profile, linked students, household membership,
   * communication preferences (preferred_contact_channels).
   */
  private async exportParentData(
    tenantId: string,
    parentId: string,
    tx: PrismaClient,
  ): Promise<Record<string, unknown>> {
    const parent = await tx.parent.findFirst({
      where: { id: parentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        whatsapp_phone: true,
        preferred_contact_channels: true,
        relationship_label: true,
        is_primary_contact: true,
        is_billing_contact: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Linked students via student_parents join
    const studentLinks = await tx.studentParent.findMany({
      where: { parent_id: parentId, tenant_id: tenantId },
      select: {
        relationship_label: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
      },
    });

    // Household membership
    const householdLinks = await tx.householdParent.findMany({
      where: { parent_id: parentId, tenant_id: tenantId },
      select: {
        role_label: true,
        household: {
          select: {
            id: true,
            household_name: true,
          },
        },
      },
    });

    return {
      profile: parent,
      linked_students: studentLinks.map((link) => ({
        student_id: link.student.id,
        student_name: `${link.student.first_name} ${link.student.last_name}`,
        student_number: link.student.student_number,
        relationship: link.relationship_label,
      })),
      household_memberships: householdLinks.map((link) => ({
        household_id: link.household.id,
        household_name: link.household.household_name,
        role: link.role_label,
      })),
    };
  }

  /**
   * Export student data: profile, attendance records (last 100),
   * grades, class enrolments.
   */
  private async exportStudentData(
    tenantId: string,
    studentId: string,
    tx: PrismaClient,
  ): Promise<Record<string, unknown>> {
    const student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        full_name: true,
        first_name_ar: true,
        last_name_ar: true,
        full_name_ar: true,
        student_number: true,
        date_of_birth: true,
        gender: true,
        status: true,
        entry_date: true,
        exit_date: true,
        medical_notes: true,
        has_allergy: true,
        allergy_details: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Attendance records (last 100)
    const attendanceRecords = await tx.attendanceRecord.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      orderBy: { marked_at: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        reason: true,
        marked_at: true,
        created_at: true,
      },
    });

    // Grades
    const grades = await tx.grade.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        raw_score: true,
        is_missing: true,
        comment: true,
        entered_at: true,
        created_at: true,
      },
    });

    // Class enrolments
    const classEnrolments = await tx.classEnrolment.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        start_date: true,
        end_date: true,
        class_entity: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      profile: student,
      attendance_records: attendanceRecords,
      grades,
      class_enrolments: classEnrolments.map((enrolment) => ({
        id: enrolment.id,
        class_id: enrolment.class_entity.id,
        class_name: enrolment.class_entity.name,
        status: enrolment.status,
        start_date: enrolment.start_date,
        end_date: enrolment.end_date,
      })),
    };
  }

  /**
   * Export household data: profile, linked parents/students,
   * invoices (last 50), payments (last 50).
   */
  private async exportHouseholdData(
    tenantId: string,
    householdId: string,
    tx: PrismaClient,
  ): Promise<Record<string, unknown>> {
    const household = await tx.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        household_name: true,
        address_line_1: true,
        address_line_2: true,
        city: true,
        country: true,
        postal_code: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Linked parents
    const parentLinks = await tx.householdParent.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      select: {
        role_label: true,
        parent: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    // Linked students
    const students = await tx.student.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
      },
    });

    // Invoices (last 50)
    const invoices = await tx.invoice.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        invoice_number: true,
        status: true,
        issue_date: true,
        due_date: true,
        total_amount: true,
        balance_amount: true,
        currency_code: true,
        created_at: true,
      },
    });

    // Payments (last 50)
    const payments = await tx.payment.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        payment_reference: true,
        payment_method: true,
        amount: true,
        currency_code: true,
        status: true,
        received_at: true,
        created_at: true,
      },
    });

    return {
      profile: household,
      linked_parents: parentLinks.map((link) => ({
        parent_id: link.parent.id,
        parent_name: `${link.parent.first_name} ${link.parent.last_name}`,
        email: link.parent.email,
        role: link.role_label,
      })),
      linked_students: students.map((s) => ({
        student_id: s.id,
        student_name: `${s.first_name} ${s.last_name}`,
        student_number: s.student_number,
      })),
      invoices,
      payments,
    };
  }

  /**
   * Export user data: basic user profile (no tenant-scoped data).
   */
  private async exportUserData(
    userId: string,
    tx: PrismaClient,
  ): Promise<Record<string, unknown>> {
    const user = await tx.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      profile: user,
    };
  }
}
