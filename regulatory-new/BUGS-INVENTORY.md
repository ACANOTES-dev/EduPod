# Regulatory Module Bug Inventory

Captured 2026-04-23 during a full Playwright walk of NHQS production (`https://nhqs.edupod.app`) as principal Yusuf Rahman. This is the baseline every phase's "Success criteria" measures improvement against.

Legend: ✅ works · ⚠️ renders but visibly broken · ❌ error boundary / crash.

---

## Per-route findings

| #   | Route                                      | State | Primary failure(s)                                                                                                                                                                                                                                    |
| --- | ------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/regulatory`                              | ❌    | `TypeError: Cannot read properties of undefined (reading 'upcoming_deadlines')` — response envelope mismatch. Same pattern as commit `633b4f08`.                                                                                                      |
| 2   | `/regulatory/tusla`                        | ⚠️    | Renders, but duplicate in-page `RegulatoryNav` below morph sub-strip. No KPI strip. No module identity.                                                                                                                                               |
| 3   | `/regulatory/tusla/sar`                    | ⚠️    | 3-step wizard renders. Off-pattern: no `PageHeader.back`, no teal accent.                                                                                                                                                                             |
| 4   | `/regulatory/tusla/aar`                    | ⚠️    | Same wizard pattern, same issues.                                                                                                                                                                                                                     |
| 5   | `/regulatory/tusla/reduced-days`           | ⚠️    | Empty table. No create flow exercised.                                                                                                                                                                                                                |
| 6   | `/regulatory/ppod`                         | ❌    | `TypeError: Cannot read properties of undefined (reading 'length')` — response envelope. **Plus:** 8 missing translations, **plus** three prefetch 404s on wrong nav hrefs (`/regulatory/cba`, `/regulatory/ppod/mappings`, `/regulatory/transfers`). |
| 7   | `/regulatory/ppod/students`                | ⚠️    | Renders. Six column headers show raw keys: `REGULATORY.PPOD.COLUMNSTUDENTNAME`, etc.                                                                                                                                                                  |
| 8   | `/regulatory/ppod/sync-log`                | ⚠️    | Renders. Seven column headers as raw keys.                                                                                                                                                                                                            |
| 9   | `/regulatory/ppod/import`                  | ⚠️    | Renders. Seven wizard strings as raw keys (including `cancel`, `next` button labels).                                                                                                                                                                 |
| 10  | `/regulatory/ppod/export`                  | ⚠️    | Renders. Eight wizard strings as raw keys.                                                                                                                                                                                                            |
| 11  | `/regulatory/ppod/cba`                     | ❌    | `TypeError: Cannot read properties of undefined (reading 'length')` + 15+ missing translations.                                                                                                                                                       |
| 12  | `/regulatory/ppod/transfers`               | ⚠️    | Renders. All table columns + all filter labels + all status labels as raw keys.                                                                                                                                                                       |
| 13  | `/regulatory/ppod/transfers/new`           | —     | Not reached (hub blocked by PPOD crash).                                                                                                                                                                                                              |
| 14  | `/regulatory/des-returns`                  | ❌    | `ReferenceError: t is not defined`. Lexical scope bug: `t` used outside function body that calls `useTranslations()`.                                                                                                                                 |
| 15  | `/regulatory/des-returns/subject-mappings` | —     | Not reached.                                                                                                                                                                                                                                          |
| 16  | `/regulatory/des-returns/generate`         | —     | Not reached.                                                                                                                                                                                                                                          |
| 17  | `/regulatory/safeguarding`                 | ⚠️    | Renders, but is a **redirect stub**: three "Go to Safeguarding Module" cards. No dashboard content of its own.                                                                                                                                        |
| 18  | `/regulatory/calendar`                     | ⚠️    | Table with empty state. **No "New Event" button** (backend supports it). Column header `EVENT TYPE` appears twice (duplicate).                                                                                                                        |
| 19  | `/regulatory/october-returns`              | ❌    | `TypeError: Cannot read properties of undefined (reading 'map')` — response envelope.                                                                                                                                                                 |
| 20  | `/regulatory/anti-bullying`                | ⚠️    | Redirect stub. Backend `/api/v1/behaviour/incidents/summary?categories=bullying` returns **400**. Unicode bug: `"Bi Cinealта"` includes Cyrillic `т` in the last two characters — should be `"Bí Cineálta"`.                                          |
| 21  | `/regulatory/submissions`                  | ✅    | Empty table, renders cleanly. Off-pattern visually.                                                                                                                                                                                                   |
| 22  | `/regulatory/dpa`                          | ❌    | `TypeError: Cannot read properties of undefined (reading 'version')` — response envelope.                                                                                                                                                             |
| 23  | `/regulatory/data-retention`               | ⚠️    | UI renders. Both API calls 404 — URLs are `/en/v1/retention-policies` and `/en/v1/retention-holds` (missing `/api` prefix, the `apiClient` is being passed `/v1/...`).                                                                                |
| 24  | `/regulatory/privacy-notices`              | ✅    | **Only page that works fully clean.** Use as reference.                                                                                                                                                                                               |
| 25  | `/regulatory/compliance`                   | ⚠️    | Renders DSAR list. Off-pattern. Semantic mismatch: path says "compliance" but the UI is GDPR DSAR — this confuses users. Consolidated into `/regulatory/gdpr` in Phase 10.                                                                            |

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

## Regression tracking

After each phase's prod deploy, re-run Playwright against every route in this table and mark the state. When every row is ✅, Phase 12 QA can sign off.
