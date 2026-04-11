---
description: 'Execute a specific implementation from the New Inbox / Messaging rebuild. Reads the implementation log, validates prerequisites, executes the work, commits locally, deploys directly to production, and logs completion. Usage: /inbox 03'
---

# New Inbox — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the new Inbox / Messaging module build. This is a multi-wave rebuild that adds an in-app inbox as the first-class default channel for school communication, with smart audiences, a tenant-configurable permission matrix, admin oversight, and a safeguarding keyword scanner. The rebuild is documented in `new-inbox/PLAN.md` and orchestrated via `new-inbox/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`new-inbox/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing.
2. **`new-inbox/PLAN.md`** — the master plan explaining the product vision, conversation model, permission matrix, smart audience system, and component map. Essential for understanding what you're building and why.
3. **`new-inbox/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=04` matches `04-conversations-messages-service.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites (poll every 30 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in section 4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — only deployment serialises, and that wait is in Step 6, not here.

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 30 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `new-inbox/IMPLEMENTATION_LOG.md` every **30 minutes** via ScheduleWakeup (or equivalent). Do not busy-loop. Do not sleep in short bursts. Do not set a timeout — the loop continues until the prerequisites complete OR one flips to `🛑 blocked` OR the user interrupts.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 2.
5. If a prerequisite flips to `🛑 blocked` at any point during the wait, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

Each poll must re-read the log file fresh (the file may have been updated by another session in parallel).

**In-wave siblings are NOT a reason to wait at Step 1.** If implementation 03 and 04 are both in Wave 2 and 04 is already `in-progress` when you start 03, proceed immediately to Step 2 and code 03 in parallel with 04. The wave model assumes parallel coding — serialisation only happens at the deployment step.

If all cross-wave prerequisites are satisfied, continue immediately.

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

Follow the steps in `new-inbox/implementations/$ARGUMENTS-*.md` exactly. The file is your recipe. It tells you:

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
- **Inbox is always-on as a channel.** Never let a code path bypass the inbox.
- **Never weaken the permission matrix or relational scopes.** They are privacy invariants.

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before committing.

## Step 5 · Commit locally — NEVER push

When the implementation is complete and tests pass:

```bash
git add <specific files>
git commit -m "feat(inbox): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the new-inbox rebuild.
See new-inbox/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

**NEVER run `git push`. NEVER run `gh pr create`. NEVER push to GitHub.**

The CI gate takes 3-4 hours; pushing during this rebuild blocks everything. The human owner will push the entire stack of accumulated commits manually at the end of the rebuild. If you push by accident, tell the user immediately.

## Step 6 · Deploy directly to production

Production lives at `root@46.62.244.139`. The repo is at `/opt/edupod/app` running under the `edupod` user via PM2. The production repo's `main` branch is already dozens of commits ahead of `origin/main` — this is normal and expected. **Never run `git fetch origin` or `git pull` on the server — you will revert the accumulated local-only commits.**

### Step 6a · Pre-deploy serialisation check (poll every 3 minutes, no timeout)

Before touching the server, re-read `new-inbox/IMPLEMENTATION_LOG.md` and scan the Wave Status table for any other implementation in your wave that is currently `deploying` **and** shares a service restart target with you (consult the deployment matrix in §3 — API / worker / web).

- If no conflicting sibling is `deploying`, proceed immediately to Step 6b.
- If a conflicting sibling is `deploying`, enter a polling wait loop:
  1. Tell the user: "Implementation $ARGUMENTS is waiting to deploy — sibling [N] is currently deploying on the same restart target. Polling every 3 minutes indefinitely."
  2. Re-read the log every **3 minutes** via ScheduleWakeup. Do not busy-loop, do not set a timeout. A typical deploy takes 2–5 minutes, so the 3-minute cadence matches the expected duration without burning cache on too-frequent wakeups.
  3. As soon as the conflicting sibling flips to `completed`, re-check (another session may have grabbed the slot in the meantime). If clear, proceed. If another conflicting sibling is now `deploying`, continue waiting.
  4. If the conflicting sibling flips to `🛑 blocked` mid-deploy, STOP and tell the user — they may want to roll back or intervene before you add a patch on top of a half-deployed server.

**Deploy order within a wave is first-come-first-served, NOT by implementation number.** Implementation 04 can deploy before implementation 02 if it finishes coding first. The wave structure's only constraint is "don't deploy concurrently on the same restart target". Whoever reaches Step 6a first, and finds no `deploying` sibling, takes the slot.

An in-wave sibling that is still `in-progress` (coding, not deploying) is NOT a blocker — they haven't started the deploy phase yet, so your deployment goes first and theirs will wait on you when they reach this step.

### Step 6b · Apply and restart

Deployment steps:

1. Flip your log row to `deploying`.
2. Generate patch: `git format-patch -1 HEAD --stdout > /tmp/inbox-$ARGUMENTS.patch`
3. Upload: `scp /tmp/inbox-$ARGUMENTS.patch root@46.62.244.139:/tmp/inbox-$ARGUMENTS.patch`
4. Apply on server as edupod:
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/inbox-$ARGUMENTS.patch && git log --oneline -1"'
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
git add new-inbox/IMPLEMENTATION_LOG.md
git commit -m "docs(inbox): log completion of implementation $ARGUMENTS"
```

Also upload this log-update commit to production the same way — production should have an up-to-date log too.

## Step 8 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- Deployed to production.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order).
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
6. **Never deploy without smoke testing.** Verify it works in production before writing the completion record.
7. **Never mark an implementation completed if it didn't actually ship.** If deployment failed and you couldn't recover, mark it `🛑 blocked` with a description.
8. **Never weaken the permission matrix or hard-coded relational scopes.** They are privacy invariants. If a test or feature seems to need it, STOP and ask the user.
9. **Never let a code path bypass the inbox channel.** Inbox is always on. SMS / Email / WhatsApp are additive, never replacements.
