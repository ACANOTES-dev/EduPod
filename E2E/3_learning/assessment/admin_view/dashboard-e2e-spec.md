# E2E Test Specification: Assessment — Dashboard (Admin View)

> **Coverage:** This document covers the **Leadership Assessment Oversight Dashboard** (`/en/assessments`) as rendered for administrator roles (school_owner, school_principal, school_vice_principal, admin). It also covers the **Approval Queue** page (`/en/assessments/approvals`) and the four assessment configuration sub-pages reached from the dashboard quick-access cards.
>
> **Role gating:** The same URL (`/en/assessments`) renders two completely different components depending on the current user's role. Teachers see the teacher-centric allocations view (covered in `teacher_view/dashboard-e2e-spec.md`). Administrators see the **Leadership Dashboard** documented here. Role detection uses `ADMIN_ROLES = ['school_owner', 'school_principal', 'school_vice_principal', 'admin']`; if the signed-in user has any of those role_keys, the leadership variant renders.
>
> **Pages documented here:**
>
> - Leadership Assessment Dashboard (`/en/assessments`) — purpose-built oversight view
> - Approval Queue (`/en/assessments/approvals`) — config + unlock request review
> - Assessment Categories (`/en/assessments/categories`) — entry from quick-access card
> - Grading Weights (`/en/assessments/grading-weights`) — entry from quick-access card
> - Rubric Templates (`/en/assessments/rubric-templates`) — entry from quick-access card
> - Curriculum Standards (`/en/assessments/curriculum-standards`) — entry from quick-access card
> - Jump-to destinations (Curriculum Matrix / Gradebook / Grade Analytics — covered elsewhere)

**Base URL:** `https://nhqs.edupod.app` (never use `nurul-huda.edupod.app`)
**Prerequisite:** Logged in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`), who holds the **School Owner** role in tenant **Nurul Huda School (NHQS)**. After login you land on `/en/dashboard` (the non-teacher variant).
**Navigation path to start:** Click **Learning** in the morph bar → click **Assessment** in the Learning sub-strip → click **Dashboard** in the Assessment sub-strip (already active by default).

---

## Table of Contents

1. [Navigating to the Assessment Dashboard as Admin](#1-navigating-to-the-assessment-dashboard-as-admin)
2. [Leadership Dashboard — Page Load](#2-leadership-dashboard--page-load)
3. [Header — Title, Description, Action Buttons](#3-header--title-description-action-buttons)
4. [KPI Strip — Six Tone-Coded Cards](#4-kpi-strip--six-tone-coded-cards)
5. [KPI Strip — Hover-Follow Tooltips](#5-kpi-strip--hover-follow-tooltips)
6. [Inline Approvals Queue (Embedded)](#6-inline-approvals-queue-embedded)
7. [Teachers Needing Attention Panel](#7-teachers-needing-attention-panel)
8. [Config Health Panel](#8-config-health-panel)
9. [Activity by Subject — Structure and Unfiltered View](#9-activity-by-subject--structure-and-unfiltered-view)
10. [Activity by Subject — Year Group Filter](#10-activity-by-subject--year-group-filter)
11. [Activity by Subject — Class Filter and Dim Treatment](#11-activity-by-subject--class-filter-and-dim-treatment)
12. [Activity by Subject — Column Header Tooltips](#12-activity-by-subject--column-header-tooltips)
13. [Activity by Subject — Missing Assessments Flag](#13-activity-by-subject--missing-assessments-flag)
14. [Assessment Configuration Quick-Access](#14-assessment-configuration-quick-access)
15. [Jump-To Row](#15-jump-to-row)
16. [Approval Queue Page — Config Approvals Tab](#16-approval-queue-page--config-approvals-tab)
17. [Approval Queue Page — Unlock Requests Tab](#17-approval-queue-page--unlock-requests-tab)
18. [Refresh Button Behaviour](#18-refresh-button-behaviour)
19. [Arabic / RTL](#19-arabic--rtl)
20. [Role Gating — Verifying the Teacher View Does NOT Render](#20-role-gating--verifying-the-teacher-view-does-not-render)

---

## 1. Navigating to the Assessment Dashboard as Admin

| #   | What to Check                                                            | Expected Result                                                                                                                                                                                                       | Pass/Fail |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | After login as `owner@nhqs.test`, verify you land on the admin dashboard | URL is `/en/dashboard` (**NOT** `/en/dashboard/teacher`). No "Good morning, Sarah" greeting — the admin dashboard is tenant/governance focused.                                                                       |           |
| 1.2 | Inspect the morph bar hubs                                               | Admin hubs visible: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Finance**, **Reports**, **Regulatory**, **Settings** (9 in total). The Teacher view hides Finance, Regulatory, and Settings. |           |
| 1.3 | Click the **Learning** hub button                                        | Browser navigates to `/en/classes` (admin's first accessible basePath in the Learning hub). A Learning sub-strip appears with: **Classes**, **Curriculum**, **Assessment**, **Homework**, **Attendance**.             |           |
| 1.4 | Click the **Assessment** link in the Learning sub-strip                  | Browser navigates to `/en/assessments`. The Assessment link is highlighted as active.                                                                                                                                 |           |
| 1.5 | Verify the secondary Assessment sub-strip                                | Below the Learning sub-strip, a second nav row appears with: **Dashboard**, **Gradebook**, **Report Cards**, **Analytics**. "Dashboard" is active.                                                                    |           |
| 1.6 | Verify the right-side profile button                                     | Reads **"Yusuf Rahman"** with role label **"School Owner"** (not "Teacher"). Avatar shows the initials **"YR"** in a primary-coloured circle.                                                                         |           |

---

## 2. Leadership Dashboard — Page Load

**URL:** `/en/assessments`

| #   | What to Check                     | Expected Result                                                                                                                                                                                                                                                                                                                             | Pass/Fail |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Loading state                     | For the first ~500ms you see a LoadingSkeleton: one wide header stripe, six KPI card skeletons in a row, an approvals skeleton strip, and a 3-column + 2-column split skeleton.                                                                                                                                                             |           |
| 2.2 | After load, all sections populate | No infinite skeletons remain. Header, KPI strip, (optional) approvals queue, teachers-needing-attention table, config health table, activity-by-subject table, assessment configuration cards, and jump-to row all render.                                                                                                                  |           |
| 2.3 | No "No staff profile" toast       | Unlike the legacy behaviour, the admin must NOT receive a red toast saying **"No staff profile found for user …"**. The leadership dashboard routes around `getMyAllocations` entirely.                                                                                                                                                     |           |
| 2.4 | Browser console                   | No red errors from `/api/v1/gradebook/teaching-allocations/all`, `/api/v1/subjects?pageSize=100`, `/api/v1/gradebook/assessments?...`, `/api/v1/gradebook/assessment-categories?pageSize=100`, `/api/v1/gradebook/teacher-grading-weights?pageSize=100`, `/api/v1/gradebook/rubric-templates`, or `/api/v1/gradebook/curriculum-standards`. |           |
| 2.5 | Data provenance                   | The leadership dashboard fetches in parallel: (a) **all** teaching allocations (`teaching-allocations/all`, admin-only), (b) paginated assessments page 1..N with `exclude_cancelled=true&pageSize=100`, (c) all four config-count lists. Verify all six requests complete within ~2s.                                                      |           |

---

## 3. Header — Title, Description, Action Buttons

| #   | What to Check                              | Expected Result                                                                                                                                                                                         | Pass/Fail |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Page heading                               | An `<h1>` reads **"Assessment Oversight"**. Font weight semibold, size `text-2xl`.                                                                                                                      |           |
| 3.2 | Description subtitle                       | Below the heading: **"School-wide assessment activity, teacher grading progress, approvals, and configuration health."**                                                                                |           |
| 3.3 | Action buttons on the right                | Two buttons in a row: (1) **"Open approvals queue"** primary-coloured button with a ClipboardCheck icon that links to `/assessments/approvals`. (2) **"Refresh"** outline button with a RefreshCw icon. |           |
| 3.4 | Click **Open approvals queue**             | Browser navigates to `/en/assessments/approvals`. See section 16. Use browser Back to return.                                                                                                           |           |
| 3.5 | Buttons wrap correctly on narrow viewports | At <640px width, the header row still renders cleanly; the action button pair wraps below the title with `flex-wrap`. Nothing overflows off-screen.                                                     |           |

---

## 4. KPI Strip — Six Tone-Coded Cards

Six `KpiCard` components in a responsive grid: 2 columns on mobile, 3 at `sm:`, 6 at `lg:`. Order left-to-right:

| #   | Card Label          | Tone    | Icon          | Expected Value (nhqs, 2026-04)                                                                      | Pass/Fail |
| --- | ------------------- | ------- | ------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | **Scheduled**       | info    | Clock         | Number of open assessments whose due date is still in the future. Expected: **2**.                  |           |
| 4.2 | **Pending Grading** | warning | ClipboardList | Number of open assessments whose due date has passed but grading deadline has not. Expected: **0**. |           |
| 4.3 | **Overdue**         | danger  | AlertTriangle | Number of open assessments where the grading deadline has passed. Expected: **0**.                  |           |
| 4.4 | **Submitted**       | success | CheckCircle2  | Number of `submitted_locked` + `unlock_requested` assessments. Expected: **46**.                    |           |
| 4.5 | **Final Locked**    | neutral | Sparkles      | Number of `final_locked` + `locked` assessments. Expected: **0**.                                   |           |
| 4.6 | **Active Teachers** | neutral | Users         | Count of distinct `staff_profile_id`s across all teaching allocations. Expected: **16**.            |           |

### 4.7 Tone styling

| #     | What to Check                      | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.7.1 | **Scheduled** (tone=info)          | Border `border-info-text/30`, background `bg-info-fill/40`. Clock icon tinted `text-info-text/60`.                                                                                              |           |
| 4.7.2 | **Pending Grading** (tone=warning) | When value > 0, border `border-warning-text/40` and background `bg-warning-fill/40`. When value === 0, card reverts to plain `border-border` and icon becomes a subtle `text-text-tertiary/40`. |           |
| 4.7.3 | **Overdue** (tone=danger)          | Same conditional treatment as warning but using danger colours. Value 0 → plain card, value > 0 → red-tinted background and red icon.                                                           |           |
| 4.7.4 | **Submitted** (tone=success)       | Border `border-success-text/30`, background `bg-success-fill/30`. Check icon tinted `text-success-text/60`.                                                                                     |           |
| 4.7.5 | **Final Locked** (tone=neutral)    | Plain `border-border` background, Sparkles icon in `text-text-tertiary/50`.                                                                                                                     |           |
| 4.7.6 | **Active Teachers** (tone=neutral) | Plain `border-border` background, Users icon in `text-text-tertiary/50`.                                                                                                                        |           |

### 4.8 Value animation

| #     | What to Check   | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.8.1 | Initial load    | Each KpiCard uses the shared `StatCard` component, which animates numeric values from 0 to the final value over 400ms using an ease-out curve (unless `prefers-reduced-motion: reduce` is set). |           |
| 4.8.2 | Hitting Refresh | When the Refresh button is clicked and values change, the StatCards re-animate from the previous value to the new value.                                                                        |           |

---

## 5. KPI Strip — Hover-Follow Tooltips

Each KPI card is wrapped in a `HoverFollowTooltip` component. The tooltip appears at the cursor position and follows mouse movement while the pointer is inside the card.

| #    | What to Check                              | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.1  | Cursor style on hover                      | Hovering any KPI card shows `cursor: help` (a question-mark cursor).                                                                                                                                                                 |           |
| 5.2  | Tooltip rendering                          | A small rounded card appears at ~14px right and ~18px below the cursor. Card has `rounded-lg border border-border bg-surface px-3 py-2 shadow-xl ring-1 ring-black/5`. Z-index 9999. Rendered via `createPortal` to `document.body`. |           |
| 5.3  | Tooltip body                               | Upper line: bold uppercase title (the card label, e.g. "SCHEDULED"). Lower line: explanation body in `text-text-secondary`.                                                                                                          |           |
| 5.4  | Move cursor within the card                | Tooltip follows the cursor on every `mousemove`, staying at the same offset.                                                                                                                                                         |           |
| 5.5  | Move cursor off the card                   | Tooltip disappears immediately (`mouseleave` sets visible=false).                                                                                                                                                                    |           |
| 5.6  | Edge: cursor near the right viewport edge  | Tooltip auto-flips to the left of the cursor when `pos.x + offsetX + maxWidth > viewportWidth - 8`.                                                                                                                                  |           |
| 5.7  | Edge: cursor near the bottom viewport edge | Tooltip auto-flips above the cursor when `pos.y + offsetY + tooltipHeight > viewportHeight - 8`.                                                                                                                                     |           |
| 5.8  | **Scheduled** tooltip body                 | "Open assessments whose due date is still in the future. Teachers haven't started grading them yet — this is the pipeline of upcoming work."                                                                                         |           |
| 5.9  | **Pending Grading** tooltip body           | "Open assessments whose due date has passed but the grading deadline hasn't. Teachers should be entering grades now."                                                                                                                |           |
| 5.10 | **Overdue** tooltip body                   | "Open assessments where the grading deadline has already passed and grades are still not submitted. These need immediate follow-up with the teacher."                                                                                |           |
| 5.11 | **Submitted** tooltip body                 | "Assessments the teacher has finished grading and locked. They can no longer be edited without an unlock request. Counted in-year until a principal final-locks them."                                                               |           |
| 5.12 | **Final Locked** tooltip body              | "Assessments the principal has permanently closed at the end of term. Grades are immutable and feed into report cards."                                                                                                              |           |
| 5.13 | **Active Teachers** tooltip body           | "Distinct teachers who currently have at least one teaching allocation (class + subject) in this academic year."                                                                                                                     |           |

---

## 6. Inline Approvals Queue (Embedded)

Below the KPI strip, the `<InlineApprovalQueue>` component renders inline. It is the **same component** the teacher view uses, but for admins it is populated with tenant-wide items instead of being hidden.

### 6.1 Empty state

| #     | What to Check                                                     | Expected Result                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | When there are zero pending config items AND zero unlock requests | The component returns `null` — nothing is rendered in this slot. The page visually skips straight from the KPI strip to the two-column split below. This is the expected state for the nhqs tenant today (all categories and weights are approved). |           |

### 6.2 Populated state

(To test these rows, a teacher must have recently submitted a category, a weight, or an unlock request. If none exist, reproduce by logging in as Sarah Daly and following the teacher gradebook spec §10.5 or the teacher dashboard spec §6 approval submission flow.)

| #     | What to Check            | Expected Result                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1 | Heading row              | A heading reads **"Pending Approvals"** followed by a warning-coloured Badge with the total count (config items + unlock requests).                                                                                                                             |           |
| 6.2.2 | Config Approvals section | A bordered card with the header **"Config Approvals"**. Each row contains: item name (truncated), a "Category" or "Weight" StatusBadge (warning dot variant), the teacher name on a second line, and two icon buttons on the right — a green Check and a red X. |           |
| 6.2.3 | Unlock Requests section  | A bordered card with the header **"Unlock Requests"**. Each row contains: assessment title, class/subject path, teacher name, a reason excerpt in grey, plus the same green Check / red X action pair.                                                          |           |

### 6.3 Approve action

| #     | What to Check                       | Expected Result                                                                                                                                                                                                                              | Pass/Fail |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Click the green Check on a category | HTTP POST `/api/v1/gradebook/assessment-categories/{id}/approve`. On success: toast **"Approved successfully"**; row disappears; count badge decreases by 1.                                                                                 |           |
| 6.3.2 | Click the green Check on a weight   | HTTP POST `/api/v1/gradebook/teacher-grading-weights/{id}/approve`. Same success behaviour.                                                                                                                                                  |           |
| 6.3.3 | Click the green Check on an unlock  | HTTP POST `/api/v1/gradebook/unlock-requests/{id}/review` with body `{status: "approved"}`. Same success behaviour. In the teacher's view, the affected assessment returns from `unlock_requested` → `reopened`, granting a new edit window. |           |

### 6.4 Reject action

| #     | What to Check                         | Expected Result                                                                                                                                                                                                                                                                                                                                             | Pass/Fail |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.4.1 | Click the red X on any row            | A reject dialog opens. Title **"Reject"** (or equivalent common translation). Body includes a textarea labelled **"Rejection Reason"** with placeholder text. Confirm button (destructive variant) is DISABLED while empty.                                                                                                                                 |           |
| 6.4.2 | Type a reason and click confirm       | For categories: POST `/api/v1/gradebook/assessment-categories/{id}/reject` with `{reason}`. For weights: POST `/api/v1/gradebook/teacher-grading-weights/{id}/reject`. For unlocks: POST `/api/v1/gradebook/unlock-requests/{id}/review` with `{status: "rejected", reason}`. On success: toast **"Rejected successfully"**; dialog closes; row disappears. |           |
| 6.4.3 | Click **Cancel** in the reject dialog | Dialog closes; no API call; row stays in place.                                                                                                                                                                                                                                                                                                             |           |

### 6.5 Loading and permission fallbacks

| #     | What to Check                                         | Expected Result                                                                                                                                    | Pass/Fail |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.5.1 | Initial load                                          | A pulsing skeleton strip renders for ~500ms while the three approval endpoints resolve in parallel.                                                |           |
| 6.5.2 | If all three endpoints 403 (insufficient permissions) | The component sets `hasPermission=false` and returns `null`. Should not happen for a School Owner but protects against misconfigured custom roles. |           |

---

## 7. Teachers Needing Attention Panel

Left side of a two-column split (3 of 5 columns on `lg:`). A bordered 2xl section with a sticky header.

### 7.1 Header

| #     | What to Check     | Expected Result                                                                                                             | Pass/Fail |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Header row        | Left: AlertTriangle icon in `text-warning-text` and heading **"Teachers needing attention"**. Right: small grey count line. |           |
| 7.1.2 | Count line format | **"{n} teacher"** (singular) or **"{n} teachers"** (plural). Based on the filtered list length.                             |           |

### 7.2 Empty state

| #     | What to Check                       | Expected Result                                                                                                                                                         | Pass/Fail |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | No teachers have overdue or pending | The panel shows a CheckCircle2 icon (success-coloured) and the text **"Every teacher is on top of their grading. Nothing overdue."** — this is the expected NHQS state. |           |

### 7.3 Populated state

| #     | What to Check                    | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.3.1 | Column headers                   | **Teacher**, **Overdue** (right-aligned), **Pending** (right-aligned), **Scheduled** (right-aligned, hidden on `<sm:`), **Oldest overdue** (right-aligned).                                                 |           |
| 7.3.2 | One row per teacher with backlog | Rows appear ONLY when a teacher has at least 1 overdue OR 1 pending-grading assessment.                                                                                                                     |           |
| 7.3.3 | Row aggregation                  | For each (class, subject) allocation owned by the teacher, the component counts matching assessments. It groups by `staff_profile_id` using the first primary teacher (if multiple teach the same subject). |           |
| 7.3.4 | Sort order                       | Primary: Overdue count descending. Secondary: oldestOverdueDays descending. Tertiary: Pending count descending. Teachers with the worst backlog surface at the top.                                         |           |
| 7.3.5 | **Overdue** cell                 | Shows the number in a `bg-danger-fill` rounded pill with `text-danger-text`. If 0, shows the number plainly in `text-text-tertiary`.                                                                        |           |
| 7.3.6 | **Pending** cell                 | Shows the number in a `bg-warning-fill` rounded pill with `text-warning-text`. If 0, plain text-tertiary.                                                                                                   |           |
| 7.3.7 | **Oldest overdue** cell          | For teachers with overdue items, shows **"{n}d"** in mono-red font, where n is the number of days since the oldest grading_deadline passed. If 0 days, shows **—**.                                         |           |

---

## 8. Config Health Panel

Right side of the two-column split (2 of 5 columns on `lg:`). A bordered section with a fixed table layout so headers and status icons align vertically.

### 8.1 Header

| #     | What to Check         | Expected Result                                                                                                                      | Pass/Fail |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1.1 | Header row            | Left: LayoutGrid icon in `text-info-text` and heading **"Config health"**. Right: small grey text reads **"{ready}/{total} ready"**. |           |
| 8.1.2 | Ready count semantics | `total` = distinct `class_id`s across all allocations. `ready` = total minus `classesWithGaps`. For NHQS: **"1/16 ready"**.          |           |

### 8.2 Empty (no gaps) state

| #     | What to Check                             | Expected Result                                                                                                                                                                           | Pass/Fail |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | No classes have any missing configuration | Panel shows a CheckCircle2 success icon and text **"Every class has grade config, categories, and weights approved."** — not the expected state for NHQS, which has 15 classes with gaps. |           |

### 8.3 Table structure

| #     | What to Check             | Expected Result                                                                                                                                                                                            | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.3.1 | Fixed-width columns       | `<table class="table-fixed">` with column widths **34%** (Class), **22%**, **22%**, **22%** (three status columns). This is essential for header/icon alignment.                                           |           |
| 8.3.2 | Column headers            | **Class** (start-aligned), **Config**, **Categories**, **Weights** (all three centre-aligned). Each is uppercase `text-[10px] font-semibold`, tinted `text-text-tertiary`.                                 |           |
| 8.3.3 | Header tooltip affordance | Each of the four headers has a dotted underline (`underline decoration-dotted underline-offset-4`) hinting at hover interaction. Cursor turns `cursor-help` on hover.                                      |           |
| 8.3.4 | Row count                 | One row per class that has **at least one** missing item (grade config, approved categories, or approved weights). For NHQS: **15 rows** (K1A, J1A, SF1A, 6A, 6B, 5A, 5B, 3A, 3B, 4A, 4B, 2A, 2B, 1A, 1B). |           |
| 8.3.5 | Sort order                | Rows sorted by total-missing-items descending. Classes missing all three columns surface first.                                                                                                            |           |

### 8.4 Row content

| #     | What to Check                             | Expected Result                                                                                                                                                                    | Pass/Fail |
| ----- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.4.1 | **Class** cell                            | Class name in `text-text-primary font-medium` (e.g. "2A", "K1A"). Text-start aligned.                                                                                              |           |
| 8.4.2 | **Config** cell — content                 | Contains a `StatusIcon` (green CheckCircle2 if `missing_grade_config === 0`, red XCircle otherwise), wrapped in `<div class="flex items-center justify-center">` so it is centred. |           |
| 8.4.3 | **Categories** cell — content             | Green CheckCircle2 if `missing_categories === 0`, else red XCircle. Centred.                                                                                                       |           |
| 8.4.4 | **Weights** cell — content                | Green CheckCircle2 if `missing_weights === 0`, else red XCircle. Centred.                                                                                                          |           |
| 8.4.5 | Icons align vertically with their headers | Because the table is `table-fixed` and every cell uses `justify-center`, the icon centre exactly matches the header text centre across all rows.                                   |           |

### 8.5 Column header tooltips

Each of the four headers is wrapped in `ColumnHeader` → `HoverFollowTooltip`.

| #     | Header     | Tooltip body                                                                                                                                                                                    | Pass/Fail |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.5.1 | Class      | "The class this row refers to. Each class needs its own assessment setup before teachers can create any assessments for it."                                                                    |           |
| 8.5.2 | Config     | "Whether a Grade Configuration exists for this class. The grade config defines the marking scale (percentage, letters, bands) and passing threshold used across every assessment in the class." |           |
| 8.5.3 | Categories | "Whether this class has at least one approved Assessment Category (e.g. Homework, Mid-Term, End-of-Term). Teachers can only create assessments that belong to an approved category."            |           |
| 8.5.4 | Weights    | "Whether the Grading Weights for this class have been approved. Weights decide how much each assessment category contributes to a student's final grade."                                       |           |

---

## 9. Activity by Subject — Structure and Unfiltered View

Full-width section below the two-column split.

### 9.1 Header

| #     | What to Check               | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1.1 | Header row                  | Left: TrendingUp icon in `text-primary-600` and heading **"Activity by subject"**. Right: a cluster of two Select dropdowns and a metadata text label. |           |
| 9.1.2 | First dropdown (Year group) | 8-height Select with placeholder **"Year group"**. Default value: **"All years"**. Width 140px.                                                        |           |
| 9.1.3 | Second dropdown (Class)     | 8-height Select with placeholder **"Class"**. Default value: **"All classes"**. Width 140px.                                                           |           |
| 9.1.4 | Metadata label              | Small grey text reads **"{n} subjects · {m} active assessments"**. In unfiltered view for NHQS: **"14 subjects · 48 active assessments"**.             |           |

### 9.2 Unfiltered view — all subjects alphabetical

Verify the initial state (Year = All years, Class = All classes).

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.2.1 | Row count                                            | **14 rows** — one per subject in the tenant's `/api/v1/subjects` response. NHQS subjects: Accounting, Arabic, Biology, Business, Chemistry, Classics, Economics, English, French, Geography, History, Mathematics, Physics, Spanish.              |           |
| 9.2.2 | Sort order                                           | Strict alphabetical ascending by `subject_name`. No grouping, no buckets.                                                                                                                                                                         |           |
| 9.2.3 | First row                                            | **Accounting**. No active assessments — all status cells show **—**, Total shows **—**, row is NOT dimmed (no dim treatment in unfiltered view).                                                                                                  |           |
| 9.2.4 | **Business** row                                     | Also empty (no allocations anywhere nhqs-wide, OR allocations exist but 0 assessments — this is the missingAssessments case). If missingAssessments, row has a **"No active assessments"** danger pill next to the subject name (see section 13). |           |
| 9.2.5 | Subjects with assessments                            | For NHQS: Biology (7), English (7), History (6), Geography (6), Chemistry (6), Mathematics (6), Economics (6), Arabic (4). Numbers in the Total column reflect the sum of scheduled + pending + overdue + submitted + final.                      |           |
| 9.2.6 | Subjects in the tenant's subjects table but untaught | Accounting, Classics, French, Physics, Spanish. All render as plain rows with dashes and no dim treatment (because the table is unfiltered — "out of curriculum" is only meaningful in a filter context).                                         |           |

### 9.3 Column structure

| #     | What to Check | Expected Result                                                                                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.3.1 | Columns       | **Subject** (start-aligned), **Scheduled** (end), **Pending** (end), **Overdue** (end), **Submitted** (end), **Final** (end), **Total** (end, bold).                                                                                                                                                                                 |           |
| 9.3.2 | Cell values   | Each status cell shows the count using the matching semantic colour (`text-info-text` for scheduled, `text-warning-text` for pending, `text-danger-text` for overdue, `text-success-text` for submitted, `text-text-secondary` for final). Zero values are displayed as **—** in `text-text-tertiary`. Total column is bold primary. |           |

---

## 10. Activity by Subject — Year Group Filter

| #    | What to Check                                              | Expected Result                                                                                                                                                                                                                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1 | Click the year group dropdown                              | A listbox opens. Options: **"All years"** (first) followed by one option per year group found in the allocations data, sorted alphabetically by year-group name. For NHQS: **1st class**, **2nd class**, **3rd Class**, **4th Class**, **5th Class**, **6th Class**, **Junior infants**, **Kindergarten**, **Senior infants**. |           |
| 10.2 | Select **"2nd class"**                                     | Dropdown closes, value becomes "2nd class". The class dropdown's options refresh to show only 2nd class classes (**2A**, **2B**).                                                                                                                                                                                              |           |
| 10.3 | Class dropdown is cleared if its previous value is invalid | A `useEffect` checks `classOptions.some(c => c.id === classFilter)`; if false, it resets `classFilter = 'all'`.                                                                                                                                                                                                                |           |
| 10.4 | Table refreshes with year-filtered data                    | The metadata label updates to **"14 subjects · N active assessments"** where N is the sum across all assessments whose class is in 2nd class. Rows are split into two alphabetical groups (in-curriculum first, out-of-curriculum after).                                                                                      |           |

---

## 11. Activity by Subject — Class Filter and Dim Treatment

This is the key admin interaction for spotting curriculum coverage gaps.

### 11.1 Applying the filter

| #      | What to Check                                 | Expected Result                                                                                                                                    | Pass/Fail |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | With Year = "2nd class", click Class dropdown | Listbox opens. Options: **"All classes"**, **"2A"**, **"2B"**.                                                                                     |           |
| 11.1.2 | Select **"2A"**                               | Dropdown closes. Table re-renders immediately with 2A-specific data. Metadata label updates to **"14 subjects · 43 active assessments"** for NHQS. |           |

### 11.2 Two-group alphabetical sort

| #      | What to Check                        | Expected Result                                                                                                                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | **Top group (in-curriculum)**        | Subjects that either have a teaching allocation for 2A **or** have existing assessments for 2A. Rendered alphabetically. For NHQS 2A: **Biology**, **Chemistry**, **Economics**, **English**, **Geography**, **History**, **Mathematics**.           |           |
| 11.2.2 | **Bottom group (out-of-curriculum)** | Subjects that have neither allocations nor assessments for the filtered scope. Rendered alphabetically. For NHQS 2A: **Accounting**, **Arabic**, **Business**, **Classics**, **French**, **Physics**, **Spanish**.                                   |           |
| 11.2.3 | Totals for the in-curriculum group   | Biology 6, Chemistry 6, Economics 6, English 7, Geography 6, History 6, Mathematics 6.                                                                                                                                                               |           |
| 11.2.4 | Economics edge case                  | Economics has 6 assessments for 2A but no teaching allocation record. The component uses an OR rule (allocation OR assessments > 0 → in-curriculum), so Economics sits in the top group. Without this rule, it would incorrectly drop to the bottom. |           |

### 11.3 Dim treatment on out-of-curriculum rows

| #      | What to Check                                             | Expected Result                                                                                                                                         | Pass/Fail |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.3.1 | Out-of-curriculum row background                          | Each bottom-group row has `bg-warning-fill opacity-60`, giving a warm amber wash that fades the row versus its undimmed peers above.                    |           |
| 11.3.2 | Hover state on an out-of-curriculum row                   | On hover, `hover:opacity-80` — the row becomes slightly more visible but keeps its amber tint.                                                          |           |
| 11.3.3 | All six status cells on dim rows                          | All dashes (**—**) in `text-text-tertiary`. No values, no dim-specific text colour override.                                                            |           |
| 11.3.4 | Subject name on dim rows                                  | Still displays in `text-text-primary font-medium` but the row's 60% opacity fades it proportionally.                                                    |           |
| 11.3.5 | No "No active assessments" pill on out-of-curriculum rows | The pill is reserved for rows that ARE in the curriculum but have 0 assessments (section 13). Out-of-curriculum rows are informational, not actionable. |           |

### 11.4 Filter removal behaviour

| #      | What to Check                                                    | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.4.1 | With Year = 2nd class + Class = 2A, change Year to **All years** | Year dropdown shows "All years". The class dropdown's `useEffect` detects that the previous classFilter "2A" is no longer in the refreshed options list and resets classFilter = 'all'. Both filters revert to unfiltered. |           |
| 11.4.2 | Table returns to pure alphabetical                               | 14 rows, no dim treatment, Business still flagged with missingAssessments pill.                                                                                                                                            |           |

---

## 12. Activity by Subject — Column Header Tooltips

Each of the 7 column headers uses the same `ColumnHeader` → `HoverFollowTooltip` pattern as section 8.5.

| #    | Header    | Tooltip body                                                                                                                             | Pass/Fail |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Subject   | "The subject this row summarises. All 14 subjects taught at the school are listed, even if they currently have zero active assessments." |           |
| 12.2 | Scheduled | Same text as the Scheduled KPI tooltip (see 5.8). The ColumnHeader reuses `kpiScheduledTooltip` for consistency.                         |           |
| 12.3 | Pending   | Same as the Pending Grading KPI tooltip (see 5.9).                                                                                       |           |
| 12.4 | Overdue   | Same as the Overdue KPI tooltip (see 5.10).                                                                                              |           |
| 12.5 | Submitted | "Number of assessments the teacher has already graded and locked. Waiting for principal final-lock at end of term."                      |           |
| 12.6 | Final     | "Number of assessments the principal has permanently closed. These are immutable and feed into report cards."                            |           |
| 12.7 | Total     | "Sum of scheduled + pending grading + overdue + submitted + final for this subject (excluding drafts and cancelled)."                    |           |

---

## 13. Activity by Subject — Missing Assessments Flag

The "No active assessments" pill is a critical admin-visible warning.

| #    | What to Check                               | Expected Result                                                                                                                                                                                                                             | Pass/Fail |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Rule for displaying the pill                | `row.missingAssessments = row.assignedInContext && row.total === 0`. Set in the rowMap pass after counting.                                                                                                                                 |           |
| 13.2 | Pill appearance                             | Inline-flex span with `rounded-md border border-danger-text/30 bg-danger-fill px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger-text`. Leading AlertTriangle icon (12px). Label: **"NO ACTIVE ASSESSMENTS"**.    |           |
| 13.3 | Pill hover-follow tooltip                   | The pill itself is wrapped in a `HoverFollowTooltip as="span"`. Title: **"No active assessments"**. Body: **"This subject is assigned to the selected class but no assessments have been created for it yet. Follow up with the teacher."** |           |
| 13.4 | Row background for missing-assessments rows | The row has `bg-danger-fill/30 hover:bg-danger-fill/50` (red tint, slightly stronger on hover). This overrides the amber out-of-curriculum treatment because missingAssessments and out-of-curriculum are mutually exclusive conditions.    |           |
| 13.5 | NHQS missing-assessments case               | In the all-years/all-classes view, **Business** is the only subject with this flag — it's assigned to allocations somewhere in the school but has zero active assessments anywhere. No other subjects trigger this in NHQS today.           |           |
| 13.6 | When Business is filtered out of scope      | Filter to 2A: Business moves to the out-of-curriculum bottom group (amber dim, no red pill) because it's no longer assigned in the filter scope.                                                                                            |           |

---

## 14. Assessment Configuration Quick-Access

Below the Activity by Subject table, a section heading **"Assessment Configuration"** with a small helper text (visible on `sm:+` only): **"Reusable building blocks teachers draw from when creating assessments. Approve templates here and teachers can select them instantly."**

### 14.1 Card grid

Four `ConfigCard` components in a grid: 1 column mobile, 2 at `sm:`, 4 at `lg:`.

| #      | Card Title            | Link                                | Icon          | Primary Label                | Secondary Label                                                                | Pass/Fail |
| ------ | --------------------- | ----------------------------------- | ------------- | ---------------------------- | ------------------------------------------------------------------------------ | --------- |
| 14.1.1 | Assessment Categories | `/assessments/categories`           | BookOpen      | `{approved}/{total}` (4/4)   | **"All approved"** when `pendingCategories === 0`; otherwise **"{n} pending"** |           |
| 14.1.2 | Grading Weights       | `/assessments/grading-weights`      | Scale         | `{approved}/{total}` (18/18) | **"All approved"** when `pendingWeights === 0`; otherwise **"{n} pending"**    |           |
| 14.1.3 | Rubric Templates      | `/assessments/rubric-templates`     | ClipboardList | Total count (e.g. **0**)     | **"Templates"**                                                                |           |
| 14.1.4 | Curriculum Standards  | `/assessments/curriculum-standards` | Target        | Total count (e.g. **1**)     | **"Standards"**                                                                |           |

### 14.2 Card layout

| #      | What to Check        | Expected Result                                                                                                                                                       | Pass/Fail |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.2.1 | Icon corner          | Left side: 10×10 rounded square with `bg-primary-50 text-primary-700`. Hover state: `bg-primary-100`.                                                                 |           |
| 14.2.2 | Primary label        | Top-right, large mono font `text-lg font-semibold text-text-primary`. Truncates on overflow.                                                                          |           |
| 14.2.3 | Secondary label      | Below the primary label, small uppercase text `text-[10px] font-semibold uppercase tracking-wider text-text-tertiary`.                                                |           |
| 14.2.4 | Title + description  | Bottom half: title bold, description small grey text, both truncate. For the Categories card: **"Assessment Categories"** / **"Define assessment types and scopes"**. |           |
| 14.2.5 | Hover state          | Border becomes `primary-300` on hover; icon background shifts to `primary-100`. Cursor becomes pointer.                                                               |           |
| 14.2.6 | `min-w-0` protection | Each card has `min-w-0` on the root and inner text containers so long secondary labels cannot push the card past the parent's grid cell. Test at 375px width.         |           |

### 14.3 Navigation

| #      | What to Check                        | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.3.1 | Click **Assessment Categories** card | Browser navigates to `/en/assessments/categories`. The page title reads **"Assessment Categories"**. As admin, you see both your own items AND items submitted by teachers awaiting your approval. Use browser Back. |           |
| 14.3.2 | Click **Grading Weights** card       | Navigates to `/en/assessments/grading-weights`. Shows all 18 approved weights for this tenant. Use browser Back.                                                                                                     |           |
| 14.3.3 | Click **Rubric Templates** card      | Navigates to `/en/assessments/rubric-templates`. Empty state: **"No rubric templates yet. Create one to get started."**. Use browser Back.                                                                           |           |
| 14.3.4 | Click **Curriculum Standards** card  | Navigates to `/en/assessments/curriculum-standards`. Shows the one standard. Use browser Back.                                                                                                                       |           |

---

## 15. Jump-To Row

Bottom of the page. A section heading **"Jump to"** followed by a 3-card grid (1 col mobile, 2 at `sm:`, 3 at `lg:`).

**Note:** The Jump-to row does NOT include an Approvals Queue card. The "Open approvals queue" button lives in the page header (see section 3.3) to keep that high-priority action near the top of the page.

| #    | Card       | Link                 | Title             | Description                                        | Pass/Fail |
| ---- | ---------- | -------------------- | ----------------- | -------------------------------------------------- | --------- |
| 15.1 | Curriculum | `/curriculum-matrix` | Curriculum matrix | Class × subject teaching coverage                  |           |
| 15.2 | Gradebook  | `/gradebook`         | Gradebook         | Browse classes, assessments and grades             |           |
| 15.3 | Analytics  | `/analytics`         | Grade analytics   | Class overview, subject deep dive, student profile |           |

### 15.4 Card layout & overflow protection

| #      | What to Check                        | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.4.1 | Card content                         | Title + description on the left, ExternalLink icon on the right. `flex items-center justify-between gap-3`.                                                                                         |           |
| 15.4.2 | `min-w-0` protection                 | Each Link has `flex min-w-0 ... items-center justify-between`. Inner text wrapper has `min-w-0` + `truncate`. Prevents long descriptions from expanding the card past its grid cell.                |           |
| 15.4.3 | Bottom padding on the dashboard root | The root container has `pb-10` so the jump-to cards do not touch the viewport bottom edge. Earlier iterations had `space-y-6` only which pushed cards flush against the browser dock at the bottom. |           |
| 15.4.4 | Right edge on wide viewports         | At 1440px+ the rightmost card (Grade analytics) should have a visible gap between its border and the main content column edge — NOT touching or overflowing.                                        |           |

---

## 16. Approval Queue Page — Config Approvals Tab

**URL:** `/en/assessments/approvals`. Reached either by clicking the "Open approvals queue" button in the dashboard header, or by navigating directly.

### 16.1 Page load

| #      | What to Check    | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1.1 | Page heading     | An `<h1>` reads **"Approval Queue"**.                                                                                                                                                                    |           |
| 16.1.2 | Page description | Below the heading: **"Review and approve pending configuration items and unlock requests"**.                                                                                                             |           |
| 16.1.3 | Tab bar          | Two tab buttons: **Config Approvals** (active by default) and **Unlock Requests**. Each label includes a count badge (warning pill) when the count > 0.                                                  |           |
| 16.1.4 | Browser console  | No red errors related to `/api/v1/gradebook/assessment-categories?status=pending_approval`, `/api/v1/gradebook/teacher-grading-weights?status=pending_approval`, or `/api/v1/gradebook/unlock-requests`. |           |

### 16.2 Empty state

| #      | What to Check               | Expected Result                                                                                                         | Pass/Fail |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.2.1 | When 0 pending config items | The tab body shows a subtle icon and text **"No pending configuration approvals"**. This is the current state for NHQS. |           |

### 16.3 Populated state

(To test this, a teacher must submit a category or weight for approval first. Follow teacher dashboard spec §6 or teacher gradebook spec §10.)

| #      | What to Check           | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.3.1 | Table columns           | **Item Name**, **Type** (Category / Weight badge), **Teacher**, **Submitted On**, **Actions**.                                                                                                                      |           |
| 16.3.2 | Row content             | For categories: item name = category name; for weights: item name = **"{subject_name} / {year_group_name}"**. Type badge uses warning variant.                                                                      |           |
| 16.3.3 | Actions cell            | Two icon buttons: green Check (approve) and red X (reject). Both have `title` attributes for tooltips. The Reject button opens a dialog with a reason textarea; Confirm is disabled until the textarea has content. |           |
| 16.3.4 | Approve flow — category | POST `/api/v1/gradebook/assessment-categories/{id}/approve`. Toast **"Approved successfully"**. Row removed from list. Count badge decreases by 1.                                                                  |           |
| 16.3.5 | Approve flow — weight   | POST `/api/v1/gradebook/teacher-grading-weights/{id}/approve`. Same toast + row removal.                                                                                                                            |           |
| 16.3.6 | Reject flow             | POST to the corresponding `/reject` endpoint with body `{reason}`. Toast **"Rejected successfully"**. Row removed.                                                                                                  |           |
| 16.3.7 | Mobile card view        | At <640px, each row collapses to a stacked card with title / type / teacher / submitted stacked, and the action buttons as a row at the bottom.                                                                     |           |

---

## 17. Approval Queue Page — Unlock Requests Tab

| #    | What to Check                     | Expected Result                                                                                                                                                                                                                                                  | Pass/Fail |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Click the **Unlock Requests** tab | Active tab switches. Table body re-renders.                                                                                                                                                                                                                      |           |
| 17.2 | Empty state                       | **"No pending unlock requests"** message inside the tab body.                                                                                                                                                                                                    |           |
| 17.3 | Table columns                     | **Assessment Title**, **Class**, **Subject**, **Requested By**, **Reason**, **Submitted On**, **Actions**.                                                                                                                                                       |           |
| 17.4 | Reason column                     | Truncated to a single line with ellipsis on desktop; fully expanded in mobile card view.                                                                                                                                                                         |           |
| 17.5 | Approve action                    | POST `/api/v1/gradebook/unlock-requests/{id}/review` with body `{status: "approved"}`. Toast success. Row removed. The underlying assessment transitions from `unlock_requested` → `reopened` on the teacher's side, and the teacher can now enter grades again. |           |
| 17.6 | Reject action                     | Opens a reason dialog. On confirm: POST with `{status: "rejected", reason}`. Toast success. Row removed. The assessment returns to `submitted_locked` on the teacher's side (the teacher can attempt a new request with a better reason).                        |           |
| 17.7 | Data source                       | `GET /api/v1/gradebook/unlock-requests` (no status filter — backend returns pending + recently reviewed, frontend filters to pending only).                                                                                                                      |           |
| 17.8 | Count badge                       | The tab label shows **"Unlock Requests ({n})"** where n is the number of pending requests. Badge hidden when n = 0.                                                                                                                                              |           |

---

## 18. Refresh Button Behaviour

| #    | What to Check                   | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Click **Refresh** in the header | `refreshKey` state increments by 1, triggering the `fetchData` useEffect to re-run. All six API calls fire again in parallel. Loading skeleton does NOT re-appear — data is refreshed in place. |           |
| 18.2 | During refetch                  | `isLoading` is set to true, then false on completion. The page technically shows a LoadingSkeleton briefly. Verify in DevTools Network tab that six requests fire.                              |           |
| 18.3 | KPI cards re-animate            | Because the StatCard values re-render with possibly-new numbers, the number animation fires from the previous value to the new one.                                                             |           |
| 18.4 | Filters preserved               | Year group + Class filters in the Activity by Subject section are preserved across refresh (they are local state, not reset by fetchData).                                                      |           |

---

## 19. Arabic / RTL

| #     | What to Check                                       | Expected Result                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1  | Open the user profile menu and toggle to **Arabic** | URL changes from `/en/...` to `/ar/...`. `<html dir="rtl">`. All visible text becomes Arabic script.                                                                                                                                            |           |
| 19.2  | Verify header                                       | Title **"مراقبة التقييمات"**. Description **"نشاط التقييم على مستوى المدرسة، تقدم تصحيح المعلمين، الموافقات، وحالة الإعدادات."**. Action buttons: **"فتح قائمة الموافقات"** and **"تحديث"**.                                                    |           |
| 19.3  | KPI labels                                          | Six cards: **مجدولة**, **بانتظار التصحيح**, **متأخرة**, **مُسلَّمة**, **مُقفلة نهائياً**, **المعلمون النشطون**. All numeric values remain Western digits (0-9).                                                                                 |           |
| 19.4  | KPI tooltips in Arabic                              | Hovering a KPI card shows the Arabic translation body. Example (Active Teachers): **"عدد المعلمين المميزين الذين لديهم حالياً تخصيص تدريس واحد على الأقل (صف + مادة) في هذا العام الدراسي."**                                                   |           |
| 19.5  | Layout flips RTL                                    | Icons that used `me-` / `start-` / `end-` move to the mirrored side. The action buttons in the header appear on the left (visual start in RTL). The AlertTriangle icon on the Teachers Needing Attention header sits on the right of the label. |           |
| 19.6  | Teachers needing attention panel                    | Heading **"معلمون يحتاجون إلى متابعة"**. Empty state: **"جميع المعلمين منتظمون في تصحيح التقييمات. لا يوجد ما هو متأخر."** Column headers all translated.                                                                                       |           |
| 19.7  | Config health panel                                 | Heading **"حالة الإعدادات"**. Ready count format: **"{ready}/{total} جاهزة"**. Column tooltips translated.                                                                                                                                      |           |
| 19.8  | Activity by subject in Arabic                       | Heading **"النشاط حسب المادة"**. Filters: **"المرحلة الدراسية"** (placeholder) and **"الصف"**. Default values: **"كل المراحل"** and **"كل الصفوف"**. Column tooltips translated.                                                                |           |
| 19.9  | Missing-assessments pill in Arabic                  | Reads **"لا توجد تقييمات نشطة"**. Tooltip body: **"هذه المادة مُسندة للصف المحدد ولكن لم يتم إنشاء أي تقييم لها بعد. تابع مع المعلم."**                                                                                                         |           |
| 19.10 | Jump-to cards in Arabic                             | Section heading **"الانتقال إلى"**. Card titles and descriptions all translated without any fallback key leakage.                                                                                                                               |           |
| 19.11 | Numeric values in LTR wrappers                      | Class names like "2A" and percentage totals stay in LTR order even within the RTL layout.                                                                                                                                                       |           |
| 19.12 | Toggle back to **English**                          | URL returns to `/en/...`. Layout flips to LTR. Filters and any selected state in the Activity by Subject section are preserved.                                                                                                                 |           |

---

## 20. Role Gating — Verifying the Teacher View Does NOT Render

Because the same `/en/assessments` URL serves both variants, this section guards against regressions where an admin accidentally gets the teacher dashboard.

| #    | What to Check                                     | Expected Result                                                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Verify page heading                               | Reads **"Assessment Oversight"**, NOT **"Assessment Dashboard"**. (The latter is the teacher heading.)                                                                                                                                                                                                                          |           |
| 20.2 | Verify no teacher-specific sections render        | The following elements MUST be absent: (a) the **"My Teaching Allocations"** table, (b) the **"Click a row to manage assessments for that allocation"** helper text, (c) the **"My Configuration Status"** tabbed panel (Assessment Categories / Weights / Rubric Templates / Curriculum Standards tabs).                       |           |
| 20.3 | Verify leadership-only sections DO render         | Six KPI cards (not 4 summary cards), Teachers Needing Attention panel, Config Health panel, Activity by Subject with year/class filters, and the Jump-to row.                                                                                                                                                                   |           |
| 20.4 | No "No staff profile" toast                       | The admin has no `staff_profile` row. The legacy teacher dashboard eagerly called `/api/v1/gradebook/teaching-allocations` which 404s for admins and triggered a red toast. The leadership dashboard bypasses this call entirely — verify no red alert ever appears.                                                            |           |
| 20.5 | Role-detection logic reference                    | The page uses `useAuth()` to read `user.memberships[].roles[].role_key`, then checks `ADMIN_ROLES.some(r => roleKeys.includes(r))`. `ADMIN_ROLES = ['school_owner', 'school_principal', 'school_vice_principal', 'admin']`. If any match, `<LeadershipDashboard />` mounts; otherwise `<TeacherAssessmentsDashboard />` mounts. |           |
| 20.6 | Negative check — log out and log in as Sarah Daly | Navigate to `/en/assessments`. You should NOT see "Assessment Oversight" — you see "Assessment Dashboard" with the teacher view. Log back in as the admin.                                                                                                                                                                      |           |

---

## End of Spec

Once all rows above show Pass, the Leadership Assessment Oversight Dashboard, its six KPI cards with hover tooltips, the inline approvals queue, teachers-needing-attention panel, config health panel, activity-by-subject with year/class filtering and dim treatment, assessment configuration quick-access, jump-to row, the full Approval Queue page (config + unlock tabs with approve/reject flows), the Refresh behaviour, and both locale variants (EN + AR) are all verified from the admin perspective.
