import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdmissionOverrideType } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';

import { AdmissionsFinanceBridgeService } from './admissions-finance-bridge.service';
import { ApplicationConversionService } from './application-conversion.service';
import { ApplicationStateMachineService } from './application-state-machine.service';

// ─── Types ───────────────────────────────────────────────────────────────────

type PaymentChannel = 'cash' | 'bank_transfer';

type OverrideType = 'full_waiver' | 'partial_waiver' | 'deferred_payment';

const LEADERSHIP_ROLE_KEY = 'school_owner';

export interface RecordCashPaymentParams {
  actingUserId: string;
  amountCents: number;
  receiptNumber?: string;
  notes?: string;
}

export interface RecordBankTransferParams {
  actingUserId: string;
  amountCents: number;
  transferReference: string;
  transferDate: string;
  notes?: string;
}

export interface ForceApproveOverrideParams {
  actingUserId: string;
  overrideType: OverrideType;
  actualAmountCollectedCents: number;
  justification: string;
}

export interface PaymentApprovalResult {
  approved: true;
  student_id: string;
}

export interface OverrideApprovalResult extends PaymentApprovalResult {
  override_id: string;
}

export interface AdmissionOverrideListItem {
  id: string;
  application_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  expected_amount_cents: number;
  actual_amount_cents: number;
  justification: string;
  override_type: AdmissionOverrideType;
  created_at: string;
  approved_by_user_id: string;
  approved_by_name: string | null;
}

// ─── Locked row shape ────────────────────────────────────────────────────────

interface LockedApplicationRow {
  id: string;
  tenant_id: string;
  status: string;
  payment_amount_cents: number | null;
  currency_code: string | null;
  reviewed_by_user_id: string | null;
  student_first_name: string;
  student_last_name: string;
  target_academic_year_id: string | null;
  target_year_group_id: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Non-Stripe admissions payment paths — cash, bank transfer, and the
 * leadership-only override path for hardship cases.
 *
 * Every method runs inside a single interactive RLS transaction that:
 *   1. row-locks the application (`SELECT … FOR UPDATE`),
 *   2. asserts `status = 'conditional_approval'`,
 *   3. validates the chosen payment channel + amount (or justification),
 *   4. writes an `AdmissionOverride` audit row where applicable,
 *   5. materialises the student via `ApplicationConversionService`,
 *   6. advances the state machine to `approved` with the right `paymentSource`.
 *
 * Stripe-driven approvals are owned by impl 06's `AdmissionsStripeService`;
 * expiry of unpaid conditional approvals is owned by impl 08's worker cron.
 *
 * See `new-admissions/PLAN.md` §5 and `implementations/07-cash-bank-override.md`.
 */
@Injectable()
export class AdmissionsPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionService: ApplicationConversionService,
    private readonly stateMachine: ApplicationStateMachineService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly financeBridge: AdmissionsFinanceBridgeService,
  ) {}

  // ─── Cash ──────────────────────────────────────────────────────────────────

  async recordCashPayment(
    tenantId: string,
    applicationId: string,
    params: RecordCashPaymentParams,
  ): Promise<PaymentApprovalResult> {
    const settings = await this.settingsService.getModuleSettings(tenantId, 'admissions');
    if (!settings.allow_cash) {
      throw new BadRequestException({
        code: 'CASH_PAYMENT_DISABLED',
        message: 'Cash payments are not enabled for this tenant',
      });
    }

    return this.runPaymentFlow(tenantId, applicationId, {
      channel: 'cash',
      paymentSource: 'cash',
      actingUserId: params.actingUserId,
      amountCents: params.amountCents,
      noteBody: this.buildCashNote(params),
      auditAction: 'admissions_payment_cash',
      auditMetadata: {
        amount_cents: params.amountCents,
        receipt_number: params.receiptNumber ?? null,
      },
    });
  }

  // ─── Bank transfer ─────────────────────────────────────────────────────────

  async recordBankTransfer(
    tenantId: string,
    applicationId: string,
    params: RecordBankTransferParams,
  ): Promise<PaymentApprovalResult> {
    const settings = await this.settingsService.getModuleSettings(tenantId, 'admissions');
    if (!settings.allow_bank_transfer) {
      throw new BadRequestException({
        code: 'BANK_TRANSFER_DISABLED',
        message: 'Bank transfer payments are not enabled for this tenant',
      });
    }

    return this.runPaymentFlow(tenantId, applicationId, {
      channel: 'bank_transfer',
      paymentSource: 'bank_transfer',
      actingUserId: params.actingUserId,
      amountCents: params.amountCents,
      noteBody: this.buildBankTransferNote(params),
      auditAction: 'admissions_payment_bank_transfer',
      auditMetadata: {
        amount_cents: params.amountCents,
        transfer_reference: params.transferReference,
        transfer_date: params.transferDate,
      },
    });
  }

  // ─── Override ──────────────────────────────────────────────────────────────

  async forceApproveWithOverride(
    tenantId: string,
    applicationId: string,
    params: ForceApproveOverrideParams,
  ): Promise<OverrideApprovalResult> {
    const justification = params.justification.trim();
    if (justification.length < 20) {
      throw new BadRequestException({
        code: 'JUSTIFICATION_TOO_SHORT',
        message: 'Override justification must be at least 20 characters',
      });
    }

    const settings = await this.settingsService.getModuleSettings(tenantId, 'admissions');
    await this.assertOverrideRoleAllowed(
      tenantId,
      params.actingUserId,
      settings.require_override_approval_role,
    );

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const outcome = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const locked = await this.lockConditionalApproval(db, tenantId, applicationId);
      const expectedCents = locked.payment_amount_cents ?? 0;

      const override = await db.admissionOverride.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          approved_by_user_id: params.actingUserId,
          expected_amount_cents: expectedCents,
          actual_amount_cents: params.actualAmountCollectedCents,
          justification,
          override_type: params.overrideType as AdmissionOverrideType,
        },
      });

      await db.application.update({
        where: { id: applicationId },
        data: { override_record_id: override.id },
      });

      const conversion = await this.conversionService.convertToStudent(db, {
        tenantId,
        applicationId,
        triggerUserId: params.actingUserId,
      });

      await this.stateMachine.markApproved(
        tenantId,
        applicationId,
        {
          actingUserId: params.actingUserId,
          paymentSource: 'override',
          overrideRecordId: override.id,
        },
        db,
      );

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: params.actingUserId,
          note:
            `Admission override applied (${params.overrideType}). ` +
            `Expected ${(expectedCents / 100).toFixed(2)} ${locked.currency_code ?? ''}, ` +
            `collected ${(params.actualAmountCollectedCents / 100).toFixed(2)}. ` +
            `Justification: ${justification}`,
          action: 'override_approved',
          is_internal: true,
        },
      });

      return { studentId: conversion.student_id, overrideId: override.id, expectedCents };
    });

    await this.auditLogService.write(
      tenantId,
      params.actingUserId,
      'application',
      applicationId,
      'admissions_override',
      {
        override_id: outcome.overrideId,
        override_type: params.overrideType,
        expected_cents: outcome.expectedCents,
        actual_cents: params.actualAmountCollectedCents,
        justification,
      },
      null,
    );

    return {
      approved: true,
      student_id: outcome.studentId,
      override_id: outcome.overrideId,
    };
  }

  // ─── Override audit listing ────────────────────────────────────────────────

  async listOverrides(
    tenantId: string,
    query: { page: number; pageSize: number },
  ): Promise<{
    data: AdmissionOverrideListItem[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const skip = (query.page - 1) * query.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.admissionOverride.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        skip,
        take: query.pageSize,
        include: {
          application: {
            select: {
              application_number: true,
              student_first_name: true,
              student_last_name: true,
            },
          },
          approved_by: {
            select: { first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.admissionOverride.count({ where: { tenant_id: tenantId } }),
    ]);

    const data: AdmissionOverrideListItem[] = rows.map((row) => ({
      id: row.id,
      application_id: row.application_id,
      application_number: row.application.application_number,
      student_first_name: row.application.student_first_name,
      student_last_name: row.application.student_last_name,
      expected_amount_cents: row.expected_amount_cents,
      actual_amount_cents: row.actual_amount_cents,
      justification: row.justification,
      override_type: row.override_type,
      created_at: row.created_at.toISOString(),
      approved_by_user_id: row.approved_by_user_id,
      approved_by_name: row.approved_by
        ? `${row.approved_by.first_name} ${row.approved_by.last_name}`
        : null,
    }));

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── Shared payment flow (cash + bank transfer) ───────────────────────────

  private async runPaymentFlow(
    tenantId: string,
    applicationId: string,
    context: {
      channel: PaymentChannel;
      paymentSource: 'cash' | 'bank_transfer';
      actingUserId: string;
      amountCents: number;
      noteBody: string;
      auditAction: string;
      auditMetadata: Record<string, unknown>;
    },
  ): Promise<PaymentApprovalResult> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const outcome = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const locked = await this.lockConditionalApproval(db, tenantId, applicationId);

      const expected = locked.payment_amount_cents ?? 0;
      if (expected <= 0) {
        throw new BadRequestException({
          code: 'EXPECTED_AMOUNT_MISSING',
          message:
            'Application has no expected payment amount set — cannot record a payment against it',
        });
      }

      if (context.amountCents < expected) {
        throw new BadRequestException({
          code: 'PAYMENT_BELOW_THRESHOLD',
          message: `Payment is below the required upfront amount`,
          details: {
            expected_cents: expected,
            received_cents: context.amountCents,
            currency_code: locked.currency_code,
          },
        });
      }

      const conversion = await this.conversionService.convertToStudent(db, {
        tenantId,
        applicationId,
        triggerUserId: context.actingUserId,
      });

      await this.stateMachine.markApproved(
        tenantId,
        applicationId,
        {
          actingUserId: context.actingUserId,
          paymentSource: context.paymentSource,
          overrideRecordId: null,
        },
        db,
      );

      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          author_user_id: context.actingUserId,
          note: context.noteBody,
          // ADM-009: cash / bank shared payment flow; record the channel.
          action: context.paymentSource === 'cash' ? 'cash_recorded' : 'bank_recorded',
          is_internal: true,
        },
      });

      // Create financial records: fee assignment, invoice, payment, allocation
      if (conversion.created && locked.target_academic_year_id && locked.target_year_group_id) {
        await this.financeBridge.createFinancialRecords({
          tenantId,
          householdId: conversion.household_id,
          studentId: conversion.student_id,
          studentFirstName: locked.student_first_name,
          studentLastName: locked.student_last_name,
          yearGroupId: locked.target_year_group_id,
          academicYearId: locked.target_academic_year_id,
          paymentAmountCents: context.amountCents,
          paymentSource: context.paymentSource,
          actingUserId: context.actingUserId,
          externalReference:
            (context.auditMetadata.receipt_number as string) ??
            (context.auditMetadata.transfer_reference as string) ??
            undefined,
          db,
        });
      }

      return { studentId: conversion.student_id, expected };
    });

    await this.auditLogService.write(
      tenantId,
      context.actingUserId,
      'application',
      applicationId,
      context.auditAction,
      {
        ...context.auditMetadata,
        expected_cents: outcome.expected,
        channel: context.channel,
      },
      null,
    );

    return { approved: true, student_id: outcome.studentId };
  }

  // ─── Row lock helper ──────────────────────────────────────────────────────

  private async lockConditionalApproval(
    db: PrismaService,
    tenantId: string,
    applicationId: string,
  ): Promise<LockedApplicationRow> {
    const rawTx = db as unknown as {
      $queryRaw: (sql: Prisma.Sql) => Promise<LockedApplicationRow[]>;
    };
    // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE row lock inside RLS transaction
    const rows = await rawTx.$queryRaw(Prisma.sql`
      SELECT id, tenant_id, status::text AS status, payment_amount_cents, currency_code, reviewed_by_user_id, student_first_name, student_last_name, target_academic_year_id, target_year_group_id
      FROM applications
      WHERE id = ${applicationId}::uuid
        AND tenant_id = ${tenantId}::uuid
      FOR UPDATE
    `);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: `Application "${applicationId}" not found`,
      });
    }

    if (row.status !== 'conditional_approval') {
      throw new ConflictException({
        code: 'INVALID_STATUS',
        message: `Application is in status "${row.status}" — only conditional_approval applications can have payment recorded`,
      });
    }

    return row;
  }

  // ─── Role assertion ──────────────────────────────────────────────────────

  private async assertOverrideRoleAllowed(
    tenantId: string,
    actingUserId: string,
    requiredRoleKey: 'school_owner' | 'school_principal',
  ): Promise<void> {
    // school_owner is always allowed (leadership bypass) in addition to the
    // tenant-configured minimum override role.
    const acceptedRoleKeys = new Set<string>([LEADERSHIP_ROLE_KEY, requiredRoleKey]);

    const membership = await this.rbacReadFacade.findMembershipByUserWithPermissions(
      tenantId,
      actingUserId,
    );

    const holdsAcceptedRole =
      membership?.membership_status === 'active' &&
      membership.membership_roles.some((mr) => acceptedRoleKeys.has(mr.role.role_key));

    if (!holdsAcceptedRole) {
      throw new ForbiddenException({
        code: 'OVERRIDE_ROLE_REQUIRED',
        message: `This action requires the "${requiredRoleKey}" role (or school_owner)`,
      });
    }
  }

  // ─── Note builders ────────────────────────────────────────────────────────

  private buildCashNote(params: RecordCashPaymentParams): string {
    const parts = [`Cash payment recorded: €${(params.amountCents / 100).toFixed(2)}.`];
    if (params.receiptNumber) parts.push(`Receipt #${params.receiptNumber}.`);
    if (params.notes) parts.push(`Notes: ${params.notes}`);
    return parts.join(' ');
  }

  private buildBankTransferNote(params: RecordBankTransferParams): string {
    const parts = [
      `Bank transfer recorded: €${(params.amountCents / 100).toFixed(2)}.`,
      `Reference: ${params.transferReference}.`,
      `Transfer date: ${params.transferDate}.`,
    ];
    if (params.notes) parts.push(`Notes: ${params.notes}`);
    return parts.join(' ');
  }
}
