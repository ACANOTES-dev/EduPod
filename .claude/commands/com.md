---
description: 'Execute a specific implementation from the Communications Overhaul rebuild. Reads the implementation log, validates prerequisites, executes the work, runs tests, verifies on a local dev server, and commits to the worktree branch only. NO CI deployment, NO production push — the user manually rebases and merges the worktree to main after Impl 14 completes. Usage: /com 03'
---

# Communications Overhaul — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Communications Overhaul. This rebuild promotes the platform's already-built notification dispatch infrastructure into a complete, world-class communication module: per-tenant credentials (replacing the platform-shared `.env` keys), webhook ingestion with per-tenant signature verification, suppression list, email domain verification (SPF/DKIM/DMARC), WhatsApp template lifecycle + 24-hour service window, real verify/test endpoints, full Sentry/logging/metrics observability, and closure of every existing comms gap (finance direct DB write, missing module wirings, the legacy `'push'` channel).

The rebuild is documented in `communicationnew/PLAN.md` and orchestrated via `communicationnew/IMPLEMENTATION_LOG.md`. The architecture source-of-truth is `docs/architecture/communication-architecture.md`.

## CRITICAL — This rebuild does NOT use CI deployment

**Every implementation runs in a dedicated git worktree on branch `communications-overhaul`.** The worktree is created once at the start of the rebuild and lives at a developer-chosen path (the user may have set it up at `/Users/ram/Desktop/SDB-comms` or similar; check `git worktree list` to confirm).

**Within the worktree, you commit locally. You do NOT push. You do NOT trigger GitHub Actions. You do NOT rsync. You do NOT SSH to production.** The user manually rebases the worktree onto `main` and merges after Impl 14 completes. CI runs at that point. Production deploy happens at that point. None of that is your responsibility while the rebuild is in flight.

If you find yourself reaching for `git push origin main`, `gh run watch`, or `ssh root@46.62.244.139` — STOP. You are violating Rule 5 of `IMPLEMENTATION_LOG.md`. Re-read the rule and switch to local commit + local dev server verification.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`communicationnew/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, and completion status for every implementation. Read the whole thing including both the baseline rules (1–16) and the parallel-coding rules (17–27b). The DEPLOYMENT RULE in §2 Rule 5 is the rule you violate most often by accident — re-read it specifically.
2. **`communicationnew/PLAN.md`** — the master plan. Why we're building this. The component map. The 14-implementation phase breakdown. Essential for understanding what you're building and why.
3. **`communicationnew/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=04` matches `04-provider-refactor-and-cache.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

Also helpful as reference: `docs/architecture/communication-architecture.md` for the underlying technical model, and the corresponding Stripe pattern at `apps/api/src/modules/configuration/stripe-config.{service,controller}.ts` which is the proven reference architecture every credential-related impl mirrors.

## Step 1 · Validate the worktree

You must be inside the `communications-overhaul` worktree, not the main repo.

```bash
git rev-parse --show-toplevel
git branch --show-current
git worktree list
```

The current working directory should be the worktree path (e.g. `/Users/ram/Desktop/SDB-comms`), and `git branch --show-current` should print `communications-overhaul`. If you're on `main`, STOP — tell the user you need to switch into the worktree before executing the implementation.

If the worktree does not exist yet (Impl 01 may be the first time the rebuild runs), tell the user to create it:

```bash
cd /Users/ram/Desktop/SDB
git worktree add ../SDB-comms -b communications-overhaul main
cd ../SDB-comms
```

## Step 2 · Validate prerequisites (poll every 10 minutes, no timeout)

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in §4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed` before you proceed.

**Prerequisites are cross-wave dependencies only.** An in-wave sibling (another impl in the same wave number as yours) is NOT a prerequisite. You code in parallel with your wave siblings — the only coordination is shared-file claims (Rule 17 of the log).

**If any cross-wave prerequisite is not yet `completed`, enter a polling wait loop:**

1. Tell the user once, up front: "Implementation $ARGUMENTS is waiting on prerequisites: [list]. Polling every 10 minutes indefinitely — interrupt the session if you want to abort."
2. Re-read `communicationnew/IMPLEMENTATION_LOG.md` every **10 minutes**. Do not busy-loop. Do not sleep in short bursts. Do not set a timeout.
3. After each re-read, re-check the prerequisite rows in the Wave Status table.
4. As soon as **every** prerequisite shows `completed`, exit the wait loop and continue to Step 3.
5. If a prerequisite flips to `🛑 blocked` at any point, STOP immediately and tell the user: "Implementation $ARGUMENTS aborted — prerequisite [N] is blocked. Resolve it before retrying."

In-wave siblings are NOT a reason to wait at this step. If implementation 06 and 07 are both in Wave 3 and 07 is already `in-progress` when you start 06, proceed immediately to Step 3 and code 06 in parallel with 07. Coordinate via the shared-file claims register.

If all cross-wave prerequisites are satisfied, continue immediately.

## Step 3 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in §5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths and function signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 4 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task. Commit the log update as a separate commit immediately so other sessions see the claim:

```bash
git add communicationnew/IMPLEMENTATION_LOG.md
git commit -m "docs(comms): mark implementation $ARGUMENTS as in-progress"
```

Do NOT push. The commit lives on the worktree branch only.

If your implementation needs to edit any of the cross-impl shared files listed in Rule 17 of the log (`schema.prisma`, `policies.sql`, `app.module.ts`, `worker.module.ts`, `cron-scheduler.service.ts`, `configuration.module.ts`, `communications.module.ts`, `packages/shared/src/index.ts`, etc.), append a `### [WAVE N SHARED-FILE CLAIM] — impl $ARGUMENTS` block to §5 of the log naming each file you'll edit. Commit and continue.

## Step 5 · Execute the implementation

Before writing any code:

1. Re-read your implementation file's "Files touched" / "Shared files this impl touches" section. List them mentally — these are your conflict zones with sibling sessions.

2. Plan your commit cadence. The implementation file's sub-steps define natural commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps (your own directory, your own service) commit early. Shared-file sub-steps (translations, module registration, cron registration) commit LAST in one final commit.

3. Follow these rules at every commit:
   - Run `git status` before staging. Inspect the output. If you see files you did not touch, STOP — a sibling session has written into your working tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:

     ```bash
     git add path/to/your/file.ts path/to/your/spec.ts
     ```

     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read `apps/web/messages/en.json` and `apps/web/messages/ar.json` immediately before writing your additions — deep-merge your keys into the current content, do not overwrite the file with a stale version.

   - Never bundle log updates with code commits. Log updates get their own commit in Step 9 after verification passes.

4. Run the implementation file's recipe. Commit after each sub-step that produces a working state.

5. Before entering the verification phase, do ALL shared-file edits that you deferred. This is the minimum-exposure window.

Follow `CLAUDE.md` and `.claude/rules/*` rules at all times. Highest priority for this rebuild:

- **NO CI DEPLOYMENT.** Worktree commits only. If you `git push`, you've violated Rule 5.
- RLS on every new tenant-scoped table — `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirrored into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception.
- Zod schemas in `@school/shared`, DTOs inferred from schemas.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`. ZERO TOLERANCE.
- `react-hook-form` + `zodResolver` for any new form.
- Co-located `.spec.ts` files next to source.
- Every tenant-scoped table needs an RLS leakage test.
- **Encrypted secrets are NEVER logged, NEVER returned in API responses (only last-4 mask), NEVER passed to error messages.**
- **Worker job names and Redis pub/sub channel names come from `@school/shared/constants/communications.ts`. Never hardcode the strings.**
- **`.env` credentials are removed by Impl 05; do NOT reintroduce them.** Tenant config is the only path to dispatch.
- **Cache invalidation is not optional.** Any code that mutates a tenant credential row must publish to the `comms:config-changed` Redis channel via `CommsCacheBusService`.
- **Webhook signature verification is not optional.** Verify before doing anything else with the payload.

Run `pnpm turbo run type-check` + `pnpm turbo run lint` + `pnpm turbo run test --filter=<affected>` locally and fix any failures before continuing.

## Step 6 · Local verification

This step replaces the "deploy + production verify" steps from the standard workflow. There is no production deploy.

1. **Local gauntlet** (already run in Step 5): type-check, lint, tests.

2. **AppModule DI smoke** (when wiring changes — Rule 6 of the log):

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

3. **Spin up the local dev server.** Pick the apps your impl touches:
   - API: `pnpm --filter @school/api dev` — exposes on `http://localhost:3001`
   - Worker: `pnpm --filter @school/worker dev`
   - Web: `pnpm --filter @school/web dev` — exposes on `http://localhost:5551`

   For multi-app verification, run them in separate terminals or use `pnpm dev` at the repo root if it's wired to Turborepo's dev pipeline.

4. **Functional smoke** per the implementation file's "Verification (local dev server)" section. Common patterns:
   - **API impl**: hit the new endpoints with `curl` against `http://localhost:3001/api/v1/...`. Use the local dev DB's seeded credentials (e.g., authenticate as `owner@nhqs.test` with password `Password123!`).
   - **Worker impl**: trigger a job via the API and tail `pnpm --filter @school/worker dev` logs. Confirm the processor registered (look for `"Processor registered: comms:..."` log line at startup) and the job executed.
   - **Frontend impl (Impl 11+)**: navigate to the affected page on `http://localhost:5551`. Confirm no 404s in network and no console errors.
   - **Schema impl**: connect via `psql` to the dev DB and check `\d <table>` and `SELECT relforcerowsecurity FROM pg_class WHERE relname = '<table>'` to confirm RLS policies.

5. **Playwright verification (Impl 11+ — frontend impls and Impl 14 final E2E)**:
   - Per Rule 27b, claim the Playwright lock by appending `### [PLAYWRIGHT LOCK] — impl $ARGUMENTS` to §5 of the log.
   - Drive the relevant UI surface on `http://localhost:5551` using `mcp__plugin_playwright_playwright__*` tools.
   - Authenticate as a known dev user (e.g., `owner@nhqs.test` / `Password123!` for NHQS).
   - Capture `browser_console_messages(level: 'error')` and assert no errors.
   - Spot-check key UI elements as called out in the implementation file's verification block.
   - Cap Playwright runs at ~20 minutes per memory.
   - **Per memory**: delete any screenshot files created during verification before committing — keep the branch clean.
   - Release the lock with `### [PLAYWRIGHT RELEASED]` after the run completes.

6. If any local verification step fails, fix it locally and recommit. Repeat verification until clean. Do not flip the row to `completed` with broken behaviour.

## Step 7 · Final code commit

When the implementation is complete and verification passes, finalise the last code commit:

```bash
git status                                     # verify clean staging set
git add <list-of-your-files>                   # explicit pathspec only
git commit -m "feat(comms): <implementation title>

<summary of what was built>

Implementation $ARGUMENTS of the communications-overhaul rebuild.
See communicationnew/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

You may have several commits stacked locally from Step 5's sub-step cadence — that's fine. They all live on the `communications-overhaul` branch in the worktree.

**Do NOT push.** The branch lives locally until the user merges.

## Step 8 · Update the log — completion record (SEPARATE commit)

After verification passes:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in the `Completed at` and `Local Commit SHA` columns. The local commit SHA is the head of `communications-overhaul` after your final code commit — `git rev-parse HEAD`.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only (per Rule 5) — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:** <surface-specific smoke summary — endpoints hit, pages loaded, jobs run>
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Rollback:** <exact `git revert <sha>` command + any manual steps>
- **Local verification block:** <pages/endpoints covered, console errors observed, run timestamp>
- **Session notes:** <optional — anything surprising>
```

If you used Playwright, also include the lock claim and release records earlier in §5 (per Rule 27b).

Commit this log update as a SEPARATE commit:

```bash
git add communicationnew/IMPLEMENTATION_LOG.md
git commit -m "docs(comms): log completion of implementation $ARGUMENTS"
```

Again — do NOT push.

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Code commit: `<sha>`. Log commit: `<sha>`.
- Committed to worktree branch `communications-overhaul`. NO CI deploy. The branch lives locally until you merge.
- Summary: one sentence.
- Any remaining siblings in your wave that are still `pending` or `in-progress` (list them — the user can run whichever is convenient; there's no required order).
- If your wave is now fully `completed`, name the next wave and its first available implementation.
- Anything the user should know before running the next one (e.g. new env var added to `.env.example`, new permission to grant in dev DB, new admin action required).

After Impl 14 completes, also remind the user:

- The rebuild is finished on the worktree.
- Next steps: rebase `communications-overhaul` onto `main`, resolve any conflicts (sibling sessions on `main` may have shipped during the rebuild), merge.
- After merge: run `communicationnew/cutover/production-cutover.sh` to provision production tenants.

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **Worktree commits only — NO CI, NO PRODUCTION.** Do not `git push`. Do not `gh run watch`. Do not `ssh root@46.62.244.139`. The user merges manually after Impl 14.
2. **Never skip prerequisite checks.** If something says `pending` or `in-progress`, you wait or coordinate.
3. **Never overwrite the production `.env` file.** This rebuild doesn't touch production at all.
4. **Never use `git add .` or `git add -A`.** Stage by explicit pathspec only.
5. **Never bundle log updates with code commits.** Separate commits, every time.
6. **Never run `migrate:dev` on a production server.** The whole rebuild stays in the worktree's local dev DB.
7. **Never skip the log update.** The log is the only coordination mechanism.
8. **Never deploy without verifying.** Spin up a local dev server and observe the work end-to-end.
9. **Never mark an implementation completed if it didn't actually work.** If verification failed and you couldn't recover, mark it `🛑 blocked` with a description.
10. **Never reintroduce `.env` comms credentials.** After Impl 05, `RESEND_*` and `TWILIO_*` are removed and stay removed. Tenant config is the only path.
11. **Never bypass the cache bus.** Every credential mutation publishes `comms:config-changed`.
12. **Never trust an unverified webhook.** Signature verification before any side effect.
13. **Never log plaintext credentials.** Mask everywhere — last-4 only, and only when necessary.
14. **Never expose `getDecryptedConfig` via a controller.** It's service-internal.
15. **Never re-introduce the legacy sidebar.** The morph-shell is the canonical layout for school-facing pages.
16. **Never touch architecture docs in the impl files.** Impl 14 owns the single coherent docs update.
