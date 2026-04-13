# Assessment Module — Playwright Walkthrough Results

**Date:** 2026-04-13
**Environment:** Production — `nhqs.edupod.app`
**Browser:** Chromium (Playwright MCP)
**Viewport:** 1280×800 (desktop), 375×667 (mobile)
**Tool:** `browser_snapshot` only (no screenshots per project policy)

---

## Severity Tally

| Severity  | Count  | Description                                                                                   |
| --------- | ------ | --------------------------------------------------------------------------------------------- |
| P0        | 1      | Parent role-gate bypass — sees teacher dashboard                                              |
| P1        | 4      | Raw ISO dates, teacher calls admin endpoint, parent analytics access, missing parent grade UI |
| P2        | 8      | Missing table columns, approval tab URL, console 403s, missing filters                        |
| P3        | 3      | Heading text mismatches, missing secondary button, config card layout                         |
| **Total** | **16** |                                                                                               |

---

## Execution Log

### ADMIN WALKTHROUGH (owner@nhqs.test)

#### §3 Global Environment Setup — ✅ Pass

- **3.3** Login: `POST /api/v1/auth/login` → 200. JWT obtained.
- **3.5** Landing: `/en/dashboard` (admin variant, NOT `/en/dashboard/teacher`).
- **3.6** Tenant: `nhqs.edupod.app` in address bar.
- **3.7** Console: 3 errors — all from homework endpoints (`/homework/today` 403, `/homework/completions/unverified` 404). These are cross-module bugs on the main dashboard, not assessment-specific.
- **3.8** Profile: "Yusuf Rahman" / "School Owner" / avatar "YR" — correct.

#### §4 Role Gating — ✅ Pass (with notes)

- **4.1** `/en/assessments` as admin → Leadership Dashboard renders.
- **4.6** No "No staff profile" toast for admin — confirmed absent.

#### §5 Navigation — ✅ Pass (minor gap)

- **5.1** Morph bar: Home, People, Learning, Wellbeing, Operations, Inbox, Finance, Reports, Regulatory, Settings (10 hubs).
- **5.2** Click Learning → `/en/classes`. Sub-strip: Classes, Curriculum, Assessment, Homework, Attendance, **Report Cards** (extra link vs spec, benign).
- **5.3** Click Assessment → `/en/assessments`. Assessment sub-strip: **Dashboard**, **Gradebook**, **Analytics**.
  - ❌ **Missing "Report Cards" link** in assessment sub-strip — spec expects 4 items (Dashboard/Gradebook/Report Cards/Analytics), actual shows 3. **P3.**
- **5.4** Profile button: "Yusuf Rahman" / "School Owner" — correct.

#### §6 Leadership Dashboard — Page Load — ✅ Pass

- **6.1–6.2** Skeleton → fully rendered. All panels present.
- **6.3** Parallel API calls all returned 200: `/teaching-allocations/all`, `/subjects`, `/assessments?exclude_cancelled=true`, `/assessment-categories`, `/teacher-grading-weights`, `/rubric-templates`, `/curriculum-standards`.
- **6.4** Console: zero NEW errors on the assessment page itself.
- **6.5** Tenant isolation: all responses contain only NHQS data.

#### §7 Header & Action Buttons — ✅ Pass (minor gap)

- **7.1** `<h1>`: "Assessment Oversight" — correct.
- **7.2** Subtitle: correct text.
- **7.3** Action buttons: "Open approvals queue" (link) + "Refresh" (button).
  - ❌ **Missing "Gradebook" secondary outline button** — spec expects 3 buttons, actual shows 2. **P3.**

#### §8 KPI Strip — ✅ Pass

- Six KPI cards rendered: Scheduled (2), Pending Grading (0), Overdue (0), Submitted (46), Final Locked (0), Active Teachers (16).
- Card names differ from spec (spec: "Total Assessments" / "Open Assessments" / etc.) but functional mapping is clear.
- Zero-state handling: cards showing "0" (not "—" or "NaN") — minor deviation from spec §8.9 but acceptable.

#### §9 Inline Approval Queue — 🟡 Partial

- No dedicated inline approval queue section visible on dashboard (spec §9 expects it as a separate panel).
- The "Open approvals queue" button navigates to the full approvals page. Config counts show zero pending, so this may be intentional suppression when queue is empty. **P3.**

#### §10 Teachers Needing Attention — ✅ Pass

- "Teachers needing attention" heading present.
- "0 teachers" with success message: "Every teacher is on top of their grading. Nothing overdue."

#### §11 Config Health — ✅ Pass

- "Config health" heading, "1/16 ready" summary.
- Table with 15 classes (K1A through 1B), columns: Class, Config, Categories, Weights.

#### §12 Activity by Subject — ✅ Pass

- "Activity by subject" heading.
- 14 subjects listed across 7 columns (Subject, Scheduled, Pending, Overdue, Submitted, Final, Total).
- Filter dropdowns: "All years" / "All classes" — functional.
- Summary: "14 subjects · 48 active assessments".

#### §13 Year-Group & Class Filters — ✅ Pass

- Two combobox dropdowns present and functional.

#### §14 Quick-Access Config Cards — ✅ Pass

- 4 cards: Categories (4/4 All approved), Grading Weights (18/18 All approved), Rubric Templates (0), Curriculum Standards (1).
- Links navigate to correct pages.

#### §15 Jump-to Row — ✅ Pass

- 3 cards: Curriculum matrix, Gradebook, Grade analytics — all with correct links.

#### §17–20 Approval Queue Page — ✅ Pass (gaps noted)

- URL: `/en/assessments/approvals`.
- Heading: "Approval Queue" (spec says "Approvals" — **P3** text difference).
- Two tabs: "Config Approvals" (default) and "Unlock Requests".
- Config Approvals tab: "No pending configuration approvals" empty state.
- Unlock Requests tab: "No pending unlock requests" empty state.
- ❌ **URL does not update with `?tab=unlocks`** when switching tabs — spec §17.4. **P2.**
- ❌ **No count badges on tab titles** — spec §17.5 expects e.g., "Config approvals (3)". **P2.**

#### §21 Assessment Categories — ✅ Pass (gaps noted)

- URL: `/en/assessments/categories`.
- Heading: "Assessment Categories". "Create Category" button present.
- Table: 4 rows, all Approved. Columns: Category Name, Subject, Year Group, Status, Actions.
- ❌ **Missing columns**: Default weight, Updated — spec §21.3. **P2.**
- ❌ **Actions column appears empty** — no visible edit/delete/submit buttons. **P2.**
- ❌ **No subject filter dropdown** — spec §21.8. **P2.**
- Status filter dropdown "All Statuses" present and functional.
- Pagination: "Showing 1–4 of 4" — correct.

#### §24 Grading Weights — ✅ Pass (gaps noted)

- URL: `/en/assessments/grading-weights`.
- 18 rows, all Approved. Weights all use the same 10/20/30/40 distribution.
- ❌ **Missing "Teacher" column** — spec §24.2. Admin should see which teacher owns each weight. **P2.**
- ❌ **Missing "Total %" column** — spec §24.3. **P2.**
- ❌ **Missing cascading filter dropdowns** (Subject/Year/Period) — spec §24.6. **P2.**
- Actions column empty (same as categories).

#### §27 Rubric Templates — ✅ Pass

- Empty state: "No rubric templates yet. Create one to get started." — correct.
- "Create" button present.

#### §30 Curriculum Standards — ✅ Pass

- 1 row: ACC / Accounting / Kindergarten / Approved.
- "Create" button present. Subject + Year Group filter dropdowns present.

#### §32–33 Gradebook Listing — ✅ Pass

- URL: `/en/gradebook`.
- Year group sections: "1st class" (2 classes: 1A/1B), "2nd class" (1 class: 2A).
- Class cards: buttons showing class name + assessment count.

#### §34–37 Class Gradebook (2A) — ✅ Pass (P1 bug)

- Three tabs: Assessments (default), Results, Grades — all render.
- Subject filter: "All Subjects" dropdown.
- Grouped view: assessments under subject headers (Biology, Chemistry, Economics, English, Geography, History, Mathematics).
- Teacher names shown per subject group.
- ❌ **P1: Due dates shown as raw ISO timestamps** — e.g., `2025-10-15T00:00:00.000Z` instead of formatted date. Grade entry page formats dates correctly ("24/10/2025"), so bug is isolated to the Assessments tab. **P1.**
- Console: 404 on `/api/v1/gradebook/teaching-allocations` (benign admin miss, spec observation #6).

#### §40 Results Tab — ✅ Pass

- Period selector with text "Select a period to view the results matrix."

#### §41 Grades Tab — ✅ Pass

- Subject and Period dropdowns. "Compute Grades" button present.
- Instruction: "Select a subject and period to view grades."

#### §44 Grade Entry Page — ✅ Pass

- URL: `/en/gradebook/{classId}/assessments/{assessmentId}/grades`.
- "English S1 Homework" — Status: Locked.
- Meta: Category: Homework, Max Score: 50, Due Date: 24/10/2025 (correctly formatted!).
- Locked banner: "This assessment is locked" + "Request Unlock" button.
- 25 students with scores. All inputs disabled (locked state).
- "25 of 25 students graded" progress indicator.

#### §56–62 Analytics — ✅ Pass

- Class selector: 16 classes listed.
- Selected 2A → Period/Subject/Student dropdowns appear.
- Selected S1 → Full analytics:
  - KPIs: Mean 67.63%, Median 68.21%, Std Dev 15.91, Pass Rate 60%, Highest 94.73%, Lowest 41.09%.
  - Grade Distribution chart (A:2, B:5, C:3, D:5, F:10).
  - Average Score by Subject chart (7 subjects).
  - Top 5 / Bottom 5 performers lists.
  - Full Student Rankings table (25 students, #/Student/Score/Grade/Percentile).
- Zero console errors.

#### §72 Arabic / RTL — ✅ Pass

- `/ar/assessments`: `<html dir="rtl" lang="ar">` confirmed.
- All navigation translated to Arabic.
- Latin digits confirmed (0-9). No Arabic digits (٠-٩).

#### §74 Mobile (375px) — ✅ Pass

- Hamburger menu replaces morph bar navigation.
- Sub-strip horizontally scrollable.
- All dashboard sections render.
- No horizontal overflow (body.scrollWidth === body.clientWidth === 375).

---

### TEACHER WALKTHROUGH (Sarah.daly@nhqs.test)

#### §3 Global Environment Setup — ✅ Pass

- **3.3** Login successful. JWT contains teacher role.
- **3.4** Landing: `/en/dashboard/teacher` — correct.
- **3.5** Hubs: Home, People, Learning, Wellbeing, Operations, Inbox, Reports (7). NO Finance, Regulatory, Settings — correct.
- **3.7** Profile: "Sarah Daly" / "Teacher" / avatar "SD".

#### §4 Role Gating — ✅ Pass (bugs noted)

- **4.1** `/en/assessments` → renders Teacher Assessment Dashboard (not Leadership).
- **4.4** Heading: "Assessment Dashboard" — spec expects "My assessments". **P3.**
- **4.5** No "No staff profile" toast — correct.
- ❌ **Network calls `/api/v1/gradebook/teaching-allocations/all`** — the admin-only endpoint. Spec §4.3 says teacher MUST NOT call this. Returns 200 (teacher gets their own data anyway, but this is a code-smell / defense-in-depth issue). **P1.**
- ❌ **Console 403 on `/api/v1/gradebook/unlock-requests`** — teacher doesn't have permission but the page calls it anyway. **P2.**

#### §5 Teacher Dashboard Navigation — ✅ Pass

- Learning sub-strip (teacher): Assessment, Homework, Attendance, Report Cards.
- Assessment sub-strip: Dashboard, Gradebook, Analytics.

#### §7 KPI Strip — ✅ Pass

- 4 cards: Total Allocations (14), Missing Config (4), Approved Weights (10/14), Total Assessments (10).

#### §8 Allocations Table — ✅ Pass

- 14 allocations: Arabic (K1A/K1B/J1A/SF1A), Business (1A/1B), English (2A/2B), Biology (5A/5B), History (3A/3B), Mathematics (4A/4B).
- Columns: Class, Subject, Year Group, Grade Config, Assessment Categories, Weights, Assessments, View Workspace.
- English 2A: 10 assessments — confirmed.
- "View Workspace" links navigate to `/assessments/workspace/{classId}/{subjectId}`.

#### §9 Config Status — ✅ Pass

- 4 config cards: Categories (4/4), Grading Weights (18), Rubric Templates (0), Curriculum Standards (1).
- "My Configuration Status" section with tabs and table.
- Assessment Categories tab: 4 approved categories listed.

#### §20 Workspace (2A English) — ✅ Pass

- Heading: "2A — English" / "2nd class".
- "Create Assessment" link present.
- Setup Status: Grade Config (Configured ✅), Approved Categories (4), Approved Weights (Configured ✅).
- Recent Assessments: 10 rows. Mix of "Submitted" and "Cancelled" statuses.
- Due dates **correctly formatted** here (e.g., "15 May 2026").
- Cancelled assessments show cancellation reasons inline.

---

### PARENT WALKTHROUGH (parent@nhqs.test)

#### §3 Global Environment Setup — 🔴 Fail

- **3.3** Login successful. Profile: "Zainab Ali" / "Parent" / avatar "ZA".
- **3.4** Landing: `/en/dashboard/parent` — correct.
- **3.5** Hubs: Home, Learning, Reports (3) — correctly minimal.
- **3.6** Console: **12 errors** on dashboard load:
  - 403 on `/api/v1/homework/today`, `/parent/homework/today`, `/parent/homework/overdue`, `/parent/engagement/pending-forms`, `/parent/engagement/events`
  - Multiple `[DashboardParentPage]` error logs.
- ❌ **"Your Students" shows "No results found"** — parent has no linked students, blocking all grade/report card testing. **P1.**

#### §4 Parent Role Gate — 🔴 FAIL (P0)

- **4.1** Navigate `/en/assessments` as parent:
  - ❌ **P0: Parent sees the Teacher Assessment Dashboard** — heading "Assessment Dashboard", subtitle "View your teaching allocations and assessment setup status". 25 console errors (all gradebook endpoints return 403).
  - Expected: 403 or redirect to parent dashboard.
  - The teacher UI structure is fully exposed to the parent role. While data endpoints return 403 (so no actual data leaks), the UI shell, navigation structure, and endpoint URL patterns are visible.
- **4.2** Navigate `/en/gradebook` as parent:
  - ✅ Correctly redirects to `/en/dashboard` — role gate works here.
- **4.3** Navigate `/en/analytics` as parent:
  - ❌ **P1: Parent can access analytics page.** Shows analytics shell with class selector. Toast: "Missing required permission: students.view". Should redirect instead.

#### §5–20 Parent Grade/Report Card Views — 🚫 Blocked

- All parent grade view testing **blocked** because:
  1. No linked students in `student_parent` table for this parent.
  2. No parent-specific assessment/grade UI surface exists (the `/en/assessments` route shows the teacher dashboard, not a parent grade view).

---

## Recommended Immediate Actions

1. **[P0] Fix parent role gate on `/en/assessments`** — add permission guard that redirects parents away from the teacher/admin assessment dashboard. Parents must not see the assessment configuration/workspace UI.

2. **[P1] Fix raw ISO date display in gradebook Assessments tab** — the `due_date` column renders `2025-10-15T00:00:00.000Z` instead of a formatted date. The grade entry page already formats dates correctly, so the fix is isolated to the assessments table cell renderer.

3. **[P1] Fix teacher calling admin endpoint `/teaching-allocations/all`** — the teacher assessment dashboard calls the admin-only endpoint. It should use `/teaching-allocations` (without `/all`).

4. **[P1] Build parent-specific grade view** — the parent spec describes a dedicated grade/report card surface (`/en/academics/children/{studentId}/grades` or similar) that does not currently exist.

5. **[P1] Fix parent role gate on `/en/analytics`** — add permission guard or redirect.

---
