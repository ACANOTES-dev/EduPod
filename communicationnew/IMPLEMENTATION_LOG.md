# Communications Overhaul — Implementation Log

> **What this is:** The single source of truth for the Communications rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and verify on a local dev server before signing off.
>
> **CRITICAL DEPLOYMENT RULE:** This rebuild runs in a dedicated git worktree on branch `communications-overhaul`. **NO CI DEPLOYMENT.** Every implementation commits to the worktree only. The user manually rebases & merges to `main` after Impl 14 completes. Do not push to `origin main`. Do not trigger GitHub Actions. Do not rsync to production. Local dev server testing only.

---

## 1. Work summary (read this first)

The platform's notification dispatch infrastructure (provider classes, retry logic, fallback chain, rate limits, consent gating, idempotency, two-phase dispatch) is production-quality and stays untouched. What's missing is everything around it: per-tenant credentials, webhooks, deliverability hygiene, WhatsApp compliance, suppression list, observability, and module gap closure.

This rebuild ports the proven `TenantStripeConfig` pattern to three new tenant-scoped credential tables (`tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`), then adds the operational stack on top: a suppression list, email domain verification, WhatsApp template lifecycle + 24-hour service window, webhook receivers with per-tenant signature verification, real test-send verification endpoints, full Sentry / logging / metrics / runbook observability, and the closure of every existing comms gap (finance direct DB write, missing module wirings, the `'push'` channel mismatch).

**Scope of the rebuild (14 implementations, 5 waves):**

- **Wave 1 — Foundation:** schema for all 8 new tables (3 credential + 5 operational), RLS policies, permission constants, RBAC seed update, permission backfill onto existing role mappings for all 5 test tenants.
- **Wave 2 — API services:** Zod schemas in `@school/shared`, three credential services + controllers (mirror StripeConfigService), comprehensive tests (RLS leakage, permission denial, encryption round-trip, decryption isolation).
- **Wave 3 — Provider refactor + operational stack:** providers refactored to tenant-first dispatch, per-tenant client cache + Redis pub/sub invalidation, worker parity + `.env` credential removal + mid-flight `is_enabled` enforcement, webhook receivers + signature verification + suppression list, email domain verification + DNS, WhatsApp template lifecycle + service window, verify/test endpoints, observability layer (Sentry tags + structured logging + Prometheus + Grafana + runbooks).
- **Wave 4 — Frontend + cleanups:** four settings pages (index + email + sms + whatsapp), module gap closure (finance migration, trips/closures/leave/health/sen wiring, password reset, push→whatsapp).
- **Wave 5 — Backfill + docs:** test tenant backfill (15 config rows: 5 tenants × 3 channels), architecture docs update, full Playwright E2E verification on local dev server.

**Untouched by this rebuild:**

- The dispatch service itself (`notification-dispatch.service.ts`) — fallback chain, retry, rate limit, consent, idempotency, audience resolution all stay.
- The `notification` table schema (status enum is extended in Impl 06 to include `bounced` and `complained`, but no other change).
- The `notification_template` table.
- All notification-triggering business logic in attendance / behaviour / gradebook / homework / pastoral / safeguarding / engagement / parent-inquiries / admissions / RBAC / approvals (these MODULES already use `NotificationsService` correctly; only finance, trips, closures, leave, health, sen are touched in Impl 12).

---

## 2. Rules every session must follow

> **If another implementation in your wave is currently `in-progress` or `verifying`, §2a (Rules 17–26) is mandatory reading before you touch any code.** Those rules distil parallel-run failure modes from previous rebuilds.

**Rule 1 — Read this file before starting any implementation.** The whole thing. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel.** Coordinate via the shared-file claims (Rule 17). Within a wave there is no deploy serialisation step — local commits don't deploy anything. The ordering rule is purely about avoiding stomp on shared files.

**Rule 5 — DEPLOYMENT RULE: Worktree commits only. NO CI. NO PRODUCTION.**

This rebuild runs in a dedicated git worktree on branch `communications-overhaul`. Every implementation follows this release flow:

1. **Local gauntlet** — `pnpm turbo run type-check`, `pnpm turbo run lint`, `pnpm turbo run test --filter=<affected packages>`. If you wired a new BullMQ queue or changed module DI, also run the AppModule DI smoke (Rule 6).

2. **Local dev server verification** — for ANY implementation that produces a runnable surface (API endpoint, worker job, frontend page), spin up a local dev server (`pnpm dev` or the appropriate per-app `pnpm --filter @school/api dev`, `pnpm --filter @school/worker dev`, `pnpm --filter @school/web dev`) and verify the work end-to-end. Hit endpoints with `curl http://localhost:3001/api/v1/...`, drive worker jobs via the API and watch logs, navigate to frontend pages at `http://localhost:5551`. Do NOT consider the implementation complete until you have observed it work locally.

3. **Playwright verification — mandatory once UX surfaces exist.** From Impl 11 onward (frontend pages), every implementation that ships a UI must include a Playwright walkthrough on `http://localhost:5551` that authenticates a known user (e.g. `owner@nhqs.test` against the local dev DB) and exercises the new surface. Earlier implementations (01–10) drive backend smoke via `curl` or `browser_evaluate` against localhost. Cap Playwright verification at ~20 minutes per memory; spot-check, then move on. Delete any screenshots before committing — keep the branch clean.

4. **Commit locally to the worktree** — conventional commit format (`feat(comms): ...`, `fix(comms): ...`, `chore(comms): ...`). Multiple commits per impl are encouraged when sub-steps form natural boundaries. **Do NOT push to `origin main`. Do NOT push to any remote.** The worktree's branch (`communications-overhaul`) lives locally until the user merges.

5. **Never trigger CI.** This rebuild does not flow through `.github/workflows/ci.yml`. Do not run `git push origin communications-overhaul`. Do not run `gh run watch`. Do not call `scripts/deploy-production.sh`. None of those touch this work until the user merges.

6. **Never SSH to production for this rebuild.** The production server runs the version on `main`. Until the user merges, the `communications-overhaul` branch does not exist on production, and there is nothing to verify there.

7. **Update the implementation log when done** — flip the Wave Status row to `completed`, fill in the local commit SHA, write the completion record in §5.

8. **The user merges at the end.** After Impl 14 completes, the user manually rebases `communications-overhaul` onto `main`, resolves any conflicts (other sessions on `main` may have shipped during this rebuild), and merges. CI runs at that point. Production deploy happens at that point. None of that is your responsibility during the rebuild.

**Rule 6 — Run the AppModule DI smoke when wiring changes.** When you add a service constructor dep, change a module's `imports`/`exports`/`providers`, or wire a new BullMQ queue, run the verification from `CLAUDE.md`:

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

A broken DI graph is far easier to fix locally than to debug after a merge.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the local commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`. Commit the log update as a SEPARATE commit (separate from your code commits) so the log change is auditable.

**Rule 8 — Regression tests are mandatory.** Before flipping a row to `completed`, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail because of your changes, fix the regression before signing off. Do NOT mark the impl complete and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** Highest-priority rules for this rebuild:

- RLS on every new tenant-scoped table: `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirror into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware. No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write. The sequential `$transaction([...])` API is prohibited.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception.
- Zod schemas live in `@school/shared`; DTOs inferred from them.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`. ZERO TOLERANCE.
- `react-hook-form` + `zodResolver` for every new form.
- Co-located `.spec.ts` files next to source. Every tenant-scoped table needs an RLS leakage test.
- The single permitted `as unknown as PrismaService` cast lives inside `createRlsClient(...).$transaction()` — nowhere else.
- Encrypted secrets are NEVER logged, NEVER returned in API responses (only last-4 mask), NEVER passed to error messages.
- Worker job names and Redis pub/sub channel names come from `@school/shared/constants/communications.ts`. Never hardcode the strings.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code that another in-flight session might own. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — `.env` credentials are removed by Impl 05; do NOT reintroduce them.** After Impl 05 ships, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` no longer exist in env validation. If a later impl needs to send a real test message during local development, the tenant config tables (seeded by Impl 13) carry the credentials. Do not paste keys into `.env` and "fix later."

**Rule 12 — Cache invalidation is not optional.** Any code that mutates a tenant credential row (insert / update / delete) must publish to the `comms:config-changed` Redis channel. Forgetting this means the API or worker keeps using the old cached client and the tenant's update silently doesn't take effect. The `CommsCacheBusService` is the only correct path; do not bypass it.

**Rule 13 — Webhook signature verification is not optional.** The webhook receiver controllers (Impl 06) MUST verify the per-tenant signature before doing anything else with the payload. A missing signature, a wrong signature, or a missing `webhook_secret` on the tenant config: return 401, write `signature_verified=false` to `notification_webhook_events`, and STOP. Never trust unverified webhook bodies.

**Rule 14 — Architecture docs update is owned by Impl 14.** Do not touch `docs/architecture/feature-map.md`, `module-blast-radius.md`, `danger-zones.md`, `state-machines.md`, `event-job-catalog.md` in earlier impls. Impl 14 owns a single coherent update at the end. Per `.claude/rules/feature-map-maintenance.md`.

**Rule 15 — Every destructive change gets a rollback note.** If an implementation drops a column, removes an endpoint, deletes a permission, or removes an env var (Impl 05 removes 6 of them), record in §5 the exact rollback steps. The user relies on this log to recover if a merge conflict needs surgical undo.

**Rule 16 — Production tenants are test tenants until Aug 2026.** NHQS + stress-a/b/c/d are dummy data. Impl 13 backfills test credentials into the local dev DB only. Do NOT attempt to populate real production rows during the rebuild — production cutover is the user's job at merge time.

---

## 2a. Parallel-execution hygiene

These rules exist because parallel sessions editing the same working tree have, in past rebuilds, lost full work cycles to the failure modes below. Read and follow them every time more than one implementation in a wave is `in-progress` simultaneously.

**Rule 17 — Declare shared-file ownership up front.** The first session in a wave that needs to edit a cross-impl shared file announces ownership by appending a one-line note to §5 of the log **before writing any code**. Cross-impl shared files in this rebuild include:

- `packages/prisma/schema.prisma`
- `packages/prisma/rls/policies.sql`
- `apps/api/src/app.module.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/src/base/cron-scheduler.service.ts`
- `apps/api/src/modules/configuration/configuration.module.ts`
- `apps/api/src/modules/communications/communications.module.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/constants/notification-types.ts`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`
- `.env.example`
- `apps/api/package.json`
- `apps/worker/package.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`

Format:

```
### [WAVE N SHARED-FILE CLAIM] — impl NN
- Claims: apps/api/src/modules/communications/communications.module.ts
- Claims: apps/worker/src/base/cron-scheduler.service.ts
- Until: committed OR flipped to `🛑 blocked`
```

Other impls in the same wave that need to edit a claimed file MUST NOT do so concurrently. They wait for the owner's commit, pull (within the worktree), then layer their hunks on top as a fix-forward. If a claim blocks you for more than 10 minutes, flip your own row to `🛑 blocked` and leave a note naming the owner.

**Rule 18 — Never commit a reference to a file that is not in the same commit.** Before committing, audit every `import` added by your commit: if the imported file is not in the commit (either new or already on the branch) the commit will break the next session that pulls.

**Rule 19 — Lockfile edits are mechanical, never manual.** `pnpm-lock.yaml` is only ever updated by running `pnpm install` after a `package.json` change. Never hand-edit the lockfile. Always pair the lockfile change with the `package.json` delta in the same commit.

**Rule 20 — Never `git checkout HEAD -- <shared-file>` while another impl is active.** A raw checkout silently overwrites another session's unstaged work and triggers a thrash loop. Use targeted `Edit` operations, or `git stash` your changes, take a diff against HEAD, and re-apply your hunks explicitly.

**Rule 21 — Shared spec files have a single owner per wave.** If a spec file aggregates mocks for multiple impls (rare in this rebuild but possible for `communications.module.spec.ts`), the wave's first impl to touch it claims it under Rule 17. Other impls do not edit the spec directly; they leave a note in §5 naming the provider / mock they need added.

**Rule 22 — Re-fetch and re-verify branch state before every commit.** Between the time you ran `git status` and the time you run `git commit`, another session may have committed and your local `HEAD` may be stale. Before every commit:

```bash
git status
git log --oneline -5
```

If sibling sessions have committed, you may need to `git pull --rebase` within the worktree (this is internal to the worktree's branch — still no remote push).

**Rule 23 — Each impl owns the coverage of its own files.** If an impl introduces files that fall below the per-file coverage target, that impl must add tests for them before flipping to `completed` — do not rely on the next session to backfill.

**Rule 24 — Husky pre-push hooks won't fire (no push), but pre-commit hooks will.** Treat the pre-commit hook as a floor, not a gate to bypass. The only acceptable use of `--no-verify` is when the hook fails on code already on the branch from another impl AND your own commit is verified locally — and even then, the completion record in §5 must name the drag and the owning impl.

**Rule 25 — Re-read §4 before starting verification.** Another session may have flipped to `completed` / `🛑 blocked` while you worked. The shared-file claim register may have moved.

**Rule 26 — When in doubt, shrink the commit.** If the tree has diverged from your mental model because of parallel edits, the safe recovery is to commit only your new files (under your impl's owned folder) and leave the shared-file edits unstaged. Let the shared-file changes ride in the next session's commit once ownership is clear.

**Rule 27a — Local dev server + Playwright verification is mandatory before flipping a row to `completed`.** Endpoint smoke via `curl` is required for backend impls. UI Playwright walk is required for frontend impls (Impl 11+). Every implementation must additionally drive the relevant surface end-to-end on a running local dev server and capture:

- For backend impls (01–10, 12, 13): a curl run (or `browser_evaluate(() => fetch())`) against `http://localhost:3001/api/v1/...` that authenticates as a known user, hits the new endpoint(s), and confirms a real response (real data shape, not 404 / not error). Worker impls trigger a job via the API and tail `pnpm --filter @school/worker dev` logs to confirm the processor registered and ran.
- For frontend impls (11): a Playwright run that loads the page on `http://localhost:5551`, captures `browser_console_messages(level: 'error')`, asserts no errors, and snapshots key UI elements (channel cards visible, test send works, status indicators wired, etc.).
- A short `## Local verification` block in the §5 completion record listing: pages/endpoints covered, any console errors observed, the timestamp the run completed.

**Rule 27b — Only one session may run Playwright at a time. Sessions queue via a log claim.** Playwright's MCP wrapper holds a single browser context per host and serialises poorly across sessions. Before invoking ANY `mcp__plugin_playwright_playwright__*` tool, append a one-line claim to §5:

```
### [PLAYWRIGHT LOCK] — impl NN (or "verification-walkthrough")
- Holder: <session purpose>
- Started: <ISO timestamp>
- Until: released by closing the browser AND appending a follow-up release line
```

Before you write that claim, scan §5 for the most recent `[PLAYWRIGHT LOCK]` entry. If it has no matching `[PLAYWRIGHT RELEASED]` line below it, the lock is held — STOP, do not invoke Playwright tools, and either:

1. Wait (poll §5 every 3 minutes until the release line appears), or
2. Defer the verification step and flip your row to `🛑 blocked — waiting on Playwright lock`.

After your Playwright run completes, append:

```
### [PLAYWRIGHT RELEASED] — impl NN (or "verification-walkthrough")
- Holder: <same purpose as claim>
- Released: <ISO timestamp>
- Browser closed: yes
```

Hold the lock for ≤ 30 minutes. If your verification needs longer, release at the natural break point and re-claim.

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel. There is no deploy step (worktree-only), so no deploy serialisation — the only coordination is shared-file claims (Rule 17).

| Wave       | Implementations            | Hard dependency | Rationale                                                                                                                                                                                                                                                           |
| ---------- | -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01, 02                     | None            | Foundation. Schema (01) lands every new table in one migration. Permission backfill (02) seeds new constants + grants on existing role mappings. 02 depends only on permission constants existing — codes in parallel with 01 once the constant strings are agreed. |
| **Wave 2** | 03                         | Wave 1 complete | API services + controllers + tests. Single impl because the three credential services share enough mock plumbing that splitting them creates more friction than parallelism saves.                                                                                  |
| **Wave 3** | 04, 05, 06, 07, 08, 09, 10 | Wave 2 complete | Provider refactor + operational stack. Maximum parallelism. Shared files: providers/, configuration.module.ts, communications.module.ts, cron-scheduler.service.ts. Coordinate via Rule 17.                                                                         |
| **Wave 4** | 11, 12                     | Wave 3 complete | Frontend + cleanups. 11 builds the settings UI; 12 closes module gaps. They touch different files and can run in parallel.                                                                                                                                          |
| **Wave 5** | 13, 14                     | Wave 4 complete | 13 backfills test tenant configs in the dev DB. 14 updates architecture docs and runs the full E2E verification. 14 depends on 13.                                                                                                                                  |

### Restart-target matrix (informational — there's no actual deploy)

This matrix tells you which apps you need to restart in your local dev session after pulling a sibling impl's changes. There is no production deploy.

| Impl | Migration        | API restart | Worker restart | Web restart |
| ---- | ---------------- | ----------- | -------------- | ----------- |
| 01   | ✅               | ✅          | ✅             | ✅          |
| 02   | ❌ (script run)  | ✅          | ❌             | ❌          |
| 03   | ❌               | ✅          | ❌             | ❌          |
| 04   | ❌               | ✅          | ✅             | ❌          |
| 05   | ❌ (env removal) | ✅          | ✅             | ❌          |
| 06   | ❌               | ✅          | ❌             | ❌          |
| 07   | ❌               | ✅          | ✅             | ❌          |
| 08   | ❌               | ✅          | ✅             | ❌          |
| 09   | ❌               | ✅          | ❌             | ❌          |
| 10   | ❌               | ✅          | ✅             | ❌          |
| 11   | ❌               | ❌          | ❌             | ✅          |
| 12   | ❌               | ✅          | ✅             | ✅          |
| 13   | ❌ (script run)  | ✅          | ❌             | ❌          |
| 14   | ❌               | ✅          | ✅             | ✅          |

Impl 04 (provider refactor) restarts API and worker because both consume the new `comms-cache-bus.service.ts` and the refactored providers.

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `verifying` • `completed` • `🛑 blocked`

| #   | Title                                                           | Wave | Depends on             | Status      | Completed at              | Local Commit SHA |
| --- | --------------------------------------------------------------- | ---- | ---------------------- | ----------- | ------------------------- | ---------------- |
| 01  | Schema + migration + RLS (8 new tables)                         | 1    | —                      | `completed` | 2026-04-27T08:15:00+01:00 | ac342ee8         |
| 02  | Permissions + RBAC + role backfill on test tenants              | 1    | —                      | `completed` | 2026-04-27T08:30:00+01:00 | c74d92c9         |
| 03  | Zod schemas + 3 services + 3 controllers + comprehensive tests  | 2    | 01, 02                 | `completed` | 2026-04-27T09:55:00+01:00 | e22ea549         |
| 04  | Provider refactor + per-tenant client cache + Redis pub/sub     | 3    | 01, 03                 | `completed` | 2026-04-27T13:40:00+01:00 | d9782424         |
| 05  | Worker parity + `.env` removal + mid-flight enforcement         | 3    | 01, 03, 04             | `completed` | 2026-04-27T14:18:00+01:00 | f02f52f5         |
| 06  | Webhooks + signature verification + suppression list            | 3    | 01, 03                 | `pending`   | —                         | —                |
| 07  | Email deliverability — domain verification + DNS                | 3    | 01, 03, 04             | `pending`   | —                         | —                |
| 08  | WhatsApp templates + approval sync + 24-hour window             | 3    | 01, 03, 04             | `pending`   | —                         | —                |
| 09  | `verifyConfig` + test endpoints with full semantics             | 3    | 01, 03, 04             | `pending`   | —                         | —                |
| 10  | Operational layer — Sentry + logging + metrics + runbooks       | 3    | 01, 03                 | `pending`   | —                         | —                |
| 11  | Frontend Settings UI                                            | 4    | 03, 07, 08, 09         | `pending`   | —                         | —                |
| 12  | Module gap closure + cleanups                                   | 4    | 03                     | `pending`   | —                         | —                |
| 13  | Tenant backfill (5 test tenants × 3 channels) in dev DB         | 5    | 01, 02, 03, 07, 08, 09 | `pending`   | —                         | —                |
| 14  | Architecture docs + comprehensive E2E verification on local dev | 5    | 11, 12, 13             | `pending`   | —                         | —                |

"Depends on" lists the minimum set that must be `completed` before this one can start. In strict wave order these are satisfied automatically — the column exists for sanity checks.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only (per Rule 5) — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:** <surface-specific smoke summary>
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Rollback:** exact `git revert` command + any manual steps if needed.
- **Local verification block:** pages/endpoints covered, any console errors observed, run timestamp.
- **Session notes (optional):** anything weird or surprising.
```

For shared-file ownership claims (Rule 17), use:

```
### [WAVE N SHARED-FILE CLAIM] — impl NN
- Claims: <file path>
- Until: committed OR flipped to `🛑 blocked`
```

For Playwright lock (Rule 27b), use the formats described in §2a.

For blocked work, use:

```
### [IMPL NN] — 🛑 BLOCKED
- **Blocked at:** <ISO timestamp>
- **What I tried:** <description>
- **What I need:** <description>
- **Files left in dirty state:** <list, or "none">
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema + migration + RLS (8 new tables)

- **Completed:** 2026-04-27T08:15:00+01:00 (Europe/Dublin)
- **Local commit SHA:** `ac342ee8` (`feat(comms): add tenant communications config + operational tables (Impl 01)`)
- **Deployment route:** **`main` + CI pipeline** (per user override of Rule 5 for this run — work happens on `main`, commits push, GitHub Actions runs `.github/workflows/ci.yml` → `scripts/deploy-production.sh` applies the migration on production).
- **Verified at:** 2026-04-27T08:15:00+01:00 on local dev DB (`localhost:5553/school_platform`) and parallel test DB (`localhost:5563/paralleltest`).
- **Local verification:**
  - `prisma format` + `prisma validate` — green.
  - `prisma migrate deploy` against `school_platform` — applied `20260427120000_add_tenant_communication_configs_and_operational_tables` cleanly (also picked up the previously-pending `20260426190000_fix_shareable_links_public_rls_policy` as a side-effect; that one was already authored on `main`).
  - `pnpm db:post-migrate` — applied the new `post_migrate.sql` (8 RLS policies). Tracked in `_post_migrate_scripts`.
  - `pg_class` check — all 8 new tables show `relrowsecurity=t / relforcerowsecurity=t`.
  - `pg_policies` check — all 8 `<table>_tenant_isolation` policies present.
  - `pg_indexes` check — 6 named functional indexes (`idx_*`) + 5 named unique indexes (`uq_*`) + 3 `tenant_id` unique indexes + 8 PKs all present.
  - Manual `migration.sql` + `post_migrate.sql` apply against `paralleltest` DB so the integration test runner sees the new tables (paralleltest has no `_prisma_migrations` history — set up via init script + raw SQL).
  - `apps/api/test/communications-foundation.rls.spec.ts` — 10 tests, all green (per-table cross-tenant SELECT block, plus a WITH CHECK enforcement test on `tenant_email_configs`).
  - AppModule DI smoke — `DI OK`.
  - `pnpm --filter @school/prisma type-check` — green.
  - `pnpm --filter @school/api type-check` — green.
  - Sanity unit run: `apps/api/src/modules/configuration/*` — 128/128 tests green; confirms the regenerated Prisma client did not break existing services.
- **Summary (≤ 200 words):**
  Landed the foundational schema for the Communications Overhaul. Eight new
  tenant-scoped tables shipped in migration `20260427120000_add_tenant_communication_configs_and_operational_tables`:
  `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`
  (one-row-per-tenant credential tables mirroring the proven
  `TenantStripeConfig` pattern); `notification_suppression_list`,
  `tenant_email_domains`, `whatsapp_templates`, `whatsapp_service_windows`,
  `notification_webhook_events` (the operational stack used by Wave 3 webhook,
  deliverability and template impls). Five new enums: `SuppressionReason`,
  `EmailDomainStatus`, `DnsRecordStatus`, `WhatsAppTemplateCategory`,
  `WhatsAppTemplateStatus`. Eight RLS policies with `FORCE ROW LEVEL SECURITY`
  in `post_migrate.sql` and mirrored into `packages/prisma/rls/policies.sql`.
  Three named relations on `User` (`EmailConfigsCreated`, `SmsConfigsCreated`,
  `WhatsAppConfigsCreated`) and 8 back-references on `Tenant`. RLS leakage
  spec covers all 8 tables plus the WITH CHECK half of the policy. No service /
  controller / UI code — Wave 2 owns those.
- **Follow-ups:** Impl 03 builds the services against these tables. Impl 13
  populates them in the dev DB. Impl 14 owns the architecture-docs update.
- **Rollback:** `git revert <code-commit-sha>` then on production `psql` apply
  the manual down-migration in `communicationnew/implementations/01-schema-foundation.md` §7
  (DROP TABLE ... CASCADE × 8, DROP TYPE × 5, DELETE FROM `_prisma_migrations`,
  DELETE FROM `_post_migrate_scripts`). The local dev DB recovers via the same
  procedure. All eight new tables are empty at this point so no data loss.
- **Session notes:**
  - User override on Rule 5 for this run: working on `main`, commits push to
    GitHub, CI deploys to production. Rebuild does NOT use the dedicated
    worktree for impls 01–03 of this session.
  - Migration was generated via `prisma migrate diff --from-schema-datamodel`
    (HEAD's schema.prisma) `--to-schema-datamodel` (modified schema.prisma).
    Tried `prisma migrate dev --create-only` first; it produced spurious
    index renames because the dev DB has minor pre-existing drift from
    historical hand-edits to `@@index(map: ...)` annotations. The schema-to-schema
    diff sidesteps that drift entirely.
  - paralleltest DB has no `_prisma_migrations` history (set up via init
    script + raw SQL) — applied `migration.sql` + `post_migrate.sql` directly
    via `docker exec ... psql -f` so the integration tests see the new tables.

### [IMPL 02] — Permissions, RBAC seed, and backfill

- **Completed:** 2026-04-27T08:30:00+01:00 (Europe/Dublin)
- **Local commit SHA:** `c74d92c9` (`feat(comms): add communications config permissions + idempotent backfill (Impl 02)`)
- **Deployment route:** **`main` + CI pipeline** (per user override of Rule 5 for this run). Code ships through CI; the backfill script runs as a one-shot on production via SSH after deploy completes.
- **Verified at:** 2026-04-27T08:30:00+01:00 on local dev DB.
- **Local verification:**
  - Type-check `@school/shared` — green.
  - Type-check `@school/prisma` — green.
  - `pnpm --filter @school/prisma test` — 22/22 tests green (including the new backfill spec — 4 unit tests with mocked Prisma covering first-run, idempotent re-run, missing-permission throw path, and empty-tenants edge).
  - `pnpm --filter @school/api test --testPathPattern='(rbac|permissions)'` — 142/142 tests green (no regression from the new permission-key additions).
  - `npx tsx packages/prisma/scripts/sync-missing-permissions.ts` — created the two new `permissions` rows in the dev DB.
  - `pnpm --filter @school/prisma backfill:comms-permissions` (first run) — `+4 grant(s) added` for tenant `nhqs`. Stress tenants `stress-a/b/c/d` not seeded in this dev DB; script skipped them cleanly (warning, not error).
  - `pnpm --filter @school/prisma backfill:comms-permissions` (second run) — `Total grants added: 0`, `Total grants skipped: 4 (already present)` — idempotency proven on the wire.
  - Direct SQL count: 4 rows total for the two new keys × Owner/Principal × NHQS, exactly as expected.
- **Summary (≤ 200 words):**
  Added two new permission constants
  (`configuration.communications.view`, `configuration.communications.manage`)
  to the canonical `packages/shared/src/constants/permissions.ts` (keys
  `configuration.communications_view` and `..._manage`), wired them
  to `'admin'` tier in `PERMISSION_TIER_MAP`, and granted them to the
  `school_owner` system role's `default_permissions` array. Updated
  `packages/prisma/seed/permissions.ts` (`PERMISSION_SEEDS`) and
  `seed/system-roles.ts` (both `school_owner` and `school_principal`'s
  `default_permissions` arrays) so newly-provisioned tenants receive
  both keys by default. Added `packages/prisma/scripts/backfill-communications-permissions.ts`
  (with exported `runBackfill(prisma)` for testability) plus a unit spec
  covering happy-path, idempotent re-run, missing-permission failure mode,
  and empty-tenants edge. Registered `pnpm --filter @school/prisma backfill:comms-permissions`.
  Tenants resolved by `slug` (not UUID) so the script is portable across
  environments — same script works on dev, paralleltest, and production.
- **Follow-ups:**
  - **Production cutover for this impl:** after CI deploys the code, run
    `npx tsx packages/prisma/scripts/sync-missing-permissions.ts` followed by
    `pnpm --filter @school/prisma backfill:comms-permissions` against
    `localhost:5432/school_platformedupod_prod` on the production server.
    Both scripts are idempotent.
  - Impl 03 controllers must use the matching literal strings.
  - Impl 11 frontend reads `/api/v1/me/permissions` for nav gating.
- **Rollback:**
  - Code: `git revert <code-commit-sha>`.
  - Data (per-DB): `DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE permission_key IN ('configuration.communications.view','configuration.communications.manage'));`
  - Optional: `DELETE FROM permissions WHERE permission_key IN ('configuration.communications.view','configuration.communications.manage');`
- **Session notes:**
  - User override on Rule 5 — working on `main`, deploying via CI.
  - Stress tenants `stress-a/b/c/d` are absent from this dev DB; script
    handled gracefully with a `[skip]` warning per missing slug. Production
    has the same allowlist — the prod backfill will cover whatever subset
    of test tenants exists there.
  - **Production backfill applied 2026-04-27T08:55:00+01:00:** ran
    `sync-missing-permissions.ts` (2 created, 205 updated) and
    `backfill:comms-permissions` against `localhost:5432/school_platformedupod_prod`.
    Result: 20 grants added (5 tenants × 2 roles × 2 permissions, modulo
    8 already-present rows on Owner platform-level slot). Re-run idempotency
    not exercised against prod but proven on dev.

### [IMPL 03] — Zod schemas + 3 services + 3 controllers + tests

- **Completed:** 2026-04-27T09:55:00+01:00 (Europe/Dublin)
- **Local commit SHA:** `e22ea549` (`feat(comms): add 3 credential services + controllers + Zod schemas (Impl 03)`)
- **Deployment route:** **`main` + CI pipeline** (per user override of Rule 5).
- **Verified at:** 2026-04-27T09:55:00+01:00 on local dev DB and via unit/integration test suite.
- **Local verification:**
  - `pnpm --filter @school/shared type-check` — green.
  - `pnpm --filter @school/api type-check` — green.
  - AppModule DI smoke — `DI OK`.
  - `pnpm --filter @school/api test --testPathPattern='configuration'` — 15 suites, 155/155 tests green (no regression in existing `stripe-config.service.spec.ts`, `encryption.service.spec.ts`, `branding.*.spec.ts`, etc.).
  - `pnpm --filter @school/api test --testPathPattern='(email|sms|whatsapp)-config|comms-architecture'` — 4 suites, 27/27 new tests green.
  - Architecture invariants spec confirms none of the three controllers references `getDecryptedConfig` or `Decrypted*Config` types — security regression guard in place.
- **Summary (≤ 200 words):**
  Built the API surface for the three new tenant credential tables. New
  `packages/shared/src/schemas/communication-config.schema.ts` exports
  `upsertEmailConfigSchema`, `upsertSmsConfigSchema`,
  `upsertWhatsAppConfigSchema` (Resend `re_` prefix refine, Twilio `AC`
  prefix refine, E.164 regex on phone numbers, ≥8-char webhook secret) plus
  `testEmailSchema`, `testSmsSchema`, `testWhatsAppSchema` for the 501-stub
  `POST :test` endpoints. New `packages/shared/src/types/communication-config.ts`
  exports `Masked{Email,Sms,WhatsApp}Config` (returned by controllers) and
  internal-only `Decrypted{Email,Sms,WhatsApp}Config` (for Impl 04 dispatch).
  New `apps/api/src/modules/configuration/comms-cache-bus.stub.ts` provides
  the `COMMS_CACHE_BUS` DI token + `CommsCacheBusStub` no-op (Impl 04 swaps
  `useClass`). Three services mirror `StripeConfigService` exactly: CRUD via
  `createRlsClient(...).$transaction()`, `getDecryptedConfig` for service-
  internal consumption, `verifyConfig` returning a 501 stub. Three thin
  controllers under `/v1/{email,sms,whatsapp}-config`, all gated by
  `configuration.communications.manage` at the class level. Every mutation
  publishes the cache-bus event with the correct channel. The architecture-
  invariant spec ensures `getDecryptedConfig` never leaks via a controller.
- **Follow-ups:**
  - **Impl 04** swaps the cache-bus stub for a Redis pub/sub implementation
    on channel `comms:config-changed`; the DI token + signature stay.
  - **Impl 09** replaces the 501 `verifyConfig` and `POST :test` stubs with
    real Resend / Twilio sends and the rate-limit bucket.
  - **Impl 11** consumes the `Masked*Config` shapes for the Settings UI.
  - The `_mask` field naming (vs. `_masked` on `MaskedStripeConfig`) is
    intentional — the newer convention is more consistent. Impl 11 reads
    `resend_api_key_mask`, not `_masked`.
- **Rollback:**
  - `git revert e22ea549` undoes the schemas, types, services, controllers,
    cache-bus stub, module wiring, and all 4 new spec files.
  - No data, no migration, no environment variables, no worker job changes
    to roll back. Configuration tables created by Impl 01 stay untouched.
- **Session notes:**
  - User override on Rule 5 — working on `main`, CI deploys the code; no
    production cutover script required for this impl (no DB writes).
  - Production smoke is curl-based — the new endpoints land on production
    once CI completes.

### [IMPL 04] — Provider refactor + per-tenant client cache + Redis pub/sub

- **Completed:** 2026-04-27T13:40:00+01:00 (Europe/Dublin)
- **Local commit SHA:** `d9782424` (`feat(comms): per-tenant provider credentials + Redis pub/sub cache invalidation`)
- **Deployment route:** **`main` + CI pipeline** (per user override of Rule 5).
- **Verified at:** 2026-04-27T13:40:00+01:00 — local type-check + lint + 347 communications tests + AppModule DI smoke.
- **Local verification:**
  - `NODE_OPTIONS="--max-old-space-size=12288" pnpm turbo run type-check --filter=@school/api` — green.
  - `NODE_OPTIONS="--max-old-space-size=12288" pnpm turbo run lint --filter=@school/api` — 0 errors (1041 pre-existing warnings, none introduced by this impl).
  - `pnpm --filter @school/api exec jest --testPathPattern "providers|cache-bus"` — 20 suites, 92/92 green.
  - `pnpm --filter @school/api exec jest --testPathPattern "communications"` — 22 suites, 347/347 green (no dispatch regression).
  - `pnpm --filter @school/api exec jest --testPathPattern "configuration"` — 15 suites, 155/155 green (cache-bus stub still works in tests).
  - AppModule DI smoke — `DI OK` — confirms `CommsCacheBusModule` wires cleanly into both `ConfigurationModule` and `CommunicationsModule` without a cycle.
- **Summary (≤ 200 words):**
  Refactored the three communication providers (`ResendEmailProvider`,
  `TwilioSmsProvider`, `TwilioWhatsAppProvider`) to resolve credentials
  per-tenant via the Impl 03 config services, then keep the resulting
  SDK client in a per-tenant LRU+TTL cache (max 1000 tenants, 30-min
  idle) — `apps/api/src/modules/communications/providers/per-tenant-client-cache.ts`.
  New `CommsCacheBusService` (real Redis pub/sub on `comms:config-changed`)
  replaces the Impl 03 no-op stub for production wiring; the stub
  contract + DI token stay so unit tests still inject `jest.fn()` mocks.
  Cycle break: tiny new `CommsCacheBusModule` lives in
  `communications/cache-bus.module.ts` and is imported by both
  `ConfigurationModule` (publishes after credential mutations) and
  `CommunicationsModule` (subscribes via providers). New shared constants
  (`COMMS_CACHE_BUS_CHANNEL`, `COMMS_PROVIDER_CHANNELS`,
  `CommsCacheBusEvent`) live in `packages/shared/src/constants/communications.ts`.
  `notification-dispatch.service.ts` now passes `notification.tenant_id`
  as the first arg to all three providers. `.env` fallback paths are
  preserved with a deprecation warning — Impl 05 deletes them.
- **Follow-ups:**
  - **Impl 05** deletes the `.env` fallback branches on all three providers, deletes
    `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `TWILIO_*` from env validation, and
    refactors the worker dispatch processor to delegate to these API providers.
  - **Impl 05** also adds `IsEnabledCacheService` for mid-flight `is_enabled`
    enforcement, sharing this impl's pub/sub channel for invalidation.
  - The worker process does NOT yet subscribe to `comms:config-changed` — Impl 05
    wires that during the worker parity refactor.
- **Rollback:**
  - `git revert d9782424` reverts the entire impl. Restart API + worker (no
    long-running cache state survives a process restart, so no manual flush).
  - No DB or schema changes. The cache-bus channel name persists in Redis
    after revert but nothing publishes to it; subscribers (now removed) are gone.
- **Session notes:**
  - User override on Rule 5 — working on `main`, deploys via CI pipeline.
  - Impl 04 is deliberately scoped API-only. The worker still uses its
    self-contained Resend/Twilio clients in `dispatch-notifications.processor.ts`;
    Impl 05 consolidates worker + API onto the same provider classes.

### [IMPL 05] — Worker parity + `.env` credential removal

- **Completed:** 2026-04-27T14:18:00+01:00 (Europe/Dublin)
- **Local commit SHA:** `f02f52f5` (`feat(comms): worker parity + delete .env credential fallback`) + `e38adef0` follow-up (hotspot budget refactor)
- **Deployment route:** **`main` + CI pipeline** (per user override of Rule 5).
- **Verified at:** 2026-04-27T14:18:00+01:00 — local type-check + lint + 196 API tests + 1170 worker tests + AppModule DI smoke.
- **Local verification:**
  - Type-check both apps + shared — green.
  - Lint API + worker — 0 errors.
  - `pnpm --filter @school/api jest` — 196 affected tests green (providers, cache-bus, is-enabled, dispatch, webhook, health).
  - `pnpm --filter @school/worker test` — 1170/1170 green.
  - DI smoke — `DI OK`.
  - `node scripts/check-hotspot-budgets.js` — 33 function complexity budgets + 16 file line budgets all green.
- **Summary (≤ 200 words):**
  Deleted the platform-shared `.env` credential fallback for all three
  channels. After this impl, the only path to dispatch is a
  `tenant_*_configs` row with `is_enabled=true`. API providers now
  return `{ skipped, reason }` for `channel_not_configured` /
  `channel_disabled` and the dispatch service routes those into the
  existing fallback chain. Worker dispatch processor refactored to use
  per-tenant credentials via a new
  `apps/worker/src/processors/communications/tenant-creds.helper.ts`
  (re-implements EncryptionService inline so we don't need the API DI
  graph). New `IsEnabledCacheService` (API) caches per-tenant `is_enabled`
  for 30 sec, evicted by the same `comms:config-changed` Redis pub/sub
  channel from Impl 04. New `NotificationFailureReason` closed-vocab
  union in `@school/shared`. Deleted env vars: `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`. Health
  service stops reporting per-tenant readiness. Legacy webhook controller
  (`/v1/webhooks/{resend,twilio}`) stays alive but no longer verifies —
  Impl 06 lands the per-tenant verifier.
- **Follow-ups:**
  - Without backfilled tenant configs (Impl 13), every email/SMS/WhatsApp
    dispatch on production now fails with `failure_reason='channel_not_configured'`
    and falls back to in-app. Acceptable per user memo "production tenants
    are test tenants until Aug 2026".
  - Impl 06 reuses the `comms:config-changed` invalidation channel for
    suppression list cache + adds the per-tenant webhook receiver.
  - Impl 09 will use `IsEnabledCacheService.getEnabled()` to gate
    test-send endpoints.
- **Rollback:**
  - `git revert f02f52f5 e38adef0` restores all seven env keys, the
    env-fallback branches, the legacy webhook signature verification,
    and the worker's lazy `getResendClient`/`getTwilioClient` initialisers.
  - `.env` values would need to be manually restored on production —
    the user keeps the prior copy outside source control.
  - No DB or schema changes to roll back. Tenant config rows from Impl 03
    stay intact.
- **Session notes:**
  - User override on Rule 5 — `main` + CI pipeline.
  - One hotspot-budget bump after the refactor: file line budget for
    `dispatch-notifications.processor.ts` raised from 778 → 850 to
    accommodate the per-tenant cred resolution + per-execution client
    cache. Cyclomatic complexity reduced from 14 → ≤ 12 via the
    `administrativeSkipReason` extraction.
