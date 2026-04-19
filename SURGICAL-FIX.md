# Surgical Fix — Option A (deferred)

Status: **deferred**. We shipped Option B (pin 13 colliders serial, parallelize the other 110). This doc captures everything needed to later implement Option A and achieve **full parallelism across every integration/e2e test file**.

## What Option A is

Fix the 13 colliders' underlying shared-state problems so they can safely run in parallel alongside every other test. End state: jest runs with `--maxWorkers=N` with no files pinned to serial, no sequencer, no workers-per-file tagging.

Expected speedup vs Option B:

- Option B: ~2–3 min integration-tests job (110 parallel + 13 serial).
- Option A: ~1 min integration-tests job (all 123 parallel across N workers).

The remaining ~1 min is bounded by the single slowest test file, not by serial contention.

## The 13 files to de-collide

| #   | File                                                  | Why it collides                                                                                             |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `apps/api/test/rls-leakage.e2e-spec.ts`               | Shares tenant UUID `aa08873c-40a5-4bba-a9e3-8bd0f6d5e696` with 3 other files; `DELETE FROM tenants` cascade |
| 2   | `apps/api/test/rls-leakage-p2.e2e-spec.ts`            | Same tenant UUID `aa08873c...` + shared UUID `a032c7be-a0c3-4375-add7-174afa46e046`                         |
| 3   | `apps/api/test/rls-comprehensive.e2e-spec.ts`         | Same tenant UUIDs as above                                                                                  |
| 4   | `apps/api/test/p6-finance.e2e-spec.ts`                | Same tenant UUID `aa08873c...`                                                                              |
| 5   | `apps/api/test/applications.e2e-spec.ts`              | `tuple concurrently updated` on shared rows + unique-constraint 409s                                        |
| 6   | `apps/api/test/applications.rls.spec.ts`              | DB-level RLS test: `CREATE ROLE rls_*` races                                                                |
| 7   | `apps/api/test/p4a-dashboard-exceptions.e2e-spec.ts`  | Shared attendance/exception fixtures across workers                                                         |
| 8   | `apps/api/test/p4b-scheduling.e2e-spec.ts`            | Shared schedule-run state + `tuple concurrently updated`                                                    |
| 9   | `apps/api/test/staff-attendance-records.rls.spec.ts`  | DB-level RLS test with shared test role                                                                     |
| 10  | `apps/api/test/gdpr-anonymisation-tokens.rls.spec.ts` | `tuple concurrently updated` on shared role/token fixtures                                                  |
| 11  | `apps/api/test/payments.rls.spec.ts`                  | `tuple concurrently updated` on shared roles                                                                |
| 12  | `apps/api/test/payroll-adjustments.rls.spec.ts`       | `tuple concurrently updated` on shared roles                                                                |
| 13  | `apps/api/test/report-cards.rls.spec.ts`              | `tuple concurrently updated` on shared roles                                                                |

## Collision signatures and their fixes

### Signature 1 — Shared tenant UUIDs across files (files #1–#4)

**Pattern today:**

```ts
const ALNOOR_TENANT_ID = 'aa08873c-40a5-4bba-a9e3-8bd0f6d5e696'; // module scope
// …
afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${ALNOOR_TENANT_ID}'`);
});
```

When two files run in parallel, file A's `afterAll` cascade-deletes file B's tenant and all its data mid-run.

**Fix:** generate a fresh tenant UUID per file in `beforeAll`:

```ts
import { randomUUID } from 'node:crypto';

let tenantId: string;

beforeAll(async () => {
  tenantId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenants (id, slug, name, created_at, updated_at)
     VALUES ('${tenantId}', 'rls-test-${tenantId.slice(0, 8)}', 'RLS Test', now(), now())`,
  );
  // …seed the rest keyed off tenantId
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${tenantId}'`);
});
```

Also replace every hardcoded `const USER_X_ID = '…'` / `const STAFF_Y_ID = '…'` with `randomUUID()` at the top of `beforeAll`. There are ~6 UUID constants per file.

### Signature 2 — `CREATE ROLE` races in RLS tests (files #6, #9, #10–#13)

**Pattern today:**

```ts
const RLS_TEST_ROLE = 'rls_test_user';
// …
await prisma.$executeRawUnsafe(
  `DO $$ BEGIN CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
);
```

Postgres serializes role creation globally. When 4 jest workers all try to `CREATE ROLE rls_test_user` at the same instant, Postgres serializes the second-through-fourth behind the first — and any worker doing `GRANT … TO rls_test_user` concurrent with another worker's `REVOKE … FROM rls_test_user` hits `ERROR: tuple concurrently updated`.

**Fix:** give each worker its own role name:

```ts
const RLS_TEST_ROLE = `rls_test_user_${process.env.JEST_WORKER_ID ?? 'local'}`;
```

And revoke it in `afterAll` instead of leaving stale roles — or drop the role entirely:

```ts
afterAll(async () => {
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`);
  await prisma.$executeRawUnsafe(`DO $$ BEGIN DROP ROLE IF EXISTS ${RLS_TEST_ROLE}; END $$`);
});
```

The `execWithRetry` helper pattern that `rls-leakage.e2e-spec.ts` uses (retries on `tuple concurrently updated`) should be copied into each file that doesn't already have it. Or extract it into a shared test util.

### Signature 3 — `tuple concurrently updated` on unique constraints (files #5, #7, #8)

**Pattern today:** two workers both `INSERT INTO scheduling_runs` or similar for the same tenant on the same date → unique-index violations or row-update races.

**Fix:** use the randomUUID tenant from Signature 1. Once each file operates in its own tenant, these races vanish because every row has a unique `(tenant_id, …)` key.

If a test explicitly tests cross-tenant behaviour and needs two stable tenants, generate both per-file:

```ts
const tenantA = randomUUID();
const tenantB = randomUUID();
```

### Signature 4 — Shared Redis keys (low volume, check before shipping)

Only 3 integration test files currently touch Redis. Before shipping Option A, grep for `cacheKey = '…'` and fixed Redis key patterns. If any are present, prefix with worker ID:

```ts
const WORKER = process.env.JEST_WORKER_ID ?? 'local';
await redis.set(`test:${WORKER}:cache:foo`, 'bar');
```

## Execution plan

1. Branch off main: `git checkout -b ci-speedup-option-a`.
2. Pick one RLS test file with simple fixtures (`credit-notes.rls.spec.ts` is a good starter since it already works).
3. Apply Signature 1 + 2 fixes, run against paralleltest DB with `--maxWorkers=4`.
4. Repeat for the other 12 files in dependency order (cross-tenant RLS files last since they have the most fixtures).
5. After each file, re-run the **full** parallel suite: `pnpm --filter @school/api exec jest --config jest.integration.config.js --maxWorkers=4`. If a new collision surfaces, a newly-parallel-ised file is tramping on some other test's state.
6. When all 123 files pass parallel, remove the sequencer from Option B config. Integration tests job in CI drops to ~1 min.
7. Document the conventions (randomUUID tenants, JEST_WORKER_ID role names, per-worker Redis keys) in `.claude/rules/testing.md` so new tests don't regress.

## Verification checklist

Before merging Option A:

- [ ] All 123 files pass serially (`--runInBand`) — baseline sanity.
- [ ] All 123 files pass with `--maxWorkers=4` against isolated paralleltest DB.
- [ ] All 123 files pass with `--maxWorkers=4` three times in a row (catches intermittent collisions).
- [ ] `.claude/rules/testing.md` updated with new conventions.
- [ ] Old sequencer config removed.
- [ ] Jest runtime on CI integration-tests job is <90s.

## Estimated effort

| Phase                                           | Files    | Effort                                       |
| ----------------------------------------------- | -------- | -------------------------------------------- |
| Setup (isolated DB, baseline)                   | —        | 15 min (already in place from Option B work) |
| Signature 1 fixes (tenant UUIDs)                | 4 files  | 45 min                                       |
| Signature 2 fixes (role names)                  | 5 files  | 45 min                                       |
| Signature 3 fixes (scheduling/attendance state) | 3 files  | 90 min                                       |
| Signature 4 scan + fix (Redis)                  | ≤3 files | 15 min                                       |
| Parallel re-runs + flake hunting                | all      | 60 min                                       |
| Convention docs                                 | —        | 15 min                                       |
| **Total**                                       |          | **~4–5 hours**                               |

## Why not Option C (schema-per-worker) instead

Schema-per-worker via jest `globalSetup` gives you parallel isolation without touching any test code. It's cleaner conceptually. Downsides:

- Each worker needs its own migrated schema: roughly 10–15s `prisma db push` per worker on boot. With 4 workers that's 40–60s of startup overhead per test run, eroding the gains.
- `SET search_path` plumbing has to reach every Prisma client instantiated in every test — fragile.
- RLS tests that specifically test `SET LOCAL ROLE` and cross-tenant DB-level queries become harder to reason about when each worker is already in its own schema.

Option A is more code touched but simpler runtime behaviour, and keeps the shared `paralleltest` DB that matches production topology.
