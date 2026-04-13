import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Application,
  ApplicationStatus,
  ApplicationWaitingListSubstatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { AdmissionsAutoPromotionService } from './admissions-auto-promotion.service';
import { AdmissionsCapacityService } from './admissions-capacity.service';
import { FinanceFeesFacade } from './finance-fees.facade';

// ─── Job constants ───────────────────────────────────────────────────────────

export const ADMISSIONS_APPLICATION_RECEIVED_JOB = 'notifications:admissions-application-received';
export const ADMISSIONS_APPLICATION_WITHDRAWN_JOB =
  'notifications:admissions-application-withdrawn';
export const ADMISSIONS_PAYMENT_LINK_JOB = 'notifications:admissions-payment-link';

// ADM-027: BullMQ priority for admissions notifications. Lower = higher
// priority. Default is 0 (treated as no priority, FIFO). 5 puts admissions
// emails ahead of bulk siblings (announcements, scheduled reports) but
// behind safeguarding alerts (which use priority 1) and payment receipts
// (priority 2). Tuned for the SLA discussed in ADM-027.
export const ADMISSIONS_NOTIFICATION_PRIORITY = 5;

// ─── Valid status transitions ────────────────────────────────────────────────
// `submitted` stays as a graph edge rather than a persisted state — the new
// submit() path inserts rows directly into `ready_to_admit` or `waiting_list`.
// The enum value remains for backwards compatibility with the Wave 1 data
// migration that renamed legacy values.

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['ready_to_admit', 'waiting_list'],
  waiting_list: ['ready_to_admit', 'rejected', 'withdrawn'],
  ready_to_admit: ['conditional_approval', 'rejected', 'withdrawn'],
  conditional_approval: ['approved', 'waiting_list', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StateMachineSubmitParams {
  formDefinitionId: string;
  studentFirstName: string;
  studentLastName: string;
  dateOfBirth: Date | null;
  targetAcademicYearId: string;
  targetYearGroupId: string;
  payloadJson: Record<string, unknown>;
  submittedByParentId: string | null;
  /** Explicit for deterministic testing; defaults to `now()`. */
  applyDate?: Date;
}

type PaymentSource = 'stripe' | 'cash' | 'bank_transfer' | 'override';

type RowLockResult = {
  id: string;
  tenant_id: string;
  status: ApplicationStatus;
  target_academic_year_id: string | null;
  target_year_group_id: string | null;
};

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * New financially-gated admissions state machine.
 *
 * Every transition runs inside an interactive RLS transaction and, where
 * relevant, re-checks year-group capacity through `AdmissionsCapacityService`.
 * Seat-consuming transitions (`ready_to_admit` → `conditional_approval`) take
 * a row-level `SELECT … FOR UPDATE` lock so two admins clicking Approve on
 * the last free seat cannot oversubscribe the year group.
 *
 * See `new-admissions/PLAN.md` §2 for the state graph and
 * `new-admissions/implementations/03-state-machine-rewrite.md` for the spec
 * this implementation was built against.
 */
@Injectable()
export class ApplicationStateMachineService {
  private readonly logger = new Logger(ApplicationStateMachineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
    private readonly financeFeesFacade: FinanceFeesFacade,
    private readonly sequenceService: SequenceService,
    private readonly settingsService: SettingsService,
    private readonly searchIndexService: SearchIndexService,
    private readonly autoPromotionService: AdmissionsAutoPromotionService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Submit ───────────────────────────────────────────────────────────────

  /**
   * Create an application and route it to `ready_to_admit` / `waiting_list`
   * based on the target year group's live capacity. Creates its own RLS
   * transaction. Use `routeSubmittedApplication` when the row already exists
   * and you are operating within a caller-provided transaction.
   */
  async submit(tenantId: string, params: StateMachineSubmitParams): Promise<Application> {
    const applyDate = params.applyDate ?? new Date();
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const created = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const applicationNumber = await this.sequenceService.nextNumber(tenantId, 'application', tx);

      const row = await db.application.create({
        data: {
          tenant_id: tenantId,
          form_definition_id: params.formDefinitionId,
          application_number: applicationNumber,
          submitted_by_parent_id: params.submittedByParentId,
          student_first_name: params.studentFirstName,
          student_last_name: params.studentLastName,
          date_of_birth: params.dateOfBirth,
          status: 'submitted',
          submitted_at: applyDate,
          apply_date: applyDate,
          target_academic_year_id: params.targetAcademicYearId,
          target_year_group_id: params.targetYearGroupId,
          payload_json: params.payloadJson as Prisma.InputJsonValue,
        },
      });

      return this.routeSubmittedApplication(db, tenantId, row.id);
    })) as Application;

    await this.fireSubmissionSideEffects(tenantId, created);

    return created;
  }

  /**
   * Gate and route an existing `submitted` application row to
   * `ready_to_admit` / `waiting_list` / `waiting_list + awaiting_year_setup`
   * based on live capacity. Operates within the caller's transaction —
   * used by `createPublic` for multi-student submissions where each row is
   * created first, then routed independently.
   */
  async routeSubmittedApplication(
    db: PrismaService,
    tenantId: string,
    applicationId: string,
  ): Promise<Application> {
    const application = await db.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
    });

    if (!application) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: `Application "${applicationId}" not found`,
      });
    }

    if (!application.target_academic_year_id || !application.target_year_group_id) {
      throw new BadRequestException({
        code: 'MISSING_TARGET_YEAR_GROUP',
        message: 'Application is missing target academic year or target year group',
      });
    }

    const capacity = await this.capacityService.getAvailableSeats(db, {
      tenantId,
      academicYearId: application.target_academic_year_id,
      yearGroupId: application.target_year_group_id,
    });

    let status: ApplicationStatus;
    let waitingListSubstatus: ApplicationWaitingListSubstatus | null = null;

    if (!capacity.configured) {
      status = 'waiting_list';
      waitingListSubstatus = 'awaiting_year_setup';
    } else if (capacity.available_seats > 0) {
      status = 'ready_to_admit';
    } else {
      status = 'waiting_list';
    }

    return db.application.update({
      where: { id: applicationId },
      data: { status, waiting_list_substatus: waitingListSubstatus },
    });
  }

  // ─── Move to Conditional Approval ────────────────────────────────────────

  async moveToConditionalApproval(
    tenantId: string,
    applicationId: string,
    actingUserId: string,
  ): Promise<Application> {
    const settings = await this.settingsService.getModuleSettings(tenantId, 'admissions');
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const rawTx = tx as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<RowLockResult[]>;
        $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
      };
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- row-level lock for state-machine concurrency guard, inside RLS transaction
      const locked = await rawTx.$queryRaw(Prisma.sql`
        SELECT id, tenant_id, status, target_academic_year_id, target_year_group_id
        FROM applications
        WHERE id = ${applicationId}::uuid
          AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `);

      const current = locked[0];
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }

      this.assertTransitionAllowed(current.status, 'conditional_approval');

      if (!current.target_academic_year_id || !current.target_year_group_id) {
        throw new BadRequestException({
          code: 'MISSING_TARGET_YEAR_GROUP',
          message: 'Application is missing target academic year or target year group',
        });
      }

      // ─── Year-group capacity advisory lock ──────────────────────────────
      // Serialise all conditional-approval transitions in the same
      // (tenant, year_group) so two concurrent approvals cannot both pass
      // a capacity check for the last seat. Released automatically on
      // transaction commit or rollback.
      const lockKey = `admissions_capacity:${tenantId}:${current.target_year_group_id}`;
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- advisory lock for capacity concurrency guard, inside RLS transaction
      await rawTx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
      `);

      const capacity = await this.capacityService.getAvailableSeats(db, {
        tenantId,
        academicYearId: current.target_academic_year_id,
        yearGroupId: current.target_year_group_id,
      });

      if (capacity.available_seats === 0) {
        throw new ConflictException({
          code: 'CAPACITY_EXHAUSTED',
          message:
            'No seats remain in this year group — application stays in Ready to Admit until another is rejected or withdrawn.',
        });
      }

      const fee = await this.financeFeesFacade.resolveAnnualNetFeeCents(
        tenantId,
        current.target_academic_year_id,
        current.target_year_group_id,
        db,
      );

      const paymentAmountCents = Math.round((fee.amount_cents * settings.upfront_percentage) / 100);
      const paymentDeadline = new Date(Date.now() + settings.payment_window_days * 86_400_000);

      const updatedRow = await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'conditional_approval',
          payment_amount_cents: paymentAmountCents,
          currency_code: fee.currency_code,
          payment_deadline: paymentDeadline,
          reviewed_at: new Date(),
          reviewed_by_user_id: actingUserId,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: actingUserId,
          note: `Moved to Conditional Approval. Seat held. Payment deadline: ${this.formatNoteDeadline(paymentDeadline)}.`,
          action: 'moved_to_conditional_approval',
          is_internal: true,
        },
      });

      return updatedRow;
    })) as Application;

    try {
      await this.notificationsQueue.add(
        ADMISSIONS_PAYMENT_LINK_JOB,
        {
          tenant_id: tenantId,
          application_id: applicationId,
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 60_000 },
          priority: ADMISSIONS_NOTIFICATION_PRIORITY,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue payment-link job for application ${applicationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return updated;
  }

  // ─── Reject ──────────────────────────────────────────────────────────────

  async reject(
    tenantId: string,
    applicationId: string,
    params: { reason: string; actingUserId: string },
  ): Promise<Application> {
    const reason = params.reason.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'A rejection reason is required when rejecting an application',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const current = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }
      this.assertTransitionAllowed(current.status, 'rejected');

      const releasedSeat = current.status === 'conditional_approval';

      const updated = await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'rejected',
          rejection_reason: reason,
          reviewed_at: new Date(),
          reviewed_by_user_id: params.actingUserId,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: params.actingUserId,
          note: releasedSeat
            ? `Application rejected. Reason: ${reason}. Seat released: now counted as available in the target year group.`
            : `Application rejected. Reason: ${reason}.`,
          action: 'rejected',
          is_internal: true,
        },
      });

      if (releasedSeat && current.target_academic_year_id && current.target_year_group_id) {
        await this.autoPromotionService.promoteYearGroup(db, {
          tenantId,
          academicYearId: current.target_academic_year_id,
          yearGroupId: current.target_year_group_id,
        });
      }

      return updated;
    })) as Application;
  }

  // ─── Withdraw ────────────────────────────────────────────────────────────

  async withdraw(
    tenantId: string,
    applicationId: string,
    params: { actingUserId: string; isParent: boolean },
  ): Promise<Application> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const withdrawn = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const current = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }

      if (params.isParent) {
        const parent = await db.parent.findFirst({
          where: { tenant_id: tenantId, user_id: params.actingUserId },
          select: { id: true },
        });
        if (!parent || current.submitted_by_parent_id !== parent.id) {
          throw new BadRequestException({
            code: 'NOT_APPLICATION_OWNER',
            message: 'You can only withdraw your own applications',
          });
        }
      }

      this.assertTransitionAllowed(current.status, 'withdrawn');
      const releasedSeat = current.status === 'conditional_approval';

      const updated = await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'withdrawn',
          reviewed_at: new Date(),
          reviewed_by_user_id: params.actingUserId,
        },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: params.actingUserId,
          note: releasedSeat
            ? 'Application withdrawn. Seat released: now counted as available in the target year group.'
            : 'Application withdrawn.',
          action: 'withdrawn',
          is_internal: true,
        },
      });

      if (releasedSeat && current.target_academic_year_id && current.target_year_group_id) {
        await this.autoPromotionService.promoteYearGroup(db, {
          tenantId,
          academicYearId: current.target_academic_year_id,
          yearGroupId: current.target_year_group_id,
        });
      }

      return updated;
    })) as Application;

    await this.fireWithdrawalSideEffects(tenantId, withdrawn);

    return withdrawn;
  }

  // ─── Manual Promote (FIFO bypass) ────────────────────────────────────────

  /**
   * Admin-initiated promotion of a specific waiting-list application out of
   * FIFO order. Used by the waiting-list queue page (impl 11) for sibling
   * priority and other non-FIFO policy calls the school wants to make.
   *
   * Requires a mandatory justification which is appended as an internal
   * note, re-checks year-group capacity under a row lock, and refuses rows
   * in the `awaiting_year_setup` sub-status.
   */
  async manuallyPromoteToReadyToAdmit(
    tenantId: string,
    applicationId: string,
    params: { actingUserId: string; justification: string },
  ): Promise<Application> {
    const justification = params.justification.trim();
    if (justification.length < 10) {
      throw new BadRequestException({
        code: 'JUSTIFICATION_TOO_SHORT',
        message: 'Manual promotion requires a justification of at least 10 characters',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const rawTx = tx as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<RowLockResult[]>;
      };
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- row-level lock for capacity concurrency guard
      const locked = await rawTx.$queryRaw(Prisma.sql`
        SELECT id, tenant_id, status, target_academic_year_id, target_year_group_id
        FROM applications
        WHERE id = ${applicationId}::uuid
          AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `);

      const current = locked[0];
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }

      if (current.status !== 'waiting_list') {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Only waiting_list applications can be manually promoted (current status: ${current.status})`,
        });
      }

      const row = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
        select: { waiting_list_substatus: true },
      });
      if (row?.waiting_list_substatus === 'awaiting_year_setup') {
        throw new BadRequestException({
          code: 'AWAITING_YEAR_SETUP',
          message:
            'This application is awaiting year-group setup and cannot be promoted until classes are created',
        });
      }

      if (!current.target_academic_year_id || !current.target_year_group_id) {
        throw new BadRequestException({
          code: 'MISSING_TARGET_YEAR_GROUP',
          message: 'Application is missing target academic year or target year group',
        });
      }

      // ─── Year-group capacity advisory lock ──────────────────────────────
      // Serialise concurrent manual promotes in the same (tenant, year_group)
      // so two parallel callers cannot both pass the capacity check and
      // over-queue ready_to_admit rows beyond capacity. Mirrors ADM-006.
      const lockKey = `admissions_capacity:${tenantId}:${current.target_year_group_id}`;
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- advisory lock for capacity concurrency guard, inside RLS transaction
      await rawTx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
      `);

      const capacity = await this.capacityService.getAvailableSeats(db, {
        tenantId,
        academicYearId: current.target_academic_year_id,
        yearGroupId: current.target_year_group_id,
      });

      // `getAvailableSeats` only subtracts enrolled + conditional. For manual
      // promotion we additionally cap the size of the ready_to_admit queue at
      // `available_seats`, otherwise the queue can grow beyond capacity and
      // future approvals will block one-by-one as space frees up. Counts the
      // existing ready_to_admit rows for the same (academic_year, year_group).
      const readyToAdmitCount = await db.application.count({
        where: {
          tenant_id: tenantId,
          target_academic_year_id: current.target_academic_year_id,
          target_year_group_id: current.target_year_group_id,
          status: 'ready_to_admit',
        },
      });

      if (capacity.available_seats - readyToAdmitCount <= 0) {
        throw new ConflictException({
          code: 'CAPACITY_EXHAUSTED',
          message:
            'No seats remain in this year group — application cannot be promoted until another is rejected or withdrawn.',
        });
      }

      const updated = await db.application.update({
        where: { id: applicationId },
        data: { status: 'ready_to_admit' },
      });

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: params.actingUserId,
          note: `Manually promoted from waiting list (FIFO bypass). Justification: ${justification}`,
          action: 'manually_promoted',
          is_internal: true,
        },
      });

      return updated;
    })) as Application;
  }

  // ─── Mark Approved ───────────────────────────────────────────────────────

  async markApproved(
    tenantId: string,
    applicationId: string,
    params: {
      actingUserId: string | null;
      paymentSource: PaymentSource;
      overrideRecordId: string | null;
    },
    db?: PrismaService,
  ): Promise<Application> {
    const work = async (tx: PrismaService): Promise<Application> => {
      const current = await tx.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }
      this.assertTransitionAllowed(current.status, 'approved');

      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: 'approved',
          override_record_id: params.overrideRecordId,
          payment_deadline: null,
          reviewed_at: new Date(),
          ...(params.actingUserId ? { reviewed_by_user_id: params.actingUserId } : {}),
        },
      });

      await tx.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: params.actingUserId ?? SYSTEM_USER_SENTINEL,
          note: `Application approved via ${params.paymentSource}.`,
          // ADM-009: derive the action from the payment source so the
          // Timeline can render distinct cash / bank / stripe / override
          // labels for the markApproved transition.
          action:
            params.paymentSource === 'cash'
              ? 'cash_recorded'
              : params.paymentSource === 'bank_transfer'
                ? 'bank_recorded'
                : params.paymentSource === 'stripe'
                  ? 'stripe_completed'
                  : 'override_approved',
          is_internal: true,
        },
      });

      return updated;
    };

    if (db) {
      return work(db);
    }
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return (await rlsClient.$transaction(async (tx) =>
      work(tx as unknown as PrismaService),
    )) as Application;
  }

  // ─── Revert to Waiting List ──────────────────────────────────────────────

  async revertToWaitingList(
    tenantId: string,
    applicationId: string,
    reason: 'payment_expired',
    db?: PrismaService,
  ): Promise<Application> {
    const work = async (tx: PrismaService): Promise<Application> => {
      const current = await tx.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Application "${applicationId}" not found`,
        });
      }
      this.assertTransitionAllowed(current.status, 'waiting_list');

      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: 'waiting_list',
          waiting_list_substatus: null,
          payment_amount_cents: null,
          payment_deadline: null,
        },
      });

      await tx.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: current.reviewed_by_user_id ?? SYSTEM_USER_SENTINEL,
          note: `Reverted to waiting list (reason: ${reason}). Seat released.`,
          action: 'reverted_by_expiry',
          is_internal: true,
        },
      });

      if (current.target_academic_year_id && current.target_year_group_id) {
        await this.autoPromotionService.promoteYearGroup(tx, {
          tenantId,
          academicYearId: current.target_academic_year_id,
          yearGroupId: current.target_year_group_id,
        });
      }

      return updated;
    };

    if (db) {
      return work(db);
    }
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return (await rlsClient.$transaction(async (tx) =>
      work(tx as unknown as PrismaService),
    )) as Application;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private assertTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): void {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition application from "${from}" to "${to}"`,
      });
    }
  }

  /**
   * Format a deadline for embedding in `ApplicationNote` body strings.
   * Uses UTC so the audit trail is timezone-independent and reproducible.
   * Example: `18 Apr 2026, 12:13 UTC`.
   */
  private formatNoteDeadline(date: Date): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hh}:${mm} UTC`;
  }

  private async fireSubmissionSideEffects(
    tenantId: string,
    application: Application,
  ): Promise<void> {
    try {
      await this.searchIndexService.indexEntity('applications', {
        id: application.id,
        tenant_id: tenantId,
        application_number: application.application_number,
        student_first_name: application.student_first_name,
        student_last_name: application.student_last_name,
        status: application.status,
      });
    } catch (err) {
      this.logger.warn(
        `Search indexing failed for application ${application.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await this.notificationsQueue.add(
        ADMISSIONS_APPLICATION_RECEIVED_JOB,
        {
          tenant_id: tenantId,
          submitted_by_parent_id: application.submitted_by_parent_id,
          students: [
            {
              application_id: application.id,
              application_number: application.application_number,
              name: `${application.student_first_name} ${application.student_last_name}`,
              status: application.status,
            },
          ],
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          priority: ADMISSIONS_NOTIFICATION_PRIORITY,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue application-received notification for ${application.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fireWithdrawalSideEffects(
    tenantId: string,
    application: Application,
  ): Promise<void> {
    try {
      await this.notificationsQueue.add(
        ADMISSIONS_APPLICATION_WITHDRAWN_JOB,
        {
          tenant_id: tenantId,
          application_id: application.id,
          application_number: application.application_number,
          student_first_name: application.student_first_name,
          student_last_name: application.student_last_name,
          submitted_by_parent_id: application.submitted_by_parent_id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          priority: ADMISSIONS_NOTIFICATION_PRIORITY,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue application-withdrawn notification for ${application.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
