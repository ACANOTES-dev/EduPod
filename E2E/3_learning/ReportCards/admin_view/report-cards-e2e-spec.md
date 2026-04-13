# E2E Test Specification: Report Cards (Admin View)

> **Coverage.** Every page, button, form, modal, dialog, state transition, API call, polling loop, and failure mode in the Report Cards module as experienced by an administrator (`school_owner`, `school_principal`, `school_vice_principal`, or `admin`). This is the single source of truth for QC sign-off before tenant onboarding.
>
> **Pages documented (12 unique routes + behaviours):**
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
> 12. Retired redirect stubs — `/en/report-cards/approvals` and `/en/report-cards/bulk`
>
> **Role gating.** These URLs render the Admin variant when the signed-in user holds any of `school_owner`, `school_principal`, `school_vice_principal`, or `admin`. `school_owner` bypasses every permission check via `PermissionCacheService.isOwner()`. Teacher-side behaviour lives in `../teacher_view/report-cards-e2e-spec.md`.

**Base URL:** `https://nhqs.edupod.app`
**Test user:** **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`) — **School Owner** in tenant **Nurul Huda School (NHQS)**. Lands on `/en/dashboard` after login.
**Start navigation:** top morph bar -> **Learning** -> **Assessment** sub-strip -> **Report Cards** tab, OR directly `/en/report-cards`.

---

## How to use this document

Every table below uses the four-column format:

| # | What to Check | Expected Result | Pass/Fail |

- Work through sections in order. Later sections depend on state seeded by earlier ones.
- The **Expected Result** column describes exactly what must happen, including the API call (method + path + relevant query/body fields + expected status).
- The **Pass/Fail** column stays empty for the QC engineer to fill in.
- Each row names exactly **one** user action or observation.
- If something appears on screen that is NOT covered here, add a row to section 80 and mark it `UNDOCUMENTED`.
- `{TOKEN_LIKE_THIS}` placeholders represent data that gets generated during the walkthrough — record the value, reuse it in later rows.

---

## Table of Contents

1. Prerequisites & Test Data
2. Logging in & Landing
3. Navigating to Report Cards
4. Report Cards Dashboard — Page Load
5. Dashboard Header & Period Selector
6. Dashboard Quick-Action Tiles (Admin: 4 tiles)
7. Dashboard Live-Run Status Panel
8. Dashboard Analytics Snapshot Panel
9. Dashboard Classes-by-Year-Group Grid
10. Class Matrix Page — Navigation & Header
11. Class Matrix — Period Filter & Display Toggle
12. Class Matrix — Top-Rank Badges
13. Class Matrix — Empty + Error States
14. Settings Page — Entry Point & Permission Guard
15. Settings — Display Defaults
16. Settings — Comment Gate
17. Settings — Personal Info Fields
18. Settings — Default Template
19. Settings — Grade Thresholds Link + CRUD
20. Settings — Principal Details & Signature Upload
21. Settings — Save Changes
22. Generation Wizard — Entry Point & Permission Guard
23. Wizard Step Indicator
24. Wizard Step 1 — Scope
25. Wizard Step 2 — Period
26. Wizard Step 3 — Template & Design
27. Wizard Step 4 — Personal Info Fields
28. Wizard Step 5 — Comment Gate Dry-Run
29. Wizard Step 6 — Review & Submit
30. Wizard — Running / Polling State
31. Wizard — Terminal Outcomes
32. Wizard — Teacher Request Pre-Fill Handoff
33. Library — Load & View Toggles
34. Library — By Run View
35. Library — By Year-Group View
36. Library — By Class View
37. Library — Row Actions (Publish / Unpublish / Delete / Revise)
38. Library — Bulk Selection + Bulk Delete
39. Library — Bundle Download (PDF merge vs ZIP)
40. Library — Filters
41. Library — Individual PDF Download Contract
42. Analytics — Load & Period Selector
43. Analytics — Summary Cards
44. Analytics — Class Comparison Chart
45. Analytics — Per-Class Generation Progress
46. Teacher Requests — List Page (Pending / All Tabs)
47. Teacher Requests — Detail Page
48. Teacher Requests — Approve & Open Flow
49. Teacher Requests — Auto-Approve Flow
50. Teacher Requests — Reject Flow
51. Report Comments — Landing Page Load
52. Report Comments — Window Banner
53. Report Comments — Open / Extend / Close / Reopen Window Modals
54. Overall Comments Editor — Entry & Permission
55. Overall Comments Editor — Write + Autosave
56. Overall Comments Editor — Finalise + Unfinalise
57. Overall Comments Editor — Request Reopen Modal
58. Subject Comments Editor — Entry & Permission
59. Subject Comments Editor — Write + Autosave
60. Subject Comments Editor — Per-Row AI Draft
61. Subject Comments Editor — Bulk AI Draft All
62. Subject Comments Editor — Bulk Finalise
63. Subject Comments Editor — Unfinalise
64. Approval Configs — List + Create + Edit + Delete
65. Submit for Approval -> Approve / Reject / Bulk-Approve
66. Custom Field Definitions — CRUD + Per-Report Values
67. Grade Threshold Configs — CRUD
68. Acknowledgment Status Viewer
69. Verification Token + Public `/verify/:token` Viewer
70. Batch PDF Endpoint + Bulk Operations
71. Transcript Download
72. Revise Published Report Card
73. Retired Redirect Stubs
74. Role Gates & Permission Denials
75. RLS / Tenant Isolation Smoke
76. Arabic / RTL Walkthrough
77. Mobile Responsiveness (375px)
78. Console & Network Health
79. Backend Endpoint Map
80. Observations, Inconsistencies & Bugs Flagged
81. Sign-Off

---

## 1. Prerequisites & Test Data

Before starting Section 2, verify the following exists in tenant NHQS. If anything is missing, seed it now. Record the IDs/values because later rows reference them.

| #    | What to Check                                                                                 | Expected Result                                                                                                                                                                                                                                                                                                      | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | At least one academic year with status `active` exists                                        | `GET /v1/academic-years?status=active` returns `data[].length >= 1` (200). Record `{ACTIVE_YEAR_ID}`.                                                                                                                                                                                                                |           |
| 1.2  | At least one academic period inside `{ACTIVE_YEAR_ID}` has `status='active'` and covers today | `GET /v1/academic-periods?pageSize=50` contains one entry with `status='active'`. Record `{ACTIVE_PERIOD_ID}` and its `name`.                                                                                                                                                                                        |           |
| 1.3  | At least two classes with enrolled students exist                                             | `GET /v1/classes?pageSize=100` returns `data[].length >= 2` and at least two entries where `_count.class_enrolments > 0`. Record `{CLASS_A_ID}`, `{CLASS_B_ID}`.                                                                                                                                                     |           |
| 1.4  | `{CLASS_A_ID}` has at least 3 students enrolled                                               | `GET /v1/classes/{CLASS_A_ID}/enrolments` returns `data[].length >= 3`. Record `{STUDENT_1_ID}`, `{STUDENT_2_ID}`, `{STUDENT_3_ID}`.                                                                                                                                                                                 |           |
| 1.5  | `{CLASS_A_ID}` has at least one subject mapped via curriculum                                 | `GET /v1/report-cards/classes/{CLASS_A_ID}/matrix?academic_period_id=all` returns `subjects[].length >= 1`. Record `{SUBJECT_1_ID}`.                                                                                                                                                                                 |           |
| 1.6  | At least one assessment is published for `{CLASS_A_ID}` within `{ACTIVE_PERIOD_ID}`           | `GET /v1/assessments?class_id={CLASS_A_ID}&academic_period_id={ACTIVE_PERIOD_ID}` returns `data[].length >= 1` with status `published`. Record `{ASSESSMENT_1_ID}`.                                                                                                                                                  |           |
| 1.7  | Grades entered for `{ASSESSMENT_1_ID}` for at least 3 students                                | `GET /v1/assessments/{ASSESSMENT_1_ID}/grades` returns `data[].length >= 3` with numeric scores.                                                                                                                                                                                                                     |           |
| 1.8  | At least one teacher account exists                                                           | `GET /v1/memberships?role_key=teacher` returns `data[].length >= 1`. Record `{TEACHER_USER_ID}` + email.                                                                                                                                                                                                             |           |
| 1.9  | Yusuf Rahman's identity                                                                       | `GET /v1/auth/me` returns `first_name: 'Yusuf'`, `last_name: 'Rahman'`, `email: 'owner@nhqs.test'`, `role_key` containing `school_owner`, tenant = NHQS. Record `{NHQS_TENANT_ID}`.                                                                                                                                  |           |
| 1.10 | Tenant report-card settings exist                                                             | `GET /v1/report-card-tenant-settings` returns `{ data: { settings: {...} } }` with baseline fields.                                                                                                                                                                                                                  |           |
| 1.11 | Reset tenant settings to baseline before Section 15                                           | `PATCH /v1/report-card-tenant-settings` with `{ matrix_display_mode: 'grade', show_top_rank_badge: false, default_personal_info_fields: ['full_name','student_number','class_name'], require_finalised_comments: true, allow_admin_force_generate: true, default_template_id: null, principal_name: null }` -> 200.  |           |
| 1.12 | No active comment window is open                                                              | `GET /v1/report-comment-windows/active` returns `{ data: null }`. Close one first if open.                                                                                                                                                                                                                           |           |
| 1.13 | No in-flight generation run                                                                   | `GET /v1/report-cards/generation-runs?page=1&pageSize=5` returns 200 and no row has `status` in `['queued','processing']`.                                                                                                                                                                                           |           |
| 1.14 | At least one report-card design template available                                            | `GET /v1/report-cards/templates/content-scopes` returns `data[].length >= 1` with `is_available: true`. Record `{DEFAULT_TEMPLATE_ID}`, `{DESIGN_KEY}`.                                                                                                                                                              |           |
| 1.15 | `gradebook` module enabled for the tenant                                                     | `GET /v1/tenants/me/modules` includes `{ key: 'gradebook', enabled: true }`.                                                                                                                                                                                                                                         |           |
| 1.16 | Report-cards permissions seeded                                                               | `GET /v1/permissions` lists `report_cards.view`, `report_cards.manage`, `report_cards.comment`, `report_cards.approve`, `report_cards.manage_templates`, `report_cards.bulk_operations`, `transcripts.generate`, `gradebook.view`, `gradebook.manage`, `gradebook.view_analytics`, `gradebook.publish_report_cards`. |           |
| 1.17 | At least 1 year-group exists                                                                  | `GET /v1/year-groups?pageSize=100` returns `data[].length >= 1`.                                                                                                                                                                                                                                                     |           |
| 1.18 | Tenant branding minimum                                                                       | `GET /v1/tenants/me/branding` returns `{ school_name, primary_color }` populated. If missing, PDF rendering may break.                                                                                                                                                                                               |           |
| 1.19 | Clear the library before starting                                                             | If a prior test seeded report cards, either leave them (library counts will reflect) or run a cleanup.                                                                                                                                                                                                               |           |

---

## 2. Logging in & Landing

| #   | What to Check                                                  | Expected Result                                                                                                                     | Pass/Fail |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Navigate to `https://nhqs.edupod.app/en/login`                 | The public login page loads. Email field, password field, Sign in button visible. No 4xx/5xx.                                       |           |
| 2.2 | Enter `owner@nhqs.test` / `Password123!` and click **Sign in** | `POST /v1/auth/login` fires with body `{email, password}` and returns 200 with `{ data: { access_token, user } }`. Auth cookie set. |           |
| 2.3 | Post-login redirect                                            | Browser lands on `/en/dashboard` (NOT `/en/dashboard/teacher`). Morph bar visible with role-appropriate hubs.                       |           |
| 2.4 | Page header shows the signed-in user                           | Top-right avatar/menu shows "Yusuf Rahman". Clicking reveals a dropdown with Sign out.                                              |           |
| 2.5 | Access token held in memory only                               | DevTools Application -> Local Storage + Session Storage contain no `access_token`/`jwt`/`auth` keys. Refresh via httpOnly cookie.   |           |
| 2.6 | Refresh persists session                                       | Reload: `GET /v1/auth/refresh` (or `/me`) succeeds. Yusuf remains logged in at `/en/dashboard`.                                     |           |

---

## 3. Navigating to Report Cards

| #   | What to Check                                      | Expected Result                                                                                                                                                                                                                                                                                           | Pass/Fail |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Click **Learning** in the top morph bar            | Sub-strip expands and shows tabs including **Curriculum**, **Lessons**, **Assessment**, **Behaviour**. URL becomes `/en/learning` or highlights Learning.                                                                                                                                                 |           |
| 3.2 | Click **Assessment** on the Learning sub-strip     | Assessment sub-strip appears showing **Gradebook**, **Assessments**, **Rubrics**, **Report Cards** (permission-filtered).                                                                                                                                                                                 |           |
| 3.3 | Click **Report Cards** on the Assessment sub-strip | URL -> `/en/report-cards` (no redirect loop). `GET /v1/academic-periods?pageSize=50`, `GET /v1/year-groups?pageSize=100`, `GET /v1/classes?pageSize=100`, `GET /v1/report-cards/library?page=1&pageSize=1`, and `GET /v1/report-card-teacher-requests?status=pending&page=1&pageSize=1` fire in parallel. |           |
| 3.4 | Direct URL navigation                              | Go to `/en/report-cards` directly. Page renders identically to the sub-strip entry path.                                                                                                                                                                                                                  |           |
| 3.5 | Morph bar stability                                | The morph bar does not flicker or remount during the Learning -> Assessment -> Report Cards chain. No layout jump.                                                                                                                                                                                        |           |
| 3.6 | Back button                                        | Browser back returns to the previously highlighted sub-strip state, not to the platform landing.                                                                                                                                                                                                          |           |

---

## 4. Report Cards Dashboard — Page Load

| #    | What to Check                                        | Expected Result                                                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1  | Page title and header                                | `<h1>` "Report Cards" (from `reportCards.title`).                                                                                                     |           |
| 4.2  | Header description slot                              | Below the title shows the selected period name (e.g. "Term 2") pulled from `periods[].find(status='active').name`.                                    |           |
| 4.3  | Initial skeleton                                     | Before data resolves: two skeleton blocks appear in the classes section (animated `bg-surface-secondary`).                                            |           |
| 4.4  | Parallel fetches on mount                            | Network shows 5 GET requests in parallel as listed in 3.3, all 200.                                                                                   |           |
| 4.5  | `silent: true` on library + pending teacher requests | Failures on `/api/v1/report-cards/library?...` or `/api/v1/report-card-teacher-requests?status=pending` do not pop a toast. They still console-error. |           |
| 4.6  | Dashboard does NOT render teacher shell              | URL is `/en/report-cards` (NOT `/en/dashboard/teacher`). Sub-strip is the admin variant.                                                              |           |
| 4.7  | No console errors                                    | DevTools Console shows no red errors on mount.                                                                                                        |           |
| 4.8  | `isAdmin` computed true                              | The `useRoleCheck` hook returns `isAdmin=true` since Yusuf has `school_owner`. Admin-only affordances visible.                                        |           |
| 4.9  | Effect cleanup                                       | Navigate away then back quickly — no duplicate calls, no "setState after unmount" warning.                                                            |           |
| 4.10 | Auth context present                                 | `useAuth().user` resolves before rendering admin affordances; no flicker between teacher/admin layout.                                                |           |
| 4.11 | Redirect on `/en/dashboard/teacher` if admin         | Navigating to the teacher dashboard as admin either renders the teacher view or redirects. Document.                                                  |           |

---

## 5. Dashboard Header & Period Selector

| #    | What to Check                               | Expected Result                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Period selector renders                     | The `<Select>` trigger next to the Settings button displays the currently selected period name.                                                                 |           |
| 5.2  | Default selection                           | On first load the selector value equals the first period with `status === 'active'` (fallback: first period in the list).                                       |           |
| 5.3  | Period options include "Full Year" sentinel | Opening the dropdown shows `dashboard.fullYearLabel` = "Full Year" as the first item, followed by every period.                                                 |           |
| 5.4  | Select Full Year                            | Choosing it sets `selectedPeriodId='full_year'` and re-fires `GET /v1/report-cards/analytics/dashboard` with the `full_year` sentinel (confirm the client URL). |           |
| 5.5  | Select a specific period                    | Choosing `{ACTIVE_PERIOD_ID}` re-fires `GET /v1/report-cards/analytics/dashboard?academic_period_id={ACTIVE_PERIOD_ID}` -> 200. Analytics Snapshot refreshes.   |           |
| 5.6  | Settings gear button (admin-only)           | Rendered with `aria-label` = `dashboard.settingsAria`. Clicking navigates to `/en/report-cards/settings`. Hidden for `teacher` role.                            |           |
| 5.7  | Header description reflects selection       | Changing the selector updates the header description to the chosen period's name ("Full Year" if sentinel).                                                     |           |
| 5.8  | No persistence across reloads               | Reloading the page re-derives the default (active period). Sentinel choice does NOT persist.                                                                    |           |
| 5.9  | Select renders ≥ 50 periods                 | Historical tenants with 50+ periods: dropdown is virtualised or paginated. Flag if laggy.                                                                       |           |
| 5.10 | Keyboard navigation                         | Tab into selector + arrow keys navigate options. Enter selects. Esc closes dropdown.                                                                            |           |

---

## 6. Dashboard Quick-Action Tiles (Admin: 4 tiles)

| #    | What to Check                        | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Four tiles render on `lg` breakpoint | Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. Tiles in order: **Generate**, **Write comments**, **Library**, **Teacher requests**.                   |           |
| 6.2  | Generate tile — icon + accent        | Sparkles icon in a `bg-violet-100 text-violet-700` chip. Clicking navigates to `/en/report-cards/generate`.                                              |           |
| 6.3  | Write comments tile                  | MessageSquare icon with amber accent. Clicking navigates to `/en/report-comments`.                                                                       |           |
| 6.4  | Library tile shows live count        | Library icon with sky accent. Description reads "{n} report cards saved" (`dashboard.tileLibraryDescription`). While loading shows `tileLibraryLoading`. |           |
| 6.5  | Library count source                 | After mount, `libraryCount = meta.total` from `GET /v1/report-cards/library?page=1&pageSize=1`.                                                          |           |
| 6.6  | Teacher requests tile — all clear    | When `pendingRequestCount === 0`, description reads `dashboard.tileRequestsAllClear`. No red badge.                                                      |           |
| 6.7  | Teacher requests tile — pending      | When `pendingRequestCount > 0`, description reads `dashboard.tileRequestsPending` with `{count}`, and a red badge with the number appears.               |           |
| 6.8  | Tile hover affordance                | Each tile darkens/shadows on hover. Focus ring on keyboard tab.                                                                                          |           |
| 6.9  | Tile touch target                    | On mobile (375px) tiles stack `grid-cols-1` and each tile is tappable at >= 44x44px.                                                                     |           |
| 6.10 | Tiles hidden for teacher role        | (Teacher-parity check) For teacher, only Write comments + Library render, grid collapses to `lg:grid-cols-2`.                                            |           |
| 6.11 | Keyboard activation                  | Tabbing onto a tile and pressing Enter/Space triggers navigation.                                                                                        |           |
| 6.12 | Tile description copy                | Localised in EN and AR. No hardcoded English in AR locale.                                                                                               |           |
| 6.13 | Tile state across reload             | Library count + pending count refresh on every page mount.                                                                                               |           |
| 6.14 | Accessible icon                      | Each icon has `aria-hidden='true'` because the text label carries meaning.                                                                               |           |

---

## 7. Dashboard Live-Run Status Panel (polling)

| #    | What to Check                       | Expected Result                                                                                                                   | Pass/Fail |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Panel visibility when no active run | `LiveRunStatusPanel` renders a neutral empty state ("No generation run in progress" or equivalent).                               |           |
| 7.2  | Initial poll on mount               | `GET /v1/report-cards/generation-runs?page=1&pageSize=5` fires once. Response 200.                                                |           |
| 7.3  | Active run detected                 | After starting a run in Section 29, the first row returns `status` = `queued`/`processing`. Panel shows the run label + progress. |           |
| 7.4  | Polling cadence while active        | Polls every **5000 ms** (`POLL_INTERVAL_MS` constant). Confirm via Network timing.                                                |           |
| 7.5  | Polling stops at terminal status    | When status is `completed`/`partial_success`/`failed`/`cancelled`, polling stops. Panel shows terminal snapshot.                  |           |
| 7.6  | View library CTA                    | Panel shows a "View library" button -> navigates to `/en/report-cards/library`.                                                   |           |
| 7.7  | Silent poll failure                 | `silent: true` suppresses toast. Poll failures console-error only.                                                                |           |
| 7.8  | Panel hidden for teacher role       | (Teacher-parity check) Not rendered outside admin block.                                                                          |           |
| 7.9  | Polling across navigation           | Navigating away stops the interval (effect cleanup). Returning restarts it.                                                       |           |
| 7.10 | Multiple active runs                | If >1 run is active, only the first is shown (per `.find` logic). Flag if enhancement needed.                                     |           |
| 7.11 | Panel responsive                    | At 375px, panel stacks full width above analytics.                                                                                |           |

---

## 8. Dashboard Analytics Snapshot Panel

| #   | What to Check                       | Expected Result                                                                                                | Pass/Fail |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Panel renders in admin view         | `AnalyticsSnapshotPanel` appears in a `lg:grid-cols-2` row with LiveRunStatusPanel.                            |           |
| 8.2 | Initial analytics fetch             | `GET /v1/report-cards/analytics/dashboard?academic_period_id={ACTIVE_PERIOD_ID}` fires on mount (silent, 200). |           |
| 8.3 | Summary KPIs                        | Shows Total, Published, Draft, Completion rate at minimum. Values match `res.data`.                            |           |
| 8.4 | Loading state                       | While `analyticsLoading`, panel shows skeleton or "Loading…" placeholder.                                      |           |
| 8.5 | Period change re-fetches            | Changing the header period selector triggers a re-fetch with the new `academic_period_id`.                     |           |
| 8.6 | Empty / null analytics              | If endpoint returns null/throws, panel shows a friendly empty state. No crash.                                 |           |
| 8.7 | View full analytics CTA             | A link/button to `/en/report-cards/analytics?academic_period_id={selectedPeriodId}` preserving the sentinel.   |           |
| 8.8 | No 404 badge for unfinalised period | Panel does not imply data is missing just because `published=0`.                                               |           |
| 8.9 | Click-through to details            | Each KPI card is clickable to drill down where applicable (e.g., Published -> Library filtered).               |           |

---

## 9. Dashboard Classes-by-Year-Group Grid

| #    | What to Check                                  | Expected Result                                                                                                     | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Heading                                        | Section heading "Classes" (`dashboard.classesHeading`) renders above the year-group grid.                           |           |
| 9.2  | Year-group sections ordered                    | Each year group appears in ascending `display_order`. Unassigned classes group under "Unassigned" last.             |           |
| 9.3  | Year-group row header                          | Each group shows a GraduationCap chip, year group name, and "{n} classes" (`classesCount`).                         |           |
| 9.4  | Class card shows name + student count          | Each card: class name (large bold) and "{n} students" (`studentsCount`).                                            |           |
| 9.5  | Classes with zero students hidden              | Cards filtered where `_count.class_enrolments === 0`.                                                               |           |
| 9.6  | Class cards sorted alphabetically within group | Sorted via `localeCompare`.                                                                                         |           |
| 9.7  | Click a class card                             | Navigates to `/en/report-cards/{CLASS_A_ID}`.                                                                       |           |
| 9.8  | Empty-state fallback                           | No classes with enrolled students -> `EmptyState` with FileText icon and `reportCards.noClasses`.                   |           |
| 9.9  | Grid responsiveness                            | Grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. At 375px cards stack to one column.             |           |
| 9.10 | Focus ring                                     | Tabbing through cards shows `focus-visible:ring-2 ring-primary-500`.                                                |           |
| 9.11 | Gradient top-bar accent                        | Each card has a `h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600` at the top.                  |           |
| 9.12 | Classes without year group                     | Unassigned group renders under its own header with `year_group_order = 999`.                                        |           |
| 9.13 | Card `shadow-sm` baseline                      | Cards render with a soft shadow and transition to `shadow-md` on hover.                                             |           |
| 9.14 | Card `hover:border-primary-300`                | Hover changes the border colour without changing the card height. No layout shift.                                  |           |
| 9.15 | Card without year group                        | Classes where `year_group=null` render under "Unassigned" with `year_group_order=999`.                              |           |
| 9.16 | Card text truncation                           | Class name that exceeds one line truncates with `text-ellipsis`. Full name revealed via `title` attribute on hover. |           |
| 9.17 | Card icon hover colour                         | The FileText icon shifts from `text-primary-500/70` to `text-primary-600` on hover.                                 |           |
| 9.18 | Card count accurate                            | "{n} students" reflects `_count.class_enrolments`, not a cached snapshot.                                           |           |
| 9.19 | Gradient bar LTR/RTL                           | The `bg-gradient-to-r` gradient direction reads naturally in both locales (or flips in RTL — document).             |           |
| 9.20 | Card alignment in RTL                          | In Arabic, content is right-aligned; the FileText icon sits at the end (left).                                      |           |
| 9.21 | Card tabindex                                  | Each card is focusable via Tab; focus order follows visual order.                                                   |           |

---

## 10. Class Matrix Page — Navigation & Header

| #     | What to Check                      | Expected Result                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1  | Entry from dashboard               | Clicking `{CLASS_A_ID}` in Section 9 navigates to `/en/report-cards/{CLASS_A_ID}`.                                                   |           |
| 10.2  | Initial API calls                  | `GET /v1/academic-periods?pageSize=50` and `GET /v1/report-cards/classes/{CLASS_A_ID}/matrix?academic_period_id=all` fire. Both 200. |           |
| 10.3  | Header title + description         | Title = `matrix.class.name`. Description = year group name.                                                                          |           |
| 10.4  | Back to Report Cards button        | "Back to Report Cards" ghost button navigates to `/en/report-cards`.                                                                 |           |
| 10.5  | Library button                     | Outlined "Library" button navigates to `/en/report-cards/library`.                                                                   |           |
| 10.6  | Loading skeleton                   | Before data: six animated rows `h-10 rounded-lg bg-surface-secondary` render.                                                        |           |
| 10.7  | Matrix container                   | Wrapped in `inline-block max-w-full rounded-xl border border-border bg-surface` with `overflow-x-auto`.                              |           |
| 10.8  | Sticky first column                | Student column (`sticky start-0 z-10`) stays visible while horizontally scrolling.                                                   |           |
| 10.9  | Column widths consistent           | Subject columns are 110px each; student column is 180px. Overall column is 110px.                                                    |           |
| 10.10 | Header row styling                 | Student header `bg-primary-900`. Subject headers `bg-primary-700`. Overall `bg-primary-800`.                                         |           |
| 10.11 | Header contrast                    | All header colours pass WCAG AA contrast for their `text-white` content.                                                             |           |
| 10.12 | Back to dashboard preserves period | Returning to dashboard preserves the previously selected period.                                                                     |           |

---

## 11. Class Matrix — Period Filter & Display Toggle

| #     | What to Check                             | Expected Result                                                                                                                                          | Pass/Fail |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Period `<Select>` renders                 | Shows "All periods" (value `all`) by default with every period listed below.                                                                             |           |
| 11.2  | Select a specific period                  | Choosing `{ACTIVE_PERIOD_ID}` re-fires `GET /v1/report-cards/classes/{CLASS_A_ID}/matrix?academic_period_id={ACTIVE_PERIOD_ID}` -> 200. Cells re-render. |           |
| 11.3  | Select "All periods"                      | Re-fires with `academic_period_id=all`. Backend aggregates across all periods.                                                                           |           |
| 11.4  | Display toggle has two tabs               | Inline group with role `tablist`; tabs **Grade** and **Score**. Default = `grade`.                                                                       |           |
| 11.5  | Switch to Score                           | Clicking **Score** flips `aria-selected`, cells render `cell.score.toFixed(1)%`. No network refetch.                                                     |           |
| 11.6  | Switch back to Grade                      | Cells render `cell.grade` (letter/symbol).                                                                                                               |           |
| 11.7  | Toggle minimum touch target               | Each toggle button is `min-h-11`.                                                                                                                        |           |
| 11.8  | Null cell rendering                       | Where `cell` is undefined OR `cell.score` is null, shows `—`.                                                                                            |           |
| 11.9  | Cells render LTR in AR                    | Each score/grade cell has `dir="ltr"` so numerals stay LTR in RTL.                                                                                       |           |
| 11.10 | Overall column reads `overall_by_student` | Rightmost column shows `weighted_average%` or `overall_grade`.                                                                                           |           |
| 11.11 | Display toggle state resets on nav        | Navigating away and back resets to the default (`grade`).                                                                                                |           |
| 11.12 | Period filter in URL                      | Period filter is NOT persisted in URL (client state only).                                                                                               |           |
| 11.13 | Zero cells performance                    | Class with 30 students × 20 subjects (600 cells) renders in < 2s.                                                                                        |           |
| 11.14 | Scroll performance                        | Horizontal scrolling with 20 subjects does not drop frames.                                                                                              |           |

---

## 12. Class Matrix — Top-Rank Badges

| #    | What to Check                              | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Top-3 students show a gold badge           | Where `overall.rank_position` is in `[1,2,3]`, a pill with Medal icon renders next to the name. `aria-label` = `classMatrix.topRankBadge` with `{rank}`. |           |
| 12.2 | Rank 4+ shows no badge                     | Students ranked 4th or lower show no Medal pill.                                                                                                         |           |
| 12.3 | Null rank shows no badge                   | Students without `overall` data show no badge.                                                                                                           |           |
| 12.4 | Badge visibility depends on tenant setting | When `show_top_rank_badge=false`, check whether badges still appear or are suppressed. Flag any discrepancy in Section 80.                               |           |
| 12.5 | Badge colour tokens                        | Pill uses `bg-amber-100 text-amber-800 ring-amber-300`. No hardcoded hex.                                                                                |           |
| 12.6 | Badge i18n                                 | `classMatrix.topRankBadge` renders with `{rank}` interpolation.                                                                                          |           |
| 12.7 | Badge after rank change                    | If an admin edits grades upstream and ranks shift, re-fetching the matrix updates the badges accordingly.                                                |           |
| 12.8 | Tie-breaking                               | Students with identical `weighted_average` may share a rank OR be ordered by name. Document observed behaviour.                                          |           |
| 12.9 | aria-label localisation                    | The badge `aria-label` uses `classMatrix.topRankBadge` localised key.                                                                                    |           |

---

## 13. Class Matrix — Empty + Error States

| #     | What to Check              | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 13.1  | No students enrolled       | If `matrix.students.length === 0`, `EmptyState` with Medal icon and `classMatrix.noStudents`.                                                                                                                |           |
| 13.2  | No subjects graded         | If `matrix.subjects.length === 0`, `EmptyState` with `classMatrix.noGradesYet`.                                                                                                                              |           |
| 13.3  | Class not found            | Navigate to `/en/report-cards/00000000-0000-0000-0000-000000000000`. Backend returns 404 `{ code: 'CLASS_NOT_FOUND' }`. Page shows `EmptyState classMatrix.classNotFound` + a "Back to Report Cards" action. |           |
| 13.4  | Invalid UUID in path       | `/en/report-cards/not-a-uuid`. API returns 400 (`ParseUUIDPipe`). Page shows the load-failed empty state.                                                                                                    |           |
| 13.5  | Server error (5xx)         | If matrix endpoint returns 500, `EmptyState classMatrix.loadFailed`. No crash, no toast. Console error logged.                                                                                               |           |
| 13.6  | Teacher out-of-scope class | (Teacher-parity) Hitting a class they don't teach returns 403 `{ code: 'CLASS_OUT_OF_SCOPE' }`. Admin bypass applies here.                                                                                   |           |
| 13.7  | Network offline            | With devtools offline, page shows loadFailed state and does not hang.                                                                                                                                        |           |
| 13.8  | Reload during loading      | Hitting reload while matrix is loading does not double-fire the fetch (effect cleanup cancels stale).                                                                                                        |           |
| 13.9  | Rapid period switches      | Switching periods rapidly: only the latest response applies to state (cancelled flag).                                                                                                                       |           |
| 13.10 | Auth expiry during fetch   | 401 mid-session triggers re-auth flow. After refresh, matrix re-fetches successfully.                                                                                                                        |           |
| 13.11 | Wide subject count         | Class with 20+ subjects renders header with horizontal scroll; last column still accessible.                                                                                                                 |           |

---

## 14. Settings Page — Entry Point & Permission Guard

| #     | What to Check                     | Expected Result                                                                                                                                                                 | Pass/Fail        |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------- | --------------------------------------------------- | --- |
| 14.1  | Navigate via gear button          | From dashboard click the gear icon. URL -> `/en/report-cards/settings`.                                                                                                         |                  |
| 14.2  | Initial API calls                 | `GET /v1/report-card-tenant-settings` and `GET /v1/report-cards/templates/content-scopes` fire in parallel. Both 200.                                                           |                  |
| 14.3  | Header                            | Title "Report card settings" (`settings.title`), description string, and "Back to Report Cards" ghost button navigating to `/en/report-cards`.                                  |                  |
| 14.4  | Loading state                     | Four animated `rounded-2xl bg-surface-secondary h-28` skeleton cards render while loading.                                                                                      |                  |
| 14.5  | Read-only notice for non-managers | If user is `canView` but not `canManage` (e.g., teacher), a grey banner reads `settings.readOnlyNotice` and every control is disabled.                                          |                  |
| 14.6  | Non-view role denied              | A role without `canView` or `canManage` (e.g., parent) loading `/en/report-cards/settings` triggers a toast `settings.permissionDenied` + `router.replace('/en/report-cards')`. |                  |
| 14.7  | 403 from API on load              | `GET /v1/report-card-tenant-settings` returning 403 -> toast `settings.loadFailed`, no form renders.                                                                            |                  |
| 14.8  | Admin-only edit                   | Only roles in `school_owner                                                                                                                                                     | school_principal | school_vice_principal | admin`have`canManage=true` and can submit the form. |     |
| 14.9  | Teacher can view                  | Teacher with `report_cards.view` sees the page but in read-only mode.                                                                                                           |                  |
| 14.10 | Settings Link back                | Settings gear button and the back button both use the same locale prefix.                                                                                                       |                  |

---

## 15. Settings — Display Defaults

| #    | What to Check                      | Expected Result                                                                             | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Section heading                    | Title "Display defaults" (`settings.displayDefaults`).                                      |           |
| 15.2 | Matrix display mode radio group    | Two labelled radio cards: **Grade** and **Score**. Default = `grade`.                       |           |
| 15.3 | Select Score                       | Click Score radio. Form state `matrix_display_mode: 'score'`. No network call yet.          |           |
| 15.4 | Show-top-rank-badge toggle         | A `<Switch>` row labelled `settings.showTopRankBadge` with hint. Off by default.            |           |
| 15.5 | Toggle it on                       | Click switch. Form state `show_top_rank_badge: true`.                                       |           |
| 15.6 | Form dirty state                   | Clicking Save with no changes is a no-op; reloading discards changes.                       |           |
| 15.7 | Disabled in read-only              | Radios + switches disabled when `canManage=false`.                                          |           |
| 15.8 | Default values on fresh tenant     | A brand-new tenant has baseline defaults (grade mode, rank badge off).                      |           |
| 15.9 | Settings reset button (if present) | If a "Reset to defaults" button exists, clicking it reloads baseline values without saving. |           |

---

## 16. Settings — Comment Gate (block_generation / warn_only)

| #    | What to Check                                | Expected Result                                                                                                                           | Pass/Fail |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Section heading                              | Title "Comment gate" (`settings.commentGate`).                                                                                            |           |
| 16.2 | Require finalised comments toggle            | Switch row `settings.requireFinalisedComments` + hint. Default baseline = `true`.                                                         |           |
| 16.3 | Allow admin force-generate toggle            | Switch row `settings.allowAdminForceGenerate` + hint. Default = `true`.                                                                   |           |
| 16.4 | Effective mode resolution — block_generation | `require_finalised_comments=true` AND `allow_admin_force_generate=false` -> dry-run `would_block=true` forces abort.                      |           |
| 16.5 | Warn-only configuration                      | `require_finalised_comments=true` AND `allow_admin_force_generate=true` -> dry-run `would_block=true` is overridable via wizard checkbox. |           |
| 16.6 | Gate disabled                                | `require_finalised_comments=false` -> dry-run always returns `would_block=false`.                                                         |           |
| 16.7 | Toggle persists after Save                   | Save -> reload. The switches retain the saved values.                                                                                     |           |
| 16.8 | Permission                                   | `PATCH /v1/report-card-tenant-settings` from teacher -> 403.                                                                              |           |
| 16.9 | Help text explains modes                     | The two toggles include hint text that makes clear when both are needed for warn-only.                                                    |           |

---

## 17. Settings — Personal Info Fields

| #     | What to Check                 | Expected Result                                                                                            | Pass/Fail |
| ----- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 17.1  | Four field groups visible     | Labelled groups: **Identity**, **Dates**, **Academic**, **Media**.                                         |           |
| 17.2  | Identity group fields         | Checkboxes for `full_name`, `student_number`, `sex`, `nationality`, `national_id`.                         |           |
| 17.3  | Dates group                   | `date_of_birth`, `admission_date`.                                                                         |           |
| 17.4  | Academic group                | `year_group`, `class_name`, `homeroom_teacher`.                                                            |           |
| 17.5  | Media group                   | `photo`.                                                                                                   |           |
| 17.6  | Check a field                 | Click `Checkbox` for `nationality`. Form state array `default_personal_info_fields` gains `'nationality'`. |           |
| 17.7  | Uncheck a field               | Uncheck `full_name`. Form array removes `'full_name'`.                                                     |           |
| 17.8  | Disabled for non-manager      | Every checkbox is disabled when `canManage=false`.                                                         |           |
| 17.9  | Empty array allowed           | Submitting `[]` must not block save (schema permits).                                                      |           |
| 17.10 | Defaults seed the wizard      | After Save, opening the Generation Wizard Step 4 shows the newly selected defaults.                        |           |
| 17.11 | Custom ordering not supported | The fixed section order (Identity, Dates, Academic, Media) is not user-configurable.                       |           |

---

## 18. Settings — Default Template

| #    | What to Check                         | Expected Result                                                                                                        | Pass/Fail |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Section heading                       | Title "Default template" with hint.                                                                                    |           |
| 18.2 | Select trigger shows current value    | Default "No default template" (sentinel `'none'`).                                                                     |           |
| 18.3 | Options populated from content-scopes | Dropdown shows every `design.name (LOCALE)` pair where `scope.is_available === true`. Dedup by `(design_key, locale)`. |           |
| 18.4 | Select a template                     | Choose "Editorial Academic (EN)". Form state `default_template_id` = `{DEFAULT_TEMPLATE_ID}`.                          |           |
| 18.5 | Select "No default template"          | Value `'none'` -> form state `default_template_id: null`.                                                              |           |
| 18.6 | No duplicate rows                     | Dropdown shows each `(design_key, locale)` once even when the backend has duplicates.                                  |           |
| 18.7 | Empty catalogue                       | If `content-scopes` returns `[]`, dropdown shows only the "No default template" option.                                |           |
| 18.8 | Dropdown localised                    | In AR locale, the "No default template" label is translated.                                                           |           |
| 18.9 | Template locale inferred              | Choosing a template with locale `ar` seeds the wizard locales to `['ar']` on next use. Verify.                         |           |

---

## 19. Settings — Grade Thresholds Link + CRUD

| #     | What to Check             | Expected Result                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1  | Link rendered             | Section "Grade thresholds" shows "Manage grade thresholds →" linking to `/en/settings/grade-thresholds`.                                                                                 |           |
| 19.2  | Click link                | Navigate to the grade-thresholds page.                                                                                                                                                   |           |
| 19.3  | List existing configs     | `GET /v1/report-cards/grade-thresholds` -> 200 `{ data: [...] }`.                                                                                                                        |           |
| 19.4  | Create a threshold config | `POST /v1/report-cards/grade-thresholds` with `{ name: 'Standard A-F', thresholds: [{grade:'A', min:90, max:100}, {grade:'B', min:80, max:89.99}, …] }` -> 201. Record `{THRESHOLD_ID}`. |           |
| 19.5  | Get by id                 | `GET /v1/report-cards/grade-thresholds/{THRESHOLD_ID}` -> 200 returns the created payload.                                                                                               |           |
| 19.6  | Update                    | `PATCH /v1/report-cards/grade-thresholds/{THRESHOLD_ID}` with `{ name: 'Renamed' }` -> 200.                                                                                              |           |
| 19.7  | Delete                    | `DELETE /v1/report-cards/grade-thresholds/{THRESHOLD_ID}` -> 204.                                                                                                                        |           |
| 19.8  | Teacher read denied       | Teacher without `gradebook.view` on grade-thresholds -> 403.                                                                                                                             |           |
| 19.9  | Teacher write denied      | Teacher without `gradebook.manage` -> 403.                                                                                                                                               |           |
| 19.10 | Active threshold usage    | The currently-active threshold config is highlighted in the list.                                                                                                                        |           |

---

## 20. Settings — Principal Details & Signature Upload

| #     | What to Check                           | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1  | Section heading                         | "Principal details".                                                                                                                                                                            |           |
| 20.2  | Principal name field                    | `<Input>` labelled `settings.principalName`. Baseline empty. `setValueAs` converts empty string to `null`.                                                                                      |           |
| 20.3  | Type a name                             | Enter "Ustadh Mahmoud Ali". Form state `principal_name: 'Ustadh Mahmoud Ali'`.                                                                                                                  |           |
| 20.4  | Clear the name                          | Delete text -> form state `principal_name: null`.                                                                                                                                               |           |
| 20.5  | Signature upload placeholder            | When `hasSignature=false`, shows a drop zone / upload button.                                                                                                                                   |           |
| 20.6  | Upload a PNG                            | Pick a 200KB PNG. `POST /v1/report-card-tenant-settings/principal-signature` fires as `multipart/form-data` with field `file` -> 200. Panel flips to "Signature uploaded". `hasSignature=true`. |           |
| 20.7  | Upload a JPEG                           | Same flow accepts `image/jpeg` -> 200.                                                                                                                                                          |           |
| 20.8  | Upload a WEBP                           | Same flow accepts `image/webp` -> 200.                                                                                                                                                          |           |
| 20.9  | Reject unsupported MIME                 | Upload a PDF or GIF -> 400 (file interceptor rejects). Toast error.                                                                                                                             |           |
| 20.10 | Reject oversize file                    | Upload a 3MB PNG (limit 2MB) -> 400 (`FILE_TOO_LARGE` or interceptor code).                                                                                                                     |           |
| 20.11 | Missing file                            | Calling POST with no file -> 400 `{ code: 'FILE_REQUIRED' }`.                                                                                                                                   |           |
| 20.12 | Delete signature                        | Click "Remove signature". `DELETE /v1/report-card-tenant-settings/principal-signature` -> 200. Panel flips back to empty. `hasSignature=false`.                                                 |           |
| 20.13 | Multipart carries principal_name        | Uploading with the name field set persists `principal_name` in the same request (body). Re-fetch confirms.                                                                                      |           |
| 20.14 | Teacher forbidden                       | `POST .../principal-signature` from a teacher -> 403.                                                                                                                                           |           |
| 20.15 | Preview after upload                    | After upload, the panel displays a thumbnail preview of the uploaded image.                                                                                                                     |           |
| 20.16 | Preview uses storage URL                | Thumbnail source is the signed URL from `principal_signature_storage_key` resolution.                                                                                                           |           |
| 20.17 | Replace existing signature              | Uploading with `hasSignature=true` overwrites the previous storage key. Old file is deleted from S3 after success.                                                                              |           |
| 20.18 | SVG rejected                            | Uploading `image/svg+xml` -> 400 (SVG not in allow-list).                                                                                                                                       |           |
| 20.19 | Zero-byte file                          | Empty file -> 400 `{ code: 'FILE_REQUIRED' }` or `{ code: 'INVALID_FILE' }`.                                                                                                                    |           |
| 20.20 | Signature persists across settings tabs | After upload, navigating away and back shows the same preview.                                                                                                                                  |           |

---

## 21. Settings — Save Changes (PATCH contract + toast + rollback)

| #     | What to Check                    | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 21.1  | Save button state before changes | Disabled while `form.formState.isSubmitting`; label "Save changes" (`settings.saveChanges`).                                                           |           |
| 21.2  | Save with valid changes          | Click Save after toggling fields. `PATCH /v1/report-card-tenant-settings` fires with body matching the full form state -> 200. Toast `settings.saved`. |           |
| 21.3  | Save with invalid schema         | Inject an invalid value (`matrix_display_mode: 'banana'` via devtools). PATCH -> 400 Zod validation error. Toast `settings.saveFailed`.                |           |
| 21.4  | Network failure                  | Offline + click Save. Toast `settings.saveFailed`. Form values remain as typed (no optimistic update).                                                 |           |
| 21.5  | Reload after save                | `GET /v1/report-card-tenant-settings` returns persisted values. Form re-initialises.                                                                   |           |
| 21.6  | Submitting state label           | While in flight, button text "Saving…" (`settings.saving`).                                                                                            |           |
| 21.7  | Permission denied                | Teacher hitting Save -> 403 (but button shouldn't exist for them). Admin path always 200.                                                              |           |
| 21.8  | Clearable fields                 | Setting `principal_name` to empty string stores as `null` in DB.                                                                                       |           |
| 21.9  | 304 Not Modified                 | If settings body is identical to current, server may return 200 with unchanged state. Document.                                                        |           |
| 21.10 | ETag support                     | `GET` response may include `ETag`. Subsequent `If-None-Match` returns 304. Verify.                                                                     |           |

---

## 22. Generation Wizard — Entry Point & Permission Guard

| #    | What to Check                              | Expected Result                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Navigate via dashboard tile                | Click the Generate tile. URL = `/en/report-cards/generate`.                                                                                  |           |
| 22.2 | Initial settings fetch                     | `GET /v1/report-card-tenant-settings` fires once on mount to seed `default_personal_info_fields`.                                            |           |
| 22.3 | Role check                                 | For owner/principal/vice_principal/admin: wizard loads. For teacher: toast `wizard.permissionDenied` + `router.replace('/en/report-cards')`. |           |
| 22.4 | Header + Back button                       | Title `wizard.title` with description. Ghost "Back to Report Cards" button navigating home.                                                  |           |
| 22.5 | `defaultsLoaded` gates query-param handoff | Wizard waits for settings to resolve before consuming query params.                                                                          |           |
| 22.6 | Landing without approved request           | Visiting the wizard URL without query params starts fresh at Step 1.                                                                         |           |
| 22.7 | Browser back on wizard                     | Browser back while on Step 3 goes to Step 2, not to `/en/report-cards`. (Verify — wizard may use URL steps or in-memory.)                    |           |

---

## 23. Wizard Step Indicator

| #    | What to Check             | Expected Result                                                                                     | Pass/Fail |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Six circular step markers | Numbered 1–6 with connecting lines between them.                                                    |           |
| 23.2 | Active step styling       | `bg-primary-500 text-white`.                                                                        |           |
| 23.3 | Completed step styling    | Steps before `current` have `bg-primary-100 text-primary-700` and a filled connector trailing edge. |           |
| 23.4 | Upcoming step styling     | Steps after `current` have `bg-surface-secondary text-text-tertiary`.                               |           |
| 23.5 | aria-label per marker     | "Step {current} of {total}" via `wizard.stepLabel`.                                                 |           |
| 23.6 | Mobile horizontal scroll  | At 375px, indicator uses `overflow-x-auto` so all six markers reachable.                            |           |
| 23.7 | Connectors                | Connector lines respect `bg-primary-200` for done, `bg-border/60` for upcoming.                     |           |
| 23.8 | Indicator in AR           | Steps 1-6 stay Latin numerals in AR. Arrow direction mirrors.                                       |           |

---

## 24. Wizard Step 1 — Scope

| #     | What to Check                   | Expected Result                                                                        | Pass/Fail |
| ----- | ------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 24.1  | Step title + description        | `wizard.step1Title`, `wizard.step1Description`.                                        |           |
| 24.2  | Three scope modes visible       | Radio cards: **Year group**, **Class**, **Individual students**.                       |           |
| 24.3  | Select "Class"                  | `state.scope.mode = 'class'`. A class picker renders below.                            |           |
| 24.4  | Class picker populated          | `GET /v1/classes?pageSize=100` if not cached. Options with year group beside the name. |           |
| 24.5  | Pick `{CLASS_A_ID}`             | `state.scope.ids = [{CLASS_A_ID}]`. Next button enables.                               |           |
| 24.6  | Next with empty scope           | Next is disabled.                                                                      |           |
| 24.7  | Switch to "Individual students" | Mode flips. Student picker shows. Multi-select supported.                              |           |
| 24.8  | Switch to "Year group"          | Year-group list loads. Selection adds year_group ids.                                  |           |
| 24.9  | Empty-array edge case           | `canGoNext` returns false when `state.scope.ids.length === 0`.                         |           |
| 24.10 | Arabic RTL                      | Labels and spacing mirror when `locale='ar'`.                                          |           |
| 24.11 | Keyboard navigation             | Tab/Shift+Tab cycles through radios and pickers.                                       |           |
| 24.12 | Search inside picker            | Picker has a text search filter for long lists (classes/students).                     |           |
| 24.13 | Deselect all                    | "Clear selection" control removes all ids. Next disables.                              |           |
| 24.14 | Max selection cap               | Selecting > N (e.g. 500) students shows a warning about run duration. Does not block.  |           |
| 24.15 | Archived classes hidden         | Classes with `status='archived'` do not appear in the picker.                          |           |
| 24.16 | Students without enrolment      | Students not currently enrolled do not appear in the Individual mode picker.           |           |

---

## 25. Wizard Step 2 — Period

| #     | What to Check                   | Expected Result                                                                                                        | Pass/Fail |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1  | Period radio list               | Lists every period from `GET /v1/academic-periods?pageSize=50` plus a "Full year" option (maps to `academic_year_id`). |           |
| 25.2  | Pick a per-period               | Selecting `{ACTIVE_PERIOD_ID}` sets `state.academicPeriodId`, clears `state.academicYearId`.                           |           |
| 25.3  | Pick Full year                  | Sets `state.academicYearId = {ACTIVE_YEAR_ID}`, clears `state.academicPeriodId`.                                       |           |
| 25.4  | Next gate                       | `canGoNext` returns true when either field is set.                                                                     |           |
| 25.5  | Historical periods              | Periods with `status='completed'` may still appear and be selectable (historical generation).                          |           |
| 25.6  | Empty academic years            | If no periods exist, step 2 shows an empty state and Next stays disabled.                                              |           |
| 25.7  | Period label format             | Each option shows the period name (and optionally `(YYYY-YYYY)` year suffix).                                          |           |
| 25.8  | Period starts in future         | A period with `start_date > today` is selectable but may trigger a warning.                                            |           |
| 25.9  | Active period default           | If no URL param, the active period is highlighted. Not auto-selected (user still has to choose).                       |           |
| 25.10 | Full-year with multiple periods | Selecting Full year aggregates every period under `{ACTIVE_YEAR_ID}`.                                                  |           |

---

## 26. Wizard Step 3 — Template & Design

| #     | What to Check                      | Expected Result                                                                                            | Pass/Fail |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 26.1  | Content scope list                 | Shows every available `content_scope` from `GET /v1/report-cards/templates/content-scopes`.                |           |
| 26.2  | Locked scope                       | `is_available=false` cards render disabled with a hint.                                                    |           |
| 26.3  | Pick "Grades only"                 | `state.contentScope = 'grades_only'`. Locale selector appears.                                             |           |
| 26.4  | Design picker                      | Designs render as chips. Clicking a design sets `state.designKey = {DESIGN_KEY}`.                          |           |
| 26.5  | Locale selector                    | Two checkboxes `en`, `ar`. Default: both selected. `state.locales = ['en','ar']`.                          |           |
| 26.6  | Next gate                          | Enabled once `contentScope !== null`. `designKey` optional (server falls back to `is_default=true`).       |           |
| 26.7  | Preview PDF link                   | Each design card has "Preview" -> opens `design.preview_pdf_url` in a new tab.                             |           |
| 26.8  | Scope w/ comments selection        | Switching to a scope that includes subject comments triggers a warning if comments are not yet finalised.  |           |
| 26.9  | Duplicate design skipped           | Duplicate `(design_key, locale)` rows are deduped (same as Settings dropdown).                             |           |
| 26.10 | Preview PDF access control         | Preview URLs are signed; expired URLs return 403 from S3. Re-fetching the scope list regenerates them.     |           |
| 26.11 | Locale disabled if not provided    | A design that only has EN locale shows `ar` checkbox disabled with tooltip "Not available in this design". |           |
| 26.12 | Design with no `is_default`        | If no default design exists for the scope, the first available design renders selected.                    |           |
| 26.13 | Scope w/ comments warns about gate | Picking `grades_and_comments` shows a hint about Step 5 gate.                                              |           |

---

## 27. Wizard Step 4 — Personal Info Fields

| #    | What to Check       | Expected Result                                                                       | Pass/Fail |
| ---- | ------------------- | ------------------------------------------------------------------------------------- | --------- |
| 27.1 | Pre-filled defaults | Checkboxes seeded from `default_personal_info_fields` fetched in 22.2.                |           |
| 27.2 | Toggle fields       | Check/uncheck. State `state.personalInfoFields` reflects selection.                   |           |
| 27.3 | Next gate           | `canGoNext` requires `personalInfoFields.length > 0`. Disabling all -> Next disabled. |           |
| 27.4 | Previous navigation | Back returns to Step 3 preserving selection.                                          |           |
| 27.5 | Section grouping    | Same four groups (Identity, Dates, Academic, Media) as Settings page.                 |           |
| 27.6 | Edit after seed     | Changing on Step 4 does NOT persist back to tenant defaults.                          |           |

---

## 28. Wizard Step 5 — Comment Gate Dry-Run

| #     | What to Check                  | Expected Result                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.1  | Auto dry-run on entry          | On entering Step 5, `POST /v1/report-cards/generation-runs/dry-run` fires with `{ scope, academic_period_id, academic_year_id }` -> 200 `{ would_block, blocked_student_ids, reasons }`. |           |
| 28.2  | Loading state                  | While `dryRun.loading`, spinner + "Checking gate…". Next disabled.                                                                                                                       |           |
| 28.3  | Success with pass              | `would_block: false` -> green panel "All students eligible". Next enabled.                                                                                                               |           |
| 28.4  | Success with block             | `would_block: true` -> warning panel shows blocked count + reasons. Override checkbox "I understand and want to proceed" appears IF `allow_admin_force_generate=true`.                   |           |
| 28.5  | Override required to proceed   | When blocked, `canGoNext` returns true only if override checkbox is checked AND `allow_admin_force_generate=true`.                                                                       |           |
| 28.6  | block_generation policy        | With `allow_admin_force_generate=false`, override checkbox is hidden and Next stays disabled. Page shows "Blocked — see comment gate setting".                                           |           |
| 28.7  | Dry-run error                  | 500 -> panel shows `dryRun.error` + "Retry" button re-fires. Next disabled.                                                                                                              |           |
| 28.8  | Navigation back re-runs        | Going back to Step 4 and forward re-fires the dry-run.                                                                                                                                   |           |
| 28.9  | Blocked students list          | A collapsible list shows blocked student names. Click to expand.                                                                                                                         |           |
| 28.10 | Reason hint                    | Each blocked reason is localised (`dryRun.reason.missingOverallComment`, `missingSubjectComment`, etc.).                                                                                 |           |
| 28.11 | Dry-run preserved across nav   | Leaving Step 5 then returning does NOT reset `dryRun.result`. (Verify — may re-run per effect.)                                                                                          |           |
| 28.12 | Override logged                | When `override_comment_gate=true` is submitted, the audit log records the override with user id + reason.                                                                                |           |
| 28.13 | Mixed scope with partial block | Scope that includes some complete + some incomplete students: `would_block=true` lists only the incomplete ones.                                                                         |           |

---

## 29. Wizard Step 6 — Review & Submit

| #     | What to Check                                      | Expected Result                                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1  | Summary lists every choice                         | Scope mode + id count, period/year, content scope, design key, locales, personal info fields count, override flag.                                                                                                                                                              |           |
| 29.2  | Submit button label                                | "Submit" (`wizard.submit`). Becomes "Submitting…" (`wizard.submitting`) while in flight.                                                                                                                                                                                        |           |
| 29.3  | Click Submit                                       | `POST /v1/report-cards/generation-runs` with payload `{ scope: {...}, academic_period_id, academic_year_id?, content_scope, design_key?, personal_info_fields, override_comment_gate }` -> 201 `{ data: { batch_job_id: '{GENERATED_RUN_ID}' } }`. Record `{GENERATED_RUN_ID}`. |           |
| 29.4  | Payload shape                                      | `scope` is the output of `buildScopePayload`: `{ mode: 'class', class_ids: [...] }` OR `{ mode: 'year_group', year_group_ids: [...] }` OR `{ mode: 'individual', student_ids: [...] }`.                                                                                         |           |
| 29.5  | `design_key` omitted when not chosen               | POST body has no `design_key` field (server falls back to default).                                                                                                                                                                                                             |           |
| 29.6  | Server 400 — validation                            | Invalid payload -> 400 with `{ code, message }`. Toast `wizard.submitFailed`.                                                                                                                                                                                                   |           |
| 29.7  | Server 403 — permission                            | Caller lacking `report_cards.manage` -> 403. Toast.                                                                                                                                                                                                                             |           |
| 29.8  | Immediate UI state change                          | After 201 the polling view takes over; step indicator hides.                                                                                                                                                                                                                    |           |
| 29.9  | Double-submit guard                                | Button disabled while `state.submit.submitting` to prevent duplicates.                                                                                                                                                                                                          |           |
| 29.10 | Network offline during submit                      | Submit fails with network error. Toast `wizard.submitFailed`. Wizard returns to Step 6 state (not reset).                                                                                                                                                                       |           |
| 29.11 | Submit without personal info fields                | `personal_info_fields: []` -> 400 Zod validation.                                                                                                                                                                                                                               |           |
| 29.12 | `override_comment_gate=true` required when blocked | With `would_block=true` but `override_comment_gate=false`, backend -> 409 `{ code: 'COMMENT_GATE_BLOCKED' }`.                                                                                                                                                                   |           |
| 29.13 | Large scope                                        | Submitting a year_group with 500+ students: 201 returns immediately; progress via polling.                                                                                                                                                                                      |           |
| 29.14 | Submitting while another run in progress           | Permitted — runs queue independently. Verify.                                                                                                                                                                                                                                   |           |

---

## 30. Wizard — Running / Polling State

| #     | What to Check                | Expected Result                                                                                              | Pass/Fail |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 30.1  | Initial poll                 | `GET /v1/report-cards/generation-runs/{GENERATED_RUN_ID}` fires once immediately after submit -> 200.        |           |
| 30.2  | Polling cadence              | Every 3000 ms (wizard uses 3s tick; dashboard uses 5s). Confirm via Network timing.                          |           |
| 30.3  | Stop on terminal             | Polling halts when `status` ∈ `['completed','partial_success','failed']`.                                    |           |
| 30.4  | beforeunload guard           | Attempting to close tab while running triggers native confirm using `wizard.leaveWarning`.                   |           |
| 30.5  | Progress counters            | `snapshot.students_generated_count / total_count` updates each tick. Percent bar reflects ratio.             |           |
| 30.6  | Blocked count display        | `students_blocked_count` shown separately.                                                                   |           |
| 30.7  | Error list                   | `errors: [{student_id, message}]` renders as a collapsible list.                                             |           |
| 30.8  | Poll failure silent          | Poll errors console-log only. No toast spam.                                                                 |           |
| 30.9  | Status normalisation         | Non-recognised statuses fall back to `'running'` via `normaliseStatus`.                                      |           |
| 30.10 | Polling on 404               | If run id is deleted mid-poll, 404 stops polling and shows error panel.                                      |           |
| 30.11 | Stale snapshot               | `snapshot` state reflects the latest response; older in-flight responses are discarded via `cancelled` flag. |           |
| 30.12 | Terminal snapshot sticks     | Once terminal, the last snapshot remains visible even after navigating away and back.                        |           |
| 30.13 | Progress over 100% edge case | If `students_generated_count + students_blocked_count > total_count`, UI caps the bar at 100%.               |           |

---

## 31. Wizard — Terminal Outcomes

| #    | What to Check             | Expected Result                                                                                                                    | Pass/Fail |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Completed — success       | Green panel "Completed successfully". CTAs: **View library** -> `/en/report-cards/library`, **Start another** -> dispatch `RESET`. |           |
| 31.2 | Partial success           | Amber panel "Partial success — {X} generated, {Y} blocked" with error list. Both CTAs.                                             |           |
| 31.3 | Failed                    | Red panel "Generation failed" with reason. "Start another" CTA. "View library" still linked.                                       |           |
| 31.4 | Cancelled                 | If backend supports cancellation, shows "Cancelled" panel. Flag in Section 80 if cancel is unimplemented but referenced.           |           |
| 31.5 | Polling stops at terminal | No further `GET /v1/report-cards/generation-runs/{GENERATED_RUN_ID}` after terminal.                                               |           |
| 31.6 | RESET                     | "Start another" resets state to Step 1 with defaults re-seeded. Polling stops.                                                     |           |
| 31.7 | Library reflects output   | Navigating to Library shows the new run with `total_report_cards = total_count`.                                                   |           |

---

## 32. Wizard — Teacher Request Pre-Fill Handoff

| #    | What to Check                    | Expected Result                                                                                                                                                                                  | Pass/Fail |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 32.1 | Approve-and-open deep link       | From Section 48, click "Approve & Open" on a `regenerate_reports` request. Router navigates to `/en/report-cards/generate?scope_mode=class&scope_ids={CLASS_A_ID}&period_id={ACTIVE_PERIOD_ID}`. |           |
| 32.2 | Wizard reads query params        | After settings load, the effect consumes the params: dispatches `SET_SCOPE_MODE`, `SET_SCOPE_IDS`, `SET_PERIOD`, `SET_CONTENT_SCOPE: grades_only`, `locales: ['en','ar']`, then jumps to Step 6. |           |
| 32.3 | prefilled ref guards re-applying | `prefilledRef.current` flag prevents re-applying on re-render. Manually changing a field then navigating back+forward does not reset it.                                                         |           |
| 32.4 | Full-year handoff                | If request has no period, handoff routes to `/en/report-cards/requests` instead of the wizard (per detail-page logic).                                                                           |           |
| 32.5 | Unknown scope_mode               | Garbage `scope_mode=banana` param is ignored; wizard starts at Step 1.                                                                                                                           |           |
| 32.6 | Scope-mode translation           | `student` -> wizard mode `individual` (per detail-page mapping). Verify.                                                                                                                         |           |

---

## 33. Library — Load & View Toggles

| #    | What to Check               | Expected Result                                                                     | Pass/Fail |
| ---- | --------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 33.1 | Navigate to library         | From Library tile, URL = `/en/report-cards/library`.                                |           |
| 33.2 | Initial fetch               | `GET /v1/report-cards/library/grouped` -> 200 with `{ data: [GroupedRunNode, …] }`. |           |
| 33.3 | Three view toggles          | Inline tabs: **By run**, **By year group**, **By class**. Default = `by_run`.       |           |
| 33.4 | Loading skeleton            | Animated rows `h-10 rounded-lg bg-surface-secondary` while loading.                 |           |
| 33.5 | Load failure                | If endpoint returns 500, `loadFailed=true` and error empty state renders.           |           |
| 33.6 | Empty library               | If `data=[]`, `EmptyState` "No report cards yet" renders.                           |           |
| 33.7 | View toggle client-side     | Switching views triggers no new API calls. Data re-groups client-side.              |           |
| 33.8 | Refetch on explicit refresh | Calling `fetchLibrary` (e.g., after publish) hits the endpoint again.               |           |

---

## 34. Library — By Run View

| #     | What to Check                      | Expected Result                                                                                                                                     | Pass/Fail |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1  | Run row header                     | Each run shows period label, template name, design key, total count, and run-status chip.                                                           |           |
| 34.2  | Run row expand                     | Clicking a run toggles `expanded`; nested classes render.                                                                                           |           |
| 34.3  | Class node                         | Under each run, classes show class name, year group, student count, report card count.                                                              |           |
| 34.4  | Student row                        | Each row shows full name, student number, status badge (`draft`/`published`/`revised`/`superseded`), locale, template name, generated-at timestamp. |           |
| 34.5  | Legacy run chip                    | Runs with `run_status === 'legacy'` show a neutral grey chip with no action.                                                                        |           |
| 34.6  | Delete run (bulk)                  | "Delete run" enqueues `POST /v1/report-cards/bulk-delete` with every id under the run.                                                              |           |
| 34.7  | Run dates format                   | `run_started_at` uses `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory', numberingSystem: 'latn' })`.     |           |
| 34.8  | Queued/processing run              | A currently-running run shows its status chip + progress if returned.                                                                               |           |
| 34.9  | Run with zero classes              | Empty run (all students failed) shows a placeholder row inside.                                                                                     |           |
| 34.10 | Design-key unknown fallback        | `design_key` not in the catalogue renders as the raw string.                                                                                        |           |
| 34.11 | Run-level "Download bundle" button | Per run, a single action triggers `bundle-pdf` with every `report_card_id` under it.                                                                |           |
| 34.12 | Collapse-all / expand-all          | Global control toggles all `expanded` entries.                                                                                                      |           |

---

## 35. Library — By Year-Group View

| #    | What to Check                       | Expected Result                                                                                       | Pass/Fail |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | Groups per year group               | `year_group` names derived from `cls.year_group?.name` or "Unassigned".                               |           |
| 35.2 | Class nodes                         | Classes render in alpha order.                                                                        |           |
| 35.3 | Count totals                        | Year-group heading shows "{n} classes · {m} report cards".                                            |           |
| 35.4 | Student rows identical              | Same delete/download/publish row actions as Section 37.                                               |           |
| 35.5 | Empty year group                    | A year group with only empty classes (no cards) is hidden.                                            |           |
| 35.6 | Class count reflects enrolment      | Counts match `_count.class_enrolments` from the current dataset, not the snapshot at generation time. |           |
| 35.7 | Year-group heading sticky on scroll | (If implemented) heading becomes sticky at the top of its group while scrolling.                      |           |

---

## 36. Library — By Class View

| #    | What to Check           | Expected Result                                                                                                                                 | Pass/Fail |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Flat class list         | Every class appears once at the top regardless of run.                                                                                          |           |
| 36.2 | Sort order              | Classes sorted alphabetically.                                                                                                                  |           |
| 36.3 | Student rows span runs  | Within a class node, student rows show every card across runs, with run label as a secondary line.                                              |           |
| 36.4 | Click a student name    | Opens the student's individual report card preview (navigate to `/en/report-cards/{id}` or opens PDF in new tab — verify the implemented path). |           |
| 36.5 | Multi-run student       | A student with multiple published cards across terms shows each card as its own row.                                                            |           |
| 36.6 | No duplicate class rows | Each class appears exactly once in By-class view even with multiple runs.                                                                       |           |

---

## 37. Library — Row Actions (Publish / Unpublish / Delete / Revise)

| #     | What to Check                    | Expected Result                                                                                                                                                                                                                   | Pass/Fail |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.1  | Download row                     | Click Download icon. Opens `row.pdf_download_url` in a new tab. If URL null -> toast `library.downloadUnavailable`.                                                                                                               |           |
| 37.2  | Publish a draft row              | Click Publish (Send icon). `POST /v1/report-cards/{id}/publish` -> 200. Toast `library.publishSuccess`. Row flips to `published`.                                                                                                 |           |
| 37.3  | Publish permission               | Caller needs `gradebook.publish_report_cards`. Denied -> 403, toast `library.publishFailed`.                                                                                                                                      |           |
| 37.4  | Row busy state                   | Publish button disables and spinner shows while mid-flight. `busyIds` tracks it.                                                                                                                                                  |           |
| 37.5  | Unpublish (revise) published row | Click Unpublish (Undo2 icon). Confirm dialog (kind=`unpublish`). Confirm -> `POST /v1/report-cards/{id}/revise` -> 201 creates a new draft revision. Original -> `superseded`. Toast `library.unpublishBulkSuccess` with count=1. |           |
| 37.6  | Revise creates chain             | After 37.5, `GET /v1/report-cards?include_revisions=true` shows new draft with `revision_of_report_card_id` pointing to the original.                                                                                             |           |
| 37.7  | Delete a row                     | Click Trash2 (Delete). Confirm dialog (kind=`delete`). Confirm -> `DELETE /v1/report-cards/{id}` -> 200. Row removed. Toast `library.deleteSuccess` count=1.                                                                      |           |
| 37.8  | Delete audit                     | After delete, `GET /v1/report-cards/{id}` -> 404 `{ code: 'REPORT_CARD_NOT_FOUND' }`.                                                                                                                                             |           |
| 37.9  | Confirm dialog cancel            | Close dismisses without calling the API.                                                                                                                                                                                          |           |
| 37.10 | Unpublish failure                | If revise returns 409 (already revised), counts go into the failure bucket. Toast `library.unpublishBulkFailed`.                                                                                                                  |           |
| 37.11 | Delete failure                   | 500 -> toast with the server message. `confirmAction` closes.                                                                                                                                                                     |           |
| 37.12 | Download for superseded row      | Download still opens the PDF URL even if `status='superseded'`.                                                                                                                                                                   |           |
| 37.13 | Revise of already-revised row    | `POST .../revise` on a superseded row -> 409 `{ code: 'REPORT_NOT_PUBLISHED' }`.                                                                                                                                                  |           |
| 37.14 | Confirm dialog title localised   | Dialog title + description use `library.confirmDeleteTitle/Description` etc.                                                                                                                                                      |           |
| 37.15 | busyIds cleaned after error      | After a failed publish, `busyIds` set removes the id. Button re-enables.                                                                                                                                                          |           |
| 37.16 | Optimistic UI not used           | Row action does NOT optimistically flip UI — waits for server confirmation before updating.                                                                                                                                       |           |

---

## 38. Library — Bulk Selection + Bulk Delete

| #     | What to Check                                 | Expected Result                                                                                                                                                                    | Pass/Fail |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 38.1  | Row checkbox toggles selected                 | Click checkbox adds/removes the id from `selected`.                                                                                                                                |           |
| 38.2  | Select-all per class                          | Class-level checkbox toggles every row id under it.                                                                                                                                |           |
| 38.3  | Bulk action bar                               | When `selected.size > 0`, a sticky bar shows "{n} selected" + **Publish all**, **Unpublish all**, **Delete all**, **Download bundle**.                                             |           |
| 38.4  | Bulk publish                                  | Click "Publish all". Loops `POST /v1/report-cards/{id}/publish` per id. Counts ok/fail. Toast `library.publishBulkSuccess/Failed` with counts.                                     |           |
| 38.5  | Bulk delete                                   | Confirm dialog -> `POST /v1/report-cards/bulk-delete` with `{ report_card_ids: [...] }` -> 200 `{ data: { count: n, deleted_ids } }`. Rows removed. Toast `library.deleteSuccess`. |           |
| 38.6  | Bulk unpublish skip non-published             | Unpublish runs only on rows with `status='published'`. If none selected are published -> toast `library.unpublishNoneSelected`, no calls.                                          |           |
| 38.7  | Clear selection after action                  | `selected` resets to empty after any bulk action.                                                                                                                                  |           |
| 38.8  | Selection persists across view switches       | Switching view tabs preserves `selected` if ids exist in the derived structure.                                                                                                    |           |
| 38.9  | Mixed selection                               | Selecting some drafts + some published: bulk Delete deletes all; bulk Publish publishes drafts only; bulk Unpublish processes published only.                                      |           |
| 38.10 | Confirm dialog shows count                    | Dialog description includes "Delete {count} report cards" using `library.selectionCount`.                                                                                          |           |
| 38.11 | Bulk publish partial fail                     | Mixed success/fail returns both toasts (`library.publishBulkSuccess` + `Failed` with counts).                                                                                      |           |
| 38.12 | Download bundle from bulk bar                 | Clicking "Download bundle" uses current `selected` ids in `report_card_ids` param.                                                                                                 |           |
| 38.13 | Selection persists across reload-blocking nav | Refreshing the page clears `selected` (it's in-memory only).                                                                                                                       |           |

---

## 39. Library — Bundle Download (PDF merge vs ZIP)

| #     | What to Check                 | Expected Result                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1  | Class-level "Download bundle" | `GET /v1/report-cards/library/bundle-pdf?class_ids={CLASS_A_ID}&merge_mode=merge&locale=en&academic_period_id={ACTIVE_PERIOD_ID}` -> 200 streams `application/pdf` with `Content-Disposition: attachment; filename="..."`. Browser downloads single merged PDF. |           |
| 39.2  | Merge_mode=zip                | Same endpoint with `merge_mode=zip` -> 200 streams `application/zip` with per-class PDFs.                                                                                                                                                                       |           |
| 39.3  | Run-level bundle              | Bundle on a run row uses `report_card_ids=[...]` or `class_ids=[...]` per implementation. 200 streams.                                                                                                                                                          |           |
| 39.4  | Full-year bundle              | `academic_period_id=full_year` -> server maps to `IS NULL`. 200.                                                                                                                                                                                                |           |
| 39.5  | Academic year bundle          | `academic_year_id={ACTIVE_YEAR_ID}` scopes to that year's rows.                                                                                                                                                                                                 |           |
| 39.6  | Filename format               | Content-Disposition filename descriptive (e.g., `"report-cards-term-2.pdf"` / `"report-cards-{ts}.zip"`).                                                                                                                                                       |           |
| 39.7  | Empty scope 400               | Request without any id/filter -> 400 Zod validation error.                                                                                                                                                                                                      |           |
| 39.8  | Permission                    | Caller needs `report_cards.manage`. Teacher -> 403.                                                                                                                                                                                                             |           |
| 39.9  | Large bundle                  | 100+ cards: response completes within 30s or the server streams progressively. Flag slow responses in Section 80.                                                                                                                                               |           |
| 39.10 | Locale mismatch               | Request with `locale=fr` (unsupported) -> 400 Zod validation.                                                                                                                                                                                                   |           |
| 39.11 | Mime for ZIP                  | `Content-Type: application/zip`. `filename="...-{ts}.zip"`.                                                                                                                                                                                                     |           |
| 39.12 | Bundle with superseded rows   | `include_revisions=true` includes revisions in the bundle order.                                                                                                                                                                                                |           |
| 39.13 | Bundle empty result           | If filter yields zero cards -> 404 `{ code: 'NO_REPORT_CARDS_MATCH' }` or empty PDF. Document behaviour.                                                                                                                                                        |           |

---

## 40. Library — Filters

| #     | What to Check               | Expected Result                                                                            | Pass/Fail |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 40.1  | Filter by class_ids         | `GET /v1/report-cards/library?class_ids={CLASS_A_ID},{CLASS_B_ID}` -> 200. Rows scoped.    |           |
| 40.2  | Filter by run_ids           | `GET /v1/report-cards/library?run_ids={GENERATED_RUN_ID}` -> 200. Only rows from that run. |           |
| 40.3  | `include_revisions=true`    | Default `false`; revised rows hidden unless flag set. With `true` all revisions appear.    |           |
| 40.4  | Academic period filter      | `?academic_period_id={ACTIVE_PERIOD_ID}` returns that period's rows.                       |           |
| 40.5  | Full-year sentinel          | `academic_period_id=full_year` maps to IS NULL.                                            |           |
| 40.6  | Pagination                  | `?page=1&pageSize=20` response meta `{ page, pageSize, total }`.                           |           |
| 40.7  | Invalid filter shape        | `class_ids=not-a-uuid` -> 400 Zod.                                                         |           |
| 40.8  | Multi-filter combo          | `class_ids=...&run_ids=...&include_revisions=true` all compose correctly.                  |           |
| 40.9  | pageSize max                | `?pageSize=200` clamped to 100 by schema; returns 100 or 400.                              |           |
| 40.10 | Filter combo with full-year | `academic_period_id=full_year&class_ids={id}` returns only full-year rows for that class.  |           |
| 40.11 | Ordering                    | Default sort: newest first by `generated_at` within class nodes.                           |           |

---

## 41. Library — Individual PDF Download Contract

| #     | What to Check           | Expected Result                                                                                  | Pass/Fail |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 41.1  | Endpoint                | `GET /v1/report-cards/{id}/pdf` with valid token -> 200.                                         |           |
| 41.2  | Content-Type            | Response header `Content-Type: application/pdf`.                                                 |           |
| 41.3  | Content-Disposition     | Header `inline; filename="report-card.pdf"`.                                                     |           |
| 41.4  | Body is valid PDF       | First 4 bytes = `%PDF`.                                                                          |           |
| 41.5  | 404 on missing card     | Nonexistent id -> 404 `{ code: 'REPORT_CARD_NOT_FOUND' }`.                                       |           |
| 41.6  | Permission              | Requires `gradebook.view`. Anonymous -> 401.                                                     |           |
| 41.7  | RLS isolation           | Cross-tenant request -> 404 (not 403).                                                           |           |
| 41.8  | Branding injected       | PDF renders tenant school name, logo, primary colour, report-card title from `branding` payload. |           |
| 41.9  | Locale-matched template | If `row.template_locale === 'ar'`, PDF renders in Arabic with correct fonts.                     |           |
| 41.10 | Buffer size header      | `Content-Length` is set to `buffer.length`.                                                      |           |
| 41.11 | Render failure          | If PDF renderer throws, response is 500 with `{ code: 'PDF_RENDER_FAILED' }`.                    |           |

---

## 42. Analytics — Load & Period Selector

| #    | What to Check              | Expected Result                                                                                                                                           | Pass/Fail |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1 | Navigate via snapshot CTA  | From dashboard Analytics panel, click "View full analytics". URL = `/en/report-cards/analytics?academic_period_id={id}`.                                  |           |
| 42.2 | Initial fetches            | `GET /v1/report-cards/analytics/dashboard` and `GET /v1/report-cards/analytics/class-comparison` fire. Optionally `GET /v1/academic-periods?pageSize=50`. |           |
| 42.3 | Query-param hydration      | Page reads `searchParams.academic_period_id` — supports UUID, `'full_year'`, and `'all'` sentinel.                                                        |           |
| 42.4 | "All periods" selector     | `all` re-fires both endpoints WITHOUT `academic_period_id` query param.                                                                                   |           |
| 42.5 | Back button                | Ghost "Back to Report Cards" -> `/en/report-cards`.                                                                                                       |           |
| 42.6 | Empty dataset              | If the dashboard returns all zeros, KPI cards show 0 with `—` fallback for percentages.                                                                   |           |
| 42.7 | Period selector responsive | On mobile, selector is full-width.                                                                                                                        |           |
| 42.8 | Loading state              | While fetching, KPI cards show skeletons.                                                                                                                 |           |
| 42.9 | Failed fetch               | 500 shows an error empty state; no toast loops.                                                                                                           |           |

---

## 43. Analytics — Summary Cards

| #     | What to Check                  | Expected Result                                                                                                        | Pass/Fail |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 43.1  | Total                          | Large number, label "Total".                                                                                           |           |
| 43.2  | Published / Draft / Revised    | Three cards with counts.                                                                                               |           |
| 43.3  | Pending approval               | Card showing `pending_approval`.                                                                                       |           |
| 43.4  | Completion rate                | Percentage derived from `published / total`. Tabular numerals.                                                         |           |
| 43.5  | Overall comments finalised     | `{finalised}/{total}` ratio.                                                                                           |           |
| 43.6  | Subject comments finalised     | `{finalised}/{total}` ratio.                                                                                           |           |
| 43.7  | `comment_fill_rate` deprecated | Marked deprecated in the type — should NOT render. If present, flag Section 80.                                        |           |
| 43.8  | Card order                     | Total, Published, Draft, Revised, Pending, Completion, Overall comments, Subject comments (or the canonical UX order). |           |
| 43.9  | Completion rate `—`            | When `total=0`, completion rate shows `—` not `NaN%`.                                                                  |           |
| 43.10 | Delta indicator                | If prior-period data is available, a small up/down arrow reflects the delta. (Flag if not implemented.)                |           |

---

## 44. Analytics — Class Comparison Chart

| #     | What to Check            | Expected Result                                                                                      | Pass/Fail |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------- | --------- |
| 44.1  | Bar chart renders        | Recharts `<BarChart>` with axes labelled class name and average grade.                               |           |
| 44.2  | Tooltip on hover         | Shows class name, average grade, published count, completion rate.                                   |           |
| 44.3  | X-axis labels readable   | Long names rotate or truncate.                                                                       |           |
| 44.4  | Empty dataset            | If `class_comparison=[]`, shows "No data" empty state.                                               |           |
| 44.5  | Period filter propagates | Changing selector re-fetches both endpoints with new period.                                         |           |
| 44.6  | Chart responsive         | At 375px `<ResponsiveContainer>` squeezes to full width without horizontal scroll.                   |           |
| 44.7  | Legend                   | Legend shows series name ("Average grade").                                                          |           |
| 44.8  | Colour tokens            | Bars use primary tokens, no hardcoded hex.                                                           |           |
| 44.9  | Click a bar              | Clicking a bar navigates to `/en/report-cards/{classId}` or filters the analytics. Verify behaviour. |           |
| 44.10 | Bar order                | Sorted by `class_name` or by `average_grade` descending — document and confirm.                      |           |

---

## 45. Analytics — Per-Class Generation Progress

| #     | What to Check             | Expected Result                                                                                  | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 45.1  | Progress list             | Per-class table or line chart showing `published_count / student_count` ratios.                  |           |
| 45.2  | Colour coding             | >80% green, 40–80% amber, <40% red (via tokens).                                                 |           |
| 45.3  | Click-through             | Clicking a class row/line navigates to `/en/report-cards/{classId}`.                             |           |
| 45.4  | Trends line chart         | If `trends[]` returned, a `<LineChart>` plots `avg_score` + `completion_pct` over `period_name`. |           |
| 45.5  | Empty trends              | If no trends returned, the chart section is hidden entirely.                                     |           |
| 45.6  | Trend chart locale        | `period_name` labels render localised where translated.                                          |           |
| 45.7  | Trend lines colour        | Separate colours for `avg_score` and `completion_pct` via design tokens.                         |           |
| 45.8  | Per-class drill-down link | Each class row has a "View class" link to `/en/report-cards/{classId}`.                          |           |
| 45.9  | Accessibility labels      | Chart has `role='img'` and `aria-label` summarising the data.                                    |           |
| 45.10 | Print-friendly            | Ctrl+P produces a clean, monochrome-compatible chart (no dark backgrounds).                      |           |

---

## 46. Teacher Requests — List Page (Pending / All Tabs)

| #     | What to Check                     | Expected Result                                                                                                                                  | Pass/Fail |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 46.1  | Navigate via tile                 | From dashboard Requests tile -> `/en/report-cards/requests`.                                                                                     |           |
| 46.2  | Initial fetch                     | `GET /v1/report-card-teacher-requests?status=pending&pageSize=100` (pending tab). Plus `GET /v1/academic-periods?pageSize=100` for period names. |           |
| 46.3  | Two admin tabs                    | **Pending** (default), **All**. Teachers see only implicit "mine".                                                                               |           |
| 46.4  | Pending tab badge                 | When `pendingCount > 0`, badge shows count.                                                                                                      |           |
| 46.5  | Switch to All                     | Click **All**. Fetches `?pageSize=100` without status filter.                                                                                    |           |
| 46.6  | Loading skeleton                  | Three `h-16` animated rows.                                                                                                                      |           |
| 46.7  | Empty pending                     | `EmptyState` MessageSquare + `requests.emptyPending`.                                                                                            |           |
| 46.8  | Empty all                         | `requests.empty`.                                                                                                                                |           |
| 46.9  | Load failure                      | 500 -> `EmptyState` AlertCircle + `requests.loadFailed`.                                                                                         |           |
| 46.10 | Admin columns                     | Requester, Type, Period, Scope, Reason, Status, Requested at, Actions.                                                                           |           |
| 46.11 | Status badge mapping              | Pending=warning, Approved=info, Completed=success, Rejected=danger, Cancelled=secondary.                                                         |           |
| 46.12 | Row Review action                 | Click **Review** -> `/en/report-cards/requests/{id}`.                                                                                            |           |
| 46.13 | "+ New request" hidden for admins | Admins review but do not file requests.                                                                                                          |           |
| 46.14 | Period name fallback              | If period id not in `periodMap`, renders the raw UUID.                                                                                           |           |
| 46.15 | Scope summary                     | `target_scope_json.scope` + `ids.length` rendered as "Class: 3 items" etc.                                                                       |           |
| 46.16 | Requester name hydration          | Row shows `requester.full_name` or fallback from email or id slice.                                                                              |           |
| 46.17 | Status filter URL param           | Tab state does not currently appear in URL (client state). Flag if deep-linking is expected.                                                     |           |
| 46.18 | Request with full-year scope      | Requests without `academic_period_id` show "Full year" in the Period column.                                                                     |           |
| 46.19 | Very long reason truncated        | Reasons > ~120 chars truncate in the table cell; full text shown in `title` attribute.                                                           |           |
| 46.20 | Date format                       | `created_at` uses `formatDateTime` helper (locale-aware, Gregorian, Latin numerals).                                                             |           |

---

## 47. Teacher Requests — Detail Page

| #    | What to Check                      | Expected Result                                                                                                                                             | Pass/Fail |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ----------- | --- |
| 47.1 | Navigate to detail                 | From list, click Review. URL = `/en/report-cards/requests/{id}`.                                                                                            |           |
| 47.2 | Initial fetch                      | `GET /v1/report-card-teacher-requests/{id}` -> 200 `{ data: {...} }`. Period-specific requests also fetch `GET /v1/academic-periods?pageSize=100` silently. |           |
| 47.3 | Header                             | "Teacher request" title. Back button -> `/en/report-cards/requests`.                                                                                        |           |
| 47.4 | Loading + error + not-found states | Skeleton while loading; `EmptyState` for load-failed and 404.                                                                                               |           |
| 47.5 | Request detail card                | Shows status badge, type label, requester (name + email), period, scope, requested at, reason (`whitespace-pre-wrap`).                                      |           |
| 47.6 | Review note (if reviewed)          | Grey panel shows review note + reviewer name + reviewed at timestamp.                                                                                       |           |
| 47.7 | Actions for admin + pending        | **Approve & Open**, **Auto-approve**, **Reject** buttons.                                                                                                   |           |
| 47.8 | Actions hidden for non-pending     | Action buttons hidden if status ∈ `approved                                                                                                                 | completed | rejected | cancelled`. |     |
| 47.9 | UUID param parsing                 | `params.id` resolves to a string (first element if array). Invalid UUID -> server 400 on load.                                                              |           |

---

## 48. Teacher Requests — Approve & Open Flow

| #     | What to Check                            | Expected Result                                                                                                                                                                 | Pass/Fail |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 48.1  | Click "Approve & Open"                   | `PATCH /v1/report-card-teacher-requests/{id}/approve` with `{ auto_execute: false }` -> 200. Toast `detail.approveSuccess`.                                                     |           |
| 48.2  | Route — comment window                   | For `request_type='open_comment_window'` with a period: -> `/en/report-comments?open_window_period={period_id}`.                                                                |           |
| 48.3  | Route — regenerate                       | For `regenerate_reports` with scope + period: -> `/en/report-cards/generate?scope_mode={mode}&scope_ids={ids.join(',')}&period_id={period_id}`. `student` maps to `individual`. |           |
| 48.4  | Full-year reopen fallback                | Request with no `academic_period_id` -> fallback nav `/en/report-cards/requests`.                                                                                               |           |
| 48.5  | 403 not admin                            | Teacher approving -> 403 `{ code: 'NOT_AUTHORISED' }`. Toast.                                                                                                                   |           |
| 48.6  | Already-approved 409                     | Approving non-pending -> 409 `{ code: 'REQUEST_NOT_PENDING' }`.                                                                                                                 |           |
| 48.7  | Approve audit                            | Reload detail: `reviewed_by_user_id = Yusuf's id`, `reviewed_at = now`, `status='approved'`, `resulting_window_id`/`resulting_run_id` populated where applicable.               |           |
| 48.8  | Handoff query param consumed             | On the landing/generate page, the query param is consumed once via a ref guard and stripped via `history.replaceState`.                                                         |           |
| 48.9  | Comment-window handoff consumed once     | Landing page `openWindowHandoffRef` prevents re-opening the modal on re-render.                                                                                                 |           |
| 48.10 | Handoff param sanitised                  | The `open_window_period` param must be a valid UUID; malformed values are ignored.                                                                                              |           |
| 48.11 | Regenerate handoff — ids comma-separated | URL-encoded `scope_ids` with commas; wizard splits on comma and filters empties.                                                                                                |           |
| 48.12 | Navigation preserves locale              | Approve-and-open respects the current locale prefix (`/ar/...` if on Arabic).                                                                                                   |           |

---

## 49. Teacher Requests — Auto-Approve Flow

| #    | What to Check                | Expected Result                                                                                                                                                       | Pass/Fail |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 49.1 | Click "Auto-approve"         | Opens `ConfirmDialog` with title "Auto-approve" and description `detail.autoApproveConfirm`.                                                                          |           |
| 49.2 | Confirm                      | `PATCH /v1/report-card-teacher-requests/{id}/approve` with `{ auto_execute: true }` -> 200. Toast `detail.approveSuccess`. Dialog closes. Row refreshes (bump token). |           |
| 49.3 | Side effect — comment window | Backend opens the window immediately; next `GET /v1/report-comment-windows/active` returns a new row.                                                                 |           |
| 49.4 | Side effect — regenerate     | Backend enqueues a new run; `GET /v1/report-cards/generation-runs?page=1&pageSize=5` shows a fresh `queued` row.                                                      |           |
| 49.5 | Cancel the dialog            | Closes without calling API.                                                                                                                                           |           |
| 49.6 | Error handling               | 500 -> toast `detail.approveFailure`, dialog stays open.                                                                                                              |           |
| 49.7 | No double-submit             | While `actionInFlight=true`, Confirm button disabled.                                                                                                                 |           |

---

## 50. Teacher Requests — Reject Flow

| #    | What to Check       | Expected Result                                                                                                                                                                             | Pass/Fail |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 50.1 | Click "Reject"      | Opens `RejectModal`. Textarea "Reason for rejection" (required) + Reject + Cancel.                                                                                                          |           |
| 50.2 | Empty reason        | Submitting empty shows field-level validation error; no API call.                                                                                                                           |           |
| 50.3 | Valid reject        | Enter "Please resubmit with updated scope". Click Reject. `PATCH /v1/report-card-teacher-requests/{id}/reject` with `{ reason: '...' }` -> 200. Toast success. Modal closes. Row refreshes. |           |
| 50.4 | Reviewer audit      | Detail page re-renders with `review_note`, `reviewed_by_user_id`, `reviewed_at`.                                                                                                            |           |
| 50.5 | Cannot re-reject    | Second reject on same request -> 409 `{ code: 'REQUEST_NOT_PENDING' }`.                                                                                                                     |           |
| 50.6 | Modal a11y          | Focus trap + Esc closes + focus returns to trigger.                                                                                                                                         |           |
| 50.7 | Reason max length   | Reason > 500 chars -> 400 Zod.                                                                                                                                                              |           |
| 50.8 | Reject audit record | `GET /v1/audit-logs?entity_id={id}` includes a `request.rejected` event with the full reason body.                                                                                          |           |

---

## 51. Report Comments — Landing Page Load

| #     | What to Check                   | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 51.1  | Navigate via tile               | Write comments tile -> `/en/report-comments`.                                                                                                                                                           |           |
| 51.2  | Initial fetches                 | `GET /v1/report-comment-windows/active`, `GET /v1/report-comment-windows/landing`, `GET /v1/year-groups?pageSize=100`, `GET /v1/classes?pageSize=100`, `GET /v1/subjects?pageSize=200` (or equivalent). |           |
| 51.3  | Header                          | Title `reportComments.title`. Back button -> `/en/report-cards`.                                                                                                                                        |           |
| 51.4  | Query-param handoff             | Arriving with `?open_window_period={id}` auto-opens the Open Window modal pre-filled. Query param stripped via `history.replaceState`.                                                                  |           |
| 51.5  | Admin buttons                   | "Open window" and "Extend / Close / Reopen" visible to admins only.                                                                                                                                     |           |
| 51.6  | Homeroom cards                  | Admin lists every class with a homeroom teacher assigned for the open window. Each card shows finalised/total overall comment counts.                                                                   |           |
| 51.7  | Subject assignment cards        | Every `(class, subject)` pair in the curriculum matrix renders; admin sees all, teacher sees only their competencies.                                                                                   |           |
| 51.8  | No-open-window state            | When no active window AND no scheduled, page shows "No open window" + Open window CTA.                                                                                                                  |           |
| 51.9  | Handoff-ref guards              | `openWindowHandoffRef.current` prevents re-triggering on re-render.                                                                                                                                     |           |
| 51.10 | Subject cards render sparklines | Per-subject card shows a small trend of finalised comment count.                                                                                                                                        |           |
| 51.11 | Empty curriculum                | If no `(class, subject)` pair exists, subject-cards section renders an empty state.                                                                                                                     |           |
| 51.12 | Sort by year group              | Cards grouped by year group with year-group header.                                                                                                                                                     |           |

---

## 52. Report Comments — Window Banner (scheduled / open / closed)

| #    | What to Check                       | Expected Result                                                                                      | Pass/Fail |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 52.1 | No active window                    | Banner hidden.                                                                                       |           |
| 52.2 | Scheduled (opens in future)         | Blue banner "Window opens {date}" with countdown. Admin has Edit button.                             |           |
| 52.3 | Open now                            | Green banner "Window is open — closes {date}" with countdown. Admin sees **Extend** + **Close now**. |           |
| 52.4 | Window instructions                 | If `instructions_md` is set, rendered below banner with Markdown support.                            |           |
| 52.5 | Closed state                        | Red/grey banner "Window closed on {date}". Admin sees **Reopen window**.                             |           |
| 52.6 | Countdown refresh                   | Countdown to `opens_at`/`closes_at` re-renders at least every minute without a hard refresh.         |           |
| 52.7 | Locale date format                  | Dates use Gregorian calendar, Latin numerals, locale-aware formatting.                               |           |
| 52.8 | Countdown rollover                  | When countdown hits 0, banner flips from "opens in" to "is open" without reload.                     |           |
| 52.9 | Closed banner includes close reason | If close was auto (cron), banner indicates "Auto-closed at {time}".                                  |           |

---

## 53. Report Comments — Open / Extend / Close / Reopen Modals

| #     | What to Check                          | Expected Result                                                                                                                                                                 | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 53.1  | Click "Open window"                    | `OpenWindowModal` opens. Fields: period select, opens_at (datetime-local, defaults to now), closes_at (datetime-local, defaults to +7 days), instructions (textarea, optional). |           |
| 53.2  | Submit Open Window                     | `POST /v1/report-comment-windows` with `{ academic_period_id, opens_at, closes_at, instructions_md? }` -> 201. Toast success. Modal closes. Page reloads landing scope.         |           |
| 53.3  | Overlap validation                     | Overlapping window -> 409 `{ code: 'WINDOW_OVERLAP' }`. Toast.                                                                                                                  |           |
| 53.4  | Validation — closes_at before opens_at | 400 Zod error. Modal stays open with field-level error.                                                                                                                         |           |
| 53.5  | Extend modal                           | Click "Extend". `ExtendWindowModal` opens with datetime input. Submit -> `PATCH /v1/report-comment-windows/{id}/extend` with `{ closes_at: iso }` -> 200.                       |           |
| 53.6  | Close now                              | Click "Close now" -> `ConfirmDialog` -> Confirm -> `PATCH /v1/report-comment-windows/{id}/close` -> 200. Banner flips to closed.                                                |           |
| 53.7  | Reopen                                 | From closed, click "Reopen". `PATCH /v1/report-comment-windows/{id}/reopen` -> 200. Banner flips to open.                                                                       |           |
| 53.8  | Modal a11y                             | Trap focus, Esc closes, focus returns to trigger.                                                                                                                               |           |
| 53.9  | Scheduled-window edit                  | Editing a scheduled window uses `PATCH /v1/report-comment-windows/{id}` (instructions/schedule update).                                                                         |           |
| 53.10 | Extend beyond year end                 | Extending `closes_at` beyond the academic year's `end_date` -> 400 `{ code: 'WINDOW_BEYOND_YEAR' }`.                                                                            |           |
| 53.11 | Close before open                      | Submitting `close` on a scheduled (not yet open) window -> 409 `{ code: 'WINDOW_NOT_OPEN' }`.                                                                                   |           |
| 53.12 | Reopen after final close               | Reopening a window that's been reopened+closed multiple times -> 200 (no limit).                                                                                                |           |
| 53.13 | Instructions Markdown sanitisation     | `<script>` tags in instructions are stripped or escaped.                                                                                                                        |           |

---

## 54. Overall Comments Editor — Entry & Permission

| #    | What to Check               | Expected Result                                                                                                                 | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 54.1 | Navigate from landing       | Click a homeroom card. URL = `/en/report-comments/overall/{CLASS_A_ID}`.                                                        |           |
| 54.2 | Initial fetch               | `GET /v1/report-card-overall-comments?class_id={CLASS_A_ID}&academic_period_id={ACTIVE_PERIOD_ID}` -> 200. One row per student. |           |
| 54.3 | Header                      | Class name + year group + active window badge. Back button -> `/en/report-comments`.                                            |           |
| 54.4 | Student rows                | Each row shows full name, student number, comment textarea, character count, finalised switch.                                  |           |
| 54.5 | Admin bypass                | Admin can edit comments for any class. `isAdmin` is resolved server-side.                                                       |           |
| 54.6 | Teacher not homeroom -> 403 | (Teacher parity) Non-homeroom teacher gets 403 `{ code: 'NOT_HOMEROOM_TEACHER' }` on upsert.                                    |           |
| 54.7 | Closed window load          | If the window is closed, rows still display but inputs are disabled.                                                            |           |

---

## 55. Overall Comments Editor — Write + Autosave

| #     | What to Check               | Expected Result                                                                                                                               | Pass/Fail |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 55.1  | Type in a textarea          | Text appears immediately in client state.                                                                                                     |           |
| 55.2  | Autosave debounce           | After ~1.5s idle, `POST /v1/report-card-overall-comments` fires with `{ student_id, class_id, academic_period_id, body_md }` -> 200 (upsert). |           |
| 55.3  | Saving indicator            | Small spinner next to the student row.                                                                                                        |           |
| 55.4  | Save success                | Spinner replaced with "Saved" + timestamp.                                                                                                    |           |
| 55.5  | Save failure                | 500 -> toast `overall.saveFailed`, row marked "Unsaved". Retry on next keystroke.                                                             |           |
| 55.6  | Max length                  | Body exceeding schema max -> 400 validation error. Field shows error state.                                                                   |           |
| 55.7  | Concurrent edits            | Another admin saving same row: next fetch reconciles via `updated_at`. Flag stale-overwrite risk in Section 80.                               |           |
| 55.8  | Window closed               | Post-close, saves return 403 `{ code: 'WINDOW_CLOSED' }`. Toast.                                                                              |           |
| 55.9  | Character count             | Character count updates in real time as the user types.                                                                                       |           |
| 55.10 | Empty save allowed          | Saving empty body as a draft is allowed (finalise step enforces non-empty).                                                                   |           |
| 55.11 | Autosave before unmount     | Navigating away with pending save triggers a final flush via `beforeunload` or effect cleanup.                                                |           |
| 55.12 | Autosave race with finalise | Finalising a row while an autosave is in flight: the finalise waits or rejects until save settles.                                            |           |
| 55.13 | Paste a large block         | Pasting a 10KB text: autosave still fires without blocking the UI.                                                                            |           |
| 55.14 | Emoji + special chars       | UTF-8 safe. Saved body preserves emoji and RTL-mark characters.                                                                               |           |
| 55.15 | Arabic input                | Typing Arabic in the textarea saves correctly with `dir="auto"` on the paragraph.                                                             |           |

---

## 56. Overall Comments Editor — Finalise + Unfinalise

| #    | What to Check               | Expected Result                                                                                                        | Pass/Fail |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 56.1 | Finalise switch             | Flipping for a student fires `PATCH /v1/report-card-overall-comments/{id}/finalise` -> 200. Row gets "Finalised" pill. |           |
| 56.2 | Finalise empty              | `body_md` empty -> may 409 `{ code: 'COMMENT_EMPTY' }`. Toast.                                                         |           |
| 56.3 | Finalised row locked        | Textarea disables when finalised. Unfinalise to edit.                                                                  |           |
| 56.4 | Unfinalise                  | `PATCH /v1/report-card-overall-comments/{id}/unfinalise` -> 200. Textarea re-enables.                                  |           |
| 56.5 | Landing count reflects      | Finalising increments `finalised_count` on the homeroom card.                                                          |           |
| 56.6 | Non-author unfinalise       | Admin can unfinalise a teacher-authored comment. Verify audit log.                                                     |           |
| 56.7 | Finalise after window close | Once the window is closed, finalise attempts -> 403 (verify behaviour).                                                |           |
| 56.8 | Audit record on finalise    | An audit log records `overall_comment.finalised` with actor id.                                                        |           |
| 56.9 | Audit record on unfinalise  | An audit log records `overall_comment.unfinalised`.                                                                    |           |

---

## 57. Overall Comments Editor — Request Reopen Modal

| #    | What to Check                             | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 57.1 | Click "Request reopen" on a closed window | Opens `RequestReopenModal`. Teachers use this to file an `open_comment_window` request.                                                                                                  |           |
| 57.2 | Fill and submit                           | Textarea "Why do you need this reopened?" -> submit -> `POST /v1/report-card-teacher-requests` with `{ request_type: 'open_comment_window', academic_period_id, reason }` -> 201. Toast. |           |
| 57.3 | Admin alternative                         | Admins see "Reopen now" instead (direct reopen — Section 53.7).                                                                                                                          |           |
| 57.4 | Empty reason blocked                      | Submitting empty shows validation error.                                                                                                                                                 |           |

---

## 58. Subject Comments Editor — Entry & Permission

| #    | What to Check               | Expected Result                                                                                                                          | Pass/Fail               |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --- |
| 58.1 | Navigate from landing       | Click a subject card. URL = `/en/report-comments/subject/{CLASS_A_ID}/{SUBJECT_1_ID}`.                                                   |                         |
| 58.2 | Initial fetch               | `GET /v1/report-card-subject-comments?class_id={CLASS_A_ID}&subject_id={SUBJECT_1_ID}&academic_period_id={ACTIVE_PERIOD_ID}` -> 200.     |                         |
| 58.3 | Count endpoint              | Optional: `GET /v1/report-card-subject-comments/count?class_id=...&subject_id=...&academic_period_id=...` -> 200 `{ finalised, total }`. |                         |
| 58.4 | Header                      | Class + subject name. Back link -> `/en/report-comments`.                                                                                |                         |
| 58.5 | Admin bypass                | Admin sees every row regardless of teacher competency.                                                                                   |                         |
| 58.6 | Invalid classId / subjectId | Invalid UUIDs -> 400. Nonexistent ids -> 404 `{ code: 'CLASS_NOT_FOUND'                                                                  | 'SUBJECT_NOT_FOUND' }`. |     |
| 58.7 | Subject not taught in class | `(class, subject)` pair not in curriculum matrix -> 404 `{ code: 'SUBJECT_NOT_IN_CLASS' }`.                                              |                         |

---

## 59. Subject Comments Editor — Write + Autosave

| #    | What to Check                    | Expected Result                                                                                                          | Pass/Fail |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 59.1 | Per-student row                  | Shows student name, grade sparkline, comment textarea, char count, AI draft button, finalise switch.                     |           |
| 59.2 | Autosave debounce                | `POST /v1/report-card-subject-comments` with `{ student_id, class_id, subject_id, academic_period_id, body_md }` -> 200. |           |
| 59.3 | Server validation                | Empty body allowed as draft; finalise enforces non-empty.                                                                |           |
| 59.4 | Window closed                    | Post-close saves -> 403 `{ code: 'WINDOW_CLOSED' }`.                                                                     |           |
| 59.5 | Concurrent editor                | `author_user_id` diff renders "Edited by {other} at {time}".                                                             |           |
| 59.6 | Sparkline renders                | Shows the student's grade series across prior assessments. Empty if no grades.                                           |           |
| 59.7 | Student without any grades       | Sparkline renders a flat line or empty state; no crash.                                                                  |           |
| 59.8 | Long comments scroll inside cell | Textarea grows to a max-height and scrolls internally.                                                                   |           |

---

## 60. Subject Comments Editor — Per-Row AI Draft

| #     | What to Check                 | Expected Result                                                                                                                                                   | Pass/Fail |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 60.1  | Click "AI draft"              | Button shows spinner. `POST /v1/report-card-subject-comments/ai-draft` with `{ student_id, subject_id, class_id, academic_period_id }` -> 200 `{ draft: '...' }`. |           |
| 60.2  | Draft populates textarea      | Textarea replaces content with draft. Autosave fires after debounce.                                                                                              |           |
| 60.3  | Rate limiting                 | Rapid clicks -> 429 `{ code: 'AI_RATE_LIMIT' }` (if implemented). Toast.                                                                                          |           |
| 60.4  | AI provider failure           | 502/503 -> toast `ai.draftFailed`. Button re-enables.                                                                                                             |           |
| 60.5  | Admin bypass                  | Admin can draft for any student regardless of competency.                                                                                                         |           |
| 60.6  | Insufficient data             | Student with no grades -> 422 `{ code: 'INSUFFICIENT_DATA' }`. Toast.                                                                                             |           |
| 60.7  | Draft overrides unsaved edits | Warning toast notes overwrite when textarea had dirty content.                                                                                                    |           |
| 60.8  | AI response localisation      | Draft matches student's preferred language or the window locale.                                                                                                  |           |
| 60.9  | AI failure feature-flag off   | If AI feature is disabled, button is hidden.                                                                                                                      |           |
| 60.10 | Streaming vs one-shot         | Depending on impl, draft may stream into the textarea or arrive whole. Verify.                                                                                    |           |

---

## 61. Subject Comments Editor — Bulk AI Draft All

| #     | What to Check                    | Expected Result                                                                              | Pass/Fail |
| ----- | -------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 61.1  | "Draft all" button               | Top of the subject editor (admin + teacher).                                                 |           |
| 61.2  | Confirmation modal               | `ConfirmDialog` explaining overwrite of existing drafts.                                     |           |
| 61.3  | Confirm                          | Loops students firing `POST .../ai-draft` with small delay. Progress counter "3 / 25".       |           |
| 61.4  | Partial failure                  | Failed rows skipped. Final toast "Drafted {X} / {Y}".                                        |           |
| 61.5  | Finalised rows skipped           | Rows with `finalised=true` are not overwritten.                                              |           |
| 61.6  | Cancel mid-run                   | Cancel aborts remaining iterations (flag if missing).                                        |           |
| 61.7  | Idempotency                      | Re-running produces fresh drafts per call (LLM non-deterministic).                           |           |
| 61.8  | Rate limit per hour              | Bulk drafts share the same rate bucket as per-row drafts. 30-per-hour limit (flag actual).   |           |
| 61.9  | Queue vs inline                  | Verify whether bulk draft enqueues a BullMQ job or runs inline. Document.                    |           |
| 61.10 | LLM empty response               | If the LLM returns an empty string, row skipped in the count.                                |           |
| 61.11 | Concurrent admin + teacher draft | If both fire bulk drafts simultaneously, the later overwrites. No lock. Flag if problematic. |           |

---

## 62. Subject Comments Editor — Bulk Finalise

| #    | What to Check         | Expected Result                                                                                                                                         | Pass/Fail |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 62.1 | "Finalise all" button | Visible to admin + teacher.                                                                                                                             |           |
| 62.2 | Click                 | `POST /v1/report-card-subject-comments/bulk-finalise` with `{ class_id, subject_id, academic_period_id }` -> 200 `{ count: n }`. Toast "Finalised {n}". |           |
| 62.3 | Empty rows blocked    | Rows with empty body are skipped.                                                                                                                       |           |
| 62.4 | Returns count         | Response `{ count: number }`. UI reflects.                                                                                                              |           |
| 62.5 | Idempotent            | Second run does not double-count.                                                                                                                       |           |
| 62.6 | Permission            | Requires `report_cards.comment`.                                                                                                                        |           |
| 62.7 | Authored-by filter    | Bulk-finalise only finalises rows authored by the caller? Or any? Document and verify.                                                                  |           |
| 62.8 | Audit log entry       | Each finalised row emits an audit log entry.                                                                                                            |           |

---

## 63. Subject Comments Editor — Unfinalise

| #    | What to Check             | Expected Result                                                                                                   | Pass/Fail |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 63.1 | Unfinalise single row     | `PATCH /v1/report-card-subject-comments/{id}/unfinalise` -> 200. Row re-editable.                                 |           |
| 63.2 | Admin can unfinalise any  | Even teacher-authored.                                                                                            |           |
| 63.3 | Window closed restriction | If window closed, unfinalise may be blocked. Verify vs overall comments. Flag inconsistency in Section 80.        |           |
| 63.4 | Bulk unfinalise           | If a bulk endpoint exists, verify. If not implemented, flag.                                                      |           |
| 63.5 | Unfinalise by non-author  | Admin unfinalising a teacher's finalised comment succeeds. Teacher unfinalising another teacher's comment -> 403. |           |

---

## 64. Approval Configs — List + Create + Edit + Delete

| #     | What to Check        | Expected Result                                                                                                                                                  | Pass/Fail |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 64.1  | List configs         | `GET /v1/report-cards/approval-configs` -> 200 `{ data: [...] }`.                                                                                                |           |
| 64.2  | Create config        | `POST /v1/report-cards/approval-configs` with `{ name, role_keys: ['school_principal'], min_approvals: 1, scope: {...} }` -> 201. Record `{APPROVAL_CONFIG_ID}`. |           |
| 64.3  | Get by id            | `GET /v1/report-cards/approval-configs/{APPROVAL_CONFIG_ID}` -> 200.                                                                                             |           |
| 64.4  | Update               | `PATCH /v1/report-cards/approval-configs/{APPROVAL_CONFIG_ID}` with `{ min_approvals: 2 }` -> 200.                                                               |           |
| 64.5  | Delete               | `DELETE /v1/report-cards/approval-configs/{APPROVAL_CONFIG_ID}` -> 204.                                                                                          |           |
| 64.6  | Duplicate name       | Creating a second config with same name -> 409 `{ code: 'APPROVAL_CONFIG_DUPLICATE' }`.                                                                          |           |
| 64.7  | Teacher read         | Teacher w/o `gradebook.view` -> 403.                                                                                                                             |           |
| 64.8  | Teacher write        | Teacher w/o `gradebook.manage` -> 403.                                                                                                                           |           |
| 64.9  | Invalid role_keys    | Empty `role_keys` array or unknown role -> 400 Zod.                                                                                                              |           |
| 64.10 | min_approvals bounds | `min_approvals < 1` -> 400.                                                                                                                                      |           |

---

## 65. Submit for Approval -> Approve / Reject / Bulk-Approve

| #     | What to Check                | Expected Result                                                                                                                        | Pass/Fail |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 65.1  | Submit for approval          | `POST /v1/report-cards/{id}/submit-approval` -> 200. Report card `approval_status='pending'`.                                          |           |
| 65.2  | Pending list for approver    | `GET /v1/report-cards/approvals/pending?role_key=school_principal&page=1&pageSize=20` -> 200.                                          |           |
| 65.3  | Approve                      | `POST /v1/report-cards/approvals/{approvalId}/approve` -> 200. Status -> `approved`.                                                   |           |
| 65.4  | Reject                       | `POST /v1/report-cards/approvals/{approvalId}/reject` with `{ reason: '...' }` -> 200. Status -> `rejected`.                           |           |
| 65.5  | Missing reason on reject     | -> 400 Zod validation.                                                                                                                 |           |
| 65.6  | Bulk approve                 | `POST /v1/report-cards/approvals/bulk-approve` with `{ approval_ids: [id1, id2, id3] }` -> 200 `{ approved: n, failed: m }`.           |           |
| 65.7  | Approver w/o permission      | Call from user without `report_cards.approve` -> 403.                                                                                  |           |
| 65.8  | Already approved             | -> 409 `{ code: 'APPROVAL_NOT_PENDING' }`.                                                                                             |           |
| 65.9  | Submit unpublished card      | Submitting a draft for approval: verify whether allowed. If blocked -> 409 `{ code: 'REPORT_NOT_SUBMITTABLE' }`.                       |           |
| 65.10 | Reject with very long reason | Reason > 500 chars -> 400 (schema max length).                                                                                         |           |
| 65.11 | Approve list pagination      | `?page=2&pageSize=20` returns the next slice with meta.                                                                                |           |
| 65.12 | Multi-config flow            | With two approval configs (different roles), a card may require parallel approvals (principal + vp). Submitting advances through both. |           |
| 65.13 | Concurrent approve           | Two approvers clicking simultaneously: only first succeeds, second -> 409.                                                             |           |

---

## 66. Custom Field Definitions — CRUD + Per-Report Values

| #     | What to Check                        | Expected Result                                                                                                   | Pass/Fail                        |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- | -------------------------------------------------------- | --- |
| 66.1  | List defs                            | `GET /v1/report-cards/custom-fields` -> 200 `{ data: [...] }`.                                                    |                                  |
| 66.2  | Create def                           | `POST /v1/report-cards/custom-fields` with `{ key, label, type: 'text'                                            | 'number'                         | 'boolean' | 'date', is_required }`-> 201. Record`{CUSTOM_FIELD_ID}`. |     |
| 66.3  | Update def                           | `PATCH /v1/report-cards/custom-fields/{CUSTOM_FIELD_ID}` with `{ label: 'Updated' }` -> 200.                      |                                  |
| 66.4  | Delete def                           | `DELETE /v1/report-cards/custom-fields/{CUSTOM_FIELD_ID}` -> 204.                                                 |                                  |
| 66.5  | Duplicate key                        | Re-creating with same `key` -> 409 `{ code: 'CUSTOM_FIELD_DUPLICATE' }`.                                          |                                  |
| 66.6  | Save per-report values               | `PUT /v1/report-cards/{id}/custom-field-values` with `{ values: [{field_id, value}] }` -> 200.                    |                                  |
| 66.7  | Get per-report values                | `GET /v1/report-cards/{id}/custom-field-values` -> 200 `{ data: [{field_id, value, ...}] }`.                      |                                  |
| 66.8  | Required value missing               | -> 400 `{ code: 'CUSTOM_FIELD_REQUIRED' }`.                                                                       |                                  |
| 66.9  | Permission                           | Write requires `gradebook.manage`, read `gradebook.view`.                                                         |                                  |
| 66.10 | Type coercion                        | Saving a `number` field with a string value -> 400 type error.                                                    |                                  |
| 66.11 | Date field                           | Date type values require ISO `YYYY-MM-DD`.                                                                        |                                  |
| 66.12 | Boolean field                        | Type `boolean` accepts `true                                                                                      | false`; strings "true" rejected. |           |
| 66.13 | Reorder fields                       | `display_order` field on CRUD allows reordering. Drag-and-drop UI updates order.                                  |                                  |
| 66.14 | Delete def with existing values      | Deleting a def cascades to values (or blocks). Verify and document.                                               |                                  |
| 66.15 | Required toggled to true on existing | Making an optional field required retroactively does NOT invalidate existing cards but new saves must include it. |                                  |
| 66.16 | Help text                            | Field defs may include help text that renders as a tooltip in the report card editor.                             |                                  |

---

## 67. Grade Threshold Configs — CRUD

| #     | What to Check             | Expected Result                                                                                                                     | Pass/Fail |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 67.1  | List                      | `GET /v1/report-cards/grade-thresholds` -> 200.                                                                                     |           |
| 67.2  | Create                    | `POST /v1/report-cards/grade-thresholds` with `{ name, thresholds: [{grade, min, max}] }` -> 201.                                   |           |
| 67.3  | Overlapping ranges        | Overlapping min/max -> 400 `{ code: 'GRADE_THRESHOLD_OVERLAP' }`.                                                                   |           |
| 67.4  | Gapped ranges             | Gaps (e.g., 70–80 and 90–100 with 80–90 missing) -> 400 `{ code: 'GRADE_THRESHOLD_GAP' }` (if enforced).                            |           |
| 67.5  | Update                    | `PATCH /v1/report-cards/grade-thresholds/{id}` -> 200.                                                                              |           |
| 67.6  | Delete                    | `DELETE /v1/report-cards/grade-thresholds/{id}` -> 204.                                                                             |           |
| 67.7  | Permission                | `gradebook.manage` write / `gradebook.view` read.                                                                                   |           |
| 67.8  | Grade mapping used by PDF | Published report card PDFs use the matching threshold's grade letter for each score. Flag if still using a legacy hard-coded scale. |           |
| 67.9  | Multiple configs active   | If multiple threshold configs exist, one is flagged `is_default=true`.                                                              |           |
| 67.10 | Set default               | Admin can toggle which config is default. Previous default auto-unflags.                                                            |           |
| 67.11 | Apply to all report cards | Running "Recompute all" re-applies the threshold mapping to every published card. Admin-only.                                       |           |
| 67.12 | Import/export CSV         | (If supported) admin can import thresholds from CSV.                                                                                |           |

---

## 68. Acknowledgment Status Viewer

| #    | What to Check           | Expected Result                                                                                                                              | Pass/Fail |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 68.1 | Get ack status          | `GET /v1/report-cards/{id}/acknowledgment-status` -> 200 `{ acknowledged: bool, acknowledged_by: [...], acknowledged_at: iso, ip_address }`. |           |
| 68.2 | Parent acknowledges     | `POST /v1/report-cards/{id}/acknowledge` with `{ parent_id }` from parent context -> 200. Status flips.                                      |           |
| 68.3 | Duplicate ack           | Second ack by same parent -> 409 `{ code: 'ALREADY_ACKNOWLEDGED' }`.                                                                         |           |
| 68.4 | IP recorded             | Server records `req.headers['x-forwarded-for']` or socket IP.                                                                                |           |
| 68.5 | Admin view              | Read-only view of the ack records.                                                                                                           |           |
| 68.6 | Unpublished report card | Ack on unpublished -> 409 `{ code: 'REPORT_NOT_PUBLISHED' }`.                                                                                |           |
| 68.7 | Unknown parent id       | `parent_id` not related to the student -> 403 `{ code: 'PARENT_NOT_LINKED' }`.                                                               |           |
| 68.8 | Ack-required setting    | If `require_parent_acknowledgment=true` in tenant settings, unpaid acknowledgment shows a banner on the parent view.                         |           |
| 68.9 | Resend email            | Admin can trigger a resend of the ack email.                                                                                                 |           |

---

## 69. Verification Token + Public `/verify/:token` Viewer

| #     | What to Check                      | Expected Result                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 69.1  | Generate token                     | `POST /v1/report-cards/{id}/verification-token` -> 201 `{ data: { token, expires_at, public_url } }`. Record `{VERIFY_TOKEN}`.       |           |
| 69.2  | Token properties                   | Token >= 32 chars random. Generating twice for same id returns a new token OR reuses an existing unexpired one (document behaviour). |           |
| 69.3  | Public viewer                      | `GET /v1/verify/{VERIFY_TOKEN}` with NO auth header -> 200 `{ data: { report_card: {...}, student: {...}, tenant: {...} } }`.        |           |
| 69.4  | Expired token                      | `expires_at < now` -> 410 `{ code: 'TOKEN_EXPIRED' }`.                                                                               |           |
| 69.5  | Invalid token                      | Junk token -> 404 `{ code: 'TOKEN_NOT_FOUND' }`.                                                                                     |           |
| 69.6  | No tenant bleed                    | Payload exposes only non-sensitive fields (name, period, grades, school). No email/phone/SSN.                                        |           |
| 69.7  | Permission to generate             | Requires `gradebook.manage`. Teacher -> 403.                                                                                         |           |
| 69.8  | Public controller has no AuthGuard | Confirm `ReportCardVerificationController` decorator stack has no `@UseGuards(AuthGuard)`.                                           |           |
| 69.9  | QR code embedding                  | Published PDF includes a QR code encoding `public_url`. Scan the QR on the PDF and confirm it resolves.                              |           |
| 69.10 | Token format                       | Token appears URL-safe (base64url). No `+/=` chars that require encoding.                                                            |           |
| 69.11 | public_url stable                  | Same token always resolves to the same public URL; not re-signed per request.                                                        |           |
| 69.12 | Rate limiting on verify            | 50 hits on `/v1/verify/{token}` in 10s: service either allows all or rate-limits at 429.                                             |           |
| 69.13 | Regeneration                       | Generating a new token via `POST .../verification-token` invalidates the previous one? Or coexists? Verify and document.             |           |

---

## 70. Batch PDF Endpoint + Bulk Operations

| #     | What to Check              | Expected Result                                                                                                                                                                    | Pass/Fail |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 70.1  | Enqueue batch PDF          | `POST /v1/report-cards/batch-pdf` with `{ class_id, academic_period_id, template_id? }` -> 202 `{ message: 'Batch PDF generation queued', status: 'queued' }`.                     |           |
| 70.2  | BullMQ job payload         | Queue `gradebook` receives `gradebook:batch-pdf` with `{ tenant_id, class_id, academic_period_id, template_id, requested_by_user_id }`. Verify via worker logs or queue inspector. |           |
| 70.3  | Permission                 | Requires `report_cards.bulk_operations`. Teacher -> 403.                                                                                                                           |           |
| 70.4  | Bulk generate drafts       | `POST /v1/report-cards/bulk/generate` with `{ class_id, academic_period_id }` -> 201. Returns generation summary.                                                                  |           |
| 70.5  | Bulk publish               | `POST /v1/report-cards/bulk/publish` with `{ report_card_ids: [...] }` -> 200 `{ published: n }`.                                                                                  |           |
| 70.6  | Bulk deliver               | `POST /v1/report-cards/bulk/deliver` with `{ report_card_ids: [...] }` -> 200. Each card enters delivery pipeline.                                                                 |           |
| 70.7  | Bulk empty array           | `POST bulk/publish` with `{ report_card_ids: [] }` -> 400 Zod.                                                                                                                     |           |
| 70.8  | RLS isolation              | Cross-tenant ids silently skip (zero match) and response reports accurate count.                                                                                                   |           |
| 70.9  | BullMQ job has `tenant_id` | Without `tenant_id`, job is rejected at enqueue (TenantAwareJob invariant).                                                                                                        |           |
| 70.10 | Batch PDF delivery email   | After the worker finishes, `requested_by_user_id` receives a notification with the download link.                                                                                  |           |
| 70.11 | Batch PDF retries          | Worker retries failed batch 3x with backoff before dead-letter.                                                                                                                    |           |

---

## 71. Transcript Download (per-student GPA transcript)

| #     | What to Check                   | Expected Result                                                                                 | Pass/Fail |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 71.1  | Admin request                   | `GET /v1/report-cards/students/{STUDENT_1_ID}/transcript` -> 200 with `application/pdf` stream. |           |
| 71.2  | Permission                      | Requires `transcripts.generate`. Teacher w/o permission -> 403.                                 |           |
| 71.3  | Content                         | Transcript aggregates every published report card across periods, computes GPA, styled PDF.     |           |
| 71.4  | Unknown student                 | Bogus UUID -> 404 `{ code: 'STUDENT_NOT_FOUND' }`.                                              |           |
| 71.5  | Student with no published cards | -> 409 `{ code: 'NO_PUBLISHED_CARDS' }` OR empty transcript (verify expected behaviour).        |           |
| 71.6  | Cross-tenant                    | Student id belonging to another tenant -> 404.                                                  |           |
| 71.7  | Filename                        | `Content-Disposition` filename includes student name + "transcript" + date.                     |           |
| 71.8  | Branding                        | Transcript PDF uses tenant branding from `loadBranding`.                                        |           |
| 71.9  | GPA formula                     | Transcript GPA uses the tenant's active grade threshold config. Flag if hard-coded.             |           |
| 71.10 | Year-by-year breakdown          | Transcript groups report cards by academic year with subtotals.                                 |           |

---

## 72. Revise Published Report Card

| #     | What to Check                | Expected Result                                                                                                                   | Pass/Fail |
| ----- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 72.1  | Revise a published card      | `POST /v1/report-cards/{id}/revise` -> 201 `{ data: { id: {NEW_DRAFT_ID}, revision_of_report_card_id: {id}, status: 'draft' } }`. |           |
| 72.2  | Original flips to superseded | `GET /v1/report-cards/{id}` now shows `status='superseded'`.                                                                      |           |
| 72.3  | Revision chain traversal     | `GET /v1/report-cards?include_revisions=true&student_id=...` lists original + new draft.                                          |           |
| 72.4  | Only published revisable     | Revising a draft -> 409 `{ code: 'REPORT_NOT_PUBLISHED' }`.                                                                       |           |
| 72.5  | Permission                   | Requires `gradebook.manage`.                                                                                                      |           |
| 72.6  | Audit trail                  | Audit entry for the revision event.                                                                                               |           |
| 72.7  | Publishing the revision      | Publishing the new draft -> 200; replaces original in active views.                                                               |           |
| 72.8  | Grade re-snapshot            | New draft re-runs grade snapshot computation (fresh data, not copy of old snapshot).                                              |           |
| 72.9  | Revision tracks parent       | `revision_of_report_card_id` points back to the original; not a chain of chains (always points to root). Verify.                  |           |
| 72.10 | Delete a revision            | Deleting the revision does NOT restore the original from `superseded` (verify: may stay superseded until manual fix).             |           |

---

## 73. Retired Redirect Stubs

| #    | What to Check                | Expected Result                                                                                                   | Pass/Fail |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 73.1 | `/en/report-cards/approvals` | `<RetiredApprovalsRedirect>` mounts; `router.replace('/en/report-cards/requests')`. URL flips quickly.            |           |
| 73.2 | `/en/report-cards/bulk`      | `<RetiredBulkRedirect>` mounts; `router.replace('/en/report-cards')`. URL flips.                                  |           |
| 73.3 | No 404 flash                 | Neither stub renders the "Failed to load the matrix" fallback from the `[classId]` dynamic segment.               |           |
| 73.4 | No API calls from stubs      | Both stubs render `null` — no component-level fetches.                                                            |           |
| 73.5 | Deep link survival           | Bookmarking `/en/report-cards/approvals` + opening in a new tab still redirects correctly without bypassing auth. |           |
| 73.6 | Locale preservation          | Hitting `/ar/report-cards/approvals` replaces to `/ar/report-cards/requests`. Locale preserved.                   |           |
| 73.7 | No server-side redirect      | Both stubs redirect client-side. Server still serves the route 200 with empty body.                               |           |

---

## 74. Role Gates & Permission Denials

| #     | What to Check                              | Expected Result                                                                                                                             | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- | --- |
| 74.1  | `school_owner` bypass                      | Every endpoint in Section 79 returns 200/201 for Yusuf. `PermissionGuard` short-circuits via `isOwner()`.                                   |           |
| 74.2  | Parent on `/en/report-cards`               | Sign in as parent. Dashboard redirects or renders parent-specific variant. No admin tiles.                                                  |           |
| 74.3  | Parent -> Generate                         | `POST /v1/report-cards/generation-runs` -> 403 `{ code: 'PERMISSION_DENIED', message: 'Missing permission: report_cards.manage' }`.         |           |
| 74.4  | Teacher -> Settings                        | Toast + redirect (Section 14.6).                                                                                                            |           |
| 74.5  | Teacher -> Generation wizard               | Toast + redirect (Section 22.3).                                                                                                            |           |
| 74.6  | Teacher -> Bundle PDF                      | `GET /v1/report-cards/library/bundle-pdf?...` -> 403.                                                                                       |           |
| 74.7  | Teacher -> Bulk operations                 | `bulk/generate                                                                                                                              | publish   | deliver` -> 403. |     |
| 74.8  | Teacher -> Approvals                       | Approve/reject/bulk-approve -> 403.                                                                                                         |           |
| 74.9  | Teacher -> Delete report card              | `DELETE /v1/report-cards/{id}` -> 403.                                                                                                      |           |
| 74.10 | Teacher -> Comments for non-homeroom class | Upsert -> 403 `{ code: 'NOT_HOMEROOM_TEACHER' }`.                                                                                           |           |
| 74.11 | Unauthenticated request                    | Any `/v1/report-cards/*` without bearer -> 401.                                                                                             |           |
| 74.12 | Expired JWT                                | -> 401 `{ code: 'TOKEN_EXPIRED' }`.                                                                                                         |           |
| 74.13 | Teacher -> generation-runs list            | `GET /v1/report-cards/generation-runs` -> 403 (missing `report_cards.manage`).                                                              |           |
| 74.14 | Teacher -> transcripts                     | `GET /v1/report-cards/students/{id}/transcript` -> 403 (missing `transcripts.generate`).                                                    |           |
| 74.15 | Teacher -> verification token generate     | `POST /v1/report-cards/{id}/verification-token` -> 403.                                                                                     |           |
| 74.16 | Teacher -> custom-fields write             | `POST /v1/report-cards/custom-fields` -> 403.                                                                                               |           |
| 74.17 | Teacher -> approval configs                | `POST /v1/report-cards/approval-configs` -> 403 (missing `gradebook.manage`).                                                               |           |
| 74.18 | Teacher -> comment window open/close       | `POST/PATCH /v1/report-comment-windows/...` -> 403.                                                                                         |           |
| 74.19 | Principal vs Owner delta                   | `school_principal` holds `gradebook.publish_report_cards` but NOT necessarily `report_cards.approve` — verify matrix matches the role seed. |           |
| 74.20 | Viewer without any role                    | User with only `parent` membership fetching `/v1/report-cards/library` -> 403 `{ code: 'PERMISSION_DENIED' }`.                              |           |
| 74.21 | Anonymous verify succeeds                  | `/v1/verify/{token}` without auth header returns 200 (public route).                                                                        |           |
| 74.22 | 200 instead of 403                         | No endpoint must return 200 for a user missing the required permission. Spot-check one from each controller.                                |           |
| 74.23 | Permission cache invalidation              | After an admin revokes `report_cards.manage` from a user, the next request from that user returns 403 within 60s.                           |           |
| 74.24 | Role change requires re-login?             | If role is changed mid-session, verify whether existing token remains valid until expiry or is revoked. Document.                           |           |
| 74.25 | OWNER bypass tested on `/verify/:token`    | Owner auth does NOT interfere with the public route (it still accepts anonymous).                                                           |           |
| 74.26 | `/v1/verify/:token` from authed user       | Authenticated user hitting the verify route still gets 200 (auth is irrelevant to this route).                                              |           |

---

## 75. RLS / Tenant Isolation Smoke

| #     | What to Check                | Expected Result                                                                                                                     | Pass/Fail |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 75.1  | Create a report card as NHQS | Post-Section 29 record `{GENERATED_RC_ID}` (any student card in `{GENERATED_RUN_ID}`).                                              |           |
| 75.2  | Fetch from second tenant     | Switch to Iqra Academy login (if seeded). `GET /v1/report-cards/{GENERATED_RC_ID}` -> 404 (NOT 403, to prevent existence leak).     |           |
| 75.3  | List from second tenant      | `GET /v1/report-cards` returns Iqra's data only. `{GENERATED_RC_ID}` absent.                                                        |           |
| 75.4  | Bulk-delete cross-tenant     | `POST /v1/report-cards/bulk-delete` with `{ report_card_ids: [{GENERATED_RC_ID}] }` from Iqra -> 200 `count=0`. NHQS row unchanged. |           |
| 75.5  | Library cross-tenant         | Iqra's `GET /v1/report-cards/library` never returns NHQS rows.                                                                      |           |
| 75.6  | Verify token cross-tenant    | Public endpoint returns ONLY the one card keyed to the token; no cross-tenant data leak.                                            |           |
| 75.7  | Generation-run isolation     | `GET /v1/report-cards/generation-runs/{GENERATED_RUN_ID}` from Iqra -> 404.                                                         |           |
| 75.8  | Teacher request isolation    | `GET /v1/report-card-teacher-requests/{id}` from Iqra for an NHQS request -> 404.                                                   |           |
| 75.9  | Tenant settings isolation    | `GET /v1/report-card-tenant-settings` from Iqra returns Iqra's settings; NHQS values never appear.                                  |           |
| 75.10 | Raw SQL isolation            | Spot-check server logs: every query carries `SET LOCAL app.current_tenant_id`. No raw `$executeRawUnsafe` calls.                    |           |
| 75.11 | Worker job tenant            | Worker processing `gradebook:batch-pdf` sets RLS via `TenantAwareJob` before any DB call.                                           |           |
| 75.12 | Analytics cross-tenant       | `GET /v1/report-cards/analytics/dashboard` from Iqra never returns NHQS aggregates.                                                 |           |
| 75.13 | RLS on overall comments      | Iqra's `GET /v1/report-card-overall-comments` returns only Iqra's rows.                                                             |           |
| 75.14 | RLS on subject comments      | Iqra's `GET /v1/report-card-subject-comments` returns only Iqra's rows.                                                             |           |
| 75.15 | RLS on comment windows       | Iqra's `GET /v1/report-comment-windows` returns only Iqra's windows.                                                                |           |
| 75.16 | RLS on templates             | `GET /v1/report-cards/templates` from Iqra returns Iqra's templates + the platform-shared catalogue.                                |           |
| 75.17 | RLS on approvals             | `GET /v1/report-cards/approvals/pending` from Iqra returns only Iqra's pending approvals.                                           |           |
| 75.18 | RLS on acknowledgments       | `GET /v1/report-cards/{id}/acknowledgment-status` for NHQS id from Iqra -> 404.                                                     |           |

---

## 76. Arabic / RTL Walkthrough

| #     | What to Check              | Expected Result                                                                                                                  | Pass/Fail |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 76.1  | Switch locale              | Navigate to `/ar/report-cards`. `<html lang="ar" dir="rtl">`.                                                                    |           |
| 76.2  | Dashboard heading          | `reportCards.title` resolves to Arabic. No English leakage.                                                                      |           |
| 76.3  | Period selector            | Options render in AR where translated. Dates Gregorian, numerals Latin 0–9.                                                      |           |
| 76.4  | Quick-action tiles         | All four tile titles + descriptions in Arabic.                                                                                   |           |
| 76.5  | Classes grid RTL alignment | Card text `text-start` (right-aligned in RTL). Layout mirrors correctly.                                                         |           |
| 76.6  | Class matrix RTL           | Subjects flow right-to-left. Sticky student column is on the right (`sticky start-0`).                                           |           |
| 76.7  | Grade cells stay LTR       | Cells have `dir="ltr"` so numerals read correctly.                                                                               |           |
| 76.8  | Wizard steps in AR         | Step titles + descriptions translated. No hardcoded English.                                                                     |           |
| 76.9  | Settings page in AR        | All section headers + hints translated.                                                                                          |           |
| 76.10 | Library actions in AR      | Publish/Unpublish/Delete labels translated. Icons unchanged.                                                                     |           |
| 76.11 | Analytics in AR            | X-axis class names render in Arabic where applicable. Legend translated.                                                         |           |
| 76.12 | Teacher requests in AR     | Tab labels, column headers, status labels all translated.                                                                        |           |
| 76.13 | Comments editor in AR      | Textareas accept Arabic input. Use `dir="auto"` for mixed content blocks.                                                        |           |
| 76.14 | Toasts in AR               | Success/failure toasts in Arabic.                                                                                                |           |
| 76.15 | Translation debt           | Any untranslated string (raw English in AR locale) flagged in Section 80 as translation-debt with row number.                    |           |
| 76.16 | Arabic search in filters   | If any search input exists, accepts Arabic queries and filters correctly.                                                        |           |
| 76.17 | Confirm dialog in AR       | All `ConfirmDialog` usages show Arabic titles, descriptions, and button labels.                                                  |           |
| 76.18 | Window banner date format  | Gregorian calendar, Latin numerals, formatted via `Intl.DateTimeFormat('ar', { calendar: 'gregory', numberingSystem: 'latn' })`. |           |
| 76.19 | Morph bar in RTL           | Hub logos and hamburger position mirror correctly.                                                                               |           |
| 76.20 | Select dropdown arrow      | Dropdown arrow appears on the correct side in RTL.                                                                               |           |
| 76.21 | Chart RTL                  | X-axis labels render RTL where applicable; bar order mirrors.                                                                    |           |
| 76.22 | Radio card icons           | Icons in radio cards use logical margins (`me-`/`ms-`).                                                                          |           |
| 76.23 | Wizard Next/Back arrows    | ArrowLeft/ArrowRight visual direction mirrors in RTL (start/end).                                                                |           |

---

## 77. Mobile Responsiveness (375px — iPhone SE)

| #     | What to Check                       | Expected Result                                                                                                  | Pass/Fail |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 77.1  | Resize devtools to 375×667          | Layout re-flows to mobile. No horizontal scrollbar at document level.                                            |           |
| 77.2  | Morph bar on mobile                 | Compact top row + hamburger trigger. Tapping opens a hub nav overlay.                                            |           |
| 77.3  | Sub-strip horizontal scroll         | Learning -> Assessment -> Report Cards sub-strip scrolls horizontally.                                           |           |
| 77.4  | Dashboard tiles stack               | `grid-cols-1`. Each tile tappable at 44x44.                                                                      |           |
| 77.5  | Classes grid stacks                 | `grid-cols-1`. No overflow.                                                                                      |           |
| 77.6  | Class matrix scrolls                | Sticky student column remains visible while horizontally scrolling.                                              |           |
| 77.7  | Settings form                       | Inputs + switches stack vertically. No fixed widths. `text-base` on inputs (no iOS zoom).                        |           |
| 77.8  | Signature upload                    | Fits 375px. Error toast fits viewport.                                                                           |           |
| 77.9  | Wizard steps                        | Indicator scrolls horizontally. Content readable without zoom. Next/Back stack at `sm:` breakpoint.              |           |
| 77.10 | Library view toggles                | Tabs scroll horizontally if > 4.                                                                                 |           |
| 77.11 | Library rows                        | Row-level actions collapse to kebab menu (three-dot) on mobile.                                                  |           |
| 77.12 | Modals                              | Open Window, Extend, Reject, Confirm — all fit 375px width, content scrollable if overflow. Close buttons 44x44. |           |
| 77.13 | Comments editor                     | Textarea full width. Finalise switch reachable. AI draft button not clipped.                                     |           |
| 77.14 | Analytics chart                     | `<ResponsiveContainer>` sizes chart to viewport.                                                                 |           |
| 77.15 | PDF preview                         | Opening an individual PDF opens native mobile PDF viewer.                                                        |           |
| 77.16 | Hamburger overlay                   | Hub nav overlay dismisses on backdrop tap and does not trap focus permanently.                                   |           |
| 77.17 | Teacher requests table              | Table wraps in `overflow-x-auto`. Horizontal scroll with sticky first column.                                    |           |
| 77.18 | Min-touch targets everywhere        | Every button/link in the module is >= 44x44px on mobile. Check: buttons have `min-h-11` class.                   |           |
| 77.19 | Landscape orientation               | Rotating the phone to landscape (667×375) re-flows correctly; no overflow.                                       |           |
| 77.20 | Pinch zoom disabled where necessary | Input fields use `text-base` (16px) to prevent iOS Safari auto-zoom on focus.                                    |           |
| 77.21 | Home-screen icon (PWA)              | If the app has a PWA manifest, adding to home screen uses the correct icon + theme colour.                       |           |
| 77.22 | Safe-area insets                    | On devices with notches (iPhone X+), content respects `env(safe-area-inset-bottom)` where relevant.              |           |
| 77.23 | Soft keyboard overlap               | When the soft keyboard is open, autosave indicator and save button remain visible.                               |           |

---

## 78. Console & Network Health

| #     | What to Check                  | Expected Result                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 78.1  | No console errors on dashboard | Zero red errors during Section 4–9 walk.                                                                                                                                 |           |
| 78.2  | No console errors on library   | Zero errors during Section 33–41.                                                                                                                                        |           |
| 78.3  | No 4xx/5xx on golden path      | Network tab shows no unexpected 4xx/5xx during end-to-end generate -> publish -> library flow (expected 403/409 during permission tests are fine in their own sections). |           |
| 78.4  | No retry storms                | Failing endpoint does not retry in a tight loop. Backoff or manual retry only.                                                                                           |           |
| 78.5  | Polling stops on tab hidden    | Page Visibility API: polling SHOULD pause when hidden (flag if it doesn't).                                                                                              |           |
| 78.6  | Request IDs propagate          | Each response includes `x-request-id`. Client logs it on error.                                                                                                          |           |
| 78.7  | Bundle size                    | Dashboard initial JS payload < 500KB gzip. Flag regressions.                                                                                                             |           |
| 78.8  | Source maps                    | Sources panel shows `.tsx` files in production build with sourcemaps.                                                                                                    |           |
| 78.9  | React warnings                 | No "setState after unmount" / "key prop missing" / "hydration mismatch" warnings.                                                                                        |           |
| 78.10 | Memory profile                 | Leaving dashboard open for 15 min with polling does not grow the heap monotonically.                                                                                     |           |
| 78.11 | CSP violations                 | Browser Console shows no `Refused to apply inline style because it violates CSP` warnings.                                                                               |           |
| 78.12 | 3rd-party cookies              | No cross-site cookies set by the app; only first-party session cookie.                                                                                                   |           |
| 78.13 | Referrer policy                | Outgoing requests use `strict-origin-when-cross-origin` or similar.                                                                                                      |           |
| 78.14 | Accessibility tree             | Run axe DevTools on each page: no serious/critical violations.                                                                                                           |           |
| 78.15 | Keyboard-only navigation       | Full walk through the module using only keyboard; every interactive element reachable.                                                                                   |           |
| 78.16 | Screen reader walkthrough      | Use VoiceOver/NVDA to navigate the dashboard; all major regions have landmarks (`<main>`, `<section>` with `aria-label`).                                                |           |
| 78.17 | Colour contrast                | AA contrast ratio for text vs background across all main surfaces. Check with devtools a11y panel.                                                                       |           |
| 78.18 | Focus outline visibility       | Default browser focus outline replaced with `focus-visible:ring-2` — visible on all interactive elements.                                                                |           |

---

## 79. Backend Endpoint Map

All routes are `/v1/*` behind `AuthGuard + PermissionGuard` unless noted. Body/query shapes are defined in `@school/shared` Zod schemas. This table is the ground truth — cross-check every row above by the `(method, path)` pair.

### 79.1 Core report-cards controller (`ReportCardsController`)

| Method | Path                                       | Permission                       | Body / Query                                                                     | Success                                             | Notes                                                  |
| ------ | ------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| POST   | `/v1/report-cards/generate`                | `gradebook.manage`               | `{ student_ids[], academic_period_id }`                                          | 201                                                 | Legacy one-shot generate (used by older callers)       |
| GET    | `/v1/report-cards`                         | `gradebook.view`                 | `?page, pageSize, academic_period_id?, status?, student_id?, include_revisions?` | 200 `{ data, meta }`                                | Teachers scoped to their classes; admins unscoped      |
| POST   | `/v1/report-cards/generation-runs/dry-run` | `report_cards.manage`            | `dryRunGenerationCommentGateSchema`                                              | 200 `{ would_block, blocked_student_ids, reasons }` | Step-5 gate check                                      |
| POST   | `/v1/report-cards/generation-runs`         | `report_cards.manage`            | `startGenerationRunSchema`                                                       | 201 `{ batch_job_id }`                              | Enqueues BullMQ job                                    |
| GET    | `/v1/report-cards/generation-runs`         | `report_cards.manage`            | `listGenerationRunsQuerySchema`                                                  | 200 `{ data, meta }`                                | Dashboard polls every 5s                               |
| GET    | `/v1/report-cards/generation-runs/:id`     | `report_cards.manage`            | —                                                                                | 200                                                 | Wizard polls every 3s                                  |
| GET    | `/v1/report-cards/library`                 | `report_cards.view`              | `listReportCardLibraryQuerySchema`                                               | 200                                                 | Admin unscoped; teacher scoped                         |
| GET    | `/v1/report-cards/library/grouped`         | `report_cards.view`              | —                                                                                | 200 `{ data: GroupedRunNode[] }`                    | Default library view source                            |
| GET    | `/v1/report-cards/library/bundle-pdf`      | `report_cards.manage`            | `reportCardBundlePdfQuerySchema`                                                 | 200 stream                                          | `application/pdf` or `application/zip` by `merge_mode` |
| GET    | `/v1/report-cards/classes/:classId/matrix` | `report_cards.view`              | `classMatrixQuerySchema`                                                         | 200 `ClassMatrixResponse`                           | Asserts class read scope                               |
| GET    | `/v1/report-cards/:id`                     | `gradebook.view`                 | —                                                                                | 200                                                 |                                                        |
| PATCH  | `/v1/report-cards/:id`                     | `gradebook.manage`               | `updateReportCardSchema`                                                         | 200                                                 |                                                        |
| POST   | `/v1/report-cards/:id/publish`             | `gradebook.publish_report_cards` | —                                                                                | 200                                                 |                                                        |
| POST   | `/v1/report-cards/:id/revise`              | `gradebook.manage`               | —                                                                                | 201                                                 | Creates draft revision; marks original superseded      |
| POST   | `/v1/report-cards/bulk-delete`             | `report_cards.manage`            | `bulkDeleteReportCardsSchema`                                                    | 200 `{ data: { count, deleted_ids } }`              |                                                        |
| DELETE | `/v1/report-cards/:id`                     | `report_cards.manage`            | —                                                                                | 200                                                 |                                                        |
| GET    | `/v1/report-cards/:id/pdf`                 | `gradebook.view`                 | —                                                                                | 200 `application/pdf`                               | Inline disposition                                     |

### 79.2 Enhanced controller (`ReportCardsEnhancedController`)

| Method | Path                                              | Permission                       | Notes                                   |
| ------ | ------------------------------------------------- | -------------------------------- | --------------------------------------- |
| POST   | `/v1/report-cards/templates`                      | `report_cards.manage_templates`  | 201                                     |
| GET    | `/v1/report-cards/templates`                      | `gradebook.view`                 | paginated                               |
| GET    | `/v1/report-cards/templates/content-scopes`       | `report_cards.view`              | 200 `{ data: ContentScopeSummary[] }`   |
| GET    | `/v1/report-cards/templates/:id`                  | `gradebook.view`                 |                                         |
| PATCH  | `/v1/report-cards/templates/:id`                  | `report_cards.manage_templates`  |                                         |
| DELETE | `/v1/report-cards/templates/:id`                  | `report_cards.manage_templates`  | 204                                     |
| POST   | `/v1/report-cards/templates/convert-from-image`   | `report_cards.manage_templates`  | Raw binary body; 201                    |
| POST   | `/v1/report-cards/approval-configs`               | `gradebook.manage`               | 201                                     |
| GET    | `/v1/report-cards/approval-configs`               | `gradebook.view`                 |                                         |
| GET    | `/v1/report-cards/approval-configs/:id`           | `gradebook.view`                 |                                         |
| PATCH  | `/v1/report-cards/approval-configs/:id`           | `gradebook.manage`               |                                         |
| DELETE | `/v1/report-cards/approval-configs/:id`           | `gradebook.manage`               | 204                                     |
| POST   | `/v1/report-cards/:id/submit-approval`            | `gradebook.manage`               |                                         |
| POST   | `/v1/report-cards/approvals/:id/approve`          | `report_cards.approve`           |                                         |
| POST   | `/v1/report-cards/approvals/:id/reject`           | `report_cards.approve`           | `{ reason }`                            |
| GET    | `/v1/report-cards/approvals/pending`              | `report_cards.approve`           | `?role_key?, page, pageSize`            |
| POST   | `/v1/report-cards/approvals/bulk-approve`         | `report_cards.approve`           | `{ approval_ids[] }`                    |
| POST   | `/v1/report-cards/:id/deliver`                    | `gradebook.publish_report_cards` |                                         |
| GET    | `/v1/report-cards/:id/delivery-status`            | `gradebook.view`                 |                                         |
| POST   | `/v1/report-cards/custom-fields`                  | `gradebook.manage`               | 201                                     |
| GET    | `/v1/report-cards/custom-fields`                  | `gradebook.view`                 |                                         |
| GET    | `/v1/report-cards/custom-fields/:id`              | `gradebook.view`                 |                                         |
| PATCH  | `/v1/report-cards/custom-fields/:id`              | `gradebook.manage`               |                                         |
| DELETE | `/v1/report-cards/custom-fields/:id`              | `gradebook.manage`               | 204                                     |
| PUT    | `/v1/report-cards/:id/custom-field-values`        | `gradebook.manage`               | `{ values[] }`                          |
| GET    | `/v1/report-cards/:id/custom-field-values`        | `gradebook.view`                 |                                         |
| POST   | `/v1/report-cards/grade-thresholds`               | `gradebook.manage`               | 201                                     |
| GET    | `/v1/report-cards/grade-thresholds`               | `gradebook.view`                 |                                         |
| GET    | `/v1/report-cards/grade-thresholds/:id`           | `gradebook.view`                 |                                         |
| PATCH  | `/v1/report-cards/grade-thresholds/:id`           | `gradebook.manage`               |                                         |
| DELETE | `/v1/report-cards/grade-thresholds/:id`           | `gradebook.manage`               | 204                                     |
| POST   | `/v1/report-cards/:id/acknowledge`                | `gradebook.view`                 | `{ parent_id }`                         |
| GET    | `/v1/report-cards/:id/acknowledgment-status`      | `gradebook.view`                 |                                         |
| GET    | `/v1/report-cards/analytics/dashboard`            | `gradebook.view_analytics`       | `?academic_period_id?`                  |
| GET    | `/v1/report-cards/analytics/class-comparison`     | `gradebook.view_analytics`       | `?academic_period_id?`                  |
| POST   | `/v1/report-cards/bulk/generate`                  | `report_cards.bulk_operations`   | 201 `{ class_id, academic_period_id }`  |
| POST   | `/v1/report-cards/bulk/publish`                   | `report_cards.bulk_operations`   | `{ report_card_ids[] }`                 |
| POST   | `/v1/report-cards/bulk/deliver`                   | `report_cards.bulk_operations`   | `{ report_card_ids[] }`                 |
| GET    | `/v1/report-cards/students/:studentId/transcript` | `transcripts.generate`           | 200 PDF stream                          |
| POST   | `/v1/report-cards/:id/verification-token`         | `gradebook.manage`               | 201 `{ token, public_url, expires_at }` |
| POST   | `/v1/report-cards/batch-pdf`                      | `report_cards.bulk_operations`   | 202 queued                              |
| GET    | `/v1/verify/:token`                               | **public (no auth)**             | Public verification viewer              |

### 79.3 Tenant settings controller (`ReportCardTenantSettingsController`)

| Method | Path                                                  | Permission            | Notes                                     |
| ------ | ----------------------------------------------------- | --------------------- | ----------------------------------------- |
| GET    | `/v1/report-card-tenant-settings`                     | `report_cards.view`   |                                           |
| PATCH  | `/v1/report-card-tenant-settings`                     | `report_cards.manage` | `updateReportCardTenantSettingsSchema`    |
| POST   | `/v1/report-card-tenant-settings/principal-signature` | `report_cards.manage` | multipart/form-data, PNG/JPEG/WEBP, <=2MB |
| DELETE | `/v1/report-card-tenant-settings/principal-signature` | `report_cards.manage` |                                           |

### 79.4 Overall comments controller

| Method | Path                                              | Permission             | Notes                                                 |
| ------ | ------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| GET    | `/v1/report-card-overall-comments`                | `report_cards.view`    | filters: class_id, period, student, author, finalised |
| GET    | `/v1/report-card-overall-comments/:id`            | `report_cards.view`    |                                                       |
| POST   | `/v1/report-card-overall-comments`                | `report_cards.comment` | upsert                                                |
| PATCH  | `/v1/report-card-overall-comments/:id/finalise`   | `report_cards.comment` |                                                       |
| PATCH  | `/v1/report-card-overall-comments/:id/unfinalise` | `report_cards.comment` |                                                       |

### 79.5 Subject comments controller

| Method | Path                                              | Permission             | Notes                                                              |
| ------ | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| GET    | `/v1/report-card-subject-comments`                | `report_cards.view`    | filters: class, subject, period, author, student, finalised        |
| GET    | `/v1/report-card-subject-comments/count`          | `report_cards.view`    | `?class_id&subject_id&academic_period_id`                          |
| GET    | `/v1/report-card-subject-comments/:id`            | `report_cards.view`    |                                                                    |
| POST   | `/v1/report-card-subject-comments`                | `report_cards.comment` | upsert                                                             |
| PATCH  | `/v1/report-card-subject-comments/:id/finalise`   | `report_cards.comment` |                                                                    |
| PATCH  | `/v1/report-card-subject-comments/:id/unfinalise` | `report_cards.comment` |                                                                    |
| POST   | `/v1/report-card-subject-comments/ai-draft`       | `report_cards.comment` | per-row AI draft                                                   |
| POST   | `/v1/report-card-subject-comments/bulk-finalise`  | `report_cards.comment` | `{ class_id, subject_id, academic_period_id }` returns `{ count }` |

### 79.6 Teacher requests controller

| Method | Path                                            | Permission             | Notes                            |
| ------ | ----------------------------------------------- | ---------------------- | -------------------------------- |
| GET    | `/v1/report-card-teacher-requests`              | `report_cards.comment` | teachers see own; admins see all |
| GET    | `/v1/report-card-teacher-requests/pending`      | `report_cards.manage`  | pending queue for reviewers      |
| GET    | `/v1/report-card-teacher-requests/:id`          | `report_cards.comment` |                                  |
| POST   | `/v1/report-card-teacher-requests`              | `report_cards.comment` | 201 (teacher submits)            |
| PATCH  | `/v1/report-card-teacher-requests/:id/cancel`   | `report_cards.comment` | teacher cancels own              |
| PATCH  | `/v1/report-card-teacher-requests/:id/approve`  | `report_cards.manage`  | `{ auto_execute }`               |
| PATCH  | `/v1/report-card-teacher-requests/:id/reject`   | `report_cards.manage`  | `{ reason }`                     |
| PATCH  | `/v1/report-card-teacher-requests/:id/complete` | `report_cards.manage`  | finalise lifecycle               |

### 79.7 Comment windows controller

| Method | Path                                    | Permission            | Notes                                           |
| ------ | --------------------------------------- | --------------------- | ----------------------------------------------- |
| GET    | `/v1/report-comment-windows`            | `report_cards.view`   | `?status?, academic_period_id?, page, pageSize` |
| GET    | `/v1/report-comment-windows/active`     | `report_cards.view`   | currently-open window or null                   |
| GET    | `/v1/report-comment-windows/landing`    | `report_cards.view`   | scope for the comments landing page             |
| GET    | `/v1/report-comment-windows/:id`        | `report_cards.view`   |                                                 |
| POST   | `/v1/report-comment-windows`            | `report_cards.manage` | 201 — open                                      |
| PATCH  | `/v1/report-comment-windows/:id/close`  | `report_cards.manage` | close now                                       |
| PATCH  | `/v1/report-comment-windows/:id/extend` | `report_cards.manage` | `{ closes_at }`                                 |
| PATCH  | `/v1/report-comment-windows/:id/reopen` | `report_cards.manage` |                                                 |
| PATCH  | `/v1/report-comment-windows/:id`        | `report_cards.manage` | update instructions/schedule                    |

### 79.8 Common error shape

All endpoints emit structured errors via NestJS exceptions:

```
{ "error": { "code": "UPPER_SNAKE_CASE", "message": "Human readable", "details": { ... } } }
```

Common codes surfaced in this spec: `CLASS_NOT_FOUND`, `CLASS_OUT_OF_SCOPE`, `REPORT_CARD_NOT_FOUND`, `REPORT_NOT_PUBLISHED`, `WINDOW_CLOSED`, `WINDOW_OVERLAP`, `NOT_HOMEROOM_TEACHER`, `REQUEST_NOT_PENDING`, `APPROVAL_NOT_PENDING`, `APPROVAL_CONFIG_DUPLICATE`, `CUSTOM_FIELD_DUPLICATE`, `CUSTOM_FIELD_REQUIRED`, `GRADE_THRESHOLD_OVERLAP`, `GRADE_THRESHOLD_GAP`, `TOKEN_EXPIRED`, `TOKEN_NOT_FOUND`, `ALREADY_ACKNOWLEDGED`, `FILE_REQUIRED`, `INVALID_MIME`, `FILE_TOO_LARGE`, `PERMISSION_DENIED`, `NO_PUBLISHED_CARDS`, `PARENT_NOT_LINKED`, `AI_RATE_LIMIT`, `INSUFFICIENT_DATA`, `STUDENT_NOT_FOUND`.

### 79.9 Route registration order notes

Some literal segments MUST be declared before dynamic `:id` routes so NestJS matches them first. Verified order:

- `generation-runs/dry-run` before `generation-runs/:id`
- `generation-runs` (list) before `:id` on the core controller
- `library`, `library/grouped`, `library/bundle-pdf` before `:id`
- `bulk-delete` before `DELETE /:id`
- `templates/content-scopes` before `templates/:id`
- `comment-windows/active`, `comment-windows/landing` before `:id`
- `teacher-requests/pending` before `:id`

Breaking this order will cause `"failed to load"` / `"invalid UUID"` errors because the dynamic segment matches the literal text.

### 79.10 Permission roll-up

- `school_owner`: bypasses all permission checks (`PermissionCacheService.isOwner()`).
- `school_principal`: typically holds `gradebook.*`, `report_cards.*`, `transcripts.generate`, `report_cards.approve`. Verify against role seed.
- `school_vice_principal`: usually mirrors principal minus some approve-scoped perms.
- `admin`: a general admin role that holds `gradebook.manage` and `report_cards.manage`. Does NOT hold `report_cards.approve` unless explicitly granted.
- `teacher`: `report_cards.view` (limited by class-scope), `report_cards.comment`, `gradebook.view` (limited).
- `parent`: `report_cards.view` on own children only (delivered via parent-specific endpoints — not scoped here).

---

## 80. Observations, Inconsistencies & Bugs Flagged

Use this section to record anything that deviated from expectations during the walkthrough. For each entry include the section + row number that surfaced it, a severity tag, and a one-line summary. Do NOT fix bugs here — just flag them.

### 80.1 Translation debt (EN / AR)

| #   | Section / Row | Severity | Summary | Owner | Status |
| --- | ------------- | -------- | ------- | ----- | ------ |
|     |               |          |         |       |        |
|     |               |          |         |       |        |
|     |               |          |         |       |        |
|     |               |          |         |       |        |
|     |               |          |         |       |        |

### 80.2 Functional issues

| #   | Section / Row | Severity (P1/P2/P3) | Summary | Steps to reproduce | Expected vs Actual |
| --- | ------------- | ------------------- | ------- | ------------------ | ------------------ |
|     |               |                     |         |                    |                    |
|     |               |                     |         |                    |                    |
|     |               |                     |         |                    |                    |
|     |               |                     |         |                    |                    |
|     |               |                     |         |                    |                    |

### 80.3 Documentation / contract mismatches

| #   | Section / Row | Summary | Source of truth | Needs update in |
| --- | ------------- | ------- | --------------- | --------------- |
|     |               |         |                 |                 |
|     |               |         |                 |                 |
|     |               |         |                 |                 |

### 80.4 Non-obvious behaviour worth documenting elsewhere

| #   | Section / Row | Summary | Suggested home |
| --- | ------------- | ------- | -------------- |
|     |               |         |                |
|     |               |         |                |
|     |               |         |                |

### 80.5 Performance or stability concerns

| #   | Section / Row | Summary | Measurement |
| --- | ------------- | ------- | ----------- |
|     |               |         |             |
|     |               |         |             |

---

## 81. Sign-Off

| Field                            | Value                                 |
| -------------------------------- | ------------------------------------- |
| QC engineer                      |                                       |
| Tenant                           | Nurul Huda School (`nhqs.edupod.app`) |
| Tester account                   | `owner@nhqs.test` (Yusuf Rahman)      |
| Test start date                  |                                       |
| Test end date                    |                                       |
| Browser / viewport               |                                       |
| Build / git SHA                  |                                       |
| Total rows passed                |                                       |
| Total rows failed                |                                       |
| P1 bugs found                    |                                       |
| P2 bugs found                    |                                       |
| P3 bugs found                    |                                       |
| Blocker-count preventing release |                                       |
| Notes                            |                                       |

**Sign-off criteria.** All P1 rows must pass. Any P1 failure blocks release. All documented endpoints must respond with the expected status codes. All RLS tests (Section 75) must pass without exception. No console errors on the golden path. No regressions against the previous spec run.

**Attach artefacts.** Browser console log export, Network HAR export for golden path, screenshot of any failed row's state. Store under `E2E/3_learning/ReportCards/admin_view/runs/{YYYY-MM-DD}/`.

— End of spec —
