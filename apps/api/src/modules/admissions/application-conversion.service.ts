import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CONSENT_TYPES, mapConsentCaptureToTypes } from '@school/shared/gdpr';
import type { ConsentCaptureDto } from '@school/shared/gdpr';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { parseConversionPayload } from './application-conversion-payload.helper';
import type { ConversionPayload } from './application-conversion-payload.helper';

export interface ConvertToStudentResult {
  student_id: string;
  household_id: string;
  primary_parent_id: string;
  secondary_parent_id: string | null;
  created: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationConversionService {
  private readonly logger = new Logger(ApplicationConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
  ) {}

  /**
   * Materialise Household + Parent(s) + Student from a conditional_approval
   * or approved application. Must be called inside a caller-provided
   * interactive transaction that already has the RLS tenant context set.
   *
   * Idempotent via `application.materialised_student_id`. `triggerUserId`
   * attributes consent records; it MUST be a real user (RESTRICT FK) — pass
   * `application.reviewed_by_user_id` for webhook-driven paths or the admin
   * user for cash/bank/override paths.
   *
   * Does NOT change `application.status` — the caller owns that transition.
   * Does NOT assign a homeroom class — principal/VP does that later.
   */
  async convertToStudent(
    db: PrismaService,
    params: { tenantId: string; applicationId: string; triggerUserId: string },
  ): Promise<ConvertToStudentResult> {
    const { tenantId, applicationId, triggerUserId } = params;

    void this.prisma;

    await this.lockApplicationRow(db, tenantId, applicationId);

    const application = await db.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
    });

    if (!application) {
      throw new NotFoundException({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: `Application with id "${applicationId}" not found`,
        },
      });
    }

    // Idempotency short-circuit.
    if (application.materialised_student_id) {
      const existing = await this.loadExistingStudent(
        db,
        tenantId,
        application.materialised_student_id,
      );
      if (existing) return { ...existing, created: false };
      // Row referenced is gone — clear the stale pointer and re-create.
      await db.application.update({
        where: { id: applicationId },
        data: { materialised_student_id: null },
      });
    }

    const payload = parseConversionPayload(application.payload_json);

    // Defensive duplicate-student check — identical first/last/DOB on an
    // active student means a previous conversion committed but the pointer
    // was lost; link rather than duplicating.
    const duplicate = await this.findDuplicateStudent(db, tenantId, application, payload);
    if (duplicate) {
      await db.application.update({
        where: { id: applicationId },
        data: { materialised_student_id: duplicate.student_id },
      });
      return { ...duplicate, created: false };
    }

    const parent1 = await this.resolveOrCreateParent(db, tenantId, {
      first_name: payload.parent1_first_name,
      last_name: payload.parent1_last_name,
      email: payload.parent1_email,
      phone: payload.parent1_phone,
      relationship: payload.parent1_relationship,
      is_primary: true,
    });

    let parent2: { id: string; matched_existing: boolean; household_id: string | null } | null =
      null;
    if (payload.parent2_first_name && payload.parent2_last_name) {
      parent2 = await this.resolveOrCreateParent(db, tenantId, {
        first_name: payload.parent2_first_name,
        last_name: payload.parent2_last_name,
        email: payload.parent2_email,
        phone: payload.parent2_phone,
        relationship: payload.parent2_relationship,
        is_primary: false,
      });
    }

    const householdId = await this.resolveHousehold(db, tenantId, payload, parent1, parent2);

    const studentNumber = await this.sequenceService.nextNumber(tenantId, 'student', db, 'STU');
    const student = await db.student.create({
      data: {
        tenant_id: tenantId,
        household_id: householdId,
        student_number: studentNumber,
        first_name: payload.student_first_name,
        middle_name: payload.student_middle_name,
        last_name: payload.student_last_name,
        date_of_birth: this.resolveDateOfBirth(application, payload),
        gender: payload.student_gender,
        national_id: payload.student_national_id,
        medical_notes: payload.student_medical_notes,
        has_allergy: payload.student_allergies ?? false,
        status: 'active',
        year_group_id: application.target_year_group_id,
        class_homeroom_id: null,
        entry_date: new Date(),
      },
    });

    await db.studentParent.create({
      data: {
        tenant_id: tenantId,
        student_id: student.id,
        parent_id: parent1.id,
        relationship_label: payload.parent1_relationship ?? null,
      },
    });

    if (parent2) {
      await db.studentParent.create({
        data: {
          tenant_id: tenantId,
          student_id: student.id,
          parent_id: parent2.id,
          relationship_label: payload.parent2_relationship ?? null,
        },
      });
    }

    await this.writeConsentRecords(db, tenantId, student.id, triggerUserId, payload.consents);

    await db.application.update({
      where: { id: applicationId },
      data: { materialised_student_id: student.id },
    });

    return {
      student_id: student.id,
      household_id: householdId,
      primary_parent_id: parent1.id,
      secondary_parent_id: parent2?.id ?? null,
      created: true,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async lockApplicationRow(
    db: PrismaService,
    tenantId: string,
    applicationId: string,
  ): Promise<void> {
    const rawTx = db as unknown as {
      $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
    };
    // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE row lock inside RLS transaction
    await rawTx.$queryRaw(
      Prisma.sql`SELECT id FROM applications WHERE id = ${applicationId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`,
    );
  }

  private async loadExistingStudent(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<Omit<ConvertToStudentResult, 'created'> | null> {
    const existing = await db.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      include: {
        student_parents: {
          select: { parent_id: true, parent: { select: { is_primary_contact: true } } },
        },
      },
    });
    if (!existing) return null;

    const parentIds = existing.student_parents.map((sp) => sp.parent_id);
    const primaryFromLink = existing.student_parents.find(
      (sp) => sp.parent?.is_primary_contact === true,
    );
    const primary = primaryFromLink?.parent_id ?? parentIds[0] ?? null;
    const secondary = parentIds.find((id) => id !== primary) ?? null;

    if (!primary) {
      throw new BadRequestException({
        error: {
          code: 'CONVERSION_STATE_CORRUPT',
          message: 'Materialised student exists with no linked parents',
        },
      });
    }

    return {
      student_id: existing.id,
      household_id: existing.household_id,
      primary_parent_id: primary,
      secondary_parent_id: secondary,
    };
  }

  private async resolveOrCreateParent(
    db: PrismaService,
    tenantId: string,
    input: {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      relationship: string | null;
      is_primary: boolean;
    },
  ): Promise<{ id: string; matched_existing: boolean; household_id: string | null }> {
    let matches: Array<{ id: string }> = [];

    if (input.email || input.phone) {
      const or: Prisma.ParentWhereInput[] = [];
      if (input.email) or.push({ email: input.email });
      if (input.phone) or.push({ phone: input.phone });
      matches = await db.parent.findMany({
        where: { tenant_id: tenantId, OR: or },
        select: { id: true },
      });
    }

    if (matches.length === 1) {
      const existingId = matches[0]!.id;
      const link = await db.householdParent.findFirst({
        where: { tenant_id: tenantId, parent_id: existingId },
        select: { household_id: true },
      });
      return { id: existingId, matched_existing: true, household_id: link?.household_id ?? null };
    }

    const created = await db.parent.create({
      data: {
        tenant_id: tenantId,
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        phone: input.phone,
        relationship_label: input.relationship,
        preferred_contact_channels: ['email'],
        is_primary_contact: input.is_primary,
        is_billing_contact: input.is_primary,
        status: 'active',
      },
      select: { id: true },
    });

    if (matches.length > 1) {
      // Ambiguous match — create a new parent and log it. We can't write an
      // ApplicationNote because the webhook-driven path has no authenticated
      // user to attribute authorship to.
      this.logger.warn(
        `[convertToStudent] ambiguous parent match: ${matches.length} candidates for "${input.first_name} ${input.last_name}" (tenant=${tenantId})`,
      );
    }

    return { id: created.id, matched_existing: false, household_id: null };
  }

  private async resolveHousehold(
    db: PrismaService,
    tenantId: string,
    payload: ConversionPayload,
    parent1: { id: string; matched_existing: boolean; household_id: string | null },
    parent2: { id: string; household_id: string | null } | null,
  ): Promise<string> {
    let householdId: string;
    if (parent1.matched_existing && parent1.household_id) {
      householdId = parent1.household_id;
    } else {
      const householdNumber = await this.sequenceService.generateHouseholdReference(tenantId, db);
      const household = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: `${payload.student_last_name} Family`,
          household_number: householdNumber,
          address_line_1: payload.address_line_1,
          address_line_2: payload.address_line_2,
          city: payload.city,
          country: payload.country,
          postal_code: payload.postal_code,
          primary_billing_parent_id: parent1.id,
          status: 'active',
          needs_completion: false,
        },
      });
      householdId = household.id;

      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          parent_id: parent1.id,
          role_label: payload.parent1_relationship ?? null,
        },
      });
    }

    if (parent2) {
      const existingLink = await db.householdParent.findFirst({
        where: { tenant_id: tenantId, household_id: householdId, parent_id: parent2.id },
      });
      if (!existingLink) {
        await db.householdParent.create({
          data: {
            tenant_id: tenantId,
            household_id: householdId,
            parent_id: parent2.id,
            role_label: payload.parent2_relationship ?? null,
          },
        });
      }
    }

    return householdId;
  }

  private async writeConsentRecords(
    db: PrismaService,
    tenantId: string,
    studentId: string,
    triggerUserId: string,
    consents: ConsentCaptureDto | null,
  ): Promise<void> {
    if (!consents) return;

    const grantedTypes = mapConsentCaptureToTypes(consents).filter(
      (t) => t !== CONSENT_TYPES.WHATSAPP_CHANNEL,
    );

    if (grantedTypes.length > 0) {
      await db.consentRecord.createMany({
        data: grantedTypes.map((consent_type) => ({
          tenant_id: tenantId,
          subject_type: 'student',
          subject_id: studentId,
          consent_type,
          status: 'granted',
          granted_by_user_id: triggerUserId,
          evidence_type: 'registration_form',
          privacy_notice_version_id: null,
          notes: null,
        })),
      });
    }

    if (consents.whatsapp_channel) {
      await db.consentRecord.create({
        data: {
          tenant_id: tenantId,
          subject_type: 'student',
          subject_id: studentId,
          consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
          status: 'granted',
          granted_by_user_id: triggerUserId,
          evidence_type: 'registration_form',
          privacy_notice_version_id: null,
          notes: null,
        },
      });
    }
  }

  private async findDuplicateStudent(
    db: PrismaService,
    tenantId: string,
    application: { target_year_group_id: string | null; date_of_birth: Date | null },
    payload: ConversionPayload,
  ): Promise<Omit<ConvertToStudentResult, 'created'> | null> {
    const dob = this.resolveDateOfBirth(application, payload);

    const dup = await db.student.findFirst({
      where: {
        tenant_id: tenantId,
        first_name: payload.student_first_name,
        last_name: payload.student_last_name,
        date_of_birth: dob,
        status: 'active',
      },
      include: {
        student_parents: {
          select: { parent_id: true, parent: { select: { is_primary_contact: true } } },
        },
      },
    });

    if (!dup) return null;

    const parentIds = dup.student_parents.map((sp) => sp.parent_id);
    const primaryFromLink = dup.student_parents.find(
      (sp) => sp.parent?.is_primary_contact === true,
    );
    const primary = primaryFromLink?.parent_id ?? parentIds[0] ?? null;
    const secondary = parentIds.find((id) => id !== primary) ?? null;
    if (!primary) return null;

    return {
      student_id: dup.id,
      household_id: dup.household_id,
      primary_parent_id: primary,
      secondary_parent_id: secondary,
    };
  }

  private resolveDateOfBirth(
    application: { date_of_birth: Date | null },
    payload: ConversionPayload,
  ): Date {
    if (application.date_of_birth) return application.date_of_birth;
    if (payload.student_dob) {
      const parsed = new Date(payload.student_dob);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    throw new BadRequestException({
      error: {
        code: 'PAYLOAD_MALFORMED',
        message: 'Application is missing a valid date of birth for the student',
      },
    });
  }
}
