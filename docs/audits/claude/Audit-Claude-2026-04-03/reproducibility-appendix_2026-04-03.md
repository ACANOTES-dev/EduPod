# Reproducibility Appendix

**Date:** 2026-04-03
**Root Path:** /Users/ram/Desktop/SDB
**Auditor:** Claude Opus 4.6 (main session + 7 parallel agents)
**Git Branch:** main
**Latest Commit:** 29debde3 (refactor(repo): consolidate 15 doc folders into docs/ with index)

---

## Timestamp

All files saved with suffix `_2026-04-03`.

## Major Commands Run (Main Session)

### Discovery

```bash
find apps packages \( -name "*.ts" -o -name "*.tsx" \) | wc -l                    # → 3,458
find apps packages \( -name "*.spec.ts" ... \) | wc -l                             # → 733
find apps/api/src/modules -maxdepth 1 -mindepth 1 -type d | sort                   # → 58 modules
find apps/worker/src -name "*.processor.ts" | wc -l                                 # → 93
find apps/web/src/app -name "page.tsx" | wc -l                                      # → 337
grep -c "^model " packages/prisma/schema.prisma                                     # → 265
grep -c "ENABLE ROW LEVEL SECURITY" packages/prisma/rls/policies.sql                # → 254
awk '/^model /{model=$2} /tenant_id/{print model}' packages/prisma/schema.prisma | sort -u | wc -l  # → 253
```

### Test Execution

```bash
cd apps/api && pnpm test                    # → 567 suites, 7,785 tests, ALL PASS (50.8s)
cd apps/worker && pnpm test                 # → 100 suites, 666 tests, ALL PASS (6.8s)
cd packages/shared && pnpm test             # → 28 suites, 746 tests, ALL PASS (5.4s)
```

### Build / Lint / Type-Check

```bash
pnpm turbo run lint                         # → 6 tasks, PASS (warnings only)
pnpm turbo run type-check                   # → 8 tasks, PASS (FULL TURBO)
```

### Code Quality

```bash
grep -rn ": any\|as any" (source, non-spec) | wc -l     # → 0
grep -rn "@ts-ignore\|@ts-expect-error" (source) | wc -l # → 0
grep -rcn "TODO\|FIXME\|HACK" (source) | grep -v ":0$"  # → 0 results
```

## Failed Commands

- None. All commands completed successfully.

## Files Read in Main Session

- CLAUDE.md (from system prompt context)
- docs/architecture/danger-zones.md (lines 1-299)
- docs/architecture/module-blast-radius.md (lines 1-299)
- docs/architecture/state-machines.md (lines 1-200)
- docs/architecture/event-job-catalog.md (lines 1-200)
- turbo.json (full)
- package.json (full)
- .github/workflows/ci.yml (full, 266 lines)
- ecosystem.config.cjs (first 60 lines)
- docker-compose.yml (full)
- .husky/pre-commit (full)

## Files Read by Agents

### Agent 1 (Architecture)

- apps/api/src/app.module.ts
- docs/architecture/module-blast-radius.md
- docs/architecture/danger-zones.md
- apps/api/src/main.ts
- turbo.json
- packages/shared/src/index.ts
- apps/api/src/modules/behaviour/behaviour-sanctions.service.ts (sampled)
- Additional service files per investigation

### Agent 2 (Backend Tests)

- apps/api/jest.config.js
- apps/api/src/modules/auth/auth.service.spec.ts
- apps/api/src/modules/payroll/payroll-runs.service.spec.ts
- apps/api/src/modules/imports/import-executor.service.spec.ts
- apps/api/src/modules/behaviour/behaviour-sanctions.service.spec.ts
- Multiple spec files for coverage analysis

### Agent 3 (Frontend/Worker Tests)

- apps/web/e2e/journeys/\*.journey.ts
- apps/web/e2e/visual/\*.spec.ts
- apps/web/src/components/\*.spec.ts
- apps/worker/src/base/tenant-aware-job.spec.ts
- Multiple worker processor specs

### Agent 4 (Security)

- apps/api/src/common/middleware/rls.middleware.ts
- packages/prisma/rls/policies.sql
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/common/guards/auth.guard.ts
- apps/api/src/common/guards/permission.guard.ts
- apps/api/src/modules/configuration/encryption.service.ts
- apps/api/src/main.ts
- scripts/audit-rls.ts

### Agent 5 (Code Quality)

- apps/api/src/modules/behaviour/behaviour-sanctions.service.ts
- apps/api/src/modules/payroll/payroll-runs.service.ts
- apps/api/src/modules/attendance/attendance-upload.service.ts
- apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx
- apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx
- apps/api/src/modules/rooms/rooms.service.ts
- apps/api/src/modules/school-closures/school-closures.service.ts
- packages/eslint-plugin-school/ custom rules

### Agent 6 (Reliability)

- docs/architecture/state-machines.md
- docs/architecture/event-job-catalog.md
- docs/architecture/danger-zones.md
- apps/worker/src/base/tenant-aware-job.ts
- apps/worker/src/cron/cron-scheduler.service.ts
- apps/api/src/modules/approvals/approval-requests.service.ts
- apps/worker/src/processors/behaviour/parent-notification.processor.ts
- apps/api/src/modules/health/health.controller.ts

### Agent 7 (Ops/DX)

- .github/workflows/ci.yml
- apps/api/src/main.ts
- apps/api/src/instrument.ts
- docker-compose.yml
- .env.example
- ecosystem.config.cjs
- scripts/deploy-production.sh

## Known Limits of the Audit Method

1. **Sampling bias** — 58 modules, 93 processors, 337 pages cannot all be deeply read. High-risk areas were prioritized based on size, coupling, and business criticality. Lower-risk modules may have undiscovered issues.

2. **No live database testing** — RLS policies were structurally reviewed but not executed against a running database. Integration and e2e tests were read, not run.

3. **No production observation** — Deploy, monitoring, and runtime behavior assessed from configuration only. Actual production performance, error rates, and incident patterns were not observed.

4. **Schema not fully read** — The 413KB Prisma schema (265 models) was analyzed via grep/awk patterns, not line-by-line review. Individual model definitions for non-critical tables were not verified.

5. **Agent reports are samples** — Each agent read 5-15 files deeply. The total codebase has 3,458 files. Coverage is representative, not exhaustive.

6. **Turbo cache for some results** — Type-check results came from turbo cache (FULL TURBO). If cached results are stale due to uncommitted changes, this could mask issues. Git status showed only `docs/GETTING-STARTED.md` modified.

7. **No user interviews** — Architecture decisions, known workarounds, and planned changes could only be inferred from code and documentation. Some findings may be deliberately accepted tradeoffs.
