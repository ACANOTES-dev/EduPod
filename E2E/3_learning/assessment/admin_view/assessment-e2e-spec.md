# Assessment Module — Admin / Owner E2E Test Specification

**Module:** Assessment (Leadership Dashboard, Gradebook, Analytics, Approvals, Config Catalogue)
**Perspective:** Admin / Owner / School Principal / Vice Principal — user holding `gradebook.*` manage keys (`gradebook.manage`, `gradebook.approve_config`, `gradebook.approve_unlock`, `gradebook.override_final_grade`, `gradebook.apply_curve`, `gradebook.view_analytics`, `gradebook.publish_grades_to_parents`, `gradebook.publish_report_cards`).
**Pages Covered:** 19 unique authenticated routes under `/assessments`, `/gradebook`, `/analytics`, plus report card surfaces covered by reference. 100+ distinct backend API endpoints across 14 controllers.
**Tester audience:** Dedicated QC engineer OR headless Playwright agent. Assume zero prior project context.
**Last Updated:** 2026-04-12
**Replaces:** `dashboard-e2e-spec.md`, `gradebook-e2e-spec.md`, `analytics-e2e-spec.md` (delete after sign-off).

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Delegated to Sibling Specs](#2-out-of-scope--delegated-to-sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Role Gating — How `/en/assessments` Branches by Role](#4-role-gating--how-enassessments-branches-by-role)
5. [Leadership Dashboard — Navigation](#5-leadership-dashboard--navigation)
6. [Leadership Dashboard — Page Load & Skeletons](#6-leadership-dashboard--page-load--skeletons)
7. [Leadership Dashboard — Header & Action Buttons](#7-leadership-dashboard--header--action-buttons)
8. [Leadership Dashboard — KPI Strip (Six Tone-Coded Cards)](#8-leadership-dashboard--kpi-strip-six-tone-coded-cards)
9. [Leadership Dashboard — Inline Approval Queue](#9-leadership-dashboard--inline-approval-queue)
10. [Leadership Dashboard — Teachers Needing Attention](#10-leadership-dashboard--teachers-needing-attention)
11. [Leadership Dashboard — Config Health Panel](#11-leadership-dashboard--config-health-panel)
12. [Leadership Dashboard — Activity by Subject](#12-leadership-dashboard--activity-by-subject)
13. [Leadership Dashboard — Year-Group & Class Filters](#13-leadership-dashboard--year-group--class-filters)
14. [Leadership Dashboard — Quick-Access Config Cards](#14-leadership-dashboard--quick-access-config-cards)
15. [Leadership Dashboard — Jump-to Row](#15-leadership-dashboard--jump-to-row)
16. [Leadership Dashboard — Refresh Behaviour & Polling](#16-leadership-dashboard--refresh-behaviour--polling)
17. [Approval Queue Page — Tabs & Layout](#17-approval-queue-page--tabs--layout)
18. [Approval Queue — Config Approvals Tab](#18-approval-queue--config-approvals-tab)
19. [Approval Queue — Unlock Requests Tab](#19-approval-queue--unlock-requests-tab)
20. [Approval Queue — Approve / Reject Dialogs](#20-approval-queue--approve--reject-dialogs)
21. [Assessment Categories — List](#21-assessment-categories--list)
22. [Assessment Categories — Create / Edit Dialog](#22-assessment-categories--create--edit-dialog)
23. [Assessment Categories — Delete & Submit for Approval](#23-assessment-categories--delete--submit-for-approval)
24. [Grading Weights — List](#24-grading-weights--list)
25. [Grading Weights — Create / Edit Dialog](#25-grading-weights--create--edit-dialog)
26. [Grading Weights — Sum-to-100 Validation](#26-grading-weights--sum-to-100-validation)
27. [Rubric Templates — List & Grid](#27-rubric-templates--list--grid)
28. [Rubric Templates — Create Dialog](#28-rubric-templates--create-dialog)
29. [Rubric Templates — Delete Confirmation](#29-rubric-templates--delete-confirmation)
30. [Curriculum Standards — List & Filters](#30-curriculum-standards--list--filters)
31. [Curriculum Standards — Create / Edit Dialog](#31-curriculum-standards--create--edit-dialog)
32. [Gradebook Listing](#32-gradebook-listing)
33. [Gradebook Listing — Year Group Sections & Class Cards](#33-gradebook-listing--year-group-sections--class-cards)
34. [Class Gradebook Workspace — Layout & Tabs](#34-class-gradebook-workspace--layout--tabs)
35. [Class Gradebook — Assessments Tab (Grouped View)](#35-class-gradebook--assessments-tab-grouped-view)
36. [Class Gradebook — Assessments Tab (Flat View)](#36-class-gradebook--assessments-tab-flat-view)
37. [Class Gradebook — Subject Filter](#37-class-gradebook--subject-filter)
38. [Class Gradebook — Admin-Initiated New Assessment](#38-class-gradebook--admin-initiated-new-assessment)
39. [Class Gradebook — From-Template Popover](#39-class-gradebook--from-template-popover)
40. [Class Gradebook — Results Tab](#40-class-gradebook--results-tab)
41. [Class Gradebook — Grades Tab (Period Grades)](#41-class-gradebook--grades-tab-period-grades)
42. [Grades Tab — Compute Grades Button](#42-grades-tab--compute-grades-button)
43. [Grades Tab — Override Dialog](#43-grades-tab--override-dialog)
44. [Grade Entry Page — Layout](#44-grade-entry-page--layout)
45. [Grade Entry — Bulk Score Entry](#45-grade-entry--bulk-score-entry)
46. [Grade Entry — Save & Submit Locks](#46-grade-entry--save--submit-locks)
47. [Grade Entry — Admin Override of Locked Assessment](#47-grade-entry--admin-override-of-locked-assessment)
48. [Grade Curve Application](#48-grade-curve-application)
49. [Grade Publishing — Readiness](#49-grade-publishing--readiness)
50. [Grade Publishing — Publish Grades](#50-grade-publishing--publish-grades)
51. [Bulk Import — Template Download](#51-bulk-import--template-download)
52. [Bulk Import — Validate & Process](#52-bulk-import--validate--process)
53. [Weight Config — Subject Weights](#53-weight-config--subject-weights)
54. [Weight Config — Period Weights](#54-weight-config--period-weights)
55. [Weight Config — Propagate to Classes](#55-weight-config--propagate-to-classes)
56. [Analytics Page — Class Selector](#56-analytics-page--class-selector)
57. [Analytics — Filter Bar (Period, Subject, Student)](#57-analytics--filter-bar-period-subject-student)
58. [Analytics — Class Overview Mode](#58-analytics--class-overview-mode)
59. [Analytics — Subject Deep Dive](#59-analytics--subject-deep-dive)
60. [Analytics — Student Profile](#60-analytics--student-profile)
61. [Analytics — Radar Chart & Strengths](#61-analytics--radar-chart--strengths)
62. [Analytics — All Periods (Year Overview)](#62-analytics--all-periods-year-overview)
63. [Analytics Insights Dashboard](#63-analytics-insights-dashboard)
64. [AI Features — Comment Generation](#64-ai-features--comment-generation)
65. [AI Features — Grading Instructions](#65-ai-features--grading-instructions)
66. [AI Features — Natural Language Query](#66-ai-features--natural-language-query)
67. [Progress Reports — Create & Send](#67-progress-reports--create--send)
68. [Unlock Request Workflow — Admin Side](#68-unlock-request-workflow--admin-side)
69. [Cross-Module Hand-Offs](#69-cross-module-hand-offs)
70. [Negative Assertions — What Admin Must Still NOT Do](#70-negative-assertions--what-admin-must-still-not-do)
71. [Error, Loading, Empty States](#71-error-loading-empty-states)
72. [Arabic / RTL](#72-arabic--rtl)
73. [Console & Network Health](#73-console--network-health)
74. [Mobile Responsiveness (375px)](#74-mobile-responsiveness-375px)
75. [Data Invariants](#75-data-invariants)
76. [Backend Endpoint Map](#76-backend-endpoint-map)
77. [Observations from Walkthrough](#77-observations-from-walkthrough)
78. [Sign-Off](#78-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

A single-tenant walkthrough cannot validate tenant isolation, so this spec REQUIRES two isolated tenants with overlapping entity shapes. Provision BEFORE running:

### Tenant A — `nhqs` (Nurul Huda Qur'an School)

- **URL:** `https://nhqs.edupod.app` (the `edupod.app/nhqs` domain is also allowed — **NEVER** `nurul-huda.edupod.app`).
- **Currency / locale:** EN with Arabic switchable; Gregorian + Latin digits in both locales.
- **Academic year:** One active year with at least two periods (e.g. `S1`, `S2`).
- **Staffing:** ≥ 3 teachers with staff profiles, ≥ 16 active classes across at least 3 year groups, ≥ 12 subjects.
- **Assessments:** ≥ 40 non-cancelled assessments distributed across ≥ 6 subjects and ≥ 2 periods; mix of statuses (`draft`, `open`, `closed`, `submitted_locked`, `unlock_requested`, `reopened`, `final_locked`).
- **Config items:** ≥ 2 assessment categories (one `approved`, one `pending_approval`), ≥ 2 teacher grading weights (mix of statuses), ≥ 2 rubric templates, ≥ 2 curriculum standards.
- **Pending work queue:** ≥ 1 pending assessment category, ≥ 1 pending grading weight, ≥ 1 pending unlock request.
- **Users required in Tenant A:**
  - `owner@nhqs.test` / `Password123!` — School Owner (full `gradebook.*` suite).
  - `principal@nhqs.test` / `Password123!` — Principal (same approve + manage scope).
  - `teacher@nhqs.test` / `Password123!` — Math Teacher (teacher-only scope; **NEGATIVE** test target).
  - `parent@nhqs.test` / `Password123!` — Parent with ≥ 1 linked student.

### Tenant B — `demo-b` (second isolated tenant)

- **URL:** `https://demo-b.edupod.app`.
- **Currency / locale:** EN only (different settings from A to surface any cross-tenant leak visually).
- **Academic year:** Different year; DO NOT share ids with Tenant A.
- **Seed data:** ≥ 5 active classes, ≥ 20 assessments, ≥ 5 teacher grading weights, ≥ 5 rubric templates — **none of the ids may collide with Tenant A**.
- **Users required in Tenant B:**
  - `owner@demo-b.test` / `Password123!` — Owner.
  - `teacher@demo-b.test` / `Password123!` — Teacher.

### Hostile cross-tenant pair

- Capture, from Tenant B's DB / API, the UUIDs of at least:
  - 1 assessment (`assessmentB.id`)
  - 1 class (`classB.id`)
  - 1 teacher-grading-weight (`weightB.id`)
  - 1 period grade snapshot (`psgB.id`)
- While logged in as Tenant A admin, navigate / call each Tenant B id by direct URL and API. Expected: `404` / `403` / empty body. **Never 200 with Tenant B data.** The UI-visible side is exercised in §70.7 below; the API-only matrix lives in `integration/assessment-integration-spec.md`.

### Browser / device matrix

Desktop Chrome (latest stable) + 375px iPhone SE emulation. Everything else deferred to a dedicated manual QA cycle.

---

## 2. Out of Scope — Delegated to Sibling Specs

This spec exercises the UI-visible surface of the Assessment module as a human (or Playwright agent) clicking through the admin shell. It does NOT cover:

- **RLS leakage matrix + API contract matrix** → `integration/assessment-integration-spec.md` — every endpoint × every role, every Zod validation edge case, every cross-tenant direct-API read.
- **State-machine invalid transitions** at the API level → `integration/` (the UI happy-path transitions are here; forced bad transitions are there).
- **BullMQ jobs, cron schedulers, retry policies, dead-letter** → `worker/assessment-worker-spec.md` — `REPORT_CARD_GENERATION_JOB`, `REPORT_CARD_AUTO_GENERATE_JOB`, `MASS_REPORT_CARD_PDF_JOB`, `BULK_IMPORT_PROCESS_JOB`, `GRADEBOOK_DETECT_RISKS_JOB`, `gradebook:detect-risks` cron (`0 2 * * *`), `report-cards:auto-generate` cron (`0 3 * * *`).
- **Latency & throughput budgets** → `perf/assessment-perf-spec.md` — p50/p95/p99 per endpoint, list endpoints at 10k grades, PDF render under load, bundle size, cold starts.
- **OWASP Top 10, IDOR, authorization bypass, injection, encrypted-field handling, JWT expiry / refresh** → `security/assessment-security-spec.md`.
- **Report Cards UI** — report card generation, comments, delivery are covered in `E2E/3_learning/ReportCards/`. This spec references them only where the Assessment hub links out to a report card surface.
- **Parent view of grades** → `parent_view/assessment-e2e-spec.md` — all `/parent/*` endpoints.
- **Teacher view** — the teacher branch of the `/en/assessments` role gate → `teacher_view/assessment-e2e-spec.md`.
- **PDF byte-level correctness** — transcript and report card PDF structural checks live in `integration/` via `pdf-parse`. UI only verifies `Content-Type`, `Content-Disposition`, filename, status code.
- **Long-tail Zod combinatorics** — sampled in `integration/`, not exhaustive.

A tester who runs ONLY this spec is doing a thorough admin-shell smoke + regression pass. For full release readiness, run the complete `/e2e-full` pack.

---

## 3. Global Environment Setup

| #   | What to Check                                                      | Expected Result                                                                                                                                                                      | Pass/Fail |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1 | Open Chrome DevTools, Network + Console tabs ready                 | Both tabs populate as navigation proceeds.                                                                                                                                           |           |
| 3.2 | Clear `localStorage`, `sessionStorage`, cookies for `*.edupod.app` | Logged out on next request.                                                                                                                                                          |           |
| 3.3 | Log in as `owner@nhqs.test`                                        | `POST /api/v1/auth/login` → 200 with `{ access_token, refresh_token }`. Access token stored in memory (NOT localStorage). Refresh token set as httpOnly cookie.                      |           |
| 3.4 | Verify JWT payload claims                                          | `role_keys` includes `school_owner`. Permission set includes `gradebook.manage`, `gradebook.approve_config`, `gradebook.approve_unlock`, `gradebook.view_analytics`, and 10+ others. |           |
| 3.5 | Landing URL after login                                            | `/en/dashboard` (admin variant — NOT `/en/dashboard/teacher`).                                                                                                                       |           |
| 3.6 | Tenant slug in URL / subdomain                                     | `nhqs.edupod.app` subdomain in address bar.                                                                                                                                          |           |
| 3.7 | Browser console                                                    | Zero uncaught errors. No red warnings.                                                                                                                                               |           |
| 3.8 | Toggle Arabic locale (`ar`) via the profile menu language switcher | URL becomes `/ar/dashboard`. `<html dir="rtl">`. Morph bar mirrors.                                                                                                                  |           |
| 3.9 | Toggle back to `en`                                                | `<html dir="ltr">`. Morph bar un-mirrors.                                                                                                                                            |           |

---

## 4. Role Gating — How `/en/assessments` Branches by Role

| #   | What to Check                                                                       | Expected Result                                                                                                                                                                                     | Pass/Fail |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | `/en/assessments` as `owner@nhqs.test`                                              | Renders the **Leadership Dashboard** (this spec). The first API call fired is `GET /api/v1/gradebook/teaching-allocations/all` — the admin-only endpoint.                                           |           |
| 4.2 | `/en/assessments` as `principal@nhqs.test`                                          | Same Leadership Dashboard.                                                                                                                                                                          |           |
| 4.3 | `/en/assessments` as `teacher@nhqs.test` (different tab — do NOT log out admin)     | Renders the **Teacher Dashboard** variant — documented in `teacher_view/assessment-e2e-spec.md`. Confirms the role switch is functional. Switch back to the admin tab before continuing.            |           |
| 4.4 | `ADMIN_ROLES` constant                                                              | Source of truth: `['school_owner', 'school_principal', 'school_vice_principal', 'admin']`. If a user's `role_keys` includes any of the four, the Leadership variant renders.                        |           |
| 4.5 | Explicitly NOT-admin: log in as a finance-only user (`finance@nhqs.test` if seeded) | `/en/assessments` redirects to `/en/dashboard` or shows the 403 "You don't have permission" full-page. No Leadership UI flashes before the redirect.                                                |           |
| 4.6 | No "No staff profile" toast for admin                                               | Unlike the teacher path, the admin variant MUST NOT surface a red toast saying **"No staff profile found for user …"**. The leadership dashboard short-circuits around `getMyAllocations` entirely. |           |

---

## 5. Leadership Dashboard — Navigation

| #   | What to Check                                                                  | Expected Result                                                                                                                                                      | Pass/Fail |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Inspect the morph bar hubs                                                     | Admin sees 9 hubs: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Finance**, **Reports**, **Regulatory**, **Settings**.                        |           |
| 5.2 | Click **Learning**                                                             | URL becomes `/en/classes` (first Learning basePath). Learning sub-strip appears with: **Classes**, **Curriculum**, **Assessment**, **Homework**, **Attendance**.     |           |
| 5.3 | Click **Assessment** in the Learning sub-strip                                 | URL becomes `/en/assessments`. The link is highlighted active. A second Assessment sub-strip appears: **Dashboard**, **Gradebook**, **Report Cards**, **Analytics**. |           |
| 5.4 | Verify the right-side profile button                                           | Reads **"Yusuf Rahman"**, role label **"School Owner"**, avatar initials **"YR"** in a primary-colour circle.                                                        |           |
| 5.5 | Keyboard navigation — Tab through the morph bar                                | Each hub focuses in visual order; Enter activates; focus ring visible on dark + light themes.                                                                        |           |
| 5.6 | Shell visual stability                                                         | Morph bar does NOT remount / re-animate while moving between Assessment → Gradebook → Analytics. Only the sub-strip active pill shifts.                              |           |
| 5.7 | Deep-linking: paste `/en/assessments/approvals` into a new tab while logged in | No flash of the dashboard before the approvals page renders.                                                                                                         |           |

---

## 6. Leadership Dashboard — Page Load & Skeletons

**URL:** `/en/assessments`

| #   | What to Check                                                | Expected Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass/Fail |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Initial skeleton (first ~500ms)                              | LoadingSkeleton renders: one header stripe, six KPI card skeletons in a row, an approvals skeleton strip, a 3-column panel skeleton (Activity by Subject), and a 2-column panel skeleton (Teachers / Config Health).                                                                                                                                                                                                                                                                  |           |
| 6.2 | After load                                                   | No infinite skeletons. Header, KPI strip, approvals queue, teachers panel, config panel, activity table, config quick-access grid, jump-to row ALL render.                                                                                                                                                                                                                                                                                                                            |           |
| 6.3 | Data fetches fired in parallel (open Network, sort by Start) | Six parallel requests: (a) `GET /api/v1/gradebook/teaching-allocations/all`, (b) `GET /api/v1/subjects?pageSize=100`, (c) paginated `GET /api/v1/gradebook/assessments?exclude_cancelled=true&pageSize=100&page=N`, (d) `GET /api/v1/gradebook/assessment-categories?pageSize=100`, (e) `GET /api/v1/gradebook/teacher-grading-weights?pageSize=100`, (f) `GET /api/v1/gradebook/rubric-templates`, (g) `GET /api/v1/gradebook/curriculum-standards`. All must return 200 within ~2s. |           |
| 6.4 | Browser console                                              | Zero red errors. No `console.error` from any of the six requests. Background benign 404 for `/api/v1/gradebook/teaching-allocations` (the teacher endpoint) — wrapped in `Promise.allSettled`, not surfaced to user.                                                                                                                                                                                                                                                                  |           |
| 6.5 | Tenant isolation sanity                                      | Every response body contains ONLY Tenant A rows. No id from Tenant B seed set appears. Record three random ids and cross-check against Tenant B's DB offline.                                                                                                                                                                                                                                                                                                                         |           |
| 6.6 | Refresh (F5)                                                 | Identical set of 6 requests fires; same data renders.                                                                                                                                                                                                                                                                                                                                                                                                                                 |           |

---

## 7. Leadership Dashboard — Header & Action Buttons

| #   | What to Check                  | Expected Result                                                                                          | Pass/Fail |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | `<h1>`                         | Text: **"Assessment Oversight"**. Class: `text-2xl font-semibold`.                                       |           |
| 7.2 | Subtitle                       | **"School-wide assessment activity, teacher grading progress, approvals, and configuration health."**    |           |
| 7.3 | Action buttons (top right)     | **Refresh** (icon button), **Open approvals queue** (primary button), **Gradebook** (secondary outline). |           |
| 7.4 | Click **Open approvals queue** | Navigates to `/en/assessments/approvals`. Approval tab loads (default: Config Approvals).                |           |
| 7.5 | Click **Gradebook**            | Navigates to `/en/gradebook`. Gradebook listing loads.                                                   |           |
| 7.6 | Back button                    | Returns to dashboard with scroll position preserved.                                                     |           |
| 7.7 | Breadcrumb (if present)        | **Learning › Assessment › Dashboard**. Each link navigates correctly.                                    |           |

---

## 8. Leadership Dashboard — KPI Strip (Six Tone-Coded Cards)

Six cards across a horizontally-scrollable row. Tone colours follow the redesign token system — do NOT accept hardcoded hex.

| #   | Card                         | Expected Content                                                                                                                                                       | Expected Tone         | Pass/Fail |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 8.1 | **Total Assessments**        | Count = number of non-cancelled assessments returned from paginated `/api/v1/gradebook/assessments?exclude_cancelled=true`. Subtitle: "this academic year".            | Info (blue)           |           |
| 8.2 | **Open Assessments**         | Count where `status === 'open'`. Subtitle: "currently accepting grades".                                                                                               | Primary (brand)       |           |
| 8.3 | **Grading Backlog**          | Count where status is `open` AND `grading_deadline` has passed. Subtitle: "past grading deadline".                                                                     | Warning (amber)       |           |
| 8.4 | **Pending Approvals**        | Count from sum of pending config items + pending unlock requests. Subtitle: "items awaiting review".                                                                   | Danger (red) if > 0   |           |
| 8.5 | **Active Teachers**          | Count of distinct teacher user_ids from `teaching-allocations/all`. Subtitle: "with allocations".                                                                      | Neutral               |           |
| 8.6 | **Config Health**            | Percentage of required config items in `approved` state (categories + weights + rubrics + standards). Subtitle: "approved vs total".                                   | Success (green) ≥ 80% |           |
| 8.7 | Hover tooltip on any KPI     | Tooltip-follow shows the breakdown formula plus a "Learn more" link. Dismisses on mouseleave + Esc.                                                                    | —                     |           |
| 8.8 | Cards are keyboard focusable | Tab to each card; Enter triggers the card's default action (if any — else tooltip opens and anchors).                                                                  | —                     |           |
| 8.9 | Zero-state handling          | If a fetch returns an empty list, the card shows **"—"** rather than **"0"** or **"NaN"**. If a fetch fails, the card shows **"—"** and a small warning badge in-card. | —                     |           |

---

## 9. Leadership Dashboard — Inline Approval Queue

| #   | What to Check                   | Expected Result                                                                                                                                                                                                              | Pass/Fail |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Section heading                 | **"Pending approvals"** with a count badge (e.g. "3").                                                                                                                                                                       |           |
| 9.2 | When zero pending               | The section collapses to an EmptyState mini-card: **"Nothing to review."** with a **CheckCircle2** icon (success tone).                                                                                                      |           |
| 9.3 | When ≥ 1 pending                | Cards show: submitter avatar + full name, item type badge (Category / Grading Weight / Rubric / Standard / Unlock), item name, submitted-at relative timestamp, **Approve** and **Reject** buttons.                          |           |
| 9.4 | Click **Approve** on a category | Dialog: "Approve {category name}?" with Confirm button. On confirm: `POST /api/v1/gradebook/assessment-categories/{id}/review` with `{ action: 'approved' }`. Toast green "Approved". Card disappears. KPI badge decrements. |           |
| 9.5 | Click **Reject**                | Opens reject dialog with a **required** rejection-reason textarea (see §20.5). On confirm: `POST .../review` with `{ action: 'rejected', rejection_reason: '...' }`. Toast green "Rejected".                                 |           |
| 9.6 | Pagination / overflow           | If > 5 pending, section shows "View all →" link → `/en/assessments/approvals`.                                                                                                                                               |           |
| 9.7 | Optimistic UI                   | Approve/Reject instantly removes the card before response; if response fails, card re-inserts and red toast fires.                                                                                                           |           |
| 9.8 | Permission                      | Admin has `gradebook.approve_config` + `gradebook.approve_unlock`. Backend enforces both.                                                                                                                                    |           |

---

## 10. Leadership Dashboard — Teachers Needing Attention

| #    | What to Check        | Expected Result                                                                                                      | Pass/Fail |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Section heading      | **"Teachers needing attention"**.                                                                                    |           |
| 10.2 | Empty state          | When no flags: EmptyState "All teachers are current." with success icon.                                             |           |
| 10.3 | Table / card layout  | Desktop: 4-column table (Teacher, Subjects, Missing, Status). Mobile: stacked card list.                             |           |
| 10.4 | Row: missing weights | Badge "No approved weights" (warning tone); click row → `/en/assessments/grading-weights?teacher={uid}` prefilter.   |           |
| 10.5 | Row: grading backlog | Badge "{N} overdue assessments"; click row → `/en/gradebook/{classId}` filtered to that teacher's subjects.          |           |
| 10.6 | Row: rejected config | Badge "Rejected config to re-submit" (danger tone); click row → `/en/assessments/approvals`.                         |           |
| 10.7 | Sort                 | Clicking a column header toggles ascending/descending. Status column sorts by severity (danger → warning → neutral). |           |

---

## 11. Leadership Dashboard — Config Health Panel

| #    | What to Check          | Expected Result                                                                                                             | Pass/Fail |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Section heading        | **"Config health"**.                                                                                                        |           |
| 11.2 | Row per config type    | Four rows: Categories, Teacher Grading Weights, Rubric Templates, Curriculum Standards.                                     |           |
| 11.3 | Counts                 | Each row shows "X approved / Y total" + progress bar.                                                                       |           |
| 11.4 | Row link               | Click → jumps to the corresponding list page with status filter already applied (e.g. `?status=pending_approval`).          |           |
| 11.5 | Tooltip on "approved"  | Hover explains: "Approved items are visible to all teachers and can be referenced by assessments."                          |           |
| 11.6 | Zero approved in a row | Danger-tone banner: **"{type}: none approved — teachers cannot use this config until an admin reviews their submissions."** |           |

---

## 12. Leadership Dashboard — Activity by Subject

| #    | What to Check              | Expected Result                                                                                                                                                                                | Pass/Fail |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Section heading            | **"Activity by subject"**.                                                                                                                                                                     |           |
| 12.2 | Table structure            | Columns: Subject, Classes, Assessments, Open, Closed, Locked, Avg. grading progress, Missing config.                                                                                           |           |
| 12.3 | Sort default               | By Assessments descending.                                                                                                                                                                     |           |
| 12.4 | Column header tooltips     | Hover each — explains aggregation method (e.g. "Locked = submitted_locked + final_locked").                                                                                                    |           |
| 12.5 | Missing config flag        | Subjects without an approved category show a red **AlertTriangle** icon in the Missing column. Hover: "No approved categories for this subject — teachers cannot create new assessments here." |           |
| 12.6 | Click subject name         | Navigates to `/en/gradebook?subject={id}` — gradebook listing filtered.                                                                                                                        |           |
| 12.7 | Keyboard navigation        | Arrow keys move row focus; Enter activates.                                                                                                                                                    |           |
| 12.8 | Horizontal scroll (mobile) | Wrapping div has `overflow-x-auto`; first column (Subject) sticky.                                                                                                                             |           |

---

## 13. Leadership Dashboard — Year-Group & Class Filters

| #    | What to Check                   | Expected Result                                                                                                                          | Pass/Fail |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Filter bar above Activity table | Two dropdowns: **Year group** (All / per active year group) and **Class** (All / per class). Defaults: All / All.                        |           |
| 13.2 | Select a year group             | Activity table filters to only classes in that year. Year group filter persists in URL: `?year_group_id={uuid}`.                         |           |
| 13.3 | Select a class                  | Table filters further. Rows not in the selected class dim to 0.3 opacity but still render (so totals remain calibrated).                 |           |
| 13.4 | Reset filters                   | "Clear filters" link restores defaults; URL params stripped.                                                                             |           |
| 13.5 | Permission scope                | Year group and class lists fetched via `/api/v1/year-groups` and `/api/v1/classes` — admin has `students.view` which grants read access. |           |

---

## 14. Leadership Dashboard — Quick-Access Config Cards

| #    | What to Check                                                                | Expected Result                                                                          | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| 14.1 | Grid of 4 cards: Categories / Grading Weights / Rubric Templates / Standards | Each card shows icon + label + count + status breakdown pill.                            |           |
| 14.2 | Click **Categories** card                                                    | Navigates to `/en/assessments/categories`.                                               |           |
| 14.3 | Click **Grading Weights** card                                               | Navigates to `/en/assessments/grading-weights`.                                          |           |
| 14.4 | Click **Rubric Templates** card                                              | Navigates to `/en/assessments/rubric-templates`.                                         |           |
| 14.5 | Click **Curriculum Standards** card                                          | Navigates to `/en/assessments/curriculum-standards`.                                     |           |
| 14.6 | Count accuracy                                                               | Each card's count equals `GET /api/v1/gradebook/{endpoint}?pageSize=100`'s `meta.total`. |           |
| 14.7 | Keyboard focusable                                                           | Tab through cards in reading order; Enter activates.                                     |           |

---

## 15. Leadership Dashboard — Jump-to Row

| #    | What to Check                                                           | Expected Result                                                          | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| 15.1 | Row of 3 cards at bottom: Curriculum Matrix, Gradebook, Grade Analytics | Each card has icon, label, short description.                            |           |
| 15.2 | Click **Curriculum Matrix**                                             | `/en/curriculum` — out-of-scope for this spec; confirms navigation only. |           |
| 15.3 | Click **Gradebook**                                                     | `/en/gradebook`.                                                         |           |
| 15.4 | Click **Grade Analytics**                                               | `/en/analytics`.                                                         |           |

---

## 16. Leadership Dashboard — Refresh Behaviour & Polling

| #    | What to Check                          | Expected Result                                                                                                                                | Pass/Fail |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | No background polling                  | Dashboard does NOT auto-refresh. No `setInterval`. Pure on-mount + manual refresh.                                                             |           |
| 16.2 | Click **Refresh** icon button          | Re-fires all 6 parallel requests. Skeletons reappear briefly on the affected panels. KPI counts update if data changed.                        |           |
| 16.3 | Browser back / forward navigation      | Returns to cached state; no ghost second fetch.                                                                                                |           |
| 16.4 | Inactivity for 5 minutes, then refresh | JWT access token may have expired — `/api/v1/auth/refresh` cookie flow fires transparently; requests succeed. User never sees a 401 bubble-up. |           |

---

## 17. Approval Queue Page — Tabs & Layout

**URL:** `/en/assessments/approvals`

| #    | What to Check            | Expected Result                                                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Page heading             | `<h1>` **"Approvals"**. Subtitle: "Review teacher submissions and unlock requests."                                                                                                                       |           |
| 17.2 | Tabs                     | Two tabs: **Config approvals** (default) and **Unlock requests**. Active tab has primary underline + aria-selected="true".                                                                                |           |
| 17.3 | Tab switch keyboard      | Left / Right arrow keys move focus + activate tab (per WAI-ARIA pattern).                                                                                                                                 |           |
| 17.4 | URL reflects tab         | Switching to Unlock requests updates URL to `/en/assessments/approvals?tab=unlocks`. Direct-linking the URL opens that tab on load.                                                                       |           |
| 17.5 | Count badges on each tab | Each tab title shows the count: "Config approvals (3)", "Unlock requests (1)".                                                                                                                            |           |
| 17.6 | Data fetches on mount    | `GET /api/v1/gradebook/assessment-categories?status=pending_approval` + three sibling calls for weights / rubrics / standards (all pending). Plus `GET /api/v1/gradebook/unlock-requests?status=pending`. |           |
| 17.7 | Empty state per tab      | Each tab has its own EmptyState: "No config items awaiting review" / "No unlock requests pending".                                                                                                        |           |

---

## 18. Approval Queue — Config Approvals Tab

| #    | What to Check         | Expected Result                                                                                                                              | Pass/Fail |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Desktop table columns | **Type**, **Item name**, **Submitted by**, **Submitted at**, **Actions**.                                                                    |           |
| 18.2 | Mobile cards          | Each row becomes a card (hidden on `sm:` via `sm:hidden`).                                                                                   |           |
| 18.3 | Type column           | Badge per type: Category (blue), Grading Weight (purple), Rubric (green), Standard (amber). Each badge has matching icon.                    |           |
| 18.4 | Item name             | For category: its `name`. For grading weight: `{subject name} — {year group} — {period}`. For rubric: `name`. For standard: `{code} {name}`. |           |
| 18.5 | Submitted by          | Full name of submitter resolved via `user_id`. If user deleted: "Unknown user".                                                              |           |
| 18.6 | Submitted at          | Relative time (e.g. "2 hours ago"). Tooltip on hover shows absolute timestamp in tenant timezone.                                            |           |
| 18.7 | Sorting               | Default sort: Submitted at descending (newest first). Clickable headers toggle.                                                              |           |
| 18.8 | Filters               | Top filter bar: Type (multi-select), Submitted by (single select). URL-backed.                                                               |           |
| 18.9 | Actions column        | **View** (opens read-only side drawer with full item details), **Approve**, **Reject**.                                                      |           |

---

## 19. Approval Queue — Unlock Requests Tab

| #    | What to Check                    | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Columns                          | **Assessment**, **Class / Subject**, **Requested by**, **Reason**, **Submitted at**, **Actions**.                                                                                               |           |
| 19.2 | Assessment column                | Assessment title; click → `/en/gradebook/{classId}/assessments/{assessmentId}/grades` (read-only for admin until unlock approved).                                                              |           |
| 19.3 | Reason                           | Truncated to 120 chars with "read more" tooltip showing full reason.                                                                                                                            |           |
| 19.4 | Approve button                   | `POST /api/v1/gradebook/unlock-requests/{id}/review` body `{ action: 'approved' }`. Backend transitions assessment `submitted_locked → reopened`. Toast: "Unlock approved — teacher notified.". |           |
| 19.5 | Reject button                    | Dialog requires rejection reason. `POST` body `{ action: 'rejected', rejection_reason }`. Toast: "Unlock rejected.".                                                                            |           |
| 19.6 | Post-approve side effect visible | Refreshing the approvals page: the request row disappears. Navigating to the assessment shows status **Reopened** badge.                                                                        |           |
| 19.7 | Audit trail                      | `AssessmentUnlockRequest.reviewed_by_user_id = admin.id`, `reviewed_at = now()` (verify in DB post-test).                                                                                       |           |

---

## 20. Approval Queue — Approve / Reject Dialogs

| #    | What to Check            | Expected Result                                                                                                                                                | Pass/Fail |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Approve dialog structure | Title: "Approve {item type}?". Body: one-line summary. Buttons: **Cancel**, **Confirm** (primary).                                                             |           |
| 20.2 | Confirm hit              | `POST .../review` with `{ action: 'approved' }`. 200. Toast green.                                                                                             |           |
| 20.3 | Network failure          | Disconnect network (Network tab → Offline). Confirm. Toast red "Network error — please retry." Dialog stays open.                                              |           |
| 20.4 | 403 response             | Force 403 (revoke `gradebook.approve_config` temporarily on backend). Confirm. Toast red "You don't have permission to approve this item.". Dialog stays open. |           |
| 20.5 | Reject dialog            | Body: required **Rejection reason** textarea (min 10 chars). "Submit rejection" button disabled until length check passes.                                     |           |
| 20.6 | Reject validation        | Typing 9 chars → button disabled. 10 chars → enabled. 5000-char input accepted up to a max (verify schema cap).                                                |           |
| 20.7 | Reject submit            | `POST` body `{ action: 'rejected', rejection_reason: '{text}' }`. 200. Toast green.                                                                            |           |
| 20.8 | Esc closes dialog        | Both approve and reject dialogs dismiss on Esc. Focus returns to the trigger button.                                                                           |           |
| 20.9 | Click outside closes     | Yes, on the reject dialog ONLY IF no text entered. If text entered, warn via a nested AlertDialog "Discard rejection reason?".                                 |           |

---

## 21. Assessment Categories — List

**URL:** `/en/assessments/categories`

| #     | What to Check              | Expected Result                                                                                                 | Pass/Fail |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1  | Page heading               | `<h1>` **"Assessment categories"**. Subtitle explains their role in weighting.                                  |           |
| 21.2  | Action buttons (top right) | **New category** (primary).                                                                                     |           |
| 21.3  | Table columns              | **Name**, **Subject scope**, **Year group scope**, **Default weight**, **Status**, **Updated**, **Actions**.    |           |
| 21.4  | Status badge               | Draft (gray), Pending approval (amber), Approved (green), Rejected (red with tooltip showing rejection_reason). |           |
| 21.5  | Default sort               | Name ascending.                                                                                                 |           |
| 21.6  | Row click                  | Opens edit dialog (if admin) with values prefilled.                                                             |           |
| 21.7  | Filter by status           | Dropdown: All / Draft / Pending / Approved / Rejected. URL-backed `?status=approved`.                           |           |
| 21.8  | Filter by subject          | Dropdown populated from `/api/v1/subjects?pageSize=100`. Options include "All subjects".                        |           |
| 21.9  | Empty state                | EmptyState card "No assessment categories yet. Click New category to add one.".                                 |           |
| 21.10 | Loading state              | DataTable's built-in skeleton rows (count = pageSize).                                                          |           |
| 21.11 | Pagination                 | 20 per page default, 50/100 selectable. `?page=N`. Total count shown.                                           |           |

---

## 22. Assessment Categories — Create / Edit Dialog

| #     | What to Check                                | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1  | Open via "New category" button               | Dialog opens with title "New category". All fields empty. Focus auto-places in Name input.                                                                                                                           |           |
| 22.2  | Fields                                       | **Name** (required, min 2, max 80 chars), **Subject scope** (optional dropdown — "All subjects" or pick one), **Year group scope** (optional dropdown), **Default weight** (optional number, 0–100 with 2 decimals). |           |
| 22.3  | Submit with only Name                        | 200. `POST /api/v1/gradebook/assessment-categories`. Toast green "Category created". Row appears in table with Status `draft`.                                                                                       |           |
| 22.4  | Submit missing Name                          | Red inline error "Name is required". Submit button disabled.                                                                                                                                                         |           |
| 22.5  | Edit existing row                            | Dialog title "Edit category". Prefilled. Save → `PATCH /api/v1/gradebook/assessment-categories/{id}`. Toast green.                                                                                                   |           |
| 22.6  | Edit locked when status = `pending_approval` | Dialog shows read-only banner: "This category is awaiting approval — withdraw to edit." Fields disabled. Primary button replaced with **Withdraw**.                                                                  |           |
| 22.7  | Withdraw                                     | Resets status to `draft`. Re-enables editing.                                                                                                                                                                        |           |
| 22.8  | Default weight out of range                  | 101 → red error "Must be 0–100". -5 → red error.                                                                                                                                                                     |           |
| 22.9  | Subject scope + year group combo uniqueness  | Two categories with identical (name, subject_id, year_group_id) → 409 Conflict; red toast "A category with this scope already exists".                                                                               |           |
| 22.10 | Cancel closes the dialog                     | No request fired.                                                                                                                                                                                                    |           |

---

## 23. Assessment Categories — Delete & Submit for Approval

| #    | What to Check                  | Expected Result                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Row action menu (3-dot)        | Options: **Edit**, **Submit for approval** (if draft), **Delete**, **View audit** (opens history drawer).                                                      |           |
| 23.2 | Delete flow                    | Confirmation modal: "Delete {category name}? This cannot be undone." On confirm: `DELETE /api/v1/gradebook/assessment-categories/{id}`. Toast green "Deleted". |           |
| 23.3 | Delete blocked by in-use       | If category referenced by ≥ 1 assessment, backend returns 409. Toast red "Cannot delete — in use by {N} assessments.".                                         |           |
| 23.4 | Submit for approval            | `POST /api/v1/gradebook/assessment-categories/{id}/submit`. Status → `pending_approval`. Toast green.                                                          |           |
| 23.5 | Admin submitting their own     | Works (since admin has `gradebook.manage_own_config` implicitly via manage). Row shows "pending" badge.                                                        |           |
| 23.6 | Admin approving own submission | Approval queue on the Approvals page lists this item. Clicking Approve succeeds. Status → `approved`.                                                          |           |
| 23.7 | View audit drawer              | Shows a vertical timeline: created → submitted → reviewed, with actor names + timestamps + reasons.                                                            |           |

---

## 24. Grading Weights — List

**URL:** `/en/assessments/grading-weights`

| #    | What to Check                           | Expected Result                                                                                                      | Pass/Fail |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1 | Heading                                 | `<h1>` **"Teacher grading weights"**.                                                                                |           |
| 24.2 | Columns                                 | **Teacher**, **Subject**, **Year group**, **Period**, **Weights summary**, **Total %**, **Status**, **Actions**.     |           |
| 24.3 | Total % column                          | Renders the sum (e.g. "100%" in green, "95%" in amber, "110%" in red).                                               |           |
| 24.4 | Weights summary                         | Compact inline badges e.g. "Exam: 40, Quiz: 30, HW: 20, Participation: 10".                                          |           |
| 24.5 | Filter by Teacher                       | Dropdown of teachers with existing weights. Populated from `/api/v1/gradebook/teacher-grading-weights?pageSize=100`. |           |
| 24.6 | Filter by Subject / Year group / Period | Cascading dropdowns. URL-backed.                                                                                     |           |
| 24.7 | Admin view                              | Admin sees ALL teachers' weights. Confirm vs. teacher view (see teacher spec §X.Y) which shows only own.             |           |
| 24.8 | New weight button                       | **New weight** (primary).                                                                                            |           |

---

## 25. Grading Weights — Create / Edit Dialog

| #    | What to Check                 | Expected Result                                                                                                                                                                                               | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1 | Dialog structure              | Title **"New grading weight"**. Fields: Teacher (admin-selectable), Subject (required), Year group (required), Period (required), Category weight inputs (dynamic rows).                                      |           |
| 25.2 | Teacher dropdown (admin only) | Populated from `/api/v1/staff-profiles?pageSize=100` filtered to teaching roles. Teacher view omits this field entirely (self-only).                                                                          |           |
| 25.3 | Category weight inputs        | One row per approved category that matches the subject/year scope. Each row: category label + number input (0–100 with 2 decimals).                                                                           |           |
| 25.4 | Live sum indicator            | Footer shows "Total: 100%" in green, "Total: 95%" in amber, "Total: 110%" in red. Updates on every keystroke.                                                                                                 |           |
| 25.5 | Submit with total ≠ 100       | `POST` rejected (server-side `.refine()` on schema). Inline red banner: "Weights must sum to 100%." Toast red.                                                                                                |           |
| 25.6 | Submit success                | `POST /api/v1/gradebook/teacher-grading-weights` body: `{ teacher_user_id, subject_id, year_group_id, academic_period_id, category_weights_json: { weights: [{ category_id, weight }, ...] } }`. Toast green. |           |
| 25.7 | Edit locked when pending      | Same withdraw flow as categories (§22.6).                                                                                                                                                                     |           |
| 25.8 | Uniqueness constraint         | Duplicate `(teacher_user_id, subject_id, year_group_id, academic_period_id)` → 409. Red toast.                                                                                                                |           |
| 25.9 | Decimal handling              | Typing "33.33" accepted; "33.333" truncated to "33.33".                                                                                                                                                       |           |

---

## 26. Grading Weights — Sum-to-100 Validation

| #    | What to Check             | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.1 | Tolerance                 | Accepted when `Math.abs(sum - 100) < 0.01`. Display tolerance warning otherwise.                                                                       |           |
| 26.2 | Admin override            | Even admin cannot bypass the validation — schema enforces it server-side.                                                                              |           |
| 26.3 | Empty categories          | If the subject/year scope has zero approved categories, dialog shows warning "No approved categories for this scope — add one first." Submit disabled. |           |
| 26.4 | Category deleted mid-edit | If a category is deleted while dialog open, inline error appears next to the row; submit blocked until user clicks Refresh.                            |           |

---

## 27. Rubric Templates — List & Grid

**URL:** `/en/assessments/rubric-templates`

| #    | What to Check    | Expected Result                                                                                                               | Pass/Fail |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1 | Heading          | `<h1>` **"Rubric templates"**.                                                                                                |           |
| 27.2 | Grid layout      | Cards in a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` grid. Each card: name, subject, criteria count, status badge, actions. |           |
| 27.3 | Create button    | **New rubric** primary.                                                                                                       |           |
| 27.4 | Card content     | Top: icon + name. Middle: "{N} criteria · {M} levels". Bottom: status badge + actions kebab.                                  |           |
| 27.5 | Empty state      | EmptyState with `BookOpen` icon: "No rubric templates yet".                                                                   |           |
| 27.6 | Skeleton loading | 6 card skeletons during load.                                                                                                 |           |

---

## 28. Rubric Templates — Create Dialog

| #    | What to Check            | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.1 | Open dialog              | Title **"New rubric template"**. Default criteria prepopulated from `DEFAULT_CRITERIA` constant (4 criteria × 4 levels).                      |           |
| 28.2 | Field: Name              | Required, min 2, max 80.                                                                                                                      |           |
| 28.3 | Field: Subject           | Optional; dropdown of subjects.                                                                                                               |           |
| 28.4 | Criteria editor          | Inline table: criterion name (text), per-level description (one per column), per-level score (number). "Add criterion" / "Add level" buttons. |           |
| 28.5 | Level scores must ascend | Client-side: level 1 < 2 < 3 < 4. Red inline error if violated.                                                                               |           |
| 28.6 | Submit                   | `POST /api/v1/gradebook/rubric-templates` with `{ name, subject_id, criteria_json, max_score }`. Toast green.                                 |           |
| 28.7 | Submit for approval      | Separate action on the row: `POST /api/v1/gradebook/rubric-templates/{id}/submit`. Status → `pending_approval`.                               |           |
| 28.8 | Max score computation    | `max_score` auto-filled = sum of top level scores across all criteria.                                                                        |           |

---

## 29. Rubric Templates — Delete Confirmation

| #    | What to Check                             | Expected Result                                                                                                  | Pass/Fail |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1 | Click Delete from card menu               | Confirmation dialog. Requires typing the rubric name to confirm (protection against accidental delete).          |           |
| 29.2 | Delete blocked by assessments referencing | 409 if any Assessment has `rubric_template_id = thisId`. Red toast "Cannot delete — in use by {N} assessments.". |           |
| 29.3 | Post-delete                               | Card vanishes from grid; count decrements.                                                                       |           |

---

## 30. Curriculum Standards — List & Filters

**URL:** `/en/assessments/curriculum-standards`

| #    | What to Check | Expected Result                                                                                                                     | Pass/Fail |
| ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1 | Heading       | `<h1>` **"Curriculum standards"**.                                                                                                  |           |
| 30.2 | Table columns | **Code**, **Name**, **Subject**, **Year group**, **Status**, **Actions**.                                                           |           |
| 30.3 | Filters       | Subject / Year group / Status / Search by code or name.                                                                             |           |
| 30.4 | Import button | **Import standards** → opens file upload modal (`.csv` / `.xlsx`). Submits to `POST /api/v1/gradebook/curriculum-standards/import`. |           |
| 30.5 | Code column   | Monospace font (JetBrains Mono, per design tokens). Forced LTR via `dir="ltr"` on the `<td>`.                                       |           |
| 30.6 | Page size     | 20 default, 50/100 selectable.                                                                                                      |           |

---

## 31. Curriculum Standards — Create / Edit Dialog

| #    | What to Check         | Expected Result                                                                                                                                                                  | Pass/Fail |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Fields                | **Code** (required, unique per subject+year, uppercase-normalised), **Name** (required), **Description** (optional textarea), **Subject** (required), **Year group** (required). |           |
| 31.2 | Duplicate code        | 409 response. Red inline error on Code field: "A standard with this code already exists for this subject and year group.".                                                       |           |
| 31.3 | Submit for approval   | `POST /api/v1/gradebook/curriculum-standards/{id}/submit`. Status → `pending_approval`.                                                                                          |           |
| 31.4 | Assign to assessments | Cross-reference UI lives in class workspace — see §38.                                                                                                                           |           |
| 31.5 | Delete blocked        | If mapped via `AssessmentStandardMapping`, 409 with "Mapped to N assessments" message.                                                                                           |           |

---

## 32. Gradebook Listing

**URL:** `/en/gradebook`

| #    | What to Check                             | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 32.1 | Page heading                              | `<h1>` **"Gradebook"**.                                                                                                                                                                  |           |
| 32.2 | Load sequence                             | Three parallel requests: `GET /api/v1/year-groups`, `GET /api/v1/classes?pageSize=100&status=active`, paginated `GET /api/v1/gradebook/assessments?pageSize=100&exclude_cancelled=true`. |           |
| 32.3 | Skeleton                                  | Two year-group section skeletons, each with 3 card skeletons.                                                                                                                            |           |
| 32.4 | Listing filter                            | Only classes with ≥ 1 non-cancelled assessment appear. Zero-assessment classes omitted.                                                                                                  |           |
| 32.5 | Admin sees all classes meeting the filter | For NHQS expect ≥ 12 classes distributed across year groups.                                                                                                                             |           |
| 32.6 | Empty state                               | If the filter yields zero classes: EmptyState with BookOpen icon: "No classes with assessments yet".                                                                                     |           |
| 32.7 | Benign 404                                | `GET /api/v1/gradebook/teaching-allocations` may 404 for admin — wrapped in `Promise.allSettled`, no red toast, no red console.                                                          |           |

---

## 33. Gradebook Listing — Year Group Sections & Class Cards

| #    | What to Check                  | Expected Result                                                                    | Pass/Fail |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------- | --------- |
| 33.1 | Section heading per year group | `<h2>` with year group name; `text-lg font-semibold`.                              |           |
| 33.2 | Section order                  | By year group `sort_order` ascending (Kindergarten first, Senior Foundation last). |           |
| 33.3 | Card per class                 | Card: class name, total assessments badge, open/closed split, arrow icon.          |           |
| 33.4 | Click card                     | Navigate to `/en/gradebook/{classId}`. Assessments tab is default.                 |           |
| 33.5 | Keyboard navigation            | Tab focuses cards in reading order; Enter navigates.                               |           |
| 33.6 | Mobile                         | Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Cards wrap.                      |           |

---

## 34. Class Gradebook Workspace — Layout & Tabs

**URL:** `/en/gradebook/{classId}`

| #    | What to Check              | Expected Result                                                                                                                | Pass/Fail |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 34.1 | Page heading               | `<h1>` = class name (e.g. "2A"). Subtitle: year group + academic year.                                                         |           |
| 34.2 | Tab bar                    | Three tabs: **Assessments** (default), **Results**, **Grades**. Keyboard arrow nav + aria-selected.                            |           |
| 34.3 | URL-backed tab             | `?tab=results`. Direct link opens on that tab.                                                                                 |           |
| 34.4 | Load order                 | `GET /api/v1/classes/{classId}` + `GET /api/v1/gradebook/classes/{classId}/allocations` + assessment paginated fetch all fire. |           |
| 34.5 | Admin-specific allocations | `getClassAllocations` returns every subject–teacher pairing in the class, NOT just the current user's.                         |           |
| 34.6 | No auto-collapse           | Admin view renders every subject group expanded by default (teacher view collapses non-owned subjects — see teacher spec §X).  |           |
| 34.7 | No row-dim                 | Admin sees every row at full opacity (teacher view dims non-owned).                                                            |           |
| 34.8 | Return button              | "← Back to Gradebook" button top-left. Returns to `/en/gradebook`.                                                             |           |

---

## 35. Class Gradebook — Assessments Tab (Grouped View)

| #    | What to Check          | Expected Result                                                                                                                              | Pass/Fail |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | Default view mode      | Grouped by subject. Expand/collapse arrow per group.                                                                                         |           |
| 35.2 | View toggle            | Top-right: **Grouped** / **Flat** toggle. Defaults Grouped.                                                                                  |           |
| 35.3 | Group header           | Subject name + assessment count + "+ New assessment" link-button (admin can act on any subject).                                             |           |
| 35.4 | Assessment row columns | **Title**, **Category**, **Period**, **Due date**, **Grading deadline**, **Max score**, **Status**, **Grades entered / total**, **Actions**. |           |
| 35.5 | Status pill            | Draft (gray), Open (blue), Closed (red), Submitted locked (green), Unlock requested (amber), Reopened (blue), Final locked (neutral).        |           |
| 35.6 | Row click              | Navigate to `/en/gradebook/{classId}/assessments/{assessmentId}/grades`.                                                                     |           |
| 35.7 | Row actions (admin)    | Edit, Duplicate, Cancel, Delete, Apply curve, Request unlock (not shown for admin since admin has `approve_unlock`), Override final.         |           |
| 35.8 | Cancelled assessments  | Excluded from grouped view (filter `exclude_cancelled=true`). Toggle "Show cancelled" brings them back (dim). See §18.                       |           |

---

## 36. Class Gradebook — Assessments Tab (Flat View)

| #    | What to Check    | Expected Result                                                                                                                   | Pass/Fail |
| ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Toggle to Flat   | Table renders as a single flat list, sortable by any column.                                                                      |           |
| 36.2 | Sort persistence | URL-backed `?sort=due_date&order=desc`.                                                                                           |           |
| 36.3 | Multi-select     | Checkbox per row + header checkbox. Bulk actions: Cancel, Delete, Export.                                                         |           |
| 36.4 | Bulk cancel      | Opens confirm modal listing selected titles. On confirm: sequential `POST /api/v1/gradebook/assessments/{id}/status` transitions. |           |

---

## 37. Class Gradebook — Subject Filter

| #    | What to Check    | Expected Result                                                                                   | Pass/Fail |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 37.1 | Subject dropdown | Top of Assessments tab. Options: "All subjects" + each subject with ≥ 1 assessment in this class. |           |
| 37.2 | Select a subject | Grouped / Flat view filters to that subject only.                                                 |           |
| 37.3 | URL              | `?subject={id}`.                                                                                  |           |
| 37.4 | Clear filter     | "All subjects" reverts.                                                                           |           |

---

## 38. Class Gradebook — Admin-Initiated New Assessment

| #    | What to Check                                          | Expected Result                                                                                                                                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 38.1 | **+ New assessment** button per subject (grouped view) | Click navigates to `/en/gradebook/{classId}/assessments/new?subject_id={subjectId}`.                                                                                                                                                                              |           |
| 38.2 | Top-level **+ New assessment** (flat view)             | Navigates to `/en/gradebook/{classId}/assessments/new` with blank subject prefill.                                                                                                                                                                                |           |
| 38.3 | Form fields                                            | Subject (prefilled, editable by admin), Period, Category (dropdown limited to approved categories for subject+year), Title (required, 2–200 chars), Max score (decimal, 0.01–1000), Due date, Grading deadline, Counts toward report card (toggle, default true). |           |
| 38.4 | Category options                                       | Pulled from `/api/v1/gradebook/assessment-categories?status=approved&subject_id=...&year_group_id=...`.                                                                                                                                                           |           |
| 38.5 | Grading deadline must be ≥ Due date                    | Client-side + server-side validation. Red error "Grading deadline must be on or after due date.".                                                                                                                                                                 |           |
| 38.6 | Submit success                                         | `POST /api/v1/gradebook/assessments` → 201. Toast green "Assessment created". Redirect to class workspace.                                                                                                                                                        |           |
| 38.7 | Status on create                                       | `draft`. Admin can immediately transition to `open` via status dropdown.                                                                                                                                                                                          |           |
| 38.8 | Rubric attach                                          | Optional "Attach rubric" dropdown with approved rubrics. On attach: `PUT /api/v1/gradebook/assessments/{id}/standards` maps standards.                                                                                                                            |           |
| 38.9 | Standards multi-select                                 | Optional. Lists approved curriculum standards filtered by subject+year. Submits via same endpoint.                                                                                                                                                                |           |

---

## 39. Class Gradebook — From-Template Popover

| #    | What to Check                    | Expected Result                                                                                                                                                            | Pass/Fail |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | "From template" secondary button | Opens popover listing assessment templates. `GET /api/v1/gradebook/assessment-templates`.                                                                                  |           |
| 39.2 | Select template → Create         | `POST /api/v1/gradebook/assessment-templates/{id}/create-assessment` with `{ class_id, subject_id, academic_period_id }`. 201. New assessment persists with template name. |           |
| 39.3 | Template has rubric              | New assessment auto-linked to rubric template.                                                                                                                             |           |
| 39.4 | Admin creates new template       | From configuration menu → creates template with criteria. Available to all teachers.                                                                                       |           |

---

## 40. Class Gradebook — Results Tab

| #     | What to Check           | Expected Result                                                                                                                                                           | Pass/Fail |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 40.1  | Results matrix load     | `GET /api/v1/gradebook/classes/{classId}/results-matrix?academic_period_id={id}`.                                                                                         |           |
| 40.2  | Layout                  | Row per student × column per assessment. Each cell: raw score / max, color-coded by threshold (red <50%, amber <75%, green ≥75%).                                         |           |
| 40.3  | Missing grade           | Empty cell with tooltip "Not yet graded".                                                                                                                                 |           |
| 40.4  | Excused                 | "E" badge.                                                                                                                                                                |           |
| 40.5  | All Periods pooled view | Toggle "All periods" → matrix expands to show all periods side-by-side.                                                                                                   |           |
| 40.6  | Export Excel            | Button → downloads `class-{name}-results.xlsx`. `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. `Content-Disposition: attachment`.     |           |
| 40.7  | Export PDF              | Button → downloads `class-{name}-results.pdf`. Server-rendered. Content inspection out-of-scope (see integration spec).                                                   |           |
| 40.8  | Save matrix (bulk edit) | Each cell editable inline. Save → `PUT /api/v1/gradebook/classes/{classId}/results-matrix` body `{ period_id, grades: [{ student_id, assessment_id, raw_score }, ...] }`. |           |
| 40.9  | Save with invalid score | 422 with detail list. Red toast, invalid cells outlined red.                                                                                                              |           |
| 40.10 | Coming Soon placeholder | If feature-flagged off (legacy), shows "Coming soon" empty state.                                                                                                         |           |

---

## 41. Class Gradebook — Grades Tab (Period Grades)

| #    | What to Check      | Expected Result                                                                                                              | Pass/Fail |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 41.1 | Filter bar         | **Subject** (required), **Period** (required, "All periods" option).                                                         |           |
| 41.2 | Load               | `GET /api/v1/gradebook/period-grades?class_id=&subject_id=&academic_period_id=`.                                             |           |
| 41.3 | Table columns      | **Student**, **Computed**, **Override**, **Final**, **Letter**, **GPA**, **Override reason**, **Actions**.                   |           |
| 41.4 | Decimal rendering  | Prisma Decimal `{ s, e, d }` normalised via `parseDecimal()`. Shown as 2-dp number (e.g. 78.50).                             |           |
| 41.5 | Letter grade       | Derived from tenant grading scale. Fallback "—".                                                                             |           |
| 41.6 | Override indicator | Cell outlined purple if `overridden_value IS NOT NULL`. Hover tooltip: "Overridden by {actor} on {date}. Reason: {reason}.". |           |

---

## 42. Grades Tab — Compute Grades Button

| #    | What to Check                                              | Expected Result                                                                                                                                                      | Pass/Fail |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1 | Button visible if admin or teacher with `gradebook.manage` | **Compute grades**.                                                                                                                                                  |           |
| 42.2 | Click                                                      | Confirmation modal: "Recompute grades for {N} students in {subject} / {period}? Existing overrides will be preserved.".                                              |           |
| 42.3 | Confirm                                                    | `POST /api/v1/gradebook/period-grades/compute` body `{ class_id, subject_id, academic_period_id }`. Returns updated snapshots.                                       |           |
| 42.4 | UI update                                                  | Table refreshes; Computed column reflects new values; Override column unchanged.                                                                                     |           |
| 42.5 | No approved weights                                        | Server returns 400 with `WEIGHTS_NOT_APPROVED`. Red toast "Approved grading weights required for {subject}.". Link to `/en/assessments/grading-weights?subject_id=`. |           |
| 42.6 | No open grades                                             | Server returns 200 with empty list. Toast info "No grades to compute.".                                                                                              |           |
| 42.7 | Partial grading                                            | Students with missing grades show Computed = `—`, with banner "X students have no grades yet.".                                                                      |           |
| 42.8 | Computation invariant                                      | `computed_value = Σ(grade_i × weight_i) / 100` for each student. See §75 for the invariant query.                                                                    |           |

---

## 43. Grades Tab — Override Dialog

| #    | What to Check                               | Expected Result                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 43.1 | Per-row **Override** action                 | Opens dialog. Fields: Override score (decimal, 0–max), Override letter (optional), Reason (required, min 10 chars).                    |           |
| 43.2 | Permission                                  | Requires `gradebook.override_final_grade`. Admin has it. Teachers do not (see teacher spec §X).                                        |           |
| 43.3 | Submit                                      | `POST /api/v1/gradebook/period-grades/{id}/override` body `{ overridden_value, override_reason }`. 200. Toast green "Override saved.". |           |
| 43.4 | Audit                                       | `override_actor_user_id = admin.id`, `override_reason`, `updated_at` updated. Verify in DB.                                            |           |
| 43.5 | Remove override                             | Separate action in the row menu: **Remove override**. Sets `overridden_value = NULL`, `override_reason = NULL`. Confirm modal.         |           |
| 43.6 | Override blocked if assessment locked final | If assessment status = `final_locked`, override still allowed (admin has ultimate authority). Teacher version would block.             |           |

---

## 44. Grade Entry Page — Layout

**URL:** `/en/gradebook/{classId}/assessments/{assessmentId}/grades`

| #    | What to Check                    | Expected Result                                                                                                | Pass/Fail |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 44.1 | Page heading                     | `<h1>` = assessment title. Subtitle: class name · subject · period.                                            |           |
| 44.2 | Info bar                         | Status badge, Due date, Grading deadline, Max score.                                                           |           |
| 44.3 | Grading window state             | Shows "Before due date" (info), "Pending grading" (warning), "Past deadline" (danger), or "Locked" (neutral).  |           |
| 44.4 | Student roster                   | `GET /api/v1/gradebook/assessments/{id}/grades` returns current grades + roster derived from class enrolments. |           |
| 44.5 | Grade entry row per student      | Columns: Student name + photo, Raw score input (decimal, 0–max), Is missing checkbox, Comment (optional).      |           |
| 44.6 | Rubric mode (if rubric attached) | Alternative view: per-criterion level selector. Computed score = Σ levels × criterion weights.                 |           |
| 44.7 | Absent / Excused handling        | "Is missing" checkbox sets `is_missing = true`, clears `raw_score`.                                            |           |

---

## 45. Grade Entry — Bulk Score Entry

| #    | What to Check          | Expected Result                                                                                              | Pass/Fail |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 45.1 | Paste from spreadsheet | Copy a column from Excel, paste into first score cell — cells populate row-by-row.                           |           |
| 45.2 | Tab key advances cell  | Tab moves focus to next row's score input (not next column), matching gradebook conventions.                 |           |
| 45.3 | Shift+Tab reverses     | Works.                                                                                                       |           |
| 45.4 | Save draft button      | `PUT /api/v1/gradebook/assessments/{id}/grades` with all currently-entered rows. Toast green "Draft saved.". |           |
| 45.5 | Score > max            | Inline red error "Exceeds max score ({max}).". Save button disabled until corrected.                         |           |
| 45.6 | Negative score         | Disallowed unless schema allows extra-credit flag.                                                           |           |

---

## 46. Grade Entry — Save & Submit Locks

| #    | What to Check          | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 46.1 | Submit & lock          | Button **Submit & lock**. Confirmation modal: "Lock grades? Teachers cannot edit without an unlock request.".                                 |           |
| 46.2 | Post-lock state        | `PATCH /api/v1/gradebook/assessments/{id}/status` with `{ status: 'submitted_locked' }`. Badge updates. Input fields become read-only (gray). |           |
| 46.3 | Admin override of lock | Admin still sees editable inputs (via `gradebook.manage`). Teachers would see read-only.                                                      |           |
| 46.4 | Final-lock             | Admin-only action. `status: 'final_locked'`. Irreversible via UI (only DB-level recovery).                                                    |           |

---

## 47. Grade Entry — Admin Override of Locked Assessment

| #    | What to Check                   | Expected Result                                                                                                                   | Pass/Fail |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 47.1 | Admin opens a locked assessment | Banner: "Locked — admin override active. Changes will be audit-logged.".                                                          |           |
| 47.2 | Admin edits a grade             | Input field editable. Save → `PUT /api/v1/gradebook/assessments/{id}/grades`. 200.                                                |           |
| 47.3 | Audit                           | `GradeEditAudit` row inserted with `old_raw_score`, `new_raw_score`, `edited_by_user_id = admin.id`, `reason` (dialog-collected). |           |
| 47.4 | Teacher visible                 | Log out admin. Log in as the teacher. Open the same grade. Shows admin's edit. Teacher cannot modify.                             |           |

---

## 48. Grade Curve Application

| #    | What to Check                                            | Expected Result                                                                                                         | Pass/Fail |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 48.1 | Row action **Apply curve** on an assessment (admin only) | Opens a dialog. Fields: Method (dropdown: Linear / Square root / Bell / Scaled), Parameters dynamic per method.         |           |
| 48.2 | Submit                                                   | `POST /api/v1/gradebook/assessments/{id}/curve` with body `{ method, params_json }`. 200. Toast green "Curve applied.". |           |
| 48.3 | Preview before apply                                     | Dialog renders a line chart showing raw vs. curved scores.                                                              |           |
| 48.4 | Audit trail                                              | `GradeCurveAudit` row created. History accessible via `GET /api/v1/gradebook/assessments/{id}/curve-history`.           |           |
| 48.5 | Remove curve                                             | `DELETE /api/v1/gradebook/assessments/{id}/curve`. Restores original raw_score.                                         |           |
| 48.6 | Permission                                               | Requires `gradebook.apply_curve` — admin only.                                                                          |           |

---

## 49. Grade Publishing — Readiness

**URL:** `/en/gradebook/publishing`

| #    | What to Check         | Expected Result                                                                                                                               | Pass/Fail |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 49.1 | Page heading          | `<h1>` **"Grade publishing"**.                                                                                                                |           |
| 49.2 | Readiness fetch       | `GET /api/v1/gradebook/publishing/readiness`. Returns per-period, per-subject readiness summary.                                              |           |
| 49.3 | Readiness table       | Rows: period / class / subject. Cells: locked assessments (M/N), computed (Y/N), missing weights (Y/N), missing standards (Y/N), ready (Y/N). |           |
| 49.4 | Not ready diagnostics | Click a not-ready cell → tooltip lists why: "Weights not approved for {subject}", "N assessments still open", etc.                            |           |

---

## 50. Grade Publishing — Publish Grades

| #    | What to Check             | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 50.1 | Publish Period button     | `POST /api/v1/gradebook/publishing/publish-period` with `{ academic_period_id }`. Returns `{ published: N, skipped: M, errors: [...] }`.               |           |
| 50.2 | Publish selected students | Checkbox rows in readiness matrix + "Publish selected" button. `POST /api/v1/gradebook/publishing/publish` with `{ student_ids, academic_period_id }`. |           |
| 50.3 | Post-publish              | Assessments' `grades_published_at` + `grades_published_by_user_id` set. Parent view surfaces grades.                                                   |           |
| 50.4 | Double-publish            | No duplicate rows; idempotent. Toast "Already published — updated timestamps.".                                                                        |           |
| 50.5 | Permission                | Requires `gradebook.publish_grades_to_parents` — admin only.                                                                                           |           |

---

## 51. Bulk Import — Template Download

**URL:** `/en/gradebook/import`

| #    | What to Check         | Expected Result                                                                                                              | Pass/Fail |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 51.1 | Download template     | Button → `GET /api/v1/gradebook/import/template?class_id=&period_id=`. Content-Type Excel. Filename includes class + period. |           |
| 51.2 | Template contents     | First row is header; subsequent rows pre-populated with student roster from class.                                           |           |
| 51.3 | Template localization | In Arabic locale, headers translated.                                                                                        |           |

---

## 52. Bulk Import — Validate & Process

| #    | What to Check            | Expected Result                                                                                                                              | Pass/Fail |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 52.1 | Upload `.xlsx` or `.csv` | `POST /api/v1/gradebook/import/validate` multipart. Response: `{ valid: true/false, issues: [{ row, column, message }] }`.                   |           |
| 52.2 | Validation UI            | Shows issues inline; preview table with each row colored green/yellow/red.                                                                   |           |
| 52.3 | Unknown student          | Row flagged "Student id not found in class".                                                                                                 |           |
| 52.4 | Score > max              | Row flagged.                                                                                                                                 |           |
| 52.5 | Process button           | Enabled only if `valid === true`. Click → `POST /api/v1/gradebook/import/process`. Enqueues `BULK_IMPORT_PROCESS_JOB`. Returns `{ job_id }`. |           |
| 52.6 | Job tracking             | Polls job status every 2s. Success banner when done.                                                                                         |           |
| 52.7 | Permission               | `gradebook.manage`. Teacher cannot access.                                                                                                   |           |

---

## 53. Weight Config — Subject Weights

**URL:** `/en/gradebook/weight-config`

| #    | What to Check         | Expected Result                                                                              | Pass/Fail |
| ---- | --------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 53.1 | Subject weights table | Columns: Subject, Weight per year level. Year levels are columns.                            |           |
| 53.2 | Load                  | `GET /api/v1/gradebook/weight-config/subject-weights?academic_year_id=&academic_period_id=`. |           |
| 53.3 | Edit inline           | Cells are number inputs.                                                                     |           |
| 53.4 | Sum validation        | Per year level column, total must equal 100%. Amber banner if off.                           |           |
| 53.5 | Save                  | `PUT /api/v1/gradebook/weight-config/subject-weights`. Toast green.                          |           |

---

## 54. Weight Config — Period Weights

| #    | What to Check        | Expected Result                                       | Pass/Fail |
| ---- | -------------------- | ----------------------------------------------------- | --------- |
| 54.1 | Period weights table | Columns: Period, Weight (%).                          |           |
| 54.2 | Sum validation       | Must equal 100%.                                      |           |
| 54.3 | Save                 | `PUT /api/v1/gradebook/weight-config/period-weights`. |           |

---

## 55. Weight Config — Propagate to Classes

| #    | What to Check                        | Expected Result                                                                                                           | Pass/Fail           |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------- | --- |
| 55.1 | **Propagate subject weights** button | Confirmation: "Apply these weights to all classes in the year? Existing class-level overrides will be preserved.".        |                     |
| 55.2 | Confirm                              | `POST /api/v1/gradebook/weight-config/subject-weights/propagate` with `{ academic_year_id, strategy: 'preserve_overrides' | 'overwrite_all' }`. |     |
| 55.3 | Result                               | Response shows `{ classes_updated, overrides_preserved }`. Toast green.                                                   |                     |
| 55.4 | Period weights propagate             | Same pattern via `/period-weights/propagate`.                                                                             |                     |

---

## 56. Analytics Page — Class Selector

**URL:** `/en/analytics`

| #    | What to Check                   | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 56.1 | Page heading                    | `<h1>` **"Analytics"** with BarChart2 icon in `text-primary-600`.                                                                             |           |
| 56.2 | Class selector (Select)         | Width `w-full sm:w-56`. Placeholder: "Select a class".                                                                                        |           |
| 56.3 | Options                         | Populated from `GET /api/v1/classes?pageSize=100&status=active`. Alphabetical.                                                                |           |
| 56.4 | Admin sees all active classes   | For NHQS: 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B, 6A, 6B, J1A, K1A, K1B, SF1A. Equal to every active class in the tenant (tenant-scoped RLS). |           |
| 56.5 | Empty state (no class selected) | Centred BarChart2 icon + "Select a class to view grade analytics.".                                                                           |           |
| 56.6 | Select a class                  | AnalyticsTab mounts with `key={classId}`. Filter state resets.                                                                                |           |

---

## 57. Analytics — Filter Bar (Period, Subject, Student)

| #    | What to Check                         | Expected Result                                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 57.1 | **Period** dropdown                   | Placeholder "Period". Options "All Periods" + each academic period in the class's year. Source: `/api/v1/academic-periods?academic_year_id={yearId}`. |           |
| 57.2 | Empty period                          | Body shows "Select a period to view analytics.".                                                                                                      |           |
| 57.3 | **Subject** dropdown (mode-dependent) | Shown in Subject Deep Dive mode only. Populated from allocations for the class.                                                                       |           |
| 57.4 | **Student** dropdown                  | Shown in Student Profile mode. Populated from class enrolments.                                                                                       |           |
| 57.5 | View mode selector                    | Tabs: **Class Overview** (default), **Subject Deep Dive**, **Student Profile**.                                                                       |           |

---

## 58. Analytics — Class Overview Mode

| #    | What to Check             | Expected Result                                                                                                              | Pass/Fail |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 58.1 | Stats row                 | Cards: Class average, Median, Std. dev., Pass rate, Min, Max. Values from `/api/v1/gradebook/analytics/period-distribution`. |           |
| 58.2 | Grade distribution chart  | Bar chart. X axis: grade buckets (A, B, C, D, F or similar). Y axis: student count. Tooltip on hover with exact count.       |           |
| 58.3 | Average score by subject  | Horizontal bar chart, one bar per subject, color-coded by threshold.                                                         |           |
| 58.4 | Top 5 / Bottom 5 students | Two side-by-side cards listing 5 students each with avatar, score, rank.                                                     |           |
| 58.5 | Full rankings table       | Expandable table. Columns: Rank, Name, Score, GPA, Letter.                                                                   |           |
| 58.6 | Export PDF                | Button downloads `analytics-{class}-{period}.pdf`.                                                                           |           |

---

## 59. Analytics — Subject Deep Dive

| #    | What to Check                 | Expected Result                                                                                                                             | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 59.1 | Subject selector              | Dropdown.                                                                                                                                   |           |
| 59.2 | Assessment-level distribution | Bar chart per assessment for the class+subject+period. Click a bar → drills into `/api/v1/gradebook/analytics/distribution/{assessmentId}`. |           |
| 59.3 | Class trend over time         | Line chart showing class average per assessment chronologically.                                                                            |           |
| 59.4 | Teacher consistency           | Box plot. Source: `/api/v1/gradebook/analytics/teacher-consistency?class_id=&subject_id=`. Admin-only view.                                 |           |
| 59.5 | Benchmark                     | Side-by-side comparison: this class vs. school average vs. historical. `/api/v1/gradebook/analytics/benchmark`.                             |           |

---

## 60. Analytics — Student Profile

| #    | What to Check      | Expected Result                                                                              | Pass/Fail |
| ---- | ------------------ | -------------------------------------------------------------------------------------------- | --------- |
| 60.1 | Student selector   | Dropdown.                                                                                    |           |
| 60.2 | Header             | Avatar, name, class, year group.                                                             |           |
| 60.3 | GPA                | `/api/v1/gradebook/students/{studentId}/gpa`. Rendered as `3.25` (2-dp).                     |           |
| 60.4 | Per-subject grades | Table: Subject, Period, Computed, Override, Final, Letter.                                   |           |
| 60.5 | Trend line         | `/api/v1/gradebook/analytics/students/{studentId}/trend`. Line chart per subject, overlayed. |           |

---

## 61. Analytics — Radar Chart & Strengths

| #    | What to Check         | Expected Result                                                                                                                              | Pass/Fail |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 61.1 | Radar chart           | One axis per subject. Shows student's score vs. class average.                                                                               |           |
| 61.2 | Strengths             | Subjects in top quartile — green badges.                                                                                                     |           |
| 61.3 | Areas for improvement | Subjects in bottom quartile — amber badges.                                                                                                  |           |
| 61.4 | Competency snapshots  | `/api/v1/gradebook/students/{studentId}/competency-snapshots`. Per-scale panel. Each competency shows "Proficient / Developing / Beginning". |           |
| 61.5 | Grade summary table   | Sticky header. Sort by column.                                                                                                               |           |

---

## 62. Analytics — All Periods (Year Overview)

| #    | What to Check                        | Expected Result                                                              | Pass/Fail |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------- | --------- |
| 62.1 | Period dropdown set to "All Periods" | Mode switches to year overview.                                              |           |
| 62.2 | Data source                          | `/api/v1/gradebook/period-grades/year-overview?class_id=&academic_year_id=`. |           |
| 62.3 | Layout                               | Matrix: student × period × subject. Heatmap.                                 |           |
| 62.4 | Click a cell                         | Drills into the specific period + subject view for that student.             |           |

---

## 63. Analytics Insights Dashboard

**URL:** `/en/gradebook/insights`

| #    | What to Check      | Expected Result                                                                                           | Pass/Fail |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------- | --------- |
| 63.1 | Aggregate insights | Cards: "At-risk students", "Highest improvers", "Grade inflation alerts", "Teacher consistency outliers". |           |
| 63.2 | Data source        | `/api/v1/gradebook/analytics/...` various endpoints + `GRADEBOOK_DETECT_RISKS_JOB` output stored in DB.   |           |
| 63.3 | Drill through      | Each card → detail page or filtered list.                                                                 |           |

---

## 64. AI Features — Comment Generation

**URL:** `/en/gradebook/ai`

| #    | What to Check                      | Expected Result                                                                                                                           | Pass/Fail |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 64.1 | Page heading                       | `<h1>` **"AI Grading Assistant"**.                                                                                                        |           |
| 64.2 | Generate single comment            | For a selected report card, click **Generate** → `POST /api/v1/gradebook/ai/generate-comment/{reportCardId}`. Returns draft comment text. |           |
| 64.3 | Bulk generate                      | **Bulk generate** → `POST /api/v1/gradebook/ai/generate-comments` with `{ report_card_ids: [...] }`. Returns per-card drafts.             |           |
| 64.4 | Draft visible as editable textarea | Admin can tweak before committing.                                                                                                        |           |
| 64.5 | Commit                             | "Use draft" → `POST /api/v1/report-cards/overall-comments` or `subject-comments`.                                                         |           |
| 64.6 | Permission                         | `gradebook.enter_grades` (admin has it).                                                                                                  |           |

---

## 65. AI Features — Grading Instructions

**URL:** `/en/gradebook/ai-instructions`

| #    | What to Check     | Expected Result                                                                                           | Pass/Fail |
| ---- | ----------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 65.1 | List instructions | `GET /api/v1/gradebook/ai/grading-instructions`.                                                          |           |
| 65.2 | Create            | `POST` with `{ scope, instruction_text }`. Status: draft.                                                 |           |
| 65.3 | Approve           | `POST /ai/grading-instructions/{id}/approve`. Status → approved. Requires `gradebook.approve_ai_grading`. |           |
| 65.4 | Delete            | `DELETE`. Requires `gradebook.manage_ai_grading`.                                                         |           |

---

## 66. AI Features — Natural Language Query

| #    | What to Check    | Expected Result                                                                                    | Pass/Fail |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 66.1 | Query box        | **"Ask analytics"** input at top of Insights page.                                                 |           |
| 66.2 | Example queries  | "Show me the top 5 failing students in Year 10", "Average GPA by subject this semester".           |           |
| 66.3 | Submit           | `POST /api/v1/gradebook/ai/query` with `{ query: "..." }`. Returns `{ result, sql, explanation }`. |           |
| 66.4 | Result rendering | Table or chart depending on shape.                                                                 |           |
| 66.5 | Query history    | `GET /api/v1/gradebook/ai/query/history`. User-scoped.                                             |           |
| 66.6 | Dangerous query  | Queries that would mutate data are rejected server-side. UI shows "Read-only queries only.".       |           |
| 66.7 | Permission       | `gradebook.view_analytics`.                                                                        |           |

---

## 67. Progress Reports — Create & Send

**URL:** `/en/gradebook/progress-reports`

| #    | What to Check     | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 67.1 | List              | `GET /api/v1/gradebook/progress-reports`. Table columns: Name, Class, Period, Created by, Status (draft/sent/archived), Sent at, Actions.                |           |
| 67.2 | Create new        | **+ New progress report** → dialog. Fields: Name, Class, Period. Submit → `POST`.                                                                        |           |
| 67.3 | Per-student entry | Clicking a report → entry page listing every student. Each entry: comment textarea. Save → `PATCH /api/v1/gradebook/progress-reports/entries/{entryId}`. |           |
| 67.4 | Send              | **Send to parents** → confirm dialog. `POST /api/v1/gradebook/progress-reports/send`. Status → sent. Parents receive notifications.                      |           |
| 67.5 | Permission        | `gradebook.manage`.                                                                                                                                      |           |

---

## 68. Unlock Request Workflow — Admin Side

| #    | What to Check                                               | Expected Result                                                                                                                       | Pass/Fail |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 68.1 | Seed an unlock request (use teacher account in another tab) | Teacher submits via `POST /api/v1/gradebook/assessments/{id}/unlock-request`. Admin approvals page shows it.                          |           |
| 68.2 | Admin approves                                              | Assessment transitions `submitted_locked → reopened`. Teacher re-enters grades. Subsequent lock places into `submitted_locked` again. |           |
| 68.3 | Admin rejects                                               | Assessment remains `submitted_locked`. Teacher notified.                                                                              |           |
| 68.4 | Multiple requests for same assessment                       | Server accepts only one pending at a time. Second submission: 409 "An unlock request is already pending for this assessment.".        |           |
| 68.5 | Audit                                                       | `AssessmentUnlockRequest.reviewed_by_user_id`, `reviewed_at`, `rejection_reason` set accordingly.                                     |           |

---

## 69. Cross-Module Hand-Offs

| #    | What to Check             | Expected Result                                                                                                                                                                  | Pass/Fail |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 69.1 | Report Cards handoff      | Jump to `/en/report-cards`. Out of scope for this spec except to confirm the link works.                                                                                         |           |
| 69.2 | Curriculum Matrix handoff | Jump to `/en/curriculum`. Out of scope.                                                                                                                                          |           |
| 69.3 | Notifications             | When admin approves a config or unlock, a `gradebook:config-approved` / `gradebook:unlock-approved` event fires to CommunicationsService → recipient sees an inbox notification. |           |
| 69.4 | GDPR DSAR                 | When admin triggers a student's DSAR export (via GDPR module), gradebook data is included. Out of scope for behaviour but link surface verified.                                 |           |
| 69.5 | Early Warning             | At-risk students surfaced on the Wellbeing > Early Warning page consume gradebook signals. Link from gradebook insights → early warning list works.                              |           |

---

## 70. Negative Assertions — What Admin Must Still NOT Do

| #    | What to Check                                                                                                      | Expected Result                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------- |
| 70.1 | Admin must NOT see Tenant B data. Paste a Tenant B class UUID into `/en/gradebook/{classB.id}`.                    | Browser shows 404 OR empty state. Never Tenant B's data.                                 |           |
| 70.2 | Admin must NOT see a parent-only view. Paste `/api/v1/parent/students/{sid}/grades` into Network tab via DevTools. | 403 — admin lacks `parent.view_grades`.                                                  |           |
| 70.3 | Admin must NOT bypass weight sum constraint even via direct API.                                                   | 422 from `POST /api/v1/gradebook/teacher-grading-weights` if weights don't sum to 100.   |           |
| 70.4 | Admin must NOT see a transcript for a student outside their tenant.                                                | 404 / RLS denial.                                                                        |           |
| 70.5 | Admin must NOT be able to final-lock then edit grades without the `GradeEditAudit` trail.                          | Any edit to final-locked assessment leaves an audit row.                                 |           |
| 70.6 | Admin must NOT see raw AI grading instruction secrets (OpenAI API keys).                                           | Response truncates any secret fields to last 4 chars. No API key visible in Network tab. |           |
| 70.7 | Direct-navigate to `/en/gradebook/{tenantB.classId}`                                                               | 404 or redirect to tenant's own gradebook listing. NOT 200 with Tenant B data.           |           |

---

## 71. Error, Loading, Empty States

| #    | What to Check               | Expected Result                                                                                                           | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 71.1 | Loading skeletons           | Every page shows skeleton during initial fetch. No white-flash.                                                           |           |
| 71.2 | Empty states                | Every list page has an EmptyState when filtered-out or no data.                                                           |           |
| 71.3 | 500 from server             | Full-page error with "Something went wrong — retry." button. No stack trace to end user.                                  |           |
| 71.4 | Network disconnect mid-save | Red toast "Network error — retry.". Form state preserved.                                                                 |           |
| 71.5 | 401 after session expiry    | `/api/v1/auth/refresh` silently fires; if refresh fails, redirects to login. Not-yet-saved form data WARNS before logout. |           |
| 71.6 | 403                         | Red toast "You don't have permission to do this.".                                                                        |           |
| 71.7 | 404                         | Full-page or inline "Not found".                                                                                          |           |
| 71.8 | 422 validation              | Inline field errors OR red toast with summary.                                                                            |           |

---

## 72. Arabic / RTL

| #     | What to Check                             | Expected Result                                                                                                                         | Pass/Fail |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 72.1  | Switch to Arabic                          | URL becomes `/ar/...`. `<html dir="rtl">`. Morph bar mirrors. Sub-strip mirrors.                                                        |           |
| 72.2  | KPI cards                                 | Card icon moves to the right. Number sits in correct visual position. No overlap.                                                       |           |
| 72.3  | Tables                                    | Column headers mirror. Sort chevron mirrors.                                                                                            |           |
| 72.4  | Grade cells                               | Numeric grades wrapped in `<span dir="ltr">` so "78.5" reads left-to-right even in RTL layout.                                          |           |
| 72.5  | Standard codes                            | Monospace `<span dir="ltr">` so `MATH-10-A-1` reads correctly.                                                                          |           |
| 72.6  | Weight inputs                             | Number inputs are `dir="ltr"`.                                                                                                          |           |
| 72.7  | Dates                                     | Gregorian calendar. Latin digits. Format adapts (e.g. `12 أبريل 2026`).                                                                 |           |
| 72.8  | Back-arrow icon                           | Has `rtl:rotate-180` so the arrow points the correct way.                                                                               |           |
| 72.9  | Logical CSS                               | Zero `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`. Only `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`. Lint will catch violations.      |           |
| 72.10 | All translation keys present in `ar.json` | No raw English strings visible in the UI in Arabic locale. If a translation is missing, key falls back to English — flag this as a bug. |           |

---

## 73. Console & Network Health

| #    | What to Check                                       | Expected Result                                                                                  | Pass/Fail |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 73.1 | Zero uncaught errors                                | Full walkthrough logs zero red errors.                                                           |           |
| 73.2 | Deliberate 404 on `/gradebook/teaching-allocations` | Admin only — benign, wrapped in allSettled. Not red-logged.                                      |           |
| 73.3 | No 429                                              | Navigating quickly doesn't hit rate limits.                                                      |           |
| 73.4 | Polling cadence                                     | Zero polling on dashboard. On bulk-import process page: 2s polling for job status. Nowhere else. |           |
| 73.5 | Websocket traffic                                   | None on admin shell.                                                                             |           |

---

## 74. Mobile Responsiveness (375px)

| #     | What to Check               | Expected Result                                                        | Pass/Fail |
| ----- | --------------------------- | ---------------------------------------------------------------------- | --------- |
| 74.1  | Morph bar                   | Collapses to hamburger overlay. Tap opens side drawer with all 9 hubs. |           |
| 74.2  | Assessment sub-strip        | Horizontally scrollable; fade affordance at the end.                   |           |
| 74.3  | KPI cards                   | Stack 1-column; swipeable.                                             |           |
| 74.4  | Approval queue tables       | Hidden; replaced by stacked cards.                                     |           |
| 74.5  | Forms                       | Inputs full-width; 16px+ font-size to avoid iOS auto-zoom.             |           |
| 74.6  | Gradebook cards grid        | 1 column.                                                              |           |
| 74.7  | Results matrix              | Horizontal scroll + sticky first column.                               |           |
| 74.8  | Analytics charts            | Chart widths respect container; labels rotate if too dense.            |           |
| 74.9  | Touch targets               | Every interactive element ≥ 44×44px.                                   |           |
| 74.10 | No horizontal page overflow | Body has `overflow-x-hidden`; content `min-w-0`.                       |           |

---

## 75. Data Invariants

Each invariant is an SQL query (or API read) that must hold AFTER the specified flow. Run manually or via `psql`. Tolerance noted per invariant.

| #     | Flow                                              | Invariant                                                                                                                                                                                      | Expected result                                      | Pass/Fail |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 75.1  | After creating an assessment                      | `SELECT tenant_id FROM assessments WHERE id = ?`                                                                                                                                               | tenant_id = current admin's tenant_id                |           |
| 75.2  | After creating assessment                         | `SELECT status FROM assessments WHERE id = ?`                                                                                                                                                  | `'draft'`                                            |           |
| 75.3  | After transitioning assessment to `open`          | `SELECT status, grading_deadline >= due_date AS ok FROM assessments WHERE id = ?`                                                                                                              | `status='open'`, `ok=true`                           |           |
| 75.4  | After bulk grade save                             | `SELECT COUNT(*) FROM grades WHERE assessment_id = ? AND raw_score IS NOT NULL` equals the number of non-empty inputs submitted.                                                               | Exact match                                          |           |
| 75.5  | After computing period grades                     | For each `PeriodGradeSnapshot`: `computed_value = SUM(grade.raw_score / assessment.max_score × category_weight) × 100` (weights from teacher grading weight or year-group weight).             | Per-row tolerance ±0.01                              |           |
| 75.6  | After override                                    | `SELECT override_actor_user_id, override_reason, overridden_value FROM period_grade_snapshots WHERE id = ?`                                                                                    | `override_actor_user_id = admin.id`, reason non-null |           |
| 75.7  | After removing override                           | `SELECT overridden_value FROM period_grade_snapshots WHERE id = ?`                                                                                                                             | NULL                                                 |           |
| 75.8  | After approving a config                          | `SELECT status, reviewed_by, reviewed_at FROM assessment_categories WHERE id = ?` (and sibling tables for weights/rubrics/standards)                                                           | `status='approved'`, reviewed_by/at set              |           |
| 75.9  | After rejecting a config                          | `SELECT rejection_reason FROM assessment_categories WHERE id = ?`                                                                                                                              | non-empty string                                     |           |
| 75.10 | After approving unlock                            | `SELECT status FROM assessments WHERE id = request.assessment_id`                                                                                                                              | `'reopened'`                                         |           |
| 75.11 | After curve applied                               | `SELECT COUNT(*) FROM grade_curve_audit WHERE assessment_id = ?`                                                                                                                               | ≥ 1                                                  |           |
| 75.12 | After curve removed                               | `SELECT curve_applied, curve_params_json FROM assessments WHERE id = ?`                                                                                                                        | `curve_applied='none'`, json is NULL                 |           |
| 75.13 | After publishing a period                         | `SELECT COUNT(*) FROM assessments WHERE academic_period_id = ? AND grades_published_at IS NOT NULL` = count of assessments flagged `counts_toward_report_card=true`                            | Exact match                                          |           |
| 75.14 | After bulk import                                 | `SELECT COUNT(*) FROM grades WHERE assessment_id = ? AND tenant_id = ? AND edited_by_user_id = admin.id` equals rows in the import file.                                                       | Exact match                                          |           |
| 75.15 | No orphan AssessmentStandardMapping               | `SELECT COUNT(*) FROM assessment_standard_mappings m LEFT JOIN assessments a ON m.assessment_id = a.id WHERE a.id IS NULL`                                                                     | 0                                                    |           |
| 75.16 | No orphan grades                                  | `SELECT COUNT(*) FROM grades g LEFT JOIN assessments a ON g.assessment_id = a.id WHERE a.id IS NULL`                                                                                           | 0                                                    |           |
| 75.17 | Tenant invariant on every new row                 | `SELECT DISTINCT tenant_id FROM (SELECT tenant_id FROM assessments WHERE id IN (just-created) UNION ALL ...)`                                                                                  | Exactly one tenant_id = current admin                |           |
| 75.18 | Unlock request uniqueness                         | `SELECT COUNT(*) FROM assessment_unlock_requests WHERE assessment_id = ? AND status = 'pending'`                                                                                               | ≤ 1                                                  |           |
| 75.19 | GradeEditAudit completeness                       | For every UPDATE of `grades.raw_score` during the admin walkthrough: a corresponding row in `grade_edit_audit` exists with `old_raw_score` and `new_raw_score`.                                | 1:1 correspondence                                   |           |
| 75.20 | No grades outside the grading window UNLESS admin | `SELECT * FROM grade_edit_audit WHERE edited_at < (SELECT due_date FROM assessments WHERE id = grade.assessment_id)` should be empty except for rows where `edited_by_user_id` has admin role. | Only admin rows                                      |           |

---

## 76. Backend Endpoint Map

Every endpoint the admin UI hits during the walkthrough.

| Endpoint                                                              | Method                      | Permission                                   | Exercised in | Notes                            |
| --------------------------------------------------------------------- | --------------------------- | -------------------------------------------- | ------------ | -------------------------------- |
| /api/v1/auth/login                                                    | POST                        | —                                            | §3.3         | JWT                              |
| /api/v1/auth/refresh                                                  | POST                        | —                                            | §16.4        | cookie                           |
| /api/v1/gradebook/teaching-allocations/all                            | GET                         | gradebook.manage                             | §6.3         | admin-only                       |
| /api/v1/gradebook/teaching-allocations                                | GET                         | gradebook.view                               | §32.7        | benign 404 for admin             |
| /api/v1/gradebook/classes/{classId}/allocations                       | GET                         | gradebook.view                               | §34.4        |                                  |
| /api/v1/gradebook/classes/{classId}/subjects/{subjectId}/grade-config | PUT / GET / DELETE          | gradebook.manage / gradebook.view            | class config |                                  |
| /api/v1/gradebook/assessments                                         | GET                         | gradebook.view                               | §6.3, §32.2  | paginated                        |
| /api/v1/gradebook/assessments                                         | POST                        | gradebook.enter_grades                       | §38          |                                  |
| /api/v1/gradebook/assessments/{id}                                    | GET                         | gradebook.view                               | §34, §35     |                                  |
| /api/v1/gradebook/assessments/{id}                                    | PATCH                       | gradebook.enter_grades                       | §35, §38     |                                  |
| /api/v1/gradebook/assessments/{id}/status                             | PATCH                       | gradebook.enter_grades                       | §46          |                                  |
| /api/v1/gradebook/assessments/{id}/duplicate                          | POST                        | gradebook.enter_grades                       | §35          |                                  |
| /api/v1/gradebook/assessments/{id}                                    | DELETE                      | gradebook.manage                             | §35          |                                  |
| /api/v1/gradebook/assessments/{assessmentId}/grades                   | PUT                         | gradebook.enter_grades                       | §45, §47     |                                  |
| /api/v1/gradebook/assessments/{assessmentId}/grades                   | GET                         | gradebook.view                               | §44          |                                  |
| /api/v1/gradebook/period-grades/compute                               | POST                        | gradebook.manage                             | §42          |                                  |
| /api/v1/gradebook/period-grades                                       | GET                         | gradebook.view                               | §41          |                                  |
| /api/v1/gradebook/students/{studentId}/period-grades                  | GET                         | gradebook.view                               | §60          |                                  |
| /api/v1/gradebook/period-grades/{id}/override                         | POST                        | gradebook.override_final_grade               | §43          |                                  |
| /api/v1/gradebook/period-grades/cross-subject                         | GET                         | gradebook.view                               | §58          |                                  |
| /api/v1/gradebook/period-grades/cross-period                          | GET                         | gradebook.view                               | §59          |                                  |
| /api/v1/gradebook/period-grades/year-overview                         | GET                         | gradebook.view                               | §62          |                                  |
| /api/v1/gradebook/classes/{classId}/results-matrix                    | GET / PUT                   | gradebook.view / gradebook.enter_grades      | §40          |                                  |
| /api/v1/gradebook/year-group-weights                                  | PUT / GET                   | gradebook.manage / gradebook.view            | weights      |                                  |
| /api/v1/gradebook/year-group-weights/copy                             | POST                        | gradebook.manage                             | weights      |                                  |
| /api/v1/gradebook/teacher-grading-weights                             | POST / GET                  | gradebook.manage_own_config / gradebook.view | §24, §25     |                                  |
| /api/v1/gradebook/teacher-grading-weights/{id}                        | GET / PATCH / DELETE        | gradebook.view / gradebook.manage_own_config | §25          |                                  |
| /api/v1/gradebook/teacher-grading-weights/{id}/submit                 | POST                        | gradebook.manage_own_config                  | §23, §25     |                                  |
| /api/v1/gradebook/teacher-grading-weights/{id}/review                 | POST                        | gradebook.approve_config                     | §18, §20     |                                  |
| /api/v1/gradebook/assessments/{id}/unlock-request                     | POST                        | gradebook.request_unlock                     | §68          | teacher-initiated                |
| /api/v1/gradebook/unlock-requests                                     | GET                         | gradebook.approve_unlock                     | §17, §19     |                                  |
| /api/v1/gradebook/assessments/{id}/unlock-requests                    | GET                         | gradebook.view                               | §19          |                                  |
| /api/v1/gradebook/unlock-requests/{id}/review                         | POST                        | gradebook.approve_unlock                     | §19, §68     |                                  |
| /api/v1/gradebook/import/template                                     | GET                         | gradebook.manage                             | §51          |                                  |
| /api/v1/gradebook/import/validate                                     | POST                        | gradebook.manage                             | §52          | multipart                        |
| /api/v1/gradebook/import/process                                      | POST                        | gradebook.manage                             | §52          | enqueues BULK_IMPORT_PROCESS_JOB |
| /api/v1/gradebook/weight-config/subject-weights                       | GET / PUT                   | gradebook.manage                             | §53          |                                  |
| /api/v1/gradebook/weight-config/period-weights                        | GET / PUT                   | gradebook.manage                             | §54          |                                  |
| /api/v1/gradebook/weight-config/subject-weights/propagate             | POST                        | gradebook.manage                             | §55          |                                  |
| /api/v1/gradebook/weight-config/period-weights/propagate              | POST                        | gradebook.manage                             | §55          |                                  |
| /api/v1/gradebook/rubric-templates                                    | POST / GET                  | gradebook.manage / gradebook.view            | §27, §28     |                                  |
| /api/v1/gradebook/rubric-templates/{id}                               | GET / PATCH / DELETE        | gradebook.view / gradebook.manage            | §28, §29     |                                  |
| /api/v1/gradebook/rubric-templates/{id}/submit                        | POST                        | gradebook.manage_own_config                  | §28          |                                  |
| /api/v1/gradebook/rubric-templates/{id}/review                        | POST                        | gradebook.approve_config                     | §18          |                                  |
| /api/v1/gradebook/grades/{gradeId}/rubric-grades                      | POST                        | gradebook.enter_grades                       | §44          |                                  |
| /api/v1/gradebook/curriculum-standards                                | POST / GET                  | gradebook.manage / gradebook.view            | §30, §31     |                                  |
| /api/v1/gradebook/curriculum-standards/{id}                           | DELETE                      | gradebook.manage                             | §31          |                                  |
| /api/v1/gradebook/curriculum-standards/import                         | POST                        | gradebook.manage                             | §30.4        |                                  |
| /api/v1/gradebook/assessments/{id}/standards                          | PUT                         | gradebook.enter_grades                       | §38          |                                  |
| /api/v1/gradebook/curriculum-standards/{id}/submit                    | POST                        | gradebook.manage_own_config                  | §31          |                                  |
| /api/v1/gradebook/curriculum-standards/{id}/review                    | POST                        | gradebook.approve_config                     | §18          |                                  |
| /api/v1/gradebook/students/{studentId}/competency-snapshots           | GET                         | gradebook.view                               | §61          |                                  |
| /api/v1/gradebook/competency-scales                                   | POST / GET                  | gradebook.manage / gradebook.view            | competency   |                                  |
| /api/v1/gradebook/competency-scales/{id}                              | GET / PATCH / DELETE        | gradebook.view / gradebook.manage            | competency   |                                  |
| /api/v1/gradebook/students/{studentId}/gpa                            | GET                         | gradebook.view                               | §60          |                                  |
| /api/v1/gradebook/period-grades/compute-gpa                           | POST                        | gradebook.manage                             | admin tools  |                                  |
| /api/v1/gradebook/assessments/{id}/curve                              | POST / DELETE               | gradebook.apply_curve                        | §48          |                                  |
| /api/v1/gradebook/assessments/{id}/curve-history                      | GET                         | gradebook.view                               | §48          |                                  |
| /api/v1/gradebook/assessment-templates                                | POST / GET                  | gradebook.manage / gradebook.view            | §39          |                                  |
| /api/v1/gradebook/assessment-templates/{id}                           | GET / PATCH / DELETE        | gradebook.view / gradebook.manage            | §39          |                                  |
| /api/v1/gradebook/assessment-templates/{id}/create-assessment         | POST                        | gradebook.enter_grades                       | §39          |                                  |
| /api/v1/gradebook/assessments/{id}/default-grade                      | POST                        | gradebook.enter_grades                       | admin tools  |                                  |
| /api/v1/gradebook/assessment-categories                               | POST / GET                  | gradebook.manage / gradebook.view            | §21, §22     |                                  |
| /api/v1/gradebook/assessment-categories/{id}                          | GET / PATCH / DELETE        | gradebook.view / gradebook.manage            | §22, §23     |                                  |
| /api/v1/gradebook/assessment-categories/{id}/submit                   | POST                        | gradebook.manage_own_config                  | §23          |                                  |
| /api/v1/gradebook/assessment-categories/{id}/review                   | POST                        | gradebook.approve_config                     | §18          |                                  |
| /api/v1/gradebook/grading-scales                                      | POST / GET / PATCH / DELETE | gradebook.manage / gradebook.view            | config       |                                  |
| /api/v1/gradebook/analytics/distribution/{assessmentId}               | GET                         | gradebook.view_analytics                     | §59          |                                  |
| /api/v1/gradebook/analytics/period-distribution                       | GET                         | gradebook.view_analytics                     | §58          |                                  |
| /api/v1/gradebook/analytics/students/{studentId}/trend                | GET                         | gradebook.view                               | §60, §61     |                                  |
| /api/v1/gradebook/analytics/classes/{classId}/trend                   | GET                         | gradebook.view_analytics                     | §59          |                                  |
| /api/v1/gradebook/analytics/teacher-consistency                       | GET                         | gradebook.view_analytics                     | §59          |                                  |
| /api/v1/gradebook/analytics/benchmark                                 | GET                         | gradebook.view_analytics                     | §59          |                                  |
| /api/v1/gradebook/ai/generate-comment/{reportCardId}                  | POST                        | gradebook.enter_grades                       | §64          |                                  |
| /api/v1/gradebook/ai/generate-comments                                | POST                        | gradebook.enter_grades                       | §64          |                                  |
| /api/v1/gradebook/ai/grade-inline                                     | POST                        | gradebook.enter_grades                       | §64          |                                  |
| /api/v1/gradebook/ai/grading-instructions                             | POST / GET                  | gradebook.manage_ai_grading / gradebook.view | §65          |                                  |
| /api/v1/gradebook/ai/grading-instructions/{id}                        | GET / DELETE                | gradebook.view / gradebook.manage_ai_grading | §65          |                                  |
| /api/v1/gradebook/ai/grading-instructions/{id}/approve                | POST                        | gradebook.approve_ai_grading                 | §65          |                                  |
| /api/v1/gradebook/ai/grading-references                               | POST                        | gradebook.manage_ai_grading                  | AI tools     |                                  |
| /api/v1/gradebook/ai/grading-references/{assessmentId}                | GET                         | gradebook.view                               | AI tools     |                                  |
| /api/v1/gradebook/ai/grading-references/{id}/approve                  | POST                        | gradebook.approve_ai_grading                 | AI tools     |                                  |
| /api/v1/gradebook/ai/grading-references/{id}                          | DELETE                      | gradebook.manage_ai_grading                  | AI tools     |                                  |
| /api/v1/gradebook/ai/query                                            | POST                        | gradebook.view_analytics                     | §66          |                                  |
| /api/v1/gradebook/ai/query/history                                    | GET                         | gradebook.view_analytics                     | §66          |                                  |
| /api/v1/gradebook/ai/progress-summary                                 | GET                         | gradebook.view                               | AI tools     |                                  |
| /api/v1/gradebook/publishing/readiness                                | GET                         | gradebook.publish_grades_to_parents          | §49          |                                  |
| /api/v1/gradebook/publishing/publish                                  | POST                        | gradebook.publish_grades_to_parents          | §50          |                                  |
| /api/v1/gradebook/publishing/publish-period                           | POST                        | gradebook.publish_grades_to_parents          | §50          |                                  |
| /api/v1/gradebook/progress-reports                                    | POST / GET                  | gradebook.manage / gradebook.view            | §67          |                                  |
| /api/v1/gradebook/progress-reports/entries/{entryId}                  | PATCH                       | gradebook.enter_grades                       | §67          |                                  |
| /api/v1/gradebook/progress-reports/send                               | POST                        | gradebook.manage                             | §67          |                                  |
| /api/v1/classes                                                       | GET                         | students.view                                | §32, §56     | external                         |
| /api/v1/classes/{classId}                                             | GET                         | students.view                                | §34          | external                         |
| /api/v1/subjects                                                      | GET                         | students.view                                | §6.3         | external                         |
| /api/v1/year-groups                                                   | GET                         | students.view                                | §6.3, §32    | external                         |
| /api/v1/academic-periods                                              | GET                         | academics.view                               | §57          | external                         |

---

## 77. Observations from Walkthrough

Things spotted while writing this spec — flagged here, NOT silently fixed:

1. **Hand-rolled forms:** Categories, Weights, Standards, New Assessment all use hand-rolled `useState` instead of `react-hook-form + zodResolver`. Violates project rule "New forms must use react-hook-form" but marked as "HR-025 migration" in existing spec. → track as tech debt.
2. **Weights dialog sum-tolerance** is 0.01 in both client + server — but the UI amber banner shows "Total: 95%" even when the backend would accept 99.995. Possibly cosmetic only.
3. **`gradebook.manage_own_config` not fully surfaced on admin role definition** — admin manages config via `gradebook.manage` implicitly. The permission boundary with teachers is therefore asymmetric — document in integration spec.
4. **Approval queue tabs** — `?tab=unlocks` vs `?tab=unlock-requests` inconsistency across the codebase. Need verification.
5. **`exclude_cancelled=true`** is the default on dashboard fetch but NOT on gradebook listing paginated call. Double-check if cancelled show up unexpectedly.
6. **Benign 404 on `/teaching-allocations`** for admin is functional but pollutes Chrome DevTools Network log. Consider suppressing via server returning 200 with empty array.
7. **No loading state on class selector options fetch** — dropdown can render empty briefly before options arrive.
8. **Analytics chart colors** are hardcoded in at least one Recharts config — should read from CSS tokens. Risk: cross-theme regression.
9. **PDF export for analytics** claims to exist in the jump-to row, but the endpoint is not in the backend inventory. Verify implemented.
10. **Rubric criteria min=2 / max=10** — not enforced client-side in some legacy rubrics. Server should enforce.
11. **Competency snapshots** UI is referenced by Student Profile mode but not implemented in some class views — possible partial rollout.
12. **No throttle on "Recompute grades"** — an admin spamming the button could hammer Postgres. Consider idempotency tokens.

---

## 78. Sign-Off

| Reviewer | Date | Pass count | Fail count | Notes |
| -------- | ---- | ---------- | ---------- | ----- |
|          |      |            |            |       |

Module release-ready (admin UI leg) when ALL rows in §§3–74 pass + §75 data invariants green + §70 negative assertions green + observations §77 triaged.

---
