# E2E Test Specification: Assessment — Gradebook (Admin View)

> **Coverage:** This document covers the Gradebook flow from an administrator's perspective (`school_owner`, `school_principal`, `school_vice_principal`, `admin`). The same URLs render the same underlying components as the teacher view, but several behaviours differ because admins have no teaching allocations, carry the `gradebook.manage` permission, and can act on any assessment regardless of subject ownership.
>
> **Pages documented here:**
>
> - Gradebook Listing (`/en/gradebook`) — class cards grouped by year group
> - Class Gradebook Workspace (`/en/gradebook/{classId}`) — Assessments / Results / Grades tabs
> - Grade Entry (`/en/gradebook/{classId}/assessments/{assessmentId}/grades`) — read/moderate individual student grades
> - New Assessment (`/en/gradebook/{classId}/assessments/new`) — admin-initiated creation
>
> **Differences from the teacher view** (summary, full detail below):
>
> - Admin is NOT required to own a subject to see or edit assessments in it
> - There is **no auto-collapse** of non-owned subject groups (the workspace shows every subject expanded by default)
> - There is **no row dimming** for "non-owned" subjects (`mySubjectIds.size === 0` means the gating treats everything as owned)
> - The "Click a row to Grade Entry" affordance is available on every row
> - The admin has the `gradebook.manage` permission and can access any assessment's grades without the per-class staff_profile check the teacher path applies
> - The teacher view's "Request Unlock" button is replaced, conceptually, by the admin's **approval authority** — admins can directly transition state without filing a request
> - The gradebook listing filter (classes with ≥1 assessment) applies equally: admins do NOT see zero-assessment classes in the listing

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`), School Owner role in **Nurul Huda School (NHQS)**.
**Navigation path:** Learning → Assessment → **Gradebook** (second Assessment sub-strip item).

---

## Table of Contents

1. [Navigating to the Gradebook Listing](#1-navigating-to-the-gradebook-listing)
2. [Gradebook Listing — Page Load and Structure](#2-gradebook-listing--page-load-and-structure)
3. [Gradebook Listing — Year-Group Sections and Class Cards](#3-gradebook-listing--year-group-sections-and-class-cards)
4. [Class Gradebook — Page Load and Layout](#4-class-gradebook--page-load-and-layout)
5. [Assessments Tab — Grouped View for Admin (No Auto-Collapse, No Dim)](#5-assessments-tab--grouped-view-for-admin-no-auto-collapse-no-dim)
6. [Assessments Tab — Subject Filter](#6-assessments-tab--subject-filter)
7. [Assessments Tab — Flat View](#7-assessments-tab--flat-view)
8. [Assessments Tab — New Assessment as Admin](#8-assessments-tab--new-assessment-as-admin)
9. [Assessments Tab — From-Template Popover](#9-assessments-tab--from-template-popover)
10. [Results Tab — Admin View](#10-results-tab--admin-view)
11. [Results Tab — All Periods Pooled View](#11-results-tab--all-periods-pooled-view)
12. [Results Tab — Excel and PDF Export as Admin](#12-results-tab--excel-and-pdf-export-as-admin)
13. [Grades Tab — Admin Filters and Views](#13-grades-tab--admin-filters-and-views)
14. [Grades Tab — Compute Grades as Admin](#14-grades-tab--compute-grades-as-admin)
15. [Grades Tab — Override Dialog as Admin](#15-grades-tab--override-dialog-as-admin)
16. [Grade Entry Page — Admin Read and Moderate](#16-grade-entry-page--admin-read-and-moderate)
17. [Grade Entry Page — Admin Actions Beyond Teacher Scope](#17-grade-entry-page--admin-actions-beyond-teacher-scope)
18. [Cancelled Assessments in the Workspace (Cross-Ref)](#18-cancelled-assessments-in-the-workspace-cross-ref)
19. [Admin Side — Console of Failed API Calls to Teacher-Scoped Endpoints](#19-admin-side--console-of-failed-api-calls-to-teacher-scoped-endpoints)
20. [Arabic / RTL](#20-arabic--rtl)

---

## 1. Navigating to the Gradebook Listing

| #   | What to Check                                                                                   | Expected Result                                                                            | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 1.1 | From the Leadership Assessment Dashboard, click **Gradebook** in the Assessment sub-strip       | Browser URL becomes `/en/gradebook`. The Gradebook link is now active in the sub-strip.    |           |
| 1.2 | Verify the Assessment sub-strip (**Dashboard / Gradebook / Report Cards / Analytics**) persists | All four links are still visible.                                                          |           |
| 1.3 | Alternative entry: from the dashboard Jump-to row, click the **Gradebook** card                 | Also lands on `/en/gradebook`. Same state.                                                 |           |
| 1.4 | Alternative entry: from the Learning hub, navigate directly via the /en/gradebook URL           | Also lands successfully. Admin's hub routing recognises gradebook as a Learning sub-route. |           |

---

## 2. Gradebook Listing — Page Load and Structure

**URL:** `/en/gradebook`

| #   | What to Check             | Expected Result                                                                                                                                                                                                                                                                                | Pass/Fail |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Page heading              | An `<h1>` reads **"Gradebook"**.                                                                                                                                                                                                                                                               |           |
| 2.2 | Loading state             | Two skeleton row blocks for ~500ms: a skeleton section heading above a grid of skeleton cards.                                                                                                                                                                                                 |           |
| 2.3 | Data sources              | Parallel fetches: `/api/v1/year-groups`, `/api/v1/classes?pageSize=100&status=active`, and `/api/v1/gradebook/assessments?pageSize=100&exclude_cancelled=true` (paginated).                                                                                                                    |           |
| 2.4 | Filtering — listing scope | Same for admin as for teacher: only classes that have **≥1 non-cancelled assessment** appear. A zero-assessment class is omitted. This is a design choice of the listing, not a permission filter. Admins see the full gradebook oversight via the leadership dashboard's Config Health panel. |           |
| 2.5 | Empty state               | If the tenant has zero gradebook-eligible classes, an EmptyState card with a BookOpen icon reads **"No classes with assessments yet"** (localised from `gradebook.noClasses`).                                                                                                                 |           |
| 2.6 | Browser console           | No red errors. As admin you MAY see a **404 on `/api/v1/gradebook/teaching-allocations`** in the background — this is the class workspace page's `my-allocations` fetch, which is wrapped in `Promise.allSettled` and logged as a 404. Not a crash, just a benign noise (see section 19).      |           |

---

## 3. Gradebook Listing — Year-Group Sections and Class Cards

| #    | What to Check                                  | Expected Result                                                                                                                                                                                                                                                               | Pass/Fail |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Year group sections                            | Same structure as the teacher view. Each section: GraduationCap icon, year group name (e.g. "2nd class"), class-count line ("1 class" / "2 classes"), thin trailing border.                                                                                                   |           |
| 3.2  | Year group ordering                            | Sorted by `display_order` ascending. For NHQS: **1st class**, **2nd class**.                                                                                                                                                                                                  |           |
| 3.3  | NHQS-specific sections rendered                | **"1st class"** (2 classes: 1A, 1B) and **"2nd class"** (1 class: 2A). No other year groups appear because they have no non-cancelled assessments yet.                                                                                                                        |           |
| 3.4  | Classes with zero assessments are filtered out | Even though the tenant has 16 active classes (verified via the analytics class selector), the gradebook listing only shows the 3 classes that actually have assessments today. An admin seeking the full picture uses the leadership dashboard's Config Health panel instead. |           |
| 3.5  | Card layout                                    | Rounded-2xl button with border. Decorative gradient strip across the top. Inside: class name (large bold), BookOpen icon on the right, then a large number (assessment count) with label "assessment" or "assessments" (pluralised).                                          |           |
| 3.6  | Card counts for NHQS                           | 1A → **4 assessments**, 1B → **1 assessment**, 2A → **43 assessments**.                                                                                                                                                                                                       |           |
| 3.7  | Responsive grid                                | 1 col mobile, 2 at `sm:`, 3 at `lg:`, 4 at `xl:`.                                                                                                                                                                                                                             |           |
| 3.8  | Card order within a section                    | Alphabetical by class name. 1A before 1B.                                                                                                                                                                                                                                     |           |
| 3.9  | Click the **2A** card                          | Browser navigates to `/en/gradebook/76ce55f7-d722-4927-8038-fa304c9c4e05` (or whatever the 2A class id is). Class workspace loads.                                                                                                                                            |           |
| 3.10 | Keyboard: Tab to a card and press Enter        | Focus ring (2px primary) visible; Enter triggers navigation.                                                                                                                                                                                                                  |           |
| 3.11 | Hover state                                    | Border becomes `primary-300`, `hover:shadow-md`. BookOpen icon tints to `primary-600`.                                                                                                                                                                                        |           |

---

## 4. Class Gradebook — Page Load and Layout

**URL:** `/en/gradebook/{classId}` (example: `/en/gradebook/76ce55f7-d722-4927-8038-fa304c9c4e05` for 2A).

### 4.1 Header row

| #     | What to Check                                        | Expected Result                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Back button                                          | ArrowLeft ghost button on the far left. Clicking it returns to `/en/gradebook`.                                                                                      |           |
| 4.1.2 | Page heading                                         | Reads **"Gradebook"** (not the class name).                                                                                                                          |           |
| 4.1.3 | Right-side actions (visible only on Assessments tab) | **New Assessment** primary button with a `+` icon. If any assessment templates exist, an outline **"From Template"** button appears to the left.                     |           |
| 4.1.4 | Both actions are fully enabled for admin             | The teacher view's role check is bypassed for admins — the `gradebook.manage` permission grants unrestricted access to both buttons regardless of subject ownership. |           |

### 4.2 Tab bar

| #     | What to Check                       | Expected Result                                                                                        | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 4.2.1 | Three tab buttons                   | **Assessments**, **Results**, **Grades**. First tab active by default (primary colour, bottom border). |           |
| 4.2.2 | Keyboard navigation                 | Tab into nav, Enter to switch. `aria-current="page"` on the active tab.                                |           |
| 4.2.3 | Overflow scroll on narrow viewports | On mobile (<640px), nav becomes horizontally scrollable.                                               |           |

### 4.3 Background data fetches

| #     | What to Check                                                        | Expected Result                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | `teaching-allocations` (my-allocations)                              | The page calls `/api/v1/gradebook/teaching-allocations` even for admins. Backend returns **404 STAFF_PROFILE_NOT_FOUND** for the admin user. The call is wrapped in `Promise.allSettled` so the 404 does NOT break the page; the frontend treats it as an empty set. |           |
| 4.3.2 | `classes/{classId}/allocations` (class allocations)                  | Same endpoint the teacher path uses. Returns the full allocation set for the class (all teachers across all subjects). This data populates the subject filter dropdown and the "teacher names" shown on the grouped section headers.                                 |           |
| 4.3.3 | `assessments?class_id={classId}&exclude_cancelled=true&pageSize=100` | Returns the class's assessments list, used to build both the grouped view and the subject filter dropdown.                                                                                                                                                           |           |
| 4.3.4 | Race / sequencing                                                    | The class page uses `Promise.allSettled` intentionally because it knows admins will 404 the my-allocations call. Do NOT interpret the 404 as an error state.                                                                                                         |           |

---

## 5. Assessments Tab — Grouped View for Admin (No Auto-Collapse, No Dim)

For admin users, the class workspace behaves differently than for teachers because `mySubjectIds` is always empty.

### 5.1 Subject grouping

| #      | What to Check                                                     | Expected Result                                                                                                                                                                                                                                                              | Pass/Fail |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1  | With filter = **All Subjects** and multiple subjects in the class | Table is rendered in **grouped-by-subject** mode.                                                                                                                                                                                                                            |           |
| 5.1.2  | Number of subject groups for 2A                                   | **7 groups**: Biology, Chemistry, Economics, English, Geography, History, Mathematics.                                                                                                                                                                                       |           |
| 5.1.3  | Group header row content                                          | `<tr colspan=6>` with: subject name (bold), em-dash, all teacher names for that (class, subject) joined with commas, and assessment count in parentheses.                                                                                                                    |           |
| 5.1.4  | Biology group header                                              | Reads **"Biology — Isabella Doherty, Patrick Moran (6)"**.                                                                                                                                                                                                                   |           |
| 5.1.5  | Chemistry group header                                            | **"Chemistry — Grace Reilly, Thomas Duffy (6)"**.                                                                                                                                                                                                                            |           |
| 5.1.6  | English group header                                              | **"English — Chloe Kennedy, Sarah Daly, William Dunne (7)"**.                                                                                                                                                                                                                |           |
| 5.1.7  | Geography group header                                            | **"Geography — Ella Farrell, Samuel Lynch (6)"**.                                                                                                                                                                                                                            |           |
| 5.1.8  | History group header                                              | **"History — Jack Murray, Zoe Power (6)"**.                                                                                                                                                                                                                                  |           |
| 5.1.9  | Mathematics group header                                          | **"Mathematics — Lily Healy, Owen Burke (6)"**.                                                                                                                                                                                                                              |           |
| 5.1.10 | **Economics** group header (data-integrity edge case)             | Reads **"Economics (6)"** — just the name and count, no teacher names. This is because the tenant has assessments for (2A, Economics) but no teaching allocation records linking a staff member to the pair. The grouped-view component handles missing teachers gracefully. |           |

### 5.2 Expansion state — all expanded by default for admin

This is the key admin difference from the teacher view.

| #     | What to Check                                | Expected Result                                                                                                                                           | Pass/Fail |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 5.2.1 | All 7 subject groups are EXPANDED by default | Every group header shows a ChevronDown (not ChevronRight). All assessment rows underneath are visible.                                                    |           |
| 5.2.2 | Explanation                                  | The auto-collapse effect in the class page guards with `if (!allocationsLoaded                                                                            |           | !groupedBySubject |     | mySubjectIds.size === 0) return;`. For admin, `mySubjectIds` is empty (404 on my-allocations), so the auto-collapse ref is never initialised and NO groups collapse on load. |     |
| 5.2.3 | Manual toggle still works                    | Click any group header's chevron → group collapses manually. Click again → expands. State is local only; refresh restores the initial all-expanded state. |           |

### 5.3 Row dimming / ownership display — NONE for admin

| #     | What to Check                                              | Expected Result                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.3.1 | All assessment rows render at normal opacity               | No `opacity-50` treatment. For the teacher view, non-owned subject rows are dimmed. For admin, `mySubjectIds.size === 0` and the `isFilteredSubjectOwned` helper returns true in ALL cases, so nothing is dimmed. |           |
| 5.3.2 | All rows have the "Grade Entry" button in Actions          | Every row shows a ghost Button labelled **"Grade Entry"** with a stopPropagation click handler. No rows have a disabled/hidden Actions button.                                                                    |           |
| 5.3.3 | Clicking any row (including "non-owned" Biology) navigates | Clicking an English row OR a Biology row OR a Chemistry row all take the admin to `/en/gradebook/{classId}/assessments/{assessmentId}/grades`. Admin has no ownership restriction.                                |           |

### 5.4 Status column — same rules as teacher view

| #     | What to Check                      | Expected Result                                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.4.1 | Computed display for `open` status | Same `computeDisplayStatus` helper as the teacher view: Scheduled (info) if today < due_date, Pending Grading (warning) if due_date passed but grading_deadline not passed, Overdue (danger) if grading_deadline passed.                                                             |           |
| 5.4.2 | Terminal states                    | draft → Draft (warning), closed → Cancelled (danger, filtered out by `exclude_cancelled=true`), submitted_locked → Submitted (success), unlock_requested → Unlock Requested (warning), reopened → Reopened (info), final_locked → Final Locked (neutral), locked → Locked (neutral). |           |

---

## 6. Assessments Tab — Subject Filter

| #   | What to Check                                           | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Subject dropdown                                        | Select trigger with placeholder "Subject". Default value: **All Subjects**. Options: "All Subjects" + one option per subject taught in the class (derived from the class allocations endpoint), sorted alphabetically.             |           |
| 6.2 | Subject options for 2A                                  | **All Subjects**, **Biology**, **Chemistry**, **Economics**, **English**, **Geography**, **History**, **Mathematics**.                                                                                                             |           |
| 6.3 | Change to **English**                                   | Grouping disappears. Rows render in a flat DataTable (see section 7). All 7 English assessments for 2A appear in the flat view.                                                                                                    |           |
| 6.4 | Change to a subject admin does not teach (e.g. Biology) | **No dim treatment** for admin. The flat view renders normally. Clicking any row navigates to Grade Entry. The teacher view applies opacity-50 and disables row clicks — admin is exempt.                                          |           |
| 6.5 | Change to **All Subjects**                              | Returns to grouped-by-subject view with all 7 groups expanded.                                                                                                                                                                     |           |
| 6.6 | Cancelled assessments excluded                          | Because the query includes `exclude_cancelled=true`, no rows with status `closed` appear. To see cancelled assessments, admins must use the Subject Workspace page (teacher dashboard spec §9 — admin can also access it via URL). |           |

---

## 7. Assessments Tab — Flat View

| #   | What to Check                                          | Expected Result                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Trigger: Subject filter = specific subject (not "all") | A DataTable renders with columns **Title**, **Status**, **Category**, **Max Score**, **Due Date**, **Actions**.                                           |           |
| 7.2 | Pagination                                             | Page size: **20**. Bottom of the table shows pagination controls if there are more than 20 rows. Admins can change pages — same controls as teacher view. |           |
| 7.3 | Click a row (or the Grade Entry button)                | Navigates to `/en/gradebook/{classId}/assessments/{assessmentId}/grades` regardless of subject ownership.                                                 |           |
| 7.4 | Pagination state resets when subject filter changes    | Flipping from English to Biology resets `assessmentsPage = 1`.                                                                                            |           |

---

## 8. Assessments Tab — New Assessment as Admin

### 8.1 Opening the form

| #     | What to Check                                               | Expected Result                                                                                                                                                                                                           | Pass/Fail |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Click the **New Assessment** button in the workspace header | Browser navigates to `/en/gradebook/{classId}/assessments/new`. No `subject_id` query param is set (admin didn't come from a subject workspace).                                                                          |           |
| 8.1.2 | Subject field                                               | A full combobox labelled "Subject". Unlike the teacher view (which pre-fills from URL), admin's Subject is an open selector listing every subject taught in this class. Admin must pick one before submitting.            |           |
| 8.1.3 | All other fields behave like the teacher create flow        | Title (required text), Period (required combobox), Category (required combobox, options depend on selected subject), Max Score (default 100), Due Date (required), Grading Deadline (optional), Counts Toward (checkbox). |           |

### 8.2 Permission differences for admin

| #     | What to Check                                                                | Expected Result                                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | Admin can create an assessment for ANY subject taught in the class           | POST `/api/v1/gradebook/assessments`. Backend enforces `gradebook.enter_grades` permission which admins hold via `gradebook.manage`. No 403.                                                                                                                                    |           |
| 8.2.2 | Admin can create an assessment for a subject that has no teaching allocation | If the class has assessments for Economics but no allocation (NHQS 2A Economics case), admin can still create a new Economics assessment. The form does NOT fall back to a missing-teacher error.                                                                               |           |
| 8.2.3 | Admin-created assessment — default teacher attribution                       | Because the Assessment table has no `created_by` or `teacher_id` column, the new assessment is identified only by `(class_id, subject_id, category_id)`. When a teacher later opens the class workspace, they see the admin-created row as if any teacher in the group owns it. |           |
| 8.2.4 | After successful POST                                                        | Browser redirects to `/en/gradebook/{classId}` (class workspace). The new assessment appears in the grouped view under the chosen subject with status **Draft**.                                                                                                                |           |

### 8.3 Cancel flow

| #     | What to Check                               | Expected Result                                                      | Pass/Fail |
| ----- | ------------------------------------------- | -------------------------------------------------------------------- | --------- |
| 8.3.1 | Click **Cancel** in the form without saving | Form discards without API call; browser returns to the previous URL. |           |

---

## 9. Assessments Tab — From-Template Popover

Identical to the teacher view, but accessible from admin regardless of subject ownership.

| #   | What to Check                          | Expected Result                                                                                                                                                     | Pass/Fail |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | "From Template" button visibility      | Renders in the header when `/api/v1/gradebook/assessment-templates` returns at least 1 template. For NHQS today it is hidden because the tenant has no templates.   |           |
| 9.2 | Populated state: click "From Template" | A Popover opens. Header text: **"Assessment Templates"**. List of template buttons with template name + "/ {max_score}".                                            |           |
| 9.3 | Click a template                       | Popover closes. Navigate to `/en/gradebook/{classId}/assessments/new?template_id={id}`. Form pre-fills Title, Category, Max Score, Counts Toward from the template. |           |

---

## 10. Results Tab — Admin View

The Results tab renders the pooled-by-category matrix. Behaviour is identical for admin and teacher EXCEPT that admin has access to every class's matrix without subject ownership restrictions.

### 10.1 Initial state

| #      | What to Check                    | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1.1 | Click **Results** tab            | Assessments grid unmounts; `<ResultsMatrix>` component mounts.                                                                                               |           |
| 10.1.2 | Notice banner                    | Always visible. Info-coloured border/background, Info icon, text starting with **"Note:"** and explaining that pooled raw scores don't drive final grades.   |           |
| 10.1.3 | Empty state (no period selected) | Single-line paragraph: **"Select a period to view the results matrix."** No matrix rendered.                                                                 |           |
| 10.1.4 | Period dropdown                  | Radix Select with placeholder "Period". Options: **All Periods** (first), then one option per academic period. For NHQS 2A: **All Periods**, **S1**, **S2**. |           |

### 10.2 Single-period matrix (S1)

| #      | What to Check               | Expected Result                                                                                                                                                                                                               | Pass/Fail |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Select **S1**               | GET `/api/v1/gradebook/classes/{classId}/results-matrix?academic_period_id={s1Id}`. Wide matrix loads.                                                                                                                        |           |
| 10.2.2 | Subject header row (row 1)  | One header per subject, each spanning multiple category columns. For NHQS 2A: 7 subjects, each with 3 categories → 21 category columns total.                                                                                 |           |
| 10.2.3 | Category header row (row 2) | One column per (subject, category) pair. Category names: **End of Term Test**, **Homework**, **Mid-Term Test**.                                                                                                               |           |
| 10.2.4 | Student rows                | **25 rows** for 2A — one per active enrolled student. Alphabetical by last name.                                                                                                                                              |           |
| 10.2.5 | Cell format                 | Pooled percentage in mono font with 1 decimal place (e.g. `71.5%`), or em-dash **—** if no assessments contributed.                                                                                                           |           |
| 10.2.6 | Pooling math spot check     | English / Mid-Term Test for a student with two assessments (44/100 and 65/100) reads `54.5%` = `(44+65)/(100+100) × 100`.                                                                                                     |           |
| 10.2.7 | Sticky student name column  | `sticky start-0 z-10 bg-inherit` — pinned during horizontal scroll. When scrolling, category cells scroll UNDER the pinned name cell with no bleed-through.                                                                   |           |
| 10.2.8 | Stats bar at the bottom     | Reads **"{N} students · {M} subjects · {X} of {Y} grades entered"**. For 2A/S1: 25 students · 7 subjects · 525 of 525 grades entered (each student has 7 × 3 = 21 category cells, 25 × 21 = 525 potential cells, all filled). |           |

### 10.3 Subject filter (after data loads)

| #      | What to Check                              | Expected Result                                                                                                                                           | Pass/Fail |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | A second Select appears after matrix loads | Placeholder "Subject". Default **All Subjects**. Options: one per subject in the matrix (derived from `matrix.subjects`).                                 |           |
| 10.3.2 | Change to **English**                      | Matrix narrows to 3 category columns (End of Term Test, Homework, Mid-Term Test). Student rows remain the same. No re-fetch — filter is client-side only. |           |
| 10.3.3 | Change back to **All Subjects**            | All 21 category columns render again. No re-fetch.                                                                                                        |           |

### 10.4 Row selection

| #      | What to Check                         | Expected Result                                                                                                                                        | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.4.1 | Click any student row                 | Row background changes to `bg-primary-100`. `aria-selected="true"` is set. The pinned student-name cell uses `bg-inherit` so the highlight propagates. |           |
| 10.4.2 | Click the same row again              | Selection toggles off.                                                                                                                                 |           |
| 10.4.3 | Click a different row                 | First row deselects; second row becomes selected.                                                                                                      |           |
| 10.4.4 | Change filter while a row is selected | `useEffect` clears `selectedStudentId`.                                                                                                                |           |

### 10.5 Context title

| #      | What to Check                              | Expected Result                                                                                                                                                            | Pass/Fail |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.5.1 | Above the matrix, context title line       | Format: **"This table displays results for {period} and {subjects}"**. Examples: "This table displays results for **S1** and **all subjects**" / "**S2** and **English**". |           |
| 10.5.2 | Title is included in Excel and PDF exports | Row 0 in Excel merged across all columns. First heading in PDF.                                                                                                            |           |

---

## 11. Results Tab — All Periods Pooled View

| #    | What to Check                             | Expected Result                                                                                                                                                                      | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 11.1 | Select Period = **All Periods**           | Re-fetch: GET `/api/v1/gradebook/classes/{classId}/results-matrix` (no period param).                                                                                                |           |
| 11.2 | Per-period pooling                        | Backend pools per (subject, category, period) first: `Σ raw_score / Σ max_score × 100`.                                                                                              |           |
| 11.3 | Cross-period weighting                    | Each period's pooled percentage is weighted by class-level period weights → year-group-level period weights → equal-weight fallback.                                                 |           |
| 11.4 | Renormalisation on missing data           | If a student has no data in a period, that period is dropped from THAT student's weighted combination and the remaining period weights renormalise. (Backend handles this per-cell.) |           |
| 11.5 | Matrix rendering                          | Same column structure as single-period view (21 category columns for 2A / All Subjects). Cell values reflect the cross-period aggregate.                                             |           |
| 11.6 | Stats bar still shows filled/total counts | For NHQS 2A / All Periods / All Subjects / filled grades: ~525/525 cells filled.                                                                                                     |           |

---

## 12. Results Tab — Excel and PDF Export as Admin

| #    | What to Check                      | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | **Export** button location         | In the Results tab header area. Button labelled **"Export"** with a Download icon.                                                                                                                |           |
| 12.2 | Click Export                       | Popover/menu with two options: **"Export to Excel"** and **"Export to PDF"**.                                                                                                                     |           |
| 12.3 | Export to Excel                    | `.xlsx` downloads via `file-saver`. File name pattern matches the teacher variant (e.g. `results-matrix-{classId}-{period}.xlsx`).                                                                |           |
| 12.4 | Excel file structure               | Row 0: context title merged across all columns. Row 1: subject header group. Row 2: category header columns. Rows 3+: one row per student, each cell with the pooled percentage or blank/em-dash. |           |
| 12.5 | Notice banner NOT included         | The "Note:" info banner on-screen is strictly on-screen and does NOT appear in either export.                                                                                                     |           |
| 12.6 | Export to PDF                      | `.pdf` downloads via jsPDF + jspdf-autotable. Landscape orientation. First line: context title. Then autoTable with matrix contents.                                                              |           |
| 12.7 | Export with Subject filter applied | Both Excel and PDF include only the filtered columns.                                                                                                                                             |           |
| 12.8 | Export when matrix has no data     | Both files still download with headers and student names intact; all cells show em-dashes.                                                                                                        |           |

---

## 13. Grades Tab — Admin Filters and Views

### 13.1 Filter controls

| #      | What to Check               | Expected Result                                                                                                                                                        | Pass/Fail |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1.1 | Click the **Grades** tab    | Active tab changes; Assessments/Results unmount; Grades controls render.                                                                                               |           |
| 13.1.2 | Two Select dropdowns render | **Subject** (default "All Subjects") and **Period** (default "All Periods").                                                                                           |           |
| 13.1.3 | Initial empty state         | Paragraph: **"Select a subject and period to view grades."**                                                                                                           |           |
| 13.1.4 | **Compute Grades** button   | Primary button in header actions, visible ONLY when Subject ≠ "all" AND Period ≠ "all". Hidden in matrix-view combinations. Admin has this permission unconditionally. |           |

### 13.2 Matrix-view display toggle

| #      | What to Check                     | Expected Result                                                                                          | Pass/Fail |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 13.2.1 | Set Subject = all OR Period = all | A small display-toggle widget appears with two buttons: **"A B C"** and **"%"**. Default is **"A B C"**. |           |
| 13.2.2 | Click **%**                       | Toggle button becomes active. Matrix cells show percentages (e.g. "85%").                                |           |
| 13.2.3 | Click **A B C**                   | Switches back. Cells display letter grades where available.                                              |           |

---

## 14. Grades Tab — Compute Grades as Admin

### 14.1 Flat view (specific subject + specific period)

| #      | What to Check                                            | Expected Result                                                                                                                                 | Pass/Fail |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1.1 | Subject = **English**, Period = **S1**                   | A DataTable renders. Columns: **Student**, **Computed**, **Override**, **Final**, **Actions**.                                                  |           |
| 14.1.2 | Rows                                                     | One per student with a period grade. Students with no grade data are omitted.                                                                   |           |
| 14.1.3 | Cells                                                    | Computed: `{score} ({letter})` or em-dash. Override: manual override value or em-dash. Final: `override ?? computed`, bolded.                   |           |
| 14.1.4 | **Compute Grades** button — click                        | POST `/api/v1/gradebook/period-grades/compute` with `{class_id, subject_id, academic_period_id}`. Toast **"Grades computed"**. Table refetches. |           |
| 14.1.5 | Admin-specific: can compute for ANY subject in the class | Admin holds `gradebook.manage`. No ownership gate. A teacher would only be able to compute for subjects they own; admin has no restriction.     |           |
| 14.1.6 | Negative: Compute Grades while in matrix view            | A toast error reads **"Select a specific subject and period to compute grades"**. No API call.                                                  |           |

---

## 15. Grades Tab — Override Dialog as Admin

### 15.1 Dialog structure

| #      | What to Check                             | Expected Result                                                                                                                                                                              | Pass/Fail |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1.1 | Each row has an **Override** ghost button | Pencil icon + label "Override".                                                                                                                                                              |           |
| 15.1.2 | Click Override on a student               | Override dialog opens. Title **"Override"**. "Student: {name}" at the top. Two inputs: **Score** (numeric) and **Letter Grade** (text). Save / Cancel buttons.                               |           |
| 15.1.3 | Save with a new score (e.g. 55)           | POST `/api/v1/gradebook/period-grades/{id}/override` with `{overridden_value: "55", override_reason: "Manual override"}`. Dialog closes. Table refetches. Override and Final columns update. |           |
| 15.1.4 | Save with a letter grade (e.g. `B-`)      | Same endpoint, `overridden_value: "B-"`. Letter appears in Override and Final columns.                                                                                                       |           |
| 15.1.5 | Cancel                                    | No API call. Table unchanged.                                                                                                                                                                |           |

### 15.2 Admin-specific: override any student in any subject

| #      | What to Check                                                              | Expected Result                                                                                                                    | Pass/Fail |
| ------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.2.1 | Override a grade in Biology (a subject admin doesn't teach)                | Opens the dialog same as for English. Save succeeds. The override is audited as coming from the admin user, not a subject teacher. |           |
| 15.2.2 | Override a grade in a subject with no teaching allocation (Economics case) | Works identically. Admin is not gated by allocation presence.                                                                      |           |

---

## 16. Grade Entry Page — Admin Read and Moderate

**URL:** `/en/gradebook/{classId}/assessments/{assessmentId}/grades`

### 16.1 Page layout

| #      | What to Check        | Expected Result                                                                                    | Pass/Fail |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 16.1.1 | Back button          | ArrowLeft ghost button. Returns to `/en/gradebook/{classId}`.                                      |           |
| 16.1.2 | Page heading         | **"Grade Entry"**.                                                                                 |           |
| 16.1.3 | Assessment info card | Shows title, status badge (computed display), category, max score, due date, and grading deadline. |           |

### 16.2 Student grade grid

| #      | What to Check                                    | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.2.1 | Counter text                                     | **"{graded} of {total} students graded"**.                                                                                                                   |           |
| 16.2.2 | Columns                                          | **Student**, **Score**, **Missing**, **Comment**.                                                                                                            |           |
| 16.2.3 | Row source                                       | `/api/v1/classes/{classId}/enrolments?pageSize=100` filtered to `status === 'active'`. Same as teacher view.                                                 |           |
| 16.2.4 | Admin input state on OPEN / REOPENED assessments | Admin inputs ARE enabled (same as teacher) because the backend gates `enter_grades` via `gradebook.enter_grades` permission which admin holds.               |           |
| 16.2.5 | Admin input state on LOCKED statuses             | For `draft`, `submitted_locked`, `unlock_requested`, `locked`, `final_locked`: inputs are disabled just like for teachers. The locked-state banner is shown. |           |

### 16.3 Grading window banners

| #      | Condition                                                           | Banner                                                                                                                                                                  | Pass/Fail |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------- | --- |
| 16.3.1 | open, today < due_date                                              | Info banner: **"Grading not yet open"** + due date.                                                                                                                     |           |
| 16.3.2 | open, today > grading_deadline                                      | Danger banner: **"Grading deadline passed"**.                                                                                                                           |           |
| 16.3.3 | open, in window                                                     | Warning banner with a submit reminder.                                                                                                                                  |           |
| 16.3.4 | reopened                                                            | Info banner: "reopened" message with Lock icon.                                                                                                                         |           |
| 16.3.5 | submitted_locked / final_locked / draft with `canEnterGrades=false` | Warning banner with Lock icon and "locked" message. **Note:** the **Request Unlock** button IS shown for admin (because `canRequestUnlock = status === submitted_locked |           | final_locked`); see section 17. |     |

---

## 17. Grade Entry Page — Admin Actions Beyond Teacher Scope

This is the critical admin-vs-teacher divergence in the Grade Entry flow.

### 17.1 Request Unlock from admin

| #      | What to Check                                                               | Expected Result                                                                                                                                                                                                                                                                                                                                | Pass/Fail |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1.1 | On a submitted_locked assessment as admin, locate the Request Unlock button | The banner's right side still shows an outline **"Request Unlock"** button with a Lock icon. The button visibility is driven by the `canRequestUnlock` flag, not by role.                                                                                                                                                                      |           |
| 17.1.2 | Click Request Unlock                                                        | Dialog opens with title **"Request Unlock"** and a reason textarea.                                                                                                                                                                                                                                                                            |           |
| 17.1.3 | Submit with a reason                                                        | POST `/api/v1/gradebook/assessments/{id}/unlock-request` with `{reason}`. Admin-submitted requests appear in the Approval Queue as any other request. Admins can approve their own request via the dashboard InlineApprovalQueue or the /assessments/approvals page — a self-approval is technically possible given the current backend rules. |           |
| 17.1.4 | After approving (self-approval or another admin)                            | Assessment transitions to `reopened`, the grade inputs become enabled again, admin can update scores and resubmit via Submit Grades. This is the **admin moderation flow** for fixing a teacher's locked submission.                                                                                                                           |           |

### 17.2 Direct state transitions via the backend (out-of-scope from the UI)

| #      | What to Check                                                        | Expected Result                                                                                                                                                                                                                                      | Pass/Fail |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.2.1 | Admin can PATCH `/api/v1/gradebook/assessments/{id}/status` directly | Backend enforces `gradebook.enter_grades` which admin holds. Admin can set the status to any valid next state without going through the unlock-request flow. **This is a backend capability, not a UI button — the UI exposes Request Unlock only.** |           |

### 17.3 Final-lock behaviour

| #      | What to Check                                        | Expected Result                                                                                                                                                                                                              | Pass/Fail |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.3.1 | `final_locked` assessments are immutable from the UI | No edit controls. Even admin cannot re-open a final-locked assessment from the Grade Entry page. The only path is the backend PATCH, reserved for end-of-term corrections. This is an intentional guardrail on report cards. |           |

---

## 18. Cancelled Assessments in the Workspace (Cross-Ref)

The admin can see cancelled assessments by navigating to the **Subject Workspace** page (the per-allocation page documented in the teacher dashboard spec §9). Admins can reach this page via direct URL:

`/en/assessments/workspace/{classId}/{subjectId}`

| #    | What to Check                                                 | Expected Result                                                                                                                                                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Navigate to `/en/assessments/workspace/{classId}/{subjectId}` | The page loads with the admin's credentials. It was originally designed as a teacher surface but admin can reach it via URL. The setup status cards show the same state as for a teacher viewing the same allocation.                                                             |           |
| 18.2 | Recent Assessments table                                      | Includes cancelled rows with their `cancellation_reason` line. Admin can Reschedule cancelled rows the same way a teacher can.                                                                                                                                                    |           |
| 18.3 | Admin workflow caveat                                         | Because the admin has no `staff_profile`, some teacher-only page features (e.g. "my config status" panel) may be hidden or empty. For cancelled-assessment management, admins should prefer the gradebook class workspace (Assessments tab) where the same actions are available. |           |

---

## 19. Admin Side — Console of Failed API Calls to Teacher-Scoped Endpoints

This section guards against regressions where teacher-scoped endpoints accidentally get called as admin and break the page.

| #    | What to Check                                             | Expected Result                                                                                                                                                                                                                                                                                    | Pass/Fail |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Open DevTools Network tab. Load `/en/gradebook/{classId}` | You will see `GET /api/v1/gradebook/teaching-allocations` → **404 STAFF_PROFILE_NOT_FOUND**. This is the class page's `my-allocations` fetch wrapped in `Promise.allSettled`. It is **expected**, not a bug. The page continues to load.                                                           |           |
| 19.2 | Verify no red toast appears                               | The 404 is silent (no global toast) because the class page's fetch uses `Promise.allSettled`, so the error is caught locally. If a red toast saying **"No staff profile found…"** appears, that would be a regression — report it.                                                                 |           |
| 19.3 | Other expected API calls                                  | `GET /api/v1/gradebook/classes/{id}/allocations` → 200. `GET /api/v1/gradebook/assessments?class_id={id}` → 200. `GET /api/v1/gradebook/classes/{id}/results-matrix?...` (on Results tab) → 200. `GET /api/v1/gradebook/period-grades/...` (on Grades tab) → 200.                                  |           |
| 19.4 | Cleanup path                                              | To eliminate the cosmetic 404 entirely, a future iteration could add `silent: true` to the class page's teaching-allocations call, OR add a role check to skip the fetch when `ADMIN_ROLES.some(...)`. Both are trivial fixes but neither is blocking; flag this as a follow-up rather than a bug. |           |

---

## 20. Arabic / RTL

| #    | What to Check                                 | Expected Result                                                                                                                    | Pass/Fail |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Toggle to Arabic. Navigate to `/ar/gradebook` | Class listing flips to RTL. Year group headers show the GraduationCap icon on the right; cards flow right-to-left.                 |           |
| 20.2 | Open a class gradebook in Arabic              | Tab bar flows right-to-left. "Assessments" / "Results" / "Grades" labels translated. Back arrow rotates (`rtl:rotate-180`).        |           |
| 20.3 | Grouped-view subject header                   | Chevron icon flips sides. Teacher names list with Arabic rendering where applicable.                                               |           |
| 20.4 | Results tab in Arabic                         | Matrix remains LTR inside; numbers, subject names, category names all LTR. Notice banner text is translated; Info icon flips side. |           |
| 20.5 | Grades tab filters                            | Select placeholders translated ("Subject" → "المادة", "Period" → "الفترة"). Display toggle buttons "A B C" / "%" still render LTR. |           |
| 20.6 | Grade Entry page in Arabic                    | All labels translated. Score input retains `dir="ltr"` so numbers display correctly. Counter text localised.                       |           |
| 20.7 | Request Unlock dialog in Arabic               | Title, description, placeholder, Submit and Cancel buttons render in Arabic without fallback key leakage.                          |           |
| 20.8 | Toggle back to English                        | Layout flips back. All state preserved.                                                                                            |           |

---

## End of Spec

Once all rows above show Pass, the admin's Gradebook listing, Class Gradebook workspace (Assessments / Results / Grades tabs), Grade Entry page, and the admin-specific behaviours (no auto-collapse, no dim treatment, cross-subject access, moderation via unlock requests) are verified.
