# Reproducibility Appendix — 02-04-2026

## Run Metadata

- Timestamp used: `02-04-2026`
- Root path audited: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB`
- Canonical raw log: `Audit-GPT/Audit-GPT-2/commands-run_02-04-2026.txt`
- Canonical shared discovery summary: `Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`

## Major Commands Run

Phase 1 repository inventory:

- `pwd`
- `find . -maxdepth 2 -type d | sort | sed 's#^\\./##'`
- `ls -la`
- `find apps packages -maxdepth 2 -type d | sort`
- `find apps packages \\( -name "*.ts" -o -name "*.tsx" \\) | wc -l`
- `find apps packages \\( -name "*.ts" -o -name "*.tsx" \\) | xargs wc -l | sort -rn | head -60`
- `find apps packages \\( -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.test.ts" -o -name "*.test.tsx" \\) | wc -l`

Phase 1 runtime verification:

- `cd apps/api && pnpm test`
- `cd ../../apps/worker && pnpm test`
- `cd ../../packages/shared && pnpm test`
- `pnpm turbo run lint`
- `pnpm turbo run type-check`
- `pnpm turbo run build`

Phase 1 security / ops inventory:

- Prisma model, tenant, and RLS inventory commands against `schema.prisma`, `policies.sql`, and migration `post_migrate.sql`
- `cat .github/workflows/ci.yml`
- `cat docker-compose.yml`
- `cat .env.example`
- Husky and PM2 config inspection

Targeted verification commands after subagent returns:

- `nl -ba apps/api/src/modules/approvals/approval-requests.service.ts | sed -n '150,370p'`
- `nl -ba apps/worker/src/cron/cron-scheduler.service.ts | sed -n '280,310p'`
- `nl -ba apps/worker/src/processors/communications/retry-failed.processor.ts | sed -n '1,130p'`
- `nl -ba apps/worker/src/processors/notifications/dispatch-queued.processor.ts | sed -n '45,90p'`
- `nl -ba apps/worker/src/processors/communications/dispatch-notifications.processor.ts | sed -n '650,730p'`
- `nl -ba .env.example | sed -n '1,40p'`
- `nl -ba scripts/setup.sh | sed -n '125,140p'`
- `nl -ba apps/api/src/instrument.ts | sed -n '1,20p'`
- `nl -ba scripts/doctor.mjs | sed -n '110,125p'`
- `nl -ba apps/api/src/modules/config/env.validation.ts | sed -n '36,48p'`
- `nl -ba apps/worker/src/env.validation.ts | sed -n '1,18p'`
- `nl -ba apps/api/src/modules/search/meilisearch.client.ts | sed -n '1,30p'`
- `nl -ba apps/web/e2e/playwright.config.ts | sed -n '1,80p'`
- `nl -ba apps/web/e2e/visual/attendance.spec.ts | sed -n '1,80p'`
- `nl -ba apps/web/e2e/visual/finance.spec.ts | sed -n '1,100p'`
- `nl -ba apps/web/src/app/[locale]/(school)/layout.tsx | sed -n '470,560p'`
- `nl -ba apps/web/src/providers/auth-provider.tsx | sed -n '255,295p'`
- `rg -n "confirmAllocations|describe\\('PaymentsService|it\\(|test\\(" apps/api/src/modules/finance/payments.service.spec.ts`
- `nl -ba apps/api/src/modules/finance/payments.service.ts | sed -n '260,390p'`
- `nl -ba scripts/deploy-production.sh | sed -n '296,371p'`
- `nl -ba docs/runbooks/rollback.md | sed -n '1,90p'`

## Commands That Failed or Returned Non-Zero

- `cd apps/api && pnpm test`
  - non-zero because `apps/api/src/modules/school-closures/school-closures.service.spec.ts` failed
- `cd apps/worker && pnpm test`
  - non-zero because `redis.helpers.spec.ts`, `search.helpers.spec.ts`, and `compliance-execution.processor.spec.ts` failed
- `pnpm turbo run lint`
  - non-zero because `@school/worker` lint failed
- `pnpm turbo run type-check`
  - non-zero because `@school/worker` type-check failed on `compliance-execution.processor.spec.ts`
- initial seventh `spawn_agent`
  - failed because the environment enforced a six-agent concurrent limit

## Files Explicitly Read in the Main Session

Mandatory pre-read:

- `CLAUDE.md`
- `Plans/context.md`
- `architecture/danger-zones.md`
- `architecture/module-blast-radius.md`
- `architecture/state-machines.md`
- `architecture/event-job-catalog.md`
- `package.json`
- `turbo.json`

Main-session targeted verification:

- `apps/api/src/main.ts`
- `apps/api/src/instrument.ts`
- `apps/api/src/common/middleware/rls.middleware.ts`
- `apps/api/src/modules/school-closures/school-closures.service.ts`
- `apps/api/src/modules/school-closures/school-closures.service.spec.ts`
- `apps/worker/src/base/redis.helpers.ts`
- `apps/worker/src/base/redis.helpers.spec.ts`
- `apps/worker/src/base/search.helpers.ts`
- `apps/worker/src/base/search.helpers.spec.ts`
- `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
- `apps/worker/src/base/tenant-aware-job.ts`
- `apps/worker/src/cron/cron-scheduler.service.ts`
- `apps/api/src/modules/approvals/approval-requests.service.ts`
- `apps/api/src/modules/finance/payments.service.ts`
- `apps/api/src/modules/finance/payments.service.spec.ts`
- `.github/workflows/ci.yml`
- `docker-compose.yml`
- `.env.example`
- `scripts/deploy-production.sh`
- `docs/runbooks/rollback.md`
- `apps/web/e2e/playwright.config.ts`
- `apps/web/e2e/visual/attendance.spec.ts`
- `apps/web/e2e/visual/finance.spec.ts`
- `apps/web/src/app/[locale]/(school)/layout.tsx`
- `apps/web/src/providers/auth-provider.tsx`

## Files Explicitly Read by Subagents

The authoritative per-subagent file lists are recorded in section `E. Files Reviewed` of each subagent report:

- `Audit-GPT/Audit-GPT-2/subagent-01-architecture_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-02-backend-tests_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-03-frontend-worker-tests_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-04-security-rls_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-05-code-quality_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-06-reliability_02-04-2026.md`
- `Audit-GPT/Audit-GPT-2/subagent-07-ops-dx_02-04-2026.md`

Principal focus files by subagent:

- Subagent 1: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `packages/shared/src/index.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`, `apps/api/src/modules/gradebook/analytics/analytics.service.ts`, `apps/api/src/modules/regulatory/regulatory-calendar.service.ts`
- Subagent 2: `apps/api/jest.config.js`, `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/auth/auth.controller.spec.ts`, `apps/api/src/modules/finance/payments.service.spec.ts`, `apps/api/src/modules/finance/payments.service.ts`, `apps/api/src/modules/school-closures/school-closures.service.spec.ts`, `apps/api/src/modules/school-closures/school-closures.service.ts`
- Subagent 3: Playwright configs/specs, `RequireRole` and school layout specs, `tenant-aware-job` source/spec, communication/compliance/security worker processors and helper suites
- Subagent 4: RLS middleware, tenant resolution, auth/permission guards, permission cache, auth module files, encryption service, payment raw SQL path, GDPR guards/services, worker tenant-aware base, partition maintenance processor
- Subagent 5: `AuthService`, `BehaviourService`, `PastoralReportService`, `AttendanceService`, `ReportsDataAccessService`, large frontend workflow pages, ESLint custom rules
- Subagent 6: approvals services/controllers, callback processors, notification processors, canary monitoring, worker health, cron scheduler, tenant-aware job, invoice status constants
- Subagent 7: CI workflow, deploy script, env validation, health controllers/services, Sentry config, local setup docs/scripts, rollback and monitoring runbooks

## Known Limits of the Audit Method

- This was a code/config audit, not a live production audit.
- No production SSH, database queries, or traffic replay was performed.
- Some conclusions are sampling-based, especially maintainability and module-health judgments outside the most critical domains.
- The environment’s six-agent cap prevented exact simultaneous launch of seven subagents; all seven specialist reports were still completed.
- The raw command log and subagent report files should be read alongside this appendix when reproducing or challenging the conclusions.
