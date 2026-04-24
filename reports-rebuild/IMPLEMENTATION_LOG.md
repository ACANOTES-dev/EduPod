# Reports Rebuild — Implementation Log

> **What this is:** The single source of truth for the Reports rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.

---

## 1. Work summary (read this first)

The Reports module has 20 pages, 64 endpoints, 20 services, a `SavedReport` table, AI narration, scheduled reports, report alerts, and PDF/Excel export infrastructure — but almost all of it is wired to mock data, the custom report builder's execute path is stubbed, scheduled reports and alerts have no worker triggers, Board and Compliance reports return stubbed aggregates, the Word export is not implemented, and report titles use inconsistent translation-key namespaces. The rebuild fixes every one of those gaps, shifts the KPI dashboard from stale roster metrics to 10 movable weekly metrics with info-icon tooltips, and adds the custom report builder as a real first-class feature backed by a curated subject registry (primary subject + joined facets across ~11 subjects with permission-scoped field trees per subject). AI is the flagship capability: three features (narration, ask-AI, predictions) each gated behind a `tenant_ai_flags` toggle (default off; tenants opt in and absorb Anthropic cost). Saved reports can be shared into the inbox as PDF/Excel/Word attachments, reusing the existing audience picker and attachment pipeline.

See `PLAN.md` for full scope, the 10 KPIs, the 11 report subjects, the field-tree contract, AI flag model, sharing flow, and export pipeline. See `implementations/NN-*.md` for per-phase specs.

**Scope of the rebuild (22 implementations, 5 waves):**

- **Wave 1 — Foundation:** schema migration for all new tables (`saved_report_drafts`, `scheduled_report_run`, `report_alert_run`, `report_share_log`, `reports_kpi_tenant_preferences`), schema extensions to `saved_reports`, permission seeding, AI flag module-key additions.
- **Wave 2 — Backend core:** subject registry + query engine, real KPI dashboard service, export pipeline (PDF/Excel/Word), finish domain report services, Board + Compliance aggregation.
- **Wave 3 — Backend integrations:** scheduled-reports worker, alerts worker, AI narration, AI ask-AI, AI predictions, report sharing to inbox.
- **Wave 4 — Frontend:** hub + KPI dashboard UI, individual report pages cleanup (kill mocks + title sweep), custom builder UI, scheduled/alerts UI, AI panel UI, share dialog + saved-reports management, Board/Compliance UI, reports settings page.
- **Wave 5 — Polish:** translations, mobile responsiveness, a11y, smoke tests, docs.

**Untouched by this rebuild:**

- Recharts stays as the charting library. No switch to D3/ECharts.
- `AnthropicClientService` and `ai_logs` infrastructure are reused as-is.
- `tenant_ai_flags` table shape is unchanged (only new `module_key` values are registered).
- The existing `attendance-analytics`, `grade-analytics`, `demographics`, `admissions-analytics`, `staff-analytics`, `cross-module-insights`, `student-progress` services are real already and stay as-is except for small additions.
- The Morphing Shell and sub-strip pattern from `docs/plans/ux-redesign-final-spec.md` are the navigation contract.

---

## 2. Rules every session must follow

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; deployments serialise when they share a service restart target.** Deploy order is **first-come-first-served, not by implementation number**. If you're running task 14 and it finishes coding before task 12, task 14 deploys first. Before entering the deploy phase, re-read the log; if another implementation in your wave is currently `deploying` AND shares a service restart target (API / worker / web — consult §3's deployment matrix), wait (poll every 3 minutes) until it flips to `completed`, then proceed. If it doesn't share a restart target, you can deploy concurrently without conflict.

**Rule 5 — Deploy via GitHub CI only. Never deploy by SSHing into production.** Every phase follows the same release flow: commit locally → push to `main` → GitHub Actions runs CI → on green, GitHub Actions deploys to production. Direct rsync / patch-application to the server is prohibited for this rebuild. This is a deliberate reversal of the flow used by prior rebuilds (new-inbox, new-admissions). The reason is that this rebuild lands production-grade changes across schema + AI cost + billing-adjacent surfaces, and the CI gates (type-check, lint, test, coverage, regression) are the safety net we rely on.

**Rule 6 — GitHub CI deployment flow for every phase.**

1. Commit locally: `git commit -m "feat(reports): <phase title> — impl NN"` (conventional commit format).
2. Push to `main`: `git push origin main`.
3. Watch the CI run: `gh run watch --exit-status` or `gh run list --limit 1 && gh run view <id>`.
4. If CI fails:
   - Read the failure via `gh run view <id> --log-failed`.
   - Fix in a **new commit** (never amend a pushed commit). Push again. Repeat until green.
   - If the failure is flaky, rerun via `gh run rerun <id>`; do not treat infrastructure flakes as real failures — but verify the second run truly passes before moving on.
5. Once CI + deploy job complete green, verify the deploy landed:
   - Hit `/api/health` on the production API and confirm 200.
   - Smoke test the specific surface your phase touched (dashboard, builder, worker logs, etc.).
   - If deploy succeeded but runtime is broken, fix forward with another commit and push. Do not attempt to roll back mid-flight.
6. Record the commit SHA and CI run URL in the completion record.

Server access is available via `ssh root@46.62.244.139` for **diagnostic and emergency use only**: reading PM2 logs (`pm2 logs api --lines 100`), checking DB state (`psql`), inspecting object-storage buckets. **Do not** `git pull`, `git fetch`, `git am`, `pnpm db:migrate`, `pm2 restart`, or otherwise mutate production state from SSH. All changes flow through a pushed commit. The only exception is a production incident (the CI pipeline is down AND something is actively broken) — document it in the completion record if used.

Never mix routes on one commit: a commit that has been rsynced cannot then be pushed to GitHub (the working tree on prod will drift); a commit that has been pushed must not then be rsynced over. Per project memory: never mix routes on one commit.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the production commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before deploying. Do NOT deploy a breaking change and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** RLS on new tables (`FORCE ROW LEVEL SECURITY` with a `<table>_tenant_isolation` policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)` for all writes, strict TypeScript (no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception), logical CSS properties only on frontend (no `ml-`, `mr-`, etc.), `react-hook-form` + Zod for new forms. The `CLAUDE.md` file in the repo root is ground truth.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — AI features must NOT be enabled by default.** Every new `tenant_ai_flags` row for reports seeds with `enabled = false`. The AI enable/disable toggles live in `Settings → Reports`. A tenant who has not opted in sees no AI UI and no AI endpoint works for them. This is load-bearing for cost control — tenants pay for AI, not the platform.

**Rule 12 — Custom builder queries MUST go through the subject registry + query engine.** No ad-hoc SQL. No Prisma queries outside the engine for builder execution. The engine enforces RLS, permission-scoping, row caps, and query timeout. Bypassing it is a privacy and performance breach.

**Rule 13 — Architecture docs must be updated when your implementation changes the shape.** Per `.claude/rules/architecture-policing.md`: if you add cross-module dependencies update `docs/architecture/module-blast-radius.md`; if you add a BullMQ job update `event-job-catalog.md`; if you add a state machine update `state-machines.md`. These are not optional; treat them the same as failing tests.

**Rule 14 — Feature map update is deferred to the last phase.** Do not touch `docs/architecture/feature-map.md` §19 during individual implementations. Phase 22 (polish) is responsible for a single coherent update at the end of the rebuild. This is per `.claude/rules/feature-map-maintenance.md`.

**Rule 15 — Every destructive change gets a rollback note.** If an implementation renames a table, drops a column, removes an endpoint, or deletes a permission, record in §5 the exact `git revert <sha>` command and any manual DB rollback that would be needed. The owner relies on this log to recover.

**Rule 16 — Production is a live test environment for the NHQS and stress-test tenants, not end users.** Treat failures as high-priority but not catastrophic. Fix forward with a new commit; do not rollback unless a migration genuinely needs reversing. The production tenants are test accounts per project memory.

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND deploy on a first-come-first-served basis — **not** in implementation-number order. Deployment only serialises (polling every 3 minutes) when another sibling is already `deploying` **and** shares a service restart target (API / worker / web, per the matrix below).

| Wave       | Implementations                | Hard dependency | Rationale                                                                                                                                                                                                     |
| ---------- | ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01                             | None            | Schema foundation — every new table lands in one coordinated migration. Must complete before any backend or frontend work.                                                                                    |
| **Wave 2** | 02, 03, 04, 05, 06, 07         | Wave 1 complete | Backend core. Subject registry + query engine, KPI dashboard service, export pipeline, finish domain services, Board + Compliance aggregation. All touch the API; deployments serialise on `pm2 restart api`. |
| **Wave 3** | 08, 09, 10, 11, 12, 13         | Wave 2 complete | Backend integrations. Worker cron jobs, AI services, sharing service. Mixed restart matrix (API + worker).                                                                                                    |
| **Wave 4** | 14, 15, 16, 17, 18, 19, 20, 21 | Wave 3 complete | Frontend. Hub, individual pages, builder, scheduled/alerts, AI panel, share dialog, Board/Compliance UI, settings. All deploy with `pm2 restart web` so deploys serialise within the wave.                    |
| **Wave 5** | 22                             | Wave 4 complete | Polish. Translations, mobile, a11y, smoke tests, feature-map, docs. Single implementation.                                                                                                                    |

### Deployment targets per implementation

This matrix is what you consult before deploying. "Who restarts" determines the serialisation rule.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ❌             | ❌          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ✅          | ❌             | ❌          |
| 05   | ❌        | ✅          | ❌             | ❌          |
| 06   | ❌        | ✅          | ❌             | ❌          |
| 07   | ❌        | ✅          | ❌             | ❌          |
| 08   | ❌        | ❌          | ✅             | ❌          |
| 09   | ❌        | ❌          | ✅             | ❌          |
| 10   | ❌        | ✅          | ❌             | ❌          |
| 11   | ❌        | ✅          | ❌             | ❌          |
| 12   | ❌        | ✅          | ❌             | ❌          |
| 13   | ❌        | ✅          | ❌             | ❌          |
| 14   | ❌        | ❌          | ❌             | ✅          |
| 15   | ❌        | ❌          | ❌             | ✅          |
| 16   | ❌        | ❌          | ❌             | ✅          |
| 17   | ❌        | ❌          | ❌             | ✅          |
| 18   | ❌        | ❌          | ❌             | ✅          |
| 19   | ❌        | ❌          | ❌             | ✅          |
| 20   | ❌        | ❌          | ❌             | ✅          |
| 21   | ❌        | ❌          | ❌             | ✅          |
| 22   | ❌        | ❌          | ❌             | ✅          |

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                                 | Wave | Depends on     | Status      | Completed at                   | Commit SHA |
| --- | ----------------------------------------------------- | ---- | -------------- | ----------- | ------------------------------ | ---------- |
| 01  | Schema foundation                                     | 1    | —              | `completed` | 2026-04-24T17:00 Europe/Dublin | `5e448ed0` |
| 02  | Report Subject Registry + Query Engine                | 2    | 01             | `deploying` |                                |            |
| 03  | KPI Dashboard Service                                 | 2    | 01             | `deploying` |                                |            |
| 04  | Export Service (PDF/Excel/Word)                       | 2    | 01             | `deploying` |                                |            |
| 05  | Domain Report Services (finish aggregation)           | 2    | 01             | `pending`   |                                |            |
| 06  | Board Report aggregation                              | 2    | 01             | `pending`   |                                |            |
| 07  | Compliance Report aggregation                         | 2    | 01             | `pending`   |                                |            |
| 08  | Scheduled Reports Worker                              | 3    | 01, 02, 04     | `pending`   |                                |            |
| 09  | Report Alerts Worker                                  | 3    | 01, 03         | `pending`   |                                |            |
| 10  | AI Flag registration + AI Narration service           | 3    | 01, 03         | `pending`   |                                |            |
| 11  | AI Ask-AI service                                     | 3    | 01, 02         | `pending`   |                                |            |
| 12  | AI Predictions service                                | 3    | 01             | `pending`   |                                |            |
| 13  | Report Sharing service                                | 3    | 01, 04         | `pending`   |                                |            |
| 14  | Reports Hub + KPI Dashboard UI                        | 4    | 01, 03         | `pending`   |                                |            |
| 15  | Individual Report Pages UI (kill mocks + title fixes) | 4    | 01, 05         | `pending`   |                                |            |
| 16  | Custom Report Builder UI                              | 4    | 01, 02, 11     | `pending`   |                                |            |
| 17  | Scheduled Reports + Alerts UI                         | 4    | 01, 08, 09     | `pending`   |                                |            |
| 18  | AI Panel UI (Ask-AI, Narration, Predictions)          | 4    | 01, 10, 11, 12 | `pending`   |                                |            |
| 19  | Share-to-Inbox Dialog + Saved Reports management      | 4    | 01, 13, 16     | `pending`   |                                |            |
| 20  | Board Report + Compliance Report UI                   | 4    | 01, 06, 07     | `pending`   |                                |            |
| 21  | Reports Settings Page                                 | 4    | 01, 10, 11, 12 | `pending`   |                                |            |
| 22  | Translations, mobile, a11y, smoke tests, docs         | 5    | 14–21          | `pending`   |                                |            |

"Depends on" lists the minimum set that must be `completed` before this one can start. In strict wave order these are satisfied automatically — the column exists so a future automation (and the human) can double-check.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Commit:** <sha>
- **CI run:** <gh run URL>
- **Deployed to production:** yes / no (if no, explain)
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Rollback:** exact `git revert` command + any manual DB rollback if reverting.
- **Session notes (optional):** anything weird or surprising.
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema foundation

- **Completed:** 2026-04-24T17:00 Europe/Dublin
- **Commit:** `ef3beb84` (feat), `5e448ed0` (type-check heap bump fix-forward)
- **CI run:** https://github.com/ACANOTES-dev/EduPod/actions/runs/24898354041
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Lands all DB, Prisma, permission, shared-type, and AI-flag seed
  changes Wave 2+ needs. Five new tenant-scoped tables with FORCE RLS +
  `<table>_tenant_isolation` policies: `saved_report_drafts` (builder
  autosave), `scheduled_report_runs`, `report_alert_runs`,
  `report_share_log`, `reports_kpi_tenant_preferences`. Extends
  `saved_reports` with `description`, `visibility` (private|shared),
  `is_favorite`, `last_executed_at`, `last_executed_by` + tenant+visibility
  index. Four new enums: `SavedReportVisibility`, `ScheduledReportRunStatus`,
  `ReportAlertRunOutcome`, `ReportShareFormat`.

  Six new admin-tier permissions (`reports.builder`, `reports.share`,
  `reports.settings`, `reports.ai.{narration,ask_ai,predictions}`) seeded
  globally and backfilled onto every existing tenant's system roles
  (owner/principal/VP/admin → all six; accounting → builder+share;
  front_office → builder).

  Three new tenant AI flag module keys seeded `enabled=false` for every
  tenant (existing via migration.sql CROSS JOIN; new tenants via
  `seedReportsDefaultsForTenant` called from `TenantsService.createTenant`
  and `packages/prisma/seed.ts`). Shared namespace `@school/shared/reports`
  (subjects, ai-flags, kpi, saved-report-draft, share) exported via
  package.json subpath. RLS leakage spec
  (`apps/api/test/reports-rebuild-foundation.rls.spec.ts`) with 12 passing
  cases over all five tables.

- **Follow-ups:**
  - Wave 2 impls 02+ can import `ReportSubjectKey`, `REPORT_SUBJECT_KEYS`,
    `reportsAiModuleKeySchema`, and `SavedReportDraft*` schemas from
    `@school/shared/reports`.
  - Wave 2 impl 02 (query engine) owns the `saved_report_drafts` RLS
    service; its field-tree enforcement is the guarantee that makes the
    tenant_id-isolated table safe.
  - `seed/system-roles.ts` still doesn't reference the new reports._
    permissions — fresh `pnpm db:seed` tenants get them only through the
    `PERMISSION_SEEDS` + `SYSTEM_ROLE_PERMISSIONS` path in the API layer.
    Integration tests use the legacy seed path, so no action needed in
    Wave 1. Wave 4 UI impls should verify role-granting for the reports._
    keys when they ship.
- **Rollback:** `git revert 5e448ed0 ef3beb84`. Manual DB rollback to drop
  the 5 new tables + the added `saved_reports` columns + the 4 new enums:
  ```
  DROP TABLE reports_kpi_tenant_preferences, report_share_log,
    report_alert_runs, scheduled_report_runs, saved_report_drafts CASCADE;
  ALTER TABLE saved_reports
    DROP COLUMN description, DROP COLUMN visibility,
    DROP COLUMN is_favorite, DROP COLUMN last_executed_at,
    DROP COLUMN last_executed_by;
  DROP TYPE "ReportShareFormat", "ReportAlertRunOutcome",
    "ScheduledReportRunStatus", "SavedReportVisibility";
  ```
  The AI flag backfill rows and permission inserts are harmless with no
  code reading them — leave in place.
- **Session notes:**
  - First CI run failed with OOM (exit 134) in `@school/api#type-check` at
    the previous 12G heap cap; bumped to 14G in `apps/api/package.json`
    (`5e448ed0`). GH runners are 16G, so 14G leaves ~2G for the host VM.
  - First parallel-integration run failed on 5 platform-admin test suites
    (403 Forbidden on `/api/v1/admin/tenants*`). A plain `gh run rerun
--failed` came back green — unrelated to this phase. The failing
    specs all auth as the platform admin and hit the Redis-backed
    `PlatformOwnerGuard`; the race appears to be with the Redis
    set-population helper. Flagged as a latent flake for the next session
    to investigate.
  - `.husky/pre-commit` updated to honour an outer `NODE_OPTIONS` override
    (was hard-coded to 6144). The 6G cap from ff6a8a05 still applies as
    the default.
