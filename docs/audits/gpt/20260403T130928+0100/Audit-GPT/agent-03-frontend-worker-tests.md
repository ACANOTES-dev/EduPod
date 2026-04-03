# A. Facts

- The canonical fact pack says the frontend has `337` route page files and `32` discovered frontend test files, and explicitly calls the density materially asymmetric; the worker has `93` processor files, `100` worker spec files, and a cron estate of `19` queues, `~60` job types, and `34` cron registrations (`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md:75-91`).
- A targeted scan found `6` Playwright `.journey.ts` files under `/Users/ram/Desktop/SDB/apps/web/e2e/journeys` and `20` visual snapshot specs under `/Users/ram/Desktop/SDB/apps/web/e2e/visual*`.
- The journey Playwright config is set up for a running app with a seeded database, an auth-setup project, saved `storageState`, traces, screenshots-on-failure, and video (`/Users/ram/Desktop/SDB/apps/web/e2e/playwright.journeys.config.ts:4-64`).
- Sampled frontend journey 1: the login journey exercises invalid credentials, successful login, redirect away from `/login`, and authenticated-shell/user-menu presence (`/Users/ram/Desktop/SDB/apps/web/e2e/journeys/login.journey.ts:27-84`).
- Sampled frontend journey 2: the attendance journey checks heading text, table-or-empty-state presence, filter visibility, and only attempts row navigation when data exists (`/Users/ram/Desktop/SDB/apps/web/e2e/journeys/attendance.journey.ts:10-70`).
- Sampled visual frontend spec: the payroll visual suite only navigates and captures screenshots, plus a conditional money-cell screenshot if the cell is visible (`/Users/ram/Desktop/SDB/apps/web/e2e/visual/payroll.spec.ts:5-87`).
- The strongest sampled frontend non-E2E spec was the school layout nav-filter test. It imports the real nav config and covers many role permutations, but it still tests pure filtering output rather than a mounted layout (`/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts:1-219`).
- Another sampled frontend unit spec explicitly mirrors `NotificationPanel` helpers inside the test file "without mounting React or making API calls" (`/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts:2-10`, `/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts:27-90`).
- A targeted repo scan for `render(`, `screen.`, or `userEvent` across frontend spec files returned no matches.
- Sampled worker base coverage: `TenantAwareJob` rejects missing `tenant_id`, runs inside a transaction, and asserts `SET LOCAL` is called (`/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.spec.ts:38-71`).
- Sampled worker critical coverage: `DispatchNotificationsProcessor` covers wrong-job routing, missing-tenant rejection, announcement fan-in, in-app delivery, missing-template fallback, exponential backoff, dead-letter behavior, and logging (`/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts:107-408`).
- Sampled worker weaker-area coverage: `SearchReindexProcessor` checks wrong-job routing, missing-tenant rejection, and tenant-scoped queries across four entities, but no failure or queue-policy paths (`/Users/ram/Desktop/SDB/apps/worker/src/processors/search-reindex.processor.spec.ts:56-108`).
- A same-name sibling comparison for `apps/worker/src/processors/**/*.processor.ts` against `*.processor.spec.ts` produced no direct processor-file gaps in this checkout.
- A worker spec keyword scan found `87` spec files mentioning `tenant_id`, `10` mentioning retry/backoff/DLQ-related terms, and `8` asserting BullMQ `attempts` or `backoff` options.

# B. Strong Signals

- There is real browser-journey coverage for authentication, and it exercises both negative and positive login paths against a running app rather than only screenshots.
- The frontend also has a broad visual regression net for bilingual and RTL rendering, which is useful for layout regressions even when it does not validate business outcomes.
- The strongest sampled frontend unit test avoids mirrored config drift by importing the real nav config and role-filtering function.
- Worker coverage breadth is materially healthier than frontend breadth at the file level: direct processor/spec pairing appears complete, tenant-safety checks are common, and the sampled notification-dispatch spec meaningfully tests retry and fallback behavior.
- The cron scheduler is directly tested for broad startup registration and retention options, including `removeOnComplete` and `removeOnFail` on notification crons (`/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.spec.ts:108-153`).

# C. Inferences

- Based on the sampled files and targeted scans, frontend tests meaningfully protect login and some render/navigation regressions, but they do not yet meaningfully protect most high-value school workflows.
- The visual suites should be counted as presentation regression coverage, not as substitutes for full user-journey verification.
- Worker test health is better than frontend test health in this sample, but much of that strength is unit-level breadth. The bigger remaining worker risk is uneven depth around retries, queue contracts, cron fan-out, and end-to-end side effects.

# D. Top Findings

1. Title: Frontend journey coverage exists, but most critical user flows are still only smoke-tested  
   Severity: High  
   Confidence: High  
   Why it matters: With `337` route pages, tests that stop at headings, empty states, or shell presence will miss breakage in saves, validation, permissions, and API integration across the flows schools actually depend on.  
   Evidence: The fact pack records `337` pages versus `32` discovered frontend test files and explicitly flags the asymmetry (`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md:75-78`). The journey config says these tests are meant to cover real login/navigation/CRUD flows (`/Users/ram/Desktop/SDB/apps/web/e2e/playwright.journeys.config.ts:4-5`), but the sampled attendance journey stops at heading/table/filter presence and only navigates deeper if rows already exist (`/Users/ram/Desktop/SDB/apps/web/e2e/journeys/attendance.journey.ts:25-70`). The sampled payroll "E2E" is screenshot-only (`/Users/ram/Desktop/SDB/apps/web/e2e/visual/payroll.spec.ts:5-87`).  
   Fix direction: Add seeded, state-changing Playwright journeys for the riskiest staff flows first: attendance mark-and-save, student create/edit, behaviour incident submission, finance invoice issue/payment capture, and payroll run progression. Make each test assert persisted outcomes, not just visible containers.

2. Title: Frontend unit coverage is mostly logic-only and misses rendered component behavior  
   Severity: High  
   Confidence: High  
   Why it matters: Logic-only tests do not catch broken wiring between props, hooks, translations, forms, async loading/error states, Radix controls, or user-visible toasts. On a large App Router surface, that creates false confidence.  
   Evidence: The strongest sampled non-E2E spec imports the real nav config but still only checks filtered section labels and hrefs, not the rendered layout (`/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts:1-219`). The sampled notification-panel spec explicitly says it replicates helpers "without mounting React or making API calls" and mirrors those helpers inside the spec (`/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts:2-10`, `/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts:27-90`). A repo-wide scan for `render(`, `screen.`, or `userEvent` across frontend spec files returned no matches.  
   Fix direction: Introduce a small React Testing Library layer around the highest-value components and forms. Extract reusable helpers into shared utilities instead of mirroring them in specs, then test the real rendered component for loading, translation, RTL, validation, and error-handling behavior.

3. Title: Worker processor coverage is broad, but failure-policy coverage is uneven across the fleet  
   Severity: Medium  
   Confidence: Medium  
   Why it matters: Background failures are most expensive when queue settings, retries, and cron fan-out drift silently. Direct file-level specs help, but they do not guarantee the dangerous failure modes are exercised across domains.  
   Evidence: The fact pack shows `93` processor files, `100` worker specs, and a large cron estate (`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md:90-91`). The sampled base `TenantAwareJob` tests cover tenant rejection and transaction-local context (`/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.spec.ts:38-71`). The sampled `DispatchNotificationsProcessor` spec has strong retry/dead-letter coverage (`/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts:278-388`), but the sampled `SearchReindexProcessor` spec only checks routing and tenant-scoped reads (`/Users/ram/Desktop/SDB/apps/worker/src/processors/search-reindex.processor.spec.ts:56-108`). My keyword scan found only `10` worker specs mentioning retry/backoff/DLQ-style terms and only `8` asserting BullMQ `attempts`/`backoff` options.  
   Fix direction: Keep the strong per-processor baseline, but add representative failure-contract tests per major queue family. Prioritise communications, finance/payroll approvals, gradebook, pastoral, and regulatory crons. For each, verify retry settings, dead-letter behavior, idempotency, and expected side effects under provider or database failure.

# E. Files Reviewed

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

# F. Additional Commands Run

- `rg --files '/Users/ram/Desktop/SDB/apps/web' | rg '(/e2e/.*\\.(spec|test)\\.(ts|tsx)|\\.spec\\.(ts|tsx)$|\\.test\\.(ts|tsx)$)'`
- `cd '/Users/ram/Desktop/SDB/apps/web/e2e/journeys' && wc -l *.ts`
- `cd '/Users/ram/Desktop/SDB/apps/web' && rg --files e2e/journeys | rg '\\.journey\\.ts$' | wc -l`
- `cd '/Users/ram/Desktop/SDB/apps/web' && rg --files e2e/visual e2e/visual-smoke | rg '\\.spec\\.ts$' | wc -l`
- `rg -n \"render\\(|userEvent|screen\\.\" '/Users/ram/Desktop/SDB/apps/web/src' -g '*.spec.ts' -g '*.spec.tsx'`
- `cd '/Users/ram/Desktop/SDB/apps/worker/src' && comm -23 <(rg --files processors | rg '\\.processor\\.ts$' | sed 's/\\.ts$//' | sort) <(rg --files processors | rg '\\.processor\\.spec\\.ts$' | sed 's/\\.spec\\.ts$//' | sort)`
- `cd '/Users/ram/Desktop/SDB/apps/worker/src' && rg -l 'tenant_id' -g '*.spec.ts' | wc -l`
- `cd '/Users/ram/Desktop/SDB/apps/worker/src' && rg -l 'retry|backoff|dead-letter|DLQ|removeOnFail|attempt_count|next_retry_at' -g '*.spec.ts' | wc -l`
- `cd '/Users/ram/Desktop/SDB/apps/worker/src' && rg -l 'attempts:|backoff:' -g '*.spec.ts' | wc -l`

# G. Score

- Frontend test health: `4/10`
- Worker test health: `7/10`
- Combined sample judgment: `5/10`

# H. Confidence in this review

Moderate-high. I used the canonical fact pack first, then sampled the strongest visible frontend and worker tests plus targeted repo scans for missing patterns and processor/spec pairing. This is still a sample-based review, not a line-by-line audit of every frontend and worker spec.
