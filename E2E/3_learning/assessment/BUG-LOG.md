# Assessment Module — Consolidated Bug Log

**Generated:** 2026-04-13
**Sources:** Live Playwright walkthrough `[L]` + spec-level code-review findings `[C]`
**Module:** Assessment (Leadership Dashboard, Gradebook, Analytics, Config Catalogue, Parent Grades)
**Environment:** Production — `nhqs.edupod.app`

---

## Workflow Instructions

### For agents picking up a bug:

1. **Read the full entry** — each bug is self-contained with file paths, reproduction steps, and fix direction.
2. **Update status**: `Open` → `In Progress` when you start. Commit message: `fix(assessment): ASSESSMENT-NNN description`.
3. **Verify**: After fixing, run the Playwright verification steps. If they pass, update status to `Fixed`.
4. **Final verification**: A separate session marks `Fixed` → `Verified` after independent confirmation.

### Status transitions:

```
Open → In Progress → Fixed → Verified
                   → Blocked (with reason)
                   → Won't Fix (with justification)
```

### Commit format:

```
fix(assessment): ASSESSMENT-NNN short description

Fixes ASSESSMENT-NNN. [details of what changed]
```

---

## Bug Entries

---

### ASSESSMENT-001 — Parent sees Teacher Assessment Dashboard (role-gate bypass)

**Severity:** P0
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🔴 Blocker — parent must not see teacher/admin UI

**Summary:** When a parent navigates to `/en/assessments`, the Teacher Assessment Dashboard renders instead of a 403 or redirect. The parent sees the full teacher UI shell including "Assessment Dashboard" heading, KPI cards, allocations table (empty), config status, and navigation to Gradebook/Analytics. 25 console errors fire as all gradebook API endpoints return 403.

**Reproduction steps:**

1. Log in as `parent@nhqs.test` / `Password123!`
2. Click "Learning" in morph bar, or navigate directly to `/en/assessments`
3. Observe: Teacher Assessment Dashboard renders with heading "Assessment Dashboard"
4. Open browser console: 25 errors (all gradebook endpoints → 403)

**Expected:** Parent should be redirected to `/en/dashboard/parent` or see a 403 page. Parents must never see the assessment configuration/workspace UI.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/assessments/page.tsx` — missing role guard
- Grep: `ADMIN_ROLES` in assessment page component to find the role-gating logic
- The gradebook page (`/en/gradebook`) correctly redirects parents, so the pattern exists — apply it to `/en/assessments` and `/en/analytics`

**Fix direction:**

- **Option A:** Add a permission check at the top of the assessments page component. If user role is `parent`, redirect to `/en/dashboard/parent`. Use the same pattern as the gradebook page redirect.
- **Option B:** Add a middleware-level route guard for `/assessments` and `/analytics` that checks role and redirects non-teacher/admin users.

**Playwright verification:**

1. Log in as `parent@nhqs.test`
2. Navigate to `/en/assessments`
3. Assert: URL redirects to `/en/dashboard/parent` or shows 403 page
4. Assert: zero gradebook API calls in network tab
5. Navigate to `/en/analytics` — same assertions

---

### ASSESSMENT-002 — Raw ISO timestamp in gradebook Assessments tab due-date column

**Severity:** P1
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟡 Should fix before release — visible to all users

**Summary:** The "Due Date" column in the class gradebook Assessments tab renders raw ISO 8601 strings like `2025-10-15T00:00:00.000Z` instead of formatted dates. The grade entry page correctly formats dates as "24/10/2025" or "15 May 2026", so the formatter exists — it's just not applied in the assessments table.

**Reproduction steps:**

1. Log in as `owner@nhqs.test`
2. Navigate to `/en/gradebook`
3. Click any class card (e.g., "2A")
4. Observe: "Due Date" column shows raw ISO timestamps

**Expected:** Formatted date string (e.g., "15 Oct 2025" or "15/10/2025")

**Affected files:**

- Grep: `due_date` or `dueDate` in `apps/web/src/app/[locale]/(school)/gradebook/[classId]/` — find the table cell renderer for the Assessments tab
- The workspace page (`/en/assessments/workspace/...`) formats dates correctly ("15 May 2026"), so compare implementations

**Fix direction:**

- Find the Assessments tab table component in the class gradebook
- Apply the same date formatter used in the workspace or grade entry page (likely `format(new Date(date), 'd MMM yyyy')` or similar from `date-fns`)
- Ensure locale-awareness for Arabic dates (Gregorian + Latin digits per project rules)

**Playwright verification:**

1. Navigate to `/en/gradebook/{classId}`
2. Assert: every Due Date cell matches `/^\d{1,2}\s\w+\s\d{4}$/` or a locale-formatted pattern
3. Assert: no cell contains `T00:00:00`

---

### ASSESSMENT-003 — Teacher dashboard calls admin-only `/teaching-allocations/all` endpoint

**Severity:** P1
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟡 Defence-in-depth — endpoint returns teacher's own data but violates least-privilege

**Summary:** When a teacher navigates to `/en/assessments`, the frontend fires `GET /api/v1/gradebook/teaching-allocations/all` (the admin variant) alongside the correct `GET /api/v1/gradebook/teaching-allocations` (teacher variant). The admin endpoint returns 200 with the teacher's own allocations (server-side scoping), so no data leak occurs. But the teacher should never call the admin endpoint.

**Reproduction steps:**

1. Log in as `Sarah.daly@nhqs.test`
2. Navigate to `/en/assessments`
3. Open Network tab: both `/teaching-allocations/all` and `/teaching-allocations` are called
4. Spec §4.3: "Network tab must NOT show a call to `/teaching-allocations/all`"

**Expected:** Only `/teaching-allocations` is called for teacher role.

**Affected files:**

- Grep: `teaching-allocations/all` in `apps/web/src/app/[locale]/(school)/assessments/`
- The dashboard component likely has a single data-fetching function that calls both endpoints; the admin variant should be gated behind a role check

**Fix direction:**

- In the assessment dashboard data-fetching logic, check the user's role before calling `/teaching-allocations/all`
- If role is teacher, skip the admin endpoint entirely
- The admin dashboard data (school-wide overview) is built from the `/all` response — teacher doesn't need it

**Playwright verification:**

1. Log in as teacher
2. Navigate to `/en/assessments`
3. Assert: network log contains `/teaching-allocations` but NOT `/teaching-allocations/all`

---

### ASSESSMENT-004 — Parent can access `/en/analytics` (role-gate missing)

**Severity:** P1
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟡 Parent should not see analytics shell

**Summary:** Parent can navigate to `/en/analytics` and sees the Analytics page shell (heading, class selector dropdown). A toast notification "Missing required permission: students.view" appears, and the class list is empty. The gradebook page (`/en/gradebook`) correctly redirects the parent, but analytics does not.

**Reproduction steps:**

1. Log in as `parent@nhqs.test`
2. Navigate to `/en/analytics`
3. Observe: Analytics page shell renders with empty class selector + permission toast

**Expected:** Redirect to `/en/dashboard/parent` or 403 page.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/analytics/page.tsx` — missing role guard
- Same pattern as ASSESSMENT-001

**Fix direction:**

- Apply the same role guard as the gradebook page
- If user lacks `gradebook.view_analytics` or is a parent role, redirect

**Playwright verification:**

1. Log in as parent
2. Navigate to `/en/analytics`
3. Assert: URL redirects away from analytics

---

### ASSESSMENT-005 — Parent has no linked students — blocks all grade view testing

**Severity:** P1
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟡 Test data prerequisite — blocks parent spec validation

**Summary:** The parent test account (`parent@nhqs.test` / Zainab Ali) has no students linked via `student_parent` relationships. The parent dashboard shows "Your Students: No results found." This blocks all parent-spec test cases (§§6–16): grade views, report card downloads, transcript access, cross-child isolation, acknowledgement flows.

**Reproduction steps:**

1. Log in as `parent@nhqs.test`
2. Observe: "Your Students" section shows "No results found"
3. No child selector, no grade navigation, no report card links

**Expected:** Parent should have ≥ 1 linked student (spec §1 requires ≥ 2).

**Affected files:**

- Database: `student_parent` table — needs rows linking parent user to student(s)
- The `parent@nhqs.test` user exists with `parent` role but has no `student_parent` associations

**Fix direction:**

- **Option A (data fix):** Insert `student_parent` rows linking Zainab Ali to at least 2 students (e.g., Adam Moore and one other in the NHQS tenant)
- **Option B (seed script):** Add parent-student linkage to the tenant seed data

**Playwright verification:**

1. Log in as parent
2. Assert: "Your Students" shows ≥ 1 student card with name
3. Click student → grade view loads

---

### ASSESSMENT-006 — Teacher dashboard calls `/unlock-requests` without permission (403)

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟢 Non-blocking — no data leak, just console noise

**Summary:** The teacher assessment dashboard fires `GET /api/v1/gradebook/unlock-requests` which returns 403 (teacher lacks `gradebook.approve_unlock`). The admin dashboard legitimately calls this endpoint. The teacher variant should not call it.

**Reproduction steps:**

1. Log in as `Sarah.daly@nhqs.test`
2. Navigate to `/en/assessments`
3. Console: `403` on `/api/v1/gradebook/unlock-requests`

**Expected:** Teacher dashboard should not call this endpoint.

**Affected files:**

- Same assessment dashboard component as ASSESSMENT-003
- Grep: `unlock-requests` in the dashboard data-fetching logic

**Fix direction:**

- Gate the unlock-requests fetch behind a role check (admin/principal only)
- Or gate behind `gradebook.approve_unlock` permission

**Playwright verification:**

1. Log in as teacher
2. Navigate to `/en/assessments`
3. Assert: no 403 in console, no `/unlock-requests` call in network

---

### ASSESSMENT-007 — Approval queue tabs don't update URL query parameter

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13
**Provenance:** `[L]` live-verified
**Release gate:** 🟢 Non-blocking — UX polish

**Summary:** On `/en/assessments/approvals`, switching from "Config Approvals" to "Unlock Requests" tab does not update the URL to `?tab=unlocks`. Deep-linking the tab via URL is therefore broken.

**Reproduction steps:**

1. Navigate to `/en/assessments/approvals`
2. Click "Unlock Requests" tab
3. Observe: URL stays as `/en/assessments/approvals` (no `?tab=unlocks`)
4. Paste `/en/assessments/approvals?tab=unlocks` → does not auto-select the Unlock Requests tab

**Expected:** URL should update to `?tab=unlocks`. Deep-linking should work.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/assessments/approvals/` — the tab component
- Grep: `tab=unlocks` or `tab=unlock` across the codebase to check for inconsistency (spec observation #4 flags `?tab=unlocks` vs `?tab=unlock-requests`)

**Fix direction:**

- Add `useSearchParams` / `router.replace` to sync the active tab with the URL
- Pick one canonical param value (`unlocks` or `unlock-requests`) and use it consistently

**Playwright verification:**

1. Navigate to `/en/assessments/approvals`
2. Click "Unlock Requests" tab
3. Assert: URL contains `?tab=unlocks`
4. Navigate directly to `?tab=unlocks`
5. Assert: Unlock Requests tab is active

---

### ASSESSMENT-008 — Approval tabs missing count badges

**Severity:** P2
**Status:** Won't Fix
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Count badges already implemented (approvals/page.tsx lines 309-328). Badges show conditionally: `{configItems.length > 0 && <span>{configItems.length}</span>}`. During walkthrough both counts were 0 (no pending items), so badges were hidden. This is working as designed.
  **Provenance:** `[L]` live-verified
  **Release gate:** 🟢 Non-blocking — UX improvement

**Summary:** Approval page tabs show plain text "Config Approvals" and "Unlock Requests" without count badges. Spec §17.5 expects "Config approvals (3)" / "Unlock requests (1)".

**Reproduction steps:**

1. Navigate to `/en/assessments/approvals`
2. Observe: tab titles have no count

**Expected:** Each tab shows the pending count in parentheses.

**Affected files:**

- Same approvals page component
- The API calls for pending counts are already made (`/assessment-categories?status=pending_approval`, `/unlock-requests?status=pending`)

**Fix direction:**

- Extract the `meta.total` from each pending-status API response
- Display as a badge or parenthetical count in the tab title

---

### ASSESSMENT-009 — Categories table missing Default weight and Updated columns

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: The spec describes columns that were never implemented in the original build (this was a spec-vs-code gap, not a regression). Adding columns and action buttons is feature work beyond a bug-fix run. The existing table is functional. Needs UX decision on whether to add these columns and what the Actions menu should contain.
  **Provenance:** `[L]` live-verified + `[C]` spec comparison
  **Release gate:** 🟢 Non-blocking — data visibility

**Summary:** The assessment categories table (`/en/assessments/categories`) shows 5 columns (Category Name, Subject, Year Group, Status, Actions) but is missing the "Default weight" and "Updated" columns that the spec §21.3 describes. Also, the Actions column cells appear empty (no edit/delete/submit buttons visible).

**Reproduction steps:**

1. Navigate to `/en/assessments/categories`
2. Observe: only 5 columns visible

**Expected:** 7 columns including Default weight and Updated. Actions column should show edit/delete/submit buttons.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/assessments/categories/` — table column definition
- The `default_weight` field exists in the Prisma schema; it's just not surfaced in the table

**Fix direction:**

- Add `default_weight` and `updated_at` to the table column definition
- For Actions, verify if they appear on row hover or if the menu trigger is invisible

---

### ASSESSMENT-010 — Grading weights table missing Teacher and Total % columns

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Same as ASSESSMENT-009 — spec-vs-code gap, not a regression. Adding Teacher column requires resolving user names from IDs (backend may or may not include this in the API response). Adding Total % requires client-side computation of weight sums. Feature work beyond a bug-fix run. Needs UX decision.
  **Provenance:** `[L]` live-verified + `[C]` spec comparison
  **Release gate:** 🟢 Non-blocking — data visibility for admin

**Summary:** The grading weights table (`/en/assessments/grading-weights`) is missing the "Teacher" column (spec §24.2 — admin should see who owns each weight) and the "Total %" column (spec §24.3 — should show sum with color coding: green ≥ 100, amber < 100, red > 100). Also missing cascading filter dropdowns for Subject/Year/Period (spec §24.6).

**Reproduction steps:**

1. Log in as admin
2. Navigate to `/en/assessments/grading-weights`
3. Observe: no Teacher column, no Total % column, only status filter

**Expected:** Teacher column showing the owner, Total % with color-coded sum, cascading filters.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/assessments/grading-weights/` — table definition
- The API response likely includes `teacher_user_id` / `submitted_by`; it needs to be resolved to a name and displayed

**Fix direction:**

- Add Teacher column resolving `teacher_user_id` to full name
- Add Total % column computing sum of `category_weights_json.weights[].weight`
- Add Subject/Year/Period filter dropdowns

---

### ASSESSMENT-011 — Hand-rolled forms violate react-hook-form project rule

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Scope too large for a bug-fix run. Multiple forms across categories, weights, standards, and assessment creation pages. Already tracked as HR-025 migration. Needs dedicated phased migration session.
  **Provenance:** `[C]` code-review (admin spec observation #1)
  **Release gate:** 🟢 Tech debt — tracked as HR-025

**Summary:** Categories, Weights, Standards, and New Assessment forms all use hand-rolled `useState` per field instead of `react-hook-form` with `zodResolver`. This violates the project rule: "New forms must use react-hook-form." Marked as "HR-025 migration" in existing tracking.

**Affected files:**

- Grep: `useState` in `apps/web/src/app/[locale]/(school)/assessments/categories/`
- Grep: `useState` in `apps/web/src/app/[locale]/(school)/assessments/grading-weights/`
- Grep: `useState` in `apps/web/src/app/[locale]/(school)/assessments/curriculum-standards/`

**Fix direction:**

- Migrate each form to `react-hook-form` with `zodResolver` and the corresponding Zod schema from `@school/shared`
- This is a phased migration — can be done form-by-form

---

### ASSESSMENT-012 — No throttle on "Compute Grades" button

**Severity:** P2
**Status:** Won't Fix
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Throttle already implemented. Button uses `disabled={computing}` with `useState(false)` and displays loading text. The `setComputing(true)` runs before the API call and `setComputing(false)` runs in the `finally` block. Working as designed.
  **Provenance:** `[C]` code-review (admin spec observation #12)
  **Release gate:** 🟢 Defence-in-depth — potential DB load under rapid clicks

**Summary:** The "Compute Grades" button on the Grades tab has no client-side throttle or debounce. An admin clicking rapidly could trigger multiple concurrent grade computation requests, potentially hammering Postgres.

**Affected files:**

- Grep: `Compute Grades` or `computeGrades` in `apps/web/src/app/[locale]/(school)/gradebook/`

**Fix direction:**

- **Option A:** Disable the button after click until the response returns (optimistic disable)
- **Option B:** Add an idempotency token to the request so the server deduplicates
- Both options are complementary

---

### ASSESSMENT-013 — Parent dashboard console floods with 403 errors

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Cross-module issue — parent dashboard (`dashboard/parent/`) calling endpoints the parent role lacks permissions for (homework, engagement). Not assessment-specific. Requires auditing parent RBAC permissions across the platform. Out of scope for assessment bug-fix run.
  **Provenance:** `[L]` live-verified
  **Release gate:** 🟢 No data leak but noisy console

**Summary:** Parent dashboard (`/en/dashboard/parent`) fires 8+ API calls that return 403: `/parent/homework/today`, `/parent/homework/overdue`, `/parent/engagement/pending-forms`, `/parent/engagement/events`. These endpoints either don't exist or the parent role lacks the necessary permissions.

**Reproduction steps:**

1. Log in as `parent@nhqs.test`
2. Open console on dashboard load
3. Observe: 8+ 403 errors

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/parent/` — data fetching logic
- The parent dashboard is calling endpoints that the parent role doesn't have permissions for

**Fix direction:**

- Audit which parent dashboard API calls are legitimate
- Gate non-essential calls behind permission checks
- For homework endpoints, verify the parent has `parent.view_homework` or equivalent

---

### ASSESSMENT-014 — Self-approval guard not verified

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Confirmed all three review methods lacked the guard. Added created_by_user_id/requested_by_user_id !== reviewerUserId check to assessment-categories.service.ts, teacher-grading-weights.service.ts, and unlock-request.service.ts. Returns SELF_APPROVAL_NOT_ALLOWED 403.
  **Provenance:** `[C]` code-review (integration spec observation)
  **Release gate:** 🟡 Security — should verify before release

**Summary:** The `submitted_by !== reviewed_by` guard needs explicit verification in `UnlockRequestService.review` and `AssessmentCategoriesService.review`. If an admin submits a category and then approves their own submission, the guard should prevent self-approval. The spec teacher walkthrough §17.4 mentions this but it was not live-verified.

**Affected files:**

- `apps/api/src/modules/gradebook/unlock-requests.service.ts` — `review()` method
- `apps/api/src/modules/gradebook/assessment-categories.service.ts` — `review()` method
- `apps/api/src/modules/gradebook/teacher-grading-weights.service.ts` — `review()` method

**Fix direction:**

- Verify each `review()` method checks `submitted_by !== currentUserId`
- If missing, add the guard with a 403 response: `SELF_APPROVAL_NOT_ALLOWED`

---

### ASSESSMENT-015 — Admin dashboard calls teacher-only homework endpoints (403/404)

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Cross-module issue — main dashboard component calls homework endpoints that return 403/404 for admin role. Not assessment-specific. Requires investigating the homework module's permission model. Out of scope for assessment bug-fix run.
  **Provenance:** `[L]` live-verified
  **Release gate:** 🟢 Cross-module — not assessment-specific

**Summary:** The admin/owner dashboard (`/en/dashboard`) fires `GET /api/v1/homework/today` (403) and `GET /api/v1/homework/completions/unverified` (404). These are teacher-only endpoints. The admin dashboard should not call them.

**Reproduction steps:**

1. Log in as `owner@nhqs.test`
2. Navigate to `/en/dashboard`
3. Console: 403 + 404 on homework endpoints

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/` — dashboard data fetching
- These are NOT assessment-module files but affect the assessment walkthrough console health check

**Fix direction:**

- Gate homework endpoint calls behind role check (teacher only)
- Or use `Promise.allSettled` and suppress expected 403s from non-teacher roles

---

### ASSESSMENT-016 — Verification token flow partially unwired

**Severity:** P3
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Feature work, not a bug fix. Requires implementing a new parent-facing endpoint and UI flow for token-based report card acknowledgement. Scope exceeds bug-fix run. Needs product decision on whether this is MVP.
  **Provenance:** `[C]` code-review (parent spec observation #3)
  **Release gate:** 🟢 Feature completeness — not blocking MVP

**Summary:** The report card verification token flow (emailed link → parent views report card without login) is described in the parent spec §11.6 but may not be fully wired in the UI. The backend `ReportCardVerificationService.verifyToken` exists but the parent-facing acknowledgement endpoint is not confirmed in the backend inventory.

**Affected files:**

- Grep: `verifyToken` in `apps/api/src/modules/`
- Grep: `acknowledge` in `apps/api/src/modules/report-cards/`

**Fix direction:**

- Audit whether the verification token → acknowledgement flow is complete end-to-end
- If the UI endpoint is missing, implement it per the parent spec §11

---

## Machine-Readable Summary

| ID             | Severity | Status        | Provenance | Summary                                          | Release Gate              |
| -------------- | -------- | ------------- | ---------- | ------------------------------------------------ | ------------------------- |
| ASSESSMENT-001 | P0       | **Verified**  | [L]        | Parent sees teacher assessment dashboard         | ✅ Fixed                  |
| ASSESSMENT-002 | P1       | **Verified**  | [L]        | Raw ISO dates in gradebook assessments tab       | ✅ Fixed                  |
| ASSESSMENT-003 | P1       | **Verified**  | [L]        | Teacher calls admin `/teaching-allocations/all`  | ✅ Fixed                  |
| ASSESSMENT-004 | P1       | **Verified**  | [L]        | Parent can access `/en/analytics`                | ✅ Fixed                  |
| ASSESSMENT-005 | P1       | **Blocked**   | [L]        | Parent has no linked students (test data)        | ⏸ Need DB insert approval |
| ASSESSMENT-006 | P2       | **Verified**  | [L]        | Teacher dashboard calls `/unlock-requests` (403) | ✅ Fixed                  |
| ASSESSMENT-007 | P2       | **Verified**  | [L]        | Approval tabs don't update URL param             | ✅ Fixed                  |
| ASSESSMENT-008 | P2       | **Won't Fix** | [L]        | Approval tabs missing count badges               | ✅ Already implemented    |
| ASSESSMENT-009 | P2       | **Blocked**   | [L]+[C]    | Categories table missing columns                 | ⏸ Feature work            |
| ASSESSMENT-010 | P2       | **Blocked**   | [L]+[C]    | Grading weights table missing columns            | ⏸ Feature work            |
| ASSESSMENT-011 | P2       | **Blocked**   | [C]        | Hand-rolled forms (HR-025 tech debt)             | ⏸ Phased migration        |
| ASSESSMENT-012 | P2       | **Won't Fix** | [C]        | No throttle on Compute Grades                    | ✅ Already implemented    |
| ASSESSMENT-013 | P2       | **Blocked**   | [L]        | Parent dashboard console 403 flood               | ⏸ Cross-module            |
| ASSESSMENT-014 | P2       | **Verified**  | [C]        | Self-approval guard not verified                 | ✅ Fixed                  |
| ASSESSMENT-015 | P2       | **Blocked**   | [L]        | Admin dashboard calls homework endpoints         | ⏸ Cross-module            |
| ASSESSMENT-016 | P3       | **Blocked**   | [C]        | Verification token flow unwired                  | ⏸ Feature work            |

---
