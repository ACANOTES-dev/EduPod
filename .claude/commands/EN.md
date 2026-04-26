---
description: 'Execute a specific implementation from the Engagement Module Fix rebuild. Reads the implementation log, validates prerequisites, executes the work, commits, pushes to GitHub, watches CI, and logs completion. Server access is granted for diagnostics only — all deploys go through GitHub CI. Usage: /EN 03'
---

# Engagement Fix — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Engagement Module Fix rebuild. This rebuild fixes a class of bugs found during the 2026-04-25 Playwright audit (5 broken pages, 6 missing-title pages, silent form-template save, parent portal 403'd) and replaces the in-page strip in `engagement/layout.tsx` with a tile-dashboard hub landing at `/engagement` matching the Operations / Finance / People hub pattern. The rebuild is documented in `engagement-fix/PLAN.md` and orchestrated via `engagement-fix/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`engagement-fix/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing including the hardened parallel-coding rules (H1–H10).
2. **`engagement-fix/PLAN.md`** — the master plan explaining the audit findings, the two systemic root causes (envelope unwrap + pageSize cap), the redesign target, and the component map.
3. **`engagement-fix/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=03` matches `03-form-templates-editor-polish.md`).

Do not skim these. The log is the source of truth for what has been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites (polling, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed`.

If **any** prerequisite is not completed:

- If it's `pending`, tell the user exactly which prerequisites are missing, in the form: "Cannot execute implementation $ARGUMENTS — prerequisites not met: [list]. Run those first." STOP. Do not touch code.
- If it's `in-progress` or `deploying`, this is a prior wave that hasn't shipped yet. Poll every 3 minutes until it flips to `completed` or `🛑 blocked`. No fixed timeout — keep polling until resolved.
- If it flipped to `🛑 blocked`, STOP and tell the user the rebuild is blocked upstream.

If all prerequisites are satisfied, continue.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths and function signatures you'll be integrating with.

The record is authoritative for what actually exists in the codebase right now. Especially important for Impl 01 — its `apiClient` envelope unwrap fundamentally changes how every other impl reads API responses. If 01 deployed with a deviation (e.g. partial unwrap, opt-in flag, etc.), you need to know.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress` as an isolated commit:

```bash
git add engagement-fix/IMPLEMENTATION_LOG.md
git commit -m "docs(engagement-fix): mark implementation $ARGUMENTS as in-progress"
```

Push this immediately so any sibling session running locally — and `origin/main` — sees that you've claimed the task:

```bash
git push origin main
```

A docs-only push is a fast CI run (mostly cache hits) so this is cheap. If a sibling has just pushed and `git push` rejects, run `git pull --rebase origin main` and try again — the log update is small and rebases cleanly.

## Step 4 · Execute the implementation

Before writing any code:

1. **Re-read your implementation file's "Shared files this impl touches" section.** List them mentally — these are your conflict zones with sibling sessions.

2. **Plan your commit cadence.** The implementation file's `## What to build` section has numbered sub-steps. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, shell, seeds, module registration) commit LAST in one final commit.

3. **Follow these rules at every commit:**
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:

     ```bash
     git add path/to/your/file.tsx path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read `apps/web/messages/en.json` / `apps/web/messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a 30-minute-stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 7 after the deploy is verified.

4. **Run the implementation file's recipe.** Commit after each sub-step that produces a working state — but do NOT push intermediate commits. Push happens once at Step 6.

5. **Before entering Step 5 (the final commit), do ALL shared-file edits that you deferred.** This is the minimum-exposure window.

Follow CLAUDE.md rules and `.claude/rules/*` at all times:

- RLS on new tables (`FORCE ROW LEVEL SECURITY` + tenant isolation policy) — N/A for this rebuild (no new tables).
- No raw SQL outside the RLS middleware (with narrow exceptions documented inline).
- Interactive `$transaction(async (tx) => ...)` for all tenant-scoped writes — no sequential `$transaction([...])`.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except for the RLS cast.
- Zod schemas in `@school/shared`, DTOs inferred from schemas.
- Logical CSS properties on frontend (no `ml-`, `mr-`, `left-`, `right-`).
- `react-hook-form` + `zodResolver` for any new form.
- Co-located `.spec.ts` files next to source.

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing. CI runs the same checks; catching them locally saves the round-trip.

## Step 5 · Commit locally (no push yet)

When the implementation is complete and tests pass, finalise the last code commit:

```bash
git status                                     # verify clean staging set
git add <specific files by pathspec>           # explicit pathspec only
git commit -m "fix(engagement-fix): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the engagement-fix rebuild.
See engagement-fix/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

Use `feat(engagement-fix): ...` if the impl introduces new functionality (e.g. Impl 02's hub landing). Use `fix(engagement-fix): ...` for bug fixes (e.g. Impl 01's envelope unwrap).

You may have several commits stacked locally from Step 4's sub-step cadence — that's fine. They all ship together at Step 6.

## Step 6 · Push to deploy (the only sanctioned deploy route)

**`git push origin main` is the only way to deploy.** GitHub Actions runs `.github/workflows/ci.yml` (parallel lint / type-check / unit + integration tests / build) → `scripts/deploy-production.sh` (pg_dump backup, migrations, rebuild, PM2 restart, smoke tests, auto-rollback on failure). Direct rsync + SSH deploys are retired. SSH is for diagnostics only.

### 6a · Pre-push branch-state check

Before pushing, inspect what you're about to ship:

```bash
git fetch origin main
git log --oneline origin/main..HEAD
```

For each commit in the output, identify whether it's yours. For each non-yours commit, run `git show --stat <sha>` and verify:

- It looks like a complete, intentional sibling-session commit.
- It is NOT a sweep-up of mixed working trees (e.g. files from your own area mixed with files you don't recognise).

If anything looks suspicious — STOP and investigate before pushing. A bad sibling commit on top of yours would mean rolling back BOTH after deploy.

If `git log origin/main..HEAD` is empty, you're already even with origin — you have nothing to push (rebase ate your commits, or you forgot to commit). Investigate.

### 6b · Sibling CI check (optional but recommended)

If a sibling session pushed just before you, their CI run may already be in flight. Check:

```bash
gh run list --workflow=ci.yml --branch=main --limit 3
```

If a sibling run is `in_progress` or `queued`, you have two choices:

- **Push anyway.** GitHub's `concurrency: production-deploy` group serialises the deploy step automatically — your push will queue behind theirs. The risk: if theirs fails and rolls back, your deploy lands on top of the rolled-back state. Usually harmless; occasionally needs a re-deploy.
- **Wait for their run to finish green, then push.** Cleaner attribution. Recommended when your impl is high-risk or you want isolated smoke-test results.

For routine impls, push and let CI handle it.

### 6c · Push and watch

```bash
git push origin main
gh run watch
```

`gh run watch` blocks until the run finishes. While it runs, do not start another impl in the same session — a clean reading of the result keeps the audit trail simple.

### 6d · On failure

If any CI job fails:

```bash
gh run view --log-failed
```

Read the failed log. Fix forward — never bypass CI by rsync. Common failures and fixes:

- Lint / type-check error → fix the file, commit with explicit pathspec, push again.
- Unit test red → fix the test or the code, commit, push.
- Integration test red → check whether the failure is yours or a flake. Re-run only after you've ruled out a real regression.
- `deploy-production.sh` red → it auto-rolls back; read the smoke-test output. If a real regression: fix forward. If an environmental hiccup: re-trigger via `gh workflow run ci.yml --ref main` (rare; flag to user).

Each fix is a new commit on top, then another `git push origin main` and `gh run watch`.

## Step 7 · Verify in production

After CI green, the smoke tests in `deploy-production.sh` already passed — but those are health-endpoint level. Do a functional smoke yourself:

- For a frontend impl, hit one or two representative pages on the production URL (e.g. `/en/engagement`, `/en/engagement/forms`) and check the browser console for new errors.
- For an API impl, curl an endpoint you just built against a known tenant.
- For a worker impl, trigger a job via the API and watch it complete.

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
git add engagement-fix/IMPLEMENTATION_LOG.md
git commit -m "docs(engagement-fix): log completion of implementation $ARGUMENTS"
git push origin main
```

The log push triggers another CI run. That's expected — it's tiny and mostly cache hits, but it keeps `origin/main` truthful so the next session reads accurate state. No need to `gh run watch` it; it's docs-only.

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Code commit: `<sha>`. Log commit: `<sha>`.
- Deployed to production via GitHub CI.
- Summary: one or two sentences.
- Next suggested implementation: `<next number>` (unless the wave has parallel siblings still to run).
- Anything the user should know before running the next one.

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **`git push origin main` is the only deploy route.** Direct rsync to the production server is retired. SSH is diagnostics only — never for shipping code.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never overwrite the production `.env` file.** It's `.gitignore`d so CI can't ship it. If you need to add or rotate an env var on the server, ask the user.
4. **Never use `git add .` or `git add -A`.** Stage by explicit pathspec only. Sweeping up sibling work causes revert wars.
5. **Never push without the pre-push branch-state check.** `git fetch origin main` → `git log origin/main..HEAD` → `git show --stat <sha>` for each non-yours commit.
6. **Never bundle log updates with code commits.** Log commits are always isolated.
7. **Never bypass CI by rsyncing.** Fix forward with another commit + push.
8. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
9. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
10. **Never deploy without verifying.** CI smoke is health-level; do a functional check before flipping to `completed`.
11. **Never mark an implementation completed if it didn't actually ship.** If CI failed and you couldn't recover, mark it `🛑 blocked` with a description.
12. **Never weaken or revert the `apiClient` envelope unwrap from Impl 01.** Every subsequent impl assumes it. If you find a bug in the unwrap, fix it forward — do not roll it back.
