---
description: 'Execute a specific implementation from the New Admissions rebuild. Reads the implementation log, validates prerequisites, executes the work, commits locally, deploys directly to production, and logs completion. Usage: /new-admissions 03'
---

# New Admissions — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Admissions module rebuild. This is a multi-wave rebuild that replaces the honor-based admissions flow with a financially-gated pipeline. The rebuild is documented in `new-admissions/PLAN.md` and orchestrated via `new-admissions/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`new-admissions/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing.
2. **`new-admissions/PLAN.md`** — the master plan explaining the product vision, state machine, data model, and component map. Essential for understanding what you're building and why.
3. **`new-admissions/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=03` matches `03-state-machine-rewrite.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in section 4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed`.

If **any** prerequisite is not completed:

- STOP immediately. Do not touch code.
- Tell the user exactly which prerequisites are missing, in the form: "Cannot execute implementation $ARGUMENTS — prerequisites not met: [list]. Run those first."
- Do not attempt to work around missing prerequisites. Do not partial-execute.

If all prerequisites are satisfied, continue.

Also check that no other implementation in the same wave is currently `in-progress` or `deploying`. If there is one, and your current implementation also needs server deployment (check the deployment matrix in §3 of the log), you should wait or tell the user to run a different implementation instead. Two concurrent deployments to production will step on each other.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in section 5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths and function signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task.

## Step 4 · Execute the implementation

Follow the steps in `new-admissions/implementations/$ARGUMENTS-*.md` exactly. The file is your recipe. It tells you:

- Which files to create, modify, or delete.
- What data model changes to make.
- What tests to write.
- What to watch out for.

Follow CLAUDE.md rules and `.claude/rules/*` at all times:

- RLS on new tables (`FORCE ROW LEVEL SECURITY` + tenant isolation policy).
- No raw SQL outside the RLS middleware (with narrow exceptions documented inline).
- Interactive `$transaction(async (tx) => ...)` for all tenant-scoped writes — no sequential `$transaction([...])`.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except for the RLS cast.
- Zod schemas in `@school/shared`, DTOs inferred from schemas.
- Logical CSS properties on frontend (no `ml-`, `mr-`, `left-`, `right-`).
- `react-hook-form` + `zodResolver` for any new form.
- Co-located `.spec.ts` files next to source.
- Every tenant-scoped table needs an RLS leakage test.

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing.

## Step 5 · Commit locally — NEVER push

When the implementation is complete and tests pass:

```bash
git add <specific files>
git commit -m "feat(admissions): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the new-admissions rebuild.
See new-admissions/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

**NEVER run `git push`. NEVER run `gh pr create`. NEVER push to GitHub.**

The CI gate takes 3-4 hours; pushing during this rebuild blocks everything. The human owner will push the entire stack of accumulated commits manually at the end of the rebuild. If you push by accident, tell the user immediately.

## Step 6 · Deploy directly to production

Production lives at `root@46.62.244.139`. The repo is at `/opt/edupod/app` running under the `edupod` user via PM2. The production repo's `main` branch is already dozens of commits ahead of `origin/main` — this is normal and expected. **Never run `git fetch origin` or `git pull` on the server — you will revert the accumulated local-only commits.**

Deployment steps:

1. Flip your log row to `deploying`.
2. Generate patch: `git format-patch -1 HEAD --stdout > /tmp/na-$ARGUMENTS.patch`
3. Upload: `scp /tmp/na-$ARGUMENTS.patch root@46.62.244.139:/tmp/na-$ARGUMENTS.patch`
4. Apply on server as edupod:
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/na-$ARGUMENTS.patch && git log --oneline -1"'
   ```
5. **If the impl has a schema change** (Wave 1 only, or retroactive migrations):
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && set -a && source .env && set +a && DATABASE_URL=$DATABASE_MIGRATE_URL pnpm db:migrate && DATABASE_URL=$DATABASE_MIGRATE_URL pnpm db:post-migrate"'
   ```
6. **Rebuild the affected services** — consult the deployment matrix in §3 of the log to know which services to rebuild and restart.
   - API only: `pnpm turbo run build --filter=@school/api` then `pm2 restart api --update-env`.
   - Worker only: `pnpm turbo run build --filter=@school/worker` then `pm2 restart worker --update-env`.
   - Web only: clear `.next` → `pnpm turbo run build --filter=@school/web` then `pm2 restart web --update-env`.
   - Schema change (Wave 1) → full build and restart all three.
7. **Smoke test** against the production URL. For a web impl, hit `/en/login` and a representative page from your implementation. For an API impl, curl the health endpoint + one endpoint you just built. For a worker impl, check `pm2 logs worker` for the new cron registration or processor start message.
8. If smoke test fails, investigate. Common issues: missed env var, stale `.next` build, module registration forgotten. Fix forward with a follow-up commit.

## Step 7 · Update the log — completion record

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

Commit this log update as a separate commit:

```bash
git add new-admissions/IMPLEMENTATION_LOG.md
git commit -m "docs(admissions): log completion of implementation $ARGUMENTS"
```

Also upload this log-update commit to production the same way — production should have an up-to-date log too.

## Step 8 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- Deployed to production.
- Summary: one sentence.
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
