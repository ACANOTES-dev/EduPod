---
description: 'Execute a specific implementation from the Household Numbers & Sibling Flow rebuild. Reads the implementation log, validates prerequisites, executes the work, commits locally, deploys directly to production, and logs completion. Usage: /household-numbers 03'
---

# Household Numbers — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Household Numbers & Sibling Flow rebuild. This rebuild introduces per-tenant 6-char household identifiers, household-derived student numbers, a multi-student public apply flow, a sibling-lookup endpoint with parent-email verification, and tiered-FIFO sibling priority on the admissions waiting list. The rebuild is documented in `household-numbers/PLAN.md` and orchestrated via `household-numbers/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`household-numbers/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing including the hardened parallel-coding rules (H1–H10).
2. **`household-numbers/PLAN.md`** — the master plan explaining the product vision, data model, capacity math, and component map.
3. **`household-numbers/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=03` matches `03-multi-student-api-sibling-priority.md`).

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

The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress` as an isolated commit:

```
docs(household-numbers): mark implementation $ARGUMENTS as in-progress
```

This signals to any other session that you've claimed the task.

## Step 4 · Execute the implementation

Before writing any code:

1. **Re-read your implementation file's "Shared files this impl touches" section.** List them mentally — these are your conflict zones with sibling sessions.

2. **Plan your commit cadence.** The implementation file's `## What to build` section has numbered sub-steps. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, shell, seeds, module registration) commit LAST in one final commit.

3. **Follow these rules at every commit:**
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:

     ```
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read en.json/ar.json immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a 30-minute-stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 7 after the code is deployed.

4. **Run the implementation file's recipe.** Commit after each sub-step that produces a working state.

5. **Before entering Step 5 (the final commit), do ALL shared-file edits that you deferred.** This is the minimum-exposure window.

Follow CLAUDE.md rules and `.claude/rules/*` at all times:

- RLS on new tables (`FORCE ROW LEVEL SECURITY` + tenant isolation policy).
- No raw SQL outside the RLS middleware (with narrow exceptions documented inline).
- Interactive `$transaction(async (tx) => ...)` for all tenant-scoped writes — no sequential `$transaction([...])`.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except for the RLS cast.
- Zod schemas in `@school/shared`, DTOs inferred from schemas.
- Logical CSS properties on frontend (no `ml-`, `mr-`, `left-`, `right-`).
- `react-hook-form` + `zodResolver` for any new form.
- Co-located `.spec.ts` files next to source.

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing.

## Step 5 · Commit locally — NEVER push

When the implementation is complete and tests pass:

```bash
git add <specific files by pathspec>
git commit -m "feat(household-numbers): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the household-numbers rebuild.
See household-numbers/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

**NEVER run `git push`. NEVER run `gh pr create`. NEVER push to GitHub.** The CI gate takes 3-4 hours; pushing during this rebuild blocks everything. The human owner will push the entire stack of accumulated commits manually at the end of the rebuild.

## Step 6a · Pre-deploy serialisation check

Before running `pm2 restart`, check §4 Wave Status table for any impl in your wave that has `status: deploying` AND shares your restart target (from the deployment matrix in §3).

If there is one, wait. Poll every 3 minutes — no fixed timeout, just keep polling until the other session flips to `completed`. Then:

1. Flip your row to `deploying` (separate commit, same pattern as the in-progress flip).
2. Proceed to 6b.

Within a wave, deployments are FIRST-COME-FIRST-SERVED. NUMERIC ORDER DOES NOT MATTER. Impl 05 can deploy before impl 04 if 05 finishes coding first.

## Step 6b · Deploy to production

Production lives at `root@46.62.244.139`. The repo is at `/opt/edupod/app` running under the `edupod` user via PM2. The production repo's `main` branch is already many commits ahead of `origin/main` — this is normal and expected. **Never run `git fetch origin` or `git pull` on the server — you will revert the accumulated local-only commits.**

Deployment steps:

1. Generate patch: `git format-patch -1 HEAD --stdout > /tmp/hh-$ARGUMENTS.patch`
2. Upload: `scp /tmp/hh-$ARGUMENTS.patch root@46.62.244.139:/tmp/hh-$ARGUMENTS.patch`
3. Apply on server as edupod:
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/hh-$ARGUMENTS.patch && git log --oneline -1"'
   ```
4. **If the impl has a schema change** (impl 01 only):
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && pnpm --filter @school/prisma migrate:deploy && pnpm --filter @school/prisma generate"'
   ```
5. **Rebuild the affected services** per the deployment matrix in §3 of the log. Always use `--force` on turbo builds:
   - API only: `pnpm turbo run build --filter=@school/api --force` then `pm2 restart api --update-env`.
   - Worker only: `pnpm turbo run build --filter=@school/worker --force` then `pm2 restart worker --update-env`.
   - Web only: clear `.next` → `pnpm turbo run build --filter=@school/web --force` then `pm2 restart web --update-env`.
   - Schema change (impl 01) → full build and restart all three.
6. **Smoke test** against the production URL. For a web impl, hit `/en/login` and a representative page from your implementation. For an API impl, curl an endpoint you just built. For a worker impl, check `pm2 logs worker`.
7. If smoke test fails, investigate. Common issues: missed env var, stale `.next` build (always use `--force`), module registration forgotten. Fix forward with a follow-up commit.

## Step 7 · Update the log — completion record (SEPARATE commit)

After the deployment succeeds:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Session notes:** <optional — anything surprising>
```

Commit this log update as a SEPARATE commit — never bundle with code:

```bash
git add household-numbers/IMPLEMENTATION_LOG.md
git commit -m "docs(household-numbers): log completion of implementation $ARGUMENTS"
```

Upload this log-update commit to production the same way (format-patch + scp + am) — production must have an up-to-date log too.

## Step 8 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- Deployed to production.
- Summary: one or two sentences.
- Next suggested implementation: `<next number>` (unless the wave has parallel siblings still to run).
- Anything the user should know before running the next one.

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **Never push to GitHub.** Commit locally, deploy via SSH. Period.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never run `git fetch origin` or `git pull` on the production server.** It reverts local-only commits.
4. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
5. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
6. **Never deploy without smoke testing.** Verify it works in production before writing the completion record.
7. **Never mark an implementation completed if it didn't actually ship.** If deployment failed and you couldn't recover, mark it `🛑 blocked` with a description.
8. **Never weaken the privacy invariant on `POST /v1/public/households/lookup`.** Household number AND parent email must both match before returning any information. Both failure modes return `HOUSEHOLD_NOT_FOUND` with identical 404s. Changing this is hard-blocked.
9. **Never use `git add .` or `git add -A`.** Stage by explicit pathspec only. Sweeping up sibling work causes revert wars.
10. **Never bundle the log update with code changes.** Log commits are always isolated.
