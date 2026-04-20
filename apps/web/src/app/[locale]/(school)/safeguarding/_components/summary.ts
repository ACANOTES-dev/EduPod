/**
 * Pure helpers that shape the safeguarding sub-hub KPIs from the existing
 * `GET /api/v1/safeguarding/dashboard` payload plus a small set of targeted
 * `GET /concerns` queries. Keeping this logic out of the JSX lets us assert
 * on the exact KPI arithmetic without rendering the page.
 */

// ─── Contracts (match the backend service return shape) ───────────────────────

export interface SafeguardingDashboardPayload {
  open_by_severity: Record<string, number>;
  sla_compliance: {
    overdue: number;
    due_within_24h: number;
    on_track: number;
    compliance_rate: number;
  };
  by_status: Record<string, number>;
  overdue_tasks: Array<{
    id: string;
    title: string;
    priority: string;
    due_date: string | null;
    entity_type: string;
    entity_id: string;
  }>;
  recent_actions: Array<{
    id: string;
    concern_number: string | null;
    action_type: string;
    description: string;
    created_at: string;
    action_by: { id: string; name: string } | null;
  }>;
}

export interface SafeguardingConcernRow {
  id: string;
  concern_number: string;
  title?: string | null;
  severity: string;
  status: string;
  sla_first_response_due?: string | null;
  sla_first_response_met_at?: string | null;
  created_at: string;
  assigned_to?: { id: string; first_name: string; last_name: string } | null;
  student?: { id: string; first_name: string; last_name: string } | null;
  sealed_at?: string | null;
  sealed_reason?: string | null;
  seal_approved_by?: { id: string; first_name: string; last_name: string } | null;
  sealed_by?: { id: string; first_name: string; last_name: string } | null;
}

export interface SafeguardingHubKpis {
  open_concerns_total: number;
  open_by_severity: { critical: number; high: number; medium: number; low: number };
  sla_breaches_open: number;
  critical_awaiting_ack: number;
  sealed_this_year: number;
}

// ─── KPI composition ──────────────────────────────────────────────────────────

export function composeHubKpis(
  dashboard: SafeguardingDashboardPayload | null,
  sealedThisYear: number | null,
): SafeguardingHubKpis {
  const severity = dashboard?.open_by_severity ?? {};
  const status = dashboard?.by_status ?? {};
  const open =
    (severity.critical ?? 0) + (severity.high ?? 0) + (severity.medium ?? 0) + (severity.low ?? 0);

  return {
    open_concerns_total: open,
    open_by_severity: {
      critical: severity.critical ?? 0,
      high: severity.high ?? 0,
      medium: severity.medium ?? 0,
      low: severity.low ?? 0,
    },
    sla_breaches_open: dashboard?.sla_compliance.overdue ?? 0,
    // "Awaiting acknowledgement" = concerns still in `reported` status and
    // carrying `critical` severity. The backend does not yet surface this
    // cross-cut directly; we approximate via the dashboard's two maps.
    critical_awaiting_ack: Math.min(severity.critical ?? 0, status.reported ?? 0),
    sealed_this_year: sealedThisYear ?? 0,
  };
}

// ─── SLA row derivations ──────────────────────────────────────────────────────

export type SlaBucket = 'breached' | 'due_soon' | 'on_track' | 'unknown';

export function deriveSlaBucket(
  row: Pick<SafeguardingConcernRow, 'sla_first_response_due' | 'sla_first_response_met_at'>,
  now: Date = new Date(),
): SlaBucket {
  if (row.sla_first_response_met_at) return 'on_track';
  if (!row.sla_first_response_due) return 'unknown';
  const due = new Date(row.sla_first_response_due).getTime();
  if (Number.isNaN(due)) return 'unknown';
  const msUntil = due - now.getTime();
  if (msUntil < 0) return 'breached';
  if (msUntil <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'on_track';
}

export function slaProgressPct(
  row: Pick<SafeguardingConcernRow, 'sla_first_response_due' | 'created_at'>,
  now: Date = new Date(),
): number {
  if (!row.sla_first_response_due) return 0;
  const start = new Date(row.created_at).getTime();
  const due = new Date(row.sla_first_response_due).getTime();
  if (Number.isNaN(start) || Number.isNaN(due) || due <= start) return 100;
  const elapsed = now.getTime() - start;
  const total = due - start;
  const pct = (elapsed / total) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct);
}

// ─── Sealed record masking ────────────────────────────────────────────────────

/**
 * Produce a redacted label for the sealed records list. The impl spec is
 * explicit: "Sealed concern · sealed YYYY-MM-DD · approved by <name>".
 * Falls back gracefully when approver or seal date is missing.
 */
export function sealedRowLabel(
  row: Pick<SafeguardingConcernRow, 'sealed_at' | 'seal_approved_by' | 'concern_number'>,
  opts: { unknownApprover: string; noDate: string },
): string {
  const parts: string[] = ['Sealed concern'];
  if (row.concern_number) parts.push(`#${row.concern_number}`);
  if (row.sealed_at) {
    const dt = new Date(row.sealed_at);
    if (!Number.isNaN(dt.getTime())) {
      parts.push(`· sealed ${dt.toISOString().slice(0, 10)}`);
    } else {
      parts.push(`· ${opts.noDate}`);
    }
  } else {
    parts.push(`· ${opts.noDate}`);
  }
  const approver = row.seal_approved_by
    ? `${row.seal_approved_by.first_name} ${row.seal_approved_by.last_name}`.trim()
    : null;
  parts.push(`· approved by ${approver ?? opts.unknownApprover}`);
  return parts.join(' ');
}
