---
description: 'Execute a specific implementation from the Modeling rebuild (Budgeting & Analysis sub-module). Reads the implementation log, validates prerequisites, executes the work, commits locally, deploys directly to production, and logs completion. Usage: /modeling 03'
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

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — only deployment serialises, and that wait is in Step 6, not here.

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `modeling/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup (or equivalent). Do not busy-loop, do not sleep in short bursts, do not set a timeout — the loop continues until the prerequisites complete OR one flips to `🛑 blocked` OR the user interrupts.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 2.
5. If a prerequisite flips to `🛑 blocked` at any point during the wait, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

Each poll must re-read the log file fresh (the file may have been updated by another session in parallel).

**In-wave siblings are NOT a reason to wait at Step 1.** If implementation 03 and 04 are both in Wave 2 and 04 is already `in-progress` when you start 03, proceed immediately to Step 2 and code 03 in parallel with 04. The wave model assumes parallel coding — serialisation only happens at the deployment step.

If all cross-wave prerequisites are satisfied, continue immediately.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths, endpoint names, and service signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task. Commit this log update as a separate commit:

```bash
git add modeling/IMPLEMENTATION_LOG.md
git commit -m "docs(budgeting): mark implementation $ARGUMENTS as in-progress"
```

If your implementation involves shared files (per Rule 17 in §2a — `apps/api/src/modules/budgeting/budgeting.module.ts`, `apps/api/src/app.module.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/base/cron-scheduler.service.ts`, `packages/prisma/schema.prisma`, `packages/prisma/rls/policies.sql`, `packages/shared/src/budgeting/index.ts`, `apps/web/src/app/[locale]/(school)/finance/budgeting/page.tsx`, `apps/api/package.json`, `pnpm-lock.yaml`), append a SHARED-FILE CLAIM block to §5 in the same log update — claim every shared file you intend to edit. This serialises your work with siblings in the wave.

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

   - Never bundle log updates with code commits. Log updates get their own commit in Step 7 after the code is deployed.

4. Run the implementation file's recipe. Commit after each sub-step that produces a working state.

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

If `CLAUDE.md`'s "Module Registration — Verify DI Before Pushing" applies (you added a new service constructor dep, changed module `imports`/`exports`/`providers`, or wired a new BullMQ queue), run the AppModule DI smoke per Rule 6 in `IMPLEMENTATION_LOG.md`. Fix any failures before deploying.

## Step 5 · Commit locally — NEVER push

When the implementation is complete and tests pass, finalise the last code commit:

```bash
# Verify clean status
git status

# Stage only the files you own — explicit pathspec
git add <list-of-your-files>

# Commit
git commit -m "feat(budgeting): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the modeling rebuild.
See modeling/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

Conventional-commit prefix: `feat(budgeting):` for backend / cross-module work, `feat(web):` for frontend-only phases, `feat(prisma):` for schema-only commits. `fix(...)`, `refactor(...)`, `docs(...)` as appropriate.

**NEVER run `git push`. NEVER run `gh pr create`. NEVER push to GitHub.**

The deploy route for this rebuild is direct rsync (Rule 5 in `IMPLEMENTATION_LOG.md`). Pushing during the rebuild risks mixing routes on a single commit, which is prohibited per project memory ("never mix routes on one commit"). The human owner will push the entire stack of accumulated commits manually at the end of the rebuild. If you push by accident, tell the user immediately.

## Step 6 · Deploy directly to production

Production lives at `root@46.62.244.139`. The repo is at `/opt/edupod/app` running under the `edupod` user via PM2. The production repo's `main` branch is already many commits ahead of `origin/main` — this is normal and expected. **Never run `git fetch origin` or `git pull` on the server — you will revert the accumulated local-only commits.**

### Step 6a · Pre-deploy serialisation check (poll every 3 minutes, no timeout)

Before touching the server, re-read `modeling/IMPLEMENTATION_LOG.md` and scan the Wave Status table for any other implementation in your wave that is currently `deploying` **and** shares a service restart target with you (consult the deployment matrix in §3 — API / worker / web).

- If no conflicting sibling is `deploying`, proceed immediately to Step 6b.
- If a conflicting sibling is `deploying`, enter a polling wait loop:
  1. Tell the user: "Implementation $ARGUMENTS is waiting to deploy — sibling [N] is currently deploying on the same restart target. Polling every 3 minutes indefinitely."
  2. Re-read the log every **3 minutes** via ScheduleWakeup. Do not busy-loop, do not set a timeout. A typical deploy takes 2–5 minutes.
  3. As soon as the conflicting sibling flips to `completed`, re-check (another session may have grabbed the slot in the meantime). If clear, proceed. If another conflicting sibling is now `deploying`, continue waiting.
  4. If the conflicting sibling flips to `🛑 blocked` mid-deploy, STOP and tell the user — they may want to roll back or intervene before you add a patch on top of a half-deployed server.

**Deploy order within a wave is first-come-first-served, NOT by implementation number.** Implementation 04 can deploy before implementation 03 if it finishes coding first. Whoever reaches Step 6a first, and finds no `deploying` sibling, takes the slot.

An in-wave sibling that is still `in-progress` (coding, not deploying) is NOT a blocker — they haven't started the deploy phase yet, so your deployment goes first and theirs will wait on you when they reach this step.

### Step 6b · Apply and restart

Deployment steps:

1. Flip your log row to `deploying` (separate commit):

   ```bash
   git add modeling/IMPLEMENTATION_LOG.md
   git commit -m "docs(budgeting): mark implementation $ARGUMENTS as deploying"
   ```

2. Generate patch from your code commits (NOT including the log-update commits):

   ```bash
   # If you made multiple code commits during this implementation, format-patch all of them
   git format-patch <range>..HEAD --stdout > /tmp/modeling-$ARGUMENTS.patch
   ```

3. Upload the patch:

   ```bash
   scp /tmp/modeling-$ARGUMENTS.patch root@46.62.244.139:/tmp/modeling-$ARGUMENTS.patch
   ```

4. Apply on server as edupod:

   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/modeling-$ARGUMENTS.patch && git log --oneline -1"'
   ```

5. **If the impl has a schema change** (Wave 1, impl 01 only):

   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && set -a && source .env && set +a && pnpm --filter @school/prisma migrate:deploy && DATABASE_URL=$DATABASE_MIGRATE_URL pnpm db:post-migrate"'
   ```

   Use `migrate:deploy`, NOT `pnpm db:migrate` — the latter runs `migrate:dev` which offers to reset the database on drift. Memorised lesson.

6. **Rebuild the affected services** — consult §3's deployment matrix in the log to know which services to rebuild and restart:
   - **Schema (impl 01) → all three:** `pnpm turbo run build --filter=@school/shared --filter=@school/api --filter=@school/worker --filter=@school/web` then `pm2 restart api worker web --update-env`.
   - **Driver engine (impl 02) → all three:** ships in `@school/shared`, so api / worker / web all need to rebuild.
   - **Backend services (impls 03–07, 10) → API only:** `pnpm turbo run build --filter=@school/api` then `pm2 restart api --update-env`.
   - **Worker (impl 08) → worker only:** `pnpm turbo run build --filter=@school/worker` then `pm2 restart worker --update-env`.
   - **Mixed worker + API (impls 09, 11) → both:** `pnpm turbo run build --filter=@school/api --filter=@school/worker` then `pm2 restart api worker --update-env`.
   - **Frontend (impls 12–21) → web only:** Clear `.next` first per project memory: `rm -rf apps/web/.next` then `pnpm turbo run build --filter=@school/web` then `pm2 restart web --update-env`. Also: `chown -R edupod:edupod /opt/edupod/app/` before rebuild per project deploy quirks memory.

7. **Smoke test** against production. The implementation file's "Post-deploy verification" section has the specific smoke tests for that impl. Run them all. Common smokes:
   - For an API impl: hit the new endpoints with `curl` against `nhqs.edupod.app` (use a saved auth token for `owner@nhqs.test`). The `/api/v1` prefix is mandatory — note the project memory.
   - For a worker impl: trigger a job via the API or wait for the next cron tick and check `pm2 logs worker --lines 200` for the processor to register and run.
   - For a frontend impl: navigate to the affected page in a browser, verify no 404s in network, no errors in console.
   - For schema (impl 01): connect with `psql` and check `\dt` for the 9 new tables, plus `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('financial_models', ...)` to confirm RLS policies.

8. If smoke test fails: investigate. Common issues — missed env var, stale `.next` build, module registration forgotten, RLS not applied, BullMQ queue name typo. Fix forward with a follow-up commit.

9. **Playwright verification (Rule 27a — mandatory before flipping to completed).** Endpoint smoke alone is insufficient. Drive the relevant UI surface (or a real authenticated `browser_evaluate` request) through Playwright. For backend-only impls, authenticate as `owner@nhqs.test` and call the new endpoints via `browser_evaluate(() => fetch(...))`. For frontend impls, load the page, capture `browser_console_messages(level: 'error')`, and snapshot key UI elements. Hold the Playwright lock per Rule 27b — append `[PLAYWRIGHT LOCK]` to §5 before invoking, append `[PLAYWRIGHT RELEASED]` after closing the browser. Cap verification at ~20 minutes per project memory; spot-check, then move on. **Delete any screenshot files created during verification before committing — keep the branch clean.**

## Step 7 · Update the log — completion record

After the deployment succeeds AND Playwright verification passes:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Deployment route:** rsync (per Rule 5)
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

Commit this log update as a separate commit:

```bash
git add modeling/IMPLEMENTATION_LOG.md
git commit -m "docs(budgeting): log completion of implementation $ARGUMENTS"
```

Also upload this log-update commit to production the same way (format-patch → scp → ssh git am) so the production repo's log is up-to-date.

## Step 8 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- Deployed to production via rsync.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order within a wave).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one (e.g., new env var, new permission to grant, new admin action required, schema change rolled out so subsequent phases can rely on it).

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **Never push to GitHub.** Commit locally, deploy via rsync. Period.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never run `git fetch origin` or `git pull` on the production server.** It reverts local-only commits.
4. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
5. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
6. **Never deploy without smoke testing AND Playwright verification.** Both are required before flipping to `completed`.
7. **Never mark an implementation completed if it didn't actually ship.** If deployment failed and you couldn't recover, mark it `🛑 blocked` with a description.
8. **Never use `git add .` or `git add -A`.** Always explicit pathspec.
9. **Never bundle log updates with code commits.** Separate commits, every time.
10. **Never write directly into the Finance module's invoicing tables.** Trip → fee writes go through `FeeAssignmentsService.bulkCreate()` only — single, transactional, permission-stacked.
11. **Never expose household / student / staff-salary detail through the public shareable-link route.** PII scrub is a security invariant.
12. **Never bypass the driver engine.** All financial-model line items computed by drivers go through `runEngine`. All event-budget outputs go through `runEventEngine`. Frontend live-recompute uses the same code; drift between front and back is impossible by construction.
13. **Never re-introduce the legacy sidebar.** The morph-shell is the canonical layout for school-facing pages.
14. **Never mix deploy routes.** Once a commit has been rsynced, do not push it through GitHub CI as a separate deploy. Per project memory: "never mix routes on one commit."
