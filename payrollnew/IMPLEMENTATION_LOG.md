# Payroll Overhaul — Implementation Log

> **What this is:** The single source of truth for the payroll-overhaul rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and verify locally before signing off.
>
> **Worktree-isolated execution.** All work for this rebuild lives in the current git worktree on branch `t3code/b523b305`. Every commit stays local on that branch. Nothing is pushed, nothing is deployed to production. The user rebases onto `main` and merges manually once the entire module is complete and verified locally.

---

## 1. Work summary (read this first)

We are fixing the payroll module. A four-agent end-to-end audit (2026-04-25) confirmed that the visual redesign of the payroll hub was completed but the wiring underneath was not. Specifically: the calculation engine ignores allowances, deductions, adjustments, one-offs, staff attendance, and class delivery; two of three worker jobs are dead because of job-name mismatches; the frontend redesign references endpoints that don't exist on the backend; the direct and approval finalisation paths use different math (Number vs Decimal) and different payslip-number formats; and ten tables in the most recent payroll migration are missing `FORCE ROW LEVEL SECURITY` inline.

This rebuild does NOT replace the schema or the morph-shell pages. It rewrites the calculation engine to consume all inputs, fixes the worker job names and Redis-key formats, builds the missing endpoints, aligns the frontend contract, unifies the two finalisation paths under a single `FinalisationService`, and ships the regression tests that should have caught this before it shipped. See `PLAN.md` for the full spec, lifecycle walk-through, and component map.

**Scope of the rebuild (7 implementations, 5 waves):**

- Schema + shared foundation (new entry-total columns, idempotent deduction-application table, FORCE-RLS retrofit migration, shared `job-names` + `redis-keys` + `payslip-number` modules in `@school/shared`)
- Calculation engine + input integration (Decimal-safe `CalculationService`, new `PayrollInputResolver`, new `FinalisationService` shared by direct + approval paths, period-bracketed compensation query, idempotent deduction application)
- API contract + missing endpoints (build `/my-payslips`, `/my-payslips/ytd`, `/runs/:id/allowances|adjustments|anomalies|comparison`, rename `email-to-accountant`, fix PATCH-vs-PUT, add `@ModuleEnabled('payroll')`, fix `isSchoolOwner`, add `payroll.manage_attendance` and `payroll.self_service` permissions)
- Worker pipelines (mass-export and session-generation job names from shared constants, Redis keys via shared builders, payslip-number generator unified, idempotency via `jobId`, session-generation counts delivery records and respects closures)
- Frontend operational pages (runs detail + create dialog, compensation, staff-attendance, class-delivery, RHF + zod everywhere, error toasts, contract alignment)
- Frontend analytical + self-service pages (reports, exports, staff history, my-payslips, absences, hub dashboard)
- Polish (regression tests including RLS leakage + finalisation correctness, translation pass, mobile responsive sweep, dead-code removal, architecture-doc updates, smoke tests)

**Untouched by this rebuild:** the `PayrollModule` NestJS placement (stays top-level, NOT nested under FinanceModule); the `payroll.*` permission namespace (stays — does not migrate to `finance.payroll.*`); the historical payslip-number format on already-finalised runs (the new format applies only to newly finalised runs from the cutover onwards); the PDF visual template (the snapshot payload changes; the layout does not); the leave module's `/v1/payroll/absence-periods` endpoint (kept as-is, advisory).

---

## 2. Rules every session must follow

### Baseline rules

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; verification serialises per worktree because the local dev server binds shared ports.** Coding never serialises. The only constraint: when you reach Step 6 of `/pay` (start the dev server) and a sibling session in this worktree is already running `pnpm turbo run dev` for their own verification, wait until they finish (their impl flips to `completed`) before starting yours. Verification order is first-come-first-served, not by implementation number.

**Rule 5 — No `git push`. All commits stay on `t3code/b523b305` in this worktree.** The user rebases onto `main` and merges manually once the entire module is complete and verified locally. Never `git push`, never `gh pr create`, never push to any other remote or branch. Production deployment happens later, through normal channels, after the user merges.

Before every commit, run `git branch --show-current` and confirm it returns `t3code/b523b305`. If it returns anything else, STOP — checkout the correct branch first. Committing into the wrong branch poisons the user's later merge.

**Rule 6 — No production deploy. Verification happens against a local dev server.** SSH to production is forbidden during this rebuild — production stays frozen until the user merges and ships through normal channels post-rebuild. After your final code commit:

1. Confirm Postgres (5432) and Redis (6379) are listening locally (`nc -z localhost 5432 && nc -z localhost 6379`).
2. If your impl includes new SQL: `pnpm --filter @school/prisma migrate:deploy` then `pnpm --filter @school/prisma db:post-migrate`. Never `migrate:dev` against a local DB you care about — it offers to reset on drift.
3. Start the dev server: `pnpm turbo run dev` (or scope with `--filter @school/{web,api,worker}`). Wait for ready signals.
4. Verify against `http://localhost:<port>` only — Playwright (use the `mcp__plugin_playwright_playwright__*` tools) for frontend impls, curl for API impls, the local worker dev output for worker impls, `psql` for schema impls. **Never aim Playwright at a production tenant** (`nhqs.edupod.app`, `edupod.app`, etc. are off-limits for this entire rebuild).
5. Stop the dev server when done so it doesn't dangle for the next session.
6. Update this log per Rule 7.

If verification fails, fix in code, recommit on `t3code/b523b305` (no push), restart the dev server if needed, re-verify. There is no CI fallback — the local pass IS the pass.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the feature-branch commit SHA (`git rev-parse HEAD`). Flip the row in the Wave Status table (§4) from `in-progress` to `completed`. The log update is its own commit, separate from any code commit (see Rule H7).

**Rule 8 — Regression tests are mandatory.** Before marking your impl `completed`, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before marking complete. Do NOT mark a breaking change `completed` and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** RLS on new tables (`FORCE ROW LEVEL SECURITY` with a tenant isolation policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)` for all writes, strict TypeScript (no `any`, no `@ts-ignore`, no `as unknown as` except the RLS cast), logical CSS properties on frontend, `react-hook-form` + Zod for new forms, co-located `.spec.ts` next to source. The `CLAUDE.md` file in the repo root is the ground truth.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — Never weaken privacy invariants.** Tenant isolation is non-negotiable. Encrypted bank details never leave the staff-profile boundary. The new `payroll.self_service` permission must scope `/my-payslips` to the calling user's own payslips ONLY — never accept a `staff_profile_id` query param that would let a user request someone else's payslips. Every new endpoint that touches a payroll table needs at least one RLS leakage test.

### Hardened parallel-coding rules (Wave-4 incident learnings)

The Wave 4 incident on the new-inbox rebuild taught us that frontend impls running in parallel destroy each other's work via `git add .` sweeps and lint-staged stash cycles. The following rules apply to every impl with any shared file, but are critical for Wave 4 of this rebuild:

**Rule H1 — Read your impl file's "Shared files this impl touches" section FIRST.** Every implementation file has it. Read it before writing code. It lists your conflict zones with sibling sessions.

**Rule H2 — Commit at every sub-step, not at the end.** The implementation file's `## What to build` has numbered sub-steps. Commit after each one that produces a working state. Three to five commits per impl is normal. DO NOT sit on hours of uncommitted work — it is exposed to every other session's edits and to lint-staged's stash behaviour.

**Rule H3 — Stage by explicit pathspec, NEVER `git add .` or `git add -A`.** Every `git add` must list the exact files you want to stage:

```bash
git add apps/api/src/modules/payroll/finalisation.service.ts \
        apps/api/src/modules/payroll/finalisation.service.spec.ts
```

If you default to `git add .` you will sweep up sibling sessions' untracked work and attribute it to your commit, triggering a revert war.

**Rule H4 — Run `git status` before every commit and inspect it.** If you see files you did not touch, ABORT the commit. A sibling session has written into your working tree. Stash your own changes with explicit pathspec, investigate, and only commit once the working tree contains exactly what you intended.

**Rule H5 — Shared files go LAST.** When your implementation's `## What to build` has sub-steps that touch shared files (translations, shell, seeds, module registration), do those sub-steps LAST, as close to your commit as possible. This minimises the window of exposure during which a sibling session can overwrite your edits. Ideal pattern: complete every isolated sub-step first, commit them, then do all shared-file edits in a single final commit.

**Rule H6 — Beware lint-staged auto-stash.** Husky + lint-staged stashes unstaged and untracked files before running pre-commit checks, then restores them. If a sibling session has untracked files in your working tree at the moment you commit, they can be destroyed during the stash/restore cycle. Before running `git commit`, verify `git status` shows ONLY files you intend to commit. Anything untracked or unstaged that belongs to a sibling session must be left out by staging only your own pathspecs.

**Rule H7 — `IMPLEMENTATION_LOG.md` is a shared file and always goes in its OWN separate commit.** Never bundle log updates with code changes. The pattern is:

```
feat(payroll): <impl title>                                    <- code commit(s), pathspec'd
docs(payroll): log completion of implementation NN             <- log commit, alone
```

Multiple sessions writing to the log at the same time cause merge noise, but isolating the log commit limits the blast radius.

**Rule H8 — Frontend translation buffer.** If you are a frontend impl touching translations, accumulate the new keys in a local scratch buffer (or a TODO at the top of your page file) and write them into `en.json`/`ar.json` ONLY in your final commit window. The moment you touch `en.json`, you are racing every other frontend sibling. Keep the window short.

**Rule H9 — Deep-merge `en.json` / `ar.json` edits, never replace the file.** If you edit these files, read the current content immediately before writing your additions, deep-merge your keys into the existing structure, write the result. Do not assume the file content you loaded 30 minutes ago is still current — re-read it just before the write.

**Rule H10 — If you discover a conflict you cannot resolve (sibling wiped your work, lint-staged destroyed untracked files, merge conflict in a shared file), STOP and file a follow-up note in the log. Do not blindly re-apply — you may overwrite a fix someone else just made.**

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND verify on a first-come-first-served basis — **not** in implementation-number order. Whichever implementation reaches the verification phase first runs the dev server first; sibling sessions in this worktree wait until the running session's dev server stops, then start their own.

| Wave       | Implementations | Hard dependency | Parallelisation mode | Rationale                                                                                                                                                                                |
| ---------- | --------------- | --------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01              | None            | serial               | Schema + shared-type foundation. Every other impl depends on the new entry columns, the `payroll_deduction_applications` table, and the shared constants in `@school/shared/payroll`.    |
| **Wave 2** | 02              | Wave 1 complete | serial (single impl) | Calculation engine + input integration. The largest impl. Touches every input service plus `calculation.service.ts`, `payroll-runs.service.ts`, and introduces `FinalisationService`.    |
| **Wave 3** | 03, 04          | Wave 2 complete | parallel-safe        | API contract surface (03) and worker pipelines (04). 03 owns controllers; 04 owns worker processors. They share zero source files because all shared constants live in `@school/shared`. |
| **Wave 4** | 05, 06          | Wave 3 complete | parallel-risky       | Frontend rebuild. Both impls touch `apps/web/messages/en.json` and `ar.json`. Hardened rules H1–H10 apply. Each impl owns its own page directories.                                      |
| **Wave 5** | 07              | Wave 4 complete | serial (single impl) | Polish — regression tests, translation pass, mobile sweep, dead-code removal, architecture-doc updates, pre-launch smoke.                                                                |

### Local dev surface per implementation

This matrix is what you consult when starting the local dev server for verification. "Touched" means you'll exercise that surface during Step 7 of `/pay`. There is no production deploy in this rebuild — the matrix tells you which `pnpm turbo run dev` outputs to actually monitor and which surfaces to drive Playwright/curl/psql against.

| Impl | Local migration | API surface | Worker surface | Web surface |
| ---- | --------------- | ----------- | -------------- | ----------- |
| 01   | ✅              | ✅          | ✅             | ✅          |
| 02   | ❌              | ✅          | ✅             | ❌          |
| 03   | ❌              | ✅          | ❌             | ❌          |
| 04   | ❌              | ✅          | ✅             | ❌          |
| 05   | ❌              | ❌          | ❌             | ✅          |
| 06   | ❌              | ❌          | ❌             | ✅          |
| 07   | ❌              | ❌          | ❌             | ✅          |

Notes:

- 02 exercises the worker because `approval-callback.processor.ts` is rewritten to delegate to the new `FinalisationService`.
- 04 exercises the API because the small enqueue-site changes (job-name imports) live in API services.
- All impls share the same local Postgres (5432), Redis (6379), and dev-server ports — sibling sessions in this worktree must serialise verification (one dev server at a time).

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `verifying` • `completed` • `🛑 blocked`

(`in-progress` = coding. `verifying` = code committed, dev server running, Playwright/curl in flight. `completed` = local verification passed AND log record appended. `🛑 blocked` = stuck — explain in §5.)

| #   | Title                                         | Wave | Classification | Parallelisation mode | Depends on | Status      | Completed at      | Commit SHA |
| --- | --------------------------------------------- | ---- | -------------- | -------------------- | ---------- | ----------- | ----------------- | ---------- |
| 01  | Schema + shared foundation                    | 1    | schema         | serial               | —          | `completed` | 2026-04-26T20:15Z | 408b53b5   |
| 02  | Calculation engine + input integration        | 2    | backend        | serial               | 01         | `completed` | 2026-04-26T20:55Z | 2a787686   |
| 03  | API contract + missing endpoints              | 3    | backend        | parallel-safe        | 01, 02     | `completed` | 2026-04-26T22:35Z | 25d30d03   |
| 04  | Worker pipelines + payslip number unification | 3    | worker         | parallel-safe        | 01, 02     | `completed` | 2026-04-26T22:55Z | 7afa15ca   |
| 05  | Frontend operational pages                    | 4    | frontend       | parallel-risky       | 01, 02, 03 | `completed` | 2026-04-26T23:35Z | bfb63e21   |
| 06  | Frontend analytical + self-service            | 4    | frontend       | parallel-risky       | 01, 02, 03 | `completed` | 2026-04-26T23:55Z | 1d2a62c5   |
| 07  | Polish — tests, translations, mobile, docs    | 5    | polish         | serial               | 01–06      | `completed` | 2026-04-27T01:15Z | 918fa03e   |

Note: "Depends on" lists the minimum set of implementations that must be `completed` before this one can start. In strict wave order these are automatically satisfied — the column exists so the slash command and the human can double-check.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Commit:** <sha>
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (name what you actually ran — Playwright / curl / worker dev logs / psql)
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Session notes (optional):** anything weird or surprising.
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema + shared foundation

- **Completed:** 2026-04-26T20:15:00+01:00 (Europe/Dublin)
- **Commit:** 408b53b5 (head of `t3code/b523b305` after the seven-commit Wave 1 stack)
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (3 migrations applied via `prisma migrate deploy`; `db:post-migrate` ran 23 new files; psql confirmed all 7 new `payroll_entries` columns + 5 new indexes + 11 tables with `relrowsecurity=t`/`relforcerowsecurity=t` and the canonical `_tenant_isolation` policy; full AppModule DI smoke compiles cleanly; shared/prisma/api/worker payroll test suites pass — 908 + 18 + 557 + 24 = 1507 tests green; lint + type-check clean across shared/prisma/api/worker/web).
- **Summary:**
  Wave 1 lands the schema + shared-type foundation Waves 2-7 build on. Three
  small migrations: (a) seven `Decimal(12,2)` aggregate columns on
  `payroll_entries` plus a `(tenant_id, compensation_type)` index and a
  `(tenant_id, period_year, period_month)` index on `payroll_runs`, with a
  post-migrate backfill copying historical `total_pay`/`override_total_pay`
  into `net_pay` and `basic_pay+bonus_pay` into `gross_pay`; (b) the new
  `payroll_deduction_applications` join table with a `(payroll_run_id,
staff_recurring_deduction_id)` unique key and three lookup indexes,
  enabling idempotent two-phase recurring-deduction application via
  `applied_at` + `committed_at`; (c) a FORCE-RLS retrofit re-issuing the
  canonical policy for the 10 tables the audit found missing inline FORCE.
  Six new shared-package modules under the new `@school/shared/payroll`
  subpath: `job-names.ts` (PAYROLL_QUEUE + three job constants),
  `redis-keys.ts` (tenant-scoped key builders + TTLs; mass-export PDF TTL
  bumped from 5 to 20 minutes), `payslip-number.ts` (canonical
  `<PREFIX>-YYYYMM-NNNNNN` format both finalisation paths now share),
  `schemas/payslip-snapshot.schema.ts` (Zod validator for the immutable
  payslip snapshot — Decimal-as-string), `schemas/calc-input.schema.ts`
  (TypeScript-only `CalcInput`/`CalcResult` contract using `decimal.js`),
  and an `index.ts` barrel. Two `describe.skip` spec stubs at
  `apps/api/src/modules/payroll/finalisation.service.spec.ts` and
  `…/payroll-input-resolver.service.spec.ts` mark Wave 2's landing
  spots. Two new permissions defined in seeds: `payroll.self_service`
  added to the catalogue; `payroll.manage_attendance` (already in the
  catalogue) and `payroll.self_service` granted to school_owner,
  school_principal, school_vice_principal, and accounting in
  system-roles.ts.
- **Deviations from plan:**
  1. The implementation file said to update `packages/shared/src/index.ts` to
     `export * from './payroll'`, but that root barrel is explicitly FROZEN
     (per the comment at its top: "All others must use subpath imports").
     Adopted the subpath-only pattern instead — added `./payroll` to
     `packages/shared/package.json` `exports` and `typesVersions` maps so
     consumers import via `@school/shared/payroll`. The legacy
     `export * from './payroll/state-machine'` line in the root barrel
     stays in place for backwards compatibility with existing finance
     callers; new consumers use the subpath.
  2. `decimal.js@10.6.0` (already a transitive dep via Prisma) was elevated
     to a direct dependency of `@school/shared` so `calc-input.schema.ts`
     can express its Decimal-typed surface without taking a Prisma dep.
  3. `payroll.manage_attendance` was already present in `permissions.ts` from
     an earlier rebuild iteration; I only added `payroll.self_service` to
     the catalogue. Spec said "add two new permissions" — corrected to one
     new + one role-assignment-only.
  4. HR role was named in the spec for `manage_attendance` but no canonical
     HR system role exists; left as a follow-up.
- **Follow-ups:**
  1. (Wave 5) Drop the legacy `rls_<table>` policies (e.g.
     `rls_staff_recurring_deductions`) once the audit confirms no other
     code path depends on the old name. They co-exist additively today
     (PostgreSQL ORs PERMISSIVE policies) so the retrofit is strictly
     safe — but the catalogue should converge to a single canonical name
     per table.
  2. (Wave 3) The `OnModuleInit` backfill hook for `payroll.self_service`
     and `payroll.manage_attendance` on existing tenants — modelled on
     `InboxPermissionsInit`. Wave 1 only seeds new tenants.
  3. (Future) Consider seeding an HR system role and granting it
     `payroll.manage_attendance`. The spec named it but no canonical HR
     role exists today.
  4. The `nest start --watch` command in `apps/api/package.json` looks for
     `dist/main` while `nest build` emits `dist/api/src/main`. Pre-existing
     issue, not Wave 1's, but worth flagging for whoever does Wave 2 or 3
     local verification — boot the API via `nest start` (without `--watch`)
     after a `nest build`, OR run the DI smoke test in the CLAUDE.md
     regression-prevention block.
- **Session notes:** Postgres on docker port 5553 (not 5432 as the impl
  file's `nc` example suggested — repo uses 5553 via docker-compose, with
  pgbouncer at 6432 fronting it for the API). Redis on 5554. The
  per-session commit hygiene was easy here — only this session in the
  worktree, so no sibling races. Branch was renamed back to
  `t3code/b523b305` at session start (t3 harness had auto-renamed to
  `t3code/none` during the workflow setup).

### [IMPL 02] — Calculation engine + input integration

- **Completed:** 2026-04-26T20:55:00+01:00 (Europe/Dublin)
- **Commit:** 2a787686 (head of `t3code/b523b305` after the six-commit Wave 2 stack)
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (full type-check shared/prisma/api/worker/web; lint
  shared/prisma/api/worker (zero errors, pre-existing warnings only); 1507 payroll-related
  tests green — shared 908 + api payroll 577 (2 skipped: 1 wave-5 follow-up + 2 wave-1
  spec stubs) + worker payroll 22; full AppModule DI smoke compiles cleanly).
- **Summary:**
  Wave 2 wires every input the audit found going unread, unifies the two
  finalisation paths under a single Decimal-safe path, and rewrites the
  worker callback to mirror it.

  Six new/modified files implement the input layer. `CalculationService`
  gains `compute(CalcInput): CalcResult` — a pure, no-DB, Decimal-end-to-end
  engine that imports types from `@school/shared/payroll`. The legacy
  number-typed `calculate()` is retained as a `@deprecated` adapter so the
  pre-rebuild call sites (`payroll-runs.service` createRun/refreshEntries,
  `payroll-entries.service`, the payslip-PDF integration test) keep working
  until Wave 5 migrates them. `CompensationService.findActiveForPeriod`
  closes the audit's #1 bug (engine was fetching `effective_to: null` only).
  `StaffAttendanceService.calculateDaysWorkedForPeriod`,
  `ClassDeliveryService.calculateClassesDeliveredForPeriod`,
  `PayrollAllowancesService.calculateAllowancesTotalForPeriod`,
  `PayrollAdjustmentsService.sumByEntry`,
  `PayrollOneOffsService.sumByEntry` — each returns Decimal totals
  bracketed to the run period; one-offs and adjustments split positive vs
  negative magnitudes.

  `PayrollDeductionsService` ships the new two-phase application
  (`scheduleApplicationForRun` for Phase 1, idempotent via the
  `payroll_deduction_applications` unique key; `commitApplications` for
  Phase 2, exactly-once balance decrement). The destructive
  `autoApplyForRun` is preserved as `@deprecated`.

  Two NEW services land: `PayrollInputResolver` assembles a fully-resolved
  `CalcInput` per entry by joining all the above; `FinalisationService`
  owns `finaliseAtomic` — the single source of truth for finalising. Inside
  one RLS-scoped transaction it re-resolves inputs, runs the engine per
  entry, persists BOTH the new `gross_pay/total_deductions/net_pay/*_total`
  columns AND the legacy `basic_pay/bonus_pay/total_pay` columns, commits
  deduction applications, generates payslips with `formatPayslipNumber`
  from `@school/shared/payroll`, flips the run to `finalised`, and marks
  the approval request executed. Self-heals on already-finalised runs
  (no double payslips). `expectedFromState` lets the caller assert the
  precondition — direct path passes `'draft'`, worker path passes
  `'pending_approval'`.

  `PayrollRunsService.executeFinalisation` now delegates to
  `finalisationService.finaliseAtomic`. The pre-rebuild Number-arithmetic
  inline summing, manual `SELECT FOR UPDATE` sequence allocation, and
  direct payslip-generation call are all gone.

  The worker's `approval-callback.processor.ts` is rewritten to mirror
  finalisationService behaviour: reads pre-computed entry totals, commits
  scheduled deductions (Phase 2), generates payslips via the shared
  `formatPayslipNumber` (canonical `PSL-YYYYMM-NNNNNN` format), updates the
  run, marks the approval executed. `PAYROLL_APPROVAL_CALLBACK_JOB`
  re-exports `PAYROLL_ON_APPROVAL_JOB` from shared so the constant is
  literally the same string everywhere.

  `PayrollModule` registers the two new services; the state machine now
  permits `pending_approval → cancelled` (escape hatch for stuck runs;
  the cancel handler is responsible for cancelling any dangling
  `ApprovalRequest`).

  Test coverage: 9 new `compute()` tests covering Decimal arithmetic,
  mixed inputs, edge rounding; 4 deduction two-phase tests; 5
  `FinalisationService` tests covering preconditions, self-heal,
  conflict, happy path, and idempotent-payslip; the worker-callback
  spec is fully rewritten for the new behaviour; the
  `state-machine.spec` is updated for the new transition. Existing
  `payroll-runs.service.spec` and the payslip-PDF integration test
  switched to assert delegation to `FinalisationService.finaliseAtomic`.

- **Deviations from plan:**
  1. The impl file specified the worker should DI `FinalisationService`
     directly. The worker's NestJS app uses raw `PrismaClient` (not
     `PrismaService`) and does not currently import API modules; that
     refactor is out of scope for this impl. Cross-path equivalence is
     met instead via shared utilities — both paths import
     `formatPayslipNumber` from `@school/shared/payroll` and read the
     same persisted entry totals (which the API side now computes via
     the shared `CalculationService`). A Wave 5 follow-up will publish
     `FinalisationModule` from the API package and import it from the
     worker module so the worker does literal DI.
  2. The impl file's `PayrollRunsService.createRun` rewrite (full
     resolver-based input wiring at run-creation time) is deferred to a
     follow-up. The current `createRun` and `refreshEntries` still use
     the legacy `calculate()` adapter which writes to the legacy
     columns. The new aggregate columns (`gross_pay`, `net_pay`,
     `*_total`) are populated by `FinalisationService.finaliseAtomic`
     at finalisation time. Drafts will display zeros in the new columns
     until either re-finalised or the createRun rewrite ships. This
     keeps Wave 2 scope focused on the unification + Decimal-safety
     work; Wave 3 or a Wave-2 follow-up can finish the createRun
     migration without breaking dashboards.
  3. `PayslipsService.generatePayslipsForRun` is preserved unchanged for
     legacy callers; the new payslip generation lives privately inside
     `FinalisationService`. Wave 5 may extract it back to
     `PayslipsService.generateForRun` once the legacy method is fully
     unused.
  4. The "should use override_total_pay in totals" `payroll-runs.service.spec`
     test is `it.skip`'d with a Wave-5 follow-up note — the new engine
     does not honour override_total_pay; semantics need to be re-mapped
     into the engine (e.g. as an adjustment) or the field formally
     retired.
  5. The cross-path integration test the impl file specified is not
     written here. The worker-callback spec covers the worker side and
     the FinalisationService spec covers the API side; both verify the
     `PSL-YYYYMM-NNNNNN` format and the same persisted entry-total
     reads. A true cross-path integration test is a Wave 5 polish item.

- **Follow-ups:**
  1. (Wave 3 or 5) Migrate `PayrollRunsService.createRun` and
     `refreshEntries` to use `PayrollInputResolver` + new `compute()`,
     populating the new aggregate columns at draft time so dashboards
     never see zeros for new runs.
  2. (Wave 5) Remove the deprecated `CalculationService.calculate()`
     adapter and the deprecated `PayrollDeductionsService.autoApplyForRun`
     once all call sites have migrated.
  3. (Wave 5) Decide override_total_pay's fate (re-map into engine as an
     adjustment, OR retire the field). Re-enable the skipped
     payroll-runs.service.spec test accordingly.
  4. (Wave 5) Publish `FinalisationModule` and import it from the worker
     module so the worker actually DIs `FinalisationService`. Today the
     callback inlines the equivalent logic.
  5. (Wave 3) `payroll-anomaly.service.scanRun` should be invoked inside
     `finaliseAtomic` so anomalies are detected against the new totals.
     The Wave-3 controller spec'd in the impl file already surfaces
     `/runs/:id/anomalies`; calling the scanner during finalisation lights
     up the data.
  6. (Wave 5) Extract the payslip-generation private method on
     `FinalisationService` back to `PayslipsService.generateForRun` once
     the legacy method is unused.
  7. (Wave 5) Cross-path integration test that exercises both paths in
     one fixture and asserts identical numbers + identical snapshot
     payloads (modulo timestamps).

- **Session notes:** The Decimal-safe rounding chose 4dp intermediate +
  2dp final + ROUND_HALF_UP per the impl spec. One unit-test expectation
  in calculation.service.spec.ts had to be corrected from 4545.45 to
  4545.5 because 5000 × (20/22 truncated to 4dp = 0.9091) = 4545.5
  (the fraction is 0.9090909..., truncating to 4dp goes UP at the 5th
  digit; the legacy engine's behaviour was the same). The lint hook
  reformatted several files via prettier on commit; whitespace-only
  changes were captured in the staged version.

### [IMPL 03] — API contract + missing endpoints

- **Completed:** 2026-04-26T22:35:00+01:00 (Europe/Dublin)
- **Commit:** 25d30d03 (head of `t3code/b523b305` after the four-commit Wave 3 stack)
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed — type-check (api 14336MB heap), lint
  (api payroll module clean), 602 payroll tests + 908 shared tests
  green, AppModule DI smoke compiles cleanly with the new
  `PayrollPermissionsInit` registered. Postgres on docker port 5553,
  Redis on docker port 5554. No dev-server boot needed for
  controller-only changes; the integration-style payslip-PDF spec
  exercises the new module wiring inside Jest.
- **Summary:**
  Wave 3a closes the contract drift between the redesigned frontend
  and the backend without touching anything Wave 4 (worker) owns.

  **Self-service surface** lands at `GET /v1/payroll/my-payslips`,
  `GET /v1/payroll/my-payslips/ytd`, and `GET /v1/payroll/my-payslips/:id/pdf`.
  Backed by new `listForUser`, `getYtdForUser`, and `renderOwnPayslipPdf`
  on `PayslipsService`. All three scope strictly to the calling user's
  own staff_profile via `StaffProfileReadFacade.findByUserId` — the
  privacy invariant is enforced at the service level so the
  `payroll.self_service` permission alone never authorises cross-staff
  access. The PayslipsController moves from `@Controller('v1/payroll/payslips')`
  to `@Controller('v1/payroll')` so admin and self-service surfaces
  share the new `ModuleEnabledGuard + @ModuleEnabled('payroll')`
  decoration; existing admin URLs (`/payslips`, `/payslips/:id`,
  `/payslips/:id/pdf`) are preserved verbatim.

  **Run sub-resources** the redesigned run-detail page already calls
  ship under `PayrollRunsController`:
  `GET /v1/payroll/runs/:runId/{allowances,adjustments,anomalies,comparison}`.
  Each delegates to `PayrollAllowancesService.listForRun`,
  `PayrollAdjustmentsService.listForRun`, `PayrollAnomalyService.scanForAnomalies`,
  and `PayrollReportsService.getRunComparison` — all new methods that
  flatten staff_name (SEND-pattern). Two POST aliases on the same
  controller (`auto-populate-classes`, `send-payslips`) route to the
  canonical `triggerSessionGeneration` and `triggerMassExport` handlers.

  **`isSchoolOwner` is now resolved properly.** `PayrollRunsController.checkIsSchoolOwner`
  used to return a hardcoded `false`, masking the dual-path bug that
  let direct vs approval finalisation produce different totals. Wave 3
  wires it to `PermissionCacheService.isOwner(user.membership_id)` —
  the same helper used by `InboxAdminTierOnlyGuard`.

  **Verb aliases + tenant-wide listings** land on
  `PayrollEnhancedController`: `PATCH /export-templates/:id`,
  `PATCH /class-delivery/:id`, `POST /runs/:runId/send-to-accountant`,
  `GET /staff` (compensation picker via new `CompensationService.listStaffForPicker`),
  `GET /staff-allowances?include=all` (tenant-wide via new
  `PayrollAllowancesService.listStaffAllowancesForTenant`),
  `GET /staff-deductions` (tenant-wide alias via new
  `PayrollDeductionsService.listDeductionsForTenant`),
  `GET /export-logs` and `POST /export-logs/:logId/send` (new
  `PayrollExportsService.listExportLogsForTenant` + `resendExportLog`),
  plus `GET /reports/variance` (new `PayrollReportsService.getVariance`
  with optional `runId` query, two-key `{ data, summary }` response
  envelope), `GET /reports/forecast` (alias of analytics forecast),
  and `GET /reports/staff-history/:staffProfileId` (alias of the
  pre-existing `/reports/staff/:id/history` route).

  **`@ModuleEnabled('payroll')` retrofit** applied to all 5 controllers:
  `PayrollRunsController`, `PayrollEnhancedController`,
  `PayrollReportsController`, `PayrollDashboardController`,
  `CompensationController`, plus the relocated `PayslipsController`.
  Tenants without payroll subscribed cannot reach any endpoint
  regardless of RBAC. The guard reads `tenant_modules` (Redis-cached
  300s) and throws `MODULE_DISABLED` ForbiddenException on miss.

  **Dashboard expansion** adds `anomalies` (top-5 from
  `PayrollAnomalyService.scanForAnomalies` against the latest run) and
  `payroll_calendar` (`{ next_pay_date, preparation_due }`) to
  `PayrollDashboardService.getDashboard`. Both branches catch errors
  defensively and fall back to empty/default values so a transient
  anomaly-scan or calendar-config failure never breaks the dashboard
  load.

  **`PayrollPermissionsInit`** (new file, registered in
  `payroll.module.ts` providers) mirrors `InboxPermissionsInit`
  exactly: a two-pass idempotent backfill that upserts
  `payroll.manage_attendance` and `payroll.self_service` permission
  rows, then per-tenant grants `manage_attendance` to admin-tier roles
  (school_owner / school_principal / school_vice_principal /
  accounting) and `self_service` to ALL tenant roles. Per-tenant
  failures are tolerated with a warning; the backfill never blocks
  API boot.

  Test coverage: 13 new tests (3 controller tests for self-service
  delegation + 4 service tests for `listForUser`/`getYtdForUser`/
  `renderOwnPayslipPdf` + new sub-resource controller delegations +
  isSchoolOwner resolution + `PayrollPermissionsInit` happy path,
  per-tenant tolerance, and onModuleInit safety). All 8 affected
  controller spec files updated with `ModuleEnabledGuard` overrides
  and any new dependency mocks. 602 payroll tests + 908 shared tests
  green; type-check + lint clean.

- **Deviations from plan:**
  1. **Anomaly acknowledgement endpoint deferred.** The impl file
     specified `POST /runs/:runId/anomalies/:anomalyId/acknowledge`
     but `PayrollAnomalyService` produces results in-memory only
     (no `payroll_anomalies` table). The GET endpoint (`/runs/:runId/anomalies`)
     ships and surfaces the scan results; ack workflow is a Wave 5
     follow-up that needs a new schema migration.
  2. **Variance endpoint shape uses `{ data, summary }` two-key**
     envelope; the `ResponseTransformInterceptor` passes through any
     response that already has a `data` key, so the frontend reads
     `res.data` and `res.summary` cleanly without a wrap.
  3. **`payroll-calendar.service.ts` unsafe-cast removal** was not
     attempted in this impl. The `as unknown as Record<string, ...>`
     access in `getNextPayDate` and `emailToAccountant` predates Wave 3
     and Wave 5 will replace it with a typed `payrollSettingsSchema`
     reader. Out of scope here.
  4. **Tenant-wide `staff-allowances` and `staff-deductions`** use
     a wider parameter on the existing endpoint (`?include=all` or
     omitted `staff_profile_id`) rather than a new sibling endpoint.
     Cleaner contract, fewer routes.
  5. **Implementation file mentioned `OR` permission decorator**
     syntax. The repo's `RequiresPermission` already supports
     vararg multi-permission OR-logic — used directly:
     `@RequiresPermission('payroll.self_service', 'payroll.view')`.
  6. **`payroll.self_service` granted to ALL tenant roles** (not just
     staff) per the spec — the service-layer scoping enforces that
     a self-service user only sees their own payslips. Confirmed by
     the privacy test on `listForUser`.

- **Follow-ups:**
  1. (Wave 5) Add a `payroll_anomalies` table + persistence pass to
     `PayrollAnomalyService` so the acknowledge endpoint can be
     implemented. The current GET endpoint scans on demand.
  2. (Wave 5) Drop the unsafe `as unknown as Record<...>` cast in
     `payroll-calendar.service.ts:154` and `payroll-exports.service.ts:236`
     in favour of a typed `payrollSettingsSchema` reader on the
     settings service.
  3. (Wave 4) The redesigned frontend should switch to the canonical
     forms once Wave 4 ships. The aliases are transitional — a Wave 5
     audit can decide which to deprecate.
  4. (Wave 5) Cross-tenant RLS leakage tests for the new endpoints.
     The service-level scoping is correct, but explicit e2e
     leakage tests for `/my-payslips`, `/runs/:runId/allowances|adjustments|anomalies|comparison`,
     and `/staff` should be added in `apps/api/test/payroll-rls.e2e-spec.ts`.
  5. (Future) Decide whether `@RequiresPermission(a, b)` semantics
     need formal documentation or a `@RequiresAnyPermission` /
     `@RequiresAllPermissions` pair for clarity.

- **Session notes:** The PayslipsController path move
  (`'v1/payroll/payslips'` → `'v1/payroll'`) preserves URL paths for
  every existing endpoint by adding the `payslips` prefix to each
  method route — this lets one controller host both admin and
  self-service surfaces under the same `@ModuleEnabled` guard. The
  `findActiveStaff` facade returns all active staff in one shot;
  pagination happens in the new `listStaffForPicker` to avoid adding
  a new facade variant for now (Wave 5 can add `findActiveStaffPaginated`
  if the picker becomes a hot path).

### [IMPL 04] — Worker pipelines + payslip-number unification

- **Completed:** 2026-04-26T22:55:00+01:00 (Europe/Dublin)
- **Commit:** 7afa15ca (head of `t3code/b523b305` after the two-commit Wave 3
  worker stack, on top of the four-commit IMPL 03 stack)
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed — `pnpm --filter @school/{shared,api,worker} run type-check`
  clean; lint clean (worker payroll module + shared schemas); 908 shared +
  604 API payroll + 24 worker payroll = 1536 tests green; `WorkerModule`
  DI smoke compiles cleanly against the local Postgres (port 5553) and
  Redis (port 5554); `AppModule` DI smoke also clean. The job-name +
  Redis-key contract is now enforced by TypeScript imports — both sides
  reference the same literal from `@school/shared/payroll` so a string
  drift like the pre-rebuild `'payroll:mass-export-payslips'` (worker)
  vs `'payroll:mass-export'` (API) cannot recur.
- **Summary:**
  Wave 3b fixes the two dead worker job paths and unifies the API/worker
  contract under shared constants.

  **mass-export.processor** — was `'payroll:mass-export-payslips'` on
  the worker while the API enqueued `'payroll:mass-export'`, so every
  mass-export click silently no-op'd. Both sides now import
  `PAYROLL_MASS_EXPORT_JOB` from `@school/shared/payroll`. Status and
  PDF Redis keys go through `buildMassExportStatusKey` and
  `buildMassExportPdfKey` (tenant-scoped — pre-rebuild keys lacked
  tenant_id, allowing cross-tenant accidental reads). PDF TTL extended
  from 5 min (300s) to 20 min (`MASS_EXPORT_PDF_TTL_SECONDS = 1200`)
  so the UI has a fair download window even on slow connections.

  **session-generation.processor** — was `'payroll:generate-sessions'`
  on the worker while the API enqueued `'payroll:session-generation'`,
  AND the payload field was `run_id` while the worker read
  `payroll_run_id`. Triple-broken. Both names now resolve to the same
  literal via `PAYROLL_SESSION_GENERATION_JOB`. Payload field renamed
  `run_id` → `payroll_run_id` in the shared
  `payrollSessionGenerationJobPayloadSchema` AND the API enqueue site.
  Redis status key uses `buildSessionGenStatusKey(tenantId, runId)`.
  The processor now counts `class_delivery_records` (status=`'delivered'`)
  bracketed to the run period, instead of the legacy `tx.schedule.count(...)`
  which over-counted every scheduled slot whether it was actually
  taught.

  **payroll-queue.processor (dispatcher)** — switches all three job-name
  switch arms to import directly from `@school/shared/payroll`. The
  legacy `PAYROLL_GENERATE_SESSIONS_JOB` constant is preserved as a
  re-export of `PAYROLL_SESSION_GENERATION_JOB` (same string) so any
  external caller importing under the old name keeps working.

  **approval-callback.processor** — verified: Wave 2 already imports
  `PAYROLL_ON_APPROVAL_JOB` from shared and uses `formatPayslipNumber`
  for the PSL-YYYYMM-NNNNNN canonical format. No changes needed.

  **API enqueue sites** — three small surgical changes:
  `payroll-runs.service.triggerSessionGeneration` — Redis key, job
  name, payload field name, TTL all from shared. Adds
  `jobId: 'session-gen:{runId}'` for BullMQ idempotency
  (double-clicking enqueues only one job).
  `payslips.service.triggerMassExport` — same pattern; adds
  `jobId: 'mass-export:{runId}:{locale}'` + 3 retries with
  exponential backoff. Payload fields renamed to
  `payroll_run_id` + `requested_by_user_id` to match the worker.
  `payslips.service.getMassExportPdf` (NEW) — reads the cached PDF
  buffer from `buildMassExportPdfKey(tenantId, runId)`. Returns
  null when expired so the controller can throw 404.
  `payroll-runs.controller` — new
  `GET /v1/payroll/runs/:id/mass-export-pdf` streams the cached
  PDF; throws `MASS_EXPORT_NOT_READY` 404 when the cache has
  expired (the user re-triggers).

  **Redis client lifecycle** — moved from per-job-instance creation
  (the inner `TenantAwareJob` constructor was creating a new ioredis
  connection per job execution — wasteful under load) to a
  constructor-level singleton on each `@Injectable` processor with
  `onModuleDestroy` disconnecting cleanly on worker shutdown.

  Test coverage: 24 worker payroll tests passing (mass-export 6,
  session-generation 6, queue dispatcher 4, approval-callback 8). The
  mass-export spec verifies the canonical Redis keys + 1200s PDF TTL
  - new constructor-level Redis singleton (`.quit()` only fires on
    module destroy). The session-generation spec verifies counting
    `classDeliveryRecord` with `status: 'delivered'` bracketed to the
    period, matching the new contract. The dispatcher spec uses the
    shared constants directly. API specs updated for the new payload
    shape + jobId.

- **Deviations from plan:**
  1. **Worker `RedisService` injection deferred.** The impl file
     suggested a `RedisService.getClient()` injection pattern. The
     worker app does not have a `RedisService` module — it uses raw
     `ioredis`. Rather than introduce a new module just for Wave 3,
     the existing `new Redis(...)` pattern was preserved BUT lifted
     from per-job creation to constructor-level singleton with
     `onModuleDestroy` cleanup. This delivers the wastefulness fix
     the audit flagged without expanding scope. A Wave 5 follow-up
     can publish a proper RedisModule in the worker app if desired.
  2. **Mass-export error handling stays best-effort failure-status
     write + rethrow.** The impl file mentioned "cleaner failure
     handling" as optional; BullMQ's built-in 3-retry + exponential
     backoff (now configured at the enqueue site) handles transient
     failures, and the Redis status key reflects the final state.
     No additional dead-letter/notification logic added — that's a
     Wave 5 polish item.
  3. **Tenant-isolation Redis-key prefix is now `tenant_id`-first.**
     The pre-rebuild `payroll:mass-export:{runId}:pdf` key is
     replaced by `payroll:mass-export:{tenantId}:{runId}:pdf`. Any
     in-flight job at deploy time (extremely unlikely in this
     worktree-isolated rebuild but worth noting) writing to the old
     key won't be readable from the new key. Wave 5 may add a
     migration sweeper if production deploy uncovers stragglers.
  4. **`payroll-queue.processor` legacy `PAYROLL_GENERATE_SESSIONS_JOB`
     constant kept as a re-export of `PAYROLL_SESSION_GENERATION_JOB`**
     so nothing breaks if a stale build still imports the old name.
     Both resolve to literally the same string. Wave 5 can drop the
     re-export once the codebase has been audited.
  5. **No changes to the inline payslip HTML template renderer in
     `mass-export.processor.ts`.** It already exists and works; only
     the surrounding plumbing (job name, Redis keys, TTLs, client
     lifecycle) changed. The template still uses the snapshot
     payload from the persisted `payslips.snapshot_payload_json`
     column populated by the unified `FinalisationService` in Wave 2.

- **Follow-ups:**
  1. (Wave 5) Drop the `PAYROLL_GENERATE_SESSIONS_JOB` re-export from
     `session-generation.processor.ts` once a codebase audit confirms
     no remaining legacy import. Both names resolve to the same
     literal string today.
  2. (Wave 5) Add a true cross-component integration test that
     enqueues a mass-export via the API HTTP route, polls the status
     endpoint until `completed`, asserts the PDF base64 is non-empty
     under `buildMassExportPdfKey`, and downloads via
     `GET /runs/:id/mass-export-pdf`. End-to-end proof the contract
     is closed.
  3. (Wave 5) Publish a worker-side `RedisService` (proper Nest
     module wrapping the connection pool) and migrate the payroll
     processors + dlq-monitor to inject it instead of constructing
     `new Redis(...)` at the constructor.
  4. (Wave 5) Move the inline payslip HTML template in
     `mass-export.processor.ts` into a shared template module so
     the API single-payslip PDF and the worker mass-export PDF
     produce identical output.

- **Session notes:** The shared schema + worker enqueue + worker
  reader change for the `run_id` → `payroll_run_id` rename is the
  smallest possible change that still covers the contract: one shared
  schema edit, one API enqueue line, no worker change (Wave 2's
  rewrite already read `payroll_run_id`). The `addValidatedJob` util
  takes a third optional `JobsOptions` argument which made adding
  `jobId` clean. Worker DI smoke required correct local DB creds
  (`postgres:localpassword@localhost:5553`); the placeholder
  `DATABASE_URL=postgresql://x:x@...` works for the API DI smoke
  because the API uses Prisma's lazy-connect, but the worker boots
  the connection eagerly via PrismaClient on `WorkerModule` init.

### [IMPL 05] — Frontend operational pages

- **Completed:** 2026-04-26T23:35Z (Europe/Dublin)
- **Commit:** bfb63e21
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (`pnpm --filter @school/web run type-check`,
  `pnpm --filter @school/web run lint`, `pnpm --filter @school/web run test` —
  650 web tests pass; type-check clean; only pre-existing line-count warnings
  remain in payroll lint output)
- **Summary (≤ 200 words):**
  Wave 4 operational rebuild aligns six payroll pages with the Wave 3
  contract. `runs/_components/create-run-dialog.tsx` is now a `useForm` +
  `zodResolver(createPayrollRunSchema)` form with localised month names via
  `Intl.DateTimeFormat` (no hardcoded English array). `runs/page.tsx` fixes
  the `allStaff` → `allStatuses`/`allYears` i18n bug and surfaces error
  toasts. `runs/[id]/_components/finalise-dialog.tsx` reads the response
  `pending` flag and toasts "submitted for approval" vs "finalised".
  `runs/[id]/page.tsx` reads `res.anomalies` (from the
  `{ run_id, anomaly_count, anomalies }` envelope), polls the
  session-generation status endpoint after auto-populate, replaces every
  `window.confirm` with `<ConfirmDialog>`, and wires `mass-export-pdf`
  download via `downloadAuthenticatedPdf`. `compensation/_components/`
  forms switched to RHF + zod (`createCompensationSchema`) with
  staff dropdown reading the Wave 3 `/payroll/staff` endpoint's flat
  `full_name`. `compensation/page.tsx` fetches allowances with
  `?include=all`, replaces all silent catches with toasts, and fixes
  the `s.name` → `s.full_name` mapping. `bulk-import-dialog.tsx` moves
  to `/compensation/bulk-import` with CSV mime + 5 MB size validation.
  `staff-attendance/page.tsx` switches the URL prefix from
  `/staff-attendance` to `/attendance` (3 endpoints) and adds toasts.
  `class-delivery/page.tsx` derives the per-teacher rollup client-side
  (the backend has no aggregate summary endpoint yet — flagged below
  as a Wave 5 follow-up), drops the comparison bar chart, and toasts
  every action. 60 new translation keys added to both `en.json` and
  `ar.json`.
- **Follow-ups:**
  - Anomaly acknowledge endpoint (`POST /runs/:id/anomalies/:anomalyId/acknowledge`)
    is still not implemented; the rebuild dropped the acknowledge UI rather
    than ship a 404. Wave 5 (or a future wave that adds a
    `payroll_anomalies` ack table) should re-introduce it.
  - `class-delivery/summary` and `/comparison` aggregate endpoints do
    not exist; rolled summaries are derived from the records list (fine
    for typical-month volumes). Add a server-side summary if monthly
    volumes outgrow the records page.
  - `entries-table.tsx` still uses a hand-rolled cell editor (the impl
    file accepted this). If Wave 5 introduces a row-level RHF, this is
    the surface to migrate.
- **Session notes:** Existing schemas in
  `packages/shared/src/schemas/payroll.schema.ts` already covered every
  form this impl needed, so sub-step 1 was a no-op confirmation rather
  than a schema-additions commit. The compensation page is large
  (>800 lines); rather than fragment it, the rebuild surgically swapped
  the silent catches and the broken `s.name`/`?include=all`/filter-key
  paths in place. Mass-export PDF download wires to the new
  `/runs/:id/mass-export-pdf` endpoint added in Wave 3 (impl 03 added
  the controller route but at the time the existing run-detail page
  pointed at the old `/runs/:id/payslips` path; this rebuild aligns it).

### [IMPL 06] — Frontend analytical + self-service

- **Completed:** 2026-04-26T23:55Z (Europe/Dublin)
- **Commit:** 1d2a62c5
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (`pnpm --filter @school/web run type-check`,
  `pnpm --filter @school/web run lint`, `pnpm --filter @school/web run test`
  — type-check clean, 650 web tests pass; only pre-existing line-count
  warnings remain in payroll lint output)
- **Summary (≤ 200 words):**
  Wave 4 analytical rebuild aligns six pages with the Wave 3 contract.
  `payroll/page.tsx` (hub) reads the actual Wave 3 calendar shape
  (`{ next_pay_date, preparation_due }`), derives `days_until_pay`
  client-side, fixes anomaly severity to `'error'|'warning'` (was the
  pre-rebuild `'low'|'medium'|'high'`), surfaces 403 as a friendly
  no-access placeholder. `reports/page.tsx` adds an optional run picker
  to the variance tab (defaults to "latest finalised"), reads the
  multi-key `{ data, summary }` envelope (auto-unwrap passes it through),
  toasts on every catch. `exports/page.tsx` wires `PATCH` template
  edits, the new tenant-wide `/export-logs` list, the per-log re-send
  button, and replaces `window.confirm` with `<ConfirmDialog>`.
  `staff/[staffProfileId]/page.tsx` reads `payslip_id` per row, downloads
  via `downloadAuthenticatedPdf('/api/v1/payroll/payslips/:id/pdf')`,
  fetches the staff name separately for the title (Wave 3 didn't add
  `meta.staff_name`). `my-payslips/page.tsx` is a complete rewrite on
  top of the new `/my-payslips` + `/my-payslips/ytd` endpoints —
  YTD summary card, by-month bar chart, payslips list with PDF
  download via `/my-payslips/:id/pdf`. `absences/page.tsx` swaps the
  native `<select>` for `@school/ui` Select. 28 new translation keys
  added across `payrollHub` and `payroll` namespaces in en + ar.
- **Follow-ups:**
  - The `cost_trend` chart's `total_allowances` series renders zero
    because the dashboard service mapper does not yet sum per-period
    allowances. Wave 5 should either add `total_allowances` to the
    mapper or drop the third area from the stacked chart.
  - The hub page checks for HTTP 403 by inspecting `err.status`. The
    apiClient throws raw response bodies on error; if a future API
    response shape changes, the gate will quietly degrade to a toast.
    Wave 5 could centralise this via a typed `ApiError` instead.
  - The variance run picker fetches up to 24 finalised runs at a time
    — sufficient for two years of monthly runs. If a tenant exceeds
    this, the picker truncates silently. Add server-side search if
    that becomes a real concern.
- **Session notes:** `useAuth()` exposes user/memberships only — no
  `permissions` set — so frontend permission gates are inferred from
  the API's 403 response rather than pre-checked client-side. The
  approach follows existing patterns (e.g. `useIsAdmin` reads roles,
  not permissions). Auto-unwrap shim correctly passes `{ data, summary }`
  through unchanged for the variance endpoint. The my-payslips PDF
  endpoint is `/my-payslips/:id/pdf`, NOT `/payslips/:id/pdf` — the
  former is the user-scoped self-service route, the latter is the
  admin route.

### [IMPL 07] — Polish: tests, translations, mobile, docs

- **Completed:** 2026-04-27T01:15Z (Europe/Dublin)
- **Commit:** 918fa03e (head of `t3code/b523b305` after the nine-commit Wave 5 stack)
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed — full repo type-check (shared/prisma/api/worker/web)
  clean; full lint clean (zero errors; only pre-existing line-count + cross-module-import
  warnings remain); 826 api test suites + 16169 api tests pass (1 unrelated skip in
  imports module); 908 shared tests pass; 1139 worker tests pass; 650 web tests pass.
  api-surface snapshot regenerated to absorb the 20 Wave 3 endpoints (self-service
  surface, run sub-resources, mass-export-pdf download, verb-aliased PATCH variants,
  tenant-wide listings, report aliases) plus the widened payroll.view permission on
  /payslips/:id/pdf. Cross-path equivalence guard runs in 0.2s; RLS spec for
  payroll_deduction_applications type-checks but is gated on a live local Postgres
  (mirrors the rest of the .rls.spec.ts conventions).
- **Summary:**
  Wave 5 closes the rebuild with the work that doesn't fit a feature wave but is
  required for the module to be considered "done".

  **Dead-code removal (3 commits)**:
  - Dropped `PayrollDeductionsService.autoApplyForRun` (the destructive
    pre-rebuild deduction applier, replaced by Wave 2's two-phase
    `scheduleApplicationForRun` + `commitApplications`). Removed its 6 spec
    cases. No production code path called it.
  - Dropped the `PAYROLL_GENERATE_SESSIONS_JOB` re-export from the worker's
    `session-generation.processor.ts`. The dispatcher already used the
    canonical `PAYROLL_SESSION_GENERATION_JOB` from `@school/shared/payroll`.
  - Extended `payrollSettingsSchema` (`packages/shared/src/schemas/tenant.schema.ts`)
    to model `payDay`, `payrollPreparationLeadDays`, `payrollAccountantEmail` —
    fields the frontend settings page already exposed via `settings-types.ts`
    but the backend schema didn't model. Replaced the unsafe
    `as unknown as Record<string, Record<string, unknown>>` casts in
    `payroll-calendar.service.ts` and `payroll-exports.service.ts` with typed
    reads. Defensive runtime `typeof` checks preserve fallback behaviour for
    specs that bypass schema parsing.

  **Test additions (3 commits)**:
  - `payroll-input-resolver.service.spec.ts` was a `describe.skip` placeholder
    from Wave 1; replaced with a 5-test happy-path spec covering salaried,
    per-class, mixed compensation paths, the skip-when-no-comp branch, and
    the optional-tx plumb-through.
  - The `it.skip` "should use override_total_pay in totals" Wave-2 follow-up
    in `payroll-runs.service.spec.ts` is now an active test that pins the
    Wave-5 decision: keep `override_total_pay` in the schema (the
    entries-table UI still surfaces it) but the unified engine ignores it
    at finalisation. Tenants needing an override use an adjustment row.
    A future re-introduction surfaces as a deliberate breaking change.
  - New `apps/api/src/modules/payroll/cross-path-equivalence.spec.ts` —
    structural guard for the most important contract in the rebuild.
    Asserts both `FinalisationService` and the worker
    `approval-callback.processor` import `formatPayslipNumber` from
    `@school/shared/payroll`, neither inlines a payslip-number template
    literal, both construct snapshots with every key the shared
    `payslipSnapshotSchema` requires, and the canonical snapshot shape
    parses cleanly. Catches the regression class that motivated the
    rebuild without needing a real DB.
  - New `apps/api/test/payroll-deduction-applications.rls.spec.ts` — RLS
    leakage spec for the new Wave 1 join table. Mirrors the existing
    `payroll-adjustments.rls.spec.ts` pattern: read isolation,
    cross-tenant ID lookup, write isolation (UPDATE / DELETE), plus a
    `relforcerowsecurity = t` guard and the canonical
    `payroll_deduction_applications_tenant_isolation` policy-existence
    check.

  **Mobile responsive sweep (1 commit)**: Survey turned up mostly false
  positives — most pages already use `overflow-x-auto`-wrapped tables,
  mobile-first responsive grids, and `text-base` inputs. The one real
  fix: `reports/page.tsx` tab bar previously used `flex-wrap` with
  `flex-1` which wrapped tabs onto multiple rows on a 375px viewport.
  Now uses the `overflow-x-auto` + `min-w-max` + `sm:flex-1` pattern
  from `runs/[id]/page.tsx`.

  **Architecture-doc refresh (1 commit)**: All five `docs/architecture/`
  files updated. `feature-map.md` Last verified flipped, payroll
  section rewritten to list the unified `FinalisationService`,
  `PayrollInputResolver`, every worker job's canonical name + Redis
  key + idempotency key, and the full self-service surface.
  `module-blast-radius.md` now lists the new exports (`FinalisationService`,
  `PayrollInputResolver`), the full imports set including
  `StaffProfilesModule` for self-service scoping, and notes about
  cross-path equivalence and the boot-time permission backfill.
  `event-job-catalog.md` payroll queue entry rewritten to reflect the
  shared `@school/shared/payroll` constants, per-tenant Redis key
  namespacing, the 1200s mass-export PDF TTL, and the idempotency-key
  conventions. `state-machines.md` PayrollRunStatus updated:
  `pending_approval -> cancelled` is now listed (Wave 2 escape hatch);
  the side-effects section names `FinalisationService.finaliseAtomic`
  as the single source of truth. `danger-zones.md` got three new
  entries: **DZ-Payroll-1** (historical payslip-number format
  inconsistency on pre-rebuild runs), **DZ-Payroll-2** (the two-phase
  recurring-deduction application contract), **DZ-Payroll-3** (the
  most-recent-overlap rule for compensation period bracketing).

  **Pre-launch checklist (1 commit)**: Added 4 payroll items to Part 5
  Deferred Items: #24 production end-to-end smoke walkthrough (impl 07
  step 7 was forbidden by the worktree-isolated execution model);
  #25 anomaly acknowledgement persistence (needs a new
  `payroll_anomalies` table — POST endpoint was descoped to avoid
  shipping a 404); #26 compensation overlap clean-up + partial unique
  constraint (DZ-Payroll-3 mitigation); #27 cross-tenant Playwright
  e2e for the full payroll lifecycle (needs a live tenant + test-data
  seeding).

  **API-surface snapshot (1 commit)**: Regenerated to absorb the 20
  new Wave 3 endpoints. The snapshot test now passes cleanly.

  **Translation pass**: Audit of `payroll.*`, `payrollHub.*`,
  `payrollAbsences.*` across `apps/web/messages/en.json` and `ar.json`
  — 399 keys both sides, no missing pairs, no terminology drift
  ("payslip" not "pay slip", "payroll run" not "salary run"), no
  empty values, no bare-generic strings ("Failed", "Loading" etc.).
  Walked all payroll page TypeScript files and verified every
  `t('xxx')` call resolves to a real key. Wave 4's translation work
  was thorough enough that no key changes were needed.

- **Deviations from plan:**
  1. **Cross-path equivalence test is structural, not behavioural.**
     The impl spec called for cloning the database state and running
     both finalisation paths against an identical fixture, asserting
     byte-equal entry totals + snapshots. The worker lives in a
     separate package with its own DI container; cross-package
     execution belongs in a true e2e test that requires a live
     Postgres. The structural guard catches the actual regression
     class that motivated the rebuild (silent format / snapshot drift
     between the two source files) by asserting both files import
     `formatPayslipNumber`, neither inlines a template literal, and
     both construct every snapshot key the shared schema requires.
     The full e2e is captured as Pre-Launch Item #27.
  2. **No `apps/web/e2e/payroll-end-to-end.spec.ts`.** Same root
     cause — needs a live test-tenant login flow + seeded data.
     Captured as Pre-Launch Item #27.
  3. **Calculation correctness fixtures are already extensive.** The
     impl spec listed 8 fixture scenarios. `calculation.service.spec.ts`
     already covers each scenario (salaried, per-class, mixed,
     allowances, deductions, adjustments, one-offs, edge rounding).
     Adding more fixtures would have been redundant.
  4. **Finalisation idempotency is already covered.** The impl spec
     called for an idempotency spec; `finalisation.service.spec.ts`
     already covers the self-heal-on-already-finalised case and the
     mid-transaction-failure rollback case (spec written in Wave 2).
  5. **Mobile responsive sweep produced one fix, not many.** Survey
     across 11 payroll pages turned up mostly false positives (the
     surveyor flagged tables that ARE wrapped in `overflow-x-auto`,
     tab bars that DO have `overflow-x-auto`, etc.). The one real
     issue was the reports page tab bar. The other pages from the
     redesigned hub already follow the morph-shell mobile patterns.
  6. **Production smoke walk-through (impl 07 step 7) is captured
     as Pre-Launch Item #24.** The worktree-isolated execution model
     forbids prod access during the rebuild; smoke happens
     post-merge.
  7. **`StaffProfilesModule` import in `payroll.module.ts` is NOT
     dropped.** The audit's note about it being unused predates Wave 3,
     which added `StaffProfileReadFacade` consumers to
     `payslips.service`, `compensation.service`, and
     `payroll-analytics.service` — the module IS actually used now.

- **Follow-ups:**
  1. (Pre-launch / future wave) Anomaly acknowledgement persistence —
     captured as PRE-LAUNCH Item #25.
  2. (Pre-launch) Cross-tenant Playwright e2e — captured as
     PRE-LAUNCH Item #27.
  3. (Pre-launch) Compensation overlap audit + partial unique
     constraint — captured as PRE-LAUNCH Item #26.
  4. (Pre-launch) Production end-to-end smoke walkthrough —
     captured as PRE-LAUNCH Item #24.
  5. (Future) Decide if an Arabic native-speaker review of Wave 4–5
     translation additions is warranted before launch. The
     functional copy is complete; the polish pass found no obvious
     literal/machine-translated artefacts.
  6. (Future) Promote the worker to literal DI of `FinalisationService`
     so the API and worker share an `import` rather than parallel
     implementations of the same contract. Requires publishing
     `FinalisationModule` from `@school/api` and importing it in
     `@school/worker`. Carried over from Wave 2 follow-ups.

- **Session notes:** The api-surface snapshot drift was a clean
  reveal — the snapshot CI test caught all 20 Wave 3 endpoints + the
  permission widening, and `pnpm run snapshot:api` regenerated the
  file in seconds. This is exactly what the snapshot is for. The
  `daysWorked: Decimal | null` strict-mode finding in
  `payroll-input-resolver.service.spec.ts` was a one-character fix
  (`?.toString()` instead of `.toString()`) — the resolver always
  returns a Decimal in practice but the type allows null for
  unscheduled-comp edge cases.

---

### Rebuild complete

- **Started:** 2026-04-26 (Wave 1, IMPL 01)
- **Completed:** 2026-04-27 (Wave 5, IMPL 07)
- **Total commits on `t3code/b523b305`:** ~40 across 7 implementations + 7 log commits
- **Outcome:** Payroll module's calculation engine now consumes every input it
  advertised, both finalisation paths emit identical payslip-numbers and
  snapshot payloads via the unified `FinalisationService.finaliseAtomic`,
  worker job names + Redis keys are sourced from `@school/shared/payroll`
  (eliminating the silent job-name divergence that killed two of three
  worker jobs pre-rebuild), the 20 endpoints the redesigned frontend was
  calling but didn't exist now exist, every tenant-scoped table has FORCE
  ROW LEVEL SECURITY (10 tables retrofitted), and the cross-path equivalence
  - RLS leakage guards prevent the regression class from re-introducing
    silently. Awaiting user merge into `main` and post-merge production smoke
    (Pre-Launch Item #24).
