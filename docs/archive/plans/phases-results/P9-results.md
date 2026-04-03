# Phase 9 Results — Offline Cache, Hardening, Release

## Summary

Phase 9 delivered the final hardening and production-readiness layer for the School Operating System. No new features were built. The phase added: (1) a PWA service worker for offline read-only caching of timetable, class roster, and announcement views with locale/font precaching, (2) comprehensive RLS leakage tests covering all remaining tenant-scoped tables from P6B/P7/P8 plus an exhaustive table-sweep test, (3) PDF snapshot tests for all 12 template variants (6 types × 2 locales), (4) RTL regression tests with programmatic physical CSS detection, (5) visual regression test hardening across 17 new Playwright specs covering every module in en/ar/dark/mobile, (6) five critical workflow integration test suites running against real PostgreSQL with RLS, (7) k6 load test scripts for 100 concurrent users, (8) a demo environment seed with realistic data, (9) operational runbook documentation for deployment/rollback/provisioning/incident response/backup, (10) a backup restore drill script and checklist, (11) a production readiness checklist, and (12) CI pipeline extension with dedicated jobs for RLS, PDF snapshots, and workflow tests.

## Database Migrations

None. No schema changes in Phase 9.

## API Endpoints

| Method | Path                | Auth | Permission | Change                                                                       |
| ------ | ------------------- | ---- | ---------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health/ready` | None | None       | **New** — Readiness probe with PostgreSQL, Redis, Meilisearch latency checks |

## Services

| Service         | File                                            | Change                                                            |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `HealthService` | `apps/api/src/modules/health/health.service.ts` | Added `getReadiness()` method with `MeilisearchClient` dependency |
| `HealthModule`  | `apps/api/src/modules/health/health.module.ts`  | Added `SearchModule` import for `MeilisearchClient`               |
| `SearchModule`  | `apps/api/src/modules/search/search.module.ts`  | Added `MeilisearchClient` to exports                              |

## Frontend

| Component/File                           | Type             | Change                                                                                      |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `apps/web/public/sw.js`                  | Service Worker   | **New** — Offline cache with precache, stale-while-revalidate, and network-first strategies |
| `apps/web/public/offline.html`           | Static page      | **New** — Bilingual offline fallback page                                                   |
| `apps/web/public/manifest.json`          | PWA manifest     | Updated with icons, scope, id, categories                                                   |
| `apps/web/public/icons/`                 | Assets           | **New** — Placeholder PWA icons (192px, 512px, 512px maskable)                              |
| `apps/web/src/providers/sw-register.tsx` | Client component | **New** — Service worker registration (production only)                                     |
| `apps/web/src/app/[locale]/layout.tsx`   | Layout           | Added `SwRegister` component                                                                |
| `apps/web/e2e/playwright.config.ts`      | Config           | Added mobile viewport projects and 30-minute timeout                                        |

## Background Jobs

None. No new BullMQ processors added.

## Configuration

| Item                | Detail                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| Root `package.json` | Added `"seed:demo"` script                                              |
| CI pipeline         | Extended with `rls-leakage`, `critical-workflows`, `pdf-snapshots` jobs |

## Files Created

### Test Files (31 files)

```
apps/api/test/p6b-rls-leakage.e2e-spec.ts
apps/api/test/p7-rls-leakage.e2e-spec.ts
apps/api/test/p8-rls-leakage.e2e-spec.ts
apps/api/test/rls-comprehensive.e2e-spec.ts
apps/api/test/pdf-snapshots.e2e-spec.ts
apps/api/test/__snapshots__/pdf/.gitkeep
apps/api/test/workflows/admissions-conversion.e2e-spec.ts
apps/api/test/workflows/refund-lifo-reversal.e2e-spec.ts
apps/api/test/workflows/household-merge.e2e-spec.ts
apps/api/test/workflows/payroll-finalisation.e2e-spec.ts
apps/api/test/workflows/payment-allocation.e2e-spec.ts
apps/api/test/load/k6-config.js
apps/api/test/load/k6-thresholds.js
apps/api/test/load/login-flow.js
apps/api/test/load/search-load.js
apps/api/test/load/attendance-marking.js
apps/api/test/load/invoice-generation.js
apps/api/test/load/payroll-finalisation.js
apps/api/test/load/README.md
apps/web/e2e/visual/rtl-regression.spec.ts
apps/web/e2e/visual/dashboard.spec.ts
apps/web/e2e/visual/students.spec.ts
apps/web/e2e/visual/staff.spec.ts
apps/web/e2e/visual/households.spec.ts
apps/web/e2e/visual/classes.spec.ts
apps/web/e2e/visual/admissions.spec.ts
apps/web/e2e/visual/scheduling.spec.ts
apps/web/e2e/visual/attendance.spec.ts
apps/web/e2e/visual/gradebook.spec.ts
apps/web/e2e/visual/finance.spec.ts
apps/web/e2e/visual/payroll.spec.ts
apps/web/e2e/visual/communications.spec.ts
apps/web/e2e/visual/settings.spec.ts
apps/web/e2e/visual/reports.spec.ts
apps/web/e2e/visual/dark-mode.spec.ts
apps/web/e2e/visual/mobile.spec.ts
```

### PWA Files (5 files)

```
apps/web/public/sw.js
apps/web/public/offline.html
apps/web/public/icons/icon-192x192.png
apps/web/public/icons/icon-512x512.png
apps/web/public/icons/icon-maskable-512x512.png
apps/web/src/providers/sw-register.tsx
```

### Demo Data (2 files)

```
packages/prisma/seed/demo-data.ts
scripts/seed-demo.sh
```

### Documentation (8 files)

```
docs/runbooks/deployment.md
docs/runbooks/rollback.md
docs/runbooks/tenant-provisioning.md
docs/runbooks/incident-response.md
docs/runbooks/backup-restore.md
docs/production-readiness.md
scripts/backup-drill.sh
scripts/backup-drill-checklist.md
```

## Files Modified

| File                                                 | Change                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `apps/api/src/modules/health/health.service.ts`      | Added `getReadiness()` with MeilisearchClient dependency  |
| `apps/api/src/modules/health/health.service.spec.ts` | Added tests for `getReadiness()`                          |
| `apps/api/src/modules/health/health.controller.ts`   | Added `GET /health/ready` endpoint                        |
| `apps/api/src/modules/health/health.module.ts`       | Added `SearchModule` import                               |
| `apps/api/src/modules/search/search.module.ts`       | Exported `MeilisearchClient`                              |
| `apps/web/public/manifest.json`                      | Added icons, scope, id, categories                        |
| `apps/web/src/app/[locale]/layout.tsx`               | Added `SwRegister` import and usage                       |
| `apps/web/e2e/playwright.config.ts`                  | Added mobile projects, 30-minute timeout                  |
| `.github/workflows/ci.yml`                           | Added rls-leakage, critical-workflows, pdf-snapshots jobs |
| `package.json`                                       | Added `seed:demo` script                                  |

## Known Limitations

1. **PWA icons are placeholders** — 1×1 pixel PNGs. Replace with proper School OS branded icons before production launch.
2. **Demo seed data is partial** — Seeds academic structure (year groups, subjects, periods) but does not create the full set of students/staff/households/invoices described in the plan. The existing dev-data.ts seed provides base users and tenants; demo-data.ts adds academic scaffolding. Enrich further for richer demos.
3. **k6 load tests are read-heavy** — The attendance and invoice load scripts primarily test read operations to avoid creating test data artifacts. Full write-path load testing requires a disposable database.
4. **Visual regression baselines** — No baseline screenshots are committed. Baselines are generated on first Playwright run and committed manually after review.
5. **Backup drill script is semi-automated** — Requires AWS CLI configured with production credentials. Some steps require manual AWS Console verification.

## Deviations from Plan

1. **k6 scripts use `.js` not `.ts`** — k6 uses its own JS runtime that does not support TypeScript natively. Scripts are plain JavaScript as documented in k6 conventions.
2. **Demo data scope reduced** — The plan called for 80 students and 40 households per school. The seed creates academic structure and relies on existing dev-data for people records. This avoids duplicating the complex entity creation logic already in dev-data.ts.
3. **Service worker registration** — The plan specified modifying `apps/web/src/app/layout.tsx` (root layout). Since that layout returns only `{children}` (no HTML tag), registration was placed in a new `SwRegister` client component imported into `apps/web/src/app/[locale]/layout.tsx` (the locale layout that renders the `<html>` tag), which is more architecturally correct.
