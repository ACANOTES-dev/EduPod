# Reproducibility Appendix — Audit 2026-04-01_02-39-37

## Audit Metadata

| Field             | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Timestamp         | 2026-04-01_02-39-37                                                             |
| Root path         | /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB |
| Git branch        | main                                                                            |
| Git status        | clean (no uncommitted changes)                                                  |
| Latest commit     | b57a227                                                                         |
| Model             | Claude Opus 4.6 (1M context)                                                    |
| Effort            | MAX                                                                             |
| Agents dispatched | 7 (all Opus 4.6)                                                                |

## Major Commands Run (Main Session)

| Command                                                     | Purpose                             | Outcome                           |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------- |
| `mkdir -p Audit-Claude && date +"%Y-%m-%d_%H-%M-%S"`        | Create output folder, get timestamp | 2026-04-01_02-39-37               |
| `find apps packages -name "*.ts" -o -name "*.tsx" \| wc -l` | TypeScript file count               | 3,353                             |
| `find apps packages -name "*.spec.ts" ... \| wc -l`         | Test file count                     | 605                               |
| `find apps/api/src/modules -maxdepth 1 -type d`             | Backend module inventory            | 56 modules                        |
| Per-module file/line count loop                             | Module sizing                       | behaviour 25k LOC largest         |
| `find apps/web/src/app -name "page.tsx" \| wc -l`           | Frontend page count                 | 336                               |
| `find apps/worker/src -name "*.processor.ts" \| wc -l`      | Worker processor count              | 87                                |
| Cross-module import hotspot loop                            | Coupling analysis                   | gradebook (25) highest            |
| Largest files: `xargs wc -l \| sort -rn \| head`            | God file identification             | workload-compute 1336 LOC largest |
| `grep -c "^model " packages/prisma/schema.prisma`           | Prisma model count                  | 264                               |
| RLS gap analysis (policies.sql + post_migrate.sql)          | Security coverage                   | 248 unique RLS tables             |
| `pnpm turbo run lint`                                       | Lint check                          | 0 errors, 34 warnings             |
| `pnpm turbo run type-check`                                 | Type safety check                   | All pass                          |
| `cd apps/api && pnpm test`                                  | Backend test execution              | 529 suites, 7,190 tests, ALL PASS |
| `cd apps/worker && pnpm test`                               | Worker test execution               | 29 suites, 304 tests, ALL PASS    |
| `cd packages/shared && pnpm test`                           | Shared package test execution       | 13 suites, 250 tests, ALL PASS    |
| `grep -rn "any\|as any"` in production code                 | Type safety audit                   | 15 occurrences                    |
| `grep -rn "@ts-ignore\|@ts-expect-error"`                   | Unsafe suppression check            | 0 occurrences                     |
| Tech debt marker grep                                       | Debt concentration                  | Mostly in test files              |
| CI/deploy workflow reads                                    | Ops assessment                      | CI independent of deploy          |
| Total LOC count                                             | Scale measurement                   | 412k non-test, 601k total         |

## Commands That Failed

None. All commands completed successfully.

## Files Read in Main Session

| File                                | Purpose                                         |
| ----------------------------------- | ----------------------------------------------- |
| CLAUDE.md                           | Codebase conventions (loaded via system prompt) |
| architecture/danger-zones.md        | Known risks (36 entries, full read)             |
| architecture/module-blast-radius.md | Cross-module dependencies (full read)           |
| turbo.json                          | Build configuration                             |
| package.json                        | Root workspace config                           |
| .github/workflows/ci.yml            | CI pipeline                                     |
| .github/workflows/deploy.yml        | Deploy pipeline                                 |
| docker-compose.yml                  | Local dev infrastructure                        |
| .env.example                        | Environment template                            |

## Files Read by Agents

### Agent 1 (Architecture)

- apps/api/src/app.module.ts, apps/api/src/main.ts
- packages/shared/src/index.ts
- apps/api/src/modules/behaviour/behaviour.service.ts, behaviour.module.ts
- apps/api/src/modules/gradebook/report-cards/report-cards.service.ts, gradebook.module.ts
- apps/api/src/modules/tenants/sequence.service.ts
- apps/api/src/modules/rooms/rooms.service.ts
- apps/api/src/modules/pastoral/pastoral.module.ts
- apps/api/src/modules/child-protection/child-protection.module.ts
- apps/api/src/modules/early-warning/early-warning.module.ts
- apps/api/src/modules/staff-wellbeing/staff-wellbeing.module.ts
- architecture/module-blast-radius.md

### Agent 2 (Backend Tests)

- apps/api/jest.config.js
- apps/api/src/modules/auth/auth.controller.spec.ts, auth.service.spec.ts
- apps/api/src/modules/behaviour/behaviour-sanctions.service.spec.ts
- apps/api/src/modules/finance/invoices.service.spec.ts
- apps/api/src/modules/gdpr/**tests**/public-sub-processors.controller.spec.ts
- apps/api/src/modules/homework/homework.rls.spec.ts

### Agent 3 (Frontend + Worker Tests)

- apps/web/e2e/playwright.config.ts
- apps/web/e2e/visual/finance.spec.ts, attendance.spec.ts, rtl-regression.spec.ts, mobile.spec.ts, shell.spec.ts
- apps/web/src/components/data-table.spec.ts, global-search.spec.ts, require-role.spec.ts, timetable-grid.spec.ts
- apps/web/src/app/.../homework/\_components/completion-grid.spec.ts
- apps/worker/src/base/tenant-aware-job.spec.ts, cross-tenant-system-job.spec.ts
- apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts
- apps/worker/src/processors/finance/overdue-detection.processor.spec.ts
- apps/worker/src/processors/behaviour/suspension-return.processor.spec.ts

### Agent 4 (Security/RLS)

- apps/api/src/common/middleware/rls.middleware.ts
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/common/guards/auth.guard.ts, permission.guard.ts
- packages/prisma/rls/policies.sql
- packages/prisma/schema.prisma (model extraction)
- 26 post_migrate.sql files, 3 inline migration.sql files
- apps/api/src/main.ts, apps/api/src/instrument.ts
- apps/api/src/modules/configuration/encryption.service.ts
- apps/api/src/modules/gdpr/dpa-accepted.guard.ts, consent.service.ts
- apps/api/src/modules/config/env.validation.ts
- apps/worker/src/base/tenant-aware-job.ts
- 9 public/unguarded controllers
- packages/eslint-config/plugin.js
- packages/shared/src/schemas/auth.schema.ts

### Agent 5 (Code Quality)

- apps/api/src/modules/behaviour/behaviour.service.ts
- apps/api/src/modules/pastoral/services/concern.service.ts
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/modules/rooms/rooms.service.ts
- apps/web/src/app/.../sen/reports/page.tsx
- apps/web/src/app/.../behaviour/guardian-restrictions/page.tsx
- packages/eslint-config/ (index.js, plugin.js, 3 rule files)

### Agent 6 (Reliability)

- architecture/state-machines.md, event-job-catalog.md, danger-zones.md
- apps/worker/src/base/tenant-aware-job.ts
- apps/worker/src/cron/cron-scheduler.service.ts
- apps/worker/src/processors/behaviour/evaluate-policy.processor.ts
- apps/worker/src/processors/communications/dispatch-notifications.processor.ts
- apps/worker/src/processors/approvals/callback-reconciliation.processor.ts
- apps/api/src/modules/approvals/approval-requests.service.ts
- apps/api/src/modules/health/health.service.ts, health.controller.ts
- apps/worker/src/health/worker-health.controller.ts
- apps/worker/src/worker.module.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/api/src/instrument.ts

### Agent 7 (Ops/DX)

- .github/workflows/ci.yml, deploy.yml (full)
- apps/api/src/main.ts, instrument.ts, app.module.ts
- apps/api/src/modules/health/ (controller, service, module, specs)
- apps/api/src/modules/config/env.validation.ts, config.module.ts
- apps/api/src/common/services/logger.service.ts
- apps/api/src/common/middleware/correlation.middleware.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/worker/src/main.ts
- apps/web/next.config.mjs, sentry.client.config.ts, sentry.server.config.ts
- docker-compose.yml, .env.example, .gitignore, .husky/pre-commit
- scripts/ (setup.sh, seed-demo.sh, post-migrate.ts, init-db.sql, backup-drill.sh)
- Manuals/ (MASTER-OPERATIONS-MANUAL.md, OPERATIONS-RUNBOOK.md, PRE-LAUNCH-CHECKLIST.md)

## Known Limits of the Audit Method

1. **Static analysis only** — no runtime verification, no HTTP testing, no production DB inspection
2. **Single snapshot** — audited main branch at commit b57a227; feature branches not assessed
3. **Sampling** — not all 3,353 files were read; agents sampled ~80 files across 7 domains
4. **No penetration testing** — security assessment is code-review-based, not adversarial testing
5. **Build not run** — `turbo build` was not executed in the audit (type-check was deemed sufficient)
6. **Server state unverifiable** — actual PM2 config, nginx config, cron jobs, and backups cannot be verified from the repository
7. **Agent reliability** — 5 of 7 agents hit API 500 errors on first dispatch and required re-dispatch. All completed successfully on retry.
