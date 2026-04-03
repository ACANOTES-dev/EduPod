# Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the worker infrastructure against stalls, observe queue health in production, protect external calls with circuit breakers, restructure database transactions to remove blocking I/O, and add manual recovery tooling for stuck approval callbacks.

**Architecture:** Five sequential phases — each building on the last. Phase 1 (R-20) hardens BullMQ lock durations so long-running jobs are not falsely stalled. Phase 2 (R-25) adds synthetic canary jobs to detect dead workers. Phase 3 (R-15) wraps all external provider calls in circuit breakers. Phase 4 (R-14+R-24) moves Puppeteer and external API calls out of database transactions. Phase 5 (R-26) adds manual retry tooling for stuck approval callbacks.

**Tech Stack:** NestJS, BullMQ v5, Prisma, cockatiel (circuit breaker), Puppeteer, Resend, Twilio, Stripe, Sentry

---

## Phase 1: R-20 — BullMQ `lockDuration` Hardening

**Why:** BullMQ's default `lockDuration` is 30 seconds. If a processor takes longer, BullMQ marks the job as stalled and re-enqueues it — causing double-processing. 18 processors in this codebase can legitimately exceed 30 seconds (PDF rendering, CSV imports, materialized view refreshes, the scheduling solver, cross-tenant crons). Zero processors currently set `lockDuration`.

**Approach:** Change `@Processor(QUEUE_NAMES.X)` to `@Processor(QUEUE_NAMES.X, { lockDuration: N })` for all Tier 1 and Tier 2 processors. Special handling for the synchronous CPU-bound solver which blocks the event loop and prevents automatic lock renewal.

**Status: COMPLETE** — All 26 processors updated, type-check passes, 579/579 tests pass.

**Implementation note:** The plan originally specified `@Processor({ name: QUEUE_NAMES.X, lockDuration: N })` (single object argument). This doesn't compile — `@nestjs/bullmq`'s `ProcessorOptions` type doesn't include `lockDuration`. The correct API is `@Processor(QUEUE_NAMES.X, { lockDuration: N })` (two arguments: queue name string + worker options object). All files were implemented with the correct syntax.

---

### Task 1: Add `lockDuration` to Tier 1 Critical Processors

These processors contain operations that routinely exceed 30 seconds.

**Files to modify (18 files):**

| File                                                                       | `lockDuration` | Reason                                                         |
| -------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `apps/worker/src/processors/pdf-rendering/pdf-render.processor.ts`         | 120000         | Puppeteer launch + networkidle0 (15s) × 2 attempts + S3 upload |
| `apps/worker/src/processors/payroll/mass-export.processor.ts`              | 300000         | Puppeteer for 100+ payslips + S3                               |
| `apps/worker/src/processors/scheduling/solver-v2.processor.ts`             | 300000         | CPU-bound CSP solver, event loop blocked                       |
| `apps/worker/src/processors/compliance/compliance-execution.processor.ts`  | 120000         | GDPR erasure across many tables + Redis SCAN + S3              |
| `apps/worker/src/processors/early-warning/compute-daily.processor.ts`      | 300000         | Cross-tenant, all students × 5 signals                         |
| `apps/worker/src/processors/compliance/retention-enforcement.processor.ts` | 120000         | Cross-tenant batch deletion                                    |
| `apps/worker/src/processors/security/key-rotation.processor.ts`            | 300000         | AES re-encryption across all tenants                           |
| `apps/worker/src/processors/security/anomaly-scan.processor.ts`            | 180000         | 7 detection rules across all tenants                           |
| `apps/worker/src/processors/imports/import-processing.processor.ts`        | 120000         | S3 download + per-row upsert loop                              |
| `apps/worker/src/processors/imports/import-validation.processor.ts`        | 60000          | S3 download + per-row duplicate check                          |
| `apps/worker/src/processors/search-reindex.processor.ts`                   | 120000         | Full tenant reindex, 4 entity types                            |
| `apps/worker/src/processors/regulatory/ppod-sync.processor.ts`             | 120000         | Per-student hash + upsert loop                                 |
| `apps/worker/src/processors/regulatory/des-returns-generate.processor.ts`  | 120000         | Multi-entity aggregation                                       |
| `apps/worker/src/processors/gradebook/bulk-import.processor.ts`            | 60000          | Row-by-row grade upsert                                        |
| `apps/worker/src/processors/attendance-pattern-detection.processor.ts`     | 180000         | Cross-tenant per-student detection                             |
| `apps/worker/src/processors/behaviour/refresh-mv.processor.ts`             | 300000         | REFRESH MATERIALIZED VIEW CONCURRENTLY ×3                      |
| `apps/worker/src/processors/regulatory/ppod-import.processor.ts`           | 60000          | CSV parse + per-row upsert                                     |
| `apps/worker/src/processors/payroll/session-generation.processor.ts`       | 60000          | Per-class entry iteration                                      |

- [x] **Step 1: Update `pdf-render.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.PDF_RENDERING)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.PDF_RENDERING, lockDuration: 120_000 })
```

- [x] **Step 2: Update `mass-export.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.PAYROLL)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.PAYROLL, lockDuration: 300_000 })
```

- [x] **Step 3: Update `solver-v2.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.SCHEDULING)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.SCHEDULING, lockDuration: 300_000 })
```

- [x] **Step 4: Update `compliance-execution.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.IMPORTS)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.IMPORTS, lockDuration: 120_000 })
```

> **Note:** This processor is on the wrong queue (`IMPORTS` instead of `COMPLIANCE`). That's a separate fix tracked outside this plan. For now, set `lockDuration` on the queue it's actually on.

- [x] **Step 5: Update `compute-daily.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.EARLY_WARNING)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.EARLY_WARNING, lockDuration: 300_000 })
```

- [x] **Step 6: Update `retention-enforcement.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.COMPLIANCE)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.COMPLIANCE, lockDuration: 120_000 })
```

- [x] **Step 7: Update `key-rotation.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.SECURITY)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.SECURITY, lockDuration: 300_000 })
```

- [x] **Step 8: Update `anomaly-scan.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.SECURITY)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.SECURITY, lockDuration: 180_000 })
```

> **Note:** Two processors share the `SECURITY` queue. When multiple `@Processor` decorators target the same queue name, BullMQ creates a single `Worker` and the **last** `lockDuration` set wins (worker-level config). Use the maximum needed across both processors — 300000ms from `key-rotation`. Set both to `300_000` for consistency.

**Revision:** Set `anomaly-scan.processor.ts` to `300_000` to match `key-rotation.processor.ts` (same queue = same worker = same lockDuration).

- [x] **Step 9: Update `import-processing.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.IMPORTS)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.IMPORTS, lockDuration: 120_000 })
```

- [x] **Step 10: Update `import-validation.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.IMPORTS)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.IMPORTS, lockDuration: 120_000 })
```

> **Note:** Same queue as `import-processing` and `compliance-execution`. Use max = 120000.

- [x] **Step 11: Update `search-reindex.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.SEARCH_SYNC)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.SEARCH_SYNC, lockDuration: 120_000 })
```

- [x] **Step 12: Update `ppod-sync.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.REGULATORY)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.REGULATORY, lockDuration: 120_000 })
```

- [x] **Step 13: Update `des-returns-generate.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.REGULATORY)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.REGULATORY, lockDuration: 120_000 })
```

- [x] **Step 14: Update `bulk-import.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.GRADEBOOK)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.GRADEBOOK, lockDuration: 60_000 })
```

- [x] **Step 15: Update `attendance-pattern-detection.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.ATTENDANCE)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.ATTENDANCE, lockDuration: 180_000 })
```

- [x] **Step 16: Update `refresh-mv.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.BEHAVIOUR)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.BEHAVIOUR, lockDuration: 300_000 })
```

> **Critical:** This is the most urgent processor. `REFRESH MATERIALIZED VIEW CONCURRENTLY` can run for minutes. If stalled, BullMQ re-enqueues mid-refresh, causing concurrent view refreshes — a correctness issue.

- [x] **Step 17: Update `ppod-import.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.REGULATORY)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.REGULATORY, lockDuration: 120_000 })
```

- [x] **Step 18: Update `session-generation.processor.ts`**

Change:

```typescript
@Processor(QUEUE_NAMES.PAYROLL)
```

To:

```typescript
@Processor({ name: QUEUE_NAMES.PAYROLL, lockDuration: 300_000 })
```

> **Note:** Same queue as `mass-export`. Use max = 300000.

- [x] **Step 19: Verify shared-queue consistency**

Multiple processors share queues. BullMQ uses ONE worker per queue, so `lockDuration` must be the max across all processors on that queue. Verify these values are consistent:

| Queue           | Processors on it                                                                      | Required `lockDuration` |
| --------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| `SECURITY`      | `key-rotation` (300k), `anomaly-scan` (300k)                                          | **300000**              |
| `IMPORTS`       | `import-processing` (120k), `import-validation` (120k), `compliance-execution` (120k) | **120000**              |
| `REGULATORY`    | `ppod-sync` (120k), `ppod-import` (120k), `des-returns-generate` (120k)               | **120000**              |
| `PAYROLL`       | `mass-export` (300k), `session-generation` (300k)                                     | **300000**              |
| `BEHAVIOUR`     | `refresh-mv` (300k) + many lightweight processors                                     | **300000**              |
| `GRADEBOOK`     | `bulk-import` (60k) + others                                                          | **60000**               |
| `ATTENDANCE`    | `attendance-pattern-detection` (180k) + others                                        | **180000**              |
| `EARLY_WARNING` | `compute-daily` (300k) + others                                                       | **300000**              |

All processors on a shared queue MUST use the same `lockDuration` value — set all to the max for that queue.

- [x] **Step 20: Run type-check to verify decorator changes compile**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors — the `@Processor()` decorator accepts `{ name: string, lockDuration?: number }`.

- [x] **Step 21: Commit**

```bash
git add apps/worker/src/processors/
git commit -m "feat(worker): add lockDuration to 18 Tier 1 processors (R-20)

Prevents false stall detection for long-running jobs. Each processor
gets the appropriate lockDuration based on its workload profile.
Shared-queue processors use the max value across all processors on
that queue.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `lockDuration` to Tier 2 Defensive Processors

These processors are probably fast today but have unbounded iteration patterns.

**Files to modify (8 files):**

| File                                                                               | `lockDuration` | Reason                                        |
| ---------------------------------------------------------------------------------- | -------------- | --------------------------------------------- |
| `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`           | 60000          | Stub now, will render N report cards          |
| `apps/worker/src/processors/gradebook/report-card-auto-generate.processor.ts`      | 60000          | Auto-gen for all published cards              |
| `apps/worker/src/processors/early-warning/compute-student.processor.ts`            | 300000         | Same queue as compute-daily → use max         |
| `apps/worker/src/processors/early-warning/weekly-digest.processor.ts`              | 300000         | Same queue as compute-daily → use max         |
| `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`          | 300000         | Same queue as refresh-mv → use max            |
| `apps/worker/src/processors/compliance/deadline-check.processor.ts`                | 120000         | Same queue as retention-enforcement → use max |
| `apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`       | 60000          | Same queue as bulk-import → use max           |
| `apps/worker/src/processors/engagement/engagement-generate-trip-pack.processor.ts` | 30000          | Default is fine, but explicit                 |

- [x] **Step 1: Update all 8 processor files**

Apply the same pattern as Task 1. For each file, change `@Processor(QUEUE_NAMES.X)` to `@Processor({ name: QUEUE_NAMES.X, lockDuration: N })` using the values in the table above.

**Important:** For processors that share a queue with a Tier 1 processor, they MUST use the same `lockDuration` value (the max). This ensures consistency when BullMQ creates a single worker per queue.

- [x] **Step 2: Run type-check**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/worker/src/processors/
git commit -m "feat(worker): add lockDuration to 8 Tier 2 processors (R-20)

Defensive lockDuration for processors with unbounded iteration
patterns. Shared-queue processors match their Tier 1 queue-mates.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add `job.extendLock()` to the Scheduling Solver

The solver runs synchronous CPU-bound code (`solveV2()`). BullMQ cannot automatically renew the lock while the event loop is blocked. Even with `lockDuration: 300000`, a solver run exceeding 5 minutes will stall. The fix: yield to the event loop periodically and call `job.extendLock()`.

**Files:**

- Modify: `apps/worker/src/processors/scheduling/solver-v2.processor.ts`

- [x] **Step 1: Pass the `job` reference through to the solver job**

In `solver-v2.processor.ts`, change the `process()` method to pass the `job` object to `SchedulingSolverV2Job`:

```typescript
async process(job: Job<SchedulingSolverV2Payload>): Promise<void> {
  if (job.name !== SCHEDULING_SOLVE_V2_JOB) return;

  this.logger.log(`Processing ${SCHEDULING_SOLVE_V2_JOB} -- run ${job.data.run_id}`);

  const solverJob = new SchedulingSolverV2Job(this.prisma, job);
  try {
    await solverJob.execute(job.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown solver v2 error';
    this.logger.error(`Solver v2 failed for run ${job.data.run_id}: ${message}`);
    try {
      await this.prisma.schedulingRun.update({
        where: { id: job.data.run_id },
        data: { status: 'failed', failure_reason: message },
      });
    } catch (updateErr) {
      this.logger.error(`Failed to mark run ${job.data.run_id} as failed: ${updateErr}`);
    }
    throw err;
  }
}
```

- [x] **Step 2: Store the `job` in `SchedulingSolverV2Job` and extend the lock during the solver**

Update the `SchedulingSolverV2Job` class:

```typescript
class SchedulingSolverV2Job extends TenantAwareJob<SchedulingSolverV2Payload> {
  private readonly logger = new Logger(SchedulingSolverV2Job.name);

  constructor(
    prisma: PrismaClient,
    private readonly job: Job<SchedulingSolverV2Payload>,
  ) {
    super(prisma);
  }

  protected async processJob(data: SchedulingSolverV2Payload, tx: PrismaClient): Promise<void> {
    const { run_id } = data;

    // 1. Load the run
    const run = await tx.schedulingRun.findFirst({
      where: { id: run_id },
    });

    if (!run || run.status !== 'queued') {
      this.logger.warn(`Run ${run_id} not found or not in queued status, skipping`);
      return;
    }

    // 2. Update status to running
    await tx.schedulingRun.update({
      where: { id: run_id },
      data: { status: 'running' },
    });

    // 3. Load solver input from config_snapshot
    const configSnapshot = run.config_snapshot as unknown as SolverInputV2 | null;

    if (!configSnapshot) {
      throw new Error('No config_snapshot found on scheduling run');
    }

    if (run.solver_seed !== null) {
      configSnapshot.settings.solver_seed = Number(run.solver_seed);
    }

    this.logger.log(
      `Starting solver v2 for run ${run_id}: ${configSnapshot.year_groups.length} year groups, ${configSnapshot.curriculum.length} curriculum entries, ${configSnapshot.teachers.length} teachers`,
    );

    // 4. Run solver — extend lock periodically via onProgress callback
    let lastExtend = Date.now();
    const EXTEND_INTERVAL_MS = 60_000; // Extend lock every 60 seconds

    const result = solveV2(configSnapshot, {
      onProgress: async (assigned, total, phase) => {
        this.logger.debug(`Solver v2 progress: ${assigned}/${total} (${phase})`);

        // Extend BullMQ lock to prevent stall detection during long solves
        if (Date.now() - lastExtend >= EXTEND_INTERVAL_MS) {
          try {
            await this.job.extendLock(this.job.token!, 300_000);
            lastExtend = Date.now();
            this.logger.debug(`Extended job lock for solver run ${run_id}`);
          } catch (extendErr) {
            this.logger.warn(`Failed to extend lock for run ${run_id}: ${extendErr}`);
          }
        }
      },
    });

    // 5. Save results (same as before)
    const resultJson = {
      entries: result.entries,
      unassigned: result.unassigned,
    };

    await tx.schedulingRun.update({
      where: { id: run_id },
      data: {
        status: 'completed',
        result_json: JSON.parse(JSON.stringify(resultJson)),
        hard_constraint_violations: result.constraint_summary.tier1_violations,
        soft_preference_score: result.score,
        soft_preference_max: result.max_score,
        entries_generated: result.entries.filter((e) => !e.is_pinned).length,
        entries_pinned: result.entries.filter((e) => e.is_pinned).length,
        entries_unassigned: result.unassigned.length,
        solver_duration_ms: result.duration_ms,
        solver_seed:
          configSnapshot.settings.solver_seed !== null
            ? BigInt(configSnapshot.settings.solver_seed)
            : BigInt(0),
      },
    });

    this.logger.log(
      `Solver v2 completed for run ${run_id}: ${result.entries.length} entries, ${result.unassigned.length} unassigned, score ${result.score}/${result.max_score} in ${result.duration_ms}ms`,
    );
  }
}
```

> **Note on `onProgress`:** Check whether `solveV2`'s `onProgress` callback supports `async` functions. If it only accepts synchronous callbacks, the `await this.job.extendLock()` call will fire-and-forget (the promise won't be awaited). This is acceptable — the lock extension is best-effort. If `solveV2` does support async callbacks, the solver will yield to the event loop at each progress step, which is ideal.

- [x] **Step 3: Run type-check**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add apps/worker/src/processors/scheduling/solver-v2.processor.ts
git commit -m "feat(worker): add lock extension for CPU-bound solver (R-20)

The scheduling solver blocks the event loop during solveV2(),
preventing BullMQ from auto-renewing the job lock. Extends the
lock every 60 seconds via the onProgress callback to prevent
false stall detection.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verify Worker Boots Successfully

- [x] **Step 1: Run the DI verification command**

```bash
cd apps/worker && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { WorkerModule } from './src/worker.module';
Test.createTestingModule({ imports: [WorkerModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: `DI OK`

- [x] **Step 2: Run existing worker tests**

Run: `cd apps/worker && npx jest --passWithNoTests`
Expected: All passing.

- [x] **Step 3: Run turbo type-check and lint**

Run: `turbo type-check lint --filter=worker`
Expected: No errors.

---

## Phase 2: R-25 — Synthetic Canary Jobs

**Why:** Existing monitoring (DLQ monitor, health endpoint) cannot detect a worker that is alive but not consuming jobs. The DLQ monitor only checks failed job counts. The health endpoint only probes the `notifications` queue. If a queue's worker loop dies silently, jobs pile up in `waiting` state and nothing alerts.

**Approach:** A "pinger" cron job (on the `notifications` queue, which is known to be active) enqueues a lightweight `canary:echo` job into each critical queue. An "echo" processor on each queue immediately completes and writes an ACK to Redis. A "checker" cron job verifies all echoes completed within their SLA. Missing ACKs trigger a Sentry alert.

**Status: COMPLETE** — Constants, processor, cron registration, and 11 tests all in place. Type-check clean, lint clean, 590/590 tests pass.

---

### Task 5: Define Canary Job Constants

**Files:**

- Modify: `apps/worker/src/base/queue.constants.ts`

- [x] **Step 1: Add canary job name constants**

At the bottom of `queue.constants.ts`, after the `QueueName` type:

```typescript
// ─── Canary monitoring ──────────────────────────────────────────────────────

export const CANARY_PING_JOB = 'monitoring:canary-ping';
export const CANARY_ECHO_JOB = 'monitoring:canary-echo';
export const CANARY_CHECK_JOB = 'monitoring:canary-check';

/**
 * Critical queues monitored by canary jobs.
 * Key: queue name. Value: SLA in milliseconds — max acceptable time for
 * the echo job to complete after enqueue. Alert fires if exceeded.
 */
export const CANARY_CRITICAL_QUEUES: Record<string, number> = {
  [QUEUE_NAMES.NOTIFICATIONS]: 2 * 60_000, // 2 min (runs every 30s normally)
  [QUEUE_NAMES.BEHAVIOUR]: 3 * 60_000, // 3 min (SLA-sensitive)
  [QUEUE_NAMES.SECURITY]: 3 * 60_000, // 3 min (breach SLA)
  [QUEUE_NAMES.PASTORAL]: 3 * 60_000, // 3 min (safeguarding)
  [QUEUE_NAMES.PAYROLL]: 5 * 60_000, // 5 min (event-driven)
  [QUEUE_NAMES.APPROVALS]: 5 * 60_000, // 5 min (event-driven)
  [QUEUE_NAMES.FINANCE]: 5 * 60_000, // 5 min (event-driven)
  [QUEUE_NAMES.COMPLIANCE]: 5 * 60_000, // 5 min (deadline-driven)
  [QUEUE_NAMES.SCHEDULING]: 5 * 60_000, // 5 min (event-driven)
  [QUEUE_NAMES.ATTENDANCE]: 5 * 60_000, // 5 min (session-based)
};
```

- [x] **Step 2: Commit**

```bash
git add apps/worker/src/base/queue.constants.ts
git commit -m "feat(worker): add canary job constants and SLA map (R-25)

Defines the 10 critical queues to monitor and their SLA thresholds
for canary echo completion.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Create Canary Processor

A single processor on the `notifications` queue handles all three canary jobs: ping (enqueue echoes), echo (ACK), and check (verify ACKs).

**Files:**

- Create: `apps/worker/src/processors/monitoring/canary.processor.ts`

- [x] **Step 1: Write the canary processor**

```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Job, Queue } from 'bullmq';
import * as crypto from 'crypto';

import {
  CANARY_CHECK_JOB,
  CANARY_CRITICAL_QUEUES,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  QUEUE_NAMES,
} from '../../base/queue.constants';

// ─── Redis key helpers ──────────────────────────────────────────────────────

const CANARY_PREFIX = 'canary:';
const pendingKey = (canaryId: string, queue: string) =>
  `${CANARY_PREFIX}pending:${canaryId}:${queue}`;
const ackKey = (canaryId: string, queue: string) => `${CANARY_PREFIX}ack:${canaryId}:${queue}`;

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class CanaryProcessor extends WorkerHost {
  private readonly logger = new Logger(CanaryProcessor.name);

  constructor(@InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case CANARY_PING_JOB:
        await this.handlePing();
        break;
      case CANARY_ECHO_JOB:
        await this.handleEcho(job);
        break;
      case CANARY_CHECK_JOB:
        await this.handleCheck(job);
        break;
      default:
        return;
    }
  }

  // ─── Ping: enqueue echo jobs into each critical queue ───────────────

  private async handlePing(): Promise<void> {
    const canaryId = crypto.randomUUID();
    const redis = await this.notificationsQueue.client;
    const queueNames = Object.keys(CANARY_CRITICAL_QUEUES);

    this.logger.log(`Canary ping ${canaryId}: enqueueing echoes to ${queueNames.length} queues`);

    for (const queueName of queueNames) {
      const sla = CANARY_CRITICAL_QUEUES[queueName];
      const ttlSeconds = Math.ceil(sla / 1000) + 60; // SLA + 60s buffer

      // Mark pending in Redis
      await redis.set(pendingKey(canaryId, queueName), Date.now().toString(), 'EX', ttlSeconds);

      // Enqueue echo on the target queue
      const q = new Queue(queueName, { connection: redis });
      try {
        await q.add(
          CANARY_ECHO_JOB,
          { canary_id: canaryId, source_queue: queueName },
          { removeOnComplete: 5, removeOnFail: 10 },
        );
      } finally {
        await q.close();
      }
    }

    // Schedule the check job to run after the longest SLA
    const maxSla = Math.max(...Object.values(CANARY_CRITICAL_QUEUES));
    const checkDelay = maxSla + 30_000; // Max SLA + 30s grace

    await this.notificationsQueue.add(
      CANARY_CHECK_JOB,
      { canary_id: canaryId, queues: queueNames },
      { delay: checkDelay, removeOnComplete: 5, removeOnFail: 10 },
    );
  }

  // ─── Echo: ACK that this queue's worker is alive ────────────────────

  private async handleEcho(job: Job<{ canary_id: string; source_queue: string }>): Promise<void> {
    const { canary_id, source_queue } = job.data;
    const redis = await this.notificationsQueue.client;

    await redis.set(ackKey(canary_id, source_queue), Date.now().toString(), 'EX', 600);
    this.logger.debug(`Canary echo ACK: ${source_queue} for ping ${canary_id}`);
  }

  // ─── Check: verify all echoes completed within SLA ──────────────────

  private async handleCheck(job: Job<{ canary_id: string; queues: string[] }>): Promise<void> {
    const { canary_id, queues } = job.data;
    const redis = await this.notificationsQueue.client;
    const missed: string[] = [];

    for (const queueName of queues) {
      const ack = await redis.get(ackKey(canary_id, queueName));
      const pending = await redis.get(pendingKey(canary_id, queueName));

      if (!ack && pending) {
        // Pending was set but never ACK-ed — queue is not processing
        missed.push(queueName);
      }
    }

    if (missed.length > 0) {
      const summary = `Canary SLA missed for queues: ${missed.join(', ')} (ping ${canary_id})`;
      this.logger.error(summary);
      Sentry.captureMessage(summary, 'error');
    } else {
      this.logger.log(
        `Canary check passed — all ${queues.length} queues responded (ping ${canary_id})`,
      );
    }

    // Cleanup Redis keys
    for (const queueName of queues) {
      await redis.del(pendingKey(canary_id, queueName));
      await redis.del(ackKey(canary_id, queueName));
    }
  }
}
```

- [x] **Step 2: Register the processor in `worker.module.ts`**

Add `CanaryProcessor` to the `providers` array in `apps/worker/src/worker.module.ts`. Add the import:

```typescript
import { CanaryProcessor } from './processors/monitoring/canary.processor';
```

- [x] **Step 3: Run type-check**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add apps/worker/src/processors/monitoring/canary.processor.ts apps/worker/src/worker.module.ts
git commit -m "feat(worker): add canary processor for queue health monitoring (R-25)

Three-phase canary: ping enqueues echo jobs to critical queues,
echo ACKs via Redis, check verifies all ACKs within SLA and fires
Sentry alert on misses. Single processor on notifications queue.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Register Canary Cron Jobs

**Files:**

- Modify: `apps/worker/src/cron/cron-scheduler.service.ts`

- [x] **Step 1: Add the canary cron import and registration**

Add import at the top of `cron-scheduler.service.ts`:

```typescript
import { CANARY_PING_JOB } from '../processors/monitoring/canary.processor';
```

Wait — the constant is exported from `queue.constants.ts`, not the processor. Update the import:

```typescript
import { CANARY_PING_JOB } from '../base/queue.constants';
```

This import should be added to the existing `QUEUE_NAMES` import from the same file:

```typescript
import { CANARY_PING_JOB, QUEUE_NAMES } from '../base/queue.constants';
```

- [x] **Step 2: Add `registerCanaryCronJobs()` method**

Add to `onModuleInit()`:

```typescript
await this.registerCanaryCronJobs();
```

Add the private method:

```typescript
private async registerCanaryCronJobs(): Promise<void> {
  // ── monitoring:canary-ping ────────────────────────────────────────────
  // Runs every 5 minutes. Enqueues echo jobs to all critical queues.
  // A delayed check job verifies all echoes completed within SLA.
  await this.notificationsQueue.add(
    CANARY_PING_JOB,
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: `cron:${CANARY_PING_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${CANARY_PING_JOB} (every 5 minutes)`);
}
```

The `notificationsQueue` is already injected in the constructor — no new queue injection needed.

- [x] **Step 3: Run type-check**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add apps/worker/src/cron/cron-scheduler.service.ts
git commit -m "feat(worker): register canary ping cron every 5 minutes (R-25)

Canary ping runs on the notifications queue. Enqueues echo jobs to
10 critical queues and schedules a delayed check job to verify all
echoes completed within their SLA.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Write Canary Processor Tests

**Files:**

- Create: `apps/worker/src/processors/monitoring/canary.processor.spec.ts`

- [x] **Step 1: Write the test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import {
  CANARY_CHECK_JOB,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  QUEUE_NAMES,
} from '../../base/queue.constants';

import { CanaryProcessor } from './canary.processor';

// ─── Mock Redis client ──────────────────────────────────────────────────────

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
};

// ─── Mock Queue ─────────────────────────────────────────────────────────────

const mockNotificationsQueue = {
  client: Promise.resolve(mockRedis),
  add: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue(undefined),
};

// Mock Queue constructor for dynamic queue creation in handlePing
jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('CanaryProcessor', () => {
  let processor: CanaryProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanaryProcessor,
        {
          provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS),
          useValue: mockNotificationsQueue,
        },
      ],
    }).compile();

    processor = module.get<CanaryProcessor>(CanaryProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should ignore jobs with unknown names', async () => {
      const job = { name: 'some:other-job', data: {} } as Job;
      await processor.process(job);
      // No error thrown, no side effects
      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  describe('canary echo', () => {
    it('should write ACK to Redis on echo', async () => {
      const job = {
        name: CANARY_ECHO_JOB,
        data: { canary_id: 'test-id', source_queue: 'notifications' },
      } as Job;

      await processor.process(job);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'canary:ack:test-id:notifications',
        expect.any(String),
        'EX',
        600,
      );
    });
  });

  describe('canary check', () => {
    it('should pass when all queues ACK', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('canary:ack:')) return Promise.resolve(Date.now().toString());
        if (key.startsWith('canary:pending:')) return Promise.resolve(Date.now().toString());
        return Promise.resolve(null);
      });

      const job = {
        name: CANARY_CHECK_JOB,
        data: { canary_id: 'test-id', queues: ['notifications', 'payroll'] },
      } as Job;

      await processor.process(job);
      // No Sentry alert — all ACKs present
    });

    it('should alert via Sentry when a queue misses its SLA', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'canary:ack:test-id:notifications')
          return Promise.resolve(Date.now().toString());
        if (key === 'canary:ack:test-id:payroll') return Promise.resolve(null); // missed
        if (key.startsWith('canary:pending:')) return Promise.resolve(Date.now().toString());
        return Promise.resolve(null);
      });

      const Sentry = require('@sentry/nestjs');
      jest.spyOn(Sentry, 'captureMessage');

      const job = {
        name: CANARY_CHECK_JOB,
        data: { canary_id: 'test-id', queues: ['notifications', 'payroll'] },
      } as Job;

      await processor.process(job);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('payroll'),
        'error',
      );
    });
  });
});
```

- [x] **Step 2: Run the tests**

Run: `cd apps/worker && npx jest --testPathPattern=canary.processor.spec.ts`
Expected: All passing.

- [x] **Step 3: Commit**

```bash
git add apps/worker/src/processors/monitoring/canary.processor.spec.ts
git commit -m "test(worker): add canary processor tests (R-25)

Tests echo ACK, check pass, and SLA miss alert via Sentry.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: R-15 — Circuit Breaker for External Services

**Why:** When an external provider is down (Resend, Twilio, Stripe, Anthropic), every request that calls it will wait for the full timeout then fail. Without a circuit breaker, the system keeps hammering a dead endpoint, wasting connections and giving users slow failures. A circuit breaker "trips" after N consecutive failures and returns fast errors for a cooldown period before probing again.

**Approach:** Install `cockatiel` (the most maintained TypeScript circuit breaker library, supports NestJS DI). Create a shared `CircuitBreakerRegistry` service that provides named breaker instances. Wrap each external provider call in a breaker. The breaker is per-provider, not per-call-site — all 9+ Anthropic call sites share one breaker.

**Status: COMPLETE** — cockatiel installed, CircuitBreakerRegistry created (global via CommonModule), Resend/Twilio/Stripe wrapped, 10 AI services consolidated behind AnthropicClientService with circuit breaker, Meilisearch health re-check added. Type-check clean, lint clean, 7636 API tests + 590 worker tests all pass.

**Implementation notes:**

- cockatiel v3 uses standalone function API (`circuitBreaker(handleAll, {...})`) not the v2 method-chaining API the plan assumed.
- `CommonModule` is `@Global()` so `CircuitBreakerRegistry` is injectable everywhere without explicit module imports.
- 5 test suites needed mock updates after the Anthropic/Stripe migration — all fixed.

---

### Task 9: Install `cockatiel`

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/worker/package.json`

- [x] **Step 1: Install cockatiel in both apps**

```bash
cd apps/api && pnpm add cockatiel
cd apps/worker && pnpm add cockatiel
```

- [x] **Step 2: Commit**

```bash
git add apps/api/package.json apps/worker/package.json pnpm-lock.yaml
git commit -m "chore(deps): add cockatiel circuit breaker library (R-15)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Create `CircuitBreakerRegistry` Service

A shared injectable service that creates and caches named circuit breaker instances. Each external provider gets one breaker. The breaker opens after 5 consecutive failures, stays open for 30 seconds, then enters half-open state (lets one request through to probe).

**Files:**

- Create: `apps/api/src/common/services/circuit-breaker-registry.ts`
- Create: `apps/api/src/common/services/circuit-breaker-registry.spec.ts`

- [x] **Step 1: Write the registry**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  CircuitBreakerPolicy,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  retry,
  wrap,
} from 'cockatiel';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BreakerOptions {
  /** Number of consecutive failures before opening. Default: 5 */
  threshold?: number;
  /** How long the circuit stays open (ms). Default: 30000 */
  halfOpenAfter?: number;
  /** Max retry attempts before giving up. Default: 0 (no retry — the caller's BullMQ or service-level retry handles that) */
  maxRetries?: number;
}

// ─── Registry ───────────────────────────────────────────────────────────────

@Injectable()
export class CircuitBreakerRegistry {
  private readonly logger = new Logger(CircuitBreakerRegistry.name);
  private readonly breakers = new Map<string, CircuitBreakerPolicy>();

  /**
   * Get or create a circuit breaker for a named provider.
   * Same name always returns the same instance.
   */
  getBreaker(name: string, options: BreakerOptions = {}): CircuitBreakerPolicy {
    const existing = this.breakers.get(name);
    if (existing) return existing;

    const threshold = options.threshold ?? 5;
    const halfOpenAfter = options.halfOpenAfter ?? 30_000;

    const breaker = handleAll.circuitBreaker(halfOpenAfter, new ConsecutiveBreaker(threshold));

    breaker.onBreak(() => {
      this.logger.warn(`Circuit breaker OPEN for "${name}" — ${threshold} consecutive failures`);
    });
    breaker.onHalfOpen(() => {
      this.logger.log(`Circuit breaker HALF-OPEN for "${name}" — probing`);
    });
    breaker.onReset(() => {
      this.logger.log(`Circuit breaker CLOSED for "${name}" — recovered`);
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Wrap an async function call through a named circuit breaker.
   * Throws `BrokenCircuitError` if the circuit is open.
   */
  async exec<T>(name: string, fn: () => Promise<T>, options?: BreakerOptions): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
  }
}
```

- [x] **Step 2: Write tests**

```typescript
import { CircuitBreakerRegistry } from './circuit-breaker-registry';

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should return the same breaker for the same name', () => {
    const a = registry.getBreaker('test');
    const b = registry.getBreaker('test');
    expect(a).toBe(b);
  });

  it('should return different breakers for different names', () => {
    const a = registry.getBreaker('resend');
    const b = registry.getBreaker('twilio');
    expect(a).not.toBe(b);
  });

  it('should pass through successful calls', async () => {
    const result = await registry.exec('test', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should open after consecutive failures', async () => {
    const failing = async () => {
      throw new Error('fail');
    };

    // 5 failures to trip the breaker (default threshold)
    for (let i = 0; i < 5; i++) {
      await expect(registry.exec('trip-test', failing, { threshold: 5 })).rejects.toThrow();
    }

    // 6th call should get BrokenCircuitError (circuit is open)
    await expect(registry.exec('trip-test', async () => 'ok', { threshold: 5 })).rejects.toThrow();
  });
});
```

- [x] **Step 3: Register in a shared module**

Add `CircuitBreakerRegistry` to the `providers` and `exports` of `apps/api/src/common/common.module.ts` (or whichever shared module provides cross-cutting services). If no such module exists, add it to `AppModule` providers and exports directly.

- [x] **Step 4: Run tests**

Run: `cd apps/api && npx jest --testPathPattern=circuit-breaker-registry.spec.ts`
Expected: All passing.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/common/services/circuit-breaker-registry.ts apps/api/src/common/services/circuit-breaker-registry.spec.ts
git commit -m "feat(api): add circuit breaker registry service (R-15)

Shared injectable service that creates and caches named circuit
breakers via cockatiel. Opens after 5 consecutive failures, half-open
after 30s, probes with one request.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Wrap Resend, Twilio, and Stripe Calls

**Files:**

- Modify: `apps/api/src/modules/communications/providers/resend-email.provider.ts`
- Modify: `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`
- Modify: `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts`
- Modify: `apps/api/src/modules/finance/stripe.service.ts`
- Modify the parent modules to inject `CircuitBreakerRegistry`

- [x] **Step 1: Wrap Resend `send()` in a circuit breaker**

In `resend-email.provider.ts`, inject `CircuitBreakerRegistry` and wrap the `resend.emails.send()` call:

```typescript
// In constructor:
constructor(
  private readonly configService: ConfigService,
  private readonly circuitBreaker: CircuitBreakerRegistry,
) {}

// In send():
const result = await this.circuitBreaker.exec('resend', () =>
  this.resend.emails.send({ from, to, subject, html, tags }),
);
```

- [x] **Step 2: Wrap Twilio SMS `messages.create()` in a circuit breaker**

In `twilio-sms.provider.ts`:

```typescript
const message = await this.circuitBreaker.exec('twilio', () =>
  this.client.messages.create({ body, from: smsFrom, to: phone }),
);
```

- [x] **Step 3: Wrap Twilio WhatsApp `messages.create()` in a circuit breaker**

In `twilio-whatsapp.provider.ts`:

```typescript
const message = await this.circuitBreaker.exec('twilio', () =>
  this.client.messages.create({ body, from, to }),
);
```

> **Note:** SMS and WhatsApp share the `'twilio'` breaker name because they share the Twilio backend. If Twilio is down, both channels are affected.

- [x] **Step 4: Wrap Stripe calls in a circuit breaker**

In `stripe.service.ts`, inject `CircuitBreakerRegistry` and wrap:

```typescript
// createCheckoutSession:
const session = await this.circuitBreaker.exec('stripe', () =>
  stripe.checkout.sessions.create({ ... }),
);

// processRefund:
const refund = await this.circuitBreaker.exec('stripe', () =>
  stripe.refunds.create({ ... }),
);
```

- [x] **Step 5: Ensure parent modules import the module that provides `CircuitBreakerRegistry`**

The `CommunicationsModule` and `FinanceModule` must have access to the `CircuitBreakerRegistry`. Add the providing module to their `imports` if not already available.

- [x] **Step 6: Run type-check and tests**

Run: `turbo type-check lint --filter=api`
Expected: No errors.

Run: `cd apps/api && npx jest --testPathPattern="(resend|twilio|stripe)" --passWithNoTests`
Expected: Passing (update mocks if tests exist for these providers).

- [x] **Step 7: Commit**

```bash
git add apps/api/src/modules/communications/ apps/api/src/modules/finance/stripe.service.ts
git commit -m "feat(api): wrap Resend, Twilio, Stripe in circuit breakers (R-15)

All external notification and payment provider calls now go through
the CircuitBreakerRegistry. Breaker opens after 5 consecutive
failures, preventing cascading timeouts during provider outages.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Create Shared Anthropic Client with Circuit Breaker

Currently 9+ services each independently instantiate `new Anthropic()`. Consolidate into a shared `AnthropicClientService` with the circuit breaker built in.

**Files:**

- Create: `apps/api/src/modules/ai/anthropic-client.service.ts`
- Create: `apps/api/src/modules/ai/ai.module.ts`
- Modify: all 9+ AI service files to inject `AnthropicClientService` instead of instantiating their own client

- [x] **Step 1: Create `AnthropicClientService`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';

@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
  ) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  /**
   * Call Anthropic's messages.create with circuit breaker protection.
   * Throws BrokenCircuitError if Anthropic is down.
   */
  async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: { timeoutMs?: number },
  ): Promise<Anthropic.Message> {
    const client = this.getClient();
    const timeoutMs = options?.timeoutMs ?? 30_000;

    return this.circuitBreaker.exec('anthropic', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await client.messages.create(params, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
```

- [x] **Step 2: Create `AiModule`**

```typescript
import { Module } from '@nestjs/common';

import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';

import { AnthropicClientService } from './anthropic-client.service';

@Module({
  providers: [AnthropicClientService, CircuitBreakerRegistry],
  exports: [AnthropicClientService],
})
export class AiModule {}
```

- [x] **Step 3: Migrate each AI service to use `AnthropicClientService`**

For each of the 9+ AI services, replace direct SDK instantiation with DI injection. Example for `behaviour-ai.service.ts`:

**Before:**

```typescript
constructor(private readonly configService: ConfigService) {
  this.anthropic = new Anthropic({ apiKey: configService.get('ANTHROPIC_API_KEY') });
}

// In method:
const response = await this.anthropic.messages.create({ ... });
```

**After:**

```typescript
constructor(private readonly anthropicClient: AnthropicClientService) {}

// In method:
const response = await this.anthropicClient.createMessage({ ... }, { timeoutMs: 15_000 });
```

Files to modify:

1. `apps/api/src/modules/behaviour/behaviour-ai.service.ts`
2. `apps/api/src/modules/scheduling/ai-substitution.service.ts`
3. `apps/api/src/modules/reports/ai-report-narrator.service.ts`
4. `apps/api/src/modules/reports/ai-predictions.service.ts`
5. `apps/api/src/modules/gradebook/ai/ai-comments.service.ts`
6. `apps/api/src/modules/gradebook/ai/ai-grading.service.ts`
7. `apps/api/src/modules/gradebook/ai/ai-progress-summary.service.ts`
8. `apps/api/src/modules/gradebook/ai/nl-query.service.ts`
9. `apps/api/src/modules/attendance/attendance-scan.service.ts`
10. `apps/api/src/modules/gradebook/report-cards/report-card-template.service.ts`

Each parent module must import `AiModule`.

- [x] **Step 4: Run type-check and tests**

Run: `turbo type-check lint --filter=api`
Expected: No errors.

Run: `cd apps/api && npx jest --passWithNoTests`
Expected: All passing (update mocks for services that mock Anthropic directly).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/ apps/api/src/modules/behaviour/behaviour-ai.service.ts \
  apps/api/src/modules/scheduling/ai-substitution.service.ts \
  apps/api/src/modules/reports/ \
  apps/api/src/modules/gradebook/ \
  apps/api/src/modules/attendance/attendance-scan.service.ts
git commit -m "feat(api): consolidate Anthropic calls behind shared circuit breaker (R-15)

All 10 AI service files now use AnthropicClientService instead of
direct SDK instantiation. Anthropic calls get a 30s timeout and
circuit breaker protection (opens after 5 failures, half-open after
30s).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Add Meilisearch Health Re-check

Meilisearch already has soft degradation via `_available = false` on startup failure. The gap: it never re-checks. Add a periodic health re-check.

**Files:**

- Modify: `apps/api/src/modules/search/meilisearch.client.ts`

- [x] **Step 1: Add a re-check interval**

After the `onModuleInit()` health check, add a `setInterval` that re-checks availability every 60 seconds when `_available === false`:

```typescript
private recheckTimer: ReturnType<typeof setInterval> | null = null;

async onModuleInit(): Promise<void> {
  // ... existing health check ...

  if (!this._available) {
    this.startRecheckTimer();
  }
}

private startRecheckTimer(): void {
  if (this.recheckTimer) return;
  this.recheckTimer = setInterval(async () => {
    try {
      await this.client.health();
      this._available = true;
      this.logger.log('Meilisearch recovered — search is available');
      if (this.recheckTimer) {
        clearInterval(this.recheckTimer);
        this.recheckTimer = null;
      }
    } catch {
      this.logger.debug('Meilisearch still unavailable — will retry in 60s');
    }
  }, 60_000);
}

async onModuleDestroy(): Promise<void> {
  if (this.recheckTimer) {
    clearInterval(this.recheckTimer);
    this.recheckTimer = null;
  }
}
```

- [x] **Step 2: Commit**

```bash
git add apps/api/src/modules/search/meilisearch.client.ts
git commit -m "feat(api): add Meilisearch health re-check on 60s timer (R-15)

When Meilisearch is unavailable at startup, the client now retries
a health check every 60 seconds. Automatically recovers when the
service comes back without requiring an API restart.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: R-14 + R-24 — Restructure Transactions

**Why:** Puppeteer PDF rendering (1-15 seconds) and Resend/Twilio HTTP calls happen inside `$transaction()` blocks, holding DB connections from the PgBouncer pool during slow I/O. Under concurrency, this cascades into connection exhaustion and timeouts.

**R-14:** 5 call sites in the `behaviour` module generate PDFs inside transactions. Fix: write a placeholder row, enqueue the PDF render to BullMQ, complete the transaction immediately.

**R-24:** The `TenantAwareJob` base class wraps all of `processJob()` in a transaction. The `DispatchNotificationsJob` makes Resend/Twilio calls inside that transaction. Fix: split `DispatchNotificationsJob` into DB-phase (inside tx) and dispatch-phase (outside tx).

**Status: COMPLETE** — All 5 tasks implemented. PdfRenderProcessor callback dispatch, DocumentReadyProcessor, `generating` enum status, async BehaviourDocumentService refactor, DispatchNotificationsJob split. Type-check clean (API + worker), lint clean, 7636 API tests pass, 590 worker tests pass.

**Implementation notes:**

- `@Processor` decorator uses correct two-argument syntax: `@Processor(QUEUE_NAMES.BEHAVIOUR, { lockDuration: 300_000 })` (not single object).
- `DispatchNotificationsJob.execute()` override requires `override` keyword due to strict TypeScript.
- Migration created manually (`ALTER TYPE "DocumentStatus" ADD VALUE 'generating'`) since no local DB available for `prisma migrate dev`.
- `BehaviourDocumentService.generateDocument()` no longer needs the 60-second transaction timeout — PDF rendering is now async.
- In-app notification creation for document-ready moved from `autoGenerateDocument()` to `DocumentReadyProcessor` (callback processor).
- `sha256_hash` now hashes the rendered HTML (computed at enqueue time) rather than the PDF buffer (which is rendered asynchronously).

---

### Task 14: Implement Callback Dispatch in `PdfRenderProcessor`

The existing `PdfRenderProcessor` has payload fields for callbacks (`callback_job_name`, `callback_queue_name`, `callback_payload`) but the dispatch is not implemented (line 143 comment). Implement it.

**Files:**

- Modify: `apps/worker/src/processors/pdf-rendering/pdf-render.processor.ts`

- [x] **Step 1: Inject additional queues for callback dispatch**

The callback needs to enqueue a job on an arbitrary queue. Use the existing `notificationsQueue` ioredis client to create a temporary `Queue` instance (same pattern as DLQ monitor and canary):

In `PdfRenderProcessor`, inject the notifications queue for its Redis client:

```typescript
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
) {
  super();
}
```

Pass the queue reference down to `PdfRenderJob`:

```typescript
const renderJob = new PdfRenderJob(
  this.prisma,
  () => this.getBrowser(),
  (key, buf) => this.uploadPdfToS3(key, buf),
  async (queueName, jobName, payload) => this.dispatchCallback(queueName, jobName, payload),
);
```

Add the dispatch method:

```typescript
private async dispatchCallback(
  queueName: string,
  jobName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const redis = await this.notificationsQueue.client;
  const q = new Queue(queueName, { connection: redis });
  try {
    await q.add(jobName, payload, { removeOnComplete: 50, removeOnFail: 200 });
  } finally {
    await q.close();
  }
}
```

- [x] **Step 2: Implement callback dispatch in `PdfRenderJob.processJob()`**

Replace the comment at line 143 with:

```typescript
// ─── 3. Dispatch callback if requested ──────────────────────────────

if (data.callback_job_name && data.callback_queue_name) {
  const callbackPayload = {
    ...(data.callback_payload ?? {}),
    tenant_id: data.tenant_id,
    output_key,
    pdf_size_bytes: pdfBuffer.length,
  };

  await this.dispatchCallback(data.callback_queue_name, data.callback_job_name, callbackPayload);

  this.logger.log(`Dispatched callback ${data.callback_job_name} on ${data.callback_queue_name}`);
}
```

Update the `PdfRenderJob` constructor to accept the callback dispatcher:

```typescript
constructor(
  prisma: PrismaClient,
  private readonly getBrowser: () => Promise<Browser>,
  private readonly uploadPdf: (key: string, buffer: Buffer) => Promise<void>,
  private readonly dispatchCallback: (
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  super(prisma);
}
```

- [x] **Step 3: Add the `Queue` import from `bullmq`**

Add `Queue` to the bullmq import at the top of the file:

```typescript
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
```

Add `InjectQueue` to the NestJS import:

```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
```

- [x] **Step 4: Run type-check**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 5: Commit**

```bash
git add apps/worker/src/processors/pdf-rendering/pdf-render.processor.ts
git commit -m "feat(worker): implement PDF render callback dispatch (R-14)

When callback_job_name and callback_queue_name are present in the
payload, the processor now enqueues a follow-up job after successful
PDF rendering and S3 upload. This is the foundation for moving
PDF generation out of DB transactions.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Create Document-Ready Callback Processor

When the PDF render worker finishes, it enqueues a callback. This processor picks up the callback and updates the `behaviour_documents` row from `generating` to `draft_doc`.

**Files:**

- Create: `apps/worker/src/processors/behaviour/document-ready.processor.ts`

- [x] **Step 1: Write the processor**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const DOCUMENT_READY_JOB = 'behaviour:document-ready';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface DocumentReadyPayload extends TenantJobPayload {
  document_id: string;
  output_key: string;
  pdf_size_bytes: number;
  sha256_hash: string;
  generated_by_id: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor({ name: QUEUE_NAMES.BEHAVIOUR, lockDuration: 300_000 })
export class DocumentReadyProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentReadyProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DocumentReadyPayload>): Promise<void> {
    if (job.name !== DOCUMENT_READY_JOB) return;

    const readyJob = new DocumentReadyJob(this.prisma);
    await readyJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class DocumentReadyJob extends TenantAwareJob<DocumentReadyPayload> {
  private readonly logger = new Logger(DocumentReadyJob.name);

  protected async processJob(data: DocumentReadyPayload, tx: PrismaClient): Promise<void> {
    const { document_id, output_key, pdf_size_bytes, sha256_hash, generated_by_id } = data;

    // Update document from 'generating' to 'draft_doc'
    const doc = await tx.behaviourDocument.findFirst({
      where: { id: document_id },
    });

    if (!doc) {
      this.logger.warn(`Document ${document_id} not found — may have been deleted`);
      return;
    }

    if (doc.status !== 'generating') {
      this.logger.warn(
        `Document ${document_id} status is "${doc.status}", not "generating" — skipping`,
      );
      return;
    }

    await tx.behaviourDocument.update({
      where: { id: document_id },
      data: {
        status: 'draft_doc',
        file_key: output_key,
        file_size_bytes: BigInt(pdf_size_bytes),
        sha256_hash,
      },
    });

    // Create in-app notification for the generating user
    await tx.notification.create({
      data: {
        tenant_id: data.tenant_id,
        recipient_user_id: generated_by_id,
        channel: 'in_app',
        template_key: 'behaviour_document_review',
        locale: 'en',
        status: 'delivered',
        payload_json: { document_id, document_type: doc.document_type },
        source_entity_type: 'behaviour_document',
        source_entity_id: document_id,
        delivered_at: new Date(),
      },
    });

    this.logger.log(`Document ${document_id} marked ready (draft_doc)`);
  }
}
```

- [x] **Step 2: Register in `worker.module.ts`**

Add `DocumentReadyProcessor` to providers.

- [x] **Step 3: Commit**

```bash
git add apps/worker/src/processors/behaviour/document-ready.processor.ts apps/worker/src/worker.module.ts
git commit -m "feat(worker): add document-ready callback processor (R-14)

Receives callback from PdfRenderProcessor after PDF is uploaded to
S3. Updates behaviour_documents row from 'generating' to 'draft_doc'
and creates an in-app notification for the generating user.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Add `generating` Status to Document Enum

The new async flow needs a `generating` status for documents that are enqueued but not yet rendered.

**Files:**

- Modify: `packages/prisma/schema.prisma` — add `generating` to `DocumentStatus` enum
- Create migration

- [x] **Step 1: Add `generating` to the `DocumentStatus` enum in the Prisma schema**

```prisma
enum DocumentStatus {
  generating   // PDF render enqueued, not yet complete
  draft_doc
  sent
  archived
}
```

- [x] **Step 2: Generate and apply the migration**

```bash
cd packages/prisma && npx prisma migrate dev --name add_generating_document_status
```

- [x] **Step 3: Commit**

```bash
git add packages/prisma/
git commit -m "feat(prisma): add 'generating' status to DocumentStatus enum (R-14)

New intermediate status for documents whose PDF is being rendered
asynchronously via BullMQ. Transitions: generating -> draft_doc
(on callback) or stays generating (on failure, logged for retry).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Refactor `autoGenerateDocument` to Async Pattern

Change the method from synchronous Puppeteer rendering to: write a placeholder row with `status: 'generating'`, enqueue a PDF render job, return immediately. The callback processor (Task 15) handles the rest.

**Files:**

- Modify: `apps/api/src/modules/behaviour/behaviour-document.service.ts`
- Modify: `apps/api/src/modules/behaviour/behaviour-discipline.module.ts` (inject BullMQ queue)

- [x] **Step 1: Inject the `pdf-rendering` queue into `BehaviourDocumentService`**

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

// In constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly s3Service: S3Service,
  private readonly pdfRenderingService: PdfRenderingService,
  private readonly templateService: BehaviourDocumentTemplateService,
  private readonly historyService: BehaviourHistoryService,
  @InjectQueue('pdf-rendering') private readonly pdfQueue: Queue,
) {}
```

Ensure the parent module imports `BullModule.registerQueue({ name: QUEUE_NAMES.PDF_RENDERING })`.

- [x] **Step 2: Refactor `autoGenerateDocument()` — remove Puppeteer, enqueue to worker**

```typescript
async autoGenerateDocument(
  db: PrismaService,
  tenantId: string,
  userId: string,
  documentType: string,
  entityType: string,
  entityId: string,
  studentId: string,
  locale: string,
) {
  try {
    const template = await this.templateService.getActiveTemplate(
      db as unknown as PrismaClient,
      tenantId,
      documentType,
      locale,
    );

    if (!template) {
      this.logger.warn(
        `No active template for auto-generate ${documentType}/${locale} — skipping`,
      );
      return null;
    }

    const { dataSnapshot } = await this.resolveMergeFields(
      db,
      tenantId,
      entityType,
      entityId,
      locale,
    );

    const documentId = crypto.randomUUID();
    const compiledTemplate = Handlebars.compile(template.template_body, { strict: false });
    const renderedHtml = compiledTemplate(dataSnapshot);

    // Create placeholder document with 'generating' status — NO Puppeteer call
    const s3Key = `behaviour/documents/${documentType}/${documentId}.pdf`;

    const document = await db.behaviourDocument.create({
      data: {
        id: documentId,
        tenant_id: tenantId,
        document_type: documentType as $Enums.DocumentType,
        template_id: template.id,
        entity_type: entityType,
        entity_id: entityId,
        student_id: studentId,
        generated_by_id: userId,
        generated_at: new Date(),
        file_key: s3Key,
        file_size_bytes: BigInt(0),
        sha256_hash: '',
        locale,
        data_snapshot: dataSnapshot as Prisma.InputJsonValue,
        status: 'generating' as $Enums.DocumentStatus,
      },
    });

    // Enqueue PDF render job OUTSIDE the transaction (fire-and-forget from the caller's tx perspective)
    // The queue.add() writes to Redis, not Postgres — safe to call inside a Prisma tx.
    const sha256Hash = crypto.createHash('sha256').update(renderedHtml).digest('hex');

    await this.pdfQueue.add('pdf:render', {
      tenant_id: tenantId,
      template_html: renderedHtml,
      output_key: `${tenantId}/${s3Key}`,
      callback_queue_name: 'behaviour',
      callback_job_name: 'behaviour:document-ready',
      callback_payload: {
        document_id: documentId,
        sha256_hash: sha256Hash,
        generated_by_id: userId,
      },
    });

    this.logger.log(
      `Auto-generate queued for ${documentType} document ${documentId} (${entityType}/${entityId})`,
    );

    return document;
  } catch (err) {
    this.logger.error(
      `Failed to enqueue auto-generate ${documentType} for ${entityType}/${entityId}: ${(err as Error).message}`,
    );
    return null;
  }
}
```

- [x] **Step 3: Similarly refactor `generateDocument()` for the manual generation endpoint**

Apply the same pattern to `generateDocument()`: create a row with `status: 'generating'`, enqueue the PDF render job, return the row immediately. The API response now returns a document in `generating` status — the frontend should handle this.

- [x] **Step 4: Run type-check and tests**

Run: `turbo type-check lint --filter=api`
Expected: No errors.

Run: `cd apps/api && npx jest --testPathPattern=behaviour-document`
Expected: Tests pass (update mocks for the new queue injection and remove Puppeteer mock expectations).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/behaviour/
git commit -m "feat(behaviour): move PDF generation out of DB transactions (R-14)

autoGenerateDocument and generateDocument now create a placeholder
row with status 'generating' and enqueue the PDF render to BullMQ.
The PdfRenderProcessor renders the PDF, uploads to S3, and dispatches
a callback that transitions the document to 'draft_doc'.

Puppeteer no longer runs inside any Prisma transaction.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Restructure `DispatchNotificationsJob` (R-24)

The `TenantAwareJob` base class wraps all of `processJob()` in a `$transaction()`. The `DispatchNotificationsJob` makes Resend/Twilio HTTP calls inside that transaction. Fix: split into DB-read phase (inside tx) and dispatch phase (outside tx).

**Files:**

- Modify: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`

- [x] **Step 1: Override `execute()` to split the transaction boundary**

Instead of modifying the base class (which would affect all processors), override `execute()` in `DispatchNotificationsJob`:

```typescript
class DispatchNotificationsJob extends TenantAwareJob<DispatchNotificationsPayload> {
  private readonly logger = new Logger(DispatchNotificationsJob.name);

  // Intermediate state: notifications loaded inside tx, dispatched outside
  private loadedNotifications: DispatchableNotification[] = [];
  private tenantId = '';

  constructor(
    prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly getResend: () => Resend,
    private readonly getTwilio: () => Twilio,
  ) {
    super(prisma);
  }

  /**
   * Override execute() to split the DB read (inside tx) from the external
   * dispatch (outside tx). This prevents holding a DB connection during
   * slow Resend/Twilio HTTP calls.
   */
  async execute(data: DispatchNotificationsPayload): Promise<void> {
    if (!data.tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    // Phase 1: Read notifications inside RLS transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${data.tenant_id}::text, true)`;
      const userId = data.user_id || '00000000-0000-0000-0000-000000000000';
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;

      await this.loadNotifications(data, tx as unknown as PrismaClient);
    });

    // Phase 2: Dispatch externally — NO active transaction
    if (this.loadedNotifications.length > 0) {
      await this.dispatchAll(data.tenant_id);
    }
  }

  // processJob is still required by the abstract base but won't be called
  // due to the execute() override
  protected async processJob(): Promise<void> {
    // No-op — logic moved to execute() override
  }

  private async loadNotifications(
    data: DispatchNotificationsPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, notification_ids, announcement_id } = data;
    this.tenantId = tenant_id;

    let resolvedIds: string[] = notification_ids ?? [];

    if (resolvedIds.length === 0 && announcement_id) {
      const announcementNotifications = await tx.notification.findMany({
        where: {
          tenant_id,
          source_entity_type: 'announcement',
          source_entity_id: announcement_id,
          channel: { not: 'in_app' },
          status: { in: ['queued', 'failed'] },
        },
        select: { id: true },
      });
      resolvedIds = announcementNotifications.map((n: { id: string }) => n.id);
    }

    if (resolvedIds.length === 0) {
      this.logger.log('No notification IDs resolved, nothing to dispatch');
      return;
    }

    this.loadedNotifications = await tx.notification.findMany({
      where: {
        id: { in: resolvedIds },
        tenant_id,
        status: { in: ['queued', 'failed'] },
      },
    });
  }

  private async dispatchAll(tenantId: string): Promise<void> {
    let sentCount = 0;
    let failedCount = 0;
    let inAppCount = 0;

    for (const notification of this.loadedNotifications) {
      try {
        switch (notification.channel) {
          case 'in_app':
            await this.updateStatus(notification.id, 'delivered');
            inAppCount++;
            break;
          case 'email':
            await this.dispatchEmail(notification);
            sentCount++;
            break;
          case 'whatsapp':
            await this.dispatchWhatsApp(notification);
            sentCount++;
            break;
          case 'sms':
            await this.dispatchSms(notification);
            sentCount++;
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.handleFailure(notification, message);
        failedCount++;
      }
    }

    this.logger.log(
      `Dispatched ${this.loadedNotifications.length} notifications for tenant ${tenantId} — ` +
        `in_app: ${inAppCount}, sent: ${sentCount}, failed: ${failedCount}`,
    );
  }

  // ─── DB writes outside transaction (flat Prisma calls) ─────────────

  private async updateStatus(
    notificationId: string,
    status: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status, ...extra },
    });
  }

  // Dispatch methods (email, whatsapp, sms) — same logic as before but
  // use this.prisma (flat, no tx) instead of tx for DB writes.
  // Template resolution also uses this.prisma directly.
  // ...
}
```

> **Key architectural change:** The dispatch methods (`dispatchEmail`, `dispatchWhatsApp`, `dispatchSms`) and their helpers (`resolveTemplate`, `resolveRecipientContact`, `markFailed`, `createFallbackNotification`) all change from accepting `tx: PrismaClient` to using `this.prisma` directly. This means DB writes happen as individual flat operations, not inside a transaction. This is safe because notification status updates are idempotent — the worst case is a notification marked `sent` that actually failed, which is caught by the existing reconciliation job.

- [x] **Step 2: Update all dispatch and helper methods to use `this.prisma` instead of `tx`**

Remove the `tx: PrismaClient` parameter from all private methods. Use `this.prisma` for all reads and writes. This is a mechanical search-and-replace within the file.

- [x] **Step 3: Run type-check and tests**

Run: `cd apps/worker && npx tsc --noEmit`
Expected: No errors.

Run: `cd apps/worker && npx jest --testPathPattern=dispatch-notifications`
Expected: Tests pass (update mocks to remove tx expectations).

- [x] **Step 4: Commit**

```bash
git add apps/worker/src/processors/communications/dispatch-notifications.processor.ts
git commit -m "fix(worker): move Resend/Twilio sends out of DB transaction (R-24)

DispatchNotificationsJob now splits into two phases:
1. Load notifications inside RLS transaction (sets context, reads DB)
2. Dispatch externally with flat Prisma writes (no active transaction)

This prevents holding a Postgres connection during slow HTTP calls
to Resend and Twilio.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: R-26 — Approval Callback Recovery Tooling

**Why:** When the automatic reconciliation exhausts all 5 retry attempts, an approval request is permanently stuck with `callback_status = 'failed'`. The domain entity (invoice, payroll run, announcement) remains blocked in `pending_approval` state. There's no way for an admin to see or fix this without direct database access.

**Approach:** Add a `POST /v1/approval-requests/:id/retry-callback` endpoint, extract the `MODE_A_CALLBACKS` map to a shared constant, and extend the frontend approvals pages to show callback status and a retry button.

**Status: COMPLETE** — All 6 tasks implemented. MODE_A_CALLBACKS extracted, retryCallback service method + 4 tests, POST retry-callback endpoint, frontend callback status display with retry button, callback_status filter on list page, API surface snapshot updated. Type-check clean, lint clean, 7633 API tests pass (559 suites), 590 worker tests pass.

**Implementation notes:**

- API surface snapshot (`api-surface.snapshot.json`) regenerated — 1444 endpoints now (was 1443).
- `callback_status` filter added to `approvalRequestFilterSchema` in `@school/shared`.
- Frontend uses composite `callback_failed` filter value that maps to `status=approved&callback_status=failed` query params.
- `buildModeACallbacks()` factory at module scope, initialized once in constructor — avoids repeated object creation per `approve()` call.

---

### Task 19: Extract `MODE_A_CALLBACKS` to a Shared Constant

Currently defined inline inside `approve()`. The reconciliation processor has its own copy. The new retry endpoint needs the same map. Extract to a single constant.

**Files:**

- Modify: `apps/api/src/modules/approvals/approval-requests.service.ts`

- [x] **Step 1: Extract the callback map**

Move the map to module scope, parameterised by queue references:

```typescript
// ─── Mode A callback mapping ─────────────────────────────────────────────

interface CallbackMapping {
  queue: Queue;
  jobName: string;
}

/**
 * Build the Mode A callback dispatch map. Mode A action types auto-execute
 * a domain callback when the approval is granted.
 */
function buildModeACallbacks(
  notificationsQueue: Queue,
  financeQueue: Queue,
  payrollQueue: Queue,
): Record<string, CallbackMapping> {
  return {
    announcement_publish: { queue: notificationsQueue, jobName: 'communications:on-approval' },
    invoice_issue: { queue: financeQueue, jobName: 'finance:on-approval' },
    payroll_finalise: { queue: payrollQueue, jobName: 'payroll:on-approval' },
  };
}
```

In the service constructor, store it:

```typescript
private readonly modeACallbacks: Record<string, CallbackMapping>;

constructor(
  private readonly prisma: PrismaService,
  @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  @InjectQueue('finance') private readonly financeQueue: Queue,
  @InjectQueue('payroll') private readonly payrollQueue: Queue,
) {
  this.modeACallbacks = buildModeACallbacks(notificationsQueue, financeQueue, payrollQueue);
}
```

Update `approve()` to use `this.modeACallbacks` instead of the inline map.

- [x] **Step 2: Run tests to verify existing behaviour unchanged**

Run: `cd apps/api && npx jest --testPathPattern=approval-requests`
Expected: All passing.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/modules/approvals/approval-requests.service.ts
git commit -m "refactor(approvals): extract MODE_A_CALLBACKS to reusable map (R-26)

Preparation for the retry-callback endpoint. The callback dispatch
map is now a class-level property instead of being defined inline
inside approve().

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Add `retryCallback()` Service Method

**Files:**

- Modify: `apps/api/src/modules/approvals/approval-requests.service.ts`

- [x] **Step 1: Add the method**

```typescript
/**
 * Manually retry a permanently-failed approval callback.
 * Resets callback_attempts to 0, re-enqueues the domain job.
 * Only valid for approved requests with callback_status = 'failed'.
 */
async retryCallback(tenantId: string, requestId: string) {
  const request = await this.prisma.approvalRequest.findFirst({
    where: { id: requestId, tenant_id: tenantId },
  });

  if (!request) {
    throw new NotFoundException({
      code: 'APPROVAL_REQUEST_NOT_FOUND',
      message: `Approval request with id "${requestId}" not found`,
    });
  }

  if (request.status !== 'approved') {
    throw new BadRequestException({
      code: 'INVALID_STATUS',
      message: `Cannot retry callback for a request with status "${request.status}" — must be "approved"`,
    });
  }

  if (request.callback_status !== 'failed') {
    throw new BadRequestException({
      code: 'CALLBACK_NOT_FAILED',
      message: `Cannot retry callback with status "${request.callback_status}" — must be "failed"`,
    });
  }

  const mapping = this.modeACallbacks[request.action_type];
  if (!mapping) {
    throw new BadRequestException({
      code: 'NO_CALLBACK_MAPPING',
      message: `Action type "${request.action_type}" does not have a callback mapping`,
    });
  }

  // Reset callback state
  await this.prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      callback_status: 'pending',
      callback_attempts: 0,
      callback_error: null,
    },
  });

  // Re-enqueue the domain job
  try {
    await mapping.queue.add(mapping.jobName, {
      tenant_id: tenantId,
      approval_request_id: requestId,
      target_entity_id: request.target_entity_id,
      approver_user_id: request.approver_user_id,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(`Failed to re-enqueue callback for approval ${requestId}: ${errorMessage}`);
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        callback_status: 'failed',
        callback_error: `Manual retry enqueue failed: ${errorMessage}`,
      },
    });
    throw new BadRequestException({
      code: 'CALLBACK_ENQUEUE_FAILED',
      message: `Failed to enqueue callback: ${errorMessage}`,
    });
  }

  this.logger.log(`Manual callback retry for approval ${requestId} (${request.action_type})`);

  return this.getRequest(tenantId, requestId);
}
```

- [x] **Step 2: Write test for retryCallback**

Add to `apps/api/src/modules/approvals/approval-requests.service.spec.ts`:

```typescript
describe('retryCallback', () => {
  it('should reset callback state and re-enqueue for failed callbacks', async () => {
    mockPrisma.approvalRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      tenant_id: TENANT_ID,
      status: 'approved',
      callback_status: 'failed',
      callback_attempts: 5,
      action_type: 'invoice_issue',
      target_entity_id: 'invoice-123',
      approver_user_id: 'user-456',
    });
    mockPrisma.approvalRequest.update.mockResolvedValue({});

    await service.retryCallback(TENANT_ID, REQUEST_ID);

    expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: { callback_status: 'pending', callback_attempts: 0, callback_error: null },
    });
    expect(mockFinanceQueue.add).toHaveBeenCalledWith('finance:on-approval', {
      tenant_id: TENANT_ID,
      approval_request_id: REQUEST_ID,
      target_entity_id: 'invoice-123',
      approver_user_id: 'user-456',
    });
  });

  it('should reject retry for non-approved requests', async () => {
    mockPrisma.approvalRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      tenant_id: TENANT_ID,
      status: 'pending_approval',
      callback_status: null,
    });

    await expect(service.retryCallback(TENANT_ID, REQUEST_ID)).rejects.toThrow(BadRequestException);
  });

  it('should reject retry for non-failed callbacks', async () => {
    mockPrisma.approvalRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      tenant_id: TENANT_ID,
      status: 'approved',
      callback_status: 'pending',
    });

    await expect(service.retryCallback(TENANT_ID, REQUEST_ID)).rejects.toThrow(BadRequestException);
  });
});
```

- [x] **Step 3: Run tests**

Run: `cd apps/api && npx jest --testPathPattern=approval-requests.service`
Expected: All passing.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/modules/approvals/approval-requests.service.ts apps/api/src/modules/approvals/approval-requests.service.spec.ts
git commit -m "feat(approvals): add retryCallback service method (R-26)

Resets callback_attempts to 0 and re-enqueues the domain job for
approval requests whose callback has permanently failed. Guards
against retry on non-approved or non-failed requests.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Add `POST :id/retry-callback` Controller Endpoint

**Files:**

- Modify: `apps/api/src/modules/approvals/approval-requests.controller.ts`

- [x] **Step 1: Add the route**

After the `cancel` route:

```typescript
// POST /v1/approval-requests/:id/retry-callback
@Post(':id/retry-callback')
@HttpCode(HttpStatus.OK)
@RequiresPermission('approvals.manage')
async retryCallback(
  @CurrentTenant() tenant: TenantContext,
  @Param('id', ParseUUIDPipe) id: string,
) {
  return this.requestsService.retryCallback(tenant.tenant_id, id);
}
```

- [x] **Step 2: Run type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/modules/approvals/approval-requests.controller.ts
git commit -m "feat(approvals): add POST retry-callback endpoint (R-26)

POST /v1/approval-requests/:id/retry-callback — requires
approvals.manage permission. Resets and re-enqueues a permanently
failed approval callback.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Update Frontend — Approval Detail Page

Show callback status, error, and a retry button on the approval request detail page.

**Files:**

- Modify: `apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx`

- [x] **Step 1: Add callback status display**

After the existing metadata section, add a callback status block that only renders for approved requests with a callback:

```tsx
{
  request.status === 'approved' && request.callback_status && (
    <div className="rounded-lg border p-4 space-y-2">
      <h3 className="font-medium text-sm text-text-secondary">{t('callback_status')}</h3>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
            request.callback_status === 'executed' && 'bg-green-100 text-green-700',
            request.callback_status === 'pending' && 'bg-yellow-100 text-yellow-700',
            request.callback_status === 'failed' && 'bg-red-100 text-red-700',
          )}
        >
          {request.callback_status}
        </span>
        {request.callback_attempts > 0 && (
          <span className="text-xs text-text-secondary">
            ({request.callback_attempts} {request.callback_attempts === 1 ? 'attempt' : 'attempts'})
          </span>
        )}
      </div>
      {request.callback_error && (
        <p className="text-sm text-red-600 font-mono bg-red-50 rounded p-2">
          {request.callback_error}
        </p>
      )}
      {request.callback_status === 'failed' && (
        <Button variant="outline" size="sm" onClick={handleRetryCallback} disabled={isRetrying}>
          {isRetrying ? t('retrying') : t('retry_callback')}
        </Button>
      )}
    </div>
  );
}
```

- [x] **Step 2: Add the retry handler**

```tsx
const [isRetrying, setIsRetrying] = React.useState(false);

const handleRetryCallback = React.useCallback(async () => {
  setIsRetrying(true);
  try {
    await apiClient(`/v1/approval-requests/${id}/retry-callback`, {
      method: 'POST',
    });
    toast.success(t('callback_retry_queued'));
    router.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retry';
    toast.error(message);
  } finally {
    setIsRetrying(false);
  }
}, [id, t, router]);
```

- [x] **Step 3: Add translation keys**

Add to `apps/web/messages/en.json` under the approvals section:

```json
"callback_status": "Callback Status",
"retry_callback": "Retry Callback",
"retrying": "Retrying...",
"callback_retry_queued": "Callback retry has been queued"
```

Add to `apps/web/messages/ar.json`:

```json
"callback_status": "حالة الاستدعاء",
"retry_callback": "إعادة المحاولة",
"retrying": "جارٍ إعادة المحاولة...",
"callback_retry_queued": "تمت إعادة المحاولة بنجاح"
```

- [x] **Step 4: Commit**

```bash
git add apps/web/src/app/*/\(school\)/approvals/ apps/web/messages/
git commit -m "feat(web): show callback status and retry button on approval detail (R-26)

Approved requests with a callback now show the callback status
(pending/executed/failed), attempt count, and error message.
Failed callbacks get a 'Retry Callback' button that calls
POST /v1/approval-requests/:id/retry-callback.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Update Frontend — Approvals List Filter

Add a "Needs Attention" filter to the approvals list page to surface stuck callbacks.

**Files:**

- Modify: `apps/web/src/app/[locale]/(school)/approvals/page.tsx`
- Modify: `packages/shared/src/schemas/approval.schema.ts` (if filter schema needs `callback_status`)

- [x] **Step 1: Add `callback_status` to the `approvalRequestFilterSchema`**

In `packages/shared/src/schemas/approval.schema.ts`:

```typescript
export const approvalRequestFilterSchema = z.object({
  status: z
    .enum(['pending_approval', 'approved', 'rejected', 'cancelled', 'expired', 'executed'])
    .optional(),
  callback_status: z.enum(['pending', 'executed', 'failed']).optional(),
});
```

- [x] **Step 2: Update the service's `listRequests()` to filter by `callback_status`**

In `approval-requests.service.ts`:

```typescript
interface ListRequestsFilters {
  page: number;
  pageSize: number;
  status?: ApprovalRequestStatus;
  callback_status?: string;
}

// In listRequests():
if (filters.callback_status) {
  where.callback_status = filters.callback_status;
}
```

- [x] **Step 3: Update the controller to pass `callback_status` through**

In `approval-requests.controller.ts`:

```typescript
return this.requestsService.listRequests(tenant.tenant_id, {
  page: query.page,
  pageSize: query.pageSize,
  status: query.status,
  callback_status: query.callback_status,
});
```

- [x] **Step 4: Add a "Needs Attention" tab/filter in the frontend list page**

Add a filter option that sets `callback_status=failed` to show only stuck approvals.

- [x] **Step 5: Run type-check and tests**

Run: `turbo type-check lint`
Expected: No errors.

Run: `cd apps/api && npx jest --testPathPattern=approval-requests`
Expected: All passing.

- [x] **Step 6: Commit**

```bash
git add packages/shared/ apps/api/src/modules/approvals/ apps/web/src/app/*/\(school\)/approvals/
git commit -m "feat(approvals): add callback_status filter to approvals list (R-26)

Admins can now filter the approvals list by callback_status to
quickly find stuck approvals that need manual retry. The filter
schema, service, controller, and frontend are all updated.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Final Verification and Regression Suite

- [x] **Step 1: Run full type-check across the monorepo**

Run: `turbo type-check`
Expected: No errors.

- [x] **Step 2: Run full lint across the monorepo**

Run: `turbo lint`
Expected: No errors.

- [x] **Step 3: Run full test suite**

Run: `turbo test`
Expected: All tests passing.

- [x] **Step 4: Verify DI for both API and worker**

API DI check:

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('API DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Worker DI check — same pattern with `WorkerModule`.

- [x] **Step 5: Update architecture files**

Per `architecture/pre-flight-checklist.md`:

1. **`architecture/event-job-catalog.md`** — Add entries for:
   - `monitoring:canary-ping` / `canary-echo` / `canary-check` cron jobs
   - `behaviour:document-ready` callback job
   - Updated `communications:dispatch-notifications` (note: external calls now outside tx)

2. **`architecture/danger-zones.md`** — Update DZ-19 (PDF in transactions) to note it's resolved. Add a note about the `generating` document status as a new state that callers should handle.

3. **`architecture/state-machines.md`** — Add `generating` to the `DocumentStatus` state machine:
   ```
   generating -> draft_doc (callback success)
   generating -> generating (callback failure, logged for retry)
   draft_doc -> sent -> archived
   ```

- [x] **Step 6: Commit architecture updates**

```bash
git add architecture/
git commit -m "docs(architecture): update for reliability hardening (R-14/R-20/R-24/R-25/R-26)

Add canary jobs, document-ready callback, updated dispatch-notifications
flow. Update DZ-19 (resolved), add generating document status to
state machines.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Summary

| Phase | Items     | Tasks       | Key Risk                                                    |
| ----- | --------- | ----------- | ----------------------------------------------------------- |
| 1     | R-20      | Tasks 1-4   | Shared-queue lockDuration consistency                       |
| 2     | R-25      | Tasks 5-8   | Canary echo must work on all target queues                  |
| 3     | R-15      | Tasks 9-13  | AI service migration (10 files, each with mocks to update)  |
| 4     | R-14+R-24 | Tasks 14-18 | New `generating` status lifecycle, tx split in dispatch job |
| 5     | R-26      | Tasks 19-23 | Straightforward — existing infra supports it                |
| —     | Verify    | Task 24     | Full regression + architecture updates                      |
