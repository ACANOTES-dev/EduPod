# Implementation 12 — Cleanup & Documentation

**Wave:** 5 (final)
**Depends on:** all prior implementations (01–11)
**Blocks:** nothing
**Can run in parallel with:** nothing (this is the closing step)
**Complexity:** low-medium

---

## 1. Purpose

Final cleanup pass: remove deprecated endpoints, delete dead code, ensure all architecture documentation is updated, run a comprehensive regression pass, and confirm the redesign is production-ready. This is the last implementation and exists to ensure nothing was left behind.

---

## 2. Scope

### In scope

1. Delete the old flat `GET /v1/report-cards/overview` endpoint and its service method
2. Remove any dead code left over from the old report cards overview page
3. Verify and update all relevant `docs/architecture/*.md` files
4. Ask the user about updating `docs/architecture/feature-map.md` (do NOT update unilaterally)
5. Remove the placeholder renderer if impl 11 has landed (keep if impl 11 is still on hold)
6. Final regression pass: `turbo test`, `turbo lint`, `turbo type-check`, `turbo build`
7. DI verification for the full app module
8. Manual smoke test of the key user flows

### Out of scope

- Any new feature work
- Any visual changes

---

## 3. Prerequisites

1. Implementations 01–10 all merged and logged
2. Impl 11 either merged or explicitly marked as held
3. `turbo test` green on main

---

## 4. Task breakdown

### 4.1 Remove old flat overview endpoint

**Verify frontend no longer calls it:**

```bash
# should return no results
grep -r "report-cards/overview" apps/web/src/
```

If any references remain, fix them first — they should all be using the new matrix endpoint from impl 06. Only proceed with deletion once the grep is clean.

**Delete backend route:**

1. Remove the route handler from `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts`
2. Remove the corresponding service method
3. Remove the corresponding test
4. Remove the old query helper if it's no longer used (verify via grep)
5. Also delete old `POST /v1/report-cards/generate-batch` if it's the pre-wizard endpoint (verify impl 04 replaced its callers first)

### 4.2 Dead code removal

Grep for these candidates and remove if confirmed unused:

```bash
grep -r "OverviewRow" apps/api/src/
grep -r "OverviewResponse" apps/web/src/
grep -r "ai-generate-comments" apps/web/src/   # old bulk AI endpoint
```

If the old bulk `ai-generate-comments` endpoint is no longer called from the frontend, mark it deprecated on the backend but keep it alive for one release cycle (don't delete in the same PR as the frontend removal — safer to stage).

### 4.3 Architecture doc audit

Open each file in `docs/architecture/` and verify it reflects the current state. Specifically check:

**`docs/architecture/module-blast-radius.md`:**

- Does the `report-cards` module entry list all new cross-module imports (tenant settings → used by generation, comment services → used by generation validation, etc.)?
- Are all new exported services reflected?

**`docs/architecture/event-job-catalog.md`:**

- Is the refactored `report-card:generate` job documented with its new payload shape, scope resolution, and overwrite semantics?
- Is the removal (if applicable) of any old job documented?

**`docs/architecture/state-machines.md`:**

- `CommentWindowStatus` state machine present
- `TeacherRequestStatus` state machine present
- `ReportCardBatchJob` status machine present (scheduled → running → completed / partial_success / failed)
- Extended `ReportCardStatus` with the `superseded` value documented

**`docs/architecture/danger-zones.md`:**

- Entry for: "Report card matrix reuses gradebook aggregation — keep in sync"
- Entry for: "Generation deletes old PDFs on overwrite — data loss if not careful"
- Entry for: "Window enforcement is the sole AI cost control"
- Add any other danger zones discovered during implementation

**`docs/architecture/feature-map.md`:**

- Do NOT update unilaterally. Compose a summary of what changed and ask the user:
  > "The report cards module has been significantly redesigned. The feature map would need updates to: (a) the Report Cards module entry (new landing, matrix, library pages, wizard, settings, comments, requests); (b) the new permissions (`report_cards.view`, `report_cards.comment`, `report_cards.manage`); (c) the new page count; (d) the new data model tables. Is this redesign final, or are you still iterating? Should I update the feature map now?"

### 4.4 Regression pass

Run the full suite:

```bash
turbo lint
turbo type-check
turbo test
turbo build
```

All must be green. Fix anything that isn't.

Run the DI verification script from `00-common-knowledge.md` §3.7 one more time to confirm the full app module compiles.

### 4.5 Manual smoke test

Run the app locally and walk through the key flows:

1. Admin opens a comment window
2. Teacher logs in, sees assignments, writes comments with AI draft, finalises
3. Admin closes window, runs generation wizard for a year group scope
4. Generation completes, reports appear in the library
5. Teacher views their class matrix, downloads a report from the library
6. Teacher submits a request to regenerate for one student
7. Admin reviews the request, approves with auto-execute, new report replaces the old one in the library
8. Repeat key flows in Arabic locale (matrix view, comment editor, settings page)

Document any issues found. Fix or escalate.

### 4.6 Old-data migration considerations

Verify:

- Existing `ReportCard` rows from pre-redesign still display correctly in the library
- Old approval flows (if any tenants were using them) still work
- Old delivery records still show
- Parent portal still displays old reports if any exist

If anything is broken, fix it in this implementation or escalate to the user.

### 4.7 Permissions audit

Confirm in the permissions seed that:

- Every teacher role has `report_cards.comment`
- Every principal / vice-principal role has `report_cards.manage`
- Every front-office admin has `report_cards.view`

Verify by creating a test user in each role and confirming the UI visibility matches expectations.

---

## 5. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — remove old routes
- `apps/api/src/modules/gradebook/report-cards/report-cards.service.ts` — remove old service methods
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.spec.ts` — remove related tests
- `docs/architecture/module-blast-radius.md`
- `docs/architecture/event-job-catalog.md`
- `docs/architecture/state-machines.md`
- `docs/architecture/danger-zones.md`
- Any dead code files identified

## 6. Files to delete

- `apps/worker/src/processors/report-card-render.placeholder.ts` — only if impl 11 has landed

---

## 7. Testing requirements

### 7.1 Regression

Full suite must pass:

```bash
turbo test
turbo lint
turbo type-check
turbo build
```

### 7.2 Coverage

Verify coverage thresholds in `jest.config.js` were ratcheted up during the redesign. If they weren't, ratchet them now to the new baseline minus 2% per the project convention.

### 7.3 Manual smoke

See §4.5.

---

## 8. Acceptance criteria

1. Old flat overview endpoint deleted from backend and frontend
2. No dead code references remain (grep confirms)
3. All `docs/architecture/*.md` files reflect the current state
4. User has been consulted on `docs/architecture/feature-map.md` — updated or deferred per user decision
5. Full regression suite green
6. DI verification passes
7. Manual smoke test of 8 key flows passes
8. Arabic RTL verified across all new pages
9. Mobile (375px) verified across all new pages
10. Coverage thresholds ratcheted to new baseline
11. Log entry added

---

## 9. Architecture doc update check

This IS the architecture doc update check. Ensure every file listed above is current.

---

## 10. Completion log stub

```markdown
### Implementation 12: Cleanup & Documentation

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Final cleanup pass. Removed deprecated endpoints, dead code, and updated all architecture documentation. Full regression suite green. Manual smoke test of key flows passed.

**What changed:**

- Deleted: old flat overview endpoint + route + service method + test
- Updated: module-blast-radius.md, event-job-catalog.md, state-machines.md, danger-zones.md
- Asked user about: feature-map.md (updated / deferred per user)
- Deleted: placeholder renderer (impl 11 landed / kept: impl 11 on hold)
- Ratcheted coverage thresholds to new baseline

**Test coverage:**

- Full regression: `turbo test/lint/type-check/build` all ✅
- Manual smoke: 8 key flows verified in English + Arabic
- DI verification: ✅

**Architecture docs updated:**

- `module-blast-radius.md`: ✅
- `event-job-catalog.md`: ✅
- `state-machines.md`: ✅
- `danger-zones.md`: ✅
- `feature-map.md`: (updated per user OR deferred)

**Regression check:**

- `turbo test`: ✅
- Unrelated failures: none

**Blockers or follow-ups:**

- None (project complete)

**Notes:**

- Report Cards redesign v1 is production-ready.
- Remaining work deferred: homework/attendance/behaviour content-scope templates (await their respective modules), additional languages beyond en/ar, student photo upload UI, tenant-custom templates.
```

---

## 11. If you get stuck

- **Old code still referenced somewhere unexpected:** grep broadly — check tests, types, e2e specs, docs. Nothing should call the old endpoints.
- **Architecture doc is huge and hard to diff:** read the git log for the last change to each file to see the pattern. Add entries in the same style.
- **Regression failure you can't explain:** bisect by reverting the most recent impl and re-running. Identify which impl introduced the regression. Fix in place; do not silently skip tests.
