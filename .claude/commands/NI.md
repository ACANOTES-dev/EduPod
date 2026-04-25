---
description: 'Execute a specific implementation from the Reports rebuild. Reads the implementation log, validates prerequisites, executes the work, commits, pushes to GitHub, watches CI, and logs completion. Server access is granted for diagnostics only — all deploys go through GitHub CI. Usage: /NI 03'
---

# Reports Rebuild — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Reports module rebuild. This is a 22-phase, 5-wave rebuild that replaces the mock-data-backed reports module with a real KPI dashboard, a curated custom report builder, three flag-gated AI features (narration, ask-AI, predictions), scheduled reports + alerts workers, finished board + compliance aggregation, and a PDF/Excel/Word export pipeline. The rebuild is documented in `reports-rebuild/PLAN.md` and orchestrated via `reports-rebuild/IMPLEMENTATION_LOG.md`.

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`reports-rebuild/IMPLEMENTATION_LOG.md`** — the operating rules, wave structure, deployment matrix, and completion status for every implementation. Read the whole thing.
2. **`reports-rebuild/PLAN.md`** — the master plan explaining the scope, KPI set, 11 report subjects + field trees, custom builder UX, AI flagship scope, sharing flow, and component map. Essential for understanding what you're building and why.
3. **`reports-rebuild/implementations/$ARGUMENTS-*.md`** — the specific implementation file for the task you're about to execute. Your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix (e.g. `$ARGUMENTS=03` matches `03-kpi-dashboard-service.md`).

Do not skim these. Read them carefully. The log is the source of truth for what has and has not been done; the plan is the source of truth for what is being built; the implementation file is the source of truth for how to build this specific piece.

## Step 1 · Validate prerequisites

From the implementation file, identify the `Depends on:` line in the frontmatter. For each prerequisite implementation number listed, check the **Wave Status table** in section 4 of `IMPLEMENTATION_LOG.md`. Every prerequisite MUST show `status: completed`.

If **any** prerequisite is not completed:

- STOP immediately. Do not touch code.
- Tell the user exactly which prerequisites are missing, in the form: "Cannot execute implementation $ARGUMENTS — prerequisites not met: [list]. Run those first."
- Do not attempt to work around missing prerequisites. Do not partial-execute.

If all prerequisites are satisfied, continue.

Also check that no other implementation in the same wave is currently `in-progress` or `deploying`. If there is one AND it shares your service-restart target per §3's deployment matrix, wait or pick a different sibling. Two concurrent CI runs against `main` serialise at the workflow level anyway, but contention here wastes CI minutes and produces noisy failures.

## Step 2 · Read completed prerequisite summaries

For each prerequisite implementation that is `completed`, read its completion record in section 5 of `IMPLEMENTATION_LOG.md`. Look for:

- What was actually built (may differ from the original plan).
- Any deviations from the plan with rationale.
- Follow-up notes that might affect your current work.
- File paths, endpoint names, and service signatures you'll be integrating with.

If a prerequisite's record mentions something that changes how you should execute the current implementation, respect it. The record is authoritative for what actually exists in the codebase right now.

## Step 3 · Update the log — mark yourself as in-progress

Before writing any code, flip your implementation's row in the Wave Status table from `pending` to `in-progress`. This signals to any other session that you've claimed the task.

## Step 4 · Execute the implementation

Follow the steps in `reports-rebuild/implementations/$ARGUMENTS-*.md` exactly. The file is your recipe. It tells you:

- Which files to create, modify, or delete.
- What data model changes to make (and the RLS policies that must accompany them).
- What tests to write and what coverage to maintain.
- What to watch out for (constraints, permission-scoping, flag-gating).

Follow `CLAUDE.md` and `.claude/rules/*` at all times. Highest-priority rules for this rebuild:

- RLS on every new tenant-scoped table: `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirror into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware. No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write. The sequential `$transaction([...])` API is prohibited.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception.
- Zod schemas live in `@school/shared`; DTOs inferred from them.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`.
- `react-hook-form` + `zodResolver` for every new form.
- Co-located `.spec.ts` files next to source. Every tenant-scoped table needs an RLS leakage test.
- AI features MUST default off and respect `tenant_ai_flags`. Guard every AI endpoint with `@UseGuards(AiFlagGuard) @RequiresAiFlag('reports_...')`.
- Custom builder queries MUST go through the subject registry + query engine — no ad-hoc Prisma or SQL for builder execution.

Run the local gauntlet before committing:

```bash
pnpm turbo run type-check --filter=@school/<affected>
pnpm turbo run lint --filter=@school/<affected>
pnpm turbo run test --filter=@school/<affected>
```

If `CLAUDE.md`'s "Module Registration — Verify DI Before Pushing" section applies to your phase (you added a new service constructor dep or changed module `imports`/`exports`/`providers`), run the AppModule DI smoke:

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

Fix any failures before committing. A broken DI test in CI will block the deploy and waste 10+ minutes.

## Step 5 · Commit locally

When the implementation is complete and the local gauntlet passes:

```bash
git add <specific files>
git commit -m "feat(reports): <implementation title>

<one-paragraph summary of what was built>

Implementation $ARGUMENTS of the reports rebuild.
See reports-rebuild/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>
"
```

Conventional-commit prefix: `feat(reports):`, `fix(reports):`, `refactor(reports):`, `docs(reports):` — pick the one that matches the phase. Schema-only phases use `feat(prisma):`.

## Step 6 · Push and watch CI

**All deployments and pushes go through GitHub CI for this rebuild.** Do not rsync, do not `git am` on the server, do not `pm2 restart` by hand.

Flip your log row from `in-progress` to `deploying` and push:

```bash
git push origin main
```

Watch the workflow:

```bash
gh run watch --exit-status
```

CI runs type-check, lint, test, regression, and (on green) the deploy job. Expected runtime: ~6 minutes warm, ~11 minutes cold. If `gh run watch` exits non-zero:

1. Read the failure: `gh run view <id> --log-failed`.
2. **Fix in a NEW commit** (never amend a pushed commit). Re-run the local gauntlet. Push again.
3. Repeat until CI is green. Each failure is a natural checkpoint — update the log with a brief note if a fix took more than one follow-up commit, so future sessions know the diff landed across multiple SHAs.

If CI is flaky (infra-level, not a real regression), use `gh run rerun <id>`. Only treat a second green run as success — do not assume a flake until you see it pass without changes.

**Server access is granted, but for diagnostics only.** You may `ssh root@46.62.244.139` to:

- Read PM2 logs: `pm2 logs api --lines 200`.
- Inspect DB state: `sudo -u edupod bash -lc 'psql $DATABASE_URL'`.
- Check object-storage buckets via S3 CLI.
- Inspect file permissions or env var presence.

You may **NOT** from SSH:

- `git pull` / `git fetch` / `git am` — the deploy is CI's job.
- `pnpm db:migrate` / `db:post-migrate` — CI runs migrations.
- `pm2 restart` / `pm2 reload` — CI restarts services.
- Edit `.env`, rotate secrets, or write to `/opt/edupod/app`.

If you see something on the server that CI can't fix (e.g., a stuck PM2 process from a prior rebuild, a corrupted build directory), tell the user before touching it. Emergency-only SSH mutations must be documented in the completion record.

## Step 7 · Verify the deploy landed

Once CI is green and the deploy job has run:

1. Hit `https://<tenant-domain>/api/health` — expect 200.
2. Smoke the specific surface your phase touched:
   - **Schema phase (01):** connect with `psql`, confirm new tables exist with RLS (`\dt` + `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = '<new_table>';`).
   - **Backend service phase:** curl the primary endpoint as `owner@nhqs.test`; confirm real data (not 404, not stubbed shape).
   - **Worker phase:** `pm2 logs worker --lines 200` — confirm the new processor registered and (if it's a cron) fired at its scheduled interval.
   - **Frontend phase:** load the page in a browser, verify the new UI renders and no silent mock fallback triggers.
3. If the deploy landed but runtime is broken: fix forward with a new commit + push. Do not roll back mid-phase unless the issue is catastrophic (data loss, security leak) — document the decision.

## Step 8 · Update the log — completion record

After verification succeeds:

1. Flip your row in the Wave Status table to `completed`.
2. Fill in `Completed at` and `Commit SHA` columns.
3. Append a completion record in §5 of the log using the exact template:

```
### [IMPL $ARGUMENTS] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **CI run:** <gh run URL>
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  <what was actually built, names of new files, endpoints, services,
   key design decisions made during implementation that subsequent waves
   need to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything that needs later attention, with owner>
- **Rollback:** <exact `git revert <sha>` command + any manual DB rollback if reverting>
- **Session notes:** <optional — anything surprising>
```

Commit this log update as a separate commit and push:

```bash
git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): log completion of implementation $ARGUMENTS"
git push origin main
```

(The log-update commit also runs CI but is trivial — it only touches markdown, so CI is fast.)

## Step 9 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Commit: `<sha>`.
- CI run: `<url>`.
- Deployed to production.
- Summary: one sentence.
- Next suggested implementation: `<next number>` (unless the wave has parallel siblings still to run — then list which are available).
- Anything the user should know before running the next one (e.g., new env var, new permission to assign, new admin action required).

Keep it tight. The user can read the full record in the log.

---

## Rules you must never break

1. **All pushes and deploys go through GitHub CI.** No direct rsync, no `git am` on the server, no manual `pm2 restart`. SSH is diagnostic-only.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never amend a pushed commit.** If CI fails, fix in a new commit and push again.
4. **Never skip the local gauntlet.** Type-check + lint + test + (if DI-relevant) AppModule smoke before pushing. A broken push wastes 10+ minutes of CI and blocks siblings in the same wave.
5. **Never skip the log update.** The log is the only coordination mechanism; if you don't update it, the next session is flying blind.
6. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
7. **Never mark an implementation completed if it didn't actually ship.** If the deploy failed, CI is stuck, or verification failed, mark it `🛑 blocked` with a description of what you tried and what you need.
8. **Never flip an AI feature on by default.** Every `tenant_ai_flags` entry for reports seeds `enabled = false`. Tenants opt in.
9. **Never bypass the query engine for builder execution.** Every saved/preview/scheduled report query goes through `QueryEngineService`. RLS, permission-scoping, row caps, and timeout are enforced there.
10. **Never mix deploy routes.** Once a commit has been pushed via CI, do not rsync it. This rebuild is GitHub-CI exclusive.
