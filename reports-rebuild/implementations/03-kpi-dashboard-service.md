# Implementation 03 — KPI Dashboard Service

> **Wave:** 2 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Rewrite the KPI dashboard backend to return the 10 movable KPIs defined in `PLAN.md §3` with real data, per-tenant visibility filtering, and a stable tooltip-metadata contract the frontend consumes.

This replaces the current `UnifiedDashboardService.getKpiDashboard()` stub with a real implementation that queries every KPI's source data, applies the tenant's hidden-KPI preferences, and produces a deterministic response shape the frontend KPI card renders.

## What to change

### 1. `UnifiedDashboardService` rewrite (`apps/api/src/modules/reports/unified-dashboard.service.ts`)

New contract:

```ts
type KpiCard = {
  key: ReportKpiKey;
  label_key: string; // i18n key for the card title
  tooltip_key: string; // i18n key for the info-icon tooltip
  value: string | number; // formatted for display
  value_raw: number; // raw numeric for client sparkline aggregation
  delta: {
    value: number; // e.g. +3.2
    unit: 'percent' | 'absolute';
    direction: 'up' | 'down' | 'flat';
    better_when: 'up' | 'down'; // determines colour
  } | null;
  sparkline: number[]; // last 8 data points
  drill_down_href: string;
  severity: 'normal' | 'warning' | 'critical' | null;
};

type KpiDashboardResponse = {
  data: {
    generated_at: string;
    kpis: KpiCard[];
    trends: {
      // for the big chart at the bottom
      weeks: string[];
      attendance: number[];
      grades: number[];
      collection: number[];
    };
  };
  meta: { cache_hit: boolean };
};
```

Replace the endpoint's existing return shape (which currently falls back to a mocked body).

### 2. KPI calculation functions

Each of the 10 KPIs gets a `kpi-calculators/kpi-<key>.ts` file with a function:

```ts
async function calculate(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<Pick<KpiCard, 'value' | 'value_raw' | 'delta' | 'sparkline' | 'severity'>>;
```

The 10 calculators, one per file, in the same folder:

1. `kpi-attendance-today.ts` — query today's `attendance_records` grouped by status; compute `present / expected`; compare to rolling 7-school-day average.
2. `kpi-teacher-submission-compliance.ts` — query `attendance_sessions` this week, count sessions with `submitted_at IS NOT NULL` / expected.
3. `kpi-at-risk-students-new.ts` — count `student_academic_risk_alert` rows with `created_at >= start_of_week`; compare to prior week.
4. `kpi-behaviour-incidents-week.ts` — count `behaviour_incident` rows with `incident_date >= start_of_week`; compare to rolling 7-day avg.
5. `kpi-open-safeguarding-concerns.ts` — count `safeguarding_concern` with `status != 'resolved'`; also return age-of-oldest; set `severity = 'critical'` if age > 14 days.
6. `kpi-overdue-invoices.ts` — count `invoice` where `due_date < today AND outstanding_amount > 0`; compare week-on-week.
7. `kpi-grades-submission-lag.ts` — count `assessment` rows past `grades_due_at` with unsubmitted grades.
8. `kpi-new-applications-week.ts` — count `application` rows created this week.
9. `kpi-parent-escalations.ts` — count inbox conversations where last message was from a parent role, no staff read, older than 48h.
10. `kpi-cover-gaps-week.ts` — count `teacher_absence` rows this week with no matching cover assignment.

Every calculator runs inside the same `$transaction` passed in by the orchestrator, so RLS context is set once.

### 3. Sparkline data

Each KPI returns an 8-point sparkline. For time-series KPIs (1, 2, 3, 4, 6, 7, 8, 10) this is the last 8 days / weeks of the same metric. For "state" KPIs (5, 9) it's the last 8 snapshots taken at the top of each hour (we stop short of building a full time-series store — for these two we just take the current value 8 times and let the sparkline be flat until we land a snapshot job in a later cycle).

**Defer the snapshot job to a later cycle.** For KPIs 5 and 9, ship with sparkline = `[currentValue]` (length 1) and have the frontend gracefully render a non-sparkline in that case. Document this decision in the phase-03 completion record.

### 4. Tenant KPI visibility

Before returning the response, read `reports_kpi_tenant_preferences.hidden_kpi_keys` for the tenant and exclude any KPI whose key is in the list. If no preferences row exists, default to all 10 visible.

### 5. Caching

Cache the full dashboard response per tenant for 5 minutes in Redis. Key: `reports:kpi-dashboard:${tenantId}`. On read, increment `meta.cache_hit: true`; otherwise compute and store.

Cache bust is manual (the `?refresh=true` query param bypasses) and automatic at 5 minutes. Write operations that might change KPIs (marking attendance, creating incidents, etc.) are **not** wired to cache invalidation — 5 minutes is accepted staleness.

### 6. Trends data (the big chart)

The big chart at the bottom of the dashboard currently uses `MOCK_TRENDS`. Replace with real data: `trends.weeks` = last 12 weeks' ISO labels; `trends.attendance`, `trends.grades`, `trends.collection` = weekly aggregates over that window.

### 7. Endpoint

Expose `GET /v1/reports/analytics/dashboard` — it already exists with the stubbed implementation. Replace the body to delegate to the new `UnifiedDashboardService.getKpiDashboard()`.

Keep the AI summary endpoint separate (`POST /v1/reports/analytics/ai-summary`) — that's owned by impl 10.

## Testing requirements

- **Unit test per KPI calculator.** Seed known data, run the calculator, assert the value. Test edge cases (no data → returns `0` with `delta: null`; division by zero → safe zero).
- **Integration test** — full `GET /v1/reports/analytics/dashboard` against a seeded NHQS-like fixture.
- **Cache test** — first call computes, second call within 5 min returns `meta.cache_hit: true`.
- **Tenant visibility test** — set `hidden_kpi_keys = ['attendance_today']` for a tenant, assert the response omits that KPI.
- **RLS test** — data from Tenant A does not leak into Tenant B's dashboard.

## Post-deploy verification

1. `GET /v1/reports/analytics/dashboard` as owner@nhqs.test — expect 10 KPIs with real values (not 195 / 93 / 75 / 88 mock numbers).
2. Verify sparkline arrays are non-empty for KPIs 1-4, 6-8, 10; length-1 for KPIs 5 and 9.
3. Set `hidden_kpi_keys = ['parent_escalations']` via direct SQL, re-fetch dashboard, confirm that KPI is absent.
4. Refresh the page — `meta.cache_hit` is true within 5 minutes.

## Follow-ups for subsequent waves

- **Impl 14 (Hub UI)** consumes this endpoint. It replaces the silent-mock-fallback with a real error state.
- **Impl 21 (Settings page)** exposes the `hidden_kpi_keys` toggles.
- **Later (deferred):** a BullMQ snapshot job that hydrates sparklines for state-KPIs (5, 9). Out of scope for this rebuild.

## Rollback

`git revert <sha>` — service rewrite only. No schema change. Safe to revert.
