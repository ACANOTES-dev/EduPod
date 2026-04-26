---
description: 'Execute a specific implementation from the Payroll Overhaul rebuild. Reads the implementation log, validates prerequisites, executes the work, commits, pushes to GitHub, watches CI, and logs completion. Server access is granted for diagnostics only — all deploys go through GitHub CI. Usage: /pay 03'
---

# Payroll Overhaul — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Payroll Overhaul. This rebuild fixes the wiring of an existing payroll module that was visually redesigned but never functionally completed: the calculation engine ignores most inputs, two of three worker jobs are dead due to job-name mismatches, the frontend redesign references endpoints that don't exist, and the direct vs approval finalisation paths produce different totals. The rebuild is documented in `payrollnew/PLAN.md` and orchestrated via `payrollnew/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`payrollnew/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing including both the baseline rules (1–11) and the hardened parallel-coding rules (H1–H10).
2. **`payrollnew/PLAN.md`** — the master plan explaining the data model, calculation lifecycle, the dual-path unification under `FinalisationService`, the two-phase deduction application, and the component map. Essential for understanding what you're building and why.
3. **`payrollnew/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=04` matches `04-worker-pipelines.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites (poll every 30 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — only the deploy step serialises, and CI handles that automatically (see Step 6).

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `payrollnew/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup (or equivalent). Do not busy-loop. Do not sleep in short bursts. Do not set a timeout — the loop continues until the prerequisites complete OR one flips to `🛑 blocked` OR the user interrupts.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 2.
5. If a prerequisite flips to `🛑 blocked` at any point during the wait, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

Each poll must re-read the log file fresh (the file may have been updated by another session in parallel).

**In-wave siblings are NOT a reason to wait at Step 1.** If implementation 03 and 04 are both in Wave 3 and 04 is already `in-progress` when you start 03, proceed immediately to Step 2 and code 03 in parallel with 04. The wave model assumes parallel coding — serialisation only happens at the deploy step.

If all cross-wave prerequisites are satisfied, continue immediately.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths and function signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task. Commit the log update as a separate commit and push it immediately so other sessions and `origin/main` see the claim:

```bash
git add payrollnew/IMPLEMENTATION_LOG.md
git commit -m "docs(payroll): mark implementation $ARGUMENTS as in-progress"
git push origin main
```

A docs-only push is a fast CI run (mostly cache hits). If `git push` rejects because a sibling pushed first, run `git pull --rebase origin main` and try again — the log update is small and rebases cleanly.

## Step 4 · Execute the implementation

Before writing any code:

1. Re-read your implementation file's "Shared files this impl touches" section. List them mentally — these are your conflict zones with sibling sessions.

2. Plan your commit cadence. The implementation file's sub-steps define natural commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, shell, seeds, module registration) commit LAST in one final commit.

3. Follow these rules at every commit:
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:

     ```bash
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read `apps/web/messages/en.json` and `apps/web/messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 7 after the deploy is verified.

4. Run the implementation file's recipe. Commit after each sub-step that produces a working state — but do NOT push intermediate commits. Push happens once at Step 6.

5. Before entering Step 5 (the final commit), do ALL shared-file edits that you deferred. This is the minimum-exposure window.

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

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing. CI runs the same checks; catching them locally saves the round-trip.

## Step 5 · Commit locally (no push yet)

When the implementation is complete and tests pass, finalise the last code commit:

```bash
git status                                     # verify clean staging set
git add <list-of-your-files>                   # explicit pathspec only
git commit -m "feat(payroll): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the payroll-overhaul rebuild.
See payrollnew/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

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
- **Wait for their run to finish green, then push.** Cleaner attribution. Recommended when your impl is a schema change (Wave 1) or has high blast radius — you want a clean before-state for verification.

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
- `deploy-production.sh` red → it auto-rolls back; read the smoke-test output and the deploy-script log. Common causes: missed env var, schema migration drift, BullMQ queue name typo, module registration forgotten. Fix forward.
- Schema migration failed → DO NOT touch `migrate:dev` to "fix" drift; that resets the database. Fix the migration SQL or the post-migrate SQL, commit, push.

Each fix is a new commit on top, then another `git push origin main` and `gh run watch`.

## Step 7 · Verify in production

After CI green, the smoke tests in `deploy-production.sh` already passed — but those are health-endpoint level. Do a functional smoke yourself per the implementation file's "Deployment notes" / verification section. Common smokes:

- For an API impl, hit the new endpoints with `curl` against a known tenant (e.g. `nhqs.edupod.app`). Remember the API prefix is `/api/v1/...`, not `/v1/...`.
- For a worker impl, trigger a job via the API and poll the status endpoint until completed. SSH into prod and `pm2 logs worker --lines 200` to confirm the processor registered and ran.
- For a frontend impl, navigate to the affected page and verify no 404s in network and no errors in console.
- For a schema impl, SSH into prod and `psql` to check `\d <table>` and `SELECT relforcerowsecurity FROM pg_class WHERE relname = '<table>'` to confirm RLS policies. Confirm `payroll_deduction_applications` (or whichever new table) has the `<table>_tenant_isolation` policy.

If the functional smoke fails despite CI green: there's a gap between CI's smoke and real prod behaviour. Fix forward with a follow-up commit, push, watch CI, re-verify.

## Step 8 · Update the log — completion record (SEPARATE commit)

After the deployment succeeds AND functional verification passes:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns. The deployed SHA is the head of `origin/main` after your push — `git rev-parse origin/main`.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Deployed to production:** yes (via GitHub CI)
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Session notes:** <optional — anything surprising>
```

Commit this log update as a SEPARATE commit and push it:

```bash
git add payrollnew/IMPLEMENTATION_LOG.md
git commit -m "docs(payroll): log completion of implementation $ARGUMENTS"
git push origin main
```

The log push triggers another CI run — that's expected, it's tiny and mostly cache hits. No need to `gh run watch` it; it's docs-only.

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Code commit: `<sha>`. Log commit: `<sha>`.
- Deployed to production via GitHub CI.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one (e.g. new env var, new permission to grant, new admin action required).

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **`git push origin main` is the only deploy route.** Direct rsync to the production server is retired. SSH is diagnostics only — never for shipping code.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never overwrite the production `.env` file.** It's `.gitignore`d so CI can't ship it. If you need to add or rotate an env var on the server, ask the user.
4. **Never use `git add .` or `git add -A`.** Stage by explicit pathspec only. The Wave 4 incident on the inbox rebuild taught us why.
5. **Never push without the pre-push branch-state check.** `git fetch origin main` → `git log origin/main..HEAD` → `git show --stat <sha>` for each non-yours commit.
6. **Never bundle log updates with code commits.** Separate commits, every time.
7. **Never bypass CI by rsyncing.** Fix forward with another commit + push.
8. **Never run `migrate:dev` on the server.** It offers to reset the database on drift. CI's deploy script uses `migrate:deploy`, which is the only correct command for production.
9. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
10. **Never deploy without verifying.** CI smoke is health-level; do a functional check before flipping to `completed`.
11. **Never mark an implementation completed if it didn't actually ship.** If CI failed and you couldn't recover, mark it `🛑 blocked` with a description.
12. **Never coerce `Decimal` to `Number` for money arithmetic.** Use `Decimal.js` end-to-end.
13. **Never hardcode worker job names or Redis keys.** Import from `@school/shared/payroll`.
14. **Never duplicate finalisation logic.** Call `FinalisationService.finaliseAtomic` from any path that finalises a run.
15. **Never let `/my-payslips` accept a `staff_profile_id` query param.** It scopes to the calling user only — privacy invariant.
16. **Never re-introduce the legacy sidebar.** The morph-shell is the canonical layout for school-facing pages.
