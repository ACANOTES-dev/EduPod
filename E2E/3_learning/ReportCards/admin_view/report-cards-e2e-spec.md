# E2E Test Specification: Report Cards (Admin View)

> **Coverage:** This document covers **every page, button, form, modal, dialog, state transition, API call, and failure mode** in the Report Cards module as seen by an administrator (school_owner, school_principal, school_vice_principal, or admin role). It is the single source of truth for QC sign-off before tenant onboarding.
>
> **Pages documented here (12 unique routes):**
>
> 1. Report Cards Dashboard — `/en/report-cards`
> 2. Class Matrix — `/en/report-cards/{classId}`
> 3. Report Card Settings — `/en/report-cards/settings`
> 4. Generation Wizard — `/en/report-cards/generate`
> 5. Report Card Library — `/en/report-cards/library`
> 6. Report Card Analytics — `/en/report-cards/analytics`
> 7. Teacher Requests (list) — `/en/report-cards/requests`
> 8. Teacher Request Detail — `/en/report-cards/requests/{id}`
> 9. Report Comments Landing — `/en/report-comments`
> 10. Overall Comments Editor — `/en/report-comments/overall/{classId}`
> 11. Subject Comments Editor — `/en/report-comments/subject/{classId}/{subjectId}`
> 12. Retired redirect stubs — `/en/report-cards/approvals` + `/en/report-cards/bulk`
>
> **Role gating:** These URLs render the Admin variant when the signed-in user holds any of `school_owner`, `school_principal`, `school_vice_principal`, or `admin`. `school_owner` is an unrestricted role that bypasses every permission check via `PermissionCacheService.isOwner()`. Teacher-side behaviour lives in `teacher_view/report-cards-e2e-spec.md`.
>
> **Matching teacher spec:** `../teacher_view/report-cards-e2e-spec.md` — both specs should be run as a pair to cover the full role matrix.

**Base URL:** `https://nhqs.edupod.app` (never use `nurul-huda.edupod.app`)
**Prerequisite:** Logged in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`), who holds the **School Owner** role in tenant **Nurul Huda School (NHQS)**. After login, Yusuf lands on `/en/dashboard` (the admin dashboard, NOT `/en/dashboard/teacher`).
**Navigation path to start:** Click **Learning** in the top morph bar → click **Assessment** in the Learning sub-strip → click **Report Cards** in the Assessment sub-strip (fourth tab). Alternatively, navigate directly to `/en/report-cards`.

---

## How to use this document

Every row in every table below has three columns:

| # | What to Check | Expected Result | Pass/Fail |

- Work through the sections in order. Later sections assume the earlier ones have already put the tenant into a known state (e.g. a generated run in the library, an open comment window, etc.).
- The **Expected Result** column describes **exactly** what should happen. If the page shows a different state, write the difference in the Pass/Fail column and mark the row failed. Pixel-perfect styling is out of scope; what matters is that the described content, counts, status codes, navigation, and state transitions all match.
- Every row corresponds to a real piece of implemented behaviour. If you see something on screen that is NOT covered by this document, add a new row and mark it `UNDOCUMENTED`.
- Where a row references a specific API endpoint, verify the network tab in DevTools (Network → XHR) to confirm the call fires with the expected method, path, and response status.

---

## Table of Contents

1. [Logging in & landing](#1-logging-in--landing)
2. [Navigating to Report Cards](#2-navigating-to-report-cards)
3. [Report Cards Dashboard — Page Load](#3-report-cards-dashboard--page-load)
4. [Dashboard Header & Period Selector](#4-dashboard-header--period-selector)
5. [Dashboard Quick-Action Tiles (Admin)](#5-dashboard-quick-action-tiles-admin)
6. [Dashboard Live Run Status Panel](#6-dashboard-live-run-status-panel)
7. [Dashboard Analytics Snapshot Panel](#7-dashboard-analytics-snapshot-panel)
8. [Dashboard Classes-by-Year-Group Grid](#8-dashboard-classes-by-year-group-grid)
9. [Class Matrix Page — Navigation & Header](#9-class-matrix-page--navigation--header)
10. [Class Matrix — Period Filter & Display Toggle](#10-class-matrix--period-filter--display-toggle)
11. [Class Matrix — Matrix Table Structure](#11-class-matrix--matrix-table-structure)
12. [Class Matrix — Top-Rank Badges](#12-class-matrix--top-rank-badges)
13. [Class Matrix — Error & Empty States](#13-class-matrix--error--empty-states)
14. [Settings Page — Entry Point](#14-settings-page--entry-point)
15. [Settings — Display Defaults](#15-settings--display-defaults)
16. [Settings — Comment Gate](#16-settings--comment-gate)
17. [Settings — Personal Info Fields](#17-settings--personal-info-fields)
18. [Settings — Default Template](#18-settings--default-template)
19. [Settings — Grade Thresholds Link](#19-settings--grade-thresholds-link)
20. [Settings — Principal Details & Signature Upload](#20-settings--principal-details--signature-upload)
21. [Settings — Save Changes](#21-settings--save-changes)
22. [Generation Wizard — Entry Point & Permission Guard](#22-generation-wizard--entry-point--permission-guard)
23. [Generation Wizard — Step Indicator](#23-generation-wizard--step-indicator)
24. [Generation Wizard — Step 1: Scope](#24-generation-wizard--step-1-scope)
25. [Generation Wizard — Step 2: Period](#25-generation-wizard--step-2-period)
26. [Generation Wizard — Step 3: Template & Design](#26-generation-wizard--step-3-template--design)
27. [Generation Wizard — Step 4: Personal Info Fields](#27-generation-wizard--step-4-personal-info-fields)
28. [Generation Wizard — Step 5: Comment Gate Dry-Run](#28-generation-wizard--step-5-comment-gate-dry-run)
29. [Generation Wizard — Step 6: Review & Submit](#29-generation-wizard--step-6-review--submit)
30. [Generation Wizard — Running / Polling State](#30-generation-wizard--running--polling-state)
31. [Generation Wizard — Terminal Outcomes (Completed / Partial / Failed)](#31-generation-wizard--terminal-outcomes-completed--partial--failed)
32. [Generation Wizard — Teacher Request Pre-Fill Handoff](#32-generation-wizard--teacher-request-pre-fill-handoff)
33. [Library Page — Load & View Toggles](#33-library-page--load--view-toggles)
34. [Library — By Run View](#34-library--by-run-view)
35. [Library — By Year Group View](#35-library--by-year-group-view)
36. [Library — By Class View](#36-library--by-class-view)
37. [Library — Row-Level Actions (Download / Publish / Unpublish / Delete)](#37-library--row-level-actions-download--publish--unpublish--delete)
38. [Library — Selection & Sticky Action Bar](#38-library--selection--sticky-action-bar)
39. [Library — Bundle Downloads](#39-library--bundle-downloads)
40. [Library — Delete Confirmation Modal](#40-library--delete-confirmation-modal)
41. [Library — Unpublish Confirmation Modal](#41-library--unpublish-confirmation-modal)
42. [Library — PDF Presigned URL Contract](#42-library--pdf-presigned-url-contract)
43. [Analytics Page — Load & Period Selector](#43-analytics-page--load--period-selector)
44. [Analytics — Summary Cards](#44-analytics--summary-cards)
45. [Analytics — Class Comparison Chart](#45-analytics--class-comparison-chart)
46. [Analytics — Per-Class Generation Progress](#46-analytics--per-class-generation-progress)
47. [Analytics — Term-Over-Term Trends (Planned)](#47-analytics--term-over-term-trends-planned)
48. [Teacher Requests — List Page (Admin)](#48-teacher-requests--list-page-admin)
49. [Teacher Requests — Pending Tab](#49-teacher-requests--pending-tab)
50. [Teacher Requests — All Tab](#50-teacher-requests--all-tab)
51. [Teacher Request Detail — Load](#51-teacher-request-detail--load)
52. [Teacher Request Detail — Approve & Open](#52-teacher-request-detail--approve--open)
53. [Teacher Request Detail — Auto-Approve & Execute](#53-teacher-request-detail--auto-approve--execute)
54. [Teacher Request Detail — Reject Flow](#54-teacher-request-detail--reject-flow)
55. [Report Comments Landing — Admin Load](#55-report-comments-landing--admin-load)
56. [Report Comments — Window Banner (Admin)](#56-report-comments--window-banner-admin)
57. [Open Window Modal — Academic Period](#57-open-window-modal--academic-period)
58. [Open Window Modal — Opens At / Closes At](#58-open-window-modal--opens-at--closes-at)
59. [Open Window Modal — Instructions](#59-open-window-modal--instructions)
60. [Open Window Modal — Homeroom Teacher Picker](#60-open-window-modal--homeroom-teacher-picker)
61. [Open Window Modal — Submit](#61-open-window-modal--submit)
62. [Open Window Modal — Pre-Fill From Approved Request](#62-open-window-modal--pre-fill-from-approved-request)
63. [Extend Window Modal](#63-extend-window-modal)
64. [Close Window Confirm Dialog](#64-close-window-confirm-dialog)
65. [Reopen Window (Admin)](#65-reopen-window-admin)
66. [Overall Comments Editor — Admin Load](#66-overall-comments-editor--admin-load)
67. [Overall Comments Editor — Write, Autosave, Finalise](#67-overall-comments-editor--write-autosave-finalise)
68. [Overall Comments Editor — Unfinalise, Filter, Closed-Window State](#68-overall-comments-editor--unfinalise-filter-closed-window-state)
69. [Subject Comments Editor — Admin Load](#69-subject-comments-editor--admin-load)
70. [Subject Comments Editor — AI Draft (Per Row)](#70-subject-comments-editor--ai-draft-per-row)
71. [Subject Comments Editor — AI Draft All Empty (Bulk)](#71-subject-comments-editor--ai-draft-all-empty-bulk)
72. [Subject Comments Editor — Finalise All Drafts (Bulk)](#72-subject-comments-editor--finalise-all-drafts-bulk)
73. [Subject Comments Editor — Row-Level Actions](#73-subject-comments-editor--row-level-actions)
74. [Retired Redirect Stubs](#74-retired-redirect-stubs)
75. [Arabic / RTL](#75-arabic--rtl)
76. [Role Gating — What Admins Can Do That Teachers Cannot](#76-role-gating--what-admins-can-do-that-teachers-cannot)
77. [Console & Network Health](#77-console--network-health)
78. [Backend Endpoint Map (Reference)](#78-backend-endpoint-map-reference)

---

## 1. Logging in & landing

| #   | What to Check                                                       | Expected Result                                                                                                                                                                                                                         | Pass/Fail |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | Open `https://nhqs.edupod.app/en/login` in a fresh incognito window | Login form shows **"NHQS"** brand header, **"Log in"** heading, **"Sign in to your school account"** subtitle, Email textbox, Password textbox with a show/hide eye icon button, **Log in** button, and **Forgot your password?** link. |           |
| 1.2 | Enter `owner@nhqs.test` / `Password123!` and click **Log in**       | Browser navigates to `/en/dashboard` (NOT `/en/dashboard/teacher`). A red 401 on `/api/v1/auth/refresh` is normal BEFORE login and should NOT appear after.                                                                             |           |
| 1.3 | Inspect the top-right profile button                                | Avatar reads **YR**, name line **Yusuf Rahman**, role line **School Owner**.                                                                                                                                                            |           |
| 1.4 | Inspect the morph bar hubs                                          | Visible: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Finance**, **Reports**, **Regulatory**, **Settings** (9 hubs). A Teacher would only see 6.                                                                |           |
| 1.5 | Admin dashboard greeting                                            | Tenant-centric greeting (e.g. **"Good evening, Yusuf"** with the date + school name subtitle). NOT the teacher-flavoured "Here's your day at a glance."                                                                                 |           |

---

## 2. Navigating to Report Cards

| #   | What to Check                                             | Expected Result                                                                                                                                                                                                   | Pass/Fail |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Click **Learning** in the morph bar                       | Browser navigates to `/en/classes` (admin's first accessible basePath in the Learning hub). A Learning sub-strip appears with 5 links: **Classes**, **Curriculum**, **Assessment**, **Homework**, **Attendance**. |           |
| 2.2 | Click **Assessment** in the Learning sub-strip            | Browser navigates to `/en/assessments`. A secondary Assessment sub-strip appears below the first with 4 tabs: **Dashboard**, **Gradebook**, **Report Cards**, **Analytics**. "Dashboard" is active.               |           |
| 2.3 | Click **Report Cards** in the Assessment sub-strip        | Browser navigates to `/en/report-cards`. The **Report Cards** tab is highlighted as active.                                                                                                                       |           |
| 2.4 | Alternative: type `/en/report-cards` into the URL bar     | Same destination. The sub-strip auto-renders with **Report Cards** active because the URL matches.                                                                                                                |           |
| 2.5 | Alternative: refresh the page while on `/en/report-cards` | Page reloads fully — no infinite redirect, no loss of sub-strip state, no "morph bar flash". The morph bar and both sub-strips stay visually stable.                                                              |           |

---

## 3. Report Cards Dashboard — Page Load

**URL:** `/en/report-cards`

On first mount, the page fires five parallel API calls plus a sixth that polls:

| #   | What to Check                         | Expected Result                                                                                                                                                                                                                                                                          | Pass/Fail |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Network tab — initial calls           | `GET /api/v1/academic-periods?pageSize=50` (200), `GET /api/v1/year-groups?pageSize=100` (200), `GET /api/v1/classes?pageSize=100` (200), `GET /api/v1/report-cards/library?page=1&pageSize=1` (200), `GET /api/v1/report-card-teacher-requests?status=pending&page=1&pageSize=1` (200). |           |
| 3.2 | Network tab — period-scoped analytics | Once the default period is resolved (first active period, else the first period in the list), `GET /api/v1/report-cards/analytics/dashboard?academic_period_id={id}` fires (200).                                                                                                        |           |
| 3.3 | Network tab — run polling             | `GET /api/v1/report-cards/generation-runs?page=1&pageSize=5` fires once immediately. If the first response contains any run whose status is `queued` or `processing`, the same call repeats every 5 seconds until the run reaches a terminal state.                                      |           |
| 3.4 | Loading skeleton — classes grid       | While `classesLoading === true`, two skeleton year-group blocks render, each with a 3-column class card skeleton row.                                                                                                                                                                    |           |
| 3.5 | Loading skeleton — analytics panel    | While `analyticsLoading === true`, the analytics snapshot panel shows five pulsing rounded bars in a 2/3-column grid.                                                                                                                                                                    |           |
| 3.6 | No infinite skeletons                 | After the calls complete, no skeletons remain. Header, period selector, quick action tiles, live run panel, analytics snapshot, and classes grid are all populated with real content.                                                                                                    |           |
| 3.7 | Browser console                       | No uncaught errors. Expected: nothing red. `[ReportCardsDashboard.*]` console.error lines only appear when an API call genuinely fails.                                                                                                                                                  |           |

---

## 4. Dashboard Header & Period Selector

| #   | What to Check                          | Expected Result                                                                                                                                                                                                                                  | Pass/Fail |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1 | Page `<h1>` heading                    | Reads **"Report Cards"**. Large, semibold, `text-2xl`.                                                                                                                                                                                           |           |
| 4.2 | Description under heading              | Shows the currently selected period's display name (e.g. **"S1"** or **"Full Year"** if one of the full-year sentinels is chosen). On first load, equals the default period's name.                                                              |           |
| 4.3 | Period selector — default value        | Dropdown trigger shows the first period whose `status === 'active'`, or the first period in the list if none are active. For NHQS: **S1**.                                                                                                       |           |
| 4.4 | Period selector — open dropdown        | Clicking the trigger opens a listbox. Item order: **"Full Year"** (sentinel value `full_year`) at the top, followed by every period in `/api/v1/academic-periods?pageSize=50` in API order. NHQS shows: **Full Year**, **S1**, **S2**.           |           |
| 4.5 | Period selector — choose **S2**        | Listbox closes, trigger now displays **S2**, description under the heading updates to **"S2"**, and the analytics snapshot re-fetches `GET /api/v1/report-cards/analytics/dashboard?academic_period_id={S2 id}`. Classes grid does NOT re-fetch. |           |
| 4.6 | Period selector — choose **Full Year** | Trigger shows **"Full Year"**, description updates to **"Full Year"**, analytics endpoint is called with the literal `academic_period_id=full_year`. Empty S2 data is expected until a full-year window or run exists.                           |           |
| 4.7 | Settings cog button (admin-only)       | An outline icon button with a gear glyph sits to the right of the period selector. On click, navigates to `/en/report-cards/settings`. A Teacher would NOT see this button at all (hidden via `isAdmin` check).                                  |           |
| 4.8 | Settings button — aria-label           | `aria-label="Settings"` (exact text localised). Accessible to screen readers.                                                                                                                                                                    |           |

---

## 5. Dashboard Quick-Action Tiles (Admin)

Four tiles render in a grid: 1 column mobile, 2 at `sm:`, 4 at `lg:`. Admin-only tiles use `isAdmin` gating — if a teacher hit the same URL they would see only tiles 5.2 and 5.3.

| #   | Tile                      | Icon          | Accent gradient         | API-driven metadata                                                                                                                                         | On click                                 | Pass/Fail |
| --- | ------------------------- | ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- |
| 5.1 | **Generate report cards** | Sparkles      | violet-400 → violet-600 | Static description "Launch a new generation run…"                                                                                                           | Navigates to `/en/report-cards/generate` |           |
| 5.2 | **Write comments**        | MessageSquare | amber-400 → amber-600   | Static description "Open the comment editor…"                                                                                                               | Navigates to `/en/report-comments`       |           |
| 5.3 | **Library**               | Library       | sky-400 → sky-600       | Description reads `"{count} documents"` where count comes from `library?page=1&pageSize=1`'s `meta.total`. While loading it reads "Loading…".               | Navigates to `/en/report-cards/library`  |           |
| 5.4 | **Teacher requests**      | Inbox         | rose-400 → rose-600     | Description reads **"{n} pending requests"** when `n > 0` else **"All clear"**. A rose-600 numeric badge renders in the top-right of the tile when `n > 0`. | Navigates to `/en/report-cards/requests` |           |

### 5.5 Tile affordances

| #     | What to Check           | Expected Result                                                                                                                                     | Pass/Fail |
| ----- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.5.1 | Hover state on any tile | Border shifts to primary-300, shadow grows, tile lifts by 2px (`hover:-translate-y-0.5`). Cursor becomes a pointer.                                 |           |
| 5.5.2 | Focus state             | Keyboard Tab to a tile: a primary-500 focus ring appears (`focus-visible:ring-2`).                                                                  |           |
| 5.5.3 | Activation keybindings  | Pressing Enter OR Space on a focused tile triggers the same `onClick` as a mouse click.                                                             |           |
| 5.5.4 | Accent stripe           | A 1px gradient bar sits across the top of the tile — violet / amber / sky / rose depending on the tile.                                             |           |
| 5.5.5 | Icon bubble             | Each tile has a 40×40px rounded square icon bubble in the corresponding tone (e.g. `bg-violet-100 text-violet-700` for Generate).                   |           |
| 5.5.6 | Action label            | Bottom of the tile shows a small primary-600 link-looking label with an arrow (`Start wizard`, `Open editor`, `Browse library`, `Review requests`). |           |

---

## 6. Dashboard Live Run Status Panel

Left side of a two-column split (admin-only). Polls every 5 seconds while a `queued` or `processing` run exists.

### 6.1 Empty state (no active run)

| #     | What to Check | Expected Result                                                                                | Pass/Fail |
| ----- | ------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Panel frame   | Dashed border, `border-border` tinted, `bg-surface-secondary/40` background, min height 11rem. |           |
| 6.1.2 | Heading       | **"Live generation run"**.                                                                     |           |
| 6.1.3 | Empty text    | **"No runs in progress. Kick off a new one when you're ready."**                               |           |
| 6.1.4 | CTA button    | Ghost button **"Start a new run →"** — on click, navigates to `/en/report-cards/generate`.     |           |

### 6.2 Populated state (active run)

| #     | What to Check     | Expected Result                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1 | Panel frame       | Solid border, `bg-surface`, min height 11rem, shadow-sm.                                                                                                                                                                                            |           |
| 6.2.2 | Header row        | Left: **"Live generation run"** heading. Right: secondary Badge showing the localised status (one of `queued`, `processing`, `completed`, `failed`, `cancelled`).                                                                                   |           |
| 6.2.3 | Progress line     | Below the heading: **"{done} of {total} students complete"**.                                                                                                                                                                                       |           |
| 6.2.4 | Progress bar      | Primary-400 → primary-600 gradient filling `pct = round(done/total * 100)`. Height 2px, rounded-full, animated `transition-all`.                                                                                                                    |           |
| 6.2.5 | Percentage + link | Below the bar: a bold `{pct}%` on the left and a primary-coloured link **"View library →"** on the right that navigates to `/en/report-cards/library`.                                                                                              |           |
| 6.2.6 | Polling behaviour | Every 5 seconds, the panel re-fetches `/api/v1/report-cards/generation-runs?page=1&pageSize=5` and updates the snapshot. When status moves to a terminal value (completed/failed/cancelled), polling stops and the panel reflects the final counts. |           |

---

## 7. Dashboard Analytics Snapshot Panel

Right side of the same two-column split (admin-only). Reads from `/api/v1/report-cards/analytics/dashboard`.

### 7.1 Header

| #     | What to Check                 | Expected Result                                                                                                                                                                                                         | Pass/Fail |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Heading                       | **"Analytics snapshot"**.                                                                                                                                                                                               |           |
| 7.1.2 | **See full analytics →** link | Primary-coloured text link on the right of the header. On click, navigates to `/en/report-cards/analytics?academic_period_id={current period}` (or `?academic_period_id=full_year` when the dashboard is on Full Year). |           |

### 7.2 Card grid

Five tone-coded cards in a 2-column (mobile) / 3-column (sm+) grid. Loading shows 5 pulse skeletons.

| #     | Card label           | Value format                                                                                                        | Pass/Fail |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | **Total**            | Integer count of report cards in the selected period scope (`data.total`). Falls back to `0`.                       |           |
| 7.2.2 | **Published**        | Integer count of published report cards.                                                                            |           |
| 7.2.3 | **Completion**       | Percentage with one decimal, e.g. **"0.5%"**, from `data.completion_rate`.                                          |           |
| 7.2.4 | **Overall comments** | Fraction string **"{finalised} / {total}"** from `data.overall_comments_finalised` + `data.overall_comments_total`. |           |
| 7.2.5 | **Subject comments** | Fraction string **"{finalised} / {total}"** from `data.subject_comments_finalised` + `data.subject_comments_total`. |           |

### 7.3 Empty state

| #     | What to Check                                    | Expected Result                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------- |
| 7.3.1 | Analytics endpoint returns null / fails silently | The card grid is replaced with a single centred line: **"No analytics available"** (tone `text-text-tertiary`). |           |

---

## 8. Dashboard Classes-by-Year-Group Grid

Below the two-column split, a full-width section titled **"Classes by year group"** with the helper text **"Pick a class to open its report card matrix."**.

### 8.1 Section structure

| #     | What to Check                              | Expected Result                                                                                                                                                                                                                                                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Heading row                                | Left: **"Classes by year group"** (h2, `text-lg font-semibold`). Right: small grey hint **"Pick a class to open its report card matrix."**.                                                                                                                                                                                                               |           |
| 8.1.2 | Year group sections                        | One `<section>` per year group that contains at least one class with `_count.class_enrolments > 0`. For NHQS expect **Kindergarten** (1 class: K1A), **1st class** (1A, 1B), **2nd class** (2A, 2B), **3rd Class** (3A, 3B), **4th Class** (4A, 4B), **5th Class** (5A, 5B), **6th Class** (6A, 6B). J1A / K1B / SF1A have 0 enrolments and are excluded. |           |
| 8.1.3 | Section header                             | Each year-group section has a primary-50 circular icon bubble (40×40) with a GraduationCap glyph, the year-group name as an h3, and a subtitle **"{n} classes"** or **"{n} class"** (singular).                                                                                                                                                           |           |
| 8.1.4 | Sort order of sections                     | Ascending by `year_group.display_order`, then by name. Sections without a year group fall to the bottom with the localised "Unassigned" label.                                                                                                                                                                                                            |           |
| 8.1.5 | Sort order of class cards within a section | Alphabetical by `class.name` (case-insensitive).                                                                                                                                                                                                                                                                                                          |           |

### 8.2 Class cards

| #     | What to Check      | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | Card layout        | Rounded-2xl, `border-border`, `bg-surface`, padding 5, min height 8rem. Top stripe: 1px primary-400 → primary-600 gradient.                                                                                    |           |
| 8.2.2 | Card content       | Row 1: large class name (e.g. **"2A"**, h4, `text-2xl font-bold`) + a FileText icon in the top-right tinted `text-primary-500/70`. Row 2: enrolment count **"25 students"** (singular "1 student" at count 1). |           |
| 8.2.3 | Hover affordance   | Border lifts to primary-300, shadow grows, icon darkens to primary-600.                                                                                                                                        |           |
| 8.2.4 | Click a class card | Navigates to `/en/report-cards/{classId}` where `classId` is the full UUID of the clicked class.                                                                                                               |           |
| 8.2.5 | Keyboard nav       | Tab focuses each card in visual order. Enter / Space triggers the same navigation.                                                                                                                             |           |

### 8.3 Empty / error states

| #     | What to Check            | Expected Result                                                                                                                                          | Pass/Fail |
| ----- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.3.1 | No classes in the tenant | An `<EmptyState>` card renders with the `FileText` icon and the localised `noClasses` title. No sections render.                                         |           |
| 8.3.2 | Initial fetch fails      | `[ReportCardsDashboard.loadInitial]` logs the error; the grid falls back to empty (no sections). A skeleton flashes first, then the empty state appears. |           |

---

## 9. Class Matrix Page — Navigation & Header

**URL:** `/en/report-cards/{classId}` — example `/en/report-cards/76ce55f7-d722-4927-8038-fa304c9c4e05` for 2A.

| #   | What to Check                                           | Expected Result                                                                                                                                                                                                                                     | Pass/Fail |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Navigate from the dashboard by clicking the **2A** card | Browser URL becomes `/en/report-cards/{2A id}`. Network tab: `GET /api/v1/academic-periods?pageSize=50` fires once for period options, and `GET /api/v1/report-cards/classes/{classId}/matrix?academic_period_id=all` fires for the matrix payload. |           |
| 9.2 | Page `<h1>`                                             | After load, displays the class name (e.g. **"2A"**). Before load, shows the translated fallback **"Report Cards"**.                                                                                                                                 |           |
| 9.3 | Subtitle under the heading                              | Year group name from the matrix response (e.g. **"2nd class"**). Empty until loaded.                                                                                                                                                                |           |
| 9.4 | **Back to Report Cards** button (ghost, ArrowLeft icon) | Located in the header actions. On click, navigates back to `/en/report-cards`. Does NOT rely on browser history — it is an explicit push.                                                                                                           |           |
| 9.5 | **Library** outline button (Library icon)               | Located next to the Back button. On click, navigates to `/en/report-cards/library`.                                                                                                                                                                 |           |

---

## 10. Class Matrix — Period Filter & Display Toggle

A toolbar sits below the header: period selector on the left, Grade/Score tab toggle on the right.

### 10.1 Period selector

| #      | What to Check                | Expected Result                                                                                                                                                       | Pass/Fail |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Default value                | **"All periods"** (the literal sentinel `all`). The matrix endpoint receives `academic_period_id=all` and returns cross-period aggregates.                            |           |
| 10.1.2 | Open the dropdown            | First item: **"All periods"**. Remaining items: every period from `/api/v1/academic-periods?pageSize=50` in API order. NHQS shows **All periods**, **S1**, **S2**.    |           |
| 10.1.3 | Select **S1**                | Trigger updates to **"S1"**. Network: `GET /api/v1/report-cards/classes/{classId}/matrix?academic_period_id={S1 id}` fires. Matrix cells re-render with S1-only data. |           |
| 10.1.4 | Select **All periods** again | Cells re-render with cross-period aggregates.                                                                                                                         |           |

### 10.2 Display toggle (Grade vs Score)

| #      | What to Check         | Expected Result                                                                                                                                                                           | Pass/Fail |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Initial mode          | **Grade** tab is active; every cell shows the letter grade (e.g. `A`, `B`, `C`, `D`, `F`) or an em-dash when no grade is available.                                                       |           |
| 10.2.2 | Click **Score**       | Mode switches to Score. Every cell re-formats as a percentage with 1 decimal (e.g. **"72.0%"**). Cells without a score show **"—"**. The Overall column formats identically.              |           |
| 10.2.3 | Click **Grade** again | Mode switches back. No API call fires — the toggle is purely client-side formatting over the same cached matrix payload.                                                                  |           |
| 10.2.4 | Visual affordance     | The active tab has `bg-primary-600 text-white`; the inactive tab is `text-text-secondary` hover `text-text-primary`. `role="tab"` + `aria-selected` are set correctly for screen readers. |           |

---

## 11. Class Matrix — Matrix Table Structure

| #      | What to Check        | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Header row           | First column sticky-start with `bg-primary-900` and reads **"Student"**. Middle columns (one per subject): `bg-primary-700`, white text, centred subject names. Last column: `bg-primary-800`, reads **"Overall"**. |           |
| 11.1.2 | Student column width | Fixed 180px. Long names truncate with ellipsis; the full name shows as a `title` tooltip on hover.                                                                                                                  |           |
| 11.1.3 | Subject column width | Fixed 110px each. Horizontal scroll appears when the total width exceeds the viewport.                                                                                                                              |           |
| 11.1.4 | Row striping         | Even rows: `bg-surface`. Odd rows: `bg-surface-secondary`. Hover: `bg-primary-50`.                                                                                                                                  |           |
| 11.1.5 | Student cell         | Left-aligned, sticky-start, 180px. Shows **"{first_name} {last_name}"** in medium weight, truncated.                                                                                                                |           |
| 11.1.6 | Grade cells          | Centre-aligned, forced `dir="ltr"`. Each value is wrapped in a small rounded `bg-surface-secondary` pill. Empty cells show **"—"**.                                                                                 |           |
| 11.1.7 | Overall column cells | Left border `border-s-2 border-s-primary-100`, background `bg-primary-50/30`, value pill `bg-primary-100 text-primary-900 font-bold`.                                                                               |           |
| 11.1.8 | Row count            | Exactly `students.length` rows. For 2A (25 active enrolments): **25** rows.                                                                                                                                         |           |
| 11.1.9 | Subject count        | Exactly `subjects.length` columns between Student and Overall. Order as returned by the backend (alphabetised by the `ReportCardsQueriesService.getClassMatrix` query).                                             |           |

---

## 12. Class Matrix — Top-Rank Badges

| #    | What to Check                                                        | Expected Result                                                                                                                                                                                                                                                                                                 | Pass/Fail |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Students ranked 1, 2, or 3 by `overall.rank_position`                | An amber pill renders beside the student name inside the student cell. It contains a Medal icon and the localised **"Top {rank}"** label (e.g. **"Top 1"**). Pill styling: `rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 ring-1 ring-amber-300`.                                            |           |
| 12.2 | Students ranked 4+ or without a rank                                 | No badge. No amber pill.                                                                                                                                                                                                                                                                                        |           |
| 12.3 | `aria-label` on the badge                                            | Reads **"Top {rank}"** (localised).                                                                                                                                                                                                                                                                             |           |
| 12.4 | Badge visibility respects the tenant's `show_top_rank_badge` setting | This is a display toggle on the settings page. When disabled, the backend still returns `rank_position` but the matrix must not render the pill. (Implementation note: the current class-matrix page renders the badge unconditionally — flag as a regression if the setting is OFF and the badge still shows.) |           |

---

## 13. Class Matrix — Error & Empty States

| #    | What to Check                                          | Expected Result                                                                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Navigate to `/en/report-cards/{random-uuid}`           | Matrix call returns 404 with `code: 'CLASS_NOT_FOUND'`. The page shows an EmptyState with an ArrowLeft icon, the **"Class not found"** title, and a **"Back to Report Cards"** action button. |           |
| 13.2 | Class exists but has 0 students                        | EmptyState with a Medal icon and the **"No students"** title.                                                                                                                                 |           |
| 13.3 | Class exists with students but 0 subjects              | EmptyState with a Medal icon and the **"No grades yet"** title.                                                                                                                               |           |
| 13.4 | Generic fetch failure (500, 401 refresh loop, timeout) | EmptyState with ArrowLeft icon and the localised **"Failed to load"** title. No matrix table renders.                                                                                         |           |
| 13.5 | Loading skeleton                                       | While `isLoading === true`, 6 pulsing 10-height bars render in place of the table.                                                                                                            |           |

---

## 14. Settings Page — Entry Point

**URL:** `/en/report-cards/settings`

| #    | What to Check                                    | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Navigate to `/en/report-cards/settings` directly | Network: `GET /api/v1/report-card-tenant-settings` (200) and `GET /api/v1/report-cards/templates/content-scopes` (200). While loading, 4 pulsing card skeletons render.                  |           |
| 14.2 | Page heading                                     | **"Report Card Settings"** (localised). Subtitle explains the purpose.                                                                                                                   |           |
| 14.3 | **Back to Report Cards** button                  | Top-right ghost button. On click, navigates to `/en/report-cards`.                                                                                                                       |           |
| 14.4 | Permission banner                                | For an admin (`canManage === true`), no banner shows. For a teacher (who has `report_cards.view` but not `manage`), a grey banner renders: **"You're viewing this in read-only mode."**. |           |
| 14.5 | Form wrapper                                     | Form contains 6 sections stacked vertically: Display defaults, Comment gate, Default personal info fields, Default template, Grade thresholds link, Principal details.                   |           |

---

## 15. Settings — Display Defaults

| #    | What to Check                       | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Section title                       | **"Display defaults"** (h2, semibold).                                                                                                                                                                   |           |
| 15.2 | **Matrix display mode** radio group | Label **"Matrix display mode"**. Two radio options in horizontal layout: **"Grade letters"** (value `grade`, default) and **"Numeric scores"** (value `score`). Each option is a rounded-xl border pill. |           |
| 15.3 | Click **Numeric scores**            | Radio selection switches; no API call yet (form changes are batched into Save).                                                                                                                          |           |
| 15.4 | Click **Grade letters**             | Selection switches back.                                                                                                                                                                                 |           |
| 15.5 | **Show top-rank badge** toggle row  | Label + hint on the left, Switch on the right. Toggling flips `show_top_rank_badge` locally. When enabled, the class matrix shows the Top 1/2/3 amber pill beside student names.                         |           |

---

## 16. Settings — Comment Gate

| #    | What to Check                         | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Section title                         | **"Comment gate"**.                                                                                                                                                                                         |           |
| 16.2 | **Require finalised comments** switch | ToggleRow with label + hint. When ON, the generation wizard's Step 5 dry-run blocks submission if any subject or overall comment in scope is missing or unfinalised. When OFF, the gate always passes.      |           |
| 16.3 | **Allow admin force-generate** switch | When ON, even with a blocked dry-run an admin can tick the Force-generate checkbox in Step 5 and proceed. When OFF, the dry-run's block cannot be overridden and the Next button stays disabled.            |           |
| 16.4 | Interaction between the two toggles   | If Require finalised is OFF, Allow force-generate is irrelevant because the gate never blocks. If Require finalised is ON and Allow force-generate is OFF, the admin has no way to bypass missing comments. |           |

---

## 17. Settings — Personal Info Fields

This section configures the _default_ personal info fields that pre-populate Step 4 of the generation wizard.

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                       | Pass/Fail |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Section title + hint                | **"Default personal info fields"** (h2) with a hint explaining these are the fields pre-ticked when the generation wizard launches.                                                                                                   |           |
| 17.2 | Four field sections                 | Sections: **Identity** (full_name, student_number, sex, nationality, national_id), **Dates** (date_of_birth, admission_date), **Academic** (year_group, class_name, homeroom_teacher), **Media** (photo). That's 11 checkboxes total. |           |
| 17.3 | Default selection on a fresh tenant | By default, `full_name` and `student_number` are ticked. Others are user-configurable.                                                                                                                                                |           |
| 17.4 | Toggle a checkbox                   | Clicking the label or the checkbox toggles the item in `default_personal_info_fields`. Unsaved changes are not persisted until Save.                                                                                                  |           |
| 17.5 | Read-only mode (teacher)            | Checkboxes are disabled. Clicking a row has no effect.                                                                                                                                                                                |           |

---

## 18. Settings — Default Template

| #    | What to Check        | Expected Result                                                                                                                                                                                                                                                                                                                                                           | Pass/Fail                                                                                                                       |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --- |
| 18.1 | Section title + hint | **"Default template"** with a one-liner hint.                                                                                                                                                                                                                                                                                                                             |                                                                                                                                 |
| 18.2 | Dropdown open        | First item: **"None"** (sentinel `none`). Remaining items: every `(design, locale)` pair from `/api/v1/report-cards/templates/content-scopes` across the available (non-coming-soon) scopes. Labels follow the format **"{design.name} ({locale.upper})"** — e.g. `Editorial Academic (EN)`, `Editorial Academic (AR)`, `Modern Editorial (EN)`, `Modern Editorial (AR)`. |                                                                                                                                 |
| 18.3 | No duplicates        | Dedup is enforced by a React-side `Set` keyed on `{design_key}                                                                                                                                                                                                                                                                                                            | {locale}`. Even if the backend returns a design twice (e.g. during a migration), the dropdown shows exactly one entry per pair. |     |
| 18.4 | Selecting a template | Dropdown closes; the value is stored as the template_id UUID locally. Saved on the next form submit.                                                                                                                                                                                                                                                                      |                                                                                                                                 |
| 18.5 | Selecting **None**   | Stores `null`. When saved, the API receives `default_template_id: null`.                                                                                                                                                                                                                                                                                                  |                                                                                                                                 |

---

## 19. Settings — Grade Thresholds Link

| #    | What to Check   | Expected Result                                                                                                                                                                                                                        | Pass/Fail |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Section content | A short section titled **"Grade thresholds are managed on a dedicated page."** containing a single primary-coloured link **"Manage grade thresholds →"** that navigates to `/en/settings/grade-thresholds`.                            |           |
| 19.2 | Link behaviour  | Opens in the SAME tab (no `target="_blank"`). Pressing browser Back returns to the Report Card Settings page with the form state preserved in the React tree (but React state is lost on navigation, so any unsaved changes ARE lost). |           |

---

## 20. Settings — Principal Details & Signature Upload

The final form section captures the signature that PDFs render in their footer.

### 20.1 Principal name

| #      | What to Check                      | Expected Result                                                                                       | Pass/Fail |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 20.1.1 | Label                              | **"Principal name"**.                                                                                 |           |
| 20.1.2 | Text input                         | Placeholder with a sample name. Trimmed on submit via `setValueAs`; empty/whitespace saves as `null`. |           |
| 20.1.3 | Typing sends no immediate API call | Form state only — saved on the next form submit.                                                      |           |

### 20.2 Signature upload (`SignatureUpload` component)

| #      | What to Check                               | Expected Result                                                                                                                                                                                                                                                                                                                                   | Pass/Fail |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.2.1 | Initial state (no signature)                | The preview area shows a dashed border with an Image icon and the text **"No signature"**. Below, a single **Upload signature** outline button (ArrowUpFromLine icon).                                                                                                                                                                            |           |
| 20.2.2 | Click **Upload signature**                  | A hidden `<input type="file" accept="image/png,image/jpeg,image/webp">` is triggered. The OS file picker opens.                                                                                                                                                                                                                                   |           |
| 20.2.3 | Pick a PNG ≤ 2 MB                           | The file is read client-side via `FileReader` to render an instant preview, then POSTed as `multipart/form-data` to `/api/v1/report-card-tenant-settings/principal-signature` with the `file` field and (optionally) the `principal_name` field. On 200/201, a success toast **"Signature uploaded"** appears and `hasSignature` flips to `true`. |           |
| 20.2.4 | Pick a file with disallowed type (e.g. GIF) | The client validates against `ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']` and shows an error toast **"File type not supported"**. No network call fires.                                                                                                                                                                          |           |
| 20.2.5 | Pick a file > 2 MB                          | The client validates against `MAX_FILE_SIZE = 2 * 1024 * 1024`. An error toast **"File too large"** renders. No network call fires.                                                                                                                                                                                                               |           |
| 20.2.6 | Upload fails server-side                    | The toast shows the server's `message` string if present, otherwise **"Signature upload failed"**. The preview reverts to empty.                                                                                                                                                                                                                  |           |
| 20.2.7 | After successful upload                     | A second button **"Remove signature"** appears alongside **"Replace signature"** (which replaces the Upload button). The preview area shows the newly uploaded image (via the client-side FileReader data URL) or the backend's signed URL if re-fetched.                                                                                         |           |
| 20.2.8 | Click **Remove signature**                  | `DELETE /api/v1/report-card-tenant-settings/principal-signature` fires. On 200, toast **"Signature removed"**, `hasSignature` flips to `false`, and the preview reverts to the dashed box. On failure, toast **"Signature removal failed"** and state stays unchanged.                                                                            |           |

---

## 21. Settings — Save Changes

| #    | What to Check                  | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | **Save changes** button        | Primary button at the bottom-right of the form. Only visible to users with `canManage === true`. Label flips to **"Saving…"** while the request is in flight.                                     |           |
| 21.2 | Successful save                | `PATCH /api/v1/report-card-tenant-settings` with the assembled DTO. Response 200. Toast **"Settings saved"**. Form state is reset to the server's response payload so the dirty indicator clears. |           |
| 21.3 | Validation failure (Zod)       | Inline error messages appear under affected fields. Save button is NOT disabled pre-submit; the form prevents submission only once validation fails on click.                                     |           |
| 21.4 | Server-side validation failure | Toast **"Save failed"** with the server's `message` string if provided.                                                                                                                           |           |
| 21.5 | Teacher read-only mode         | The Save button is not rendered at all. All inputs are `disabled={true}`.                                                                                                                         |           |

---

## 22. Generation Wizard — Entry Point & Permission Guard

**URL:** `/en/report-cards/generate`

| #    | What to Check                                                                                | Expected Result                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Click the **Generate report cards** tile OR navigate to `/en/report-cards/generate` directly | URL becomes `/en/report-cards/generate`. Network: `GET /api/v1/report-card-tenant-settings` (200) to pre-fill the default personal info fields.                                                                                                       |           |
| 22.2 | Page heading                                                                                 | **"Generate Report Cards"** with the subtitle **"Launch a new report card generation run."**.                                                                                                                                                         |           |
| 22.3 | **Back to Report Cards** button                                                              | Top-right ghost button. On click, navigates to `/en/report-cards`.                                                                                                                                                                                    |           |
| 22.4 | Non-admin arriving at this URL                                                               | The page detects roleKeys do not intersect `['school_owner', 'school_principal', 'admin', 'school_vice_principal']`, shows an error toast **"Permission denied"**, and `router.replace()`s back to `/en/report-cards`. Never renders the wizard body. |           |
| 22.5 | Admin user — wizard body                                                                     | Renders the step indicator + step content + footer navigation (Back + Next).                                                                                                                                                                          |           |

---

## 23. Generation Wizard — Step Indicator

A horizontal strip of 6 numbered circles with connector lines between them.

| #    | What to Check                                        | Expected Result                                                                                                                 | Pass/Fail |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Six circles numbered **1 2 3 4 5 6**                 | Each circle is 7×7, rounded-full, with the step number inside.                                                                  |           |
| 23.2 | Active step circle                                   | `bg-primary-500 text-white` for the current step.                                                                               |           |
| 23.3 | Completed step circles (steps before the active one) | `bg-primary-100 text-primary-700`. The connector lines before them use `bg-primary-200`.                                        |           |
| 23.4 | Upcoming step circles                                | `bg-surface-secondary text-text-tertiary`. Connectors use `bg-border/60`.                                                       |           |
| 23.5 | `aria-label` on each circle                          | Reads **"Step {current} of {total}"**, localised.                                                                               |           |
| 23.6 | Keyboard / click interaction                         | Step circles are NOT clickable — the only way to change steps is via the Back / Next footer buttons. Circles are informational. |           |

---

## 24. Generation Wizard — Step 1: Scope

### 24.1 Step header

| #      | What to Check      | Expected Result                                                  | Pass/Fail |
| ------ | ------------------ | ---------------------------------------------------------------- | --------- |
| 24.1.1 | Step 1 title       | **"Who are these report cards for?"**.                           |           |
| 24.1.2 | Step 1 description | **"Pick a scope — year group, class, or individual students."**. |           |

### 24.2 Scope mode cards

Three rounded-2xl cards in a 1-col (mobile) / 3-col (md+) grid. Click a card to select it.

| #      | Card                    | Icon          | Label                 | Description                                                      | Pass/Fail |
| ------ | ----------------------- | ------------- | --------------------- | ---------------------------------------------------------------- | --------- |
| 24.2.1 | **Year group**          | GraduationCap | "Year group"          | "Generate for every active student in the selected year groups." |           |
| 24.2.2 | **Class**               | Layers        | "Class"               | "Generate for every active student in the selected classes."     |           |
| 24.2.3 | **Individual students** | Users         | "Individual students" | "Hand-pick specific students to generate for."                   |           |

### 24.3 Selected state

| #      | What to Check                 | Expected Result                                                                                                                                                                                                                | Pass/Fail |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 24.3.1 | Click a mode card             | Border becomes primary-500, background `bg-primary-50/50`, icon bubble flips to `bg-primary-500 text-white`. Top-right corner shows a small primary-500 checkmark circle. The scope ids list is cleared when the mode changes. |           |
| 24.3.2 | Mode-specific selection panel | Below the mode cards, a dedicated selection panel appears based on the chosen mode.                                                                                                                                            |           |

### 24.4 Mode: Year group

| #      | What to Check            | Expected Result                                                                                                                                                                                                                                         | Pass/Fail |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.4.1 | Network call             | `GET /api/v1/year-groups?pageSize=100` fires once on mount. Sorted ascending by `display_order`.                                                                                                                                                        |           |
| 24.4.2 | Panel content            | Label **"Select year groups"** and a 2-column checklist of all year groups in the tenant. For NHQS: **Kindergarten**, **Junior infants**, **Senior infants**, **1st class**, **2nd class**, **3rd Class**, **4th Class**, **5th Class**, **6th Class**. |           |
| 24.4.3 | Empty year-groups tenant | If the tenant has no year groups, shows **"No year groups yet"** text instead of the list.                                                                                                                                                              |           |
| 24.4.4 | Click a checkbox         | Toggles the year-group id in `state.scope.ids`.                                                                                                                                                                                                         |           |
| 24.4.5 | Selection counter        | Below the list, a primary-tinted banner reads **"{n} year group(s) selected"**.                                                                                                                                                                         |           |

### 24.5 Mode: Class

| #      | What to Check        | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.5.1 | Network call         | `GET /api/v1/classes?pageSize=200` fires once on mount.                                                                                                                                                 |           |
| 24.5.2 | Panel content        | Label **"Select classes"** and a 2-column checklist of every class in the tenant. Each row shows the class name in medium weight plus a small `· {year_group_name}` suffix (e.g. **"1A · 1st class"**). |           |
| 24.5.3 | Empty classes tenant | If the tenant has no classes, shows **"No classes yet"**.                                                                                                                                               |           |
| 24.5.4 | Click a checkbox     | Toggles the class id in `state.scope.ids`.                                                                                                                                                              |           |
| 24.5.5 | Selection counter    | Banner **"{n} class(es) selected"**.                                                                                                                                                                    |           |

### 24.6 Mode: Individual students

| #      | What to Check               | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.6.1 | Panel content               | Label **"Search students"** and a text Input. Below, a results dropdown + a chip list of selected students.                                                                                          |           |
| 24.6.2 | Type less than 2 characters | Nothing happens — the search is debounced at 300ms and requires `trimmed.length >= 2`.                                                                                                               |           |
| 24.6.3 | Type "ali"                  | After 300ms, `GET /api/v1/students?pageSize=20&search=ali&status=active` fires. Results list renders up to 20 student rows: `{first_name} {last_name}` on the left, `{student_number}` on the right. |           |
| 24.6.4 | Click a student result      | The student is added to `state.scope.ids` and to the local `selectedStudents` chip list. Clicking the same student again is a no-op — the button shows `disabled` with 50% opacity.                  |           |
| 24.6.5 | Remove a student chip       | Each chip is a pill button labelled **"{first_name} {last_name} ×"**. Click removes the student from both `state.scope.ids` and the chip list.                                                       |           |
| 24.6.6 | Empty results               | When the query is ≥2 chars, not searching, and results are empty: **"No students match your search"** text below the input.                                                                          |           |
| 24.6.7 | Loading indicator           | While a search is in flight: small **"..."** text (implementation placeholder for a localised "Searching…").                                                                                         |           |
| 24.6.8 | Selection counter           | Banner **"{n} student(s) selected"**.                                                                                                                                                                |           |

### 24.7 Step 1 gating

| #      | What to Check                                                 | Expected Result                                                                         | Pass/Fail |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 24.7.1 | **Next** button when no mode is selected                      | Disabled (grey).                                                                        |           |
| 24.7.2 | **Next** button when a mode is selected but no ids are picked | Disabled (grey). The rule is `state.scope.mode !== null && state.scope.ids.length > 0`. |           |
| 24.7.3 | **Next** button when a mode + at least one id is picked       | Enabled (primary).                                                                      |           |
| 24.7.4 | Click **Next**                                                | Advances to Step 2 without any API call.                                                |           |
| 24.7.5 | Click **Back** on Step 1                                      | Disabled — step 1 is the first step.                                                    |           |

---

## 25. Generation Wizard — Step 2: Period

### 25.1 Step header

| #      | What to Check      | Expected Result                                                  | Pass/Fail |
| ------ | ------------------ | ---------------------------------------------------------------- | --------- |
| 25.1.1 | Step 2 title       | **"Which period?"**.                                             |           |
| 25.1.2 | Step 2 description | **"Select the academic period the report cards should cover."**. |           |

### 25.2 Network calls

| #      | What to Check | Expected Result                                                                                                                                    | Pass/Fail |
| ------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.2.1 | On mount      | Parallel: `GET /api/v1/academic-periods?pageSize=50` and `GET /api/v1/academic-years?pageSize=20`. While loading, 3 pulsing 14-height bars render. |           |
| 25.2.2 | Empty tenant  | If both lists return empty, the step shows **"No periods yet"** text and Next stays disabled.                                                      |           |

### 25.3 Full-year options

| #      | What to Check                                     | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.3.1 | Years list is sorted                              | Active year first, then the rest in reverse name order. For NHQS: **"2025-2026"** (active) appears before older years.                                                                               |           |
| 25.3.2 | Each year renders as a rounded-xl full-width card | Card content: Sparkles icon in a circular primary-50 bubble, **"Full year — {year.name}"** title, **"Aggregate every period in this academic year into one report card."** subtitle.                 |           |
| 25.3.3 | Click a full-year card                            | Dispatches `SET_FULL_YEAR` which sets `academicYearId = year.id` and clears `academicPeriodId`. Card border becomes primary-500 with a primary-50/50 background and a check circle in the top-right. |           |

### 25.4 Per-period options

| #      | What to Check       | Expected Result                                                                                                                                             | Pass/Fail |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.4.1 | Period list         | One card per period from the API. For NHQS: **S1** (2025-2026), **S2** (2025-2026).                                                                         |           |
| 25.4.2 | Card content        | Calendar icon in a `bg-surface-secondary` bubble, **"{period.name}"** as title, academic year name as subtitle.                                             |           |
| 25.4.3 | Click a period card | Dispatches `SET_PERIOD` which sets `academicPeriodId = period.id` and clears `academicYearId`. Visual selection state matches the full-year card behaviour. |           |
| 25.4.4 | Mutual exclusion    | Only one period OR one full-year card can be selected at a time. Selecting a different card clears the previous selection.                                  |           |

### 25.5 Step 2 gating

| #      | What to Check | Expected Result                                                                                                        | Pass/Fail |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.5.1 | Next button   | Disabled until EITHER `academicPeriodId !== null` OR `academicYearId !== null`. Once one is set, Next becomes enabled. |           |
| 25.5.2 | Back button   | Enabled — returns to Step 1 with all state preserved.                                                                  |           |

---

## 26. Generation Wizard — Step 3: Template & Design

### 26.1 Step header

| #      | What to Check      | Expected Result                                                                   | Pass/Fail |
| ------ | ------------------ | --------------------------------------------------------------------------------- | --------- |
| 26.1.1 | Step 3 title       | **"Which template?"**.                                                            |           |
| 26.1.2 | Step 3 description | **"Only grades-only is available in v1. Other content scopes are coming soon."**. |           |

### 26.2 Network & loading

| #      | What to Check                | Expected Result                                                                                                                                            | Pass/Fail |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.2.1 | On mount                     | `GET /api/v1/report-cards/templates/content-scopes` fires once. While loading, 2 pulsing 28-height cards render.                                           |           |
| 26.2.2 | Auto-selection on first load | If wizard state has no content scope yet and the `grades_only` scope is available, the step picks the default design and dispatches `SET_TEMPLATE_DESIGN`. |           |

### 26.3 Grades Only section

| #      | What to Check                             | Expected Result                                                                                                                                                                                                                                              | Pass/Fail |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.3.1 | Section header                            | Subtitle **"Grades Only"** with a hint line **"Pick the layout you want for this run. Preview each design before you commit."**.                                                                                                                             |           |
| 26.3.2 | Design cards                              | One card per design in the `grades_only` bucket. For NHQS: **Editorial Academic** (default, EN+AR), **Modern Editorial** (AR+EN).                                                                                                                            |           |
| 26.3.3 | Design card layout                        | FileText icon bubble on the left, design name + "Default" badge (if `is_default`), description paragraph, languages footer **"Languages · EN · AR"**.                                                                                                        |           |
| 26.3.4 | **View sample** link on the right         | Small rounded pill with an ExternalLink icon. Clicking opens `design.preview_pdf_url` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). The click event is stopped from propagating to the card body so it does NOT change the selected design. |           |
| 26.3.5 | Click the card body (not the sample link) | Dispatches `SET_TEMPLATE_DESIGN` with the design's design_key and the full list of locales. Card border becomes primary-500 with a primary check circle on the right.                                                                                        |           |

### 26.4 Coming-soon scopes

| #      | What to Check               | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.4.1 | Section heading             | **"More templates on the way"** (only renders when at least one scope has `is_available === false`).                                                                                                                                 |           |
| 26.4.2 | Expected coming-soon scopes | **Grades + Homework**, **Grades + Attendance**, **Grades + Homework + Attendance**, **Full Master Report**. Each card shows a FileText icon, the scope name, and an amber **"Coming soon"** pill. Cards are rendered at 60% opacity. |           |
| 26.4.3 | Click a coming-soon card    | No-op. The card has no click handler.                                                                                                                                                                                                |           |

### 26.5 Step 3 gating

| #      | What to Check | Expected Result                                                                          | Pass/Fail |
| ------ | ------------- | ---------------------------------------------------------------------------------------- | --------- |
| 26.5.1 | Next button   | Enabled once `state.contentScope !== null` (the auto-select handles this on first load). |           |

---

## 27. Generation Wizard — Step 4: Personal Info Fields

### 27.1 Step header

| #      | What to Check      | Expected Result                                                             | Pass/Fail |
| ------ | ------------------ | --------------------------------------------------------------------------- | --------- |
| 27.1.1 | Step 4 title       | **"Which personal info to include?"**.                                      |           |
| 27.1.2 | Step 4 description | **"Pre-filled from your tenant defaults. You can override for this run."**. |           |

### 27.2 Field sections

A left 2-column grid of checkboxes + a right-side live preview card (side-by-side on lg+, stacked on small).

| #      | Section  | Fields                                                   | Pass/Fail |
| ------ | -------- | -------------------------------------------------------- | --------- |
| 27.2.1 | Identity | full_name, student_number, sex, nationality, national_id |           |
| 27.2.2 | Dates    | date_of_birth, admission_date                            |           |
| 27.2.3 | Academic | year_group, class_name, homeroom_teacher                 |           |
| 27.2.4 | Media    | photo                                                    |           |

### 27.3 Checkbox interaction

| #      | What to Check           | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 27.3.1 | Initial state           | The list matches the tenant's `default_personal_info_fields` from the settings endpoint. For a fresh NHQS tenant: `full_name` + `student_number` pre-ticked. |           |
| 27.3.2 | Click a checkbox        | Dispatches `TOGGLE_FIELD` which toggles the field in `state.personalInfoFields`.                                                                             |           |
| 27.3.3 | Selected fields preview | Right panel lists the currently selected fields as bullets with primary-500 dots. If none selected, shows **"—"**.                                           |           |

### 27.4 Step 4 gating

| #      | What to Check                              | Expected Result                                              | Pass/Fail |
| ------ | ------------------------------------------ | ------------------------------------------------------------ | --------- |
| 27.4.1 | Next button with 0 fields selected         | Disabled. The rule is `state.personalInfoFields.length > 0`. |           |
| 27.4.2 | Next button with at least 1 field selected | Enabled.                                                     |           |

---

## 28. Generation Wizard — Step 5: Comment Gate Dry-Run

### 28.1 Step header

| #      | What to Check      | Expected Result                                                           | Pass/Fail |
| ------ | ------------------ | ------------------------------------------------------------------------- | --------- |
| 28.1.1 | Step 5 title       | **"Comment check"**.                                                      |           |
| 28.1.2 | Step 5 description | **"We'll check for missing or unfinalised comments before generation."**. |           |

### 28.2 Auto-run on step entry

| #      | What to Check                     | Expected Result                                                                                                                                                                                                                              | Pass/Fail |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.2.1 | Entering Step 5 fires the dry-run | `POST /api/v1/report-cards/generation-runs/dry-run` with the current scope, period (or year for full-year), and content_scope. The step dispatches `DRY_RUN_START` first, then `DRY_RUN_SUCCESS` or `DRY_RUN_FAILURE` based on the response. |           |
| 28.2.2 | While the dry-run is in flight    | A bordered dashed card shows a spinning Loader2 icon and the text **"Checking comments…"**.                                                                                                                                                  |           |
| 28.2.3 | Dry-run failure                   | A red error card shows the server's error message and an outline **"Retry"** button that re-fires the dry-run.                                                                                                                               |           |

### 28.3 Summary cards

Two rounded-xl cards in a 2-column grid display the high-level counts.

| #      | Card                  | Content                                                                                                                                                         | Pass/Fail |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.3.1 | **Students in scope** | Upper-case hint label + bold total count (`result.students_total`).                                                                                             |           |
| 28.3.2 | **Languages preview** | Upper-case hint label with a readable summary, then a secondary line **"EN {n} · AR {m}"** where the numbers come from `result.languages_preview.en` and `.ar`. |           |

### 28.4 Pass state

| #      | What to Check                  | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.4.1 | `result.would_block === false` | Below the summary cards, a success banner: CheckCircle2 icon + **"All comments are in order — you're good to generate."** (localised), success colour tones. |           |
| 28.4.2 | Next button                    | Enabled — Step 5 gate is considered satisfied.                                                                                                               |           |

### 28.5 Blocked state

| #      | What to Check                                 | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.5.1 | `result.would_block === true`                 | Below the summary cards, a warning banner renders with an AlertTriangle icon and the heading **"Generation is blocked — your tenant requires all comments to be finalised first."**.                                                 |           |
| 28.5.2 | `result.allow_admin_force_generate === true`  | A sub-card below the warning contains a Checkbox labelled **"Force-generate anyway"** and a descriptive paragraph **"Force-generating will produce report cards with blank comment blocks. This bypasses the finalisation check."**. |           |
| 28.5.3 | Tick the Force-generate checkbox              | Dispatches `SET_OVERRIDE` with `value: true`. Next button becomes enabled.                                                                                                                                                           |           |
| 28.5.4 | Untick                                        | Next button becomes disabled again.                                                                                                                                                                                                  |           |
| 28.5.5 | `result.allow_admin_force_generate === false` | No checkbox is rendered. Instead, a paragraph: **"Contact your administrator to finalise the pending comments — this tenant does not allow force-generation."**. Next button stays disabled permanently on this step.                |           |

### 28.6 Drill-in details

| #      | What to Check                                                                                                     | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.6.1 | If any of the four lists has entries (missing subject, unfinalised subject, missing overall, unfinalised overall) | A collapsible card with the label **"Show details"**. Clicking flips to **"Hide details"** and reveals four subsections, each rendering up to 20 items with a "and {n} more" footer when truncated. |           |
| 28.6.2 | Subject comment items                                                                                             | Each bullet reads **"{student_name} — {subject_name}"**.                                                                                                                                            |           |
| 28.6.3 | Overall comment items                                                                                             | Each bullet reads **"{student_name}"**.                                                                                                                                                             |           |

### 28.7 Step 5 gating

| #      | What to Check                 | Expected Result                                                                                                 | Pass/Fail |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------- | --- |
| 28.7.1 | Next button                   | Enabled only when: `!state.dryRun.loading && !state.dryRun.error && state.dryRun.result && (!result.would_block |           | state.overrideCommentGate)`. |     |
| 28.7.2 | Next click advances to Step 6 | No additional API call fires.                                                                                   |           |

---

## 29. Generation Wizard — Step 6: Review & Submit

### 29.1 Review rows

Five rounded-xl summary rows each showing a label + value.

| #      | Row                      | Value source                                                                                                                                                                                                   | Pass/Fail |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1.1 | **Scope**                | `{mode label} ({n})` — e.g. **"Class (1)"**, **"Year group (3)"**, **"Individual students (12)"**. "—" if no mode selected (should never happen on Step 6).                                                    |           |
| 29.1.2 | **Period**               | If `academicPeriodId` set, displays the period UUID (known limitation — no name lookup on Step 6). If `academicYearId` set, displays the localised **"Full year"** label.                                      |           |
| 29.1.3 | **Template**             | Displays the `content_scope` key (e.g. `grades_only`). A future enhancement can resolve this to a friendly label.                                                                                              |           |
| 29.1.4 | **Personal info fields** | Comma-joined list of the selected field labels (e.g. **"Full name, Student number"**). "—" if none.                                                                                                            |           |
| 29.1.5 | **Comment check**        | **"Passed"** (localised) if the dry-run passed; **"Force-generate enabled"** if the gate was blocked and the admin ticked the override; **"Blocked"** if still blocked (Next should be disabled in that case). |           |

### 29.2 Footer buttons

| #      | What to Check                | Expected Result                                                                                                                                                                                                                                                       | Pass/Fail |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.2.1 | **Back** button              | Enabled — returns to Step 5.                                                                                                                                                                                                                                          |           |
| 29.2.2 | **Generate** primary button  | Replaces the Next button on Step 6. Enabled whenever Step 6 was reached.                                                                                                                                                                                              |           |
| 29.2.3 | Click **Generate**           | `POST /api/v1/report-cards/generation-runs` with payload `{scope, academic_period_id, academic_year_id?, content_scope, design_key?, personal_info_fields, override_comment_gate}`. Response contains a `batch_job_id`. Dispatches `SUBMIT_START` → `SUBMIT_SUCCESS`. |           |
| 29.2.4 | Submit failure               | Toast **"Generation failed"** with the server's message. The form remains on Step 6 and `state.submit.error` is set for display.                                                                                                                                      |           |
| 29.2.5 | Button label while in flight | Reads **"Submitting…"** and the button is disabled to prevent double-clicks.                                                                                                                                                                                          |           |

---

## 30. Generation Wizard — Running / Polling State

Once `state.submit.runId !== null`, the wizard swaps the step UI for the `<PollingStatus>` component.

### 30.1 Polling frequency and endpoint

| #      | What to Check            | Expected Result                                                                                                                                     | Pass/Fail |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1.1 | Immediately after submit | `GET /api/v1/report-cards/generation-runs/{batch_job_id}` fires once, then on a `setInterval(3000)` until the status reaches a terminal value.      |           |
| 30.1.2 | beforeunload guard       | While the run is in progress, closing the tab or navigating away triggers the browser's native "Are you sure?" dialog via a `beforeunload` handler. |           |

### 30.2 In-flight UI

| #      | What to Check         | Expected Result                                                                                                                                   | Pass/Fail |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.2.1 | Card frame            | Rounded-2xl border, `bg-surface`, padding 6.                                                                                                      |           |
| 30.2.2 | Heading               | Spinning Loader2 icon in primary-500 + **"Generating report cards…"** heading.                                                                    |           |
| 30.2.3 | Progress text         | When `total > 0`: **"{done} of {total} students complete"**. When total is still 0: **"Waiting for the worker to pick up the run…"** (localised). |           |
| 30.2.4 | Progress bar          | Primary-500 gradient fill, `round(done/total * 100)%` width. 2px height. Not rendered until `total > 0`.                                          |           |
| 30.2.5 | No navigation buttons | During in-flight state, Back / Generate / Start another are all hidden to prevent double-submits.                                                 |           |

---

## 31. Generation Wizard — Terminal Outcomes (Completed / Partial / Failed)

### 31.1 Completed

| #      | What to Check                                         | Expected Result                                                                                                                                          | Pass/Fail |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1.1 | Run snapshot reaches `completed` with `blocked === 0` | Card frame uses success tones (`border-success/40 bg-success/5`), CheckCircle2 icon, heading **"Generation complete — {count} report cards produced."**. |           |
| 31.1.2 | **View library** primary button                       | On click, navigates to `/en/report-cards/library`. The freshly generated run appears as the newest card.                                                 |           |
| 31.1.3 | **Start another** outline button                      | Dispatches `RESET`, which clears all wizard state and returns to Step 1.                                                                                 |           |

### 31.2 Partial success

| #      | What to Check                                                 | Expected Result                                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.2.1 | Status is `partial_success` OR `completed` with `blocked > 0` | Card uses warning tones (amber), AlertTriangle icon, heading **"{done} generated, {blocked} blocked"**.              |           |
| 31.2.2 | Error details                                                 | A collapsible `<details>` block titled **"Run errors"** lists every `errors[]` entry as `"{student_id}: {message}"`. |           |
| 31.2.3 | Same View library / Start another buttons                     | Identical behaviour to the completed case.                                                                           |           |

### 31.3 Failed

| #      | What to Check      | Expected Result                                                                                                                                                                                                                | Pass/Fail |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 31.3.1 | Status is `failed` | Card uses error tones (`border-error/40 bg-error/5`), XCircle icon, heading **"Run failed"**. Error details collapsible block renders if errors exist. A single outline **"Start another"** button is shown (no View library). |           |

---

## 32. Generation Wizard — Teacher Request Pre-Fill Handoff

When an admin clicks **Approve & open** on a regenerate teacher request, the detail page routes here with query params. The wizard consumes them and jumps to Step 6 with everything pre-filled.

| #    | What to Check                                                                                | Expected Result                                                                                                                                                                                                                                                                                                  | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 32.1 | Navigate to `/en/report-cards/generate?scope_mode=class&scope_ids=<id1>,<id2>&period_id=<p>` | The wizard parses the query params after the default settings load, dispatches `SET_SCOPE_MODE('class')`, `SET_SCOPE_IDS([...])`, `SET_PERIOD(<p>)`, and `SET_CONTENT_SCOPE('grades_only', ['en', 'ar'])`, then dispatches `SET_STEP(6)`. The user lands directly on the Review step with everything pre-filled. |           |
| 32.2 | The query params are cleared from the URL after consumption                                  | The `prefilledRef.current = true` guard ensures this only happens once per page load.                                                                                                                                                                                                                            |           |
| 32.3 | Clicking **Back** from the pre-filled Step 6                                                 | Returns to Step 5 and re-runs the dry-run. The admin can still adjust any step if needed before committing.                                                                                                                                                                                                      |           |

---

## 33. Library Page — Load & View Toggles

**URL:** `/en/report-cards/library`

| #    | What to Check                   | Expected Result                                                                                                                                            | Pass/Fail |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1 | Navigate to the library         | Network: `GET /api/v1/report-cards/library/grouped` fires once. While loading, 3 pulsing 20-height skeleton bars render.                                   |           |
| 33.2 | Page heading                    | **"Report Cards Library"** (localised).                                                                                                                    |           |
| 33.3 | **Back to Report Cards** button | Ghost button in the header. Navigates to `/en/report-cards`.                                                                                               |           |
| 33.4 | View-mode segmented control     | A 3-button segmented control below the header: **"By run"** (default), **"By year group"**, **"By class"**. Active button has `bg-primary-500 text-white`. |           |
| 33.5 | Empty library                   | If `allRows.length === 0`, a centred card shows a FileText icon and the text **"No documents yet"**.                                                       |           |
| 33.6 | Load failure                    | On error, a card with a FileText icon and **"Failed to load library"**.                                                                                    |           |

---

## 34. Library — By Run View

Default view. Each run from the grouped endpoint becomes a collapsible card.

### 34.1 Run card structure

| #      | What to Check                          | Expected Result                                                                                                                                                                                                                                                      | Pass/Fail |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1.1 | Run card frame                         | Rounded-xl, `border-border`, `bg-surface`, shadow-sm.                                                                                                                                                                                                                |           |
| 34.1.2 | Header row                             | Expand/Collapse chevron button, "Select all in this run" checkbox, run label, action buttons on the right.                                                                                                                                                           |           |
| 34.1.3 | Expand button `aria-label`             | **"Expand"** when collapsed, **"Collapse"** when expanded.                                                                                                                                                                                                           |           |
| 34.1.4 | Run label                              | Row 1: date-time formatted via `Intl.DateTimeFormat({dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory', numberingSystem: 'latn'})` (e.g. **"Apr 10, 2026, 6:31 PM"**) + **"· {period_label}"**. Row 2: **"{n} class · {m} documents · {template_name}"**. |           |
| 34.1.5 | **Bundle · one file per class** button | Outline button with Package icon. On click, fires `GET /api/v1/report-cards/library/bundle-pdf?class_ids=...&merge_mode=per_class&locale=en`. Response streams a zip; the browser triggers a download with the filename from `Content-Disposition`.                  |           |
| 34.1.6 | **Bundle · one PDF** button            | Same as above but `merge_mode=single` produces a single merged PDF.                                                                                                                                                                                                  |           |
| 34.1.7 | **Delete entire run** button           | Trash icon in rose. On click, opens the ConfirmAction modal with `kind='delete'` and all row ids in the run as the target.                                                                                                                                           |           |

### 34.2 Selection via header checkbox

| #      | What to Check                               | Expected Result                                                                                        | Pass/Fail |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 34.2.1 | Click the "Select all in this run" checkbox | Every row in the run is added to the selection set. The sticky bottom action bar appears (section 38). |           |
| 34.2.2 | All rows already selected                   | The header checkbox shows as checked. Unchecking removes all run rows from the selection.              |           |

### 34.3 Expand/collapse

| #      | What to Check              | Expected Result                                                                                                                                                    | Pass/Fail |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 34.3.1 | Click the chevron          | Expands the run to show its class nodes. Chevron icon flips from ChevronRight to ChevronDown. The child panel has a top border and `bg-surface-secondary/30` tint. |           |
| 34.3.2 | Each child is a class node | See section 37 for the class-node/row layout.                                                                                                                      |           |

---

## 35. Library — By Year Group View

| #    | What to Check                      | Expected Result                                                                                                                                                                                                    | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 35.1 | Click **By year group**            | The view re-renders. Classes from every run are re-grouped by year group (`cls.year_group.id`). Year groups sorted alphabetically by name. Classes without a year group fall into a localised "Unassigned" bucket. |           |
| 35.2 | Year group header                  | Icon bubble with GraduationCap glyph, year group name as h3, right side `border-t` filler.                                                                                                                         |           |
| 35.3 | Class nodes within each year group | Same class-node rendering as section 37. Classes sorted alphabetically by `class_name` within a bucket.                                                                                                            |           |
| 35.4 | Expand / select behaviour          | Identical to the by-run view but keyed with `{yearGroupId}::{classId}`.                                                                                                                                            |           |

---

## 36. Library — By Class View

| #    | What to Check            | Expected Result                                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Click **By class**       | Every class node from every run is flattened and sorted alphabetically by class name. No run grouping.                                                                                    |           |
| 36.2 | Each card                | Standard class-node layout (section 37). Same expand / select / action behaviour.                                                                                                         |           |
| 36.3 | Duplicate class handling | If two runs produced cards for the same class, each becomes its OWN class node with a unique composite key (`flat-{class_id}-{first_row_id}`). They are NOT merged — each stays distinct. |           |

---

## 37. Library — Row-Level Actions (Download / Publish / Unpublish / Delete)

Inside every class node, an expand chevron reveals a table of report card rows.

### 37.1 Class node header

| #      | What to Check                       | Expected Result                                                                                                                                                           | Pass/Fail |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.1.1 | Expand/Collapse chevron             | `aria-label` "Expand" / "Collapse". Clicking toggles `expanded[classKey]`.                                                                                                |           |
| 37.1.2 | Select-all-in-class checkbox        | Toggles all row ids in this class in the selection.                                                                                                                       |           |
| 37.1.3 | Header text                         | Row 1: class name + optional `· {year_group_name}`. Row 2: `"{n} students · {m} documents"`.                                                                              |           |
| 37.1.4 | **Bundle as one PDF** button        | Outline + Package icon. Fires `GET /api/v1/report-cards/library/bundle-pdf?class_ids={classId}&merge_mode=single&locale=en`, streams the merged PDF, triggers a download. |           |
| 37.1.5 | **Delete all in this class** button | Trash icon in rose. Opens the ConfirmAction modal with `kind='delete'` and every row in the class.                                                                        |           |

### 37.2 Row table structure (after expanding)

| #      | Column       | Content                                                                                                                                                                                         | Pass/Fail |
| ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.2.1 | Checkbox     | Per-row checkbox. Tied to `selected.has(row.id)`. `aria-label` reads "Select report card for {first_name} {last_name}".                                                                         |           |
| 37.2.2 | Student      | Student name in medium weight + optional student_number in LTR mono below.                                                                                                                      |           |
| 37.2.3 | Status       | Pill badge. Variants: `draft` → `bg-primary-50 text-primary-700`, `published` → `bg-success-50 text-success-700`, `revised` → `bg-amber-50 text-amber-700`. Text is the localised status label. |           |
| 37.2.4 | Locale       | Uppercase ISO language code, LTR dir.                                                                                                                                                           |           |
| 37.2.5 | Generated    | Date-time formatted via `Intl.DateTimeFormat` with Gregorian calendar + Latin numbers.                                                                                                          |           |
| 37.2.6 | Actions cell | Three buttons depending on status (see 37.3).                                                                                                                                                   |           |

### 37.3 Row action buttons

| #      | Status       | Buttons rendered                                                                                                                                             | Pass/Fail |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 37.3.1 | `draft`      | **Download** (Download icon; disabled if no pdf_download_url), **Publish** (Send icon), **Delete** (Trash2 rose).                                            |           |
| 37.3.2 | `published`  | **Download** enabled, **Unpublish** (Undo2 amber), **Delete** DISABLED with a `title` tooltip explaining published cards can't be deleted until unpublished. |           |
| 37.3.3 | `revised`    | Revised is the post-unpublish state — only **Download** + **Delete** render. No publish / unpublish on revised rows.                                         |           |
| 37.3.4 | `superseded` | No action buttons beyond Download.                                                                                                                           |           |

### 37.4 Download behaviour

| #      | What to Check                                            | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 37.4.1 | Click Download on a row with `pdf_download_url`          | `window.open(row.pdf_download_url, '_blank', 'noopener,noreferrer')` opens the signed S3 URL in a new tab. The URL's Content-Disposition forces a download with the filename "{last} {first} - Report Card - {period} ({LANG}).pdf". |           |
| 37.4.2 | Click Download on a row with `pdf_download_url === null` | Button is disabled; title tooltip reads the localised "Download unavailable". No click effect.                                                                                                                                       |           |

### 37.5 Publish (single row)

| #      | What to Check                    | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.5.1 | Click **Publish** on a draft row | `POST /api/v1/report-cards/{id}/publish`. While in flight, the row id is in `busyIds` — all its buttons are disabled. On success, toast **"Published"**, library re-fetches, the row's status flips to `published`. |           |
| 37.5.2 | Publish failure                  | Toast **"Publish failed"**. Row stays in `draft` state.                                                                                                                                                             |           |

### 37.6 Unpublish (single row)

| #      | What to Check                          | Expected Result                                                                                                                                                               | Pass/Fail |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.6.1 | Click **Unpublish** on a published row | Opens the ConfirmAction modal with `kind='unpublish'` and a single row id (see section 41).                                                                                   |           |
| 37.6.2 | Confirm the unpublish                  | `POST /api/v1/report-cards/{id}/revise`. The row's status flips to `revised` (a new draft is created in its place). Toast **"Unpublished successfully"**. Library re-fetches. |           |

### 37.7 Delete (single row)

| #      | What to Check                   | Expected Result                                                                                  | Pass/Fail |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 37.7.1 | Click **Delete** on a draft row | Opens the ConfirmAction modal with `kind='delete'` and a single row id.                          |           |
| 37.7.2 | Confirm the delete              | `DELETE /api/v1/report-cards/{id}`. Row disappears from the library. Toast **"Deleted 1 card"**. |           |
| 37.7.3 | Delete on a published row       | Button is disabled with a tooltip. If clicked anyway (e.g. via keyboard), nothing happens.       |           |

---

## 38. Library — Selection & Sticky Action Bar

When `selected.size > 0`, a sticky bar renders at the bottom of the viewport (bottom-4, `max-w-3xl`, `bg-surface shadow-xl ring-1 ring-primary-500/20`).

| #    | What to Check                                       | Expected Result                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 38.1 | Left side of the bar                                | Primary-100 circular badge with the selection count + the localised **"{n} selected"** text.                                                                                                                                                               |           |
| 38.2 | **Bundle selection** button                         | Outline + Package icon. Fires `GET /api/v1/report-cards/library/bundle-pdf?report_card_ids=...&merge_mode=single&locale=en` — merges just the selected rows into one PDF download.                                                                         |           |
| 38.3 | **Publish selection** button                        | On click, loops through selected ids calling `POST /api/v1/report-cards/{id}/publish` sequentially. Tracks `ok` and `fail` counts. Toast **"Published {n} cards"** on success, **"Failed to publish {n} cards"** on failure. Clears selection, re-fetches. |           |
| 38.4 | **Unpublish selection** button                      | Filters selected ids to only those in `published` status (drafts and revised rows are silently skipped). If none of the selection is published, shows an error toast and does nothing. Otherwise opens the unpublish ConfirmAction modal.                  |           |
| 38.5 | **Delete selection** button                         | Trash icon in rose. Opens the delete ConfirmAction modal with all selected ids.                                                                                                                                                                            |           |
| 38.6 | **Clear selection** ghost button                    | Empties the selection set; the sticky bar vanishes.                                                                                                                                                                                                        |           |
| 38.7 | Sticky bar never covers the table when no selection | When `selected.size === 0`, the bar is not rendered at all. The table's bottom padding (`pb-24`) leaves room for the bar when it does appear.                                                                                                              |           |

---

## 39. Library — Bundle Downloads

The bundle endpoint streams binary data so it bypasses `apiClient` (which JSON-parses). Instead, `downloadBundle()` uses raw `fetch()` with the Authorization header from `getAccessToken()`.

| #    | What to Check                    | Expected Result                                                                                                                                                                                                                   | Pass/Fail |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | Bundle by run — per class        | Request: `GET /api/v1/report-cards/library/bundle-pdf?class_ids=...&class_ids=...&merge_mode=per_class&locale=en`. Response: a ZIP (`application/zip`) named from `Content-Disposition`, default fallback **"report-cards.zip"**. |           |
| 39.2 | Bundle by run — single PDF       | Same request but `merge_mode=single`. Response: a merged PDF. Default filename **"report-cards.pdf"**.                                                                                                                            |           |
| 39.3 | Bundle by class (per-class node) | `class_ids` contains a single id; `merge_mode=single`; downloads a merged PDF for that class only.                                                                                                                                |           |
| 39.4 | Bundle selection                 | `report_card_ids` contains the selected row ids; `merge_mode=single`.                                                                                                                                                             |           |
| 39.5 | Bundle failure                   | Response not OK: the catch block raises with the response text (or `HTTP {status}`). Toast **"Bundle failed"** with the server's message where possible.                                                                          |           |
| 39.6 | Authorization header             | The raw fetch attaches `Authorization: Bearer {access_token}` from `getAccessToken()` and includes credentials.                                                                                                                   |           |
| 39.7 | `__unassigned` class filtering   | Bundle calls for runs filter out the sentinel `class_id === '__unassigned'` so the backend doesn't receive a bogus class id.                                                                                                      |           |

---

## 40. Library — Delete Confirmation Modal

| #    | What to Check                   | Expected Result                                                                                                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 40.1 | Modal backdrop                  | Full-screen `fixed inset-0 z-40 bg-black/50` overlay with a centred rounded-2xl card (`max-w-md`).                                                                                                                                                                             |           |
| 40.2 | Modal title                     | **"Delete report cards?"** (kind=delete).                                                                                                                                                                                                                                      |           |
| 40.3 | Modal body                      | Reads **"You're about to delete {label} ({count} card/cards). This cannot be undone."** where label is student name, class label, or run label depending on the ask helper used.                                                                                               |           |
| 40.4 | **Cancel** ghost button         | Closes the modal. No API call.                                                                                                                                                                                                                                                 |           |
| 40.5 | **Delete** rose-outlined button | On click, calls `executeDelete()`: `DELETE /api/v1/report-cards/{id}` for single, or `POST /api/v1/report-cards/bulk-delete` with `{report_card_ids: [...]}` for multiple. Toast **"Deleted {count} card(s)"** on success. Modal closes, selection clears, library re-fetches. |           |
| 40.6 | Delete failure                  | Toast with the server's message or the fallback **"Delete failed"**. Modal stays open until the user cancels or retries.                                                                                                                                                       |           |
| 40.7 | Outside-click / Escape          | Clicking the backdrop or pressing Escape closes the modal. No API call.                                                                                                                                                                                                        |           |

---

## 41. Library — Unpublish Confirmation Modal

Same modal component, different `kind`.

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                                                              | Pass/Fail |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 41.1 | Modal title                         | **"Unpublish report cards?"** (kind=unpublish).                                                                                                                                                                                                                              |           |
| 41.2 | Modal body                          | Reads **"You're about to unpublish {label} ({count} card). The original will be marked as revised and a new draft will appear in the library so you can edit and republish it."**.                                                                                           |           |
| 41.3 | **Cancel** ghost button             | Closes the modal, no API call.                                                                                                                                                                                                                                               |           |
| 41.4 | **Unpublish** amber-outlined button | On click, calls `executeUnpublish()`: loops through the ids sequentially calling `POST /api/v1/report-cards/{id}/revise`. Tracks `ok` and `fail` counts. Toast **"Unpublished {n} card(s)"** or **"Failed to unpublish {n} card(s)"**. Selection clears, library re-fetches. |           |
| 41.5 | Sequential requests                 | Loop uses `await` inside `for...of` — no parallel stampede. Comment in the code explains this is intentional for the small row counts the library shows.                                                                                                                     |           |

---

## 42. Library — PDF Presigned URL Contract

Each row's `pdf_download_url` is a short-lived (5 min) presigned S3 URL generated server-side.

| #    | What to Check                | Expected Result                                                                                                                                                                                                                                                                                                               | Pass/Fail |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1 | URL shape                    | `https://edupod-assets.hel1.your-objectstorage.com/edupod-assets/{tenant_id}/report-cards/{student_id}/{period_id}/{rc_id}/{locale}.pdf?X-Amz-Algorithm=...&X-Amz-Expires=300&...&response-content-disposition=attachment%3B%20filename%3D%22{last}%20{first}%20-%20Report%20Card%20-%20{period}%20(%7B{LANG}%7D).pdf%22&...` |           |
| 42.2 | Expiry                       | The signature is valid for `X-Amz-Expires=300` seconds. After that, GET returns 403 with `<Error><Code>SignatureDoesNotMatch</Code></Error>` (XML). The UI must re-fetch the library grouped response to get a fresh URL if the user idles too long.                                                                          |           |
| 42.3 | Content-Disposition filename | Encodes the student's last + first name + period + locale. For Arabic locale: `{LANG}` = AR. For English: EN.                                                                                                                                                                                                                 |           |
| 42.4 | Response body                | Valid PDF v1.4 document. Opens in any standard reader. Typical size 200–250 KB per student.                                                                                                                                                                                                                                   |           |
| 42.5 | HEAD request                 | Hetzner/Ceph S3 doesn't expose HEAD for signed URLs — returns 403. Don't rely on HEAD for pre-fetch. GET works fine.                                                                                                                                                                                                          |           |

---

## 43. Analytics Page — Load & Period Selector

**URL:** `/en/report-cards/analytics` (optionally with `?academic_period_id={id or 'full_year'}`)

| #    | What to Check                                                      | Expected Result                                                                                                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 43.1 | Navigate to `/en/report-cards/analytics`                           | Network: `GET /api/v1/academic-periods?pageSize=50` (200) and `GET /api/v1/report-cards/analytics/dashboard` (200). No class-comparison call fires because the default period is `'all'`.                                                          |           |
| 43.2 | Navigate to `/en/report-cards/analytics?academic_period_id={uuid}` | The initial period is parsed from the URL. `GET /api/v1/report-cards/analytics/dashboard?academic_period_id={uuid}` AND `GET /api/v1/report-cards/analytics/class-comparison?academic_period_id={uuid}` fire in parallel via `Promise.allSettled`. |           |
| 43.3 | Page heading                                                       | **"Report Card Analytics"**.                                                                                                                                                                                                                       |           |
| 43.4 | **Back to Report Cards** button                                    | Top-right ghost button.                                                                                                                                                                                                                            |           |
| 43.5 | Period selector                                                    | Right-aligned Select trigger. Options: **"All periods"** (sentinel `all`, default), **"Full Year"** (sentinel `full_year`), every period from the API in order.                                                                                    |           |
| 43.6 | Select **All periods**                                             | Dashboard call fires WITHOUT query param. Class comparison call does NOT fire (because it throws 500 with no period id). The class comparison chart and per-class progress section are hidden.                                                     |           |
| 43.7 | Select **S1**                                                      | Both dashboard + class-comparison calls fire. Chart and progress bars render.                                                                                                                                                                      |           |
| 43.8 | Select **Full Year**                                               | Both calls fire with `academic_period_id=full_year` which the backend scopes to NULL-period rows.                                                                                                                                                  |           |
| 43.9 | Loading skeleton                                                   | 5 summary-card skeletons in a row + two 64-height chart skeletons.                                                                                                                                                                                 |           |

---

## 44. Analytics — Summary Cards

Six cards in a responsive grid (2 columns mobile, 3 at sm+, 6 at lg+).

| #    | Card                 | Value                                                                     | Variant (colour)    | Pass/Fail |
| ---- | -------------------- | ------------------------------------------------------------------------- | ------------------- | --------- |
| 44.1 | **Total**            | `summary.total` — integer count of report cards in scope                  | neutral             |           |
| 44.2 | **Published**        | `summary.published`                                                       | success (green)     |           |
| 44.3 | **Draft**            | `summary.draft`                                                           | info (primary blue) |           |
| 44.4 | **Completion Rate**  | `(summary.completion_rate ?? 0).toFixed(1) + '%'`                         | info                |           |
| 44.5 | **Overall comments** | `{summary.overall_comments_finalised} / {summary.overall_comments_total}` | info                |           |
| 44.6 | **Subject comments** | `{summary.subject_comments_finalised} / {summary.subject_comments_total}` | info                |           |

| #    | What to Check                                   | Expected Result                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 44.7 | Analytics call fails                            | The whole `analytics` state is null. Section renders **"No results"** line.                                         |           |
| 44.8 | Deprecated `comment_fill_rate` is NOT displayed | The legacy metric is still in the response shape but the UI never renders it. Confirm no card reads "Comment fill". |           |

---

## 45. Analytics — Class Comparison Chart

Only renders when `analytics.class_comparison.length > 0`.

| #    | What to Check            | Expected Result                                                                                                        | Pass/Fail |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 45.1 | Section heading          | **"Class comparison"**.                                                                                                |           |
| 45.2 | Chart type               | Recharts `<BarChart>` in a 64-height ResponsiveContainer. X axis: `class_name`. Y axis: 0-100 domain. Two bar series.  |           |
| 45.3 | Bar 1 — **Avg score**    | `dataKey="average_grade"`, fill primary-500, radius `[4, 4, 0, 0]`.                                                    |           |
| 45.4 | Bar 2 — **Published**    | `dataKey="published_count"`, fill success-500, radius `[4, 4, 0, 0]`.                                                  |           |
| 45.5 | Cartesian grid + tooltip | Grid uses `stroke="var(--color-border)"`. Tooltip contentStyle sets surface background, border, 8px radius, 12px font. |           |
| 45.6 | Legend                   | Renders below the chart at 12px font.                                                                                  |           |

---

## 46. Analytics — Per-Class Generation Progress

Only renders when `analytics.class_comparison.length > 0`.

| #    | What to Check      | Expected Result                                                                                                                                                                     | Pass/Fail |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 46.1 | Section heading    | **"Generation progress by class"**.                                                                                                                                                 |           |
| 46.2 | One row per class  | Each row has the class name on the left and a right-aligned counter **"{published_count} / {student_count} · {pct}%"** where `pct = min(100, round(completion_rate))`.              |           |
| 46.3 | Progress bar       | Below the counter line, a 2-height rounded bar with a primary-400 → primary-600 gradient fill. `role="progressbar"`, `aria-valuenow={pct}`, `aria-valuemin=0`, `aria-valuemax=100`. |           |
| 46.4 | Bar fill animation | Uses `transition-all` so width changes animate smoothly when period filters change.                                                                                                 |           |

---

## 47. Analytics — Term-Over-Term Trends (Planned)

| #    | What to Check     | Expected Result                                                                                                                                                          | Pass/Fail |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 47.1 | Current behaviour | Backend does NOT expose a trends endpoint yet. The UI hard-codes `trends: []` and the trend chart section never renders.                                                 |           |
| 47.2 | Future behaviour  | When the trends endpoint ships, a Recharts LineChart with two lines (Avg score, Completion rate) will render below the per-class progress section. For now, mark as N/A. |           |

---

## 48. Teacher Requests — List Page (Admin)

**URL:** `/en/report-cards/requests`

| #    | What to Check                           | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 48.1 | Navigate to `/en/report-cards/requests` | Network: `GET /api/v1/report-card-teacher-requests?status=pending&pageSize=100` (200) on initial load (Pending tab active). After rows load, `GET /api/v1/academic-periods?pageSize=100` fetches period names for display. |           |
| 48.2 | Page heading                            | **"Report Card Requests"** with subtitle **"Teachers can ask the principal to reopen a comment window or regenerate report cards."**.                                                                                      |           |
| 48.3 | **Back to Report Cards** button         | Ghost button in the header.                                                                                                                                                                                                |           |
| 48.4 | **New request** button                  | Teacher-only. NOT rendered for admins. Admins don't file their own requests.                                                                                                                                               |           |
| 48.5 | Tab row                                 | For admins, two pill tabs: **"Pending review"** (default active, shows a primary-100 count badge when > 0) and **"All"**. Teachers see no tabs.                                                                            |           |

---

## 49. Teacher Requests — Pending Tab

| #     | What to Check                              | Expected Result                                                                                                                                                                                | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 49.1  | Tab label                                  | **"Pending review"**. When the list contains rows, an inline primary-100 badge shows the count.                                                                                                |           |
| 49.2  | Empty state                                | `EmptyState` with MessageSquare icon and the localised **"No pending requests"** title.                                                                                                        |           |
| 49.3  | Row table columns (admin)                  | **Requester**, **Type**, **Period**, **Scope**, **Reason**, **Status**, **Requested**, **Actions**. All headers uppercase `text-[10px]`.                                                       |           |
| 49.4  | **Requester** cell                         | Shows `{first_name} {last_name}` (from the hydrated `row.requester`) + a secondary line with the email. Falls back to the user id prefix `#{id.slice(0,8)}` if the name and email are missing. |           |
| 49.5  | **Type** cell                              | Localised label: **"Window reopen"** for `open_comment_window` or **"Regenerate reports"** for `regenerate_reports`.                                                                           |           |
| 49.6  | **Period** cell                            | Friendly period name from the map (e.g. "S1"). Em-dash when `academic_period_id` is null (full-year request).                                                                                  |           |
| 49.7  | **Scope** cell                             | For `open_comment_window`: em-dash. For `regenerate_reports`: **"{Year group/Class/Student}: {n} ids"** based on `target_scope_json`.                                                          |           |
| 49.8  | **Reason** cell                            | Truncated with `max-w-xs truncate`; hover shows the full text via the `title` attribute.                                                                                                       |           |
| 49.9  | **Status** cell                            | `<Badge>` with variant `warning` for `pending`, `info` for `approved`, `success` for `completed`, `danger` for `rejected`, `secondary` for `cancelled`.                                        |           |
| 49.10 | **Requested** cell                         | Date-time via `formatDateTime()` helper — Gregorian, Latin numbers.                                                                                                                            |           |
| 49.11 | **Review** button (admin on a pending row) | Navigates to `/en/report-cards/requests/{id}`.                                                                                                                                                 |           |

---

## 50. Teacher Requests — All Tab

| #    | What to Check  | Expected Result                                                                                                                                                           | Pass/Fail |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 50.1 | Click **All**  | Active tab highlights. Network: `GET /api/v1/report-card-teacher-requests?pageSize=100` (no status filter). Rows populate with every tenant request regardless of status. |           |
| 50.2 | Empty state    | EmptyState with **"No requests yet"** title.                                                                                                                              |           |
| 50.3 | Row actions    | Every row shows a ghost **"Review"** button that navigates to the detail page. Pending rows also show the outline **"Review"** pill (same as Pending tab).                |           |
| 50.4 | Row sort order | Defaults to the backend ordering (newest first by `created_at`).                                                                                                          |           |

---

## 51. Teacher Request Detail — Load

**URL:** `/en/report-cards/requests/{id}`

| #     | What to Check                        | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 51.1  | Navigate to the detail page          | Network: `GET /api/v1/report-card-teacher-requests/{id}` (200). Response is wrapped via `Envelope<T>`. If the request has a `academic_period_id`, a secondary `GET /api/v1/academic-periods?pageSize=100` fetches the period name. |           |
| 51.2  | **Back to requests** button          | Ghost button above the header. Navigates to `/en/report-cards/requests`.                                                                                                                                                           |           |
| 51.3  | Page heading                         | **"Request details"**.                                                                                                                                                                                                             |           |
| 51.4  | Status badge + type                  | Top of the detail card: status Badge + the type label in secondary text.                                                                                                                                                           |           |
| 51.5  | Description list                     | 2-column grid (on sm+) showing: **Requester** (name + email), **Period** (friendly name or em-dash), **Scope** (readable summary), **Requested at** (localised date-time).                                                         |           |
| 51.6  | **Reason** block                     | Full reason text in `whitespace-pre-wrap` so line breaks render.                                                                                                                                                                   |           |
| 51.7  | **Review note** block (after review) | Only rendered when `row.review_note !== null`. Shows the note + a footer line **"Reviewed by: {reviewer name} — {datetime}"**.                                                                                                     |           |
| 51.8  | Loading skeleton                     | 4 pulsing 12-height bars.                                                                                                                                                                                                          |           |
| 51.9  | Load failure                         | EmptyState with AlertCircle icon + localised "Failed to load" title.                                                                                                                                                               |           |
| 51.10 | Missing request                      | EmptyState with AlertCircle icon + localised "Not found" title.                                                                                                                                                                    |           |

---

## 52. Teacher Request Detail — Approve & Open

| #    | What to Check                                                        | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 52.1 | **Approve & open** primary button (admin, status=pending)            | Check icon, primary colour. Only rendered when `isAdmin && row.status === 'pending'`.                                                                                                                |           |
| 52.2 | Click Approve & open                                                 | `PATCH /api/v1/report-card-teacher-requests/{id}/approve` with `{auto_execute: false}`. Toast **"Approved"**. Based on the request type and fields, the user is routed to a pre-filled wizard/modal. |           |
| 52.3 | Routing for `open_comment_window` with `academic_period_id` set      | Navigates to `/en/report-comments?open_window_period={period_id}`. The Report Comments landing page detects the query param and auto-opens the Open Window modal with the period pre-filled.         |           |
| 52.4 | Routing for `open_comment_window` WITHOUT period (full-year request) | Navigates to `/en/report-cards/requests` (the list). Admin can re-open the window manually. Future enhancement: handle full-year via the RequestReopenModal's sentinel.                              |           |
| 52.5 | Routing for `regenerate_reports`                                     | Navigates to `/en/report-cards/generate?scope_mode={mode}&scope_ids={comma list}&period_id={period}`. The wizard hands off to Step 6 via the pre-fill effect in section 32.                          |           |
| 52.6 | Approve failure                                                      | Toast **"Approval failed"**. Page stays on the detail view with status unchanged.                                                                                                                    |           |

---

## 53. Teacher Request Detail — Auto-Approve & Execute

| #    | What to Check                             | Expected Result                                                                                                                                                                                                                                      | Pass/Fail |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 53.1 | **Auto-approve & execute** outline button | Play icon. Clicking opens a `ConfirmDialog` (default variant, NOT destructive) titled **"Auto-approve & execute"** with the body **"Auto-approve and execute this request immediately?"** and confirm label **"Auto-approve & execute"**.            |           |
| 53.2 | Confirm                                   | `PATCH /api/v1/report-card-teacher-requests/{id}/approve` with `{auto_execute: true}`. Toast **"Approved"**.                                                                                                                                         |           |
| 53.3 | Behaviour for `open_comment_window`       | The backend's auto-execute path creates a fresh comment window inheriting the homeroom assignments from the most recent prior window for the same period (B14 fix). The detail page refetches and shows status `approved` + a `resulting_window_id`. |           |
| 53.4 | Behaviour for `regenerate_reports`        | The backend triggers a generation run via the generation service and returns a `resulting_run_id`. The detail page refetches.                                                                                                                        |           |
| 53.5 | Cancel on the ConfirmDialog               | Dialog closes, no API call, no status change.                                                                                                                                                                                                        |           |
| 53.6 | Failure                                   | Toast **"Approval failed"**. Request stays pending.                                                                                                                                                                                                  |           |

---

## 54. Teacher Request Detail — Reject Flow

| #    | What to Check                                         | Expected Result                                                                                                                                                                                                              | Pass/Fail |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 54.1 | **Reject** destructive button (admin, status=pending) | X icon, destructive variant (red). Opens the `<RejectModal>`.                                                                                                                                                                |           |
| 54.2 | RejectModal layout                                    | Dialog with title **"Reject request"** and description. Single field: a Textarea labelled **"Rejection note"**. Required (min 1 character after trim). Footer: **Cancel** + **Reject** (destructive) buttons.                |           |
| 54.3 | Submit with empty note                                | Zod validation from `rejectTeacherRequestSchema` fails. Red **"Please provide a reason"** error below the textarea. No API call.                                                                                             |           |
| 54.4 | Submit with valid note                                | `PATCH /api/v1/report-card-teacher-requests/{id}/reject` with `{review_note}`. Toast **"Rejected"**. Modal closes. Detail page refetches; status flips to `rejected` and the review note appears in the "Review note" block. |           |
| 54.5 | Cancel                                                | Closes modal without an API call.                                                                                                                                                                                            |           |
| 54.6 | Rejection failure                                     | Toast **"Rejection failed"**. Modal stays open.                                                                                                                                                                              |           |

---

## 55. Report Comments Landing — Admin Load

**URL:** `/en/report-comments`

An admin on this page sees the **full curriculum matrix** — every `(class, subject)` pair in `class_subject_grade_configs`, every homeroom class — because the backend's `getLandingScopeForActor()` returns `is_admin: true` with the complete list.

| #    | What to Check                     | Expected Result                                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 55.1 | Navigate to `/en/report-comments` | Network calls in parallel: `GET /api/v1/report-comment-windows/active`, `GET /api/v1/report-comment-windows/landing`, `GET /api/v1/year-groups?pageSize=100`, `GET /api/v1/classes?pageSize=200&homeroom_only=false`, `GET /api/v1/classes?pageSize=200`, `GET /api/v1/subjects?pageSize=100`, `GET /api/v1/academic-periods?pageSize=50`. |           |
| 55.2 | Landing scope response            | `{is_admin: true, overall_class_ids: [], subject_assignments: [{class_id, subject_id}, ...], active_window_id: '...' or null}`. For an admin, `overall_class_ids` is always `[]` (a sentinel meaning "no filter — show all homerooms").                                                                                                    |           |
| 55.3 | Page heading                      | **"Report Comments"** with subtitle **"Write and finalise subject and overall comments for student report cards."**.                                                                                                                                                                                                                       |           |
| 55.4 | **Back to Report Cards** button   | Ghost button in the header.                                                                                                                                                                                                                                                                                                                |           |
| 55.5 | Loading skeleton                  | Two year-group block skeletons, each with 3 pulsing card skeletons in a responsive grid.                                                                                                                                                                                                                                                   |           |
| 55.6 | Counts are skipped for admins     | To avoid the 100-req/60s rate limit blowout on a large curriculum matrix (B10 fix), admins get `finalised: 0, total: 0` placeholders for every card. The card bodies show **"No comments yet"** instead of a percentage. Per-pair count fetches do NOT fire at all when `scope.is_admin === true`.                                         |           |

---

## 56. Report Comments — Window Banner (Admin)

Rendered above the cards. Admins see different buttons depending on whether a window is open.

### 56.1 Window is open

| #      | What to Check                                  | Expected Result                                                                                                                                                                               | Pass/Fail |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 56.1.1 | Banner frame                                   | `rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4`. `aria-live="polite"`.                                                                                                           |           |
| 56.1.2 | Icon + heading                                 | CheckCircle2 icon in a circular emerald bubble. Heading **"Comment window open"**.                                                                                                            |           |
| 56.1.3 | Body text                                      | **"Comment window open for {period} — closes {closesAt}."** where closesAt is formatted via `Intl.DateTimeFormat({day, month: 'short', year, hour, minute})` with Gregorian + Latin numerals. |           |
| 56.1.4 | Instructions line                              | When `window.instructions !== null`, a smaller paragraph **"Principal's note: {instructions}"** renders below the body text.                                                                  |           |
| 56.1.5 | **Extend** button (admin only, window open)    | Outline button with Timer icon. Opens the Extend Window modal (section 63).                                                                                                                   |           |
| 56.1.6 | **Close now** button (admin only, window open) | Outline button with X icon. Opens the Close Window ConfirmDialog (section 64). While closing, label flips to **"Closing…"**.                                                                  |           |

### 56.2 Window is closed OR no window ever opened

| #      | What to Check                                                     | Expected Result                                                                                                                                                                                  | Pass/Fail |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 56.2.1 | Banner frame                                                      | `rounded-2xl border border-border bg-surface-secondary p-4`.                                                                                                                                     |           |
| 56.2.2 | Icon + heading                                                    | Lock icon in a tertiary bubble. Heading **"Comment window closed"**.                                                                                                                             |           |
| 56.2.3 | Body text                                                         | **"No comments can be written right now."** when a prior window exists, or **"No comment activity yet. A principal will open a window when the period closes."** when there's no history at all. |           |
| 56.2.4 | **Open window** primary button (admin)                            | Plus icon. Opens the Open Window modal (section 57-61). While opening, label flips to **"Opening…"**.                                                                                            |           |
| 56.2.5 | **Reopen** outline button (admin, only when `window` is non-null) | RotateCcw icon. Fires `PATCH /api/v1/report-comment-windows/{id}/reopen`. Page refetches.                                                                                                        |           |

---

## 57. Open Window Modal — Academic Period

**Dialog open:** click the Open window button on a closed-window banner, or arrive via `?open_window_period={id}` query param.

| #    | What to Check                  | Expected Result                                                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 57.1 | Dialog title                   | **"Open comment window"** with description **"Opening a window allows teachers to write and finalise comments for the selected period."**.                                             |           |
| 57.2 | Network calls on mount         | `GET /api/v1/academic-periods?pageSize=100`, `GET /api/v1/classes?pageSize=200&status=active&homeroom_only=false`, `GET /api/v1/staff-profiles?pageSize=100&employment_status=active`. |           |
| 57.3 | **Academic period** select     | Required. Dropdown lists every period from the first call. Placeholder **"Select a period"**.                                                                                          |           |
| 57.4 | Select a period                | Trigger updates. On submit, the period id is sent as `academic_period_id`.                                                                                                             |           |
| 57.5 | Submit with no period selected | Zod refine rejects with `periodRequired`. Red error text **"Please select a period"** renders below the select. No API call.                                                           |           |

---

## 58. Open Window Modal — Opens At / Closes At

| #    | What to Check                        | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 58.1 | **Opens at** field                   | `<input type="datetime-local">`. Default value pre-filled with **now** (local time, via `nowLocalInput()`). Min height 11 (44px for touch targets).      |           |
| 58.2 | **Closes at** field                  | `<input type="datetime-local">`. No default. Required.                                                                                                   |           |
| 58.3 | Zod validation: closes_at > opens_at | If `closes_at` is not strictly after `opens_at`, the form refine throws `validationClosesAfterOpens` and shows red error text below the closes_at field. |           |
| 58.4 | Zod validation: closes_at required   | Empty field → `closesAtRequired` error message.                                                                                                          |           |

---

## 59. Open Window Modal — Instructions

| #    | What to Check      | Expected Result                                                      | Pass/Fail |
| ---- | ------------------ | -------------------------------------------------------------------- | --------- |
| 59.1 | Field              | `<Textarea rows={3}>` with a placeholder. Optional (max 2000 chars). |           |
| 59.2 | On submit, sent as | `instructions: {trimmed} \|\| null`. Empty string submits as `null`. |           |

---

## 60. Open Window Modal — Homeroom Teacher Picker

This is the B4-new feature: one row per active homeroom class with a per-class teacher selector.

| #     | What to Check                                 | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 60.1  | Section frame                                 | Bordered `bg-surface-secondary/40 p-3`. Label **"Homeroom teacher per class"** with a helper paragraph about picking a teacher per class.                                                                        |           |
| 60.2  | Assigned counter                              | Right side of the section header: **"{assigned} of {total} assigned"** (e.g. **"3 of 16 assigned"**). Updates live as the admin picks teachers.                                                                  |           |
| 60.3  | Class rows                                    | One row per active class returned by the classes API. Layout: class name (medium weight) + year group name (small tertiary) on the left; a Select dropdown on the right.                                         |           |
| 60.4  | Class sort order                              | Ascending by `year_group.name`, then by `class.name`. Classes without a year group sink to the bottom.                                                                                                           |           |
| 60.5  | Teacher select — options                      | First option: **"— No homeroom teacher —"** (sentinel `__none__`). Remaining: every staff profile with a `teacher` role entry, sorted alphabetically by last name. Each option shows full name + email subtitle. |           |
| 60.6  | Teacher select — default                      | Unselected (placeholder **"Select a teacher"**) for every class.                                                                                                                                                 |           |
| 60.7  | Pick a teacher                                | The class id ↔ staff id pair is stored in `homeroom_picks`. The assigned counter increments.                                                                                                                     |           |
| 60.8  | Pick the **"— No homeroom teacher —"** option | Removes any existing pick for that class. Counter decrements.                                                                                                                                                    |           |
| 60.9  | Loading state                                 | While the staff/classes calls are in flight, the section shows 4 pulsing row skeletons.                                                                                                                          |           |
| 60.10 | Empty classes tenant                          | A centred **"No active classes for this tenant."** message in place of the rows.                                                                                                                                 |           |
| 60.11 | Staff-profiles pageSize = 100                 | The request uses `pageSize=100` (NOT 200). The backend schema rejects `pageSize > 100` with a 400 error, which would blow up the whole Promise.all. The cap of 100 is deliberate (B-hotfix).                     |           |

---

## 61. Open Window Modal — Submit

| #    | What to Check               | Expected Result                                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 61.1 | Footer buttons              | **Cancel** (outline, closes the modal without saving) + **Open window** (primary, submits the form). **Open window** label flips to **"Submitting…"** while in flight.                                                                                                                                     |           |
| 61.2 | Successful submit           | `POST /api/v1/report-comment-windows` with payload `{academic_period_id, opens_at: ISO, closes_at: ISO, instructions, homeroom_assignments: [{class_id, homeroom_teacher_staff_id}]}`. Response 201. Toast **"Window opened"**. Modal closes. Landing page refetches and shows the new open-window banner. |           |
| 61.3 | Backend validation failures | **HOMEROOM_CLASS_NOT_FOUND** / **HOMEROOM_STAFF_NOT_FOUND** / **HOMEROOM_CLASS_WRONG_YEAR** / **COMMENT_WINDOW_ALREADY_OPEN** → toast **"Failed to open window"** with the server's message. Modal stays open.                                                                                             |           |
| 61.4 | Empty homeroom picks        | Valid — the window opens with zero homeroom assignments. Overall-comment cards just don't render for any class on the landing page.                                                                                                                                                                        |           |

---

## 62. Open Window Modal — Pre-Fill From Approved Request

| #    | What to Check                                                         | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 62.1 | Land on `/en/report-comments?open_window_period={period_id}` as admin | The page's `openWindowHandoffRef` effect detects the param, stores it in `prefilledPeriodId`, opens the modal (`setOpenWindowModalOpen(true)`), and removes the query param from the URL via `history.replaceState`. |           |
| 62.2 | Modal's Academic period select                                        | Pre-populated with the period from the query param (via `defaultPeriodId` prop).                                                                                                                                     |           |
| 62.3 | Closing the modal                                                     | Clears `prefilledPeriodId` in the parent so a fresh open re-initialises clean.                                                                                                                                       |           |

---

## 63. Extend Window Modal

| #    | What to Check                                | Expected Result                                                                                                                                                                             | Pass/Fail |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 63.1 | Dialog open                                  | Title **"Extend comment window"** with description **"Push the close time out to give teachers more time."**.                                                                               |           |
| 63.2 | **New close date** field                     | `<input type="datetime-local">`, pre-filled with the current `window.closes_at` converted to local time via `toLocalInput()`. Min height 11.                                                |           |
| 63.3 | **Cancel** button                            | Closes the modal, no API call.                                                                                                                                                              |           |
| 63.4 | **Extend** primary button                    | Disabled when `isSubmitting`, no windowId, or empty closesAt. Otherwise enabled. Label flips to **"Submitting…"** while in flight.                                                          |           |
| 63.5 | Successful submit                            | `PATCH /api/v1/report-comment-windows/{id}/extend` with `{closes_at: ISO}`. Toast **"Window extended"**. Modal closes. Landing page refetches — the banner now shows the updated closes_at. |           |
| 63.6 | Server validation: new closes_at <= opens_at | Backend rejects with INVALID_WINDOW_EXTEND. Toast **"Failed to extend"**. Modal stays open.                                                                                                 |           |
| 63.7 | Server validation: status not open/scheduled | Backend rejects with INVALID_WINDOW_EXTEND. Toast shows the server message.                                                                                                                 |           |

---

## 64. Close Window Confirm Dialog

| #    | What to Check                                      | Expected Result                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 64.1 | ConfirmDialog title                                | **"Close comment window?"**.                                                                                                                        |           |
| 64.2 | Description                                        | **"Closing the window locks all comment edits immediately. Teachers will need to submit a request to make further changes."**.                      |           |
| 64.3 | Variant                                            | `warning` (amber accent).                                                                                                                           |           |
| 64.4 | **Close window** confirm button                    | Amber tone. On click, fires `PATCH /api/v1/report-comment-windows/{id}/close`. Toast **"Window closed"**. Landing refetches with the closed banner. |           |
| 64.5 | **Cancel** button                                  | Closes the dialog. No API call.                                                                                                                     |           |
| 64.6 | Busy state                                         | `closingInFlight` flag disables both buttons while the PATCH is in flight. The Close now button on the banner also reads **"Closing…"**.            |           |
| 64.7 | Dialog doesn't dismiss on outside click while busy | Verify the modal stays mounted until the API call resolves.                                                                                         |           |

---

## 65. Reopen Window (Admin)

| #    | What to Check                                   | Expected Result                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 65.1 | **Reopen** button on the closed-window banner   | Only visible when `window` is non-null (a closed window exists). Rotate icon.                                                       |           |
| 65.2 | Click Reopen                                    | `PATCH /api/v1/report-comment-windows/{id}/reopen`. Toast **"Window reopened"**. Landing refetches. Banner flips to the open state. |           |
| 65.3 | Reopen failure (another window is already open) | Backend responds with COMMENT_WINDOW_ALREADY_OPEN (409). Toast **"Another comment window is already open"**. Banner stays closed.   |           |

---

## 66. Overall Comments Editor — Admin Load

**URL:** `/en/report-comments/overall/{classId}`

Enter by clicking a homeroom card on `/en/report-comments`, or by navigating directly.

| #    | What to Check                         | Expected Result                                                                                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 66.1 | Navigate to the overall editor for 2A | Network in parallel: `GET /api/v1/report-comment-windows/active`, `GET /api/v1/report-cards/classes/{classId}/matrix?academic_period_id={periodId}`, `GET /api/v1/report-card-overall-comments?class_id={classId}&academic_period_id={periodId}&pageSize=200`. |           |
| 66.2 | If no active window exists            | The editor still loads — it falls back to `GET /api/v1/academic-periods?pageSize=1` and uses the first period id to fetch the matrix + comments so admins can read the historical content.                                                                     |           |
| 66.3 | Page heading                          | **"Overall comments — {class_name}"** (e.g. **"Overall comments — 2A"**). Subtitle shows **"Period: {period_name}"**.                                                                                                                                          |           |
| 66.4 | **Back to Report Comments** button    | Ghost button in the header. Navigates to `/en/report-comments`.                                                                                                                                                                                                |           |
| 66.5 | Window banner                         | Reuses the same `<WindowBanner>` component. For admins on this page, the only interactive control surfaced is `onRequestReopen={undefined}` — admins manage windows from the landing page itself.                                                              |           |
| 66.6 | Filter dropdown                       | On the toolbar: a Select with options **"All"** (default), **"Unfinalised"**, **"Finalised"**. Filters the visible rows without re-fetching.                                                                                                                   |           |
| 66.7 | Loading skeleton                      | 6 pulsing 20-height bars.                                                                                                                                                                                                                                      |           |
| 66.8 | Load failure                          | EmptyState with ArrowLeft icon + localised "Failed to load" title.                                                                                                                                                                                             |           |
| 66.9 | No students                           | EmptyState with ArrowLeft icon + "No students enrolled".                                                                                                                                                                                                       |           |

---

## 67. Overall Comments Editor — Write, Autosave, Finalise

### 67.1 Table structure

| #      | What to Check      | Expected Result                                                                                                                                                  | Pass/Fail |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 67.1.1 | Column headers     | Sticky primary-900 **Student** column (200px wide), primary-700 **Overall grade** column (140px wide), primary-800 **Comment** column (flex, min 320px).         |           |
| 67.1.2 | Row count          | One row per student in `matrix.students`, filtered by the active filter dropdown.                                                                                |           |
| 67.1.3 | Student cell       | Sticky, first + last name in medium weight. Optional student number in a mono LTR subtitle.                                                                      |           |
| 67.1.4 | Overall grade cell | Primary-100 pill with the student's `weighted_average` formatted as `%`, or falls back to `overall_grade` letter, or shows the localised "No grade" placeholder. |           |
| 67.1.5 | Comment cell       | Contains badges (Finalised/Saving/Saved/Error), a Textarea, and the Finalise/Unfinalise button.                                                                  |           |

### 67.2 Write & autosave

| #      | What to Check                   | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 67.2.1 | Textarea                        | 4 rows, placeholder from `reportComments.editor.placeholder`. Read-only when window is not open or row is already finalised.                                                                                                         |           |
| 67.2.2 | Type in a textarea              | Each keystroke updates the row's `text` locally. 500ms after the last keystroke, autosave fires `POST /api/v1/report-card-overall-comments` with `{student_id, class_id, academic_period_id, comment_text}`.                         |           |
| 67.2.3 | Status transitions              | `idle → saving → saved → idle` (after a 1.2s delay). Saving shows tertiary **"Saving…"**. Saved shows emerald **"Saved"**. Error shows red **"Failed to save"**.                                                                     |           |
| 67.2.4 | Type then navigate away quickly | The `cancelledRef.current = true` in the useEffect cleanup plus `clearTimeout()` on each pending save timer prevents stale saves from firing after unmount.                                                                          |           |
| 67.2.5 | Save with empty/whitespace text | No API call. Status resets to `idle`. The backend receives no request — empty comments stay unpersisted.                                                                                                                             |           |
| 67.2.6 | Server error on save            | Status flips to `error` with a red message. Toast **"Failed to save"**.                                                                                                                                                              |           |
| 67.2.7 | Fake student_id edge case       | If the scope (student, class) pair doesn't match an enrolment, the backend throws `404 STUDENT_NOT_ENROLLED_IN_CLASS` (B13 fix). Status flips to error. This should never happen from the UI since the matrix returns real students. |           |

### 67.3 Finalise

| #      | What to Check               | Expected Result                                                                                                                                                                           | Pass/Fail |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 67.3.1 | **Finalise** primary button | Check icon. Disabled when: window is closed, row has no comment_id yet (i.e. text was never autosaved), or text is empty. Otherwise enabled.                                              |           |
| 67.3.2 | Click Finalise              | `PATCH /api/v1/report-card-overall-comments/{comment_id}/finalise`. Row's `finalised_at` timestamp is set from the response. Toast **"Finalised"**. The row's Textarea becomes read-only. |           |
| 67.3.3 | Finalise failure            | Toast **"Failed to finalise"**. Row stays in draft state.                                                                                                                                 |           |

---

## 68. Overall Comments Editor — Unfinalise, Filter, Closed-Window State

### 68.1 Unfinalise

| #      | What to Check                 | Expected Result                                                                                                                               | Pass/Fail |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 68.1.1 | **Unfinalise** outline button | RotateCw icon. Replaces the Finalise button when the row is finalised. Disabled when window is closed.                                        |           |
| 68.1.2 | Click Unfinalise              | `PATCH /api/v1/report-card-overall-comments/{comment_id}/unfinalise`. Row's `finalised_at` clears to `null`. Textarea becomes editable again. |           |
| 68.1.3 | Unfinalise failure            | Toast **"Failed to finalise"** (error text is shared between finalise / unfinalise).                                                          |           |

### 68.2 Filter

| #      | What to Check           | Expected Result                                              | Pass/Fail |
| ------ | ----------------------- | ------------------------------------------------------------ | --------- |
| 68.2.1 | Filter: **All**         | Default. Every row visible.                                  |           |
| 68.2.2 | Filter: **Finalised**   | Only rows with `finalised_at !== null`. Applied client-side. |           |
| 68.2.3 | Filter: **Unfinalised** | Only rows with `finalised_at === null`.                      |           |

### 68.3 Closed-window banner

| #      | What to Check                             | Expected Result                                                                                                               | Pass/Fail |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 68.3.1 | When `activeWindow.status !== 'open'`     | Below the table, a bordered secondary banner reads **"The comment window is closed — you're viewing a read-only snapshot."**. |           |
| 68.3.2 | Finalise / Unfinalise buttons when closed | Disabled. Textareas are read-only. The editor remains navigable for historical review.                                        |           |

---

## 69. Subject Comments Editor — Admin Load

**URL:** `/en/report-comments/subject/{classId}/{subjectId}`

| #    | What to Check                                                   | Expected Result                                                                                                                                                                                                                                                           | Pass/Fail |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 69.1 | Navigate to `/en/report-comments/subject/{classId}/{subjectId}` | Network: `GET /api/v1/report-comment-windows/active`, `GET /api/v1/report-cards/classes/{classId}/matrix?academic_period_id={periodId}`, `GET /api/v1/report-card-subject-comments?class_id={classId}&subject_id={subjectId}&academic_period_id={periodId}&pageSize=200`. |           |
| 69.2 | Page heading                                                    | **"{Subject name} — {class_name}"** (e.g. **"English — 2A"**). Subtitle: **"Period: {period_name}"**.                                                                                                                                                                     |           |
| 69.3 | **Back to Report Comments** button                              | Ghost button in the header.                                                                                                                                                                                                                                               |           |
| 69.4 | Window banner                                                   | Same as overall editor. No admin-only controls (admin manages the window from the landing page).                                                                                                                                                                          |           |
| 69.5 | Filter dropdown                                                 | **"All"**, **"Unfinalised"**, **"Finalised"**.                                                                                                                                                                                                                            |           |
| 69.6 | Row count                                                       | One row per student in the class matrix.                                                                                                                                                                                                                                  |           |
| 69.7 | Loading skeleton                                                | 6 pulsing bars.                                                                                                                                                                                                                                                           |           |
| 69.8 | Defensive guards                                                | The code defends against partial matrix responses via `matrixData.students ?? []`, `matrixData.cells ?? {}`, `matrixData.overall_by_student ?? {}`. A broken response must not crash the page.                                                                            |           |

### 69.9 Row structure (via `<SubjectCommentRow>`)

| #      | Column      | Content                                                                                                                                                                                                                       | Pass/Fail |
| ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 69.9.1 | **Student** | Sticky primary-900 column. First + last name, optional student number.                                                                                                                                                        |           |
| 69.9.2 | **Score**   | 160px wide column. Shows the student's subject cell score as `{score.toFixed(1)}%` (or grade letter fallback). Includes a Sparkline glyph hinting at trend. The sparkline uses `[score, weighted_average]` as its data array. |           |
| 69.9.3 | **Comment** | Flex column with badges (AI draft purple, Finalised emerald, Saving/Saved/Error/Drafting), Textarea (3 rows), and action buttons (AI draft / Finalise or Unfinalise).                                                         |           |

---

## 70. Subject Comments Editor — AI Draft (Per Row)

| #    | What to Check               | Expected Result                                                                                                                                                                                                                                              | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 70.1 | **AI draft** outline button | Sparkles icon. Disabled when: window closed, row is `drafting` already, or row is already finalised.                                                                                                                                                         |           |
| 70.2 | Click AI draft              | Row status flips to `drafting` with a purple helper line **"Drafting…"**. Fires `POST /api/v1/report-card-subject-comments/ai-draft` with `{student_id, subject_id, class_id, academic_period_id}`. Response populates `comment_text` + `is_ai_draft: true`. |           |
| 70.3 | Successful draft            | The Textarea is updated with the AI-generated text, a purple **"AI draft"** Badge renders above the textarea, status briefly flips to `saved` then back to `idle` after 1.2s. Toast **"AI draft generated"**.                                                |           |
| 70.4 | Failure                     | Toast **"AI draft failed"**. Status flips to `error`.                                                                                                                                                                                                        |           |
| 70.5 | Editing after AI draft      | As soon as the teacher/admin edits the text, `is_ai_draft` flips to `false` locally and the purple badge disappears. The next autosave writes `is_ai_draft: false` to the backend.                                                                           |           |

---

## 71. Subject Comments Editor — AI Draft All Empty (Bulk)

| #    | What to Check                                       | Expected Result                                                                                                                                                          | Pass/Fail |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 71.1 | **AI-draft all empty** outline button (top toolbar) | Sparkles icon. Disabled when window closed OR `bulkInFlight !== 'none'`. Label flips to **"Drafting…"** while running.                                                   |           |
| 71.2 | Click                                               | Iterates every row whose `text.trim().length === 0`, calling `handleAiDraft()` sequentially for each. `for ... of` + `await` — no parallel stampede.                     |           |
| 71.3 | No empty rows                                       | Toast **"No empty rows to draft"**. No API calls.                                                                                                                        |           |
| 71.4 | Progress visibility                                 | Each target row independently flips to `drafting` as it's processed, then to `saved` → `idle` on completion. The toolbar button stays disabled until all targets finish. |           |

---

## 72. Subject Comments Editor — Finalise All Drafts (Bulk)

| #    | What to Check                          | Expected Result                                                                                                                                                                                                                                                                           | Pass/Fail |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 72.1 | **Finalise all drafts** outline button | Check icon. Disabled when window closed OR any bulk in flight. Label flips to **"Finalising…"**.                                                                                                                                                                                          |           |
| 72.2 | Click                                  | Filter to rows with `comment_id`, not yet finalised, and non-empty text. If zero matches, toast **"No comments to finalise"**. Otherwise fire `POST /api/v1/report-card-subject-comments/bulk-finalise` with `{class_id, subject_id, academic_period_id}`. Response returns `{count: n}`. |           |
| 72.3 | Optimistic update                      | After the API responds, the frontend patches every matching row with `finalised_at = new Date().toISOString()` locally so the UI updates without a refetch. Toast **"Finalised {n} drafts"**.                                                                                             |           |
| 72.4 | Failure                                | Toast **"Failed to finalise"**.                                                                                                                                                                                                                                                           |           |

---

## 73. Subject Comments Editor — Row-Level Actions

| #    | What to Check                         | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 73.1 | **Finalise** primary button (per row) | Check icon. Disabled when text is empty or no comment_id yet. On click, `PATCH /api/v1/report-card-subject-comments/{id}/finalise`. Response updates `finalised_at` and `is_ai_draft: false`.                  |           |
| 73.2 | **Unfinalise** outline button         | Replaces Finalise when row is finalised. Click fires `PATCH /api/v1/report-card-subject-comments/{id}/unfinalise`. Clears `finalised_at`. Reverts Textarea to editable.                                        |           |
| 73.3 | Autosave debounce                     | 500ms debounce between keystrokes and the POST. Typing rapidly coalesces into one save.                                                                                                                        |           |
| 73.4 | Badges                                | **AI draft** (purple, visible only when `is_ai_draft && !finalised_at`). **Finalised** (emerald, visible when `finalised_at !== null`). **Saving/Saved/Error/Drafting** helpers render inline with the badges. |           |

---

## 74. Retired Redirect Stubs

| #    | What to Check                            | Expected Result                                                                                                                                                            | Pass/Fail |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 74.1 | Navigate to `/en/report-cards/approvals` | The page immediately calls `router.replace('/{locale}/report-cards/requests')`. The URL bar updates to `/en/report-cards/requests` without a history entry (replaceState). |           |
| 74.2 | Navigate to `/en/report-cards/bulk`      | Immediately redirects to `/en/report-cards`.                                                                                                                               |           |
| 74.3 | Browser Back                             | Pressing Back from either redirect destination does NOT bring the user back to the retired URL — it skips past it to whatever was on the stack before.                     |           |

---

## 75. Arabic / RTL

Switch the locale by changing `/en/` to `/ar/` in the URL bar.

| #    | What to Check                  | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 75.1 | `/ar/report-cards`             | Page direction is `rtl`. All labels translated to Arabic. The settings cog button, quick-action tiles, period selector, analytics snapshot, and classes grid all mirror correctly (`ms-`/`me-` logical spacing). |           |
| 75.2 | Grade cell content             | Inside the class matrix (and the overall/subject editors), numeric cells are wrapped in `dir="ltr"` so grade letters and percentages render left-to-right even inside an RTL layout.                             |           |
| 75.3 | Student numbers + locale codes | Rendered with `dir="ltr"` to keep the `STU-000144` / `EN` formatting stable.                                                                                                                                     |           |
| 75.4 | Date formatting                | Uses `Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn')` — Gregorian calendar, Latin numerals, Arabic text. No Hijri dates.                                                                                         |           |
| 75.5 | Generation wizard              | Step indicator chevrons + Back/Next buttons mirror: Back is on the right, Next on the left (RTL).                                                                                                                |           |
| 75.6 | Open Window modal              | Header, Select triggers, buttons all mirror. Homeroom picker grid uses `grid-cols-[1fr_minmax(0,1.4fr)]` which still works under RTL.                                                                            |           |
| 75.7 | Checkbox in the library table  | Aligned to the start of the row (left in LTR, right in RTL) via `ps-` logical padding on the header cell.                                                                                                        |           |

---

## 76. Role Gating — What Admins Can Do That Teachers Cannot

This section is the negative assertion half — every row describes something a teacher would NOT be able to do. Verify each one works for the admin AND blocks on the teacher (use `sarah.daly@nhqs.test` in a second browser session to double-check).

| #     | Admin-only action                                                                                                | Verification                                                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 76.1  | Generate report cards (wizard)                                                                                   | Admin navigates to `/en/report-cards/generate`. Teacher hits the same URL → toast **"Permission denied"** + `router.replace('/en/report-cards')`.                                                                                                                                              |           |
| 76.2  | Edit settings                                                                                                    | Admin's PATCH works. Teacher's PATCH gets 403 `report_cards.manage` required. The settings page still loads (read-only mode) because `report_cards.view` is granted.                                                                                                                           |           |
| 76.3  | Delete a report card                                                                                             | Admin's DELETE works. Teacher gets 403 on `DELETE /api/v1/report-cards/{id}` and `POST /api/v1/report-cards/bulk-delete`.                                                                                                                                                                      |           |
| 76.4  | Publish / Unpublish a report card                                                                                | Admin's POST works. Teacher's POST gets 403.                                                                                                                                                                                                                                                   |           |
| 76.5  | Open a comment window                                                                                            | Admin's POST to `/v1/report-comment-windows` succeeds. Teacher's POST returns 403.                                                                                                                                                                                                             |           |
| 76.6  | Close / Extend / Reopen a window                                                                                 | Same — admin-only.                                                                                                                                                                                                                                                                             |           |
| 76.7  | Approve / Reject a teacher request                                                                               | Admin's PATCH works. Teacher's PATCH returns 403. The detail page also hides the Approve / Auto-approve / Reject buttons for non-admins.                                                                                                                                                       |           |
| 76.8  | See teacher requests list                                                                                        | Admin sees every tenant request. Teacher sees only their own (scoped server-side).                                                                                                                                                                                                             |           |
| 76.9  | Read any class's report cards list + matrix                                                                      | Admin can read any class via `/api/v1/report-cards?class_id=...` or `/matrix`. Teacher is scoped to their own classes via the B12 fix (401/403 on out-of-scope requests with error code `CLASS_OUT_OF_SCOPE`).                                                                                 |           |
| 76.10 | Write an overall comment for any class                                                                           | Admin can write anywhere (if they are listed as a homeroom teacher on the window). Teacher can only write where `getHomeroomTeacherForClass()` matches their staff_profile_id — otherwise `403 INVALID_AUTHOR` "No homeroom teacher is assigned for this class on the current comment window." |           |
| 76.11 | Write a subject comment                                                                                          | Both admins and teachers can write subject comments via the teacher_competencies × curriculum matrix join. Admin has no extra privilege here — they see all pairs but must still be part of the competencies list to write.                                                                    |           |
| 76.12 | See the Live run panel, Analytics snapshot, Settings button, Generate tile, Teacher requests tile on the landing | All gated by the `isAdmin` React-side check. Teachers see a 2-tile landing (Write comments + Library) via B11.                                                                                                                                                                                 |           |

---

## 77. Console & Network Health

Throughout the whole walkthrough, keep DevTools' Console and Network panels open.

| #    | What to Check         | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 77.1 | Console errors        | Zero uncaught errors. `console.error('[ReportCardsDashboard.*]', err)` lines only appear when an API call genuinely fails.                                              |           |
| 77.2 | Network — 4xx/5xx     | Ignore the normal `401 /api/v1/auth/refresh` at the login page. Everything else should be 200/201/204. 403s are OK for deliberate permission tests.                     |           |
| 77.3 | Rate limit (429)      | No 429 errors should appear on the Report Comments landing page. The B10 fix skips per-pair count fetches for admins, keeping fan-out under the 100 req/60 s throttler. |           |
| 77.4 | Repeated calls        | The dashboard polls `/v1/report-cards/generation-runs` every 5 seconds only when an active run exists. When no run is running, the poll stops.                          |           |
| 77.5 | Memory leaks          | Leave the dashboard open for 5 minutes. Memory usage should stay flat. If it grows, the setInterval cleanup may be missing somewhere.                                   |           |
| 77.6 | WebSocket connections | No websockets — the module uses polling only.                                                                                                                           |           |

---

## 78. Backend Endpoint Map (Reference)

Quick reference of every report-cards endpoint this spec touches. Verify each endpoint at least once during the walkthrough.

| Method | Path                                                                                                   | Used by                                                                                | Required permission                             |
| ------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/v1/report-cards`                                                                                 | Library list (section 37)                                                              | `gradebook.view`                                |
| GET    | `/api/v1/report-cards/classes/:classId/matrix?academic_period_id=...`                                  | Class matrix page (sections 9-13), Overall editor (66), Subject editor (69)            | `report_cards.view`                             |
| POST   | `/api/v1/report-cards/generation-runs`                                                                 | Wizard submit (29)                                                                     | `report_cards.manage`                           |
| POST   | `/api/v1/report-cards/generation-runs/dry-run`                                                         | Wizard step 5 (28)                                                                     | `report_cards.manage`                           |
| GET    | `/api/v1/report-cards/generation-runs/:id`                                                             | Wizard polling (30)                                                                    | `report_cards.manage`                           |
| GET    | `/api/v1/report-cards/generation-runs?page=...`                                                        | Dashboard live run poll (6)                                                            | `report_cards.manage`                           |
| GET    | `/api/v1/report-cards/library?page=1&pageSize=1`                                                       | Dashboard library count (5.3)                                                          | `report_cards.view`                             |
| GET    | `/api/v1/report-cards/library/grouped`                                                                 | Library page (33)                                                                      | `report_cards.view`                             |
| GET    | `/api/v1/report-cards/library/bundle-pdf?class_ids=...&merge_mode=...`                                 | Bundle downloads (39)                                                                  | `report_cards.view`                             |
| POST   | `/api/v1/report-cards/:id/publish`                                                                     | Publish row / bulk (37, 38)                                                            | `gradebook.publish_report_cards`                |
| POST   | `/api/v1/report-cards/:id/revise`                                                                      | Unpublish row / bulk (37, 41)                                                          | `gradebook.manage`                              |
| DELETE | `/api/v1/report-cards/:id`                                                                             | Delete row (37)                                                                        | `gradebook.manage`                              |
| POST   | `/api/v1/report-cards/bulk-delete`                                                                     | Delete selection (38)                                                                  | `gradebook.manage`                              |
| GET    | `/api/v1/report-cards/:id/pdf`                                                                         | Reserved for inline-HTML rendering (rarely used; library downloads use presigned URLs) | `report_cards.view`                             |
| GET    | `/api/v1/report-cards/analytics/dashboard?academic_period_id=...`                                      | Dashboard snapshot (7), Analytics page (43)                                            | `report_cards.view`                             |
| GET    | `/api/v1/report-cards/analytics/class-comparison?academic_period_id=...`                               | Analytics page (45, 46)                                                                | `report_cards.view`                             |
| GET    | `/api/v1/report-cards/templates/content-scopes`                                                        | Wizard step 3 (26), Settings default template (18)                                     | `report_cards.view`                             |
| GET    | `/api/v1/report-card-tenant-settings`                                                                  | Settings load (14), Wizard settings prefill (22)                                       | `report_cards.view`                             |
| PATCH  | `/api/v1/report-card-tenant-settings`                                                                  | Settings save (21)                                                                     | `report_cards.manage`                           |
| POST   | `/api/v1/report-card-tenant-settings/principal-signature`                                              | Signature upload (20.2)                                                                | `report_cards.manage`                           |
| DELETE | `/api/v1/report-card-tenant-settings/principal-signature`                                              | Signature remove (20.2)                                                                | `report_cards.manage`                           |
| GET    | `/api/v1/report-card-teacher-requests?status=pending&page=1&pageSize=1`                                | Dashboard pending count (5.4)                                                          | `report_cards.comment` or `report_cards.manage` |
| GET    | `/api/v1/report-card-teacher-requests?...`                                                             | Requests list (48-50)                                                                  | `report_cards.comment` or `report_cards.manage` |
| GET    | `/api/v1/report-card-teacher-requests/:id`                                                             | Request detail (51)                                                                    | `report_cards.comment` or `report_cards.manage` |
| POST   | `/api/v1/report-card-teacher-requests`                                                                 | Teacher-only new request form (covered in teacher spec)                                | `report_cards.comment`                          |
| PATCH  | `/api/v1/report-card-teacher-requests/:id/approve`                                                     | Approve / Auto-approve (52, 53)                                                        | `report_cards.manage`                           |
| PATCH  | `/api/v1/report-card-teacher-requests/:id/reject`                                                      | Reject (54)                                                                            | `report_cards.manage`                           |
| PATCH  | `/api/v1/report-card-teacher-requests/:id/cancel`                                                      | Cancel own (teacher)                                                                   | `report_cards.comment`                          |
| GET    | `/api/v1/report-comment-windows/active`                                                                | Landing page (55), Overall editor (66), Subject editor (69)                            | `report_cards.view`                             |
| GET    | `/api/v1/report-comment-windows/landing`                                                               | Landing scope (55)                                                                     | `report_cards.view`                             |
| POST   | `/api/v1/report-comment-windows`                                                                       | Open Window modal (57-61)                                                              | `report_cards.manage`                           |
| PATCH  | `/api/v1/report-comment-windows/:id/close`                                                             | Close Window confirm (64)                                                              | `report_cards.manage`                           |
| PATCH  | `/api/v1/report-comment-windows/:id/extend`                                                            | Extend Window modal (63)                                                               | `report_cards.manage`                           |
| PATCH  | `/api/v1/report-comment-windows/:id/reopen`                                                            | Reopen button (65)                                                                     | `report_cards.manage`                           |
| GET    | `/api/v1/report-card-overall-comments?class_id=...&academic_period_id=...&pageSize=200`                | Overall editor (66)                                                                    | `report_cards.view`                             |
| POST   | `/api/v1/report-card-overall-comments`                                                                 | Overall autosave (67.2)                                                                | `report_cards.comment`                          |
| PATCH  | `/api/v1/report-card-overall-comments/:id/finalise`                                                    | Finalise (67.3)                                                                        | `report_cards.comment`                          |
| PATCH  | `/api/v1/report-card-overall-comments/:id/unfinalise`                                                  | Unfinalise (68.1)                                                                      | `report_cards.comment`                          |
| GET    | `/api/v1/report-card-subject-comments?class_id=...&subject_id=...&academic_period_id=...&pageSize=200` | Subject editor (69)                                                                    | `report_cards.view`                             |
| POST   | `/api/v1/report-card-subject-comments`                                                                 | Subject autosave (73.3)                                                                | `report_cards.comment`                          |
| POST   | `/api/v1/report-card-subject-comments/ai-draft`                                                        | Row AI draft (70), Bulk AI (71)                                                        | `report_cards.comment`                          |
| POST   | `/api/v1/report-card-subject-comments/bulk-finalise`                                                   | Bulk finalise (72)                                                                     | `report_cards.comment`                          |
| PATCH  | `/api/v1/report-card-subject-comments/:id/finalise`                                                    | Row finalise (73.1)                                                                    | `report_cards.comment`                          |
| PATCH  | `/api/v1/report-card-subject-comments/:id/unfinalise`                                                  | Row unfinalise (73.2)                                                                  | `report_cards.comment`                          |
| GET    | `/api/v1/academic-periods?pageSize=...`                                                                | Many places — period pickers                                                           | any authenticated                               |
| GET    | `/api/v1/academic-years?pageSize=...`                                                                  | Wizard step 2, Request reopen modal                                                    | any authenticated                               |
| GET    | `/api/v1/year-groups?pageSize=100`                                                                     | Dashboard grid, Wizard step 1, Landing                                                 | any authenticated                               |
| GET    | `/api/v1/classes?pageSize=...`                                                                         | Many places                                                                            | any authenticated                               |
| GET    | `/api/v1/subjects?pageSize=100`                                                                        | Landing page (55)                                                                      | any authenticated                               |
| GET    | `/api/v1/staff-profiles?pageSize=100&employment_status=active`                                         | Open Window modal homeroom picker (60)                                                 | `staff.view`                                    |
| GET    | `/api/v1/students?pageSize=20&search=...`                                                              | Wizard step 1 individual mode (24.6)                                                   | `students.view`                                 |

---

**End of Admin spec.** Sign off below when every row is checked.

| Reviewer name | Date | Pass count | Fail count | Overall result |
| ------------- | ---- | ---------- | ---------- | -------------- |
|               |      |            |            |                |
