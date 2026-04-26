---
description: 'Execute a specific implementation from the Modeling rebuild (Budgeting & Analysis sub-module). Reads the implementation log, validates prerequisites, executes the work, commits, pushes to GitHub, watches CI, runs Playwright verification, and logs completion. Server access is granted for diagnostics only — all deploys go through GitHub CI. Usage: /modeling 03'
---

# Modeling Rebuild — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Modeling rebuild. This is a 21-phase, 5-wave rebuild that turns the "coming soon" Budgeting & Analysis tile in the Finance hub into a full sub-module — annual financial models with driver-based forecasting, base case + 3 alternative scenarios, full variance tracking against live finance/payroll actuals, snapshot-versioned publishing, PDF/Excel/shareable-URL outputs, and a separate lightweight event/trip budget workspace that can push fees end-to-end into the Finance module. The rebuild is documented in `modeling/PLAN.md` and orchestrated via `modeling/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`modeling/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, deployment matrix, parallel-execution hygiene, and completion status for every implementation. Read the whole thing — both the baseline rules (1–16) and the parallel-execution rules (17–27b).
2. **`modeling/PLAN.md`** — the master plan explaining the two-workspace separation (financial models vs event budgets), the 11 canonical drivers, the scenario shape (base + 3 alternatives), the line-item sources (driver-derived / custom / override / locked), the snapshot lifecycle, the variance materialisation, the trip→fee integration permission stack, and the component map. Essential for understanding what you're building and why.
3. **`modeling/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=03` matches `03-financial-models-and-scenarios-service.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites (poll every 30 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `modeling/IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — only the deploy step serialises, and CI handles that automatically (see Step 6).

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `modeling/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup (or equivalent). Do not busy-loop, do not sleep in short bursts, do not set a timeout — the loop continues until the prerequisites complete OR one flips to `🛑 blocked` OR the user interrupts.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 2.
5. If a prerequisite flips to `🛑 blocked` at any point during the wait, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

Each poll must re-read the log file fresh (the file may have been updated by another session in parallel).

**In-wave siblings are NOT a reason to wait at Step 1.** If implementation 03 and 04 are both in Wave 2 and 04 is already `in-progress` when you start 03, proceed immediately to Step 2 and code 03 in parallel with 04. The wave model assumes parallel coding — serialisation only happens at the deploy step.

If all cross-wave prerequisites are satisfied, continue immediately.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths, endpoint names, and service signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task. Commit this log update as a separate commit and push it immediately so other sessions and `origin/main` see the claim:

```bash
git add modeling/IMPLEMENTATION_LOG.md
git commit -m "docs(budgeting): mark implementation $ARGUMENTS as in-progress"
git push origin main
```

If your implementation involves shared files (per Rule 17 in §2a — `apps/api/src/modules/budgeting/budgeting.module.ts`, `apps/api/src/app.module.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/base/cron-scheduler.service.ts`, `packages/prisma/schema.prisma`, `packages/prisma/rls/policies.sql`, `packages/shared/src/budgeting/index.ts`, `apps/web/src/app/[locale]/(school)/finance/budgeting/page.tsx`, `apps/api/package.json`, `pnpm-lock.yaml`), append a SHARED-FILE CLAIM block to §5 in the same log update — claim every shared file you intend to edit. This serialises your work with siblings in the wave.

A docs-only push is a fast CI run (mostly cache hits). If `git push` rejects because a sibling pushed first, run `git pull --rebase origin main` and try again — the log update is small and rebases cleanly.

## Step 4 · Execute the implementation

Before writing any code:

1. Re-read your implementation file's "What to change" section. List the files you will create or modify mentally — these are your conflict zones with sibling sessions.

2. Plan your commit cadence. The implementation file's sub-steps define natural commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, shell, seeds, module registration) commit LAST in one final commit.

3. Follow these rules at every commit:
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:

     ```bash
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If your sub-step involves translations, re-read `apps/web/messages/en.json` and `apps/web/messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 8 after the deploy is verified.

4. Run the implementation file's recipe. Commit after each sub-step that produces a working state — but do NOT push intermediate commits. Push happens once at Step 6.

5. Before entering Step 5 (the final commit), do ALL shared-file edits that you deferred. This is the minimum-exposure window.

Follow `CLAUDE.md` rules and `.claude/rules/*` at all times. Highest-priority rules for this rebuild:

- RLS on every new tenant-scoped table: `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirror into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware. No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write. The sequential `$transaction([...])` API is prohibited.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented `PrismaService` RLS-transaction exception.
- Zod schemas live in `@school/shared/budgeting`; DTOs inferred from them.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`. ZERO TOLERANCE.
- `react-hook-form` + `zodResolver` for every new form.
- Co-located `.spec.ts` files next to source. Every tenant-scoped table needs an RLS leakage test.
- **Trip → Fee writes go through `FeeAssignmentsService.bulkCreate()` only.** No direct DB writes from the budgeting module into invoicing tables. The integration service is the single permitted cross-module write path.
- **Trip fee generation requires three permissions** (`budgeting.view` AND `budgeting.generate_fees` AND `finance.manage`). Frontend hides the button when missing; backend re-checks at request time.
- **The driver engine in `@school/shared/budgeting/engine.ts` is pure-TS, dependency-free.** Backend and frontend run identical code. Do not introduce IO inside it.
- **Snapshots are immutable.** Once a `financial_model_snapshot` row is written, only `pdf_object_key` / `excel_object_key` / `rendered_at` may be updated (by the board-pack worker).
- **Public shareable-link payload scrubs PII.** No household-level / student-level / staff-salary detail leaks to the open route.

Run the local gauntlet before committing:

```bash
pnpm turbo run type-check --filter=@school/<affected>
pnpm turbo run lint --filter=@school/<affected>
pnpm turbo run test --filter=@school/<affected>
```

If `CLAUDE.md`'s "Module Registration — Verify DI Before Pushing" applies (you added a new service constructor dep, changed module `imports`/`exports`/`providers`, or wired a new BullMQ queue), run the AppModule DI smoke per Rule 6 in `IMPLEMENTATION_LOG.md`. Fix any failures before pushing — DI errors caught locally save a CI round-trip.

## Step 5 · Commit locally (no push yet)

When the implementation is complete and tests pass, finalise the last code commit:

```bash
git status                                     # verify clean staging set
git add <list-of-your-files>                   # explicit pathspec only
git commit -m "feat(budgeting): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the modeling rebuild.
See modeling/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

Conventional-commit prefix: `feat(budgeting):` for backend / cross-module work, `feat(web):` for frontend-only phases, `feat(prisma):` for schema-only commits. `fix(...)`, `refactor(...)`, `docs(...)` as appropriate.

You may have several commits stacked locally from Step 4's sub-step cadence — that's fine. They all ship together at Step 6.

## Step 6 · Push to deploy (the only sanctioned deploy route)

**`git push origin main` is the only way to deploy.** GitHub Actions runs `.github/workflows/ci.yml` (parallel lint / type-check / unit + integration tests / build) → `scripts/deploy-production.sh` (pg_dump backup, Prisma migrations + post-migrate SQL, rebuild, PM2 restart, smoke tests, auto-rollback on failure). Direct rsync + SSH deploys are retired. SSH is for diagnostics only.

### 6a · Pre-push branch-state check

Before pushing, inspect what you're about to ship:

```bash
git fetch origin main
git log --oneline origin/main..HEAD
```

For each commit in the output, identify whether it's yours. For each non-yours commit, run `git show --stat <sha>` and verify:

- It looks like a complete, intentional sibling-session commit.
- It is NOT a sweep-up of mixed working trees (e.g. files from your own area mixed with files you don't recognise).

If anything looks suspicious — STOP and investigate before pushing.

If `git log origin/main..HEAD` is empty, you're already even with origin (rebase ate your commits, or you forgot to commit). Investigate.

### 6b · Sibling CI check (optional but recommended)

If a sibling session pushed just before you, their CI run may already be in flight. Check:

```bash
gh run list --workflow=ci.yml --branch=main --limit 3
```

If a sibling run is `in_progress` or `queued`, you have two choices:

- **Push anyway.** GitHub's `concurrency: production-deploy` group serialises the deploy step automatically — your push queues behind theirs. The risk: if theirs fails and rolls back, your deploy lands on top of the rolled-back state. Usually harmless; occasionally needs a re-deploy.
- **Wait for their run to finish green, then push.** Cleaner attribution. Recommended for impl 01 (schema), impl 02 (driver engine — touches `@school/shared` so all three apps rebuild), or any impl with a wide blast radius.

For routine in-wave coordination, push and let CI handle it.

### 6c · Push and watch

```bash
git push origin main
gh run watch
```

`gh run watch` blocks until the run finishes. The deploy job is the last step; CI green means the deploy script ran and smoke tests passed. While it runs, do not start another impl in the same session — a clean reading of the result keeps the audit trail simple.

### 6d · On failure

If any CI job fails:

```bash
gh run view --log-failed
```

Read the failed log. Fix forward — never bypass CI by rsync. Common failures and fixes:

- Lint / type-check / unit test red → fix locally, commit with explicit pathspec, push again.
- Integration test red → check whether it's yours or a flake. Re-run only after ruling out a real regression.
- `deploy-production.sh` red → it auto-rolls back; read the smoke-test output and the deploy-script log. Common causes: missed env var, schema migration drift, BullMQ queue name typo, module registration forgotten, RLS not applied. Fix forward.
- Schema migration failed → DO NOT touch `migrate:dev` to "fix" drift; that resets the database. Fix the migration SQL or `packages/prisma/rls/policies.sql`, commit, push.

Each fix is a new commit on top, then another `git push origin main` and `gh run watch`.

## Step 7 · Verify in production (smoke + Playwright)

After CI green, the smoke tests in `deploy-production.sh` already passed at the health-endpoint level. Two further checks before flipping to `completed`:

### 7a · Functional smoke

The implementation file's "Post-deploy verification" section has the specific smokes for that impl. Run them all. Common patterns:

- **API impl:** hit the new endpoints with `curl` against `nhqs.edupod.app` (use a saved auth token for `owner@nhqs.test`). The `/api/v1` prefix is mandatory.
- **Worker impl:** trigger a job via the API or wait for the next cron tick; SSH and `pm2 logs worker --lines 200` to confirm the processor registered and ran.
- **Frontend impl:** navigate to the affected page in a browser; verify no 404s in network and no errors in console.
- **Schema impl (impl 01):** SSH and `psql`; check `\dt` for the 9 new tables and `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('financial_models', ...)` to confirm RLS policies.

### 7b · Playwright verification (Rule 27a — mandatory before flipping to completed)

Endpoint smoke alone is insufficient. Drive the relevant UI surface (or a real authenticated `browser_evaluate` request) through Playwright.

- **Backend-only impls:** authenticate as `owner@nhqs.test` and call the new endpoints via `browser_evaluate(() => fetch(...))`.
- **Frontend impls:** load the page, capture `browser_console_messages(level: 'error')`, snapshot key UI elements.

Hold the Playwright lock per Rule 27b — append `[PLAYWRIGHT LOCK]` to §5 before invoking, append `[PLAYWRIGHT RELEASED]` after closing the browser. Cap verification at ~20 minutes; spot-check, then move on. **Delete any screenshot files created during verification before committing — keep the branch clean.**

If verification fails despite CI green, fix forward with a follow-up commit, push, watch CI, re-verify.

## Step 8 · Update the log — completion record (SEPARATE commit)

After deployment succeeds AND both functional smoke and Playwright verification pass:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns. The deployed SHA is the head of `origin/main` after your push — `git rev-parse origin/main`.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Deployment route:** GitHub CI (per CLAUDE.md)
- **Deployed at:** <ISO timestamp>
- **Production verification:** /api/health → 200, <surface-specific smoke summary>
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Rollback:** <exact `git revert <sha>` command + any manual DB rollback if reverting>
- **Playwright verification:** <pages/endpoints covered, console errors observed, run timestamp>
- **Session notes (optional):** <anything weird or surprising>
```

Commit this log update as a SEPARATE commit and push it:

```bash
git add modeling/IMPLEMENTATION_LOG.md
git commit -m "docs(budgeting): log completion of implementation $ARGUMENTS"
git push origin main
```

The log push triggers another CI run — that's expected, it's tiny and mostly cache hits. No need to `gh run watch` it; it's docs-only.

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Code commit: `<sha>`. Log commit: `<sha>`.
- Deployed to production via GitHub CI.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order within a wave).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one (e.g., new env var, new permission to grant, new admin action required, schema change rolled out so subsequent phases can rely on it).

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **`git push origin main` is the only deploy route.** Direct rsync to the production server is retired. SSH is diagnostics only — never for shipping code.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never overwrite the production `.env` file.** It's `.gitignore`d so CI can't ship it. If you need to add or rotate an env var on the server, ask the user.
4. **Never use `git add .` or `git add -A`.** Always explicit pathspec.
5. **Never push without the pre-push branch-state check.** `git fetch origin main` → `git log origin/main..HEAD` → `git show --stat <sha>` for each non-yours commit.
6. **Never bundle log updates with code commits.** Separate commits, every time.
7. **Never bypass CI by rsyncing.** Fix forward with another commit + push.
8. **Never run `migrate:dev` on the server.** It offers to reset the database on drift. CI's deploy script uses `migrate:deploy`.
9. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
10. **Never deploy without smoke testing AND Playwright verification.** Both are required before flipping to `completed`.
11. **Never mark an implementation completed if it didn't actually ship.** If CI failed and you couldn't recover, mark it `🛑 blocked` with a description.
12. **Never write directly into the Finance module's invoicing tables.** Trip → fee writes go through `FeeAssignmentsService.bulkCreate()` only — single, transactional, permission-stacked.
13. **Never expose household / student / staff-salary detail through the public shareable-link route.** PII scrub is a security invariant.
14. **Never bypass the driver engine.** All financial-model line items computed by drivers go through `runEngine`. All event-budget outputs go through `runEventEngine`. Frontend live-recompute uses the same code; drift between front and back is impossible by construction.
15. **Never re-introduce the legacy sidebar.** The morph-shell is the canonical layout for school-facing pages.
