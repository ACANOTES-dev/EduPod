# Reproducibility Appendix

## Run Identity

- Timestamp used: `2026-04-01_02-39-13`
- Root path audited: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB`
- Main orchestrator model: `gpt-5.4`
- Main orchestrator reasoning effort: `xhigh`
- Intended subagent model: `gpt-5.4`
- Intended subagent reasoning effort: `xhigh`
- Raw discovery log: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/commands-run_2026-04-01_02-39-13.txt`
- Discovery helper script: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/phase1_discovery_2026-04-01_02-39-13.sh`

## Major Commands Run

- Repository inventory:
  - `pwd`
  - `find . -maxdepth 2 -type d | sort | sed 's#^\./##'`
  - `ls -la`
  - `find apps packages -maxdepth 2 -type d 2>/dev/null | sort`
  - `find apps packages \( -name "*.ts" -o -name "*.tsx" \) | wc -l`
  - `find apps packages \( -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l`
- Test and quality commands:
  - `cd apps/api && pnpm test`
  - `cd ../../apps/worker && pnpm test`
  - `cd ../../packages/shared && pnpm test`
  - `pnpm turbo run lint`
  - `pnpm turbo run type-check`
  - `pnpm turbo run build`
- Security and schema inventory:
  - `grep -c "^model " packages/prisma/schema.prisma`
  - RLS table extraction from `policies.sql`, `post_migrate.sql`, and inline `migration.sql`
  - Corrective Node parser for tenant-scoped Prisma models mapped via `@@map`
- Challenge-pass verification commands:
  - `nl -ba '.github/workflows/deploy.yml' | sed -n '1,120p'`
  - `nl -ba '.github/workflows/ci.yml' | sed -n '1,80p'`
  - `nl -ba 'apps/worker/src/processors/notifications/dispatch-queued.processor.ts' | sed -n '40,110p'`
  - `nl -ba 'apps/worker/src/processors/communications/retry-failed.processor.ts' | sed -n '1,120p'`
  - `nl -ba 'apps/worker/src/cron/cron-scheduler.service.ts' | sed -n '260,280p'`
  - `nl -ba 'apps/api/src/common/middleware/tenant-resolution.middleware.ts' | sed -n '1,80p'`
  - `nl -ba 'apps/api/src/common/services/permission-cache.service.ts' | sed -n '1,90p'`
  - `nl -ba 'apps/api/jest.config.js' | sed -n '1,40p'`
  - `nl -ba 'apps/api/jest.integration.config.js' | sed -n '1,40p'`
  - `nl -ba 'apps/api/src/modules/finance/invoices.service.ts' | sed -n '338,370p'`
  - `nl -ba 'apps/api/src/modules/payroll/payroll-runs.service.ts' | sed -n '686,714p'`
  - `nl -ba 'apps/api/src/modules/admissions/application-state-machine.service.ts' | sed -n '310,340p'`

## Commands That Failed Or Needed Correction

- An initial inline Phase 1 discovery attempt had shell-quoting issues and was replaced with the saved helper script `phase1_discovery_2026-04-01_02-39-13.sh`.
- The heuristic command `grep -B1 "tenant_id" packages/prisma/schema.prisma` produced an invalid tenant-model inventory. It was replaced with a corrective parser that walked model blocks and respected `@@map`.
- The first RLS scan undercounted because some RLS declarations live in inline `migration.sql` files rather than `post_migrate.sql`; the scan was corrected to include both.
- The Codex environment enforced a hard cap of six active agents. Because of that, the seventh subagent could not be launched in the same initial batch. It was launched immediately after completed agents were closed. This is an execution-environment limitation, not a methodological choice.
- Within Subagent 4, an `xargs` controller sweep hit `command line cannot be assembled, too long` and was rerun with a `while read` loop. A narrower raw-SQL search also hit a zsh parse error and was rerun with a simpler pattern.

## Files Explicitly Read In The Main Session

- Mandatory pre-read:
  - `CLAUDE.md`
  - `architecture/danger-zones.md`
  - `architecture/module-blast-radius.md`
  - `architecture/state-machines.md`
  - `architecture/event-job-catalog.md`
  - `turbo.json`
  - `package.json`
- Main-session targeted reads after discovery:
  - `apps/api/jest.config.js`
  - `apps/worker/jest.config.js`
  - `apps/api/src/common/guards/auth.guard.ts`
  - `apps/api/src/common/guards/permission.guard.ts`
  - `apps/api/src/common/services/permission-cache.service.ts`
  - `apps/worker/src/base/tenant-aware-job.ts`
  - `apps/worker/src/cron/cron-scheduler.service.ts`
  - `apps/api/src/modules/approvals/approval-requests.service.ts`
  - `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
  - `apps/api/src/modules/config/env.validation.ts`
  - `apps/api/src/modules/config/config.module.ts`
  - `apps/web/e2e/playwright.config.ts`
- Challenge-pass direct verification reads:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`
  - `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
  - `apps/worker/src/processors/communications/retry-failed.processor.ts`
  - `apps/api/src/common/middleware/tenant-resolution.middleware.ts`
  - `apps/api/src/common/services/permission-cache.service.ts`
  - `apps/api/src/modules/finance/invoices.service.ts`
  - `apps/api/src/modules/payroll/payroll-runs.service.ts`
  - `apps/api/src/modules/admissions/application-state-machine.service.ts`

## Files Explicitly Read By Subagents

Full per-agent file lists are preserved in section `E. Files Reviewed` of each subagent report. The highest-value reviewed files were:

- Subagent 1 Architecture:
  - `apps/api/src/app.module.ts`
  - `packages/shared/src/index.ts`
  - `apps/api/src/modules/behaviour/behaviour-students.service.ts`
  - `apps/api/src/modules/pastoral/services/concern.service.ts`
  - `apps/api/src/modules/gradebook/report-cards/report-cards.service.ts`
  - `apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`
- Subagent 2 Backend Tests:
  - `apps/api/jest.config.js`
  - `apps/api/jest.integration.config.js`
  - `apps/api/src/modules/auth/auth.service.spec.ts`
  - `apps/api/src/modules/finance/payments.service.spec.ts`
  - `apps/api/test/p4b-scheduling.e2e-spec.ts`
  - `apps/api/test/p6-finance.e2e-spec.ts`
- Subagent 3 Frontend and Worker Tests:
  - `apps/web/e2e/playwright.config.ts`
  - `apps/web/e2e/visual/students.spec.ts`
  - `apps/web/src/components/require-role.spec.ts`
  - `apps/web/src/app/[locale]/(school)/layout.spec.ts`
  - `apps/worker/src/base/tenant-aware-job.spec.ts`
  - `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
- Subagent 4 Security and RLS:
  - `apps/api/src/common/middleware/rls.middleware.ts`
  - `apps/api/src/common/middleware/tenant-resolution.middleware.ts`
  - `apps/api/src/common/services/permission-cache.service.ts`
  - `apps/api/src/modules/auth/auth.service.ts`
  - `packages/prisma/schema.prisma`
  - `packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql`
- Subagent 5 Code Quality:
  - `apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`
  - `apps/api/src/modules/pastoral/services/concern.service.ts`
  - `apps/api/src/modules/behaviour/behaviour-students.service.ts`
  - `apps/web/src/app/[locale]/(school)/sen/reports/page.tsx`
  - `apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx`
  - `packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- Subagent 6 Reliability:
  - `apps/worker/src/base/tenant-aware-job.ts`
  - `apps/worker/src/cron/cron-scheduler.service.ts`
  - `apps/api/src/modules/approvals/approval-requests.service.ts`
  - `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
  - `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
  - `apps/api/src/modules/health/health.service.ts`
- Subagent 7 Ops and DX:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`
  - `apps/api/src/main.ts`
  - `apps/api/src/instrument.ts`
  - `.env.example`
  - `apps/worker/src/main.ts`

## Known Limits Of The Audit Method

- No server access or production-shell inspection was used.
- No live PostgreSQL role inspection was possible, so RLS control-plane risk was inferred from code and archived documentation rather than runtime verification.
- Frontend Playwright/browser tests were not executed in this run.
- BullMQ jobs were not exercised against live infrastructure; worker findings come from code, tests, and scheduler inspection.
- The raw command log is strongest for Phase 1 discovery and main-session verification. Subagent-specific commands are preserved in their individual reports rather than duplicated into one combined shell log.
