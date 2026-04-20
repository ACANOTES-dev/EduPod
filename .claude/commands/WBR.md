---
description: 'Execute a specific implementation from the Wellbeing Rebuild (WBR). Reads the implementation log, validates prerequisites, executes the work with hardened parallel-coding rules, commits locally, deploys directly to production, and logs completion. Usage: /WBR 03'
---

# Wellbeing Rebuild — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the wellbeing module rebuild — the largest single-module rebuild in the codebase. 24 implementations across 7 waves: schema foundation → backend stop-the-bleeding → backend hidden-capability surfacing → frontend stop-the-bleeding → super-hub + four sub-hubs + AI admin → frontend hidden-capability surfacing → polish + verification + docs. The rebuild is documented in `wellbeing_new/PLAN.md` and orchestrated via `wellbeing_new/IMPLEMENTATION_LOG.md`. The execution-guide companion at `wellbeing_new/EXECUTION_GUIDE.md` lists per-impl difficulty, time estimates, and recommended model + thinking-effort.

## Step 0 · Read the context

Before doing anything else, read these four files in order:

1. **`wellbeing_new/IMPLEMENTATION_LOG.md`** — operating rules (12 baseline + 10 hardened parallel-coding rules), wave structure, deployment matrix, completion status. Read the whole thing, especially §2b (hardened rules) if your impl is in Wave 4, 5, or 6.
2. **`wellbeing_new/PLAN.md`** — master plan: vision, super-hub structure, sub-hub design, AI gating model, notification routing, default categories, design rationale.
3. **`wellbeing_new/implementations/$ARGUMENTS-*.md`** — the specific implementation file. Find by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=04` matches `04-ai-flags-and-notification-routing.md`). Your primary work instructions.
4. **`wellbeing_new/EXECUTION_GUIDE.md` (optional but recommended)** — confirms model + thinking effort for your impl.

Do not skim. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the recipe.

## Step 1 · Validate prerequisites (poll every 30 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — only deployment serialises, and that wait is in Step 6, not here.

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `wellbeing_new/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup. Do not busy-loop. Do not sleep in short bursts. Do not set a timeout.
3. After each re-read, re-check the prerequisite rows.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop.
5. If a prerequisite flips to `🛑 blocked`, STOP and tell the user.

In-wave siblings are NOT a reason to wait at Step 1.

## Step 2 · Read completed prerequisite summaries

For each prerequisite that's `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the plan)
- File paths and signatures you'll integrate with
- Deviations from the plan with rationale
- Follow-up notes that affect your work

If a record mentions something that changes your execution, respect it. The record is authoritative for what exists in the codebase right now.

## Step 3 · Update the log — mark yourself in-progress

Before writing any code, flip your row in the Wave Status table from `pending` to `in-progress`. Commit this update in its own commit:

```bash
git add wellbeing_new/IMPLEMENTATION_LOG.md
git commit -m "docs(wbr): mark implementation $ARGUMENTS as in-progress"
```

This signals to other sessions that you've claimed the task.

## Step 4 · Execute the implementation — with parallel-coding hardening

Before writing any code:

1. **Re-read your implementation file's `## Shared files this impl touches` section.** List them mentally — these are your conflict zones with sibling sessions. If your impl is in Wave 4, 5, or 6 and the section says hot-zone severity is HIGH, double-down on the hardened rules below.

2. **Plan your commit cadence.** The implementation file's sub-steps define natural commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, `nav-config.ts`, seeds, module registration) commit LAST in one final commit.

3. **Follow these rules at every commit (especially in Waves 4, 5, 6):**
   - **Run `git status` before staging. Inspect the output.** If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - **Stage ONLY your own files by explicit pathspec:**

     ```bash
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - **If the sub-step involves translations**, re-read `messages/en.json` and `messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a 30-minute-stale version.

   - **Never bundle log updates with code commits.** Log updates get their own commit in Step 7 after the code is deployed.

4. **Run the implementation file's recipe.** Commit after each sub-step that produces a working state.

5. **Before entering Step 5 (the final commit), do ALL shared-file edits that you deferred** — translations, nav-config, module registration, seed files. This is the minimum-exposure window. One final commit that touches the shared files.

6. **Follow CLAUDE.md and `.claude/rules/*` at all times:**
   - RLS on every new tenant-scoped table (`FORCE ROW LEVEL SECURITY` + tenant isolation policy)
   - No raw SQL outside the RLS middleware
   - Interactive `$transaction(async (tx) => ...)` for all tenant-scoped writes
   - Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except for the RLS cast
   - Zod schemas in `@school/shared`, DTOs inferred from schemas
   - Logical CSS properties on frontend (no `ml-`, `mr-`, `left-`, `right-`)
   - `react-hook-form` + `zodResolver` for any new form
   - Co-located `.spec.ts` files next to source
   - Every tenant-scoped table needs an RLS leakage test
   - Both `en.json` and `ar.json` get every new translation key in the same commit
   - Never weaken privacy invariants (sealing irreversibility, break-glass scope, AI flag gating)
   - In-app notification channel always-on; never bypass

7. **Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing.**

## Step 5 · Commit locally — NEVER push

When the implementation is complete and tests pass:

```bash
git add <specific files via pathspec>
git commit -m "feat(wbr): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the wellbeing rebuild.
See wellbeing_new/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

**NEVER run `git push`. NEVER run `gh pr create`.** The user pushes the entire stack manually at the end of the rebuild.

## Step 6 · Deploy directly to production

Production lives at `root@46.62.244.139`. Repo at `/opt/edupod/app`, runs as `edupod` user via PM2. The production repo is dozens of commits ahead of `origin/main` — this is normal. **Never run `git fetch origin` or `git pull` on the server — you will revert the accumulated local-only commits.**

### Step 6a · Pre-deploy serialisation check (poll every 3 minutes, no timeout)

Before touching the server, re-read `wellbeing_new/IMPLEMENTATION_LOG.md` and scan the Wave Status table for any other implementation in your wave that is currently `deploying` **and** shares a service restart target with you (consult the deployment matrix in §3 — API / worker / web).

- If no conflicting sibling is `deploying`, proceed immediately to Step 6b.
- If a conflicting sibling is `deploying`, enter a polling wait loop:
  1. Tell the user: "Implementation $ARGUMENTS is waiting to deploy — sibling [N] is deploying on the same restart target. Polling every 3 minutes indefinitely."
  2. Re-read the log every **3 minutes** via ScheduleWakeup.
  3. As soon as the conflicting sibling flips to `completed`, re-check (another session may have grabbed the slot). If clear, proceed.
  4. If the conflicting sibling flips to `🛑 blocked`, STOP and tell the user.

**Deploy order within a wave is first-come-first-served, not by implementation number.**

### Step 6b · Apply and restart

1. Flip your log row to `deploying` (commit + push to local main; no push to remote).
2. Generate patch: `git format-patch -1 HEAD --stdout > /tmp/wbr-$ARGUMENTS.patch`
3. Upload: `scp /tmp/wbr-$ARGUMENTS.patch root@46.62.244.139:/tmp/wbr-$ARGUMENTS.patch`
4. Apply on server as edupod:
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/wbr-$ARGUMENTS.patch && git log --oneline -1"'
   ```
5. **If your impl has a schema change** (Wave 1, possibly retroactive Wave 2):
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && set -a && source .env && set +a && DATABASE_URL=$DATABASE_MIGRATE_URL pnpm db:migrate && DATABASE_URL=$DATABASE_MIGRATE_URL pnpm db:post-migrate"'
   ```
6. **Rebuild the affected services** — consult the deployment matrix in §3 of the log:
   - API only: `pnpm turbo run build --filter=@school/api` then `pm2 restart api --update-env`
   - Worker only: `pnpm turbo run build --filter=@school/worker` then `pm2 restart worker --update-env`
   - Web only: clear `.next` → `pnpm turbo run build --filter=@school/web` then `pm2 restart web --update-env`
   - Schema change → full build and restart all three
7. **Smoke test** against the production URL. Web impl: hit `/en/login` and a representative page from your impl. API impl: curl the health endpoint + one endpoint you just built. Worker impl: check `pm2 logs worker` for the new processor / cron registration.
8. If smoke test fails, investigate. Common issues: missed env var, stale `.next` build, module registration forgotten. Fix forward with a follow-up commit.

## Step 7 · Update the log — completion record

After the deployment succeeds:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Commit SHA` columns.
3. Append a completion record in §5 using the exact template:

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

Commit this log update as a SEPARATE commit:

```bash
git add wellbeing_new/IMPLEMENTATION_LOG.md
git commit -m "docs(wbr): log completion of implementation $ARGUMENTS"
```

Also upload this log-update commit to production the same way — production should have an up-to-date log too.

## Step 8 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- Deployed to production.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — there's no required order).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one.

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **Never push to GitHub.** Commit locally, deploy via SSH. Period.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never run `git fetch origin` or `git pull` on the production server.** It reverts local-only commits.
4. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
5. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
6. **Never deploy without smoke testing.** Verify on production before writing the completion record.
7. **Never mark an implementation completed if it didn't actually ship.** If deployment failed and you couldn't recover, mark it `🛑 blocked`.
8. **Never weaken privacy invariants.** Sealing is irreversible, break-glass scope is enforced everywhere, AI flags gate every AI endpoint, in-app channel is always-on.
9. **Never `git add .` or `git add -A`.** Always pathspec. This is THE rule that prevents another Wave 4 incident.
10. **Never bundle log updates with code commits.** Log update = separate commit.
11. **Never edit `messages/en.json` or `ar.json` early in your impl.** Defer to the final commit window. Re-read fresh, deep-merge.
12. **Never run pre-commit hooks bypass (`--no-verify`).** If lint-staged fails, investigate. The hook is the safety net.
