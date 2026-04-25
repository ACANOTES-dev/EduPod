# Implementation 04 — Worker Pipelines + Payslip-Number Unification

> **Wave:** 3 (parallel-safe with impl 03)
> **Classification:** worker
> **Depends on:** 01, 02
> **Deploys:** worker + API (small enqueue-site changes)

---

## Goal

Fix the three worker job paths so the features behind them actually run in production:

1. **Mass export** — currently dead because the API enqueues `'payroll:mass-export'` and the worker handles `'payroll:mass-export-payslips'`. The Redis status key also disagrees between API and worker. Both must use the shared constants from `@school/shared/payroll`.
2. **Session generation** — currently triple-broken: wrong job name (`'payroll:session-generation'` vs `'payroll:generate-sessions'`), wrong payload field (`run_id` vs `payroll_run_id`), wrong Redis key prefix (missing `tenantId`). All three must align via shared constants. Additionally, the processor must count `class_delivery_records` (status = delivered) bracketed to the run period, not raw `schedule.count()`.
3. **Approval callback** — Wave 2 already rewrote this to delegate to `FinalisationService.finaliseAtomic`. This impl just verifies the constant import is in place and the dispatcher routes correctly.
4. **Mass export idempotency** — add `jobId: \`mass-export:${runId}:${locale}\`` so double-clicking the export button enqueues only one job.
5. **PDF lifetime** — extend the Redis TTL from 5 minutes to 20 minutes (`MASS_EXPORT_PDF_TTL_SECONDS = 1200` in shared constants), giving the UI a fair download window.
6. **Connection pooling** — replace `new Redis(...)` per-job with the injected `RedisService`. Per-job connections are wasteful and can exhaust max-connections under load.

By the end of this impl, every "Export" and "Auto-populate sessions" click results in a job that actually runs, and the UI status poll matches the worker writer.

---

## Shared files this impl touches

This impl is parallel-safe with impl 03 (API contract). They share zero source files because all shared constants live in `@school/shared/payroll`. Both impls restart the API; their deploys serialise via the 3-minute poll.

- `apps/worker/src/processors/payroll/payroll-queue.processor.ts` — dispatcher. Owned.
- `apps/worker/src/processors/payroll/mass-export.processor.ts` — owned.
- `apps/worker/src/processors/payroll/session-generation.processor.ts` — owned.
- `apps/worker/src/processors/payroll/approval-callback.processor.ts` — touched only to verify Wave 2's rewrite imports the shared constant. Owned.
- `apps/api/src/modules/payroll/payroll-runs.service.ts` — touched ONLY at the small enqueue sites for session-generation and mass-export. Wave 2 rewrote the bulk of this file; this impl makes 3-line changes. Edit late, with explicit pathspec, to avoid colliding with anything Wave 2 leaked.
- `apps/api/src/modules/payroll/payslips.service.ts` — touched ONLY at `triggerMassExport()` to use the shared constant + Redis key builder. Edit late, with explicit pathspec.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

The shared constants from `@school/shared` (impl 01 created them) are imported, never written. So no shared-file conflict with impl 03 there.

---

## What to build

### 1. Update the dispatcher (`payroll-queue.processor.ts`)

Replace any hardcoded job-name strings with imports from `@school/shared/payroll`:

```typescript
import {
  PAYROLL_QUEUE,
  PAYROLL_ON_APPROVAL_JOB,
  PAYROLL_MASS_EXPORT_JOB,
  PAYROLL_SESSION_GENERATION_JOB,
} from '@school/shared';

@Processor(PAYROLL_QUEUE)
export class PayrollQueueDispatcher extends WorkerHost {
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PAYROLL_ON_APPROVAL_JOB:
        return this.approvalCallback.handle(job);
      case PAYROLL_MASS_EXPORT_JOB:
        return this.massExport.handle(job);
      case PAYROLL_SESSION_GENERATION_JOB:
        return this.sessionGeneration.handle(job);
      default:
        if (this.isCanaryEcho(job)) return;
        this.logger.warn(`Unknown payroll job name: ${job.name}`);
    }
  }
}
```

The `default` branch logs but doesn't throw. Unknown job names are warning-only — never crash the dispatcher.

### 2. Rewrite `mass-export.processor.ts`

```typescript
import {
  PAYROLL_MASS_EXPORT_JOB,
  buildMassExportStatusKey,
  buildMassExportPdfKey,
  MASS_EXPORT_STATUS_TTL_SECONDS,
  MASS_EXPORT_PDF_TTL_SECONDS,
} from '@school/shared';

export const MASS_EXPORT_JOB_NAME = PAYROLL_MASS_EXPORT_JOB; // re-export for callers if needed

@Injectable()
export class PayrollMassExportProcessor {
  private readonly logger = new Logger(PayrollMassExportProcessor.name);

  constructor(
    private readonly redisService: RedisService, // INJECTED — no per-job new Redis(...)
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly pdfService: PdfRenderingService,
  ) {}

  async handle(job: Job<MassExportPayload>): Promise<void> {
    if (job.name !== PAYROLL_MASS_EXPORT_JOB) return;
    const data = job.data;
    if (!data?.tenant_id || !data?.payroll_run_id) {
      throw new Error('Mass export job missing tenant_id or payroll_run_id');
    }

    const inner = new PayrollMassExportJob(
      this.redisService.getClient(),
      this.prisma,
      this.pdfService,
      data,
    );
    await inner.execute();
  }
}

class PayrollMassExportJob extends TenantAwareJob<MassExportPayload> {
  private readonly statusKey: string;
  private readonly pdfKey: string;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    pdf: PdfRenderingService,
    payload: MassExportPayload,
  ) {
    super({ tenantId: payload.tenant_id, payload, redis, prisma });
    this.statusKey = buildMassExportStatusKey(payload.tenant_id, payload.payroll_run_id);
    this.pdfKey = buildMassExportPdfKey(payload.tenant_id, payload.payroll_run_id);
  }

  async processJob(): Promise<void> {
    await this.redis.set(
      this.statusKey,
      JSON.stringify({ status: 'running', started_at: new Date().toISOString() }),
      'EX',
      MASS_EXPORT_STATUS_TTL_SECONDS,
    );

    try {
      // 1. Fetch run + entries + payslips
      // 2. Render combined PDF via PdfRenderingService.renderPayrollMassExport(...)
      // 3. Store base64 PDF in Redis with 20-min TTL
      // 4. Set status to 'ready'
      const pdfBase64 = await this.renderCombinedPdf();
      await this.redis.set(this.pdfKey, pdfBase64, 'EX', MASS_EXPORT_PDF_TTL_SECONDS);
      await this.redis.set(
        this.statusKey,
        JSON.stringify({ status: 'ready', completed_at: new Date().toISOString() }),
        'EX',
        MASS_EXPORT_STATUS_TTL_SECONDS,
      );
    } catch (e) {
      await this.redis.set(
        this.statusKey,
        JSON.stringify({ status: 'failed', error: e.message, failed_at: new Date().toISOString() }),
        'EX',
        MASS_EXPORT_STATUS_TTL_SECONDS,
      );
      throw e;
    }
  }
}
```

Critical changes from current:

- Job name comparison uses `PAYROLL_MASS_EXPORT_JOB`.
- Redis status key uses `buildMassExportStatusKey(tenantId, runId)`.
- Redis PDF key uses `buildMassExportPdfKey(tenantId, runId)`.
- TTLs from shared constants (20 min for PDF, 10 min for status).
- Redis client injected via `RedisService`, not `new Redis(...)`.

### 3. Rewrite `session-generation.processor.ts`

```typescript
import {
  PAYROLL_SESSION_GENERATION_JOB,
  buildSessionGenStatusKey,
  SESSION_GEN_STATUS_TTL_SECONDS,
} from '@school/shared';

export const SESSION_GENERATION_JOB_NAME = PAYROLL_SESSION_GENERATION_JOB;

@Injectable()
export class PayrollSessionGenerationProcessor {
  constructor(
    private readonly redisService: RedisService,
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly classDelivery: ClassDeliveryService,
    private readonly schoolClosures: SchoolClosuresReadFacade,
  ) {}

  async handle(job: Job<SessionGenerationPayload>): Promise<void> {
    if (job.name !== PAYROLL_SESSION_GENERATION_JOB) return;
    const data = job.data;
    if (!data?.tenant_id || !data?.payroll_run_id) {
      throw new Error('Session generation job missing tenant_id or payroll_run_id');
    }
    const inner = new PayrollSessionGenerationJob(
      this.redisService.getClient(),
      this.prisma,
      this.classDelivery,
      this.schoolClosures,
      data,
    );
    await inner.execute();
  }
}
```

The inner job:

1. Status: `running` — written to `buildSessionGenStatusKey(tenantId, runId)`.
2. Fetch the run + per_class entries.
3. For each entry, call the existing `ClassDeliveryService.autoPopulateFromSchedule(tenantId, staff_profile_id, period_start, period_end)` — this method already exists and correctly uses the school-closures facade.
4. After populate, call `ClassDeliveryService.calculateClassesDelivered(tenantId, staff_profile_id, period_start, period_end)` to count what's now in the table.
5. Update the entry's `classes_taught` and `auto_populated_class_count` columns.
6. Status: `completed` with summary `{ entries_processed, classes_populated, classes_delivered }`.

Critical changes from current:

- Reads `data.payroll_run_id` (not `data.run_id`).
- The shared payload schema in `@school/shared` (Wave 1) uses `payroll_run_id`. The Wave 1 stub schema's field name MUST match. If Wave 1 used `run_id`, this is a Wave 4 change to standardise on `payroll_run_id`. Decide at impl start.
- Redis key includes `tenantId`.
- Counts confirmed delivery records, not raw schedule slots.
- Respects school closures (delegated to `autoPopulateFromSchedule` which already does it correctly).

### 4. Verify `approval-callback.processor.ts`

Wave 2 rewrote this to delegate to `FinalisationService`. This impl checks:

- The job-name guard uses `PAYROLL_ON_APPROVAL_JOB` from shared.
- The payload type is the canonical `ApprovalCallbackPayload` shape.
- The processor injects `FinalisationService` (or whatever shared module exports it).
- No inline calculation, payslip generation, or sequence handling — all of that lives in `FinalisationService`.

If any of the above is wrong, fix it in this impl. If Wave 2 did the work correctly, the only change is verifying the import path of `PAYROLL_ON_APPROVAL_JOB`.

### 5. Update API enqueue sites

Three small surgical changes in API services:

#### 5a. `payroll-runs.service.ts.triggerSessionGeneration` (~line 585)

```typescript
import {
  PAYROLL_QUEUE,
  PAYROLL_SESSION_GENERATION_JOB,
  buildSessionGenStatusKey,
  SESSION_GEN_STATUS_TTL_SECONDS,
} from '@school/shared';

async triggerSessionGeneration(tenantId: string, runId: string, actorUserId: string): Promise<void> {
  // … existing validations …

  const statusKey = buildSessionGenStatusKey(tenantId, runId);
  await this.redis.set(
    statusKey,
    JSON.stringify({ status: 'queued', queued_at: new Date().toISOString() }),
    'EX',
    SESSION_GEN_STATUS_TTL_SECONDS,
  );

  await this.payrollQueue.add(
    PAYROLL_SESSION_GENERATION_JOB,
    {
      tenant_id: tenantId,
      payroll_run_id: runId,    // CANONICAL field name
      actor_user_id: actorUserId,
    },
    {
      jobId: `session-gen:${runId}`,    // idempotency
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
}

async getSessionGenerationStatus(tenantId: string, runId: string): Promise<SessionGenStatus> {
  const key = buildSessionGenStatusKey(tenantId, runId);
  const raw = await this.redis.get(key);
  if (!raw) return { status: 'not_found' };
  return JSON.parse(raw);
}
```

#### 5b. `payslips.service.ts.triggerMassExport` (~line 344)

```typescript
import {
  PAYROLL_QUEUE,
  PAYROLL_MASS_EXPORT_JOB,
  buildMassExportStatusKey,
  MASS_EXPORT_STATUS_TTL_SECONDS,
} from '@school/shared';

async triggerMassExport(tenantId: string, runId: string, locale: string, actorUserId: string): Promise<void> {
  const statusKey = buildMassExportStatusKey(tenantId, runId);
  await this.redis.set(
    statusKey,
    JSON.stringify({ status: 'queued', queued_at: new Date().toISOString() }),
    'EX',
    MASS_EXPORT_STATUS_TTL_SECONDS,
  );

  await this.payrollQueue.add(
    PAYROLL_MASS_EXPORT_JOB,
    {
      tenant_id: tenantId,
      payroll_run_id: runId,
      locale,
      requested_by_user_id: actorUserId,
    },
    {
      jobId: `mass-export:${runId}:${locale}`,    // idempotency
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
}

async getMassExportStatus(tenantId: string, runId: string): Promise<MassExportStatus> {
  const key = buildMassExportStatusKey(tenantId, runId);
  const raw = await this.redis.get(key);
  if (!raw) return { status: 'not_found' };
  return JSON.parse(raw);
}
```

#### 5c. The mass-export download endpoint

When the UI hits `GET /v1/payroll/runs/:runId/mass-export-pdf`, the controller looks up the Redis key:

```typescript
@Get('runs/:runId/mass-export-pdf')
@RequiresPermission('payroll.generate_payslips')
async downloadMassExport(@CurrentTenant() ctx, @Param('runId') runId: string, @Res() res: Response) {
  const key = buildMassExportPdfKey(ctx.tenant_id, runId);
  const base64 = await this.redis.get(key);
  if (!base64) throw new NotFoundException({ code: 'MASS_EXPORT_NOT_READY', message: 'Either not generated yet or has expired. Re-trigger.' });
  const buf = Buffer.from(base64, 'base64');
  res.set({ 'Content-Type': 'application/pdf' });
  res.send(buf);
}
```

This endpoint may already exist; verify and align it to use `buildMassExportPdfKey`. Wave 3 is the API impl that decides whether this endpoint is here or in `payroll-enhanced.controller.ts`. Wave 4 (worker) only confirms the Redis key contract.

### 6. Drop the legacy hardcoded job-name constants

Search `apps/worker/src/processors/payroll/` for any remaining `'payroll:mass-export-payslips'` or `'payroll:generate-sessions'` strings. Delete them. Run `grep -r "payroll:mass-export\|payroll:generate-sessions\|payroll:session-generation\|payroll:on-approval"` across the codebase to ensure all string-uses are replaced by the shared constants. Any leftover string is a regression waiting to happen.

### 7. Optional: cleaner failure handling for mass-export

Today, when mass-export fails, the Redis status is set but `console.error` swallows the error. Add proper failure semantics:

- BullMQ retries the job up to 3 times with exponential backoff.
- After all retries fail, write status `failed` with the last error message.
- The UI's status poll surfaces "Export failed: <message>" to the user with a "Retry" button that re-triggers.

---

## Tests

- `payroll-queue.processor.spec.ts`: dispatch test — mock the three sub-processors, send a job for each known name, assert the right one is called. Send an unknown name, assert the warning is logged but no throw.
- `mass-export.processor.spec.ts`:
  - happy path: a job with valid payload writes status `running` → produces PDF → writes status `ready` and the PDF key with TTL 1200.
  - failure path: when PDF rendering throws, status is set to `failed` and the error is re-thrown so BullMQ retries.
  - tenant safety: missing `tenant_id` → throws, no Redis writes.
- `session-generation.processor.spec.ts`:
  - reads `data.payroll_run_id` (assert with a payload that uses this name).
  - writes the Redis status key in `payroll:session-gen:${tenantId}:${runId}` format.
  - calls `classDelivery.autoPopulateFromSchedule` for each per_class entry.
  - tenant safety as above.
- `payroll-runs.service.spec.ts` `triggerSessionGeneration`:
  - enqueues with name `PAYROLL_SESSION_GENERATION_JOB`.
  - includes `payroll_run_id` in the payload (not `run_id`).
  - sets the right Redis status key.
- `payslips.service.spec.ts` `triggerMassExport`:
  - enqueues with name `PAYROLL_MASS_EXPORT_JOB`.
  - includes `jobId: 'mass-export:${runId}:${locale}'` for idempotency.
  - sets the status key with the right format.

Cross-component integration test (run as part of the e2e suite):

- Trigger mass export via API → poll the status until `ready` (max 30s) → assert the PDF base64 is non-empty in Redis under the canonical key. End-to-end proof the API and worker are now talking.

---

## Watch out for

- **Worker module DI of FinalisationService**. Wave 2 introduced this. Verify the worker boots without `Cannot resolve dependency` errors. If FinalisationService isn't reachable from the worker module's import graph, Wave 2's fix should be in place — check.
- **Pre-existing in-flight jobs at deploy time.** When you restart the worker after deploying, any jobs still in BullMQ queues with the OLD job names (`'payroll:mass-export-payslips'`, `'payroll:generate-sessions'`) will be retried by the new dispatcher and hit the `default:` arm (warning, no throw, BullMQ retries until max-attempts then dead-letters). Two options: (a) leave them — they'll eventually exhaust retries and dead-letter; the user just re-clicks. (b) On worker boot, scan the queue and delete any pending job with one of the old names. Pick (a) — simpler and the UI re-trigger is easy.
- **Redis client injection.** `RedisService.getClient()` returns the existing pool's connection. Verify this is the correct API for the codebase. If the codebase uses a different pattern (e.g. a connection per service), follow that pattern.
- **Job payload Zod schemas.** Wave 1 created the shared schemas. The session-generation payload's field name MUST match across schema, API enqueuer, and worker handler. If any disagree, the smoke test catches it.
- **TenantAwareJob signature**. The base class may have a different constructor signature than shown above. Verify and adapt — the goal is "RLS context is set before any DB op", whatever the exact API is.
- **Old `payroll:mass-export-payslips` constant** may still be referenced from a test file. Search and remove.
- **Cron registrations.** No payroll crons exist (audit confirmed). If a future maintainer adds one, ensure they also use the shared constants. Wave 5 may add a danger-zone note.

---

## Deployment notes

This impl restarts API + worker. Sequence:

1. Apply patch.
2. No migration.
3. Build: `pnpm turbo run build --filter=@school/api --filter=@school/worker`.
4. Restart worker first (idempotent — old in-flight jobs will warn-and-skip until they exhaust retries): `pm2 restart worker --update-env`.
5. Restart API: `pm2 restart api --update-env`.
6. Smoke tests:
   - Trigger session generation on a draft run with at least one per_class teacher. Poll `GET /v1/payroll/runs/:id/session-generation-status` (or whatever the existing status endpoint is) every 2 seconds. Within ~10 seconds it should flip from `queued` → `running` → `completed` with a non-empty `entries_processed` count. Verify `classes_taught` on the affected entries reflects DELIVERED records, not just scheduled slots (set up a fixture with a delivered=2 vs scheduled=5 case to confirm).
   - Trigger mass export on a finalised run. Poll the status endpoint. Within ~30 seconds it should flip to `ready`. Hit the PDF download endpoint within 20 minutes. Verify the PDF opens and contains all payslips.
   - Worker logs: `pm2 logs worker | tail -50`. No `Unknown payroll job name` warnings during normal operation.
7. Multi-trigger idempotency: click "Auto-populate sessions" twice in quick succession. Assert only one job runs (BullMQ dedupes via `jobId`).
8. Tenant isolation: trigger mass export for tenantA's run. Confirm tenantB cannot read the PDF via `buildMassExportPdfKey(tenantB.id, tenantA.runId)` — they'd need both pieces of info, but the Redis key namespace makes accidental hits impossible.
