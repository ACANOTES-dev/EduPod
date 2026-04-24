# Implementation 09 — Report Alerts Worker

> **Wave:** 3 (parallel, worker restart)
> **Depends on:** 01, 03
> **Deploys:** worker restart only

---

## Goal

Activate report alerts: a BullMQ worker that evaluates every enabled `report_alert` every 30 minutes, compares measured metric values to thresholds, and fires inbox notifications when thresholds are crossed — with anti-spam so the same alert doesn't re-fire continuously.

Currently `ReportAlertsService` has CRUD + a `checkAndTrigger()` method but no worker invokes it on a cron. This phase makes alerts actually alert.

## What to change

### 1. Alert metric registry

Each alert targets a specific metric (defined by a string key). The worker needs a map from metric key to calculator function.

File: `apps/api/src/modules/reports/report-alerts/metric-registry.ts`:

```ts
type MetricCalculator = (tx: PrismaTransaction, tenantId: string) => Promise<number>;

const METRIC_REGISTRY: Record<ReportAlertMetricKey, MetricCalculator> = {
  overdue_invoices_count: async (tx, tenantId) => {
    return tx.invoice.count({ where: { tenant_id: tenantId, status: 'overdue' } });
  },
  attendance_rate_today: async (tx, tenantId) => {
    /* ... */
  },
  open_safeguarding_concerns_count: async (tx, tenantId) => {
    /* ... */
  },
  at_risk_students_count: async (tx, tenantId) => {
    /* ... */
  },
  unpaid_balance_total: async (tx, tenantId) => {
    /* ... */
  },
  behaviour_incidents_week: async (tx, tenantId) => {
    /* ... */
  },
  teacher_submission_compliance_week: async (tx, tenantId) => {
    /* ... */
  },
  cover_gaps_week: async (tx, tenantId) => {
    /* ... */
  },
};
```

Ship 8 metric keys to start — one per KPI that admins will most commonly want alerts on. Extending is cheap: add a new key + calculator.

### 2. Worker processor

`apps/worker/src/processors/reports/report-alerts.processor.ts`:

```ts
@Processor(REPORTS_QUEUE)
export class ReportAlertsProcessor extends WorkerHost {
  async process(job: Job) {
    if (job.name !== REPORTS_ALERT_EVALUATE_JOB) return;
    // Iterate all tenants with enabled alerts
    // Group by tenant; one RLS transaction per tenant evaluates all that tenant's alerts
  }
}
```

Inside the processor, for each tenant:

1. Load all enabled alerts: `tx.reportAlert.findMany({ where: { tenant_id, enabled: true } })`.
2. For each alert:
   - Look up the metric calculator.
   - Run it to get `measured_value`.
   - Apply the comparison: `operator` ∈ `{ gt, gte, lt, lte, eq, ne }` against `threshold_value`.
   - If the comparison is true (threshold crossed), check anti-spam (see step 3).
   - If firing is allowed, create an inbox notification for the recipients.
3. Anti-spam: query `report_alert_runs` for this alert in the last 24h. If any have `outcome: threshold_crossed` AND the current measurement is still on the "bad" side AND we haven't measured "ok" in between, suppress. Otherwise fire.
4. Log the evaluation outcome: `report_alert_runs` row with `{ alert_id, evaluated_at, outcome, measured_value, threshold_value, notified_user_ids }`.

### 3. Cron registration

```ts
await this.reportsQueue.add(
  REPORTS_ALERT_EVALUATE_JOB,
  {},
  {
    jobId: `cron:${REPORTS_ALERT_EVALUATE_JOB}`,
    repeat: { pattern: '*/30 * * * *' }, // every 30 minutes
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

### 4. Notification dispatch

Alert firing produces an inbox notification (NOT an email by default — too noisy). Use the existing `InboxDispatch` + `ConversationsService.create` to create a `broadcast` conversation with:

- `subject: "Alert: {alert.name}"`
- `body: "Metric '{metric_label}' crossed threshold. Current value: {measured}. Threshold: {threshold}."`
- `recipients: alert.recipient_user_ids`
- Attach a link back to the alert's source report (`alert.source_saved_report_id` if set, else `/reports/alerts/{alert_id}`).

If `alert.email_enabled = true` (opt-in flag on the alert), also send via mailer.

### 5. State signalling back to the alert row

After firing, update `report_alert.last_fired_at = now()` and `report_alert.last_measured_value = measured`. These are small columns — add to the `ReportAlert` model if not already present. If a migration is needed, do it inline in this phase (small forward migration).

### 6. Alert history endpoint

`GET /v1/reports/alerts/:id/history` — returns the last 50 `report_alert_runs` rows for this alert. Consumed by impl 17.

## Testing requirements

- **Unit tests** — every metric calculator returns the expected number for a seeded fixture.
- **Unit test** — operator evaluation: gt, gte, lt, lte, eq, ne for various values.
- **Unit test** — anti-spam logic: repeated threshold crossings within 24h fire only once; a return-to-ok resets the flag.
- **Integration test** — create an alert on `overdue_invoices_count` with threshold `gt 5`, seed 10 overdue invoices, run evaluation, assert inbox message dispatched + run row written with `outcome: threshold_crossed`.
- **Recovery test** — same alert, delete 8 invoices so count is 2 (< 5), run evaluation, assert `outcome: ok`, no dispatch. Now add back to 10, run again, assert fresh dispatch (anti-spam reset).

## Post-deploy verification

1. Create a test alert via UI/CRUD on a known-crossing metric.
2. Wait for next 30-minute tick.
3. `SELECT * FROM report_alert_runs ORDER BY evaluated_at DESC LIMIT 5;` — confirm an evaluation row.
4. If threshold was crossed, confirm inbox message dispatched to the alert's recipients.
5. Worker logs clean.

## Follow-ups for subsequent waves

- **Impl 17 (Alerts UI)** consumes `GET /v1/reports/alerts/:id/history`.
- Metric registry is extensible — schools will ask for custom thresholds on arbitrary saved reports. Not in this phase; possible next-cycle addition to let any saved report's aggregate be alert-able.

## Rollback

`git revert <sha>` removes the processor + cron. In-flight evaluations complete. Safe.

## Architecture doc update

Update `docs/architecture/event-job-catalog.md`: new `reports:alert-evaluate` cron entry with its metric registry.
