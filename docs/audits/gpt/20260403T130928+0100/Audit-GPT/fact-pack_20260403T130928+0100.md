# Fact Pack

Timestamp: `20260403T130928+0100`
Audit root: `/Users/ram/Desktop/SDB`
Canonical raw log: [`commands-run_20260403T130928+0100.txt`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/commands-run_20260403T130928+0100.txt)

## 1. Repository Shape And Scale

- Root workspace contains `apps/api`, `apps/web`, `apps/worker`, `packages/shared`, `packages/prisma`, `packages/ui`, `packages/eslint-config`, `packages/eslint-plugin-school`, `packages/tsconfig`.
- One extra non-product package manifest exists at `./.opencode/package.json`.
- Live TypeScript/TSX file count across `apps/` and `packages/`: `3,458`.
- Live test-file scan across standard `*.spec.*` / `*.test.*` patterns in `apps/` and `packages/`: `733`.
- Backend module directories under `apps/api/src/modules`: `59`.
- Frontend page files under `apps/web/src/app`: `337`.
- Frontend shared/component files counted in `apps/web/src/components`: `36`.
- Frontend page-local `_components` files counted under `apps/web/src/app`: `179`.
- Worker processor files under `apps/worker/src`: `93`.
- Prisma model count in `packages/prisma/schema.prisma`: `265`.

## 2. Mandatory Pre-read And Repo Path Corrections

- The user prompt referenced `architecture/...`; this checkout stores those files under `docs/architecture/...`.
- Mandatory pre-read completed for:
  - [`CLAUDE.md`](/Users/ram/Desktop/SDB/CLAUDE.md)
  - [`docs/architecture/danger-zones.md`](/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md)
  - [`docs/architecture/module-blast-radius.md`](/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md)
  - [`docs/architecture/state-machines.md`](/Users/ram/Desktop/SDB/docs/architecture/state-machines.md)
  - [`docs/architecture/event-job-catalog.md`](/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md)
  - [`docs/plans/context.md`](/Users/ram/Desktop/SDB/docs/plans/context.md)
  - [`package.json`](/Users/ram/Desktop/SDB/package.json)
  - [`turbo.json`](/Users/ram/Desktop/SDB/turbo.json)

## 3. Monorepo And Build Shape

- Root scripts include `lint`, `type-check`, `test`, `test:health`, `check:boundaries`, `check:test-gate`, `hotspots:check`, `audit:rls`, `doctor`.
- Turbo tasks are `build`, `dev`, `lint`, `type-check`, `test`, `test:changed`.
- Apps present: API, web, worker.
- Packages present: shared, prisma, ui, eslint-config, eslint-plugin-school, tsconfig.

## 4. Backend Module Inventory And Hotspots

Largest backend modules by non-spec TS line count from the central inventory:

- `behaviour`: `74` files, `24,104` lines
- `pastoral`: `66` files, `19,810` lines
- `gradebook`: `49` files, `15,635` lines
- `finance`: `37` files, `7,637` lines
- `scheduling`: `28` files, `7,393` lines
- `sen`: `58` files, `6,420` lines
- `reports`: `22` files, `6,403` lines
- `payroll`: `25` files, `6,312` lines

Cross-module import hotspot counts from the central inventory:

- `gradebook`: `32`
- `pastoral`: `23`
- `staff-wellbeing`: `21`
- `gdpr`: `21`
- `behaviour`: `20`
- `child-protection`: `14`
- `attendance`: `14`
- `early-warning`: `13`
- `communications`: `13`
- `sen`: `12`

Backend wiring observation:

- [`apps/api/src/app.module.ts`](/Users/ram/Desktop/SDB/apps/api/src/app.module.ts) imports a large central app graph spanning global infrastructure plus `59` feature modules.
- The largest module by code volume (`behaviour`) is also a top-five coupling hotspot.

## 5. Frontend And Worker Inventory

Frontend:

- `337` route page files.
- `32` discovered frontend test files after excluding snapshot folders and `tsconfig.test*`.
- Visual/E2E test directories exist under `apps/web/e2e/visual*`.
- Frontend size/test density is materially asymmetric: `337` pages versus `32` test files.

Largest frontend page files:

- [`apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx>)
- [`apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx>)
- [`apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx>)
- [`apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx>)
- [`apps/web/src/app/[locale]/(school)/wellbeing/dashboard/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/wellbeing/dashboard/page.tsx>)

Worker:

- `93` processor files and `100` worker spec files.
- Worker cron registry is large enough to merit direct scrutiny; the architecture catalog documents `19` queues, `~60` job types, and `34` cron registrations.

Largest worker files:

- [`apps/worker/src/processors/early-warning/signal-collection.utils.ts`](/Users/ram/Desktop/SDB/apps/worker/src/processors/early-warning/signal-collection.utils.ts)
- [`apps/worker/src/cron/cron-scheduler.service.ts`](/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts)
- [`apps/worker/src/processors/communications/dispatch-notifications.processor.ts`](/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts)
- [`apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`](/Users/ram/Desktop/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts)
- [`apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`](/Users/ram/Desktop/SDB/apps/worker/src/processors/pastoral/escalation-timeout.processor.ts)

## 6. Largest / High-Risk Source Files

Backend high-size files from the central inventory:

- [`apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts): `1,161` lines
- [`apps/api/src/modules/households/households.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/households/households.service.ts): `1,122` lines
- [`apps/api/src/modules/homework/homework-analytics.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/homework/homework-analytics.service.ts): `1,088` lines
- [`apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts): `1,078` lines
- [`apps/api/src/modules/behaviour/safeguarding-concerns.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/safeguarding-concerns.service.ts): `1,070` lines
- [`apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/pastoral-dsar.service.ts): `1,055` lines
- [`apps/api/src/modules/attendance/attendance-upload.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/attendance/attendance-upload.service.ts): `1,040` lines
- [`apps/api/src/modules/behaviour/behaviour.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts): `1,011` lines

## 7. Test Execution Results

Observed in the raw validation pass:

- Backend `pnpm test` in `apps/api`:
  - `567` suites passed
  - `7,785` tests passed
  - `9` snapshots passed
  - Runtime `42.093s`
- Worker `pnpm test` in `apps/worker`:
  - `100` suites passed
  - `666` tests passed
  - Runtime `6.03s`
- Shared `pnpm test` in `packages/shared`:
  - `28` suites passed
  - `746` tests passed
  - Runtime `5.297s`

Important observations:

- No failing suites were observed in the central test run.
- No explicit Jest open-handle or forced-exit warnings were found in the raw log.
- Many backend suites intentionally exercise negative/error paths and emit logger noise while still passing.
- Simple file scan found `572` backend `*.spec.ts` files, while `apps/api pnpm test` executed `567` suites. Treat that difference as a routing/config signal, not as a failure.

## 8. Build / Lint / Type-check Results

- `pnpm turbo run lint`: passed with `0` errors and `296` warnings in the API package summary.
- `pnpm turbo run type-check`: passed.
- `pnpm turbo run build`: passed, including `next build`.

Warning concentrations surfaced during lint/build:

- `school/no-untranslated-strings` warnings are abundant in web lint/build output.
- `max-lines` warnings recur in large API and web files.
- `school/no-cross-module-internal-import` warnings exist in API lint output.
- The web build emitted a Node module-type warning for [`packages/ui/tailwind.config.ts`](/Users/ram/Desktop/SDB/packages/ui/tailwind.config.ts).
- Lint/build logs reference the repo’s iCloud canonical path (`/Users/ram/Library/Mobile Documents/.../SDB`) instead of only `/Users/ram/Desktop/SDB`; this is an environmental path-normalisation oddity, not evidence of two separate repos.

## 9. Code Quality / Debt Markers

- `@ts-ignore` / `@ts-expect-error` matches in app source scan: none observed.
- The prompt’s naive `: any|as any` grep produced false positives in comments and identifiers; no confirmed production type escapes have been established from that heuristic.
- Technical debt marker scan returned non-zero results in `62` files.

Notable debt hotspots by marker count:

- [`apps/api/src/modules/engagement/form-templates.service.spec.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/engagement/form-templates.service.spec.ts)
- [`apps/api/src/modules/reports/compliance-report.service.spec.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/reports/compliance-report.service.spec.ts)
- [`apps/api/src/modules/gradebook/report-cards/report-card-template.service.spec.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/report-cards/report-card-template.service.spec.ts)
- [`apps/api/src/modules/engagement/form-templates.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/engagement/form-templates.service.ts)
- [`apps/api/src/modules/pastoral/services/pastoral-notification.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/pastoral-notification.service.ts)

## 10. Security / RLS Inventory

Prisma/RLS hard facts:

- `265` Prisma models total.
- Project RLS audit script result (`npx tsx scripts/audit-rls.ts`):
  - `265` total models
  - `252` models with `tenant_id`
  - `252` canonical RLS policies in `packages/prisma/rls/policies.sql`
  - Result: `PASS`
- The RLS audit script lists these known non-RLS exceptions:
  - `users` — platform-level
  - `survey_responses` — anonymity by design
  - `survey_participation_tokens` — anonymity by design
  - `gdpr_export_policies` — platform-level
- The `survey_responses` exception is explicitly documented in:
  - [`packages/prisma/rls/policies.sql:2266`](/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql#L2266)
  - [`packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql:7`](/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql#L7)

Important methodological note:

- The prompt’s direct `tenant model names vs RLS table names` shell comparison is not trustworthy in this repo because Prisma model names map to `@@map("snake_case_tables")`.
- The authoritative evidence base is the repo audit script plus direct inspection of the documented exceptions above.
- Treat the `survey_responses` exception as a design decision that must be evaluated for safety, not as a confirmed undocumented defect.

Additional early security signals from targeted follow-up checks:

- Unsafe raw SQL identifiers appear in production code at:
  - [`apps/api/src/common/middleware/rls.middleware.ts`](/Users/ram/Desktop/SDB/apps/api/src/common/middleware/rls.middleware.ts)
  - [`apps/api/src/modules/finance/payments.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts)
  - [`apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`](/Users/ram/Desktop/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts)
- Repo governance script result (`node scripts/check-raw-sql-governance.js`):
  - `656` raw SQL call sites total
  - `71` allowlisted production call sites
  - `585` auto-allowed test/seed/etc call sites
  - `0` ungoverned production call sites
  - Result: `PASS`
- Parameterized raw SQL usage also appears in health checks, sequence generation, household operations, payroll payslips, compliance retention, engagement processors, notifications processors, and worker base job helpers.
- Safety of those usages is not resolved in Phase 1; Subagent 4 and Subagent 6 must verify governance, context-setting, and blast radius.

## 11. CI / Deploy / Ops Inventory

- `.github/workflows/deploy.yml` does not exist in this checkout.
- Deployment is embedded in [`ci.yml`](/Users/ram/Desktop/SDB/.github/workflows/ci.yml) with four jobs:
  - `ci`
  - `deploy`
  - `integration`
  - `visual`
- CI includes:
  - secret scanning via `gitleaks`
  - `pnpm audit`
  - worker processor spec check
  - i18n completeness check
  - hotspot budget check
  - RLS audit script
  - raw SQL governance check
  - lint/type-check
  - module cohesion/tier/global provider/boundary/cross-module dependency checks
  - unit coverage enforcement
  - integration/e2e tests
  - build
- Deploy job uses `appleboy/ssh-action` to run `scripts/deploy-production.sh` on `/opt/edupod/app`.
- Docker compose includes `postgres`, `pgbouncer` in transaction mode, `redis`, `meilisearch`.
- One PM2 ecosystem file exists: [`ecosystem.config.cjs`](/Users/ram/Desktop/SDB/ecosystem.config.cjs).
- [`apps/api/src/main.ts`](/Users/ram/Desktop/SDB/apps/api/src/main.ts) validates env before bootstrap, enables Helmet CSP, CORS, compression, cookie parsing, Swagger outside production, and graceful shutdown hooks.
- [`apps/api/src/instrument.ts`](/Users/ram/Desktop/SDB/apps/api/src/instrument.ts) loads dotenv manually before bootstrap and initializes Sentry with UUID scrubbing and header redaction.

## 12. Top Candidate High-Risk Domains For Deep Review

Prioritise these in Phase 2:

1. `behaviour`
2. `pastoral`
3. `gradebook`
4. `finance`
5. `auth` + `rbac` + `gdpr` + common security infrastructure
6. `scheduling` + `scheduling-runs`
7. `communications` + worker notification flows
8. `regulatory`
9. `staff-wellbeing`
10. worker cron orchestration and tenant-aware job infrastructure

## 13. Constraints For Subagents

- Do not repeat repo-wide discovery unless verifying a contradiction.
- Use this fact pack as the canonical baseline for counts, validation outcomes, and initial hotspots.
- Treat the RLS parsed comparison as authoritative over the naive shell `comm` heuristic.
- Distinguish facts from signals from inferences in every subagent report.
