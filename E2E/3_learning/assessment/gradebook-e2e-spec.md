# E2E Test Specification: Assessment — Gradebook (Teacher View + Admin Approval)

> **Coverage:** This document covers **4 pages + 1 admin sub-flow** within the Gradebook section:
>
> - Gradebook Listing (`/en/gradebook`) — class cards grouped by year group
> - Class Gradebook Workspace (`/en/gradebook/{classId}`) — Assessments / Results / Grades tabs
> - Grade Entry (`/en/gradebook/{classId}/assessments/{assessmentId}/grades`) — per-assessment student grade grid
> - New Assessment (`/en/gradebook/{classId}/assessments/new`) — alternative entry point
> - **Admin approval** side (`/en/assessments/approvals`) — Unlock Requests tab (requires logging out as Sarah Daly and logging in as an administrator)
>
> **School Pages Covered So Far:** 22 / 322

**Base URL:** `https://nhqs.edupod.app`
**Teacher prerequisite:** Logged in as **Sarah Daly** (`sarah.daly@nhqs.test`), Teacher role.
**Admin prerequisite:** For section 14 (admin side), you will log out and sign in as an **Administrator** or **School Owner** account with permission `gradebook.unlock_requests.review`.
**Navigation path:** Learning → Assessment → **Gradebook** (second sub-strip item).

---

## Table of Contents

1. [Navigating to the Gradebook Listing](#1-navigating-to-the-gradebook-listing)
2. [Gradebook Listing — Page Load](#2-gradebook-listing--page-load)
3. [Gradebook Listing — Year-Group Sections and Class Cards](#3-gradebook-listing--year-group-sections-and-class-cards)
4. [Class Gradebook — Page Load and Layout](#4-class-gradebook--page-load-and-layout)
5. [Assessments Tab — Subject Filter and Grouped View](#5-assessments-tab--subject-filter-and-grouped-view)
6. [Assessments Tab — Flat (Single-Subject) View](#6-assessments-tab--flat-single-subject-view)
7. [Assessments Tab — New Assessment Button and From-Template Popover](#7-assessments-tab--new-assessment-button-and-from-template-popover)
8. [Grade Entry Page — Layout and Grading Window](#8-grade-entry-page--layout-and-grading-window)
9. [Grade Entry Page — Entering and Submitting Grades](#9-grade-entry-page--entering-and-submitting-grades)
10. [Grade Entry Page — Locked State and Request Unlock](#10-grade-entry-page--locked-state-and-request-unlock)
11. [Admin Side — Approving the Unlock Request](#11-admin-side--approving-the-unlock-request)
12. [Back as Sarah — Re-Entering Grades after Unlock](#12-back-as-sarah--re-entering-grades-after-unlock)
13. [Results Tab — Matrix Layout](#13-results-tab--matrix-layout)
14. [Results Tab — Filters, Notice Banner, Context Title, Selection](#14-results-tab--filters-notice-banner-context-title-selection)
15. [Results Tab — Excel and PDF Export](#15-results-tab--excel-and-pdf-export)
16. [Grades Tab — Filters and Views](#16-grades-tab--filters-and-views)
17. [Grades Tab — Compute Grades and Override Dialog](#17-grades-tab--compute-grades-and-override-dialog)
18. [Grades Tab — Matrix Views (Cross-Subject / Cross-Period / Year Overview)](#18-grades-tab--matrix-views-cross-subject--cross-period--year-overview)
19. [Arabic / RTL](#19-arabic--rtl)

---

## 1. Navigating to the Gradebook Listing

| #   | What to Check                                                                                   | Expected Result                                                  | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 1.1 | From the Assessment Dashboard, click **Gradebook** in the Assessment sub-strip                  | URL becomes `/en/gradebook`. The "Gradebook" link is now active. |           |
| 1.2 | Verify the Assessment sub-strip (**Dashboard / Gradebook / Report Cards / Analytics**) persists | All four links are still visible below the Learning sub-strip.   |           |

---

## 2. Gradebook Listing — Page Load

**URL:** `/en/gradebook`

| #   | What to Check                     | Expected Result                                                                                                                                                                         | Pass/Fail |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Page heading                      | An `<h1>` reads **"Gradebook"**.                                                                                                                                                        |           |
| 2.2 | Loading state                     | For the first ~500ms, you see two skeleton row blocks; each contains a skeleton section heading followed by a grid of skeleton cards.                                                   |           |
| 2.3 | After load, the page is populated | Year group sections appear (see section 3). If the tenant has zero gradebook-eligible classes, an EmptyState card appears with a BookOpen icon and the text from `gradebook.noClasses`. |           |
| 2.4 | Browser console                   | No red errors related to `/api/v1/year-groups`, `/api/v1/classes`, or `/api/v1/gradebook/assessments`.                                                                                  |           |

---

## 3. Gradebook Listing — Year-Group Sections and Class Cards

| #    | What to Check                                                       | Expected Result                                                                                                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Sections are grouped by year group                                  | Each section has its own heading block with a small GraduationCap icon in a circle, the **year group name** (e.g. "2nd class"), and a line showing the count — e.g. "2 classes" / "1 class".                                                       |           |
| 3.2  | Section ordering                                                    | Sections are sorted by `display_order` of the year group ascending (Kindergarten → 1st class → 2nd class → ... → Senior infants → Junior infants → ... depending on the tenant's configured order). Unassigned year groups sort last.              |           |
| 3.3  | A thin border line trails each section header out to the right edge | Visual separator between header and class cards.                                                                                                                                                                                                   |           |
| 3.4  | Within a section, classes are shown as cards in a responsive grid   | 1 column on mobile, 2 on `sm:`, 3 on `lg:`, 4 on `xl:`.                                                                                                                                                                                            |           |
| 3.5  | Card layout                                                         | Each card is a rounded 2xl button with border. A decorative gradient strip runs across the top. Inside: class name (large, bold), BookOpen icon on the right, then a large number (assessment count) with the label "assessment" or "assessments". |           |
| 3.6  | Card order within a section                                         | Sorted alphabetically by class name (e.g. 2A before 2B).                                                                                                                                                                                           |           |
| 3.7  | Only classes with at least 1 assessment appear                      | Classes with zero assessments are filtered out. If Sarah Daly only has English allocations in a class with no assessments, that class does not appear.                                                                                             |           |
| 3.8  | Click the **2A** card                                               | Navigates to `/en/gradebook/76ce55f7-d722-4927-8038-fa304c9c4e05` (or whatever the 2A class id is). Browser URL contains the class UUID.                                                                                                           |           |
| 3.9  | Keyboard: Tab to a card and press Enter                             | Focus outline is visible (2px primary ring). Enter triggers the same navigation.                                                                                                                                                                   |           |
| 3.10 | Hover state                                                         | On hover: border becomes primary-300, box-shadow deepens (hover:shadow-md), BookOpen icon shifts to primary-600.                                                                                                                                   |           |

---

## 4. Class Gradebook — Page Load and Layout

**URL:** `/en/gradebook/{classId}`

### 4.1 Header row

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Back button on the far left                          | A ghost button containing an **ArrowLeft** icon. Clicking it returns to `/en/gradebook` (the listing page).                                                                                                         |           |
| 4.1.2 | Page heading                                         | Reads **"Gradebook"** (not the class name — the class name is implicit from the URL).                                                                                                                               |           |
| 4.1.3 | Right-side actions (visible only on Assessments tab) | **New Assessment** primary button with a `+` icon. If any **Assessment Templates** exist (`/api/v1/gradebook/assessment-templates`), an outline **"From Template"** button appears to the left of "New Assessment". |           |

### 4.2 Tab bar

| #     | What to Check                                         | Expected Result                                                                                                                        | Pass/Fail |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Three tab buttons                                     | **Assessments**, **Results**, **Grades**. First tab is active by default (primary-coloured text, active bottom border in primary-700). |           |
| 4.2.2 | Tabs are navigable via keyboard                       | Tab into the nav, use Enter or click to switch. ARIA `aria-current="page"` on the active tab.                                          |           |
| 4.2.3 | Tabs overflow-scroll horizontally on narrow viewports | On mobile (<640px), the nav element is scrollable horizontally to accommodate long tab labels.                                         |           |

---

## 5. Assessments Tab — Subject Filter and Grouped View

| #    | What to Check                                                      | Expected Result                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Subject filter dropdown                                            | A Select with placeholder "Subject". Default value is **All Subjects**. Dropdown options: "All Subjects" followed by one option per subject taught in the class (sorted alphabetically).                                                                                                        |           |
| 5.2  | With filter = **All Subjects** and the class has multiple subjects | The table is rendered in **grouped-by-subject** mode.                                                                                                                                                                                                                                           |           |
| 5.3  | Grouped-view section header                                        | A row with `colspan=6` containing: subject name (bold), an em-dash, all teacher names for that subject (sorted alphabetically), and the assessment count in parentheses. For 2A / English it reads: **English — Chloe Kennedy, Sarah Daly, William Dunne (8)**.                                 |           |
| 5.4  | Chevron indicator on section header                                | Right side of the section header shows ChevronDown when expanded, ChevronRight when collapsed. (`rtl:rotate-180` for RTL.)                                                                                                                                                                      |           |
| 5.5  | Click a section header                                             | Toggles the section collapse state. Assessment rows inside the group hide/show.                                                                                                                                                                                                                 |           |
| 5.6  | **Auto-collapse non-owned subjects**                               | On first load, subjects Sarah Daly does NOT teach are collapsed by default. Subjects she teaches (e.g. English) stay expanded. The collapse state is set once (via `collapsedInitialised` ref) and not re-applied after manual toggles.                                                         |           |
| 5.7  | Non-owned subject rows are visually dimmed                         | Each row inside a non-owned section (if expanded) has `opacity-50` and the row is NOT clickable (no hover highlight, no Grade Entry button rendered in the Actions column).                                                                                                                     |           |
| 5.8  | Owned subject rows                                                 | Normal opacity, hover background `bg-surface-secondary`, cursor pointer. Clicking anywhere on the row navigates to the Grade Entry page.                                                                                                                                                        |           |
| 5.9  | Actions column on owned rows                                       | A ghost Button labelled **"Grade Entry"** with a stopPropagation click handler so clicking the button triggers navigation without also triggering the row-click handler.                                                                                                                        |           |
| 5.10 | Assessment row status column                                       | Computed display: if backend status = `open`, show `Scheduled` (info) / `Pending Grading` (warning) / `Overdue` (danger) based on today vs due_date and grading_deadline. Otherwise show the mapped label: Draft / Cancelled / Submitted / Unlock Requested / Reopened / Final Locked / Locked. |           |

---

## 6. Assessments Tab — Flat (Single-Subject) View

| #   | What to Check                                                              | Expected Result                                                                                                                                                                                   | Pass/Fail |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Change the Subject filter to **English** (a subject Sarah owns)            | Grouping disappears. Rows are shown in a flat DataTable with columns: **Title**, **Status**, **Category**, **Max Score**, **Due Date**, **Actions**.                                              |           |
| 6.2 | Pagination                                                                 | Bottom of the table shows pagination controls. Page size is **20** in flat view. Change page and verify the row set updates.                                                                      |           |
| 6.3 | Clicking a row (or its Grade Entry button)                                 | Navigates to `/en/gradebook/{classId}/assessments/{assessmentId}/grades`.                                                                                                                         |           |
| 6.4 | Change the Subject filter to a subject Sarah does NOT teach (e.g. Biology) | The rows are shown with `opacity-50`. Clicking rows does NOT navigate. The Grade Entry button is NOT rendered in the Actions column.                                                              |           |
| 6.5 | Cancelled assessments are excluded                                         | The request sets `exclude_cancelled=true`. No rows with status `closed` appear in either grouped or flat view. (To see cancelled rows, use the Subject Workspace page — see dashboard spec §9.3.) |           |

---

## 7. Assessments Tab — New Assessment Button and From-Template Popover

| #   | What to Check                                                               | Expected Result                                                                                                                                                                                                                                                  | Pass/Fail |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Click the **New Assessment** primary button in the header                   | Navigates to `/en/gradebook/{classId}/assessments/new` (no `subject_id` query param when reached from this button). Form behaves identically to the Workspace → New Assessment flow (see dashboard spec §10) except that the Subject field is an open selector.  |           |
| 7.2 | If assessment templates exist: click the outline **"From Template"** button | A Popover opens. Header small text reads **"Assessment Templates"**. Below is a list of template buttons, each showing template name (bold) and "/ {max_score}" in small grey text.                                                                              |           |
| 7.3 | Click a template in the popover                                             | Popover closes. Browser navigates to `/en/gradebook/{classId}/assessments/new?template_id={templateId}`. The New Assessment form pre-fills: Title = template name, Category = template category, Max Score = template max_score, Counts Toward = template value. |           |
| 7.4 | If no templates exist                                                       | The "From Template" button is NOT rendered.                                                                                                                                                                                                                      |           |

---

## 8. Grade Entry Page — Layout and Grading Window

**URL:** `/en/gradebook/{classId}/assessments/{assessmentId}/grades`

### 8.1 Header

| #     | What to Check | Expected Result                                                                                       | Pass/Fail |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Back button   | ArrowLeft ghost button. Clicking it returns to `/en/gradebook/{classId}` (class gradebook workspace). |           |
| 8.1.2 | Page heading  | Reads **"Grade Entry"**.                                                                              |           |

### 8.2 Assessment info card

Below the header, a rounded card with the assessment's metadata.

| #     | What to Check              | Expected Result                                                                                                                                                                            | Pass/Fail |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.2.1 | Title on the left          | The assessment's title as a `<h2>`.                                                                                                                                                        |           |
| 8.2.2 | Status badge next to title | Computed: for `open`, shows Scheduled / Pending Grading / Overdue; for other statuses, the standard label (Draft, Cancelled, Submitted, Unlock Requested, Reopened, Final Locked, Locked). |           |
| 8.2.3 | Second row of metadata     | Inline text: **"Category: {category_name}"**, **"Max Score: {max_score}"** (LTR), **"Due Date: DD/MM/YYYY"**, **"Grading Deadline: DD/MM/YYYY"** (if set).                                 |           |

### 8.3 Grading window banners (exactly one is shown when appropriate)

| #     | Condition                                                                                                 | Banner                                                                                                                                                                                                                 | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.3.1 | Status = `open`, today < due_date                                                                         | Info banner with **CalendarClock** icon and text **"Grading not yet open"** followed by the due date.                                                                                                                  |           |
| 8.3.2 | Status = `open`, today > grading_deadline                                                                 | Danger banner with **Clock** icon and text **"Grading deadline passed"**.                                                                                                                                              |           |
| 8.3.3 | Status = `open`, today in window (or no dates set)                                                        | Warning banner with **ShieldAlert** icon and a warning message (submit warning).                                                                                                                                       |           |
| 8.3.4 | Status = `reopened`                                                                                       | Info banner with **Lock** icon and the "reopened banner" text (reminding the teacher they have a fresh edit window).                                                                                                   |           |
| 8.3.5 | Status = any locked status (`submitted_locked`, `final_locked`, `draft`, etc.) and `canEnterGrades=false` | Warning banner with Lock icon and the localised "locked" message. On the right side, if `canRequestUnlock=true` (i.e. status is `submitted_locked` or `final_locked`), a **"Request Unlock"** outline button is shown. |           |

### 8.4 Student grade grid

| #     | What to Check                                       | Expected Result                                                                                                                                                                 | Pass/Fail |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.4.1 | Above the grid: **students graded counter**         | Text reads **"{gradedCount} of {totalCount} students graded"** (e.g. "0 of 25 students graded" when nothing is filled in).                                                      |           |
| 8.4.2 | Column headers                                      | **Student**, **Score**, **Missing**, **Comment**.                                                                                                                               |           |
| 8.4.3 | One row per active enrolled student                 | Rows are fetched from `/api/v1/classes/{classId}/enrolments?pageSize=100` filtered to `status === 'active'`. Graded students not in the enrolment list also appear (edge case). |           |
| 8.4.4 | Score input                                         | Numeric spinbutton, `min=0`, `max={assessment.max_score}`, LTR. Empty inputs display the placeholder `—`. Values outside range are clamped: < 0 → 0; > max → max.               |           |
| 8.4.5 | Missing checkbox                                    | Radix Checkbox. Checking it auto-clears the Score field and sets `is_missing=true`.                                                                                             |           |
| 8.4.6 | Comment textarea                                    | Single-row textarea, autoGrows, non-resizable.                                                                                                                                  |           |
| 8.4.7 | **All inputs disabled when `canEnterGrades=false`** | For Draft / Cancelled / Submitted / Locked / Final-Locked / Unlock Requested statuses. Also disabled inside individual Score cells when `is_missing=true`.                      |           |

---

## 9. Grade Entry Page — Entering and Submitting Grades

**Setup:** To test this flow, Sarah Daly must have access to an assessment in either `open` (in-window) or `reopened` status. If all existing English assessments are `submitted_locked`, create a new one via section 7.1, then you will need an admin to transition it to `open`. For this spec, assume an `open` assessment is available.

| #    | What to Check                                                                   | Expected Result                                                                                                                                                                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Open an assessment whose status is `open` and grading window = `in_window`      | The Score / Missing / Comment inputs are ENABLED (not disabled).                                                                                                                                                                                                                                  |           |
| 9.2  | Type a score into the first Score input (e.g. **75**)                           | Value is written to the grid state; the "students graded" counter increments by 1.                                                                                                                                                                                                                |           |
| 9.3  | Press **Tab** in the first Score input                                          | Focus moves to the SECOND Score input, NOT to the Missing checkbox. (The page implements custom Tab-handling via `handleScoreKeyDown` so teachers can type numbers quickly.)                                                                                                                      |           |
| 9.4  | Type a score > max (e.g. max is 100, type 150)                                  | Value is clamped to 100 on blur.                                                                                                                                                                                                                                                                  |           |
| 9.5  | Type a negative score (e.g. -5)                                                 | Value is clamped to 0.                                                                                                                                                                                                                                                                            |           |
| 9.6  | Tick the Missing checkbox on a row                                              | The Score input in the same row becomes disabled and clears to empty. `is_missing=true` is stored.                                                                                                                                                                                                |           |
| 9.7  | Un-tick Missing                                                                 | The Score input re-enables. The score value remains empty (cleared when checkbox was ticked).                                                                                                                                                                                                     |           |
| 9.8  | Enter a comment in the Comment textarea                                         | Text is persisted in the grid state.                                                                                                                                                                                                                                                              |           |
| 9.9  | Fill in at least one Score and click the **Submit Grades** button at the bottom | A confirmation dialog opens with title (localised from `gradebook.submitGradesTitle`) and a warning description reminding the user that submission locks the assessment.                                                                                                                          |           |
| 9.10 | Click **Cancel** in the dialog                                                  | Dialog closes; no save happens. You remain on the Grade Entry page.                                                                                                                                                                                                                               |           |
| 9.11 | Click **Submit Grades** → click confirm in the dialog                           | Two sequential API calls happen: (1) **PUT** `/api/v1/gradebook/assessments/{id}/grades` with a `grades: [{student_id, raw_score, is_missing, comment}]` body. (2) **PATCH** `/api/v1/gradebook/assessments/{id}/status` with body `{status: "submitted_locked"}`. On success: toast "Submitted". |           |
| 9.12 | After success, the page refetches                                               | The status badge in the assessment info card changes to **Submitted** (success variant). All score/missing/comment inputs become disabled. The yellow "locked" banner with a **Request Unlock** button appears at the top of the grid.                                                            |           |
| 9.13 | Partial save edge case                                                          | If step 9.11's PUT succeeds but the subsequent status PATCH fails, a toast error `submitLockFailed` is shown. The data refetches so the teacher can see that grades WERE saved, just that the auto-lock didn't complete.                                                                          |           |

---

## 10. Grade Entry Page — Locked State and Request Unlock

**Setup:** At this point, the test assessment is in `submitted_locked` state. All inputs are disabled.

| #    | What to Check                                                                     | Expected Result                                                                                                                                                                    | Pass/Fail |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Verify the locked banner                                                          | Warning-variant banner with **Lock** icon and the "locked" message. On the right, an outline **"Request Unlock"** button with its own Lock icon.                                   |           |
| 10.2 | Click **Request Unlock**                                                          | A modal dialog opens with title **"Request Unlock"** and description asking for a reason.                                                                                          |           |
| 10.3 | Reason textarea (4 rows)                                                          | Placeholder text from `teacherAssessments.unlockReasonPlaceholder`. Empty by default.                                                                                              |           |
| 10.4 | Confirm button (Submit)                                                           | Primary button with text "Submit" (common translation). DISABLED while the textarea is empty.                                                                                      |           |
| 10.5 | Type a reason: **`Need to correct score for Karen Carroll — typo from E2E test`** | Confirm button becomes ENABLED.                                                                                                                                                    |           |
| 10.6 | Click **Submit**                                                                  | HTTP POST to `/api/v1/gradebook/assessments/{id}/unlock-request` with body `{reason: "..."}`. On success: toast "Unlock request sent" (or similar), dialog closes, data refetches. |           |
| 10.7 | After submit, the status badge updates                                            | Badge now reads **"Unlock Requested"** (warning variant). Inputs remain disabled. The Request Unlock button is hidden (you cannot request again while a request is pending).       |           |
| 10.8 | Cancel path                                                                       | Clicking **Cancel** in the dialog closes it and clears the reason textarea. No API call.                                                                                           |           |
| 10.9 | Error path                                                                        | If the API returns 409 (request already exists) or 500, a toast error is shown and the dialog remains open.                                                                        |           |

---

## 11. Admin Side — Approving the Unlock Request

**IMPORTANT:** To test this section you must log out as Sarah Daly and log in as an administrator.

| #     | What to Check                                                                             | Expected Result                                                                                                                                                                                                                                                                               | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Click the user profile button (top-right) → click **Log out**                             | You are redirected to the login page. Any in-memory auth state is cleared.                                                                                                                                                                                                                    |           |
| 11.2  | Log back in as a School Owner / Administrator account (e.g. `owner@nhqs.test`)            | You land on `/en/dashboard` (not the teacher variant). The morph bar shows additional hubs: Finance, Regulatory, Settings.                                                                                                                                                                    |           |
| 11.3  | Navigate to **Learning → Assessment**                                                     | URL: `/en/assessments`. The page looks different for admins (the allocations section shows an approval queue instead of personal allocations).                                                                                                                                                |           |
| 11.4  | Find the **Approval Queue** section (or navigate directly to `/en/assessments/approvals`) | Page heading **"Approval Queue"** with a two-tab layout: **Config Approvals** and **Unlock Requests**. Each tab label includes a count badge (yellow pill) if there are pending items.                                                                                                        |           |
| 11.5  | Click the **Unlock Requests** tab                                                         | The tab becomes active. The content area shows either the empty state (**"No pending unlock requests"**) or a table of pending requests.                                                                                                                                                      |           |
| 11.6  | Locate the row for Sarah Daly's submitted request                                         | Columns: **Assessment Title**, **Class**, **Subject**, **Requested By**, **Reason**, **Actions**. Verify the reason you typed in step 10.5 appears in the Reason column (may be truncated with ellipsis on desktop; fully visible on mobile card layout).                                     |           |
| 11.7  | Actions column                                                                            | Two icon buttons: a green **Check** icon (approve) and a red **X** icon (reject). Both are tooltips ("Approve" / "Reject").                                                                                                                                                                   |           |
| 11.8  | Click the **Approve** (Check) icon                                                        | HTTP POST to `/api/v1/gradebook/unlock-requests/{id}/review` with body `{status: "approved"}`. On success: toast "Approved" (or similar); the row disappears from the list; the unread count badge on the tab decreases by 1.                                                                 |           |
| 11.9  | Reject path (run this as a separate test on a new unlock request)                         | Click the **X** icon → a Reject dialog opens with a reason textarea. The confirm button (destructive variant) is disabled until a reason is typed. On submit: POST `/api/v1/gradebook/unlock-requests/{id}/review` with `{status: "rejected", reason}`. Toast "Rejected". Row disappears.     |           |
| 11.10 | Config Approvals tab                                                                      | Click the **Config Approvals** tab. Content shows a table of pending Category or Weight config submissions from teachers. Columns: **Item Name**, **Type** (Category / Weight badge), **Teacher**, **Actions** (Approve/Reject icons). This tab is for config approvals, NOT unlock requests. |           |
| 11.11 | Mobile card view                                                                          | Shrink to 375px width. Each unlock request becomes a stacked card showing title, class/subject, requested by, reason in a grey box, date, and a row of Reject + Approve buttons at the bottom.                                                                                                |           |
| 11.12 | Cleanup — log out of the admin account                                                    | User profile → Log out. Redirect to login.                                                                                                                                                                                                                                                    |           |
| 11.13 | Log back in as Sarah Daly                                                                 | Return to the teacher dashboard.                                                                                                                                                                                                                                                              |           |

---

## 12. Back as Sarah — Re-Entering Grades after Unlock

| #    | What to Check                                                        | Expected Result                                                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Navigate back to the same assessment's Grade Entry page              | URL: `/en/gradebook/{classId}/assessments/{assessmentId}/grades`. Status badge now reads **Reopened** (info variant).                                                                                                                                                                 |           |
| 12.2 | Verify the inputs are enabled again                                  | Score / Missing / Comment inputs are ALL re-enabled because `assessment.status === 'reopened'` sets `canEnterGrades=true`.                                                                                                                                                            |           |
| 12.3 | Verify the reopened banner                                           | Info-variant banner with Lock icon and the reopened message, telling the teacher they have an unlock window.                                                                                                                                                                          |           |
| 12.4 | Change a previously entered score (e.g. Karen Carroll from 75 to 82) | Value updates in the grid.                                                                                                                                                                                                                                                            |           |
| 12.5 | Click **Submit Grades** and confirm                                  | PUT grades + PATCH status to `submitted_locked`. Toast success. Status badge returns to **Submitted**. All inputs become disabled again.                                                                                                                                              |           |
| 12.6 | Reject path (alternative workflow)                                   | If the admin REJECTED the unlock request instead, the teacher's status badge stays **Unlock Requested** for a brief period until the backend transitions it back. After rejection, the badge returns to **Submitted** and the teacher can attempt a new request with a better reason. |           |

---

## 13. Results Tab — Matrix Layout

The Results tab uses the pooled-by-category matrix introduced in the recent Results refactor.

| #     | What to Check                   | Expected Result                                                                                                                                                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1  | Click the **Results** tab       | Active tab changes; the Assessments grid is unmounted and replaced with the ResultsMatrix component.                                                                                                                                                                                    |           |
| 13.2  | Initial state                   | A period dropdown appears (labelled "Period"). Below it: an empty-state paragraph reads **"Select a period to view the results matrix."** No table is rendered until a period is chosen.                                                                                                |           |
| 13.3  | Period dropdown options         | Listbox shows: **All Periods** (always first), then one option per academic period (e.g. **S1**, **S2**).                                                                                                                                                                               |           |
| 13.4  | Select **S1**                   | Matrix loads via `GET /api/v1/gradebook/classes/{classId}/results-matrix?academic_period_id={s1Id}`. A wide table appears with the students as rows and subject × category columns.                                                                                                     |           |
| 13.5  | Subject filter                  | A second Select appears next to the period dropdown with default value **All Subjects**. Choosing a specific subject filters the matrix to that subject only (fewer columns).                                                                                                           |           |
| 13.6  | Table header row 1 — subjects   | Each subject spans multiple category columns (e.g. English spans 3: End of Term Test, Homework, Mid-Term Test). For all-subjects × S1 view of 2A, expect 7 subjects: Biology, Chemistry, Economics, English, Geography, History, Mathematics.                                           |           |
| 13.7  | Table header row 2 — categories | One column per category per subject, totalling 21 category columns (7 × 3) in the S1 × All Subjects view.                                                                                                                                                                               |           |
| 13.8  | Sticky student name column      | The leftmost "Student" column is `sticky start-0` with an opaque background (solid bg, not transparent). When the matrix scrolls horizontally, the student name stays pinned and the scrolled category cells do NOT bleed through.                                                      |           |
| 13.9  | Student row count               | 25 rows for the 2A class (one per active enrolled student). Matches the count from `/api/v1/classes/{classId}/enrolments?status=active`.                                                                                                                                                |           |
| 13.10 | Cell format                     | Each cell contains either a percentage like `51.0%` (one decimal) or an em-dash `—` if no assessments contributed. Example: English / Homework cell for Karen Carroll reads `51.0%`.                                                                                                    |           |
| 13.11 | Pooling math (spot check)       | English / Mid-Term Test for a student with two assessments (44/100 and 65/100) should read `54.5%` — computed as `(44+65) / (100+100) × 100`.                                                                                                                                           |           |
| 13.12 | **All Periods** view            | Choose "All Periods" from the Period dropdown. The matrix is re-fetched via `GET /api/v1/gradebook/classes/{classId}/results-matrix` (no period param). Cells are weighted averages across periods using class-level or year-group-level period weights, with an equal-weight fallback. |           |

---

## 14. Results Tab — Filters, Notice Banner, Context Title, Selection

### 14.1 Notice banner (always visible)

| #      | What to Check                                             | Expected Result                                                                                                                                                                                                                                                                                | Pass/Fail |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1.1 | Above the matrix, a bordered info-coloured banner appears | Border uses `info-text/20`, background `info-fill`, text `info-text`. Contains an Info icon on the left.                                                                                                                                                                                       |           |
| 14.1.2 | Banner body text                                          | Starts with **"Note: "** (bold) and reads: "The scores shown here are raw inputs pooled by category. They aren't necessarily the numbers that drive a student's final grade — category weights, period weights and the grading scale decide that. See the Grades tab for the computed result." |           |
| 14.1.3 | The banner is ALWAYS visible                              | It never collapses, even after switching filters. It is part of the on-screen view only — NOT included in Excel or PDF exports.                                                                                                                                                                |           |

### 14.2 Context title

| #      | What to Check                                                        | Expected Result                                                                                                                                                                                                                                                                | Pass/Fail |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 14.2.1 | Above the matrix, a single-line title reads from a concat of filters | Format: **"This table displays results for {period} and {subjects}"**. Examples: "This table displays results for **S1** and **all subjects**" / "This table displays results for **all periods** and **English**" / "This table displays results for **S2** and **English**". |           |
| 14.2.2 | The context title is included in BOTH the Excel and PDF exports      | In Excel, it appears as a merged cell on row 0 above all the column headers. In PDF, it appears as the header line above the generated table.                                                                                                                                  |           |

### 14.3 Row selection (highlight)

| #      | What to Check                                                      | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.3.1 | Click on any student row (e.g. Karen Carroll)                      | The row background changes to `bg-primary-100`. The `aria-selected="true"` attribute is set on the `<tr>`. The sticky student-name cell uses `bg-inherit` so the highlight propagates to the pinned column as well.  |           |
| 14.3.2 | Click the same row again                                           | Selection toggles off; background returns to the normal zebra stripe or white.                                                                                                                                       |           |
| 14.3.3 | Click a different row                                              | First row deselects; second row becomes selected.                                                                                                                                                                    |           |
| 14.3.4 | Change any filter (class, period, subject) while a row is selected | The selection auto-clears (via `React.useEffect` on classId/periodId/subjectFilter).                                                                                                                                 |           |
| 14.3.5 | Horizontal scroll test                                             | With Karen Carroll's row selected, scroll horizontally to the right. The category cells scroll UNDER the sticky student column. Karen's first cell (the pinned name cell) stays highlighted. No text bleeds through. |           |

---

## 15. Results Tab — Excel and PDF Export

| #     | What to Check                                         | Expected Result                                                                                                                                                                                                        | Pass/Fail |
| ----- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | Locate the **Export** button                          | A button (or popover trigger) in the Results tab header area, labelled **"Export"** with a Download icon.                                                                                                              |           |
| 15.2  | Click **Export**                                      | A small popover/menu opens with two options: **"Export to Excel"** and **"Export to PDF"**.                                                                                                                            |           |
| 15.3  | Click **Export to Excel**                             | A `.xlsx` file downloads via `file-saver`. File name follows the pattern `results-matrix-{classId}-{period}.xlsx` (or similar). Open it in Excel/Numbers/LibreOffice.                                                  |           |
| 15.4  | Excel file structure                                  | Row 0: the context title merged across all columns (`This table displays results for ...`). Row 1: subject header group. Row 2: category column headers. Rows 3+: one row per student with their category percentages. |           |
| 15.5  | Excel file: notice banner is NOT included             | The "Note: The scores shown here..." banner does NOT appear anywhere in the spreadsheet. It is strictly on-screen.                                                                                                     |           |
| 15.6  | Click **Export to PDF**                               | A `.pdf` file downloads via jsPDF + jspdf-autotable. Open it.                                                                                                                                                          |           |
| 15.7  | PDF file structure                                    | Page has a text header near the top reading the context title (e.g. "This table displays results for S1 and all subjects"). Below is a landscape-orientation autoTable with the matrix contents.                       |           |
| 15.8  | PDF file: notice banner is NOT included               | The info banner is not rendered in the PDF.                                                                                                                                                                            |           |
| 15.9  | Export with a filter applied (e.g. Subject = English) | Both Excel and PDF include ONLY the English columns. Row 0 / title line reads e.g. "This table displays results for S1 and English".                                                                                   |           |
| 15.10 | Export when the matrix has no data                    | Click Export with a period that has no grades. Excel and PDF still download, containing the headers and student names but with em-dashes in all category cells.                                                        |           |

---

## 16. Grades Tab — Filters and Views

### 16.1 Filter controls

| #      | What to Check                                         | Expected Result                                                                                                                                                                      | Pass/Fail |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.1.1 | Click the **Grades** tab                              | Active tab changes; assessments / results unmount; Grades controls render.                                                                                                           |           |
| 16.1.2 | Two Select dropdowns appear                           | **Subject** (placeholder "Subject", first option **All Subjects**) and **Period** (placeholder "Period", first option **All Periods**).                                              |           |
| 16.1.3 | Initial empty state                                   | Paragraph reads **"Select a subject and period to view grades."** No table or matrix is rendered yet.                                                                                |           |
| 16.1.4 | **Compute Grades** button (visible only in flat view) | Primary button in the header actions, text **"Compute Grades"**. Shown ONLY when both Subject ≠ "all" AND Period ≠ "all". Hidden when either dropdown is set to "all" (matrix view). |           |

### 16.2 Matrix-view display toggle

| #      | What to Check                     | Expected Result                                                                                                                     | Pass/Fail |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.2.1 | Set Subject = all OR Period = all | A small display-toggle widget appears at the right of the filter bar with two buttons: **"A B C"** and **"%"**. Default is "A B C". |           |
| 16.2.2 | Click **%**                       | The button becomes active (primary background). Matrix cells show percentages (e.g. "85%") instead of letter grades.                |           |
| 16.2.3 | Click **A B C**                   | Switches back. Cells display letter grades (e.g. "A-") where the API provides `display_value`, otherwise falls back to percentages. |           |

---

## 17. Grades Tab — Compute Grades and Override Dialog

### 17.1 Flat view (specific subject + specific period)

| #      | What to Check                                        | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1.1 | Set Subject = **English**, Period = **S1**           | A DataTable renders. Columns: **Student**, **Computed**, **Override**, **Final**, **Actions**.                                                                                                                      |           |
| 17.1.2 | Each row shows a student's period grade              | - Computed: the algorithmic score with optional letter in parentheses, e.g. `47.1 (F)`. Em-dash if no grade.<br>- Override: the manual override value if set, else em-dash.<br>- Final: override ?? computed, bold. |           |
| 17.1.3 | **Compute Grades** button in header                  | Click it. POST to `/api/v1/gradebook/period-grades/compute` with `{class_id, subject_id, academic_period_id}`. Toast "Grades computed". Table refetches.                                                            |           |
| 17.1.4 | Each row has an **"Override"** ghost button          | Pencil icon, label "Override".                                                                                                                                                                                      |           |
| 17.1.5 | Click Override on a student                          | Override dialog opens. Title "Override". Shows "Student: {name}" on top. Two inputs: **Score** (numeric) and **Letter Grade** (text placeholder `e.g. A+`). Save and Cancel buttons.                                |           |
| 17.1.6 | Save with a new score (e.g. 55)                      | POST to `/api/v1/gradebook/period-grades/{id}/override` with `{overridden_value: "55", override_reason: "Manual override"}`. Dialog closes. Table refetches. The Override and Final columns update.                 |           |
| 17.1.7 | Save with a letter grade (e.g. `B-`)                 | Same endpoint, `overridden_value: "B-"`. Letter appears in Override and Final columns.                                                                                                                              |           |
| 17.1.8 | Cancel the dialog                                    | No API call. Table unchanged.                                                                                                                                                                                       |           |
| 17.1.9 | Compute Grades disabled when filters are matrix-view | If Subject = all OR Period = all, clicking "Compute Grades" shows a toast error: **"Select a specific subject and period to compute grades"**. No API call.                                                         |           |

---

## 18. Grades Tab — Matrix Views (Cross-Subject / Cross-Period / Year Overview)

### 18.1 Cross-Subject matrix

| #      | What to Check                                   | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1.1 | Set Subject = **All Subjects**, Period = **S1** | Fetches `/api/v1/gradebook/period-grades/cross-subject?class_id={id}&academic_period_id={s1Id}`. Matrix renders with students in rows, subjects in columns, and a final **Total** column (primary colour, semibold). |           |
| 18.1.2 | Subject column headers show weights             | Each subject header has the subject name on line 1 and "{weight}%" on line 2 (rounded to 1 decimal).                                                                                                                 |           |
| 18.1.3 | Sticky student column                           | First column is `sticky start-0 bg-background`, pinned during horizontal scroll.                                                                                                                                     |           |
| 18.1.4 | Cell display depends on A/B/C vs % toggle       | With A B C: show letter grades (from `display`). With %: show `{computed}%`.                                                                                                                                         |           |
| 18.1.5 | Missing data                                    | Cells with no data show em-dash (—).                                                                                                                                                                                 |           |

### 18.2 Cross-Period matrix

| #      | What to Check                                       | Expected Result                                                                                                                                                                                                                 | Pass/Fail |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.2.1 | Set Subject = **English**, Period = **All Periods** | Fetches `/api/v1/gradebook/period-grades/cross-period?class_id={id}&subject_id={englishId}&academic_year_id={yearId}`. Matrix has students in rows, periods in columns (**S1**, **S2**), and an **Annual** column on the right. |           |
| 18.2.2 | Period column headers show weights                  | Each period header has the period name on line 1 and "{weight}%" on line 2.                                                                                                                                                     |           |
| 18.2.3 | Annual column                                       | Shows each student's annual-aggregate grade for that subject in primary-coloured, semibold text.                                                                                                                                |           |

### 18.3 Year Overview matrix

| #      | What to Check                                            | Expected Result                                                                                                                                                                                                                                                                                                             | Pass/Fail |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.3.1 | Set Subject = **All Subjects**, Period = **All Periods** | Fetches `/api/v1/gradebook/period-grades/year-overview?class_id={id}&academic_year_id={yearId}`. Matrix renders with students in rows, periods in columns (each period shows an overall grade, NOT per-subject), and a final **Year** column on the right with a light primary-coloured background cell for extra emphasis. |           |
| 18.3.2 | Year column styling                                      | Font is monospace, bold, primary-700. Cell background uses a very light primary tint (`bg-primary-50/50`). This is the tenant's single year-end aggregate score per student.                                                                                                                                                |           |

---

## 19. Arabic / RTL

| #    | What to Check                                 | Expected Result                                                                                                                                                   | Pass/Fail |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Toggle to Arabic. Navigate to `/ar/gradebook` | Class listing flips to RTL. Year group section headers show GraduationCap on the right side, cards flow right-to-left.                                            |           |
| 19.2 | Open a class gradebook in Arabic              | Tab bar flows right-to-left. "Assessments" / "Results" / "Grades" labels are translated. The back button arrow now points right (`rtl:rotate-180`).               |           |
| 19.3 | Results tab in Arabic                         | Matrix remains LTR inside (numbers and subject/category names still read left-to-right where needed). The notice banner text is translated; Info icon flips side. |           |
| 19.4 | Grade Entry page in Arabic                    | All labels translated. Score inputs retain `dir="ltr"` so numbers display correctly. The "students graded" counter text is localised.                             |           |
| 19.5 | Request Unlock dialog in Arabic               | Title, description, placeholder, Submit and Cancel buttons all render in Arabic without showing fallback keys.                                                    |           |
| 19.6 | Toggle back to English                        | Layout flips back to LTR. All state is preserved.                                                                                                                 |           |

---

## End of Spec

Once all rows show Pass, the Gradebook listing, Class Gradebook workspace (Assessments / Results / Grades tabs), Grade Entry page (including the full create → enter → submit → lock → unlock-request → admin approve → re-edit → resubmit lifecycle), and the matrix views are all verified.
