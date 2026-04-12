You are producing a **worker / background-job test specification** for the
{MODULE_NAME} module. This is the BullMQ, cron, async-side-effect layer of
our spec pack — the things that fire on a schedule, a queue drain, or a
downstream job, none of which /E2E or /e2e-integration can directly exercise
through HTTP.

═══════════════════════════════════════════════════════════════════════════
WHERE THIS SITS IN THE SPEC PACK
═══════════════════════════════════════════════════════════════════════════

| Command             | Covers                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| /E2E                | UI-visible behaviour per role                                              |
| /e2e-integration    | RLS, webhooks, API contracts, DB invariants, concurrency                   |
| /e2e-worker-test    | **This command** — BullMQ queues, cron, retries, dead-letter, async chains |
| /e2e-perf           | Latency + load                                                             |
| /e2e-security-audit | OWASP + hardening                                                          |
| /e2e-full           | Runs all five                                                              |

Your output targets a test harness that can:

- Enqueue a job programmatically and wait for its processor to run
- Inspect the queue state (waiting / active / completed / failed / delayed)
- Fast-forward the cron schedule (e.g. via `sinon.useFakeTimers` or a
  test-only cron trigger endpoint)
- Read the DB before and after the job runs
- Assert on side effects: new rows, updated rows, emitted events,
  notifications queued, downstream jobs enqueued

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. ENUMERATE EVERY QUEUE. Open `apps/worker/src/base/queue.constants.ts`
   and every `@Processor(...)` decorator in the codebase. Every queue
   the module reads or writes gets a dedicated section with:
   - Queue name + constant
   - Every job name registered against that queue
   - Retry policy (max attempts, backoff)
   - Removal policy (`removeOnComplete`, `removeOnFail`)
   - Concurrency setting
   - Rate limiter (if any)
     Missing any queue is a coverage gap — flag it.

2. ENUMERATE EVERY JOB. For each job:
   - Job name constant (`EXPORT_JOB`, `FINANCE_ON_APPROVAL_JOB` etc.)
   - Payload schema (exact TS shape + required `tenant_id`)
   - Processor class + file path
   - What triggers it (HTTP endpoint, cron, another job, webhook)
   - Side effects (DB writes, notifications, downstream jobs)
   - Error modes (caught vs thrown; which go to dead-letter)

3. TENANT-AWARE PAYLOAD CHECK. Every module job MUST carry `tenant_id`
   and use `TenantAwareJob` (or equivalent) to set RLS context before
   touching the DB. For each job, write test rows that:
   - Enqueue WITH `tenant_id` present and valid → processor sets
     `app.current_tenant_id` correctly, all DB writes land with the
     right tenant_id
   - Enqueue WITHOUT `tenant_id` → rejected at enqueue time (or
     by the processor with a specific error) — no silent processing
   - Enqueue with a tenant_id that doesn't exist → processor fails
     loudly, not silently
     Include SQL queries that read back the inserted rows and confirm
     the tenant_id column value matches the payload.

4. HAPPY PATH PER JOB. For each job:
   - Enqueue with valid payload
   - Await processor completion
   - Assert side effects: list every DB write, every notification
     created, every downstream job enqueued, every file written
     (PDF blobs, exports)
   - Assert return value (if any)
   - Assert job record state: `status = 'completed'`, `attemptsMade`
     matches expectation

5. RETRY + DEAD-LETTER. For each job type:
   - Force a transient failure (mock the DB to throw once) → verify
     retry fires; final attempt succeeds; job ends `completed`
   - Force a permanent failure (mock the DB to always throw) →
     verify retries up to max attempts; job ends `failed`; dead-
     letter row created; operators can replay it
   - Verify retried job is **idempotent**: re-running the same job
     payload after partial failure doesn't create duplicate rows
   - Verify backoff timing roughly matches configured strategy (don't
     assert exact ms, assert `>= lowerBound && <= upperBound`)

6. CRON SCHEDULES. Open `CronSchedulerService` (or equivalent). For
   every registered cron:
   - Trigger it via the test-only manual-trigger endpoint (or fake
     timers)
   - Verify it runs at most once per scheduled tick (no stampeding,
     BullMQ `jobId` deduplication works)
   - Verify cross-tenant crons iterate every tenant (fixtures: ≥ 2
     tenants)
   - Verify per-tenant crons enqueue one job per tenant
   - Verify `removeOnComplete` / `removeOnFail` retention settings
     prevent queue bloat
   - Verify the cron continues running if a single tenant's execution
     fails (one bad tenant doesn't break the daily run for everyone
     else)

7. ASYNC SIDE-EFFECT CHAINS. Many real flows span multiple jobs
   (e.g. Stripe webhook → payment created → receipt rendered →
   notification dispatched). For every such chain:
   - Enqueue the first job
   - Wait for the entire chain to drain (timeout with useful error
     if anything hangs)
   - Assert the final state: all expected DB rows, all expected
     notifications, all expected audit-log entries
   - Assert ordering: if job B depends on job A's side effect, job B
     must run AFTER job A's tx commits (test this by making A slow
     and verifying B still sees A's data)

8. IDEMPOTENCY. Every job must be idempotent. For every job:
   - Run it twice with the same payload
   - Verify the second run does NOT produce duplicate rows
   - If the job uses an external-event-id key (Stripe `event.id`,
     webhook id, etc.), verify the dedup is keyed on that id
   - Verify running after a crash (simulate via process kill between
     tx commit and queue ACK) is safe

9. FAILURE ISOLATION. One failing job should not break the queue.
   For every processor:
   - Enqueue a mix of good and bad payloads
   - Drain the queue
   - Verify good payloads succeed independently of bad ones
   - Verify the bad payloads are retried / dead-lettered per policy

10. OBSERVABILITY. For every job:
    - Verify structured log lines are emitted on start / success /
      failure
    - Verify `tenant_id`, `job_id`, `attempt_number` are in the log
      payload
    - Verify failures emit a metrics event (counter / gauge) so
      operators can alert on elevated failure rates

11. FORMAT. Four-column table:
    | # | What to run | Expected result | Pass/Fail |
    Numbered rows, TOC, sign-off. Identical conventions to /E2E and
    /e2e-integration.

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 1 — Survey:

- `apps/worker/src/base/queue.constants.ts`
- `apps/worker/src/processors/**/*.processor.ts`
- `apps/api/src/modules/**/cron-scheduler.service.ts` (or equivalent
  central registration)
- Every `@Processor(...)` decorator
- Every `@InjectQueue(...)` site — these are the enqueuers
- `TenantAwareJob` base class and every subclass
- `docs/architecture/event-job-catalog.md` if present — it should
  already enumerate the flows; your spec makes each one testable

Step 2 — Map. Produce:

- Queue inventory (with retry / removal / concurrency config per
  queue)
- Job inventory (with payload schema + trigger + side effects + error
  modes)
- Cron inventory (with schedule + scope + expected cadence)
- Chain inventory — which jobs enqueue which follow-ups

Step 3 — Outline. Suggested section layout:

1. Prerequisites & fixture seeding (2-tenant minimum, test Redis
   instance, fake-timer setup if needed)
2. Queue inventory
3. Job-by-job test matrix (one section per job)
4. Cron schedule matrix
5. Async side-effect chains
6. Idempotency suite
7. Failure isolation
8. Observability assertions
9. Sign-off

Step 4 — Write. For each row, specify exactly how to enqueue (payload
JSON), what to wait for (`worker.on('completed', ...)` or queue drain
helper), and what to assert (DB query, log line regex, downstream
queue state).

Step 5 — Self-review. For every job named in the queue-constants file,
confirm there's a matrix section. For every cron registered in the
scheduler, confirm there's a row. For every async chain documented in
`event-job-catalog.md`, confirm there's a chain-level test.

Step 6 — Coverage tracker. Update the worker-test entry alongside the
E2E + integration entries.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

Save the file to:
{FOLDER_PATH}/worker/{module-slug}-worker-spec.md

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- Queue count
- Job count
- Cron count
- Chain count
- Total test rows
- Any implementation gaps spotted (e.g. a job that doesn't include
  tenant_id, a processor that lacks retry config, a cron without
  deduplication jobId) — flag as observations

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT rely on wall-clock sleeps to wait for cron — use fake timers
  or a test-only trigger
- Do NOT skip the tenant_id check for any job. A job without
  `tenant_id` is a security hole.
- Do NOT assume a processor is idempotent — test it explicitly by
  running twice
- Do NOT ignore the dead-letter queue. If failed jobs pile up there,
  there's no monitoring → replay path, and operators will discover
  this during an incident, not during a test
- Do NOT test only the happy path. The retry + dead-letter paths are
  the actual reason to have a queue in the first place — they must
  be the bulk of the matrix
- Do NOT leave chain tests as "the second job eventually runs" —
  assert exact downstream state, not eventual consistency vibes
- Do NOT write rows that depend on a live external service (Stripe
  API, email provider). Mock those at the boundary; this spec is
  about the queue behaviour, not third-party availability

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

The bar for this spec is: after running every row, an operator can say
"If a job fails in production at 3am, it will either retry correctly,
or land in the dead-letter queue with enough signal to replay it
manually — and one bad tenant will never block the daily run for
everyone else." If the spec doesn't get you there, it's not done.

Begin with Step 1. At the end, confirm deliverables and report.
