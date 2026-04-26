import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';

import {
  type EventBudgetPaymentPlan,
  type GenerateFeesBodyDto,
  type GenerateFeesPreviewResponse,
  type GenerateFeesResponse,
  type MarkSchoolFundedResponse,
  type TripFeeMode,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { FeeAssignmentsService } from '../../finance/fee-assignments.service';
import { FeeStructuresService } from '../../finance/fee-structures.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { EventBudgetsService } from '../event-budgets/event-budgets.service';

/**
 * TripFeeIntegrationService — the cross-module write that pushes a
 * confirmed event budget's per-student cost into Finance via
 * `FeeAssignmentsService.bulkCreate()`. PLAN.md §10.
 *
 * This is the **only** path the budgeting module uses to mutate Finance
 * state (IMPLEMENTATION_LOG.md Rule 11). Gated by a three-permission
 * stack (`budgeting.view` AND `budgeting.generate_fees` AND
 * `finance.manage`, Rule 12) — guards re-check, the service body
 * re-checks again so a missing decorator can't bypass the contract.
 *
 * Owns these state transitions on `event_budgets.status`:
 *   confirmed → fees_generated  (via `POST /generate-fees`,
 *                                when household_share_pct > 0)
 *   confirmed → fees_generated  (via `POST /mark-school-funded`,
 *                                when household_share_pct = 0)
 */

const REQUIRED_PERMISSIONS = [
  'budgeting.view',
  'budgeting.generate_fees',
  'finance.manage',
] as const;

@Injectable()
export class TripFeeIntegrationService {
  private readonly logger = new Logger(TripFeeIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBudgetsService: EventBudgetsService,
    private readonly feeStructuresService: FeeStructuresService,
    private readonly feeAssignmentsService: FeeAssignmentsService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Preview (dry-run, no writes) ────────────────────────────────────────

  async previewGenerateFees(
    tenantId: string,
    eventBudgetId: string,
  ): Promise<GenerateFeesPreviewResponse> {
    const { row, output, householdCount } = await this.eventBudgetsService.runEngineForId(
      tenantId,
      eventBudgetId,
    );

    const participants = await this.loadParticipants(tenantId, row);
    const householdSharePct = Number(row.household_share_pct);
    const mode = computeMode(householdSharePct, row.payment_plan);
    const paymentDates = derivePaymentDates(
      { event_date: row.event_date, payment_plan: row.payment_plan },
      null,
    );
    const breakdown = aggregateByHousehold(participants, output.per_student_cost);

    return {
      event_budget_id: row.id,
      mode,
      household_share_pct: householdSharePct,
      payment_plan: row.payment_plan,
      totals: {
        total_to_invoice: output.household_total,
        total_school_subsidy: output.school_subsidy_amount,
        household_count: breakdown.length || householdCount,
        student_count: participants.length,
      },
      households: breakdown.map((h) => ({
        household_id: h.household_id,
        household_name: h.household_name,
        students: h.students,
        total_amount: h.amount,
        payment_plan_dates: paymentDates ? paymentDates.map((d) => d.toISOString()) : null,
      })),
    };
  }

  // ─── Generate fees (transactional cross-module write) ────────────────────

  async generateFees(
    tenantId: string,
    membershipId: string | null,
    userId: string,
    eventBudgetId: string,
    body: GenerateFeesBodyDto,
  ): Promise<GenerateFeesResponse> {
    await this.assertPermissionStack(membershipId);

    const { row, output } = await this.eventBudgetsService.runEngineForId(tenantId, eventBudgetId);
    if (row.status !== 'confirmed') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_CONFIRMED',
        message: `Event budget must be in "confirmed" status to generate fees (current: "${row.status}").`,
      });
    }
    if (Number(row.household_share_pct) === 0) {
      // The free-trip branch is owned by markSchoolFunded; reject so the
      // UI never confuses the two surfaces.
      throw new ConflictException({
        code: 'EVENT_BUDGET_FREE_TRIP',
        message: 'Trip has household_share_pct = 0 — use POST /mark-school-funded instead.',
      });
    }
    if (body.confirm !== true) {
      throw new ForbiddenException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Generate-fees body must include `confirm: true`.',
      });
    }

    const participants = await this.loadParticipants(tenantId, row);
    if (participants.length === 0) {
      throw new ConflictException({
        code: 'NO_PARTICIPANTS',
        message:
          'No participating students with households were found for this trip; cannot generate fees.',
      });
    }
    const paymentDates = derivePaymentDates(
      { event_date: row.event_date, payment_plan: row.payment_plan },
      body.due_date ? new Date(body.due_date) : null,
    );
    if (!paymentDates || paymentDates.length === 0) {
      throw new ConflictException({
        code: 'PAYMENT_DATES_INVALID',
        message: 'Could not derive payment plan dates from the trip configuration.',
      });
    }

    // ── Transactional write — single RLS-bound interactive transaction ──
    const rls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });
    const result = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;

      // 1. Mint or reuse the trip's fee structure.
      const feeStructure = await txdb.feeStructure.create({
        data: {
          tenant_id: tenantId,
          name: deriveFeeStructureName(row.name),
          amount: output.per_student_cost,
          billing_frequency: 'one_off',
          active: true,
        },
      });

      // 2. Bulk-create one assignment per (household, student).
      const bulk = await this.feeAssignmentsService.bulkCreate(txdb, tenantId, [
        ...participants.map((p) => ({
          household_id: p.household_id,
          student_id: p.student_id,
          fee_structure_id: feeStructure.id,
        })),
      ]);

      // 3. Update the event budget with the generated run + flip status.
      await txdb.eventBudget.update({
        where: { id: row.id },
        data: {
          status: 'fees_generated',
          fee_structure_id: feeStructure.id,
          fee_generation_run_id: bulk.run_id,
        },
      });

      return {
        fee_structure_id: feeStructure.id,
        fee_generation_run_id: bulk.run_id,
      };
    });

    const householdCount = countHouseholds(participants);
    this.logger.log(
      `Generated fees for event ${row.id} (tenant ${tenantId}) — ` +
        `total_invoiced=${output.household_total} household_count=${householdCount} ` +
        `student_count=${participants.length} run_id=${result.fee_generation_run_id}`,
    );

    return {
      event_budget_id: row.id,
      status: 'fees_generated',
      fee_structure_id: result.fee_structure_id,
      fee_generation_run_id: result.fee_generation_run_id,
      total_invoiced: output.household_total,
      household_count: householdCount,
      student_count: participants.length,
    };
  }

  // ─── Mark school-funded (free-trip branch) ───────────────────────────────

  async markSchoolFunded(
    tenantId: string,
    membershipId: string | null,
    userId: string,
    eventBudgetId: string,
  ): Promise<MarkSchoolFundedResponse> {
    await this.assertPermissionStack(membershipId);

    const { row } = await this.eventBudgetsService.runEngineForId(tenantId, eventBudgetId);
    if (row.status !== 'confirmed') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_CONFIRMED',
        message: `Event budget must be in "confirmed" status (current: "${row.status}").`,
      });
    }
    if (Number(row.household_share_pct) !== 0) {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_FREE',
        message: 'mark-school-funded only applies when household_share_pct = 0.',
      });
    }

    const rls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.eventBudget.update({
        where: { id: row.id },
        // Status semantically reused: "no fees to issue, transition complete".
        data: { status: 'fees_generated' },
      });
    });

    this.logger.log(`Marked event ${row.id} as school-funded (tenant ${tenantId})`);
    return {
      event_budget_id: row.id,
      status: 'fees_generated',
      reason: 'free_trip',
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async assertPermissionStack(membershipId: string | null): Promise<void> {
    if (!membershipId) {
      throw new ForbiddenException({
        code: 'PERMISSION_STACK_DENIED',
        message: 'No active membership for this tenant.',
      });
    }
    const isOwner = await this.permissionCacheService.isOwner(membershipId);
    if (isOwner) return;

    const permissions = await this.permissionCacheService.getPermissions(membershipId);
    const missing = REQUIRED_PERMISSIONS.filter((p) => !permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_STACK_DENIED',
        message: `Missing required permissions: ${missing.join(', ')}.`,
        details: { required: [...REQUIRED_PERMISSIONS], missing },
      });
    }
  }

  private async loadParticipants(
    tenantId: string,
    row: { class_id: string | null; year_group_id: string | null; participant_count: number },
  ): Promise<ParticipantRow[]> {
    if (!row.class_id && !row.year_group_id) return [];
    return this.studentReadFacade.findActiveParticipantStudentsWithHousehold(tenantId, {
      class_id: row.class_id,
      year_group_id: row.year_group_id,
    });
  }
}

// ─── Pure helpers (exported for spec coverage) ─────────────────────────────

interface ParticipantRow {
  student_id: string;
  student_name: string;
  household_id: string;
  household_name: string;
}

export function countHouseholds(participants: ParticipantRow[]): number {
  return new Set(participants.map((p) => p.household_id)).size;
}

export function aggregateByHousehold(
  participants: ParticipantRow[],
  perStudentCost: number,
): Array<{
  household_id: string;
  household_name: string;
  students: Array<{ student_id: string; student_name: string }>;
  amount: number;
}> {
  const byHh = new Map<
    string,
    {
      household_id: string;
      household_name: string;
      students: Array<{ student_id: string; student_name: string }>;
      amount: number;
    }
  >();
  for (const p of participants) {
    const existing = byHh.get(p.household_id);
    if (existing) {
      existing.students.push({ student_id: p.student_id, student_name: p.student_name });
      existing.amount = round2(existing.amount + perStudentCost);
    } else {
      byHh.set(p.household_id, {
        household_id: p.household_id,
        household_name: p.household_name,
        students: [{ student_id: p.student_id, student_name: p.student_name }],
        amount: round2(perStudentCost),
      });
    }
  }
  return Array.from(byHh.values()).sort((a, b) => b.amount - a.amount);
}

export function computeMode(hhSharePct: number, paymentPlan: EventBudgetPaymentPlan): TripFeeMode {
  if (hhSharePct === 0) return 'free';
  if (paymentPlan !== 'one_off') return 'payment_plan';
  if (hhSharePct === 100) return 'cost_recovery';
  return 'subsidised';
}

export function derivePaymentDates(
  event: { event_date: Date | null; payment_plan: EventBudgetPaymentPlan },
  override: Date | null,
): Date[] | null {
  if (!event.event_date && !override) return null;
  const final = override ?? defaultDueDate(event.event_date as Date);
  switch (event.payment_plan) {
    case 'one_off':
      return [final];
    case 'two_payments':
      return [addMonths(final, -2), final];
    case 'three_payments':
      return [addMonths(final, -3), addMonths(final, -1), final];
    case 'four_payments':
      return [addMonths(final, -4), addMonths(final, -2), addMonths(final, -1), final];
    default:
      return [final];
  }
}

function deriveFeeStructureName(eventName: string): string {
  return `Event: ${eventName}`.slice(0, 150);
}

function defaultDueDate(eventDate: Date): Date {
  // 14 days before the event by default — gives finance time to chase late households.
  const d = new Date(eventDate);
  d.setUTCDate(d.getUTCDate() - 14);
  return d;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
