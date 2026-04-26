# Regulatory Module Bug Inventory

Captured 2026-04-23 during a full Playwright walk of NHQS production (`https://nhqs.edupod.app`) as principal Yusuf Rahman. This is the baseline every phase's "Success criteria" measures improvement against.

Legend: ✅ works · ⚠️ renders but visibly broken · ❌ error boundary / crash.

**2026-04-24 — Phase 12 QA sign-off:** full Playwright walk of all 33 current regulatory routes on NHQS production against this inventory. Every row ✅. No crashes, no raw translation keys, no Cyrillic lookalikes, no horizontal overflow at 375px, all four Phase 10 legacy-path redirects land on their new `/regulatory/gdpr/*` destinations. Post-Phase-11 surface is 33 routes (up from 25) — new sub-routes listed at the bottom of this document.

---

## Per-route findings

| #   | Route                                      | State | Resolution                                                                                                                                                                                                 |
| --- | ------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/regulatory`                              | ✅    | Phase 2 — super-dashboard rewrite. Response envelope unwrapped via `apiClient` helper. KPI strip + HubTile grid now render cleanly.                                                                        |
| 2   | `/regulatory/tusla`                        | ✅    | Phase 3 — Tusla hub rewrite. Duplicate in-page nav removed, KPI strip + QuickAction row + teal accent aligned with `PATTERNS.md`.                                                                          |
| 3   | `/regulatory/tusla/sar`                    | ✅    | Phase 3 — wizard normalised with `PageHeader.back`, teal accent, and shared stepper.                                                                                                                       |
| 4   | `/regulatory/tusla/aar`                    | ✅    | Phase 3 — wizard normalised alongside SAR.                                                                                                                                                                 |
| 5   | `/regulatory/tusla/reduced-days`           | ✅    | Phase 3 — table + create form wired. Empty state and create flow both exercised.                                                                                                                           |
| 6   | `/regulatory/ppod`                         | ✅    | Phase 4 — PPOD hub rewrite. Envelope unwrapped, broken prefetch hrefs removed (CBA + Transfers moved to top-level under `/regulatory/*`), all keys translated.                                             |
| 7   | `/regulatory/ppod/students`                | ✅    | Phase 4 — column headers translated via `regulatory.ppod.column*` keys added in both locales.                                                                                                              |
| 8   | `/regulatory/ppod/sync-log`                | ✅    | Phase 4 — sync-log columns translated.                                                                                                                                                                     |
| 9   | `/regulatory/ppod/import`                  | ✅    | Phase 4 — wizard strings translated (including `cancel`, `next`).                                                                                                                                          |
| 10  | `/regulatory/ppod/export`                  | ✅    | Phase 4 — wizard strings translated.                                                                                                                                                                       |
| 11  | `/regulatory/ppod/cba`                     | ✅    | Phase 4 — CBA moved to `/regulatory/cba` (top-level). Envelope unwrapped, all `regulatory.cba.*` keys added.                                                                                               |
| 12  | `/regulatory/ppod/transfers`               | ✅    | Phase 4 — transfers moved to `/regulatory/transfers` (top-level). All column/filter/status labels translated under `regulatory.transfers.*`.                                                               |
| 13  | `/regulatory/ppod/transfers/new`           | ✅    | Phase 4 — reachable at `/regulatory/transfers/new`. Create form wired against transfers facade.                                                                                                            |
| 14  | `/regulatory/des-returns`                  | ✅    | Phase 5 — DES hub rewrite. `ReferenceError: t is not defined` resolved by scoping `useTranslations()` correctly inside the page component.                                                                 |
| 15  | `/regulatory/des-returns/subject-mappings` | ✅    | Phase 5 — subject mappings page ships with teal accent + `PageHeader.back`.                                                                                                                                |
| 16  | `/regulatory/des-returns/generate`         | ✅    | Phase 5 — file-generation wizard ships; dates routed through `fmtLocale()` in Phase 11.                                                                                                                    |
| 17  | `/regulatory/safeguarding`                 | ✅    | Phase 9 — promoted to a real sub-hub with KPI strip + four sub-pages (annual review, DLP register, mandatory reporting, staff vetting).                                                                    |
| 18  | `/regulatory/calendar`                     | ✅    | Phase 7 — calendar hub redesigned. "New Event" action button added, duplicate `EVENT TYPE` column eliminated (switched to card/month view).                                                                |
| 19  | `/regulatory/october-returns`              | ✅    | Phase 6 — October returns rewrite. Envelope unwrapped. New sub-routes added: `preview` and `issues`.                                                                                                       |
| 20  | `/regulatory/anti-bullying`                | ✅    | Phase 8 — promoted from redirect stub to a real sub-hub backed by `/api/v1/regulatory/anti-bullying/*` (behaviour facade). Cyrillic `т` in "Bí Cineálta" fixed (verified on prod — Latin-only characters). |
| 21  | `/regulatory/submissions`                  | ✅    | Phase 7 — submissions hub aligned with redesign pattern (was already functional, now matches `PATTERNS.md`).                                                                                               |
| 22  | `/regulatory/dpa`                          | ✅    | Phase 10 — consolidated. `/regulatory/dpa` now redirects to `/regulatory/gdpr/dpa-policy`, which renders without envelope errors.                                                                          |
| 23  | `/regulatory/data-retention`               | ✅    | Phase 10 — `/regulatory/data-retention` now redirects to `/regulatory/gdpr/data-retention`. API paths corrected to `/api/v1/…`.                                                                            |
| 24  | `/regulatory/privacy-notices`              | ✅    | Phase 10 — `/regulatory/privacy-notices` now redirects to `/regulatory/gdpr/privacy-notices`. Reference implementation from Phase 0 preserved under the GDPR sub-hub.                                      |
| 25  | `/regulatory/compliance`                   | ✅    | Phase 10 — `/regulatory/compliance` now redirects to `/regulatory/gdpr/dsar`. Path semantics match the UI (DSAR list under GDPR, not "compliance").                                                        |

---

## Failure clusters

### A. Response envelope mismatch (crashes 5 pages)

Backend `ResponseTransformInterceptor` wraps non-paginated bodies in `{ data: ... }`. The regulatory frontend pages were written assuming the raw inner shape.

**Affected:**

- `/regulatory` (dashboard)
- `/regulatory/ppod` (hub)
- `/regulatory/ppod/cba`
- `/regulatory/october-returns`
- `/regulatory/dpa`

**Fix pattern:** either unwrap `res.data` at every call site, OR extend `apiClient` to always unwrap (aligns with the existing leave-balance fix in commit `633b4f08`). Decide once in Phase 1 and apply consistently in the phase that rewrites each page.

### B. Missing translation keys (100+)

Every PPOD sub-page, every CBA page, every transfers page, and parts of the PPOD/import and /export wizards reference keys that don't exist in `messages/en.json` or `messages/ar.json`.

**Representative namespaces needing top-up:**

- `regulatory.ppod.columnStudentName`, `...columnPpsNumber`, `...columnExternalId`, `...columnSyncStatus`, `...columnLastSynced`, `...columnActions`
- `regulatory.ppod.columnDatabase`, `...columnSyncType`, `...columnTriggeredBy`, `...columnStartedAt`, `...columnStatus`, `...columnRecords`, `...columnDuration`
- `regulatory.ppod.typePpod`, `...typePod`, `...importUploadDescription`, `...importClickToUpload`, `...importCsvOnly`, `...cancel`, `...next`, `...relatedPages`, `...studentMappingsDescription`, `...cbaSyncTitle`, `...cbaSyncDescription`, `...transfersTitle`, `...transfersDescription`
- `regulatory.ppod.exportConfigureDescription`, `...exportScopeFull`, `...exportScopeIncremental`, `...exportScopeFullDescription`
- `regulatory.cba.subjectBreakdown`, `...syncRecords`, `...columnStudent`, `...columnSubject`, `...columnCbaType`, `...columnGrade`, `...columnSyncStatus`, `...columnSyncedAt`, `...columnActions`, `...columnTotal`, `...columnSynced`, `...columnPending`, `...columnErrors`
- `regulatory.transfers.colStudentName`, `...colDirection`, `...colOtherSchool`, `...colTransferDate`, `...colStatus`, `...colPpodConfirmed`, `...colActions`, `...filterDirection`, `...filterStatus`, `...status_pending`, `...status_accepted`, `...status_rejected`, `...status_completed`, `...status_cancelled`

Since every affected page is being rewritten in Phases 4 / 8, each phase bulk-adds the keys it touches. Phase 11 does the AR parity pass and runs a repo-wide audit to catch anything missed.

### C. API path bugs

- `/regulatory/data-retention` calls `/v1/retention-policies` and `/v1/retention-holds` without the `/api` prefix. `apiClient` treats `/v1/...` as a page-level path and resolves to `/en/v1/...` (404). Fixed in Phase 10 when that page moves under `/regulatory/gdpr`.
- `/regulatory/ppod` has three hard-coded prefetch hrefs to non-existent routes (`/regulatory/cba`, `/regulatory/ppod/mappings`, `/regulatory/transfers`). Fixed when the PPOD hub is rewritten in Phase 4.
- `/regulatory/anti-bullying` fetches `/api/v1/behaviour/incidents/summary?categories=bullying` and gets 400. Backend Zod schema probably doesn't list `bullying` as an allowed category. Fixed in Phase 8.

### D. Lexical scope bug

- `/regulatory/des-returns/page.tsx` uses `t` outside the function that calls `useTranslations()`. Fixed when the DES hub is rewritten in Phase 5.

### E. Stub pages

- `/regulatory/safeguarding` (3 redirect cards) — promoted to a real regulatory-oversight sub-hub in Phase 9.
- `/regulatory/anti-bullying` (1 redirect card) — promoted to a real sub-hub in Phase 8.

### F. Copy / locale bugs

- `"Bi Cinealта"` on `/regulatory/anti-bullying` — Cyrillic `т`. Fixed when the Anti-Bullying hub is rewritten in Phase 8.
- `EVENT TYPE` column header duplicated on `/regulatory/calendar`. Fixed when the Calendar hub is rewritten in Phase 7.

### G. Structural UX bugs

- Sub-strip exists at all (violates §14.13). Fixed in Phase 1.
- In-page `RegulatoryNav` exists on every sub-page. Fixed in Phase 1.
- No KPI strip, QuickAction row, or HubTile grid on any regulatory page today. Fixed in Phases 2–10.

---

## New routes added across Phases 2-10

These were not in the original baseline but ship as part of the redesign:

| Route                                          | Added in | State |
| ---------------------------------------------- | -------- | ----- |
| `/regulatory/tusla/mappings`                   | Phase 3  | ✅    |
| `/regulatory/october-returns/preview`          | Phase 6  | ✅    |
| `/regulatory/october-returns/issues`           | Phase 6  | ✅    |
| `/regulatory/safeguarding/annual-review`       | Phase 9  | ✅    |
| `/regulatory/safeguarding/dlp-register`        | Phase 9  | ✅    |
| `/regulatory/safeguarding/mandatory-reporting` | Phase 9  | ✅    |
| `/regulatory/safeguarding/staff-vetting`       | Phase 9  | ✅    |
| `/regulatory/gdpr`                             | Phase 10 | ✅    |
| `/regulatory/gdpr/dsar`                        | Phase 10 | ✅    |
| `/regulatory/gdpr/dpa-policy`                  | Phase 10 | ✅    |
| `/regulatory/gdpr/data-retention`              | Phase 10 | ✅    |
| `/regulatory/gdpr/privacy-notices`             | Phase 10 | ✅    |

**Redirects preserved for SEO / bookmarks (Phase 10):**

| From                          | To                                 | Redirect type | Soak review |
| ----------------------------- | ---------------------------------- | ------------- | ----------- |
| `/regulatory/dpa`             | `/regulatory/gdpr/dpa-policy`      | 307 temporary | ~2026-07-23 |
| `/regulatory/data-retention`  | `/regulatory/gdpr/data-retention`  | 307 temporary | ~2026-07-23 |
| `/regulatory/privacy-notices` | `/regulatory/gdpr/privacy-notices` | 307 temporary | ~2026-07-23 |
| `/regulatory/compliance`      | `/regulatory/gdpr/dsar`            | 307 temporary | ~2026-07-23 |

(Flip to `permanent: true` / 308 after the soak window — tracked as item #23 in `docs/operations/PRE-LAUNCH-CHECKLIST.md`.)

---

## Regression tracking

After each phase's prod deploy, re-run Playwright against every route in this table and mark the state. When every row is ✅, Phase 12 QA can sign off. **As of 2026-04-24 every row is ✅ — Phase 12 QA signed off.**
