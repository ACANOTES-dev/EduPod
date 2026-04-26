---
description: 'Execute a specific implementation from the Payroll Overhaul rebuild within this isolated worktree. Reads the implementation log, validates prerequisites, executes the work, commits to the current feature branch (t3code/b523b305), verifies via a local dev server + Playwright, and logs completion. No push, no production deploy — the user rebases and merges to main manually when the entire module is complete. Usage: /pay 03'
---

# Payroll Overhaul — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Payroll Overhaul. This rebuild fixes the wiring of an existing payroll module that was visually redesigned but never functionally completed: the calculation engine ignores most inputs, two of three worker jobs are dead due to job-name mismatches, the frontend redesign references endpoints that don't exist, and the direct vs approval finalisation paths produce different totals. The rebuild is documented in `payrollnew/PLAN.md` and orchestrated via `payrollnew/IMPLEMENTATION_LOG.md`.

**Worktree-isolated execution.** All work for this rebuild lives in the current git worktree on branch `t3code/b523b305`. Every commit stays local on that branch. Nothing is pushed, nothing is deployed to production. The user rebases onto `main` and merges manually once the entire module is complete and verified locally. Production-tenant Playwright runs are explicitly forbidden during this rebuild — verification happens against a local dev server only.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`payrollnew/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing including both the baseline rules (1–11) and the hardened parallel-coding rules (H1–H10).
2. **`payrollnew/PLAN.md`** — the master plan explaining the data model, calculation lifecycle, the dual-path unification under `FinalisationService`, the two-phase deduction application, and the component map. Essential for understanding what you're building and why.
3. **`payrollnew/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=04` matches `04-worker-pipelines.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites (poll every 30 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings.

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `payrollnew/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup (or equivalent). Do not busy-loop. Do not sleep in short bursts. Do not set a timeout — the loop continues until the prerequisites complete OR one flips to `🛑 blocked` OR the user interrupts.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 2.
5. If a prerequisite flips to `🛑 blocked` at any point during the wait, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

Each poll must re-read the log file fresh (sibling sessions in this worktree may have updated it).

**In-wave siblings are NOT a reason to wait at Step 1.** If implementation 03 and 04 are both in Wave 3 and 04 is already `in-progress` when you start 03, proceed immediately to Step 2 and code 03 in parallel with 04.

If all cross-wave prerequisites are satisfied, continue immediately.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths and function signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session sharing this worktree that you've claimed the task. Commit the log update as a separate local commit:

```bash
git status                                          # tree should be clean
git branch --show-current                           # MUST output: t3code/b523b305
git add payrollnew/IMPLEMENTATION_LOG.md
git commit -m "docs(payroll): mark implementation $ARGUMENTS as in-progress"
```

Do NOT push. All commits accumulate locally on `t3code/b523b305` until the user merges manually.

## Step 4 · Execute the implementation

Before writing any code:

1. Re-read your implementation file's "Shared files this impl touches" section. List them mentally — these are your conflict zones with sibling sessions running in this worktree.

2. Plan your commit cadence. The implementation file's sub-steps define natural commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, shell, seeds, module registration) commit LAST in one final commit.

3. Follow these rules at every commit:
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.
   - Run `git branch --show-current`. It MUST output `t3code/b523b305`. If it returns anything else, STOP — checkout the correct branch before continuing. Committing into the wrong branch poisons the user's later merge.

   - Stage ONLY your own files by explicit pathspec:

     ```bash
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read `apps/web/messages/en.json` and `apps/web/messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 8 after local verification.

4. Run the implementation file's recipe. Commit after each sub-step that produces a working state. All commits stay local on the feature branch — there is no push at any point during this rebuild.

5. Before entering Step 5 (the final code commit), do ALL shared-file edits that you deferred. This is the minimum-exposure window.

Follow CLAUDE.md rules and `.claude/rules/*` at all times:

- RLS on new tables (`FORCE ROW LEVEL SECURITY` + tenant isolation policy) — Wave 1 retrofits the 10 missing tables.
- No raw SQL outside the RLS middleware.
- Interactive `$transaction(async (tx) => ...)` for all tenant-scoped writes — no sequential `$transaction([...])`.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the `PrismaService` RLS cast.
- Zod schemas in `@school/shared`, DTOs inferred from schemas.
- Logical CSS properties on frontend (no `ml-`, `mr-`, `left-`, `right-`).
- `react-hook-form` + `zodResolver` for any new form. The audit found ZERO compliant forms in the existing payroll module — Wave 4 fixes this systemically.
- Co-located `.spec.ts` files next to source.
- Every tenant-scoped table needs an RLS leakage test.
- **All math involving money runs in `Decimal`. Never coerce to `Number` for arithmetic.**
- **All worker job names and Redis keys come from `@school/shared/payroll`. Never hardcode the strings.**
- **Both finalisation paths invoke `FinalisationService.finaliseAtomic` — never duplicate the calculation logic in the controller or worker.**

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing. There is no CI safety net during this rebuild — local checks ARE the checks.

## Step 5 · Commit locally (final code commit)

When the implementation is complete and tests pass, finalise the last code commit:

```bash
git status                                          # verify clean staging set
git branch --show-current                           # MUST output: t3code/b523b305
git add <list-of-your-files>                        # explicit pathspec only
git commit -m "feat(payroll): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the payroll-overhaul rebuild.
See payrollnew/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

You may have several commits stacked locally from Step 4's sub-step cadence — that's fine. They all stay on the feature branch together until the user merges manually.

## Step 6 · Local verification — start the dev server

There is no production deploy in this rebuild. Verification happens entirely against a local dev server.

### 6a · Confirm local infrastructure is up

Before starting the dev server, verify Postgres (5432) and Redis (6379) are listening:

```bash
nc -z localhost 5432 && echo "postgres OK" || echo "postgres DOWN"
nc -z localhost 6379 && echo "redis OK" || echo "redis DOWN"
```

If either is down, start them (Docker Compose, brew services, etc.) before continuing. Without them, the API and worker will crash on boot.

### 6b · Apply migrations and post-migrate locally (if your impl includes new SQL)

```bash
pnpm --filter @school/prisma migrate:deploy
pnpm --filter @school/prisma db:post-migrate
```

This applies your new migration safely against the local DB so the dev server boots cleanly. Do NOT run `migrate:dev` if your local DB has data you care about — it offers to reset on drift.

### 6c · Start the dev server

```bash
pnpm turbo run dev
```

This starts the full Turborepo stack — web (Next.js), api (NestJS), worker (BullMQ). Wait for all three to log "ready" / equivalent before running checks. Note the actual ports the dev server prints (web is typically 3000, api typically 3001 — but read the actual output, do not assume).

If the impl only touches one app, you can scope: `pnpm --filter @school/web dev`, `pnpm --filter @school/api dev`, or `pnpm --filter @school/worker dev`.

Run the dev server in the background (`run_in_background: true`) and monitor its output as you verify. Stop it with `KillShell` when you're done so it doesn't dangle for the next session.

## Step 7 · Functional verification with Playwright (against localhost only)

Run the verification appropriate to your impl. **Everything must point at `http://localhost:<port>`.** Production tenants (`nhqs.edupod.app`, `edupod.app`, etc.) are off-limits for this entire rebuild.

- **Frontend impl** — drive Playwright against `http://localhost:<web-port>`. Use the playwright MCP tools (`mcp__plugin_playwright_playwright__browser_navigate`, `…browser_snapshot`, `…browser_console_messages`, `…browser_network_requests`, `…browser_click`, etc.). Navigate to the affected pages, assert no console errors, no 4xx/5xx network responses, and that the key user flows complete. Take a screenshot only if visually useful — delete it after.
- **API impl** — hit endpoints with `curl` against `http://localhost:<api-port>/api/v1/...`. Use a known local tenant. Authenticate via the local login flow and reuse the bearer token in subsequent requests.
- **Worker impl** — trigger a job through the local API, poll the local status endpoint, tail the worker dev output to confirm the processor registered and the job ran. The job name MUST come from `@school/shared/payroll` constants — verify it didn't drift.
- **Schema impl** — `psql $DATABASE_URL` to inspect `\d <table>`, run `SELECT relforcerowsecurity FROM pg_class WHERE relname = '<table>'`, and confirm the `<table>_tenant_isolation` policy exists. For Wave 1 retrofits, confirm each of the 10 tables has both `rowsecurity` and `relforcerowsecurity` set, plus the `<table>_tenant_isolation` policy.

If verification fails: fix in code, recommit on the feature branch (no push), restart the dev server if your change requires it, re-verify. There is no CI fallback — the local pass IS the pass.

## Step 8 · Update the log — completion record (SEPARATE local commit, no push)

After local verification passes:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns. The SHA is the head of the feature branch — `git rev-parse HEAD`.
3. Append a completion record in §5 of the log using this template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Branch:** t3code/b523b305 (worktree-isolated, not yet merged to main)
- **Local verification:** passed (dev server + Playwright / curl / worker logs — name what you actually ran)
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Session notes:** <optional — anything surprising>
```

Commit this log update as a SEPARATE commit:

```bash
git add payrollnew/IMPLEMENTATION_LOG.md
git commit -m "docs(payroll): log completion of implementation $ARGUMENTS"
```

Do NOT push. The log + code commits accumulate on `t3code/b523b305` until the user merges manually.

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Code commit: `<sha>`. Log commit: `<sha>`. Branch: `t3code/b523b305` (local only, not pushed).
- Verified locally via dev server + Playwright (or curl / worker logs as appropriate — name what you ran).
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one (e.g. new env var, new permission to grant, new admin action required, new local migration to apply).

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **No `git push`. All work stays on `t3code/b523b305` in this worktree.** The user rebases onto `main` and merges manually when the entire module is complete. Never `git push`, never `gh pr create`, never push to any other remote or branch.
2. **Verify the branch before every commit.** `git branch --show-current` MUST return `t3code/b523b305`. If it returns anything else, STOP — checkout the correct branch before continuing. Committing into the wrong branch poisons the user's later merge.
3. **Never skip prerequisite checks.** If something says `pending`, it's pending.
4. **Never touch the production server.** Production is untouched during this rebuild — no SSH for diagnostics, no rsync, no migrations applied to prod, no `.env` edits. Production stays frozen until the user merges and ships through normal channels post-rebuild.
5. **Never use `git add .` or `git add -A`.** Stage by explicit pathspec only. The Wave 4 incident on the inbox rebuild taught us why — sibling sessions in the same worktree can still write into your tree.
6. **Never bundle log updates with code commits.** Separate commits, every time.
7. **Never run Playwright against a production tenant.** Localhost only — `http://localhost:<port>`. No `nhqs.edupod.app`, no `edupod.app`, no production hostnames anywhere in this rebuild.
8. **Never run `migrate:dev` against your local DB if it has data you care about.** It offers to reset the database on drift. Use `migrate:deploy` for safe forward application.
9. **Never skip the log update.** The log is the persistent record of what's been built; the user reads it before deciding when to merge to main.
10. **Never mark an implementation `completed` without local verification.** Dev server up, Playwright (or curl / worker tail) green, no console errors, no smoke regressions.
11. **Never mark an implementation `completed` if verification failed.** Mark it `🛑 blocked` with a description of the failure.
12. **Never coerce `Decimal` to `Number` for money arithmetic.** Use `Decimal.js` end-to-end.
13. **Never hardcode worker job names or Redis keys.** Import from `@school/shared/payroll`.
14. **Never duplicate finalisation logic.** Call `FinalisationService.finaliseAtomic` from any path that finalises a run.
15. **Never let `/my-payslips` accept a `staff_profile_id` query param.** It scopes to the calling user only — privacy invariant.
16. **Never re-introduce the legacy sidebar.** The morph-shell is the canonical layout for school-facing pages.
