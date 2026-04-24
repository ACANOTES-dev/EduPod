import type { PrismaClient } from '@prisma/client';

import type { ReportAlertMetricKey } from '@school/shared/reports';

/**
 * Loose Prisma transaction client. Same shape used by the API's KPI
 * calculators (`apps/api/src/modules/reports/kpi-calculators/kpi-types.ts`)
 * — strips lifecycle methods that aren't available inside `$transaction`
 * but keeps every model accessor.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>;

export type MetricCalculator = (tx: PrismaTransaction, tenantId: string) => Promise<number>;

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_INVOICE_STATUSES = ['issued', 'partially_paid', 'overdue'] as const;
const OPEN_SAFEGUARDING_STATUSES = [
  'reported',
  'acknowledged',
  'under_investigation',
  'referred',
  'sg_monitoring',
] as const;
const EXCLUDED_INCIDENT_STATUSES = ['withdrawn', 'closed_after_appeal', 'superseded'] as const;
const PRESENT_ATTENDANCE_STATUSES = ['present', 'late', 'left_early'] as const;
const SUBMITTED_SESSION_STATUSES = ['submitted', 'locked'] as const;

// ─── Time helpers ─────────────────────────────────────────────────────────────

export function getWeekStart(now: Date): Date {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getTodayStart(now: Date): Date {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today;
}

export function getTomorrowStart(now: Date): Date {
  const tomorrow = getTodayStart(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

// ─── Calculators ──────────────────────────────────────────────────────────────

const calculateOverdueInvoicesCount: MetricCalculator = async (tx, tenantId) => {
  const today = getTodayStart(new Date());
  return tx.invoice.count({
    where: {
      tenant_id: tenantId,
      due_date: { lt: today },
      balance_amount: { gt: 0 },
      status: { in: [...ACTIVE_INVOICE_STATUSES] },
    },
  });
};

const calculateAttendanceRateToday: MetricCalculator = async (tx, tenantId) => {
  const now = new Date();
  const today = getTodayStart(now);
  const tomorrow = getTomorrowStart(now);

  const groups = await tx.attendanceRecord.groupBy({
    by: ['status'],
    where: {
      tenant_id: tenantId,
      session: {
        session_date: { gte: today, lt: tomorrow },
      },
    },
    _count: true,
  });

  const presentCount = groups
    .filter((g) => (PRESENT_ATTENDANCE_STATUSES as readonly string[]).includes(g.status))
    .reduce((sum, g) => sum + g._count, 0);
  const totalCount = groups.reduce((sum, g) => sum + g._count, 0);

  if (totalCount === 0) return 0;
  return Number(((presentCount / totalCount) * 100).toFixed(1));
};

const calculateOpenSafeguardingConcernsCount: MetricCalculator = async (tx, tenantId) => {
  return tx.safeguardingConcern.count({
    where: {
      tenant_id: tenantId,
      status: { in: [...OPEN_SAFEGUARDING_STATUSES] },
    },
  });
};

const calculateAtRiskStudentsCount: MetricCalculator = async (tx, tenantId) => {
  return tx.studentAcademicRiskAlert.count({
    where: {
      tenant_id: tenantId,
      status: 'active',
    },
  });
};

const calculateUnpaidBalanceTotal: MetricCalculator = async (tx, tenantId) => {
  const aggregate = await tx.invoice.aggregate({
    where: {
      tenant_id: tenantId,
      balance_amount: { gt: 0 },
      status: { in: [...ACTIVE_INVOICE_STATUSES] },
    },
    _sum: { balance_amount: true },
  });
  return aggregate._sum.balance_amount ? Number(aggregate._sum.balance_amount) : 0;
};

const calculateBehaviourIncidentsWeek: MetricCalculator = async (tx, tenantId) => {
  const now = new Date();
  const weekStart = getWeekStart(now);
  return tx.behaviourIncident.count({
    where: {
      tenant_id: tenantId,
      occurred_at: { gte: weekStart, lt: now },
      status: { notIn: [...EXCLUDED_INCIDENT_STATUSES] },
    },
  });
};

const calculateTeacherSubmissionComplianceWeek: MetricCalculator = async (tx, tenantId) => {
  const now = new Date();
  const weekStart = getWeekStart(now);

  const [expected, submitted] = await Promise.all([
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: weekStart, lt: now },
        status: { not: 'cancelled' },
      },
    }),
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: weekStart, lt: now },
        status: { in: [...SUBMITTED_SESSION_STATUSES] },
      },
    }),
  ]);

  if (expected === 0) return 0;
  return Number(((submitted / expected) * 100).toFixed(1));
};

const calculateCoverGapsWeek: MetricCalculator = async (tx, tenantId) => {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return tx.teacherAbsence.count({
    where: {
      tenant_id: tenantId,
      absence_date: { gte: weekStart, lt: weekEnd },
      cancelled_at: null,
      substitution_records: { none: {} },
    },
  });
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const METRIC_REGISTRY: Record<ReportAlertMetricKey, MetricCalculator> = {
  overdue_invoices_count: calculateOverdueInvoicesCount,
  attendance_rate_today: calculateAttendanceRateToday,
  open_safeguarding_concerns_count: calculateOpenSafeguardingConcernsCount,
  at_risk_students_count: calculateAtRiskStudentsCount,
  unpaid_balance_total: calculateUnpaidBalanceTotal,
  behaviour_incidents_week: calculateBehaviourIncidentsWeek,
  teacher_submission_compliance_week: calculateTeacherSubmissionComplianceWeek,
  cover_gaps_week: calculateCoverGapsWeek,
};

export function getMetricCalculator(metric: string): MetricCalculator | null {
  if (!(metric in METRIC_REGISTRY)) return null;
  // `Record<K, V>` indexed access becomes `V | undefined` under
  // `noUncheckedIndexedAccess` even though the `in` guard above proves
  // existence. Coerce to null for the documented null-or-fn contract.
  return METRIC_REGISTRY[metric as ReportAlertMetricKey] ?? null;
}
