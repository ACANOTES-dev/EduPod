# Reproducibility Appendix

Timestamp: `20260403T130928+0100`

## 1. Audit Context

- Root path audited: `/Users/ram/Desktop/SDB`
- Audit output root: `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT`
- Orchestrator model/effort requested: `gpt-5.4`, `xhigh`
- Subagent model/effort requested: `gpt-5.4`, `xhigh`
- Actual process note: the environment capped concurrent agent threads at `6`, so the seventh specialist was launched immediately after one completed agent was closed.

## 2. Major Commands Run

### Main session inventory and validation

- `date +%Y%m%dT%H%M%S%z`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/logs/run_phase1_inventory.sh`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/logs/run_phase1_validation.sh`
- `npx tsx scripts/audit-rls.ts`
- `node scripts/check-raw-sql-governance.js`
- `pnpm check:boundaries -- --max-violations 9999`
- `rg -n "^(jobs:|  [A-Za-z0-9_-]+:)" .github/workflows/ci.yml`
- `sed -n '1,220p' apps/api/jest.config.js`
- `sed -n '1,220p' scripts/check-test-coverage-gate.sh`

### Main session targeted rechecks used in synthesis/challenge

- `nl -ba apps/api/src/modules/search/search.controller.ts | sed -n '1,120p'`
- `nl -ba apps/api/src/modules/search/search.service.ts | sed -n '1,260p'`
- `nl -ba apps/api/src/modules/auth/auth.controller.ts | sed -n '40,90p'`
- `nl -ba apps/api/src/modules/auth/auth.controller.spec.ts | sed -n '180,240p'`
- `nl -ba scripts/deploy-production.sh | sed -n '140,190p'`
- `nl -ba scripts/deploy-production.sh | sed -n '286,360p'`
- `rg -n "callback_status" packages/prisma/schema.prisma`
- `rg -n "skipped_unexpected_state" apps/worker/src/processors/finance apps/worker/src/processors/payroll apps/worker/src/processors/communications`
- `printf 'skipped_unexpected_state' | wc -c`
- `nl -ba apps/worker/src/instrument.ts | sed -n '1,120p'`
- `nl -ba apps/worker/src/main.ts | sed -n '1,80p'`
- `nl -ba apps/api/src/modules/health/health.service.ts | sed -n '240,290p'`
- `nl -ba apps/api/src/modules/health/health.controller.ts | sed -n '1,120p'`
- `nl -ba scripts/check-module-boundaries.ts | sed -n '1,120p'`
- `nl -ba docs/architecture/module-ownership.json | sed -n '1,120p'`
- `nl -ba apps/api/src/modules/gradebook/analytics/analytics.service.ts | sed -n '360,450p'`
- `nl -ba apps/api/src/modules/behaviour/behaviour-sanctions.service.ts | sed -n '1,260p'`

### Subagent-specific targeted commands

- Subagent command trails are preserved in each specialist report section `F. Additional Commands Run`:
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-01-architecture_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-01-architecture_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-02-backend-tests_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-02-backend-tests_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-03-frontend-worker-tests_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-03-frontend-worker-tests_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-04-security-rls_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-04-security-rls_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-05-code-quality_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-05-code-quality_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-06-reliability_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-06-reliability_20260403T130928+0100.md)
  - [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-07-ops-dx_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-07-ops-dx_20260403T130928+0100.md)

## 3. Commands That Failed Or Were Superseded

- An initial inline inventory command using raw `find ... \( -name "*.ts" -o -name "*.tsx" \)` syntax failed in `zsh` with a parse error. I replaced it with the checked-in inventory script at [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/logs/run_phase1_inventory.sh`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/logs/run_phase1_inventory.sh).
- Path assumptions from the prompt that referenced `architecture/...` were incorrect for this checkout. The repo uses [`/Users/ram/Desktop/SDB/docs/architecture`](/Users/ram/Desktop/SDB/docs/architecture), and this was corrected before synthesis.
- `sed -n ... .github/workflows/deploy.yml` produced no file because deploy is embedded in [`/Users/ram/Desktop/SDB/.github/workflows/ci.yml`](/Users/ram/Desktop/SDB/.github/workflows/ci.yml).
- `pnpm check:boundaries -- --max-violations 9999` failed because [`/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) resolves the ownership registry from the stale `architecture/` path.
- The first attempt to satisfy the “launch all 7 subagents in one batch” requirement hit the environment thread cap of `6`. This was an environment limitation, not a repo limitation, and the seventh subagent was launched as soon as one slot freed.
- One early shell heuristic comparing Prisma model names to RLS table names was intentionally superseded and not relied on, because mapped table names made the naive comparison misleading. Final RLS conclusions rely on `scripts/audit-rls.ts` plus direct file inspection instead.

## 4. Files Explicitly Read In The Main Session

- `/Users/ram/Desktop/SDB/CLAUDE.md`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md`
- `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md`
- `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md`
- `/Users/ram/Desktop/SDB/docs/plans/context.md`
- `/Users/ram/Desktop/SDB/package.json`
- `/Users/ram/Desktop/SDB/turbo.json`
- `/Users/ram/Desktop/SDB/apps/api/src/app.module.ts`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/apps/api/jest.config.js`
- `/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh`
- `/Users/ram/Desktop/SDB/scripts/deploy-production.sh`
- `/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`
- `/Users/ram/Desktop/SDB/docs/architecture/module-ownership.json`
- `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/main.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Desktop/SDB/ecosystem.config.cjs`
- `/Users/ram/Desktop/SDB/packages/eslint-config/raw-sql-allowlist.json`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-01-architecture_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-02-backend-tests_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-03-frontend-worker-tests_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-04-security-rls_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-05-code-quality_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-06-reliability_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/subagent-07-ops-dx_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/challenge-pass_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/module-health-matrix_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/executive-summary_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/health-recovery-plan_20260403T130928+0100.md`

## 5. Files Explicitly Read By Subagents

### Subagent 01: Architecture & Module Boundaries

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/apps/api/src/app.module.ts`
- `/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/apps/api/src/main.ts`
- `/Users/ram/Desktop/SDB/turbo.json`
- `/Users/ram/Desktop/SDB/packages/shared/src/index.ts`
- `/Users/ram/Desktop/SDB/packages/shared/package.json`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/invoices.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/consent.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/configuration/settings.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/reports/reports-data-access.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/gradebook.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/gdpr.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/pastoral.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/pastoral-admin.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/pastoral-core.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/README.md`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/child-protection/child-protection.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.module.ts`
- `/Users/ram/Desktop/SDB/docs/architecture/module-ownership.json`
- `/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`

### Subagent 02: Backend Test Health

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/commands-run_20260403T130928+0100.txt`
- `/Users/ram/Desktop/SDB/apps/api/jest.config.js`
- `/Users/ram/Desktop/SDB/apps/api/package.json`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/scripts/coverage-by-module.ts`
- `/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh`
- `/Users/ram/Desktop/SDB/apps/api/coverage/coverage-final.json`
- `/Users/ram/Desktop/SDB/apps/api/coverage/coverage-summary.json`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-calendar.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-calendar.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/attendance/attendance.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/attendance/attendance.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/scheduling/scheduler-orchestration.service.spec.ts`

### Subagent 03: Frontend & Worker Test Health

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/apps/web/e2e/playwright.journeys.config.ts`
- `/Users/ram/Desktop/SDB/apps/web/e2e/journeys/login.journey.ts`
- `/Users/ram/Desktop/SDB/apps/web/e2e/journeys/attendance.journey.ts`
- `/Users/ram/Desktop/SDB/apps/web/e2e/visual/payroll.spec.ts`
- `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`
- `/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/search-reindex.processor.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.spec.ts`

### Subagent 04: Security & RLS

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/rls.middleware.ts`
- `/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql`
- `/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql`
- `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/auth.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/permission.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/rls-role-check.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/services/permission-cache.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/main.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/instrument.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/configuration/encryption.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-token.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-session.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-rate-limit.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-password-reset.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-mfa.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/dpa-accepted.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/gdpr.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/legal-dpa.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/roles.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/memberships.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/survey.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/survey-results.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/hmac.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/survey-responses-isolation.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/moderation-scan.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Desktop/SDB/scripts/check-raw-sql-governance.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/scripts/migrate-mfa-secrets.ts`

### Subagent 05: Code Quality & Maintainability

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/period-grid/period-grid.service.ts`
- `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx`
- `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx`
- `/Users/ram/Desktop/SDB/packages/eslint-config/next.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/nest.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/plugin.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-untranslated-strings.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-physical-css-direction.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-cross-module-internal-import.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-sequential-transaction.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/max-public-methods.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-empty-catch.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-hand-rolled-forms.test.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-untranslated-strings.test.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/tests/max-public-methods.test.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/raw-sql-allowlist.json`

### Subagent 06: Reliability & Error Handling

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md`
- `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.controller.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/dlq-monitor.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/canary.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/admin-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/meilisearch.client.ts`
- `/Users/ram/Desktop/SDB/packages/shared/src/types/approval.ts`
- `/Users/ram/Desktop/SDB/packages/shared/src/schemas/approval.schema.ts`
- `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx`

### Subagent 07: Operational Readiness & Developer Experience

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/apps/api/src/main.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/instrument.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/services/logger.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/request-logging.middleware.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/main.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/env.validation.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/worker.module.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts`
- `/Users/ram/Desktop/SDB/docker-compose.yml`
- `/Users/ram/Desktop/SDB/.env.example`
- `/Users/ram/Desktop/SDB/ecosystem.config.cjs`
- `/Users/ram/Desktop/SDB/scripts/deploy-production.sh`
- `/Users/ram/Desktop/SDB/scripts/post-migrate-verify.sql`
- `/Users/ram/Desktop/SDB/scripts/ci-restore-drill.sh`
- `/Users/ram/Desktop/SDB/scripts/doctor.mjs`
- `/Users/ram/Desktop/SDB/scripts/backup-replicate.ts`
- `/Users/ram/Desktop/SDB/README.md`
- `/Users/ram/Desktop/SDB/docs/GETTING-STARTED.md`
- `/Users/ram/Desktop/SDB/package.json`
- `/Users/ram/Desktop/SDB/apps/api/package.json`
- `/Users/ram/Desktop/SDB/apps/worker/package.json`
- `/Users/ram/Desktop/SDB/packages/prisma/package.json`
- `/Users/ram/Desktop/SDB/.gitignore`

## 6. Known Limits Of The Audit Method

- The audit is evidence-based but still sample-based for code review depth.
- Production infrastructure, PM2 runtime state, live backups, and external alert destinations were not inspected directly.
- Integration and Playwright suites were not rerun locally in this audit session.
- Some repo facts in the prompt used stale paths or heuristics; these were corrected and not carried into final conclusions without verification.
- The inability to spawn all seven agents at once was a tooling limitation and slightly weakened process purity, though not the final evidence base.
