import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  ShieldAlert,
  Siren,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import type { KpiCard, ReportKpiKey } from '@school/shared/reports';

// ─── KPI visual identity ──────────────────────────────────────────────────────
//
// Each KPI carries a stable identity (icon + brand colour) that the card
// renders without round-tripping to the backend. Order of keys mirrors
// `REPORT_KPI_KEYS` in `@school/shared/reports/kpi.ts`.

export interface KpiVisualIdentity {
  Icon: LucideIcon;
  /** Tailwind text colour class for the icon. */
  iconColor: string;
  /** Tailwind background class for the icon chip. */
  iconBg: string;
  /** Hex colour used for the sparkline area + stroke. */
  accentHex: string;
}

const FALLBACK_IDENTITY: KpiVisualIdentity = {
  Icon: AlertTriangle,
  iconColor: 'text-text-secondary',
  iconBg: 'bg-surface-secondary',
  accentHex: '#64748b',
};

const KPI_IDENTITY: Record<ReportKpiKey, KpiVisualIdentity> = {
  attendance_today: {
    Icon: GraduationCap,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    accentHex: '#2563eb',
  },
  teacher_submission_compliance: {
    Icon: ClipboardCheck,
    iconColor: 'text-cyan-600',
    iconBg: 'bg-cyan-50',
    accentHex: '#0891b2',
  },
  at_risk_students: {
    Icon: AlertTriangle,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
    accentHex: '#ea580c',
  },
  behaviour_incidents_this_week: {
    Icon: Siren,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    accentHex: '#dc2626',
  },
  open_safeguarding_concerns: {
    Icon: ShieldAlert,
    iconColor: 'text-pink-600',
    iconBg: 'bg-pink-50',
    accentHex: '#db2777',
  },
  overdue_invoices: {
    Icon: Banknote,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    accentHex: '#d97706',
  },
  grades_submission_lag: {
    Icon: TrendingUp,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50',
    accentHex: '#9333ea',
  },
  new_applications_this_week: {
    Icon: UserPlus,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    accentHex: '#059669',
  },
  parent_escalations: {
    Icon: Inbox,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    accentHex: '#7c3aed',
  },
  cover_gaps_this_week: {
    Icon: CalendarClock,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    accentHex: '#4f46e5',
  },
};

/**
 * Resolve a KPI's stable visual identity. Unknown keys (e.g. a future KPI
 * the frontend hasn't been redeployed for) fall back to a neutral palette
 * rather than throwing.
 */
export function resolveKpiIdentity(key: string): KpiVisualIdentity {
  return KPI_IDENTITY[key as ReportKpiKey] ?? FALLBACK_IDENTITY;
}

// ─── Severity → border class ──────────────────────────────────────────────────

/**
 * Map a KPI's severity flag to the left-border accent class. `null` and
 * `'normal'` produce no border so the card looks calm by default; warning
 * and critical pull eye-balls without being alarmist.
 */
export function severityBorderClass(severity: KpiCard['severity']): string {
  if (severity === 'critical') return 'border-s-4 border-s-red-600';
  if (severity === 'warning') return 'border-s-4 border-s-amber-500';
  return '';
}

// ─── Delta colour resolver ────────────────────────────────────────────────────

export type DeltaTone = 'good' | 'bad' | 'flat';

/**
 * Map a KPI delta to a semantic tone. "good" / "bad" depend on
 * `better_when` — a falling overdue-invoice count is good, a falling
 * attendance rate is bad. "flat" is shown when the metric did not move.
 */
export function deltaTone(delta: KpiCard['delta']): DeltaTone {
  if (!delta || delta.direction === 'flat') return 'flat';
  return delta.direction === delta.better_when ? 'good' : 'bad';
}

export function deltaToneClass(tone: DeltaTone): string {
  if (tone === 'good') return 'text-emerald-600';
  if (tone === 'bad') return 'text-red-500';
  return 'text-text-tertiary';
}

/**
 * Format a numeric delta into a string the user can read, e.g.
 * `+3.2%` / `-1` / `0`. Percent units always carry a `%` suffix; absolute
 * units render as plain numbers. The sign is derived from `direction` so
 * we don't need to track signed numbers separately.
 */
export function formatDeltaText(delta: KpiCard['delta']): string {
  if (!delta) return '';
  const magnitude = Math.abs(delta.value);
  // Avoid trailing `.0` when the value is whole — `3.0%` reads as awkward.
  const valueText = Number.isInteger(magnitude) ? `${magnitude}` : magnitude.toFixed(1);
  const suffix = delta.unit === 'percent' ? '%' : '';
  if (delta.direction === 'flat') return `0${suffix}`;
  const sign = delta.direction === 'up' ? '+' : '−';
  return `${sign}${valueText}${suffix}`;
}

// ─── Sparkline normalisation ──────────────────────────────────────────────────

/**
 * Convert the backend's `number[]` sparkline into the `{ value }` array
 * Recharts expects. Returns `null` when the sparkline is too short to
 * render (Recharts needs ≥ 2 points to draw a line). Pure function so
 * the component can short-circuit before mounting `<ResponsiveContainer>`.
 */
export function toSparklineSeries(sparkline: number[]): ReadonlyArray<{ value: number }> | null {
  if (!Array.isArray(sparkline) || sparkline.length < 2) return null;
  return sparkline.map((value) => ({ value }));
}

// ─── Drill-down link safety ───────────────────────────────────────────────────

/**
 * Defensive guard: only treat the backend's `drill_down_href` as a link
 * if it starts with a single `/` and is not protocol-relative (`//host`).
 * This prevents an open-redirect via a maliciously crafted DB row (the
 * backend already constrains it, but defence-in-depth stays cheap).
 */
export function isSafeDrillDownHref(href: string | undefined | null): boolean {
  if (typeof href !== 'string') return false;
  if (!href.startsWith('/')) return false;
  // Reject protocol-relative URLs like `//example.com` — those resolve to
  // an external host when navigated to.
  if (href.startsWith('//')) return false;
  return true;
}
