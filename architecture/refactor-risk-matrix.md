# Refactor Risk Matrix

> **Purpose**: Classify any planned refactoring by risk level before starting. Each level defines the minimum safeguards required. Do not start work without determining your risk tier.
> **Last verified**: 2026-04-01

---

## Risk Classification Matrix

| Risk Level   | Criteria                                                                                                                                                                 | Required Safeguards                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Low**      | Single file, no exported interface change, no state machine change, no schema change, <100 LOC changed                                                                   | Tests pass, `turbo type-check` clean, `turbo lint` clean                                                                                                                 |
| **Medium**   | Multiple files in one module, internal API change (private method signatures), no cross-module boundary crossed, no schema change                                        | + Coverage baseline recorded before and after, characterization tests for any untested paths                                                                             |
| **High**     | Cross-module dependency changes, exported service interface change, state machine change, BullMQ job restructuring (names/queues/processor routing), or >500 LOC changed | + Integration tests for all affected cross-module flows, architecture doc update (blast-radius, event-job-catalog, state-machines), second-developer review before merge |
| **Critical** | Auth/RLS changes, Prisma schema changes (migrations), encryption changes, payment or financial calculation changes, global guards or interceptors                        | + All of the above + shadow-read validation (run old and new path in parallel in staging) + staged rollout plan + written rollback plan                                  |

---

## How to Classify Your Refactoring

Work down this decision tree. Stop at the first "yes":

1. Does the change touch auth, RLS middleware, encryption, payment calculations, or a Prisma migration? **Critical.**
2. Does the change cross a module boundary (adding/removing a cross-module import, changing an exported service method signature)? **High.**
3. Does the change touch a state machine (status transition map, side-effect chain, approval callback)? **High.**
4. Does the change touch BullMQ job names, queue assignments, or processor routing? **High.**
5. Does the change span multiple files within one module but stay internal? **Medium.**
6. Is it one file, internal only, no exported interface change? **Low.**

When in doubt, classify one level higher.

---

## Examples from This Codebase

### Low Risk

**Extracting a helper function within a service**

Example: Moving the pagination calculation logic out of `StudentsService.list()` into a private `buildPaginationMeta()` helper in the same file.

- One file modified, no exported interface changed
- No schema, state machine, or job changes
- Safeguards: run `turbo test --filter=api`, check type-check passes

---

**Renaming an internal constant**

Example: Renaming `MAX_RETRY_COUNT` to `MAX_CALLBACK_ATTEMPTS` inside `approvals.service.ts`.

- One file modified, constant is not exported
- Safeguards: compile check (`turbo type-check`) confirms no external consumers

---

### Medium Risk

**Splitting a large service into sub-services**

Example: Splitting `FinanceService` (3000 lines) into `InvoicesService`, `PaymentsService`, and `ReceiptsService` — each in its own file, all still inside `FinanceModule`, all re-exported from the module.

- Multiple files changed within one module
- Exported service names change (old `FinanceService` replaced by three named services)
- Module's public export list changes — any consumer injecting `FinanceService` must be updated
- Safeguards: coverage baseline before/after, characterization tests for the methods being split, blast-radius check to find all consumers of `FinanceService`

---

**Consolidating duplicated Zod schema definitions**

Example: Three nearly-identical `listQuerySchema` definitions in different modules — merging them into one `paginationQuerySchema` in `packages/shared`.

- Multiple files changed across modules (the shared package + consumers)
- Exported schema name changes
- Safeguards: `turbo type-check` on all packages, verify `zodResolver` call sites still compile

---

### High Risk

**Changing BehaviourModule's approval flow**

Example: Changing how policy-triggered sanctions are created via the `ApprovalsModule` callback chain — modifying `MODE_A_CALLBACKS` or the enqueue side in `BehaviourService`.

- Crosses module boundary: `BehaviourModule` → `ApprovalsModule` → worker processor
- Touches BullMQ job payload (approval callback job)
- State machine side effects may change (sanction status on approval)
- Safeguards: integration test for the full approval → callback → sanction-created flow, update `event-job-catalog.md` and `module-blast-radius.md`, second-developer review

---

**Refactoring `CronSchedulerService` to split per-domain cron registration**

Example: Moving `registerBehaviourCronJobs()`, `registerHomeworkCronJobs()` etc. out of `CronSchedulerService` into module-specific cron services.

- Cross-module change: touches worker module structure
- BullMQ job registration changes — job IDs, dedup, repeat patterns
- If job IDs change, existing scheduled jobs in BullMQ won't be cleaned up
- Safeguards: integration test that all cron jobs appear in BullMQ dashboard after deploy, check `event-job-catalog.md` entries for all affected crons, second-developer review

---

### Critical Risk

**Changing the RLS middleware or `createRlsClient()`**

Example: Modifying how `SET LOCAL app.current_tenant_id` is set inside `createRlsClient()`, or changing how the middleware extracts `tenant_id` from the request pipeline.

- Every tenant-scoped query in the codebase depends on this
- A regression silently returns cross-tenant data or rejects valid tenant contexts
- Safeguards: all safeguards above + run old and new paths against a staging database with data from two tenants and verify zero cross-tenant leakage + staged rollout (one tenant first) + rollback plan (revert the middleware and redeploy)
- Reference: `architecture/danger-zones.md` — review DZ-02 (Prisma-direct cross-module queries) for hidden consumers

---

**Adding a column to `staff_profiles` or `students`**

Example: Adding a `preferred_name` column to `students`.

- These tables are queried directly by 6+ modules (see DZ-02 in `architecture/danger-zones.md`)
- A migration is required — it is irreversible once applied to production
- Any module doing `SELECT *` or destructuring without optional chaining will break
- Safeguards: grep all consumers before writing the migration, write a forward-compatible migration (additive, with default), verify the schema-change playbook (`architecture/schema-change-playbook.md`) is followed end-to-end, rollback plan in writing

---

**Modifying `EncryptionService`**

Example: Changing the AES-256 IV generation or key derivation logic.

- Existing encrypted data (bank details, Stripe keys) becomes permanently unreadable
- No built-in migration path from old-format ciphertext to new-format ciphertext
- Safeguards: all safeguards above + written data migration plan (decrypt old, re-encrypt new, verify) + explicit user approval before proceeding
- Reference: `architecture/danger-zones.md` DZ-09

---

## Safeguard Reference

### Coverage baseline

Before starting, run:

```bash
turbo test --filter=<package> -- --coverage --coverageReporters=text
```

Paste the summary into the PR. After completing, run the same command and verify coverage did not decrease.

### Characterization tests

Write tests that assert the CURRENT behaviour of the code being refactored, before you change it. Commit them separately. They exist to catch regressions — they do not need to be well-structured.

### Shadow-read validation (Critical tier)

Run both the old code path and new code path against a staging database simultaneously with real tenant data. Compare outputs row-by-row. Zero differences is the acceptance criterion.

### Staged rollout

Deploy to one tenant's data context first (or a canary environment). Monitor error rates for 15 minutes before enabling for all tenants. Ensure PM2 / health endpoints confirm all three services (web, api, worker) are running.

### Rollback plan

A written rollback plan means:

1. Exact `git revert` or `git checkout` command to undo the code change
2. If a migration was applied: exact down-migration SQL
3. Responsible person and time limit before rollback is automatically triggered (e.g., "if error rate > 1% after 10 minutes, revert")
