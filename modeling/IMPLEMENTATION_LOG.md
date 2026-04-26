# Budgeting & Analysis ("Modeling") — Implementation Log

> **What this is:** The single source of truth for the Modeling rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.

---

## 1. Work summary (read this first)

The Finance hub today shows a "coming soon" tile for **Budgeting & Analysis** (`apps/web/src/app/[locale]/(school)/finance/page.tsx` HUB_CARDS, key `budgeting`, href `/finance/budgeting`, comingSoon: true). Clicking it lands on a placeholder page (`apps/web/src/app/[locale]/(school)/finance/budgeting/page.tsx`) with three teaser cards — Forecasting, Variance Analysis, Department Costs. Nothing is wired.

This rebuild promotes the placeholder into a full sub-module that handles **two distinct workspaces** under one roof:

1. **Annual Financial Models** — driver-based revenue & expenditure forecasts over 1 / 3 / 5-year horizons. Base case + up to 3 alternative scenarios. Variance-tracked against the live Finance and Payroll modules' actuals. Snapshots on publish. Three output channels: PDF board pack, read-only shareable URL, Excel.
2. **Event & Trip Budgets** — lightweight standalone calculators for trips / fundraisers / sports days / capital purchases. Per-student / per-household / total / breakeven. Optionally pushes fees end-to-end into the existing Finance module via a transactional cross-module integration.

The two workspaces share a driver engine, scenarios primitive, snapshot mechanism, and design language — but they're separate first-class entities because their inputs, outputs, time horizons, and audiences are genuinely different.

**See `PLAN.md` for full scope** — the 11 canonical drivers, scenario semantics, line-item sources (driver-derived / custom / override / locked), snapshot lifecycle, variance materialisation, trip→fee integration permission stack, and component map.

**See `implementations/NN-*.md` for per-phase specs.**

**Scope of the rebuild (21 implementations, 5 waves):**

- **Wave 1 — Foundation:** schema for all new tables (financial_models, scenarios, financial_model_line_items, financial_model_snapshots, event_budgets, event_budget_scenarios, variance_cache, shareable_links, budgeting_tenant_preferences), RLS policies, permission seeding, shared types.
- **Wave 2 — Backend core:** driver engine in shared package, financial-models + scenarios services, line-items service, snapshots service, variance service, event-budgets services.
- **Wave 3 — Backend integrations:** variance-refresh worker, export pipeline (PDF + Excel + board-pack worker), trip→fee integration service, shareable-links service + cleanup worker.
- **Wave 4 — Frontend:** hub landing + lists, financial model workspace, scenario compare view, variance dashboard, snapshots/version history UI, event budget workspace, trip→fee generation flow UI, shareable link UI + public read-only view, outputs UI + settings.
- **Wave 5 — Polish:** translations, mobile, a11y, smoke tests, feature-map + architecture docs.

**Untouched by this rebuild:**

- Existing Finance module (invoicing, payments, fee structures, refunds, statements) — consumed via read-only `FinanceReadFacade` for variance, and one write call to `FeeAssignmentsService.bulkCreate()` for trip→fee generation. Otherwise unchanged.
- Existing Payroll module — consumed via read-only `PayrollReadFacade` for staff-cost variance. Unchanged.
- Recharts stays as the charting library. No new charting library.
- The Morphing Shell + sub-strip pattern from `docs/plans/ux-redesign-final-spec.md` is the navigation contract.
- AI infrastructure (`AnthropicClientService`, `tenant_ai_flags`, `ai_logs`) is **untouched** — AI features for budgeting are explicitly out of v1 scope; the architecture is AI-ready (structured drivers, immutable snapshots, materialised variance) but no Anthropic-backed surfaces ship in this rebuild.

---

## 2. Rules every session must follow

> **If another implementation in your wave is currently `in-progress` or `deploying`, §2a (Rules 17–26) is mandatory reading before you touch any code.** Those rules distil parallel-run failure modes and exist to stop the next wave from losing a deploy cycle to the same thrash.

**Rule 1 — Read this file before starting any implementation.** The whole thing. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; deployments serialise when they share a service restart target.** Deploy order is **first-come-first-served, not by implementation number**. If you're running task 14 and it finishes coding before task 12, task 14 deploys first. Before entering the deploy phase, re-read the log; if another implementation in your wave is currently `deploying` AND shares a service restart target (API / worker / web — consult §3's deployment matrix), wait (poll every 3 minutes) until it flips to `completed`, then proceed. If it doesn't share a restart target, you can deploy concurrently without conflict.

**Rule 5 — Deploy via direct rsync to production. Local gauntlet runs first.** Every phase follows this release flow:

1. Local gauntlet — `pnpm turbo run type-check`, `pnpm turbo run lint`, `pnpm turbo run test --filter=<affected packages>`, plus the AppModule DI smoke (see Rule 6) when module wiring changes.
2. Commit locally (conventional commit format — `feat(budgeting): ...`, `fix(budgeting): ...`, etc.). Do NOT push to GitHub mid-flight; the deploy route is rsync.
3. Rsync the working tree to production (`rsync -avz --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' /Users/ram/Desktop/SDB/ root@46.62.244.139:/opt/edupod/app/`).
4. SSH in, `chown -R edupod:edupod /opt/edupod/app/`, run any migrations needed (`pnpm db:migrate && pnpm db:post-migrate` for schema phases), build the affected workspaces, restart the relevant PM2 processes (`pm2 restart api`, `pm2 restart worker`, `pm2 restart web` per the matrix in §3).
5. Verify the deploy landed — `/api/health` → 200, smoke test the specific surface the phase touched.
6. Push your commit to GitHub at the END of the phase (after deploy is verified) — the push is a backup / sync, not the deploy mechanism. **Never mix deploy routes** (per project memory): once a commit has been rsynced, do not also push it through GitHub CI as a deploy.
7. Record the commit SHA and the rsync deployment timestamp in the completion record.

**Rule 6 — Run the AppModule DI smoke when wiring changes.** When you add a service constructor dep, change a module's `imports`/`exports`/`providers`, or wire a new BullMQ queue, run the verification from `CLAUDE.md`:

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
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Fix any failures BEFORE rsyncing. A broken DI graph in production is significantly worse than a 30-second wait locally.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the production commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before deploying. Do NOT deploy a breaking change and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** Highest-priority rules for this rebuild:

- RLS on every new tenant-scoped table: `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirror into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware. No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write. The sequential `$transaction([...])` API is prohibited (PgBouncer transaction-mode incompatibility).
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception.
- Zod schemas live in `@school/shared`; DTOs inferred from them.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`. ZERO TOLERANCE.
- `react-hook-form` + `zodResolver` for every new form.
- Co-located `.spec.ts` files next to source. Every tenant-scoped table needs an RLS leakage test.
- The single permitted `as unknown as PrismaService` cast lives inside `createRlsClient(...).$transaction()` — nowhere else.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code that another in-flight session might own. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — Trip → Fee integration writes through `FeeAssignmentsService`. No direct DB writes into invoicing tables.** The integration service `BudgetingTripFeeIntegrationService` is the ONLY place in the budgeting module that mutates Finance state. It does so by calling `FeeAssignmentsService.bulkCreate()` inside one `createRlsClient(...).$transaction()`. Any other path is a violation of cross-module boundaries and a permission-bypass risk.

**Rule 12 — Permission gating for fee generation is layered.** The "Generate fees" button on a trip requires `budgeting.view` AND `budgeting.generate_fees` AND `finance.manage`. The frontend hides the button when any of these is missing; the backend re-checks at request time. Do NOT skip the backend re-check.

**Rule 13 — Architecture docs must be updated when your implementation changes the shape.** Per `.claude/rules/architecture-policing.md`: if you add cross-module dependencies update `docs/architecture/module-blast-radius.md`; if you add a BullMQ job update `event-job-catalog.md`; if you add a state machine update `state-machines.md`. These are not optional; treat them the same as failing tests.

**Rule 14 — Feature map update is deferred to the last phase.** Do not touch `docs/architecture/feature-map.md` during individual implementations. Phase 21 (polish) is responsible for a single coherent update at the end of the rebuild. This is per `.claude/rules/feature-map-maintenance.md`.

**Rule 15 — Every destructive change gets a rollback note.** If an implementation renames a table, drops a column, removes an endpoint, or deletes a permission, record in §5 the exact `git revert <sha>` command and any manual DB rollback that would be needed. The owner relies on this log to recover.

**Rule 16 — Production is a live test environment for the NHQS and stress-test tenants, not end users.** Treat failures as high-priority but not catastrophic. Fix forward with a new commit; do not roll back unless a migration genuinely needs reversing. The production tenants are test accounts per project memory (until August 2026).

---

## 2a. Parallel-execution hygiene

These rules exist because parallel sessions editing the same working tree have, in past rebuilds, lost full deploy cycles to the failure modes below. Read and follow them every time more than one implementation in a wave is `in-progress` simultaneously.

**Rule 17 — Declare shared-file ownership up front.** The first session in a wave that needs to edit a cross-impl shared file (examples in this rebuild: `apps/api/src/modules/budgeting/budgeting.module.ts`, `apps/api/src/app.module.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/base/cron-scheduler.service.ts`, `packages/prisma/schema.prisma`, `packages/prisma/rls/policies.sql`, `packages/shared/src/budgeting/index.ts`, `apps/web/src/app/[locale]/(school)/finance/budgeting/page.tsx`, `apps/api/package.json`, `pnpm-lock.yaml`) announces that ownership by appending a one-line note to §5 of the log **before writing any code**:

```
### [WAVE N SHARED-FILE CLAIM] — impl NN
- Claims: apps/api/src/modules/budgeting/budgeting.module.ts
- Claims: apps/worker/src/base/cron-scheduler.service.ts
- Until: committed OR flipped to `🛑 blocked`
```

Other impls in the same wave that need to edit a claimed file MUST NOT do so concurrently. They wait for the owner's commit, pull, then layer their hunks on top as a fix-forward. If a claim blocks you for more than 10 minutes, flip your own row to `🛑 blocked` and leave a note naming the owner.

**Rule 18 — Never commit a reference to a file that is not in the same commit.** Before pushing, audit every `import` added by your commit: if the imported file is not in the commit (either new or already on `main`) the commit will break the next session that pulls. Concrete check:

```bash
# for every staged file, list newly-added relative import targets
git diff --cached --name-only -- '*.ts' '*.tsx' | xargs -I{} grep -H "^import .* from '\./" {} \
  | while read line; do
    rel=$(echo "$line" | sed -E "s|.*from '(\./[^']+)'.*|\1|")
    # verify each rel path is either staged or already committed
  done
```

**Rule 19 — Lockfile edits are mechanical, never manual.** `pnpm-lock.yaml` is only ever updated by running `pnpm install` locally after a `package.json` change. Never hand-edit the lockfile. Never commit a "lockfile sync" commit in isolation — always pair it with the `package.json` delta it corresponds to. If two impls add different deps in overlapping edits, the later session runs `pnpm install` once, verifies all new deps resolve, and commits the lockfile together with its own `package.json` change in the same commit.

**Rule 20 — Never `git checkout HEAD -- <shared-file>` while another impl is active.** A raw checkout silently overwrites another session's unstaged work and triggers a thrash loop. Instead:

1. Use targeted `Edit` operations to remove only the lines you own.
2. If you need a clean slate, `git stash` your changes (not checkout), take a diff against HEAD, and re-apply your hunks explicitly.
3. If the shared file has diverged in a way you cannot surgically undo, flip to `🛑 blocked` and coordinate with the owning session via §5 notes.

**Rule 21 — Spec files (`*.spec.ts`) have a single owner per wave when shared.** If a spec file aggregates mocks for multiple impls (rare in this rebuild but possible for `budgeting.module.spec.ts` if it ends up testing multiple sub-services together), the wave's first impl to touch it claims it under Rule 17. Other impls **do not edit the spec directly**; they leave a note in §5 naming the provider / mock they need added, and the owning session folds those additions into its next commit on that file.

**Rule 22 — Re-fetch and re-verify `HEAD` before every commit.** Between the time you ran `git status` and the time you run `git commit`, another session may have pushed and your local `HEAD` may be stale. Before every commit:

```bash
git fetch origin main
git log --oneline origin/main..HEAD
```

If `origin/main` has moved and you are not on top of it, rebase (`git rebase origin/main`) and re-run the local gauntlet before deploying.

**Rule 23 — Each impl owns the coverage of its own files.** The global threshold in `apps/api/jest.config.js` is a shared floor. If an impl introduces files that fall below the per-file target, that impl must add tests for them before deploying — do not rely on the next session to backfill.

**Rule 24 — The pre-push hook is a floor, not a gate to bypass.** If the Husky pre-push `test:coverage` hook fails, the correct response is to add tests, not to push with `--no-verify`. The only acceptable use of `--no-verify` is when the coverage drag is caused by code already on `main` from another impl AND your own commit is verified locally — and even then, the completion record in §5 must name the drag and the owning impl.

**Rule 25 — Re-read §4 before every deploy.** Another session may have flipped to `completed` / `deploying` / `🛑 blocked` while you worked. Your deploy-serialisation decision (Rule 4) depends on the status **at deploy time**, not on what you read when you started. If §4 shows a sibling in `deploying` that shares your service restart target, poll every 3 minutes until it clears — even if your code is ready to push.

**Rule 26 — When in doubt, shrink the commit.** If the tree has diverged from your mental model because of parallel edits, the safe recovery is to commit only your new files (under `apps/api/src/modules/budgeting/<impl-owned-folder>/` or equivalent) and leave the shared-file edits unstaged. Let the shared-file changes ride in the next session's commit once ownership is clear.

**Rule 27a — Playwright verification is mandatory before flipping a row to `completed`.** Endpoint smoke tests (curl, DB checks, PM2 logs) are NOT sufficient. Every implementation must additionally drive the relevant UI surface (or a real authenticated API request that mirrors what the UI will do) through Playwright and capture:

- For backend impls (01–11): a Playwright run that authenticates as `owner@nhqs.test`, hits the new endpoint(s) via `browser_evaluate(() => fetch('/api/v1/...'))` or via a UI surface that exists, and confirms a real response (real data shape, not 404 / not error). Backend impls without a UI surface yet (impls 02–11) MUST drive the request through `browser_evaluate` after authenticating, not via `curl` — the goal is to prove the route works through the same cookie/auth path the eventual UI will use.
- For frontend impls (12–21): a Playwright run that loads the page, captures `browser_console_messages(level: 'error')`, asserts no errors, and snapshots key UI elements (KPI cards visible, drivers drawer opens, scenario compare renders, variance table populated, trip generate-fees modal opens, etc.).
- A short `## Playwright verification` block in the §5 completion record listing: pages/endpoints covered, any console errors observed, and the timestamp the run completed. Per memory: cap Playwright verification at ~20 minutes; spot-check, then move on.
- **Per memory:** delete any screenshot files created during verification before committing — keep the branch clean.

**Rule 27b — Only one session may run Playwright at a time. Sessions queue via a log claim.** Playwright's MCP wrapper holds a single browser context per host and serialises poorly across sessions. Before invoking ANY `mcp__plugin_playwright_playwright__*` tool, append a one-line claim to §5 of the log:

```
### [PLAYWRIGHT LOCK] — impl NN (or "verification-walkthrough")
- Holder: <session purpose>
- Started: <ISO timestamp>
- Until: released by closing the browser AND appending a follow-up release line
```

Before you write that claim, scan §5 for the most recent `[PLAYWRIGHT LOCK]` entry. If it has no matching `[PLAYWRIGHT RELEASED]` line below it, the lock is held by another session — STOP, do not invoke Playwright tools, and either:

1. Wait (poll §5 every 3 minutes until the release line appears), or
2. Defer the verification step and flip your row to `🛑 blocked — waiting on Playwright lock`.

After your Playwright run completes, append:

```
### [PLAYWRIGHT RELEASED] — impl NN (or "verification-walkthrough")
- Holder: <same purpose as claim>
- Released: <ISO timestamp>
- Browser closed: yes
```

Hold the lock for ≤ 30 minutes. If your verification needs longer, release at the natural break point and re-claim.

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND deploy on a first-come-first-served basis — **not** in implementation-number order. Deployment only serialises (polling every 3 minutes) when another sibling is already `deploying` **and** shares a service restart target (API / worker / web, per the matrix below).

| Wave       | Implementations                    | Hard dependency | Rationale                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01                                 | None            | Schema foundation — every new table lands in one coordinated migration. Must complete before any backend or frontend work.                                                                                                                                                                  |
| **Wave 2** | 02, 03, 04, 05, 06, 07             | Wave 1 complete | Backend core. Driver engine (shared TS), services (financial-models + scenarios + line-items + snapshots + variance + event-budgets). All touch the API; deploys serialise on `pm2 restart api`. Driver engine deploys on web/api/worker simultaneously since it ships in `@school/shared`. |
| **Wave 3** | 08, 09, 10, 11                     | Wave 2 complete | Backend integrations. Variance worker, export pipeline + board-pack worker, trip→fee integration, shareable links + cleanup worker. Mixed restart matrix (API + worker).                                                                                                                    |
| **Wave 4** | 12, 13, 14, 15, 16, 17, 18, 19, 20 | Wave 3 complete | Frontend. Hub + lists, financial model workspace, scenario compare, variance dashboard, snapshots UI, event budget workspace, trip→fee UI, shareable link UI + public view, outputs UI. All deploy with `pm2 restart web`.                                                                  |
| **Wave 5** | 21                                 | Wave 4 complete | Polish. Translations, mobile, a11y, smoke tests, feature-map, docs. Single implementation.                                                                                                                                                                                                  |

### Deployment targets per implementation

This matrix is what you consult before deploying. "Who restarts" determines the serialisation rule.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ✅             | ✅          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ✅          | ❌             | ❌          |
| 05   | ❌        | ✅          | ❌             | ❌          |
| 06   | ❌        | ✅          | ❌             | ❌          |
| 07   | ❌        | ✅          | ❌             | ❌          |
| 08   | ❌        | ❌          | ✅             | ❌          |
| 09   | ❌        | ✅          | ✅             | ❌          |
| 10   | ❌        | ✅          | ❌             | ❌          |
| 11   | ❌        | ✅          | ✅             | ❌          |
| 12   | ❌        | ❌          | ❌             | ✅          |
| 13   | ❌        | ❌          | ❌             | ✅          |
| 14   | ❌        | ❌          | ❌             | ✅          |
| 15   | ❌        | ❌          | ❌             | ✅          |
| 16   | ❌        | ❌          | ❌             | ✅          |
| 17   | ❌        | ❌          | ❌             | ✅          |
| 18   | ❌        | ❌          | ❌             | ✅          |
| 19   | ❌        | ❌          | ❌             | ✅          |
| 20   | ❌        | ❌          | ❌             | ✅          |
| 21   | ❌        | ❌          | ❌             | ✅          |

Impl 02 (driver engine) restarts everything because it ships in `@school/shared`, which the API, worker, and web all consume.

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                                               | Wave | Depends on     | Status    | Completed at | Commit SHA |
| --- | ------------------------------------------------------------------- | ---- | -------------- | --------- | ------------ | ---------- |
| 01  | Schema foundation                                                   | 1    | —              | `pending` | —            | —          |
| 02  | Driver engine (pure-TS calculation library + canonical drivers)     | 2    | 01             | `pending` | —            | —          |
| 03  | Financial Models + Scenarios services                               | 2    | 01, 02         | `pending` | —            | —          |
| 04  | Line Items service                                                  | 2    | 01, 02         | `pending` | —            | —          |
| 05  | Snapshots service                                                   | 2    | 01, 02         | `pending` | —            | —          |
| 06  | Variance service                                                    | 2    | 01, 02         | `pending` | —            | —          |
| 07  | Event Budgets services                                              | 2    | 01, 02         | `pending` | —            | —          |
| 08  | Variance Refresh worker                                             | 3    | 01, 06         | `pending` | —            | —          |
| 09  | Export pipeline (PDF + Excel + Board Pack worker)                   | 3    | 01, 03, 04, 05 | `pending` | —            | —          |
| 10  | Trip → Fee Integration service                                      | 3    | 01, 07         | `pending` | —            | —          |
| 11  | Shareable Links service + cleanup worker                            | 3    | 01, 05         | `pending` | —            | —          |
| 12  | Budgeting Hub landing + list pages                                  | 4    | 01, 03, 07     | `pending` | —            | —          |
| 13  | Financial Model Workspace UI                                        | 4    | 01, 02, 03, 04 | `pending` | —            | —          |
| 14  | Scenario Compare View                                               | 4    | 01, 03         | `pending` | —            | —          |
| 15  | Variance Dashboard view                                             | 4    | 01, 06, 08     | `pending` | —            | —          |
| 16  | Snapshots & Version History UI                                      | 4    | 01, 05, 09     | `pending` | —            | —          |
| 17  | Event Budget Workspace UI                                           | 4    | 01, 02, 07     | `pending` | —            | —          |
| 18  | Trip → Fee Generation Flow UI                                       | 4    | 01, 07, 10     | `pending` | —            | —          |
| 19  | Shareable Link UI + Public Read-Only Snapshot View                  | 4    | 01, 05, 11     | `pending` | —            | —          |
| 20  | Outputs UI (PDF / Excel triggers + Settings page)                   | 4    | 01, 09, 11     | `pending` | —            | —          |
| 21  | Polish — translations, mobile, a11y, smoke tests, feature-map, docs | 5    | 12–20          | `pending` | —            | —          |

"Depends on" lists the minimum set that must be `completed` before this one can start. In strict wave order these are satisfied automatically — the column exists so a future automation (and the human) can double-check.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Commit:** <sha>
- **Deployment route:** rsync (per Rule 5)
- **Deployed at:** <ISO timestamp>
- **Production verification:** /api/health → 200, <surface-specific smoke summary>
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Rollback:** exact `git revert` command + any manual DB rollback if reverting.
- **Playwright verification:** pages/endpoints covered, any console errors observed, run timestamp.
- **Session notes (optional):** anything weird or surprising.
```

For shared-file ownership claims (Rule 17), use:

```
### [WAVE N SHARED-FILE CLAIM] — impl NN
- Claims: <file path>
- Until: committed OR flipped to `🛑 blocked`
```

For Playwright lock (Rule 27b), use the formats described in §2a.

For blocked work, use:

```
### [IMPL NN] — 🛑 BLOCKED
- **Blocked at:** <ISO timestamp>
- **What I tried:** <description>
- **What I need:** <description>
- **Files left in dirty state:** <list, or "none">
```

<!-- ─── Append records below this line ─── -->
