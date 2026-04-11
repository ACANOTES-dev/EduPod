import { randomUUID } from 'crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApplicationStatus } from '@prisma/client';

import type {
  AdmissionsAnalyticsQuery,
  CreatePublicApplicationDto,
  ListApplicationsQuery,
  ListConditionalApprovalQueueQuery,
  ListRejectedApplicationsQuery,
  ReviewApplicationDto,
} from '@school/shared';
import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { AdmissionsCapacityService } from './admissions-capacity.service';
import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationStateMachineService } from './application-state-machine.service';

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface ApplicationListItem {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  status: string;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  form_definition: { id: string; name: string; version_number: number };
  submitted_by: { id: string; first_name: string; last_name: string } | null;
  _count: { notes: number };
}

export interface ApplicationDetail {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  application_number: string;
  submitted_by_parent_id: string | null;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  status: string;
  waiting_list_substatus: string | null;
  submitted_at: Date | null;
  apply_date: Date | null;
  reviewed_at: Date | null;
  reviewed_by_user_id: string | null;
  rejection_reason: string | null;
  payment_amount_cents: number | null;
  currency_code: string | null;
  payment_deadline: Date | null;
  stripe_checkout_session_id: string | null;
  payload_json: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
  form_definition: {
    id: string;
    name: string;
    version_number: number;
    fields: Array<{
      id: string;
      field_key: string;
      label: string;
      field_type: string;
      required: boolean;
      options_json: Prisma.JsonValue;
      display_order: number;
    }>;
  };
  submitted_by: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  reviewed_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  target_academic_year: { id: string; name: string } | null;
  target_year_group: { id: string; name: string } | null;
  materialised_student: { id: string; first_name: string; last_name: string } | null;
  override_record: ApplicationOverrideRecord | null;
  payment_events: ApplicationPaymentEventSummary[];
  capacity: ApplicationCapacitySummary | null;
  notes: Array<{
    id: string;
    note: string;
    is_internal: boolean;
    created_at: Date;
    author: { id: string; first_name: string; last_name: string };
  }>;
  timeline: ApplicationTimelineEvent[];
}

export interface ApplicationOverrideRecord {
  id: string;
  override_type: string;
  justification: string;
  expected_amount_cents: number;
  actual_amount_cents: number;
  created_at: Date;
  approved_by: { id: string; first_name: string; last_name: string };
}

export interface ApplicationPaymentEventSummary {
  id: string;
  stripe_event_id: string;
  stripe_session_id: string | null;
  amount_cents: number;
  status: string;
  created_at: Date;
}

export interface ApplicationCapacitySummary {
  total_capacity: number;
  enrolled_student_count: number;
  conditional_approval_count: number;
  available_seats: number;
  configured: boolean;
}

export type ApplicationTimelineEventKind =
  | 'submitted'
  | 'status_changed'
  | 'system_event'
  | 'admin_note'
  | 'payment_event'
  | 'override_granted';

export interface ApplicationTimelineEvent {
  id: string;
  kind: ApplicationTimelineEventKind;
  at: Date;
  message: string;
  actor: { id: string; first_name: string; last_name: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Multi-student response shape ────────────────────────────────────────────

export interface CreatePublicResult {
  mode: 'new_household' | 'existing_household';
  submission_batch_id: string;
  household_number: string | null;
  applications: Array<{
    id: string;
    application_number: string;
    status: ApplicationStatus;
    student_first_name: string;
    student_last_name: string;
    target_year_group_id: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: AdmissionsRateLimitService,
    private readonly stateMachineService: ApplicationStateMachineService,
    private readonly capacityService: AdmissionsCapacityService,
    private readonly sequenceService: SequenceService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  // ─── Delegated: State Machine ─────────────────────────────────────────────

  /**
   * Admin review endpoint dispatcher: maps the legacy `{ status }` DTO shape
   * onto the granular new state-machine methods so the `/review` route keeps
   * working while the state graph (impl 03 of the admissions rebuild) enforces
   * the new transitions.
   */
  async review(tenantId: string, id: string, dto: ReviewApplicationDto, userId: string) {
    switch (dto.status) {
      case 'ready_to_admit':
        // ready_to_admit is now a gated entry state only — it is not a target
        // an admin can flip into. Promotion back to ready_to_admit is handled
        // by the auto-promotion service (impl 09).
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message:
              '"ready_to_admit" is not an admin-actionable target; the state machine routes applications into it automatically.',
          },
        });
      case 'conditional_approval':
        return this.stateMachineService.moveToConditionalApproval(tenantId, id, userId);
      case 'approved':
        // Direct approval without a payment event is not permitted in the
        // new flow — use the cash / bank transfer / override endpoints in
        // impl 07 instead.
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message:
              '"approved" cannot be set directly — record a payment or an admin override (impl 07).',
          },
        });
      case 'rejected':
        return this.stateMachineService.reject(tenantId, id, {
          reason: dto.rejection_reason ?? '',
          actingUserId: userId,
        });
      default: {
        // Exhaustiveness guard — ReviewApplicationDto.status only allows the
        // four branches above, so this is unreachable unless the schema grows.
        const exhaustive: never = dto.status;
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Unsupported review target: ${String(exhaustive)}`,
          },
        });
      }
    }
  }

  async withdraw(tenantId: string, id: string, userId: string, isParent: boolean) {
    return this.stateMachineService.withdraw(tenantId, id, {
      actingUserId: userId,
      isParent,
    });
  }

  // ─── Create Public ────────────────────────────────────────────────────────

  /**
   * Multi-student public application submission. Creates one Application row
   * per student, each gated independently through the capacity state machine.
   * For `existing_household` mode, all apps link to the household immediately.
   * For `new_household` mode, household_id stays NULL until conversion.
   */
  async createPublic(
    tenantId: string,
    dto: CreatePublicApplicationDto,
    ip: string,
  ): Promise<CreatePublicResult> {
    // Honeypot check — if website_url is filled, it's a bot
    if (dto.website_url) {
      return {
        mode: dto.mode,
        submission_batch_id: randomUUID(),
        household_number: null,
        applications: [],
      };
    }

    // Rate limit check
    const rateLimit = await this.rateLimitService.checkAndIncrement(tenantId, ip);
    if (!rateLimit.allowed) {
      throw new BadRequestException({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many submissions. Please try again later.',
        },
      });
    }

    const submissionBatchId = randomUUID();
    const applyDate = new Date();
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate form is published
      const form = await db.admissionFormDefinition.findFirst({
        where: {
          id: dto.form_definition_id,
          tenant_id: tenantId,
          status: 'published',
        },
      });

      if (!form) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: 'The admission form is not available',
          },
        });
      }

      // Resolve household context
      let householdIdForApps: string | null = null;
      let householdNumberForResponse: string | null = null;
      let isSibling = false;

      if (dto.mode === 'existing_household') {
        const household = await db.household.findFirst({
          where: {
            id: dto.existing_household_id,
            tenant_id: tenantId,
            household_number: { not: null },
          },
          select: {
            id: true,
            household_number: true,
            _count: { select: { students: { where: { status: 'active' } } } },
          },
        });

        if (!household || !household.household_number) {
          throw new NotFoundException({
            error: {
              code: 'HOUSEHOLD_NOT_FOUND',
              message: 'The specified household was not found',
            },
          });
        }

        householdIdForApps = household.id;
        householdNumberForResponse = household.household_number;
        // Sibling = household has at least one active student
        isSibling = household._count.students > 0;
      }
      // For new_household: householdIdForApps stays null, isSibling stays false

      // Create one Application per student, gate each independently
      const applications: Array<{
        id: string;
        application_number: string;
        status: ApplicationStatus;
        student_first_name: string;
        student_last_name: string;
        target_year_group_id: string;
      }> = [];

      for (const student of dto.students) {
        // Build payload_json: household_payload (for new_household) + student fields + consents
        const payloadJson: Record<string, unknown> = {
          ...(dto.household_payload ?? {}),
          student_first_name: student.first_name,
          student_middle_name: student.middle_name ?? null,
          student_last_name: student.last_name,
          student_dob: student.date_of_birth,
          student_gender: student.gender,
          student_national_id: student.national_id,
          student_medical_notes: student.medical_notes ?? null,
          student_allergies: student.has_allergies ?? null,
          __consents: dto.consents,
        };

        const applicationNumber = await this.sequenceService.nextNumber(
          tenantId,
          'application',
          tx,
        );

        const row = await db.application.create({
          data: {
            tenant_id: tenantId,
            form_definition_id: dto.form_definition_id,
            application_number: applicationNumber,
            submitted_by_parent_id: null,
            student_first_name: student.first_name,
            student_last_name: student.last_name,
            date_of_birth: new Date(student.date_of_birth),
            status: 'submitted',
            submitted_at: applyDate,
            apply_date: applyDate,
            target_academic_year_id: student.target_academic_year_id,
            target_year_group_id: student.target_year_group_id,
            payload_json: payloadJson as Prisma.InputJsonValue,
            household_id: householdIdForApps,
            submission_batch_id: submissionBatchId,
            is_sibling_application: isSibling,
          },
        });

        // Gate and route via the state machine
        const routed = await this.stateMachineService.routeSubmittedApplication(
          db,
          tenantId,
          row.id,
        );

        applications.push({
          id: routed.id,
          application_number: routed.application_number,
          status: routed.status as ApplicationStatus,
          student_first_name: routed.student_first_name,
          student_last_name: routed.student_last_name,
          target_year_group_id: student.target_year_group_id,
        });
      }

      return {
        mode: dto.mode,
        submission_batch_id: submissionBatchId,
        household_number: householdNumberForResponse,
        applications,
      };
    })) as CreatePublicResult;

    // Fire side effects outside the transaction (non-blocking)
    for (const app of result.applications) {
      this.fireApplicationSideEffects(tenantId, app).catch((err) => {
        this.logger.warn(
          `[createPublic] side effects failed for ${app.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    return result;
  }

  private async fireApplicationSideEffects(
    tenantId: string,
    app: {
      id: string;
      application_number: string;
      status: ApplicationStatus;
      student_first_name: string;
      student_last_name: string;
    },
  ): Promise<void> {
    await this.searchIndexService.indexEntity('applications', {
      id: app.id,
      tenant_id: tenantId,
      application_number: app.application_number,
      student_first_name: app.student_first_name,
      student_last_name: app.student_last_name,
      status: app.status,
    });
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListApplicationsQuery) {
    const { page, pageSize, status, form_definition_id, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ApplicationWhereInput = { tenant_id: tenantId };

    if (status) {
      where.status = status;
    }

    if (form_definition_id) {
      where.form_definition_id = form_definition_id;
    }

    if (search) {
      where.OR = [
        {
          student_first_name: { contains: search, mode: 'insensitive' },
        },
        {
          student_last_name: { contains: search, mode: 'insensitive' },
        },
        {
          application_number: { contains: search, mode: 'insensitive' },
        },
      ];
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.application.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            form_definition: {
              select: { id: true, name: true, version_number: true },
            },
            submitted_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            _count: { select: { notes: true } },
          },
        }),
        db.application.count({ where }),
      ]);
    })) as [ApplicationListItem[], number];

    const [data, total] = result;

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string): Promise<ApplicationDetail> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const detail = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const row = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          form_definition: {
            include: {
              fields: {
                orderBy: { display_order: 'asc' },
                select: {
                  id: true,
                  field_key: true,
                  label: true,
                  field_type: true,
                  required: true,
                  options_json: true,
                  display_order: true,
                },
              },
            },
          },
          submitted_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
            },
          },
          reviewed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          target_academic_year: {
            select: { id: true, name: true },
          },
          target_year_group: {
            select: { id: true, name: true },
          },
          materialised_student: {
            select: { id: true, first_name: true, last_name: true },
          },
          override_record: {
            select: {
              id: true,
              override_type: true,
              justification: true,
              expected_amount_cents: true,
              actual_amount_cents: true,
              created_at: true,
              approved_by: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          },
          notes: {
            orderBy: { created_at: 'asc' },
            include: {
              author: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          },
        },
      });

      if (!row) {
        return null;
      }

      const paymentEvents = await db.admissionsPaymentEvent.findMany({
        where: { tenant_id: tenantId, application_id: id },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          stripe_event_id: true,
          stripe_session_id: true,
          amount_cents: true,
          status: true,
          created_at: true,
        },
      });

      const capacity =
        row.target_academic_year_id && row.target_year_group_id
          ? await this.capacityService.getAvailableSeats(db, {
              tenantId,
              academicYearId: row.target_academic_year_id,
              yearGroupId: row.target_year_group_id,
            })
          : null;

      return { row, paymentEvents, capacity };
    });

    if (!detail) {
      throw new NotFoundException({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: `Application with id "${id}" not found`,
        },
      });
    }

    const { row, paymentEvents, capacity } = detail;

    const notesForResponse = [...row.notes].sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime(),
    );

    const timeline = buildApplicationTimeline({
      submittedAt: row.submitted_at,
      applyDate: row.apply_date,
      reviewedAt: row.reviewed_at,
      status: row.status,
      rejectionReason: row.rejection_reason,
      notes: row.notes,
      paymentEvents,
      overrideRecord: row.override_record,
      materialisedStudent: row.materialised_student,
    });

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      form_definition_id: row.form_definition_id,
      application_number: row.application_number,
      submitted_by_parent_id: row.submitted_by_parent_id,
      student_first_name: row.student_first_name,
      student_last_name: row.student_last_name,
      date_of_birth: row.date_of_birth,
      status: row.status,
      waiting_list_substatus: row.waiting_list_substatus,
      submitted_at: row.submitted_at,
      apply_date: row.apply_date,
      reviewed_at: row.reviewed_at,
      reviewed_by_user_id: row.reviewed_by_user_id,
      rejection_reason: row.rejection_reason,
      payment_amount_cents: row.payment_amount_cents,
      currency_code: row.currency_code,
      payment_deadline: row.payment_deadline,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      payload_json: row.payload_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
      form_definition: {
        id: row.form_definition.id,
        name: row.form_definition.name,
        version_number: row.form_definition.version_number,
        fields: row.form_definition.fields.map((f) => ({
          id: f.id,
          field_key: f.field_key,
          label: f.label,
          field_type: f.field_type,
          required: f.required,
          options_json: f.options_json,
          display_order: f.display_order,
        })),
      },
      submitted_by: row.submitted_by,
      reviewed_by: row.reviewed_by,
      target_academic_year: row.target_academic_year,
      target_year_group: row.target_year_group,
      materialised_student: row.materialised_student,
      override_record: row.override_record
        ? {
            id: row.override_record.id,
            override_type: row.override_record.override_type,
            justification: row.override_record.justification,
            expected_amount_cents: row.override_record.expected_amount_cents,
            actual_amount_cents: row.override_record.actual_amount_cents,
            created_at: row.override_record.created_at,
            approved_by: row.override_record.approved_by,
          }
        : null,
      payment_events: paymentEvents.map((event) => ({
        id: event.id,
        stripe_event_id: event.stripe_event_id,
        stripe_session_id: event.stripe_session_id,
        amount_cents: event.amount_cents,
        status: event.status,
        created_at: event.created_at,
      })),
      capacity,
      notes: notesForResponse.map((n) => ({
        id: n.id,
        note: n.note,
        is_internal: n.is_internal,
        created_at: n.created_at,
        author: n.author,
      })),
      timeline,
    };
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  async preview(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const application = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.application.findFirst({
        where: { id, tenant_id: tenantId },
        select: {
          id: true,
          application_number: true,
          student_first_name: true,
          student_last_name: true,
          status: true,
          submitted_at: true,
          created_at: true,
          form_definition: {
            select: { name: true },
          },
        },
      });
    })) as {
      id: string;
      application_number: string;
      student_first_name: string;
      student_last_name: string;
      status: string;
      submitted_at: Date | null;
      created_at: Date;
      form_definition: { name: string };
    } | null;

    if (!application) {
      throw new NotFoundException({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: `Application with id "${id}" not found`,
        },
      });
    }

    return {
      id: application.id,
      entity_type: 'application',
      primary_label: `${application.student_first_name} ${application.student_last_name}`,
      secondary_label: application.application_number,
      status: application.status,
      facts: [
        { label: 'Form', value: application.form_definition.name },
        {
          label: 'Submitted',
          value: application.submitted_at ? application.submitted_at.toISOString() : 'Not yet',
        },
        {
          label: 'Created',
          value: application.created_at.toISOString(),
        },
      ],
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(tenantId: string, query: AdmissionsAnalyticsQuery) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Prisma.ApplicationWhereInput = { tenant_id: tenantId };

      if (query.form_definition_id) {
        where.form_definition_id = query.form_definition_id;
      }

      if (query.date_from || query.date_to) {
        where.created_at = {};
        if (query.date_from) {
          (where.created_at as Prisma.DateTimeFilter).gte = new Date(query.date_from);
        }
        if (query.date_to) {
          (where.created_at as Prisma.DateTimeFilter).lte = new Date(query.date_to);
        }
      }

      // Funnel counts by status
      const statusCounts = await Promise.all([
        db.application.count({ where: { ...where, status: 'submitted' } }),
        db.application.count({ where: { ...where, status: 'waiting_list' } }),
        db.application.count({ where: { ...where, status: 'ready_to_admit' } }),
        db.application.count({ where: { ...where, status: 'conditional_approval' } }),
        db.application.count({ where: { ...where, status: 'approved' } }),
        db.application.count({ where: { ...where, status: 'rejected' } }),
        db.application.count({ where: { ...where, status: 'withdrawn' } }),
      ]);

      const total = statusCounts.reduce((sum, c) => sum + c, 0);
      const approved = statusCounts[4];
      const conversionRate = total > 0 ? Number(((approved / total) * 100).toFixed(1)) : 0;

      // Average days to decision (from submitted_at to reviewed_at)
      const rawTx = tx as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      };

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query within RLS transaction
      const avgDaysResult = (await rawTx.$queryRaw(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 86400) as avg_days
          FROM applications
          WHERE tenant_id = ${tenantId}::uuid
            AND reviewed_at IS NOT NULL
            AND submitted_at IS NOT NULL
        `,
      )) as Array<{ avg_days: number | null }>;

      const avgDaysToDecision = avgDaysResult[0]?.avg_days
        ? Number(Number(avgDaysResult[0].avg_days).toFixed(1))
        : null;

      return {
        funnel: {
          submitted: statusCounts[0],
          waiting_list: statusCounts[1],
          ready_to_admit: statusCounts[2],
          conditional_approval: statusCounts[3],
          approved: statusCounts[4],
          rejected: statusCounts[5],
          withdrawn: statusCounts[6],
        },
        total,
        conversion_rate: conversionRate,
        avg_days_to_decision: avgDaysToDecision,
      };
    });
  }

  // ─── Find By Parent ───────────────────────────────────────────────────────

  async findByParent(tenantId: string, parentUserId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Find the parent record for this user
      const parent = await db.parent.findFirst({
        where: { tenant_id: tenantId, user_id: parentUserId },
      });

      if (!parent) {
        return [];
      }

      return db.application.findMany({
        where: {
          tenant_id: tenantId,
          submitted_by_parent_id: parent.id,
        },
        orderBy: { created_at: 'desc' },
        include: {
          form_definition: {
            select: { id: true, name: true, version_number: true },
          },
        },
      });
    });
  }

  // ─── Queue: Ready to Admit ────────────────────────────────────────────────

  async getReadyToAdmitQueue(tenantId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const rows = await db.application.findMany({
        where: {
          tenant_id: tenantId,
          status: 'ready_to_admit',
        },
        orderBy: { apply_date: 'asc' },
        select: {
          id: true,
          application_number: true,
          student_first_name: true,
          student_last_name: true,
          date_of_birth: true,
          apply_date: true,
          target_academic_year_id: true,
          target_year_group_id: true,
          payload_json: true,
          submitted_by: {
            select: { first_name: true, last_name: true, email: true, phone: true },
          },
          target_year_group: {
            select: { id: true, name: true, display_order: true },
          },
          target_academic_year: {
            select: { id: true, name: true },
          },
        },
      });

      const pairs = rows
        .filter(
          (r): r is typeof r & { target_academic_year_id: string; target_year_group_id: string } =>
            Boolean(r.target_academic_year_id && r.target_year_group_id),
        )
        .map((r) => ({
          academicYearId: r.target_academic_year_id,
          yearGroupId: r.target_year_group_id,
        }));

      const capacityMap = await this.capacityService.getAvailableSeatsBatch(db, {
        tenantId,
        pairs,
      });

      return {
        data: groupApplicationsByYearGroup(rows, capacityMap),
        meta: { total: rows.length },
      };
    });
  }

  // ─── Queue: Waiting List ──────────────────────────────────────────────────

  async getWaitingListQueue(tenantId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const rows = await db.application.findMany({
        where: {
          tenant_id: tenantId,
          status: 'waiting_list',
        },
        orderBy: { apply_date: 'asc' },
        select: {
          id: true,
          application_number: true,
          student_first_name: true,
          student_last_name: true,
          date_of_birth: true,
          apply_date: true,
          target_academic_year_id: true,
          target_year_group_id: true,
          waiting_list_substatus: true,
          payload_json: true,
          submitted_by: {
            select: { first_name: true, last_name: true, email: true, phone: true },
          },
          target_year_group: {
            select: { id: true, name: true, display_order: true },
          },
          target_academic_year: {
            select: { id: true, name: true },
          },
        },
      });

      const waiting = rows.filter((r) => r.waiting_list_substatus === null);
      const awaitingYearSetup = rows.filter(
        (r) => r.waiting_list_substatus === 'awaiting_year_setup',
      );

      const waitingPairs = waiting
        .filter(
          (r): r is typeof r & { target_academic_year_id: string; target_year_group_id: string } =>
            Boolean(r.target_academic_year_id && r.target_year_group_id),
        )
        .map((r) => ({
          academicYearId: r.target_academic_year_id,
          yearGroupId: r.target_year_group_id,
        }));

      const capacityMap = await this.capacityService.getAvailableSeatsBatch(db, {
        tenantId,
        pairs: waitingPairs,
      });

      return {
        data: {
          waiting: groupApplicationsByYearGroup(waiting, capacityMap),
          awaiting_year_setup: groupApplicationsByYearGroup(awaitingYearSetup, new Map()),
        },
        meta: {
          waiting_total: waiting.length,
          awaiting_year_setup_total: awaitingYearSetup.length,
        },
      };
    });
  }

  // ─── Queue: Conditional Approval ──────────────────────────────────────────

  async getConditionalApprovalQueue(tenantId: string, query: ListConditionalApprovalQueueQuery) {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [rows, total] = await Promise.all([
        db.application.findMany({
          where: { tenant_id: tenantId, status: 'conditional_approval' },
          orderBy: [{ payment_deadline: 'asc' }, { apply_date: 'asc' }],
          skip,
          take: pageSize,
          select: {
            id: true,
            application_number: true,
            student_first_name: true,
            student_last_name: true,
            date_of_birth: true,
            payment_amount_cents: true,
            currency_code: true,
            payment_deadline: true,
            stripe_checkout_session_id: true,
            target_year_group: { select: { id: true, name: true } },
            target_academic_year: { select: { id: true, name: true } },
            payload_json: true,
            submitted_by: {
              select: { first_name: true, last_name: true, email: true, phone: true },
            },
          },
        }),
        db.application.count({ where: { tenant_id: tenantId, status: 'conditional_approval' } }),
      ]);

      const now = Date.now();
      const NEAR_EXPIRY_MS = 48 * 60 * 60 * 1000;

      const data = rows.map((row) => {
        const parent = extractParentContact(row.payload_json, row.submitted_by);
        const deadline = row.payment_deadline?.getTime() ?? null;
        let urgency: 'normal' | 'near_expiry' | 'overdue' = 'normal';
        if (deadline !== null) {
          if (deadline < now) urgency = 'overdue';
          else if (deadline - now < NEAR_EXPIRY_MS) urgency = 'near_expiry';
        }
        return {
          id: row.id,
          application_number: row.application_number,
          student_first_name: row.student_first_name,
          student_last_name: row.student_last_name,
          date_of_birth: row.date_of_birth,
          target_year_group: row.target_year_group,
          target_academic_year: row.target_academic_year,
          parent,
          payment_amount_cents: row.payment_amount_cents,
          currency_code: row.currency_code,
          payment_deadline: row.payment_deadline,
          stripe_checkout_session_id: row.stripe_checkout_session_id,
          has_active_payment_link: Boolean(row.stripe_checkout_session_id),
          payment_urgency: urgency,
        };
      });

      const nearExpiryCount = data.filter((d) => d.payment_urgency === 'near_expiry').length;
      const overdueCount = data.filter((d) => d.payment_urgency === 'overdue').length;

      return {
        data,
        meta: {
          page,
          pageSize,
          total,
          near_expiry_count: nearExpiryCount,
          overdue_count: overdueCount,
        },
      };
    });
  }

  // ─── Queue: Rejected archive ──────────────────────────────────────────────

  async getRejectedArchive(tenantId: string, query: ListRejectedApplicationsQuery) {
    const { page, pageSize, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ApplicationWhereInput = {
      tenant_id: tenantId,
      status: 'rejected',
    };

    if (search) {
      where.OR = [
        { student_first_name: { contains: search, mode: 'insensitive' } },
        { student_last_name: { contains: search, mode: 'insensitive' } },
        { application_number: { contains: search, mode: 'insensitive' } },
      ];
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [rows, total] = await Promise.all([
        db.application.findMany({
          where,
          orderBy: [{ reviewed_at: 'desc' }, { updated_at: 'desc' }],
          skip,
          take: pageSize,
          select: {
            id: true,
            application_number: true,
            student_first_name: true,
            student_last_name: true,
            rejection_reason: true,
            reviewed_at: true,
            reviewed_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            payload_json: true,
            submitted_by: {
              select: { first_name: true, last_name: true, email: true, phone: true },
            },
          },
        }),
        db.application.count({ where }),
      ]);

      const data = rows.map((row) => ({
        id: row.id,
        application_number: row.application_number,
        student_first_name: row.student_first_name,
        student_last_name: row.student_last_name,
        rejection_reason: row.rejection_reason,
        reviewed_at: row.reviewed_at,
        reviewed_by: row.reviewed_by,
        parent: extractParentContact(row.payload_json, row.submitted_by),
      }));

      return { data, meta: { page, pageSize, total } };
    });
  }

  async manuallyPromote(
    tenantId: string,
    applicationId: string,
    params: { actingUserId: string; justification: string },
  ) {
    return this.stateMachineService.manuallyPromoteToReadyToAdmit(tenantId, applicationId, params);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private validatePayloadAgainstFields(
    payload: Record<string, unknown>,
    fields: Array<{
      field_key: string;
      required: boolean;
      field_type: string;
      visible_to_parent: boolean;
    }>,
  ): void {
    const errors: Array<{ field: string; message: string }> = [];

    for (const field of fields) {
      if (!field.visible_to_parent) continue;

      const value = payload[field.field_key];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: field.field_key,
          message: `${field.field_key} is required`,
        });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Application payload validation failed',
          details: { errors },
        },
      });
    }
  }
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

interface QueueApplicationRow {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  apply_date: Date | null;
  target_academic_year_id: string | null;
  target_year_group_id: string | null;
  waiting_list_substatus?: 'awaiting_year_setup' | null;
  payload_json: Prisma.JsonValue;
  submitted_by: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  target_year_group: { id: string; name: string; display_order: number } | null;
  target_academic_year: { id: string; name: string } | null;
}

interface ParentContact {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

function extractParentContact(
  payload: Prisma.JsonValue,
  submittedBy: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null,
): ParentContact {
  if (submittedBy) {
    return {
      first_name: submittedBy.first_name,
      last_name: submittedBy.last_name,
      email: submittedBy.email,
      phone: submittedBy.phone,
    };
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const asString = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value : null;
    return {
      first_name: asString(record.parent1_first_name),
      last_name: asString(record.parent1_last_name),
      email: asString(record.parent1_email),
      phone: asString(record.parent1_phone),
    };
  }
  return { first_name: null, last_name: null, email: null, phone: null };
}

function groupApplicationsByYearGroup(
  rows: QueueApplicationRow[],
  capacityMap: Map<
    string,
    {
      total_capacity: number;
      enrolled_student_count: number;
      conditional_approval_count: number;
      available_seats: number;
      configured: boolean;
    }
  >,
) {
  const buckets = new Map<
    string,
    {
      year_group_id: string | null;
      year_group_name: string;
      display_order: number;
      target_academic_year_id: string | null;
      target_academic_year_name: string;
      capacity: {
        total: number;
        enrolled: number;
        conditional: number;
        available: number;
        configured: boolean;
      } | null;
      applications: Array<{
        id: string;
        application_number: string;
        student_first_name: string;
        student_last_name: string;
        date_of_birth: string | null;
        apply_date: string | null;
        fifo_position: number;
        waiting_list_substatus: 'awaiting_year_setup' | null;
        submitted_by_parent: ParentContact;
      }>;
    }
  >();

  for (const row of rows) {
    const ygId = row.target_year_group_id;
    const ayId = row.target_academic_year_id;
    const bucketKey = `${ayId ?? 'none'}:${ygId ?? 'none'}`;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      const capacityKey = ayId && ygId ? `${ayId}:${ygId}` : null;
      const cap = capacityKey ? capacityMap.get(capacityKey) : undefined;
      bucket = {
        year_group_id: ygId,
        year_group_name: row.target_year_group?.name ?? 'Unknown year group',
        display_order: row.target_year_group?.display_order ?? 9999,
        target_academic_year_id: ayId,
        target_academic_year_name: row.target_academic_year?.name ?? 'Unknown academic year',
        capacity: cap
          ? {
              total: cap.total_capacity,
              enrolled: cap.enrolled_student_count,
              conditional: cap.conditional_approval_count,
              available: cap.available_seats,
              configured: cap.configured,
            }
          : null,
        applications: [],
      };
      buckets.set(bucketKey, bucket);
    }

    bucket.applications.push({
      id: row.id,
      application_number: row.application_number,
      student_first_name: row.student_first_name,
      student_last_name: row.student_last_name,
      date_of_birth: row.date_of_birth ? row.date_of_birth.toISOString() : null,
      apply_date: row.apply_date ? row.apply_date.toISOString() : null,
      fifo_position: bucket.applications.length + 1,
      waiting_list_substatus: row.waiting_list_substatus ?? null,
      submitted_by_parent: extractParentContact(row.payload_json, row.submitted_by),
    });
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.year_group_name.localeCompare(b.year_group_name);
  });
}

// ─── Timeline builder ─────────────────────────────────────────────────────────
//
// The detail page Timeline tab is assembled from structured facts that already
// exist on the application row and its related tables. We do not depend on a
// note_type discriminator column: system-written notes are authored by
// SYSTEM_USER_SENTINEL, and that is sufficient to classify them.

interface TimelineInputs {
  submittedAt: Date | null;
  applyDate: Date | null;
  reviewedAt: Date | null;
  status: string;
  rejectionReason: string | null;
  notes: Array<{
    id: string;
    note: string;
    created_at: Date;
    author_user_id: string;
    author: { id: string; first_name: string; last_name: string };
  }>;
  paymentEvents: Array<{
    id: string;
    amount_cents: number;
    status: string;
    created_at: Date;
  }>;
  overrideRecord: {
    id: string;
    override_type: string;
    justification: string;
    expected_amount_cents: number;
    actual_amount_cents: number;
    created_at: Date;
    approved_by: { id: string; first_name: string; last_name: string };
  } | null;
  materialisedStudent: { id: string; first_name: string; last_name: string } | null;
}

function buildApplicationTimeline(inputs: TimelineInputs): ApplicationTimelineEvent[] {
  const events: ApplicationTimelineEvent[] = [];

  if (inputs.submittedAt) {
    events.push({
      id: `submitted:${inputs.submittedAt.toISOString()}`,
      kind: 'submitted',
      at: inputs.submittedAt,
      message: 'Application submitted.',
      actor: null,
    });
  } else if (inputs.applyDate) {
    events.push({
      id: `submitted:${inputs.applyDate.toISOString()}`,
      kind: 'submitted',
      at: inputs.applyDate,
      message: 'Application received.',
      actor: null,
    });
  }

  for (const note of inputs.notes) {
    const isSystem = note.author_user_id === SYSTEM_USER_SENTINEL;
    events.push({
      id: `note:${note.id}`,
      kind: isSystem ? 'system_event' : 'admin_note',
      at: note.created_at,
      message: note.note,
      actor: isSystem ? null : note.author,
    });
  }

  for (const event of inputs.paymentEvents) {
    events.push({
      id: `payment:${event.id}`,
      kind: 'payment_event',
      at: event.created_at,
      message: `Payment event (${event.status}): ${formatCents(event.amount_cents)}.`,
      actor: null,
    });
  }

  if (inputs.overrideRecord) {
    const actor = inputs.overrideRecord.approved_by;
    events.push({
      id: `override:${inputs.overrideRecord.id}`,
      kind: 'override_granted',
      at: inputs.overrideRecord.created_at,
      message: `Admin override (${inputs.overrideRecord.override_type}). Expected ${formatCents(
        inputs.overrideRecord.expected_amount_cents,
      )}, recorded ${formatCents(inputs.overrideRecord.actual_amount_cents)}. Justification: ${
        inputs.overrideRecord.justification
      }`,
      actor,
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return events;
}

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2)}`;
}
