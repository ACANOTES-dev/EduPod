# Implementation 08 — Scheduled Reports Worker

> **Wave:** 3 (parallel, worker restart)
> **Depends on:** 01, 02, 04
> **Deploys:** worker restart only

---

## Goal

Activate scheduled reports: build the BullMQ worker that fires `reports:scheduled-run` on a 15-minute cron, executes every due saved report via the query engine, generates the configured export format(s), and delivers by email and/or inbox. Log every run to `scheduled_report_runs`.

Currently `ScheduledReportsService.execute()` exists but no processor fires it on a schedule. This phase makes scheduled reports actually run.

## What to change

### 1. New worker processor

`apps/worker/src/processors/reports/scheduled-reports.processor.ts`:

```ts
@Processor(REPORTS_QUEUE)
export class ScheduledReportsProcessor extends WorkerHost {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly queryEngine: QueryEngineService,
    private readonly exportService: ReportExportService,
    private readonly inboxDispatch: InboxDispatchService,
    private readonly mailer: MailerService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== REPORTS_SCHEDULED_RUN_JOB) return;
    // Iterate all tenants with due scheduled reports
    // For each: instantiate TenantAwareJob subclass, call execute
  }
}
```

### 2. `TenantAwareJob` subclass — `RunScheduledReportJob`

In `apps/worker/src/jobs/reports/run-scheduled-report.job.ts`:

```ts
export class RunScheduledReportJob extends TenantAwareJob {
  constructor(deps: { /* ... */ }) {
    super(deps.prisma);
  }

  async execute(payload: { tenant_id: string; scheduled_report_id: string }) {
    const run = await this.createRunRow(payload);
    try {
      const report = await this.loadScheduledReport(payload.scheduled_report_id);
      const query = this.deserialiseQuery(report.saved_report);
      const result = await this.queryEngine.execute(
        payload.tenant_id,
        report.owner_user_id,
        report.owner_permissions,
        query,
        { page: 1, pageSize: 100000 }, // unbounded; report knows its size
      );
      const artifact = await this.exportService.exportPdf({
        /* build ExportInput from result + metadata */
      });
      const key = await this.uploadToS3(payload.tenant_id, run.id, artifact);
      await this.deliver(report, key);
      await this.markRunSucceeded(run.id, result.rows.length, key);
    } catch (err) {
      await this.markRunFailed(run.id, err);
      throw err; // BullMQ retries
    }
  }
}
```

### 3. Cron orchestration

Update `apps/api/src/modules/background/cron-scheduler.service.ts` (or wherever cron registrations live) to register:

```ts
await this.reportsQueue.add(
  REPORTS_SCHEDULED_RUN_JOB,
  {}, // empty payload; processor iterates tenants
  {
    jobId: `cron:${REPORTS_SCHEDULED_RUN_JOB}`,
    repeat: { pattern: '*/15 * * * *' }, // every 15 minutes
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

The processor then reads all `scheduled_reports` with `next_run_at <= now() AND enabled = true`, enqueues one per-scheduled-report job, and updates `next_run_at` based on the cron expression stored on the row.

### 4. Delivery

Each scheduled report has a `delivery_channels` field (existing on `ScheduledReport` table — verify, extend if needed) listing:

- `email` — `mailer.send({ to: report.recipient_emails, subject, attachments: [{ name, content: artifact }] })`.
- `inbox` — create a `broadcast` conversation with the artifact as attachment, recipients = `inbox_recipient_user_ids`. Reuse `report-sharing.service.ts` from impl 13 once it lands; for this impl, if that service doesn't exist yet, create a minimal version inline and refactor later.

Delivery failures do NOT fail the whole job — log them in the run row's `error_message` but still mark the run `succeeded` with partial delivery.

### 5. Next-run-at calculation

For each fired scheduled report, compute the next fire time from its cron expression using `cron-parser` (already a dependency). Update the scheduled-report row with the new `next_run_at`.

### 6. Retention

A scheduled report's `scheduled_report_runs` history is kept for 1 year, after which older rows are purged. Add this cleanup as a separate cron job `reports:scheduled-runs-cleanup` on a weekly schedule. Low priority; can be added in a follow-up phase if out of scope here — but declare the need in the completion record.

### 7. Re-enqueue safety

If the worker crashes mid-run, the job retries with BullMQ's default retry policy. On retry, the processor checks for an existing `scheduled_report_runs` row with `status: running` for this scheduled report started in the last 10 minutes — if present, assume a worker restarted and skip (idempotent). Otherwise create a new run row.

## Testing requirements

- **Unit test** — the processor's tenant iteration: given N tenants with due reports, enqueues N jobs.
- **Unit test** — the `RunScheduledReportJob.execute` happy path with mocked query engine + export + mailer.
- **Integration test** — insert a scheduled report with `next_run_at = now()`, fire the cron, verify a run row is created and status becomes `succeeded`.
- **Delivery failure test** — mailer throws, assert run marked `succeeded` with error logged.
- **Idempotency test** — re-enqueue the same job twice within 10 minutes, assert only one run row is created.

## Post-deploy verification

1. On production, create a test scheduled report via the existing CRUD (saved report + schedule `*/20 * * * *` + recipients = owner@nhqs.test).
2. Wait for the next 15-minute tick.
3. `SELECT * FROM scheduled_report_runs ORDER BY started_at DESC LIMIT 5;` — confirm a row exists with `status: succeeded`.
4. Check the owner's email inbox — the export arrives as an attachment.
5. Check the in-app inbox — the artifact arrives as a broadcast message.
6. Worker logs show no unhandled exceptions.

## Follow-ups for subsequent waves

- **Impl 13 (Sharing)** will factor out the inbox-broadcast-with-attachment logic; this phase can inline it and refactor later.
- **Impl 17 (Scheduled UI)** displays `scheduled_report_runs` rows as "recent runs" per schedule.

## Rollback

`git revert <sha>` removes the processor + cron registration. In-flight jobs complete then the queue goes quiet. Safe to revert.

## Architecture doc update

Per `.claude/rules/architecture-policing.md`: this phase adds `reports:scheduled-run` + `reports:scheduled-runs-cleanup` jobs. Update `docs/architecture/event-job-catalog.md` with these entries and the ScheduledReport state-machine-like `enabled → paused → enabled → ...` pseudo-states.
