import { Logger } from '@nestjs/common';
import type { Prisma, ReportAlert } from '@prisma/client';

import {
  ALERT_ANTISPAM_WINDOW_MS,
  REPORT_ALERT_NOTIFICATION_TEMPLATE,
  type ReportAlertOperator,
} from '@school/shared/reports';

import { getMetricCalculator, type PrismaTransaction } from './metric-registry';

const logger = new Logger('ReportAlertsEvaluator');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvaluateAlertResult {
  alert_id: string;
  outcome: 'ok' | 'threshold_crossed' | 'error';
  measured_value: number | null;
  notified_user_ids: string[];
  error_message: string | null;
}

export interface EvaluateTenantResult {
  tenant_id: string;
  evaluated: number;
  fired: number;
  errored: number;
}

// ─── Operator evaluation ──────────────────────────────────────────────────────

/**
 * Apply the alert's comparison operator to the measured value vs.
 * threshold. `eq` and `ne` tolerate a small floating-point epsilon
 * since attendance and compliance metrics round to one decimal.
 * Unknown operators return `false` rather than throw — defends
 * against a corrupt CRUD payload landing in the DB.
 */
export function evaluateOperator(
  value: number,
  operator: string,
  threshold: number,
): boolean {
  const op = operator as ReportAlertOperator;
  switch (op) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return Math.abs(value - threshold) < 0.001;
    case 'ne':
      return Math.abs(value - threshold) >= 0.001;
    default:
      logger.warn(`Unknown operator "${operator}" — treating as 'no fire'`);
      return false;
  }
}

// ─── Anti-spam ────────────────────────────────────────────────────────────────

/**
 * Decides whether a `threshold_crossed` outcome should actually
 * dispatch a notification. Suppression rule: if the most recent
 * `threshold_crossed` run within the 24h anti-spam window is not
 * followed by an `ok` run, suppress. Otherwise allow.
 */
export async function shouldDispatch(
  tx: PrismaTransaction,
  alertId: string,
  evaluatedAt: Date,
): Promise<boolean> {
  const windowStart = new Date(evaluatedAt.getTime() - ALERT_ANTISPAM_WINDOW_MS);

  const lastCrossed = await tx.reportAlertRun.findFirst({
    where: {
      report_alert_id: alertId,
      outcome: 'threshold_crossed',
      evaluated_at: { gte: windowStart, lt: evaluatedAt },
    },
    orderBy: { evaluated_at: 'desc' },
  });
  if (!lastCrossed) return true;

  const returnedToOk = await tx.reportAlertRun.findFirst({
    where: {
      report_alert_id: alertId,
      outcome: 'ok',
      evaluated_at: { gt: lastCrossed.evaluated_at, lt: evaluatedAt },
    },
  });
  return Boolean(returnedToOk);
}

// ─── Recipient resolution ────────────────────────────────────────────────────

/**
 * Translate the alert's `notification_recipients_json` (array of email
 * strings) to user IDs via `tenant_memberships`. Emails with no active
 * member are silently dropped — a single typo never blocks the rest of
 * the dispatch for an alert.
 */
async function resolveRecipientUserIds(
  tx: PrismaTransaction,
  tenantId: string,
  recipientsJson: Prisma.JsonValue,
): Promise<string[]> {
  if (!Array.isArray(recipientsJson)) return [];
  const emails: string[] = recipientsJson.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
  if (emails.length === 0) return [];

  const memberships = await tx.tenantMembership.findMany({
    where: {
      tenant_id: tenantId,
      membership_status: 'active',
      user: { email: { in: emails } },
    },
    select: { user_id: true },
  });

  return memberships.map((m) => m.user_id);
}

// ─── Notification dispatch ───────────────────────────────────────────────────

/**
 * Creates one in-app `Notification` per recipient. Spec is
 * inbox-only (no email by default — too noisy). Returns the IDs we
 * notified so the caller can record them on the run row.
 */
async function dispatchNotifications(
  tx: PrismaTransaction,
  tenantId: string,
  alert: ReportAlert,
  measuredValue: number,
  recipientUserIds: string[],
): Promise<string[]> {
  if (recipientUserIds.length === 0) return [];

  const payload = {
    alert_id: alert.id,
    alert_name: alert.name,
    metric: alert.metric,
    operator: alert.operator,
    threshold: Number(alert.threshold),
    measured_value: measuredValue,
    drill_down_href: `/reports/alerts/${alert.id}`,
  } satisfies Prisma.InputJsonValue;

  const now = new Date();
  await Promise.all(
    recipientUserIds.map((userId) =>
      tx.notification.create({
        data: {
          tenant_id: tenantId,
          recipient_user_id: userId,
          channel: 'in_app',
          template_key: REPORT_ALERT_NOTIFICATION_TEMPLATE,
          locale: 'en',
          status: 'delivered',
          payload_json: payload,
          source_entity_type: 'report_alert',
          source_entity_id: alert.id,
          delivered_at: now,
        },
      }),
    ),
  );
  return recipientUserIds;
}

// ─── Per-alert evaluator ──────────────────────────────────────────────────────

export async function evaluateAlert(
  tx: PrismaTransaction,
  tenantId: string,
  alert: ReportAlert,
): Promise<EvaluateAlertResult> {
  const evaluatedAt = new Date();
  const calculator = getMetricCalculator(alert.metric);

  if (!calculator) {
    const errorMessage = `Unknown metric key "${alert.metric}" — alert is broken`;
    logger.warn(`[evaluateAlert] tenant=${tenantId} alert=${alert.id} ${errorMessage}`);
    await tx.reportAlertRun.create({
      data: {
        tenant_id: tenantId,
        report_alert_id: alert.id,
        evaluated_at: evaluatedAt,
        outcome: 'error',
        measured_value: null,
        threshold_value: alert.threshold,
        notified_user_ids: [],
        error_message: errorMessage,
      },
    });
    return {
      alert_id: alert.id,
      outcome: 'error',
      measured_value: null,
      notified_user_ids: [],
      error_message: errorMessage,
    };
  }

  let measuredValue: number;
  try {
    measuredValue = await calculator(tx, tenantId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[evaluateAlert] calculator failed tenant=${tenantId} alert=${alert.id} metric=${alert.metric}`,
      err instanceof Error ? err.stack : String(err),
    );
    await tx.reportAlertRun.create({
      data: {
        tenant_id: tenantId,
        report_alert_id: alert.id,
        evaluated_at: evaluatedAt,
        outcome: 'error',
        measured_value: null,
        threshold_value: alert.threshold,
        notified_user_ids: [],
        error_message: errorMessage,
      },
    });
    return {
      alert_id: alert.id,
      outcome: 'error',
      measured_value: null,
      notified_user_ids: [],
      error_message: errorMessage,
    };
  }

  const threshold = Number(alert.threshold);
  const crossed = evaluateOperator(measuredValue, alert.operator, threshold);

  if (!crossed) {
    await tx.reportAlertRun.create({
      data: {
        tenant_id: tenantId,
        report_alert_id: alert.id,
        evaluated_at: evaluatedAt,
        outcome: 'ok',
        measured_value: measuredValue,
        threshold_value: threshold,
        notified_user_ids: [],
        error_message: null,
      },
    });
    await tx.reportAlert.update({
      where: { id: alert.id },
      data: { last_measured_value: measuredValue },
    });
    return {
      alert_id: alert.id,
      outcome: 'ok',
      measured_value: measuredValue,
      notified_user_ids: [],
      error_message: null,
    };
  }

  const dispatch = await shouldDispatch(tx, alert.id, evaluatedAt);
  let notifiedUserIds: string[] = [];
  if (dispatch) {
    const recipientUserIds = await resolveRecipientUserIds(
      tx,
      tenantId,
      alert.notification_recipients_json,
    );
    notifiedUserIds = await dispatchNotifications(
      tx,
      tenantId,
      alert,
      measuredValue,
      recipientUserIds,
    );
  }

  await tx.reportAlertRun.create({
    data: {
      tenant_id: tenantId,
      report_alert_id: alert.id,
      evaluated_at: evaluatedAt,
      outcome: 'threshold_crossed',
      measured_value: measuredValue,
      threshold_value: threshold,
      notified_user_ids: notifiedUserIds,
      error_message: null,
    },
  });
  await tx.reportAlert.update({
    where: { id: alert.id },
    data: {
      last_measured_value: measuredValue,
      ...(dispatch && { last_triggered_at: evaluatedAt }),
    },
  });

  return {
    alert_id: alert.id,
    outcome: 'threshold_crossed',
    measured_value: measuredValue,
    notified_user_ids: notifiedUserIds,
    error_message: null,
  };
}

// ─── Per-tenant orchestrator ─────────────────────────────────────────────────

export async function evaluateTenant(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<EvaluateTenantResult> {
  const alerts = await tx.reportAlert.findMany({
    where: { tenant_id: tenantId, active: true },
  });

  let fired = 0;
  let errored = 0;
  for (const alert of alerts) {
    const result = await evaluateAlert(tx, tenantId, alert);
    if (result.outcome === 'threshold_crossed' && result.notified_user_ids.length > 0) {
      fired++;
    }
    if (result.outcome === 'error') {
      errored++;
    }
  }

  return {
    tenant_id: tenantId,
    evaluated: alerts.length,
    fired,
    errored,
  };
}
