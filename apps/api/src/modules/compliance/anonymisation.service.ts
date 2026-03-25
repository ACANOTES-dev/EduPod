import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnonymisationService {
  private readonly logger = new Logger(AnonymisationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anonymise a subject's personal data. Dispatches to type-specific methods.
   * Each entity type is processed independently so a failure in one doesn't block others.
   * Idempotent: already-anonymised records are skipped.
   */
  async anonymiseSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<{ anonymised_entities: string[] }> {
    const anonymised: string[] = [];

    switch (subjectType) {
      case 'parent': {
        const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
        await rlsClient.$transaction(async (tx: PrismaClient) => {
          await this.anonymiseParent(tenantId, subjectId, tx);
          anonymised.push('parent');
        });
        break;
      }
      case 'student': {
        const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
        await rlsClient.$transaction(async (tx: PrismaClient) => {
          await this.anonymiseStudent(tenantId, subjectId, tx);
          anonymised.push('student');
        });
        break;
      }
      case 'household': {
        const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
        await rlsClient.$transaction(async (tx: PrismaClient) => {
          await this.anonymiseHousehold(tenantId, subjectId, tx);
          anonymised.push('household');
        });
        break;
      }
      case 'user': {
        // For user subject type, anonymise the associated staff profile if it exists
        const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
        await rlsClient.$transaction(async (tx: PrismaClient) => {
          const staffProfile = await tx.staffProfile.findFirst({
            where: { user_id: subjectId, tenant_id: tenantId },
            select: { id: true },
          });
          if (staffProfile) {
            await this.anonymiseStaff(tenantId, staffProfile.id, tx);
            anonymised.push('staff_profile');
          }
        });
        break;
      }
    }

    this.logger.log(
      `Anonymised subject ${subjectType}:${subjectId} in tenant ${tenantId}. Entities: ${anonymised.join(', ')}`,
    );

    return { anonymised_entities: anonymised };
  }

  /**
   * Anonymise a parent record.
   * Replaces first_name, last_name, email, phone with ANONYMISED-{parentId}.
   * Idempotent: checks if already anonymised.
   */
  async anonymiseParent(
    _tenantId: string,
    parentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const parent = await tx.parent.findFirst({
      where: { id: parentId },
      select: { id: true, first_name: true },
    });

    if (!parent) return;

    // Idempotency check
    if (parent.first_name.startsWith('ANONYMISED-')) return;

    const anonValue = `ANONYMISED-${parentId}`;

    await tx.parent.update({
      where: { id: parentId },
      data: {
        first_name: anonValue,
        last_name: anonValue,
        email: `${anonValue}@anonymised.local`,
        phone: anonValue,
        whatsapp_phone: anonValue,
      },
    });
  }

  /**
   * Anonymise a student record.
   * Replaces first_name, last_name, student_number with ANONYMISED-{studentId}.
   * Also anonymises student name in report_cards snapshot_payload_json.
   */
  async anonymiseStudent(
    tenantId: string,
    studentId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const student = await tx.student.findFirst({
      where: { id: studentId },
      select: { id: true, first_name: true },
    });

    if (!student) return;

    // Idempotency check
    if (student.first_name.startsWith('ANONYMISED-')) return;

    const anonValue = `ANONYMISED-${studentId}`;

    await tx.student.update({
      where: { id: studentId },
      data: {
        first_name: anonValue,
        last_name: anonValue,
        first_name_ar: anonValue,
        last_name_ar: anonValue,
        student_number: anonValue,
      },
    });

    // Anonymise student name in report card snapshots
    const reportCards = await tx.reportCard.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      select: { id: true, snapshot_payload_json: true },
    });

    for (const rc of reportCards) {
      const payload = rc.snapshot_payload_json as Record<string, unknown>;
      if (payload && typeof payload === 'object') {
        const anonymisedPayload = { ...payload };
        if ('student_name' in anonymisedPayload) {
          anonymisedPayload.student_name = anonValue;
        }
        if ('student_first_name' in anonymisedPayload) {
          anonymisedPayload.student_first_name = anonValue;
        }
        if ('student_last_name' in anonymisedPayload) {
          anonymisedPayload.student_last_name = anonValue;
        }
        await tx.reportCard.update({
          where: { id: rc.id },
          data: { snapshot_payload_json: anonymisedPayload as unknown as Prisma.InputJsonValue },
        });
      }
    }
  }

  /**
   * Anonymise a household record.
   * Replaces household_name with ANONYMISED-{householdId}.
   */
  async anonymiseHousehold(
    _tenantId: string,
    householdId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const household = await tx.household.findFirst({
      where: { id: householdId },
      select: { id: true, household_name: true },
    });

    if (!household) return;

    // Idempotency check
    if (household.household_name.startsWith('ANONYMISED-')) return;

    const anonValue = `ANONYMISED-${householdId}`;

    await tx.household.update({
      where: { id: householdId },
      data: {
        household_name: anonValue,
      },
    });
  }

  /**
   * Anonymise a staff profile.
   * Replaces job_title, department with ANONYMISED-{staffProfileId}.
   * Also anonymises payroll_entries and payslips snapshot_payload_json.
   */
  async anonymiseStaff(
    tenantId: string,
    staffProfileId: string,
    tx: PrismaClient,
  ): Promise<void> {
    const staffProfile = await tx.staffProfile.findFirst({
      where: { id: staffProfileId },
      select: { id: true, job_title: true },
    });

    if (!staffProfile) return;

    // Idempotency check
    if (staffProfile.job_title?.startsWith('ANONYMISED-')) return;

    const anonValue = `ANONYMISED-${staffProfileId}`;

    await tx.staffProfile.update({
      where: { id: staffProfileId },
      data: {
        job_title: anonValue,
        department: anonValue,
      },
    });

    // Anonymise payroll entries notes
    await tx.payrollEntry.updateMany({
      where: { staff_profile_id: staffProfileId, tenant_id: tenantId },
      data: { notes: anonValue },
    });

    // Anonymise payslip snapshot payloads
    const payslips = await tx.payslip.findMany({
      where: {
        tenant_id: tenantId,
        payroll_entry: { staff_profile_id: staffProfileId },
      },
      select: { id: true, snapshot_payload_json: true },
    });

    for (const payslip of payslips) {
      const payload = payslip.snapshot_payload_json as Record<string, unknown>;
      if (payload && typeof payload === 'object') {
        const anonymisedPayload = { ...payload };
        if ('staff_name' in anonymisedPayload) {
          anonymisedPayload.staff_name = anonValue;
        }
        if ('employee_name' in anonymisedPayload) {
          anonymisedPayload.employee_name = anonValue;
        }
        if ('job_title' in anonymisedPayload) {
          anonymisedPayload.job_title = anonValue;
        }
        if ('department' in anonymisedPayload) {
          anonymisedPayload.department = anonValue;
        }
        await tx.payslip.update({
          where: { id: payslip.id },
          data: { snapshot_payload_json: anonymisedPayload as unknown as Prisma.InputJsonValue },
        });
      }
    }
  }
}
