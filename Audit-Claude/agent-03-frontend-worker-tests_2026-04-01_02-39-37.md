# Agent 03 — Frontend & Worker Test Health

**Audit timestamp**: 2026-04-01_02-39-37
**Status**: COMPLETE

---

## A. Facts (Verified by Direct Inspection)

### Frontend Test Inventory

**E2E Visual Tests (Playwright): 19 spec files**
| Spec file | Coverage domain | Test type |
|-----------|----------------|-----------|
| shell.spec.ts | App shell, LTR/RTL dir attributes | Visual screenshot |
| components.spec.ts | Shared UI components | Visual screenshot |
| rtl-regression.spec.ts | 22 AR routes scanned for physical CSS class violations | DOM assertion + visual |
| dashboard.spec.ts | Dashboard EN/AR | Visual screenshot |
| students.spec.ts | Student list EN/AR | Visual screenshot |
| staff.spec.ts | Staff list EN/AR | Visual screenshot |
| households.spec.ts | Households EN/AR | Visual screenshot |
| classes.spec.ts | Classes EN/AR | Visual screenshot |
| admissions.spec.ts | Admissions EN/AR | Visual screenshot |
| scheduling.spec.ts | Scheduling EN/AR | Visual screenshot |
| attendance.spec.ts | Attendance + exceptions EN/AR | Visual screenshot |
| gradebook.spec.ts | Gradebook EN/AR | Visual screenshot |
| finance.spec.ts | Finance hub, invoices, payments, fee structures EN/AR | Visual screenshot |
| payroll.spec.ts | Payroll EN/AR | Visual screenshot |
| communications.spec.ts | Communications EN/AR | Visual screenshot |
| settings.spec.ts | Settings EN/AR | Visual screenshot |
| reports.spec.ts | Reports EN/AR | Visual screenshot |
| dark-mode.spec.ts | Dark mode rendering | Visual screenshot |
| mobile.spec.ts | Mobile viewport (390x844) across dashboard, students, finance, attendance, sidebar collapse | Visual + layout assertion |

**Frontend Unit Tests (Jest): 12 spec files**
| Spec file | What it tests |
|-----------|--------------|
| data-table.spec.ts | Pagination math (pure function, no React) |
| global-search.spec.ts | Result grouping, empty message derivation (pure function) |
| user-menu.spec.ts | User menu logic |
| require-role.spec.ts | Route-role access matrix (34 route prefixes, 4 role groups) |
| timetable-grid.spec.ts | Time formatting, time slot extraction, subject color assignment (pure) |
| hover-preview-card.spec.ts | Preview card logic |
| notification-panel.spec.ts | Notification panel logic |
| cookie-consent.spec.ts | Cookie consent logic |
| diary-date-navigator.spec.ts | Diary date navigation |
| completion-grid.spec.ts | Homework completion filter logic, percentage calc (pure) |
| homework-card.spec.ts | Homework card display logic |
| layout.spec.ts | School layout logic |

**Playwright Configuration** (`apps/web/e2e/playwright.config.ts`):

- 4 test projects: en-ltr (Desktop Chrome), ar-rtl (Desktop Chrome), mobile-en (iPhone 14), mobile-ar (iPhone 14)
- 30-minute timeout per test
- Visual snapshot directory: `./visual/__snapshots__`
- Base URL: http://localhost:5551
- Retries: 2 in CI, 0 local
- Requires running app (`pnpm --filter @school/web start`)

### Worker Test Inventory

**Total: 29 spec files, 304 tests (all passing in 2.9s)**

**Base infrastructure (2 files)**:

- `tenant-aware-job.spec.ts` — Tests RLS context setting, tenant_id rejection (4 tests)
- `cross-tenant-system-job.spec.ts` — Tests multi-tenant iteration, fault isolation, zero-tenant handling (6 tests)

**Domain processor tests (27 files)**:
| Domain | Tested processors | Test file |
|--------|------------------|-----------|
| behaviour | suspension-return, break-glass-expiry | 2 files |
| pastoral | escalation-timeout | 1 file |
| wellbeing | cleanup-participation-tokens, survey-open-notify, survey-closing-reminder, moderation-scan, eap-refresh-check, workload-metrics | 6 files |
| compliance | compliance-execution, retention-enforcement, deadline-check | 3 files |
| security | detection-rules, breach-deadline, anomaly-scan | 3 files |
| homework | overdue-detection, generate-recurring, digest-homework, completion-reminder | 4 files |
| communications | dispatch-notifications | 1 file |
| finance | overdue-detection | 1 file |
| gradebook | bulk-import | 1 file |
| attendance | attendance-auto-lock | 1 file |
| search | search-index | 1 file |
| notifications | parent-daily-digest | 1 file |
| engagement | engagement-annual-renewal | 1 file |
| approvals | callback-reconciliation | 1 file |

### Worker Processors Without Tests (UNTESTED)

**Total processors: 87 | Tested: ~29 (including 2 base classes) | Untested: ~58 processors**

Key untested processors by domain:
| Domain | Untested processors |
|--------|-------------------|
| behaviour (16 total, 2 tested) | evaluate-policy, detect-patterns, check-awards, parent-notification, digest-notifications, critical-escalation, sla-check, task-reminders, partition-maintenance, attachment-scan, guardian-restriction-check, cron-dispatch, refresh-mv, retention-check |
| pastoral (8 total, 1 tested) | overdue-actions, sync-behaviour-safeguarding, intervention-review-reminder, checkin-alert, wellbeing-flag-expiry, precompute-agenda, notify-concern |
| attendance (4 total, 1 tested) | attendance-pending-detection, attendance-pattern-detection, attendance-session-generation |
| early-warning (3 total, 0 tested) | compute-daily, compute-student, weekly-digest |
| regulatory (5 total, 0 tested) | tusla-threshold-scan, deadline-check, des-returns-generate, ppod-import, ppod-sync |
| scheduling (2 total, 0 tested) | solver-v2, scheduling-stale-reaper |
| imports (3 total, 0 tested) | import-file-cleanup, import-validation, import-processing |
| payroll (3 total, 0 tested) | mass-export, session-generation, approval-callback |
| engagement (7 total, 1 tested) | cancel-event, chase-outstanding, engagement-conference-reminders, engagement-generate-trip-pack, expire-pending, generate-invoices |
| communications (5 total, 1 tested) | stale-inquiry-detection, inquiry-notification, publish-announcement, retry-failed, announcement-approval-callback, ip-cleanup |
| gradebook (3 total, 1 tested) | mass-report-card-pdf, report-card-auto-generate, gradebook-risk-detection |
| finance (2 total, 1 tested) | invoice-approval-callback |
| search (2 total, 1 tested) | search-reindex |
| security (3 total, 2 tested) | key-rotation |
| notifications (1 total, 1 tested) | dispatch-queued (separate from parent-daily-digest) |
| admissions (1 total, 0 tested) | admissions-auto-expiry |

---

## B. Strong Signals

### Frontend

1. **E2E tests are visual-only, not functional**: All 19 Playwright specs are screenshot comparison tests. They navigate to a route, wait for network idle, and take a full-page screenshot. There are zero interaction tests (no form submissions, no button clicks for business logic, no state transitions, no error handling flows).

2. **RTL regression spec is genuinely valuable**: The `rtl-regression.spec.ts` scans 22 Arabic routes for physical directional CSS classes (ml-, mr-, pl-, pr-, left-, right-, etc.) at runtime via DOM evaluation. This catches real RTL bugs that linting might miss on dynamic/conditional classes.

3. **Unit tests extract pure functions instead of rendering React**: All 12 frontend unit tests replicate helper functions from their corresponding component files and test them in isolation. No tests mount React components, render JSX, or test user interaction flows. This avoids the complexity of mocking next-intl, auth, and API client, but means component rendering, props handling, and state management are untested.

4. **require-role.spec.ts is a standout**: Tests the complete route-role access matrix (34 routes, 9 roles, admin/teacher/parent/accounting groups) including edge cases like /payroll being owner/principal-only, /behaviour/parent-portal vs /behaviour routing, and fallback for unknown routes. This is a high-value security test.

5. **Major frontend modules completely untested**: The following modules have 0 E2E or unit test coverage:
   - behaviour (largest module in the system)
   - pastoral (second largest)
   - sen (SEN/SEND module)
   - wellbeing (staff wellbeing)
   - engagement (parent engagement)
   - early-warnings
   - regulatory
   - compliance/gdpr
   - homework (has 2 unit tests for sub-components, but no page-level tests)
   - diary, promotion, rooms, subjects, curriculum-matrix, safeguarding, website, profile

### Worker

6. **Test quality is consistent and well-structured**: Every tested processor follows the same pattern: mock Prisma, mock transaction, test job routing (skip wrong name, reject missing tenant_id), test happy path, test edge cases, test logging. The `buildMockTx`/`buildMockPrisma` factory pattern is reused across all specs.

7. **67% of processors are untested (58/87)**: Coverage is concentrated in compliance, security, wellbeing, and homework. The largest domain (behaviour, 16 processors) has only 2 tested. The second largest (pastoral, 8 processors) has only 1 tested.

8. **Critical high-risk processors untested**:
   - `evaluate-policy.processor.ts` (674 LOC) — the core behaviour policy engine
   - `gradebook-risk-detection.processor.ts` (690 LOC) — academic risk detection
   - `escalation-timeout.processor.ts` is tested (good), but `critical-escalation.processor.ts` is not
   - `compute-daily.processor.ts` (early warning) — daily risk computation, entirely untested
   - `signal-collection.utils.ts` (1,099 LOC) — largest worker file, untested
   - All 5 regulatory processors untested (tusla, ppod, DES returns)
   - All 3 import processors untested (import processing pipeline)
   - All 3 payroll processors untested (mass-export, session-generation, approval-callback)
   - `solver-v2.processor.ts` (scheduling solver) untested

9. **Base infrastructure tests are solid**: Both `TenantAwareJob` and `CrossTenantSystemJob` base classes have thorough tests covering: RLS context injection, tenant_id validation, multi-tenant iteration, fault isolation (one tenant failure doesn't block others), and count reporting.

---

## C. Inferences

1. **The E2E suite was designed for visual regression, not functional testing**: The project chose Playwright exclusively for screenshot-based visual regression across locales and viewports. This catches CSS/layout regressions and RTL bugs but provides zero assurance that business logic works through the UI. No auth-gated flows, form submissions, or error states are tested end-to-end.

2. **Frontend unit testing was a recent addition (likely bolt-on)**: The pattern of extracting pure functions and testing them outside React suggests these tests were written to improve coverage metrics without the cost of setting up React Testing Library / JSDOM with next-intl mocking. This is a pragmatic choice but leaves a massive gap: the components themselves are untested.

3. **336 pages with 31 test files = 9.2% coverage by file count**: Even accounting for the fact that some pages are simple wrappers, fewer than 1 in 10 frontend pages has any test coverage whatsoever. The largest and most complex modules (behaviour at 25k LOC, pastoral at 19k LOC) have zero frontend tests.

4. **Worker test coverage was built domain-by-domain during feature development**: Coverage correlates with module maturity — wellbeing (6/6 processors tested), homework (4/4 tested), compliance (3/3 tested). Newer or larger modules were likely shipped without tests due to time pressure.

5. **The untested worker processors contain the highest-risk code**: The evaluate-policy processor (674 LOC) makes decisions that result in student sanctions. The gradebook-risk-detection processor (690 LOC) flags academic risk. The signal-collection utility (1,099 LOC) feeds the early warning system. None have tests. These are exactly the processors where bugs would have the most consequential impact.

6. **No integration tests exist**: Neither frontend nor worker has integration tests that verify cross-module flows (e.g., behaviour incident -> sanction -> notification -> parent portal). The backend API has 529 test suites for this, but the worker and frontend layers operate purely on isolated unit logic.

---

## D. Top Findings

### D1. [CRITICAL] Frontend functional test coverage is effectively zero

- **What**: All E2E tests are visual screenshot comparisons. Zero tests verify business logic flows (form submission, state transitions, permission enforcement in UI, error handling).
- **Impact**: UI regressions in business logic (broken forms, wrong data displayed, incorrect redirects) will not be caught before production.
- **Evidence**: 19 E2E specs x ~4-8 tests each = ~120 tests, all using `toHaveScreenshot()`. Zero `click()`, `fill()`, or response assertion patterns found.
- **Risk**: HIGH — a bug in invoice creation, student enrollment, or gradebook entry would reach production undetected.

### D2. [HIGH] 67% of worker processors lack any test coverage (58/87)

- **What**: Only 29 of 87 processors have test files. Untested processors include the largest and most complex ones: evaluate-policy (674 LOC), gradebook-risk-detection (690 LOC), all 5 regulatory processors, all 3 import processors, all 3 payroll processors.
- **Impact**: Logic errors in sanctions, risk detection, regulatory compliance, and payroll will not be caught by automated tests.
- **Evidence**: Direct file listing comparison (see Section A).
- **Risk**: HIGH — payroll and regulatory processors operate on sensitive data with compliance implications.

### D3. [HIGH] Largest frontend modules have zero test coverage

- **What**: behaviour, pastoral, sen, wellbeing, engagement, early-warnings, regulatory, compliance/gdpr — none have any tests (E2E or unit). These represent the majority of frontend code.
- **Impact**: The modules handling the most sensitive data (child safeguarding, student behaviour, GDPR) have no automated quality assurance at the frontend layer.
- **Evidence**: Zero .spec.ts files found in any of these module directories. E2E visual tests only cover list/hub pages for core CRUD modules (students, staff, finance).

### D4. [MEDIUM] E2E tests are NOT in CI — confirmed from `.github/workflows/ci.yml`

- **What**: CI pipeline (`.github/workflows/ci.yml`) runs: lint, type-check, `pnpm turbo run test` (Jest), and build. Zero Playwright steps. No browser installation, no Playwright execution, no screenshot comparison. Playwright config requires a running app on port 5551.
- **Impact**: Visual regression tests exist on disk but never run automatically. They are purely a local/manual tool. Visual regressions will not be caught before merge.
- **Evidence**: CI workflow file directly reviewed; contains only `pnpm -r run lint`, `pnpm -r run type-check`, `pnpm turbo run test`, `pnpm build --force`. No Playwright installation (`npx playwright install`) or execution step exists.

### D5. [MEDIUM] Worker test pattern is sound but concentrated in newer modules

- **What**: Where tests exist, quality is good — consistent mocking patterns, tenant_id rejection tests, job routing guards, edge cases. But coverage clusters in wellbeing (6/6), homework (4/4), compliance (3/3) while behaviour (2/16), pastoral (1/8), engagement (1/7) are severely undertested.
- **Impact**: The proven test patterns exist as templates but haven't been applied to the bulk of the codebase.
- **Evidence**: File-by-file comparison of .processor.ts vs .processor.spec.ts.

### D6. [LOW] Frontend unit tests duplicate logic rather than importing it

- **What**: All 12 frontend unit tests copy pure helper functions from their source files and test the copies. If the source function changes, the test may still pass against the stale copy.
- **Impact**: Tests could diverge from actual implementation over time, giving false confidence.
- **Evidence**: data-table.spec.ts comment: "Pure logic extracted from data-table.tsx"; same pattern in all other specs.

---

## E. Files Reviewed

### Frontend E2E

- `/Users/ram/.../SDB/apps/web/e2e/playwright.config.ts`
- `/Users/ram/.../SDB/apps/web/e2e/visual/finance.spec.ts`
- `/Users/ram/.../SDB/apps/web/e2e/visual/attendance.spec.ts`
- `/Users/ram/.../SDB/apps/web/e2e/visual/rtl-regression.spec.ts`
- `/Users/ram/.../SDB/apps/web/e2e/visual/mobile.spec.ts`
- `/Users/ram/.../SDB/apps/web/e2e/visual/shell.spec.ts`

### Frontend Unit

- `/Users/ram/.../SDB/apps/web/src/components/data-table.spec.ts`
- `/Users/ram/.../SDB/apps/web/src/components/global-search.spec.ts`
- `/Users/ram/.../SDB/apps/web/src/components/require-role.spec.ts`
- `/Users/ram/.../SDB/apps/web/src/components/timetable-grid.spec.ts`
- `/Users/ram/.../SDB/apps/web/src/app/[locale]/(school)/homework/_components/completion-grid.spec.ts`

### CI/CD

- `/Users/ram/.../SDB/.github/workflows/ci.yml`

### Worker

- `/Users/ram/.../SDB/apps/worker/src/base/tenant-aware-job.spec.ts`
- `/Users/ram/.../SDB/apps/worker/src/base/cross-tenant-system-job.spec.ts`
- `/Users/ram/.../SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
- `/Users/ram/.../SDB/apps/worker/src/processors/finance/overdue-detection.processor.spec.ts`
- `/Users/ram/.../SDB/apps/worker/src/processors/behaviour/suspension-return.processor.spec.ts`
- `/Users/ram/.../SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts` (source, no test exists)

---

## F. Commands Run

- `Glob apps/web/e2e/**/*.spec.ts` — List all E2E test files
- `Glob apps/web/src/**/*.spec.ts` — List all frontend unit test files
- `Glob apps/worker/src/**/*.spec.ts` — List all worker test files
- `Glob apps/worker/src/processors/**/*.processor.ts` — List all worker processors
- `Glob apps/web/**/playwright*` — Find Playwright config
- `ls apps/web/src/app/[locale]/(school)/` — List all frontend module directories
- `ls apps/worker/src/processors/` — List worker processor directories

---

## G. Scores

| Dimension                | Score    | Rationale                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend Test Health** | **2/10** | 336 pages, 31 test files (9.2% by count). E2E tests are visual-only with zero functional coverage. Unit tests cover extracted pure functions but no component rendering or interaction. Largest modules (behaviour, pastoral, sen) have zero tests. RTL regression spec and require-role spec are bright spots but cannot compensate for the overall gap.                                                   |
| **Worker Test Health**   | **4/10** | 87 processors, 29 test files (33% by count). Where tests exist, quality is good with consistent patterns and proper tenant_id validation testing. Base infrastructure (TenantAwareJob, CrossTenantSystemJob) well tested. But 58 processors lack any tests, including the highest-risk processors (evaluate-policy, gradebook-risk-detection, all regulatory, all payroll, all imports, all early-warning). |

---

## H. Confidence

**Frontend assessment: HIGH confidence** — Exhaustively enumerated all test files (19 E2E + 12 unit), read representative samples from each category, reviewed Playwright config, and cross-referenced against the full list of 47 frontend module directories.

**Worker assessment: HIGH confidence** — Enumerated all 87 processors and all 29 spec files by direct file listing. Read 5 representative spec files across different domains and the 2 base class specs. The untested processor list is derived from exact file-by-file comparison.
