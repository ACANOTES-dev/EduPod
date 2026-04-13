# Assessment Module — Teacher E2E Test Specification

**Module:** Assessment (Teacher Dashboard, My Config, Workspace, Gradebook, Analytics)
**Perspective:** Teacher — user with `gradebook.view`, `gradebook.enter_grades`, `gradebook.manage_own_config`, `gradebook.request_unlock`. NO `gradebook.manage`, NO `gradebook.approve_config`, NO `gradebook.approve_unlock`, NO `gradebook.override_final_grade`, NO `gradebook.apply_curve`, NO `gradebook.publish_*`.
**Pages Covered:** 14 authenticated routes.
**Tester audience:** QC engineer OR headless Playwright agent.
**Last Updated:** 2026-04-12
**Replaces:** `dashboard-e2e-spec.md`, `gradebook-e2e-spec.md`, `analytics-e2e-spec.md`.

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Sibling Specs](#2-out-of-scope--sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Role Gating — Teacher Branch on `/en/assessments`](#4-role-gating--teacher-branch-on-enassessments)
5. [Teacher Dashboard — Navigation](#5-teacher-dashboard--navigation)
6. [Teacher Dashboard — Page Load](#6-teacher-dashboard--page-load)
7. [Teacher Dashboard — Header & KPI Strip](#7-teacher-dashboard--header--kpi-strip)
8. [Teacher Dashboard — My Allocations Table](#8-teacher-dashboard--my-allocations-table)
9. [Teacher Dashboard — Config Status (Categories / Weights / Rubrics / Standards)](#9-teacher-dashboard--config-status-categories--weights--rubrics--standards)
10. [Teacher Dashboard — Recent Assessments](#10-teacher-dashboard--recent-assessments)
11. [Teacher Dashboard — Negative Assertions (What Teacher Does NOT See)](#11-teacher-dashboard--negative-assertions-what-teacher-does-not-see)
12. [Categories Page — Teacher View](#12-categories-page--teacher-view)
13. [Categories — Create Own / Edit Own](#13-categories--create-own--edit-own)
14. [Categories — Submit for Approval](#14-categories--submit-for-approval)
15. [Grading Weights — Teacher View](#15-grading-weights--teacher-view)
16. [Grading Weights — Create Own (Subject+Year+Period)](#16-grading-weights--create-own-subjectyearperiod)
17. [Grading Weights — Pending / Rejected States](#17-grading-weights--pending--rejected-states)
18. [Rubric Templates — Teacher View](#18-rubric-templates--teacher-view)
19. [Curriculum Standards — Teacher View](#19-curriculum-standards--teacher-view)
20. [Assessment Workspace — Per Class & Subject](#20-assessment-workspace--per-class--subject)
21. [Workspace — Setup Status Cards](#21-workspace--setup-status-cards)
22. [Workspace — Create Assessment Button](#22-workspace--create-assessment-button)
23. [Workspace — Reschedule Dialog](#23-workspace--reschedule-dialog)
24. [Workspace — Cancel Assessment Dialog](#24-workspace--cancel-assessment-dialog)
25. [Workspace — Re-open Dialog (after unlock granted)](#25-workspace--re-open-dialog-after-unlock-granted)
26. [Gradebook Listing — Teacher View](#26-gradebook-listing--teacher-view)
27. [Class Gradebook — Assessments Tab (Grouped, With Collapse)](#27-class-gradebook--assessments-tab-grouped-with-collapse)
28. [Class Gradebook — Non-Owned Subjects Dimmed](#28-class-gradebook--non-owned-subjects-dimmed)
29. [Class Gradebook — Flat View Ownership Gating](#29-class-gradebook--flat-view-ownership-gating)
30. [Class Gradebook — New Assessment (Teacher-Initiated)](#30-class-gradebook--new-assessment-teacher-initiated)
31. [Class Gradebook — Results Tab](#31-class-gradebook--results-tab)
32. [Class Gradebook — Grades Tab (Limited)](#32-class-gradebook--grades-tab-limited)
33. [Grade Entry Page — Teacher Happy Path](#33-grade-entry-page--teacher-happy-path)
34. [Grade Entry — Grading Window Enforcement](#34-grade-entry--grading-window-enforcement)
35. [Grade Entry — Submit & Lock](#35-grade-entry--submit--lock)
36. [Grade Entry — Locked State (Teacher Blocked)](#36-grade-entry--locked-state-teacher-blocked)
37. [Grade Entry — Request Unlock Dialog](#37-grade-entry--request-unlock-dialog)
38. [Grade Entry — Reopened State](#38-grade-entry--reopened-state)
39. [Analytics Page — Teacher Scope](#39-analytics-page--teacher-scope)
40. [Analytics — What Teachers Must NOT See](#40-analytics--what-teachers-must-not-see)
41. [Cross-Tenant Hostile Attempts](#41-cross-tenant-hostile-attempts)
42. [No "No Staff Profile" Toast Regression Test](#42-no-no-staff-profile-toast-regression-test)
43. [Negative Assertions — Full Inventory](#43-negative-assertions--full-inventory)
44. [Error, Loading, Empty States](#44-error-loading-empty-states)
45. [Arabic / RTL](#45-arabic--rtl)
46. [Console & Network Health](#46-console--network-health)
47. [Mobile Responsiveness (375px)](#47-mobile-responsiveness-375px)
48. [Data Invariants](#48-data-invariants)
49. [Backend Endpoint Map — Teacher](#49-backend-endpoint-map--teacher)
50. [Observations from Walkthrough](#50-observations-from-walkthrough)
51. [Sign-Off](#51-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

### Tenant A — `nhqs`

Same tenant as admin spec §1. Additional teacher-specific seeding:

- **User:** `teacher@nhqs.test` / `Password123!`. Role = **Teacher**.
- **Staff profile:** must exist (`staff_profiles` row linked to the user).
- **Teaching allocations:** ≥ 3 subject–class pairings (via `ClassStaff` or `TeacherCompetencies`).
- **Owned assessments:** ≥ 8 assessments in the teacher's allocated subjects, mix of all statuses.
- **Non-owned assessments:** ≥ 15 assessments in subjects NOT allocated to this teacher.
- **Own config:** ≥ 1 approved grading weight, ≥ 1 draft weight, ≥ 1 pending_approval weight, ≥ 1 rejected weight (each with `rejection_reason` set).
- **Active unlock request:** this teacher has submitted ≥ 1 `AssessmentUnlockRequest` that is pending.

### Tenant B — `demo-b`

Same hostile-pair setup. Capture Tenant B class/assessment/weight ids for direct-URL hostile tests (§41).

### Users cross-reference

- Admin `owner@nhqs.test` — must also be logged in (in a separate browser profile) to approve the teacher's submissions during the workflow tests.

---

## 2. Out of Scope — Sibling Specs

This spec exercises only the teacher branch of the UI. See sibling specs for:

- Admin leadership dashboard + approvals + publishing → `admin_view/assessment-e2e-spec.md`.
- Parent read-only grade access → `parent_view/assessment-e2e-spec.md`.
- RLS, API contract matrix, invariants → `integration/assessment-integration-spec.md`.
- Worker jobs and cron → `worker/assessment-worker-spec.md`.
- Latency budgets → `perf/assessment-perf-spec.md`.
- OWASP, IDOR, injection → `security/assessment-security-spec.md`.

---

## 3. Global Environment Setup

| #   | What to Check                    | Expected Result                                                                                                                  | Pass/Fail |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | DevTools Network + Console open  | Panels populate.                                                                                                                 |           |
| 3.2 | Clear storage for `*.edupod.app` | Logged out.                                                                                                                      |           |
| 3.3 | Log in as `teacher@nhqs.test`    | `POST /api/v1/auth/login` → 200. JWT contains `role_keys: ['teacher']`, NOT school_owner/principal.                              |           |
| 3.4 | Landing URL                      | `/en/dashboard/teacher` (NOT `/en/dashboard`).                                                                                   |           |
| 3.5 | Shell hubs visible               | **Home**, **People**, **Learning**, **Wellbeing**, **Operations**. NO Finance, NO Regulatory, NO Settings (teacher hides these). |           |
| 3.6 | Browser console                  | Zero red errors.                                                                                                                 |           |
| 3.7 | Morph bar profile                | Shows teacher name + role label "Teacher".                                                                                       |           |

---

## 4. Role Gating — Teacher Branch on `/en/assessments`

| #   | What to Check                                                     | Expected Result                                                                                                                        | Pass/Fail |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Navigate Learning → Assessment                                    | URL becomes `/en/assessments`. Renders **Teacher Assessment Dashboard** — not Leadership.                                              |           |
| 4.2 | Confirm teacher-specific fetch                                    | First fired: `GET /api/v1/gradebook/teaching-allocations` (NOT the `/all` admin variant).                                              |           |
| 4.3 | Admin endpoint hidden                                             | Network tab must NOT show a call to `/teaching-allocations/all`.                                                                       |           |
| 4.4 | Dashboard branding                                                | Heading reads **"My assessments"** (or i18n-equivalent `teacherAssessments.pageTitle`).                                                |           |
| 4.5 | If teacher has no staff profile (edge case — new onboarding user) | Dashboard shows an inline banner: "Your teacher profile isn't set up yet. Ask an admin to complete your staff profile.". NO red toast. |           |

---

## 5. Teacher Dashboard — Navigation

| #   | What to Check              | Expected Result                                                                                                                  | Pass/Fail |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Morph bar profile          | "Teacher" role label.                                                                                                            |           |
| 5.2 | Click Learning             | URL `/en/classes` or teacher's first basePath. Learning sub-strip: Classes, Curriculum, Assessment, Homework, Attendance.        |           |
| 5.3 | Click Assessment           | Assessment sub-strip appears: **Dashboard**, **Gradebook**, **Report Cards**, **Analytics**.                                     |           |
| 5.4 | Report Cards visibility    | Only if teacher has `report_cards.view` or `report_cards.comment`. Otherwise link hidden.                                        |           |
| 5.5 | Permission-gated sub-pages | Tapping `/en/assessments/approvals` directly → 403 or redirect to dashboard. Teacher has no `approve_config` / `approve_unlock`. |           |

---

## 6. Teacher Dashboard — Page Load

| #   | What to Check     | Expected Result                                                                                                                                                                                                                                                                | Pass/Fail |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1 | Initial skeleton  | Four skeleton cards (KPIs), one allocations table skeleton, one "my config" skeleton.                                                                                                                                                                                          |           |
| 6.2 | Parallel fetches  | `GET /api/v1/gradebook/teaching-allocations`, `GET /api/v1/gradebook/assessments?...pageSize=100&status_not=cancelled` (teacher-scoped), `GET /api/v1/gradebook/assessment-categories?pageSize=100`, `/teacher-grading-weights`, `/rubric-templates`, `/curriculum-standards`. |           |
| 6.3 | Tenant scope      | All responses include ONLY the teacher's allocations.                                                                                                                                                                                                                          |           |
| 6.4 | Empty allocations | If teacher has zero allocations: EmptyState "You don't have any teaching assignments yet.". Contact admin link.                                                                                                                                                                |           |

---

## 7. Teacher Dashboard — Header & KPI Strip

| #   | Card                                                            | Expected Content                                                            | Tone           | Pass/Fail |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- | --------- |
| 7.1 | **My allocations**                                              | Count = allocations returned. Subtitle: "class-subject pairings you teach". | Info           |           |
| 7.2 | **Missing config**                                              | Count of allocations without an approved grading weight for current period. | Warning if > 0 |           |
| 7.3 | **My approved weights**                                         | Count where status = approved.                                              | Success        |           |
| 7.4 | **Total assessments**                                           | Count of assessments the teacher owns.                                      | Neutral        |           |
| 7.5 | **Grading backlog**                                             | Count where grading deadline passed + grades incomplete.                    | Danger if > 0  |           |
| 7.6 | **Pending my approval** (if teacher is a mentor teacher — rare) | 0 for typical teacher; absent in standard view.                             | Hidden         |           |
| 7.7 | Hover tooltip                                                   | Each card explains its computation.                                         | —              |           |

---

## 8. Teacher Dashboard — My Allocations Table

| #   | What to Check               | Expected Result                                                                                                        | Pass/Fail |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Desktop table               | Columns: Class, Subject, Active period, Approved weight, Assessments in period, Grading status. Hidden on `sm:hidden`. |           |
| 8.2 | Mobile cards                | Stacked cards with same fields.                                                                                        |           |
| 8.3 | Click row → opens workspace | Navigates to `/en/assessments/workspace/{classId}/{subjectId}`.                                                        |           |
| 8.4 | Missing weight badge        | If no approved weight: inline badge "Missing weight — submit for approval".                                            |           |
| 8.5 | Missing category badge      | If no approved category covering subject+year: inline badge "No category approved for this subject".                   |           |
| 8.6 | Grading progress            | "M / N graded" with inline progress bar.                                                                               |           |
| 8.7 | Sort                        | Clicking column headers toggles sort ascending/descending.                                                             |           |

---

## 9. Teacher Dashboard — Config Status (Categories / Weights / Rubrics / Standards)

| #   | What to Check                                     | Expected Result                                                                                                                             | Pass/Fail |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Four cards (categories/weights/rubrics/standards) | Each card: icon + title + "M of N approved" count + progress bar + "Manage" button.                                                         |           |
| 9.2 | Manage button for Categories                      | Navigates `/en/assessments/categories`.                                                                                                     |           |
| 9.3 | Manage button for Weights                         | Navigates `/en/assessments/grading-weights`.                                                                                                |           |
| 9.4 | Manage button for Rubrics                         | Navigates `/en/assessments/rubric-templates`.                                                                                               |           |
| 9.5 | Manage button for Standards                       | Navigates `/en/assessments/curriculum-standards`.                                                                                           |           |
| 9.6 | Rejected items surface                            | If any item has status = rejected: red-tone card with "Rejected: {N}" + link to re-submit.                                                  |           |
| 9.7 | Teacher's scope only                              | Counts reflect ONLY the teacher's own items (via `/teacher-grading-weights?submitted_by=me` implicit). Admin's bulk inventory is NOT shown. |           |

---

## 10. Teacher Dashboard — Recent Assessments

| #    | What to Check        | Expected Result                                                                                   | Pass/Fail |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Recent 5 assessments | Cards showing title, class, subject, due date, status.                                            |           |
| 10.2 | Click card           | Navigates to `/en/gradebook/{classId}/assessments/{assessmentId}/grades` (or workspace if draft). |           |
| 10.3 | Status badges        | Draft/Open/Closed/Submitted locked/Unlock requested/Reopened/Final locked.                        |           |

---

## 11. Teacher Dashboard — Negative Assertions (What Teacher Does NOT See)

| #     | What must NOT be visible                    | Evidence                                                                                                                | Pass/Fail |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Other teachers' allocations                 | Allocations table returns only rows where `teacher_user_id = currentUser.id` (or `staff_profile_id`).                   |           |
| 11.2  | "Teachers needing attention" panel          | Section absent on teacher variant.                                                                                      |           |
| 11.3  | "Config Health" school-wide panel           | Absent.                                                                                                                 |           |
| 11.4  | Inline approval queue                       | Absent. Teacher has no `approve_config` permission.                                                                     |           |
| 11.5  | Pending approvals count                     | 0 (even if other teachers have submissions — teacher cannot approve).                                                   |           |
| 11.6  | "Open approvals queue" button               | Hidden.                                                                                                                 |           |
| 11.7  | Admin-only sub-strip items                  | No link to `/en/assessments/approvals`, `/en/gradebook/publishing`, `/en/gradebook/import` (bulk import is admin-only). |           |
| 11.8  | Bulk import UI                              | Hidden.                                                                                                                 |           |
| 11.9  | Progress report creation                    | Hidden (requires `gradebook.manage`).                                                                                   |           |
| 11.10 | Override / apply curve / final-lock actions | Absent from every row action menu.                                                                                      |           |

---

## 12. Categories Page — Teacher View

**URL:** `/en/assessments/categories`

| #    | What to Check                                   | Expected Result                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Table contents                                  | Teacher sees: own drafts/pending, own rejected, approved categories across the whole tenant (since approved categories are shared). |           |
| 12.2 | "New category" button                           | Visible. Teacher can create.                                                                                                        |           |
| 12.3 | Row actions on someone else's approved category | "Use" (select for assessment), no Edit, no Delete, no Withdraw.                                                                     |           |
| 12.4 | Row actions on own draft/pending/rejected       | Edit, Submit (if draft), Withdraw (if pending), Delete (if draft or rejected).                                                      |           |
| 12.5 | Filter by status                                | Default: all approved + own non-approved.                                                                                           |           |
| 12.6 | Cannot approve                                  | No "Approve" or "Reject" buttons even on rows that are pending_approval.                                                            |           |

---

## 13. Categories — Create Own / Edit Own

| #    | What to Check                        | Expected Result                                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 13.1 | Create dialog as teacher             | Same fields as admin (Name, Subject scope, Year group scope, Default weight).                                                                                      |           |
| 13.2 | Subject / Year scope dropdowns       | Populated with subjects+year groups the teacher has allocation to (ONLY). Confirm via allocations endpoint.                                                        |           |
| 13.3 | Submit                               | `POST /api/v1/gradebook/assessment-categories`. Teacher requires `gradebook.manage` — **this is the friction point**. If teacher lacks `manage`, POST returns 403. |           |
| 13.4 | Expected happy path                  | If teacher has `gradebook.manage_own_config` (not `manage`), backend accepts category creation with `created_by = teacher.id` and `status = draft`.                |           |
| 13.5 | Edit own draft                       | PATCH → 200.                                                                                                                                                       |           |
| 13.6 | Attempt to edit someone else's draft | 403. Red toast.                                                                                                                                                    |           |

---

## 14. Categories — Submit for Approval

| #    | What to Check                     | Expected Result                                                                                                                           | Pass/Fail |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Submit own draft                  | `POST .../{id}/submit`. Status → pending_approval. Toast green.                                                                           |           |
| 14.2 | Category appears in admin's queue | Switch to admin tab: approvals page now lists this item.                                                                                  |           |
| 14.3 | Admin approves                    | (executed in admin spec) — returning to teacher tab, row status shows Approved with green badge.                                          |           |
| 14.4 | Admin rejects with reason         | Row status Rejected. Hovering the status badge surfaces the rejection reason tooltip. "Re-edit & resubmit" link re-opens the edit dialog. |           |
| 14.5 | Duplicate-submit                  | POST to submit when status already pending → 409 "Already submitted".                                                                     |           |

---

## 15. Grading Weights — Teacher View

**URL:** `/en/assessments/grading-weights`

| #    | What to Check                     | Expected Result                                                                                  | Pass/Fail |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 15.1 | Teacher column                    | Hidden on teacher view (single-teacher perspective). OR shown but read-only and pre-set to self. |           |
| 15.2 | Filter by subject / year / period | Same dropdowns. Options limited to teacher's allocations.                                        |           |
| 15.3 | Table rows                        | Only teacher's own rows. Admin-added weights for OTHER teachers are NOT listed.                  |           |
| 15.4 | "New weight" button               | Visible. Opens dialog with teacher_user_id prefilled (hidden).                                   |           |

---

## 16. Grading Weights — Create Own (Subject+Year+Period)

| #    | What to Check                                  | Expected Result                                                                                                                                            | Pass/Fail |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Teacher selects subject                        | Dropdown options = subjects teacher has allocation to.                                                                                                     |           |
| 16.2 | Year group                                     | Options = year groups where teacher teaches that subject.                                                                                                  |           |
| 16.3 | Period                                         | Active academic periods for the tenant.                                                                                                                    |           |
| 16.4 | Weight rows                                    | Auto-populated from approved categories for subject+year.                                                                                                  |           |
| 16.5 | Live total                                     | Badge "Total: 100%" green / "95%" amber / "110%" red.                                                                                                      |           |
| 16.6 | Submit                                         | POST → 201. `teacher_user_id = currentUser.id` server-set (body value ignored if different).                                                               |           |
| 16.7 | Teacher attempts to create for ANOTHER teacher | If UI attempts by forging `teacher_user_id` in payload → 403 or server silently overrides. Confirm server-side. Integration spec verifies exact behaviour. |           |

---

## 17. Grading Weights — Pending / Rejected States

| #    | What to Check          | Expected Result                                                                                                          | Pass/Fail |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 17.1 | Pending row            | Status pill amber "Pending approval". Edit dialog read-only with Withdraw button.                                        |           |
| 17.2 | Rejected row           | Status pill red "Rejected". Tooltip shows rejection reason. Edit button re-opens dialog for resubmission.                |           |
| 17.3 | Approved row           | Status pill green "Approved". Dialog read-only with "Create variant" action to start a new weight with prefilled values. |           |
| 17.4 | Cannot approve own     | Even if teacher has approve permission (shouldn't), server validates `submitted_by != reviewed_by`. If attempted, 403.   |           |
| 17.5 | Cannot delete approved | Approved weights are "in-use" once referenced. Delete returns 409.                                                       |           |

---

## 18. Rubric Templates — Teacher View

**URL:** `/en/assessments/rubric-templates`

| #    | What to Check                          | Expected Result                                                          | Pass/Fail |
| ---- | -------------------------------------- | ------------------------------------------------------------------------ | --------- |
| 18.1 | Grid contents                          | All approved rubrics (shared) + teacher's own drafts/pending/rejected.   |           |
| 18.2 | Create new                             | Teacher creates. Same dialog with default criteria. Status = draft.      |           |
| 18.3 | Submit for approval                    | `POST /api/v1/gradebook/rubric-templates/{id}/submit`. Status → pending. |           |
| 18.4 | Delete own                             | If not in use. 409 if referenced by an assessment.                       |           |
| 18.5 | Cannot delete another teacher's rubric | 403 at row-action level (menu hidden). Backend enforces.                 |           |

---

## 19. Curriculum Standards — Teacher View

**URL:** `/en/assessments/curriculum-standards`

| #    | What to Check            | Expected Result                                                                    | Pass/Fail |
| ---- | ------------------------ | ---------------------------------------------------------------------------------- | --------- |
| 19.1 | Table contents           | Approved standards (shared) + teacher's own drafts/pending/rejected.               |           |
| 19.2 | Create, submit, withdraw | Same pattern as categories.                                                        |           |
| 19.3 | Import                   | Teacher-only import restricted (admin-only action). Button hidden on teacher view. |           |
| 19.4 | Assign to assessment     | Only on teacher-owned assessments. See §30.                                        |           |

---

## 20. Assessment Workspace — Per Class & Subject

**URL:** `/en/assessments/workspace/{classId}/{subjectId}`

| #    | What to Check         | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Allocation validation | If teacher not allocated to (classId, subjectId), backend returns 403 on first fetch. UI shows **"You don't teach this class/subject — nothing to show."** banner.                                                  |           |
| 20.2 | Breadcrumb            | Home > Learning > Assessment > Workspace > {class} / {subject}.                                                                                                                                                     |           |
| 20.3 | Page fetches          | `GET /api/v1/gradebook/classes/{classId}/allocations`, `GET /api/v1/gradebook/classes/{classId}/subjects/{subjectId}/grade-config`, `GET /api/v1/gradebook/assessments?class_id=&subject_id=&status_not=cancelled`. |           |
| 20.4 | Skeleton              | Three cards + assessment list skeleton.                                                                                                                                                                             |           |

---

## 21. Workspace — Setup Status Cards

| #    | Card                   | Expected Content                                                                                                                       | Pass/Fail |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | **Grading weight**     | "Approved" (green), "Pending" (amber), "Missing" (red). Click → opens weights dialog or jumps to `/en/assessments/grading-weights`.    |           |
| 21.2 | **Categories**         | "N approved categories available" (green), "None" (red).                                                                               |           |
| 21.3 | **Rubric / Standards** | Optional, shows if attached.                                                                                                           |           |
| 21.4 | Warning banner         | If ANY of the above is red: prominent yellow `AlertTriangle` banner at page top: "Setup incomplete — new assessments may be blocked.". |           |

---

## 22. Workspace — Create Assessment Button

| #    | What to Check                              | Expected Result                                                                                        | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------- |
| 22.1 | **+ New assessment** button visibility     | Enabled if: weight approved AND ≥ 1 approved category. Else disabled with tooltip explaining the gate. |           |
| 22.2 | Click                                      | Opens create dialog with subject + period pre-filled.                                                  |           |
| 22.3 | Submit                                     | `POST /api/v1/gradebook/assessments`. Status `draft`. Row appears in workspace list.                   |           |
| 22.4 | Server-side block when weight not approved | 400 `WEIGHTS_NOT_APPROVED`. Red toast explains.                                                        |           |

---

## 23. Workspace — Reschedule Dialog

| #    | What to Check                            | Expected Result                                                                               | Pass/Fail |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Action on a draft or open assessment row | "Edit dates" → dialog with Due date + Grading deadline pickers.                               |           |
| 23.2 | Submit                                   | `PATCH /api/v1/gradebook/assessments/{id}` body `{ due_date, grading_deadline }`. 200. Toast. |           |
| 23.3 | Validation                               | Grading deadline ≥ Due date.                                                                  |           |
| 23.4 | Locked assessment                        | "Edit dates" disabled. Tooltip: "Cannot reschedule a locked assessment.".                     |           |

---

## 24. Workspace — Cancel Assessment Dialog

| #    | What to Check         | Expected Result                                                                                                                                                                                       | Pass/Fail |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1 | Row action "Cancel"   | Dialog with Reason textarea (required, min 10 chars).                                                                                                                                                 |           |
| 24.2 | Submit                | `PATCH /api/v1/gradebook/assessments/{id}/status` body `{ status: 'cancelled', cancellation_reason }`. 200. Assessment disappears from default workspace view (filtered by `exclude_cancelled=true`). |           |
| 24.3 | Show cancelled toggle | Brings dimmed row back.                                                                                                                                                                               |           |
| 24.4 | Re-open cancelled     | Transition `cancelled → draft` allowed only if teacher owns it and no grades were entered.                                                                                                            |           |

---

## 25. Workspace — Re-open Dialog (after unlock granted)

| #    | What to Check                | Expected Result                                                                                               | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1 | Unlock was approved by admin | Assessment row shows status `reopened` (blue). Row action "Reopen grade entry" navigates to grade entry page. |           |
| 25.2 | Teacher re-edits grades      | Edit succeeds. `PUT /api/v1/gradebook/assessments/{id}/grades` 200. GradeEditAudit row created.               |           |
| 25.3 | Submit & lock again          | `PATCH .../status` → submitted_locked.                                                                        |           |
| 25.4 | Second unlock request        | Allowed but only ONE pending at a time.                                                                       |           |

---

## 26. Gradebook Listing — Teacher View

**URL:** `/en/gradebook`

| #    | What to Check | Expected Result                                                             | Pass/Fail |
| ---- | ------------- | --------------------------------------------------------------------------- | --------- |
| 26.1 | Class cards   | Only classes where teacher has allocation AND ≥ 1 non-cancelled assessment. |           |
| 26.2 | Empty state   | If teacher has zero eligible classes: EmptyState.                           |           |
| 26.3 | Click card    | Navigates to `/en/gradebook/{classId}`.                                     |           |

---

## 27. Class Gradebook — Assessments Tab (Grouped, With Collapse)

| #    | What to Check               | Expected Result                                                                                                       | Pass/Fail |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1 | Grouped by subject          | Each subject is a collapsible group.                                                                                  |           |
| 27.2 | Auto-collapse for non-owned | Subjects NOT in teacher's allocation auto-collapse on load. Admin view does NOT auto-collapse (see admin spec §34.6). |           |
| 27.3 | Manual expand               | Clicking a collapsed subject expands it. Rows are visible but dimmed.                                                 |           |
| 27.4 | Owned subject rows          | Full opacity; click navigates to grade entry.                                                                         |           |
| 27.5 | Non-owned subject rows      | Dimmed to 0.5 opacity. Cursor: not-allowed. Click produces no navigation and no row-action menu.                      |           |

---

## 28. Class Gradebook — Non-Owned Subjects Dimmed

| #    | What to Check                                 | Expected Result                                                                                   | Pass/Fail |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 28.1 | Enter a class where teacher teaches only Math | Only Math group expanded, others dimmed and collapsed.                                            |           |
| 28.2 | Attempt keyboard nav                          | Non-owned rows are skipped from tab order (tabIndex=-1). Screen readers announce "disabled".      |           |
| 28.3 | `mySubjectIds` derivation                     | Computed from allocations response. If the set is empty, teacher sees "no owned subjects" banner. |           |

---

## 29. Class Gradebook — Flat View Ownership Gating

| #    | What to Check                       | Expected Result                                           | Pass/Fail |
| ---- | ----------------------------------- | --------------------------------------------------------- | --------- |
| 29.1 | Toggle to Flat view                 | Non-owned rows still dimmed; sort/filter applies to both. |           |
| 29.2 | Multi-select checkbox               | Disabled on non-owned rows.                               |           |
| 29.3 | Bulk actions on selected owned rows | Cancel + Export only. No Delete (teachers cannot delete). |           |

---

## 30. Class Gradebook — New Assessment (Teacher-Initiated)

| #    | What to Check               | Expected Result                                                          | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------ | --------- |
| 30.1 | **+ New assessment** button | Visible only for owned subjects (button appears in their group headers). |           |
| 30.2 | Form fields                 | Same as admin §38.3 minus admin-only fields.                             |           |
| 30.3 | Assign to standards         | Optional. Only approved standards for subject+year are listed.           |           |
| 30.4 | Submit                      | `POST /api/v1/gradebook/assessments`. 201. Status draft.                 |           |
| 30.5 | Schema validation           | Grading deadline ≥ due date (client + server). Max score > 0.            |           |
| 30.6 | Open the assessment         | Status transition draft → open: `PATCH .../status`. Teacher can do this. |           |

---

## 31. Class Gradebook — Results Tab

| #    | What to Check  | Expected Result                                                                                                               | Pass/Fail |
| ---- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Results matrix | Shows ALL subjects for ALL students — but teacher can only EDIT cells in their owned subjects. Non-owned cells are read-only. |           |
| 31.2 | Inline edit    | Owned cells — accept input. Non-owned — read-only.                                                                            |           |
| 31.3 | Save           | Body filtered to owned cells. Non-owned payload entries rejected server-side.                                                 |           |
| 31.4 | Export Excel   | Includes entire matrix. Teacher can download.                                                                                 |           |
| 31.5 | Export PDF     | Same.                                                                                                                         |           |

---

## 32. Class Gradebook — Grades Tab (Limited)

| #    | What to Check                   | Expected Result                                                                                                    | Pass/Fail |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 32.1 | Subject dropdown                | Pre-limited to owned subjects. "All subjects" option hidden.                                                       |           |
| 32.2 | Compute grades button           | Visible if teacher has `gradebook.manage`. Most teachers do not. Button hidden. Recompute must be admin-initiated. |           |
| 32.3 | Override                        | Hidden. Teachers cannot override.                                                                                  |           |
| 32.4 | Read-only view of period grades | Teacher can view their own students' period grades. Overrides (if present) shown with tooltip but not editable.    |           |

---

## 33. Grade Entry Page — Teacher Happy Path

| #    | What to Check                                  | Expected Result                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1 | Navigate from workspace or class gradebook row | `/en/gradebook/{classId}/assessments/{assessmentId}/grades`.                                                            |           |
| 33.2 | Ownership gate                                 | If teacher doesn't own the subject → 403. Page shows "You don't teach this subject — no access.". NO grade data leaked. |           |
| 33.3 | Input grades                                   | Decimal input per row. Tab advances.                                                                                    |           |
| 33.4 | Save draft                                     | `PUT /api/v1/gradebook/assessments/{id}/grades` body `{ grades: [...] }`. 200.                                          |           |
| 33.5 | Comment per grade                              | Optional textarea per row. Persists with the grade.                                                                     |           |

---

## 34. Grade Entry — Grading Window Enforcement

| #    | State                 | Expected Behaviour                                                                                             | Pass/Fail |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 34.1 | Before due date       | Banner "Scheduled — assessment opens on {date}." Inputs disabled.                                              |           |
| 34.2 | Within grading window | Banner "Pending grading — deadline {date}". Inputs editable.                                                   |           |
| 34.3 | Past deadline         | Red banner "Past grading deadline. Submit ASAP or request extension.". Inputs still editable (not yet locked). |           |
| 34.4 | Locked                | Red banner "Locked.". Inputs read-only. "Request unlock" button visible.                                       |           |

---

## 35. Grade Entry — Submit & Lock

| #    | What to Check            | Expected Result                                                                                                                             | Pass/Fail |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | **Submit & lock** button | Confirmation modal: "Once locked, you'll need admin approval to edit. Proceed?".                                                            |           |
| 35.2 | Confirm                  | `PATCH .../status` body `{ status: 'submitted_locked' }`. 200. Toast "Locked. Grades submitted.".                                           |           |
| 35.3 | Missing grades warning   | If any student has no score and is not marked missing: modal warns "{N} students have no grade or excuse. Continue?". Teacher must confirm. |           |
| 35.4 | Post-lock UI             | Inputs become read-only; banner switches to Locked; "Request unlock" button appears.                                                        |           |

---

## 36. Grade Entry — Locked State (Teacher Blocked)

| #    | What to Check        | Expected Result                                                                                     | Pass/Fail |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 36.1 | All inputs read-only | Attempt to type: cursor blocked.                                                                    |           |
| 36.2 | Save button hidden   | No way to save changes.                                                                             |           |
| 36.3 | Attempt forced PUT   | From DevTools console, attempt `PUT .../grades`. Server returns 403 `ASSESSMENT_LOCKED`. Toast red. |           |

---

## 37. Grade Entry — Request Unlock Dialog

| #    | What to Check            | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 37.1 | Click **Request unlock** | Dialog: Reason textarea (required, min 10 chars).                                                                                                    |           |
| 37.2 | Submit                   | `POST /api/v1/gradebook/assessments/{id}/unlock-request` body `{ reason }`. 201. Toast "Request submitted.". Assessment status → `unlock_requested`. |           |
| 37.3 | Already-pending case     | Subsequent submit: 409 "An unlock request is already pending.". Toast red.                                                                           |           |
| 37.4 | Cancel                   | Closes dialog, no request.                                                                                                                           |           |

---

## 38. Grade Entry — Reopened State

| #    | What to Check         | Expected Result                                                                                         | Pass/Fail |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 38.1 | Admin approves unlock | (see admin spec §68). Teacher refreshes page: banner changes to "Reopened — you may edit and re-lock.". |           |
| 38.2 | Inputs editable again | Full edit. Save succeeds. GradeEditAudit row created.                                                   |           |
| 38.3 | Re-submit & lock      | Status `reopened → submitted_locked`.                                                                   |           |

---

## 39. Analytics Page — Teacher Scope

**URL:** `/en/analytics`

| #    | What to Check                                                             | Expected Result                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | Class selector populated via `/api/v1/classes?pageSize=100&status=active` | For teachers, endpoint returns ONLY classes in teacher's allocations (backend filter). Typically ~3 classes, not 16.            |           |
| 39.2 | Pick a class                                                              | AnalyticsTab loads. Same modes as admin (Class Overview, Subject Deep Dive, Student Profile).                                   |           |
| 39.3 | Subject deep dive subject selector                                        | Options limited to allocations.                                                                                                 |           |
| 39.4 | Teacher consistency view                                                  | Hidden or read-only (requires `gradebook.view_analytics`). If teacher lacks permission, panel hidden with "Not available" note. |           |
| 39.5 | Benchmark view                                                            | Hidden.                                                                                                                         |           |

---

## 40. Analytics — What Teachers Must NOT See

| #    | What must NOT appear                               | Evidence                                                                             | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 40.1 | Non-own class dropdown options                     | Confirm by comparing options to teacher allocations.                                 |           |
| 40.2 | Teacher consistency aggregate (other teachers)     | Hidden.                                                                              |           |
| 40.3 | Benchmark data (school vs district)                | Hidden.                                                                              |           |
| 40.4 | AI query access                                    | `/ai/query` requires `gradebook.view_analytics`. Most teachers don't. Button hidden. |           |
| 40.5 | Student profile for student not in teacher's class | Direct navigation: 403.                                                              |           |

---

## 41. Cross-Tenant Hostile Attempts

| #    | Attempt                                                                | Expected Result                       | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ------------------------------------- | --------- |
| 41.1 | Paste `/en/gradebook/{classB.id}` (Tenant B class) in URL              | 404 or empty state. No Tenant B data. |           |
| 41.2 | DevTools: `GET /api/v1/gradebook/assessments/{assessmentB.id}`         | 404.                                  |           |
| 41.3 | DevTools: `PUT /api/v1/gradebook/assessments/{assessmentB.id}/grades`  | 404.                                  |           |
| 41.4 | DevTools: `GET /api/v1/gradebook/teacher-grading-weights/{weightB.id}` | 404.                                  |           |
| 41.5 | DevTools: `GET /api/v1/gradebook/analytics/classes/{classB.id}/trend`  | 404 or empty.                         |           |

---

## 42. No "No Staff Profile" Toast Regression Test

| #    | What to Check                                           | Expected Result                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 42.1 | Login with a user missing staff_profile (if seedable)   | Banner: "Your teacher profile isn't set up yet. Ask an admin to complete your staff profile.". NO red toast. |           |
| 42.2 | Normal teacher                                          | No toast shown.                                                                                              |           |
| 42.3 | Admin user hitting teacher path (role gate mis-routing) | Should not happen; role check short-circuits.                                                                |           |

---

## 43. Negative Assertions — Full Inventory

| #     | Affordance                          | Must NOT appear | Pass/Fail |
| ----- | ----------------------------------- | --------------- | --------- |
| 43.1  | Leadership dashboard                |                 |           |
| 43.2  | "Teachers needing attention"        |                 |           |
| 43.3  | School-wide config health           |                 |           |
| 43.4  | Inline approval queue               |                 |           |
| 43.5  | Approvals page access               |                 |           |
| 43.6  | Publishing page                     |                 |           |
| 43.7  | Bulk import page                    |                 |           |
| 43.8  | Weight config page (subject/period) |                 |           |
| 43.9  | Apply curve action                  |                 |           |
| 43.10 | Override period grade               |                 |           |
| 43.11 | Compute grades (only admin/manage)  |                 |           |
| 43.12 | Final-lock action                   |                 |           |
| 43.13 | Delete any assessment               |                 |           |
| 43.14 | Delete any approved config          |                 |           |
| 43.15 | Import curriculum standards         |                 |           |
| 43.16 | Approve other teachers' config      |                 |           |
| 43.17 | Approve unlock requests             |                 |           |
| 43.18 | AI grading instruction approval     |                 |           |
| 43.19 | Progress report creation            |                 |           |
| 43.20 | Analytics benchmark data            |                 |           |

---

## 44. Error, Loading, Empty States

Identical expectations to admin spec §71 — repeat each row from a teacher perspective.

| #    | Scenario                    | Expected Result                                         | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------- | --------- |
| 44.1 | All loaders                 | Skeletons during initial fetch; no white flash.         |           |
| 44.2 | Empty states                | Every list page has EmptyState card.                    |           |
| 44.3 | 500 from server             | "Something went wrong — retry." button. No stack trace. |           |
| 44.4 | Network disconnect mid-save | Red toast; form state preserved.                        |           |
| 44.5 | 401 after session expiry    | Transparent refresh.                                    |           |
| 44.6 | 403                         | Red toast with context + hide affected controls.        |           |
| 44.7 | 404                         | "Not found" page or inline.                             |           |
| 44.8 | 422                         | Inline field errors.                                    |           |

---

## 45. Arabic / RTL

Same as admin spec §72. Verify entire teacher path.

---

## 46. Console & Network Health

| #    | What to Check                    | Expected Result                                          | Pass/Fail |
| ---- | -------------------------------- | -------------------------------------------------------- | --------- |
| 46.1 | Zero uncaught errors             | Full walkthrough — no red.                               |           |
| 46.2 | No 429                           | Usage doesn't hit rate limits.                           |           |
| 46.3 | No calls to admin-only endpoints | `/teaching-allocations/all` must NOT appear for teacher. |           |
| 46.4 | Polling                          | None on teacher dashboard.                               |           |

---

## 47. Mobile Responsiveness (375px)

Same as admin spec §74 — verify for teacher path.

---

## 48. Data Invariants

| #     | Flow                                                  | Invariant                                                                                                                                                | Expected result                                         | Pass/Fail |
| ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 48.1  | Teacher creates assessment                            | `SELECT tenant_id, status FROM assessments WHERE id = ?`                                                                                                 | tenant = teacher's, status = draft                      |           |
| 48.2  | Teacher locks assessment                              | `SELECT status FROM assessments WHERE id = ?`                                                                                                            | `submitted_locked`                                      |           |
| 48.3  | Teacher requests unlock                               | `SELECT status, requested_by_user_id, reason FROM assessment_unlock_requests WHERE assessment_id = ?`                                                    | status=pending, requested_by = teacher, reason non-null |           |
| 48.4  | Only one pending per assessment                       | `SELECT COUNT(*) FROM assessment_unlock_requests WHERE assessment_id = ? AND status = 'pending'`                                                         | ≤ 1                                                     |           |
| 48.5  | Teacher cannot override                               | For any teacher session UPDATE attempts on period_grade_snapshots.overridden_value → blocked. No rows where `override_actor_user_id = teacher.id` exist. | 0                                                       |           |
| 48.6  | Teacher cannot final-lock                             | `SELECT COUNT(*) FROM assessments WHERE status = 'final_locked' AND edited_by_user_id = teacher.id` = 0                                                  | 0                                                       |           |
| 48.7  | Grade saves by teacher always within class allocation | For every row in grade_edit_audit where edited_by_user_id = teacher.id: the associated assessment.subject_id must be in the teacher's allocations set.   | 100% match                                              |           |
| 48.8  | Teacher-created weight status default                 | `SELECT status FROM teacher_grading_weights WHERE id = (newly created)`                                                                                  | `draft`                                                 |           |
| 48.9  | Teacher submit = status change only                   | `POST /.../submit` on own draft: `status` → `pending_approval`, submitted_by = teacher.id, submitted_at = now()                                          | exact                                                   |           |
| 48.10 | Teacher resubmit after rejection                      | New submit clears rejection_reason, resets reviewed_by/at.                                                                                               | fields null on resubmit                                 |           |

---

## 49. Backend Endpoint Map — Teacher

| Endpoint                                                              | Method               | Permission                                   | Exercised in  |
| --------------------------------------------------------------------- | -------------------- | -------------------------------------------- | ------------- |
| /api/v1/gradebook/teaching-allocations                                | GET                  | gradebook.view                               | §6.2          |
| /api/v1/gradebook/classes/{classId}/allocations                       | GET                  | gradebook.view                               | §20.3         |
| /api/v1/gradebook/classes/{classId}/subjects/{subjectId}/grade-config | GET                  | gradebook.view                               | §20.3         |
| /api/v1/gradebook/assessments                                         | GET / POST           | gradebook.view / gradebook.enter_grades      | §6.2, §30     |
| /api/v1/gradebook/assessments/{id}                                    | GET / PATCH          | gradebook.view / gradebook.enter_grades      | §22, §27      |
| /api/v1/gradebook/assessments/{id}/status                             | PATCH                | gradebook.enter_grades                       | §22, §24, §35 |
| /api/v1/gradebook/assessments/{id}/duplicate                          | POST                 | gradebook.enter_grades                       | §27           |
| /api/v1/gradebook/assessments/{assessmentId}/grades                   | GET / PUT            | gradebook.view / gradebook.enter_grades      | §33           |
| /api/v1/gradebook/assessments/{id}/unlock-request                     | POST                 | gradebook.request_unlock                     | §37           |
| /api/v1/gradebook/assessments/{id}/unlock-requests                    | GET                  | gradebook.view                               | §37           |
| /api/v1/gradebook/period-grades                                       | GET                  | gradebook.view                               | §32           |
| /api/v1/gradebook/period-grades/cross-subject                         | GET                  | gradebook.view                               | §39           |
| /api/v1/gradebook/period-grades/cross-period                          | GET                  | gradebook.view                               | §39           |
| /api/v1/gradebook/period-grades/year-overview                         | GET                  | gradebook.view                               | §39           |
| /api/v1/gradebook/classes/{classId}/results-matrix                    | GET / PUT            | gradebook.view / gradebook.enter_grades      | §31           |
| /api/v1/gradebook/assessment-categories                               | POST / GET           | gradebook.manage / gradebook.view            | §12, §13      |
| /api/v1/gradebook/assessment-categories/{id}                          | GET / PATCH / DELETE | gradebook.view / gradebook.manage_own_config | §13           |
| /api/v1/gradebook/assessment-categories/{id}/submit                   | POST                 | gradebook.manage_own_config                  | §14           |
| /api/v1/gradebook/teacher-grading-weights                             | POST / GET           | gradebook.manage_own_config / gradebook.view | §15–§17       |
| /api/v1/gradebook/teacher-grading-weights/{id}                        | GET / PATCH / DELETE | gradebook.view / gradebook.manage_own_config | §17           |
| /api/v1/gradebook/teacher-grading-weights/{id}/submit                 | POST                 | gradebook.manage_own_config                  | §17           |
| /api/v1/gradebook/rubric-templates                                    | POST / GET           | gradebook.manage_own_config / gradebook.view | §18           |
| /api/v1/gradebook/rubric-templates/{id}                               | GET / PATCH / DELETE | gradebook.view / gradebook.manage_own_config | §18           |
| /api/v1/gradebook/rubric-templates/{id}/submit                        | POST                 | gradebook.manage_own_config                  | §18           |
| /api/v1/gradebook/grades/{gradeId}/rubric-grades                      | POST                 | gradebook.enter_grades                       | §33           |
| /api/v1/gradebook/curriculum-standards                                | POST / GET           | gradebook.manage_own_config / gradebook.view | §19           |
| /api/v1/gradebook/assessments/{id}/standards                          | PUT                  | gradebook.enter_grades                       | §30           |
| /api/v1/classes                                                       | GET                  | students.view                                | §26, §39      |
| /api/v1/subjects                                                      | GET                  | students.view                                | §6.2          |
| /api/v1/year-groups                                                   | GET                  | students.view                                | §26           |
| /api/v1/academic-periods                                              | GET                  | academics.view                               | §39           |

**Endpoints teacher must NOT hit (403):** `/teaching-allocations/all`, `/assessments/{id}/curve`, `/period-grades/{id}/override`, `/publishing/*`, `/import/*`, `/weight-config/*`, `/unlock-requests/{id}/review`, `/progress-reports/send`, `/ai/grading-instructions/{id}/approve`, `/assessment-categories/{id}/review`, `/teacher-grading-weights/{id}/review`, `/rubric-templates/{id}/review`, `/curriculum-standards/{id}/review`.

---

## 50. Observations from Walkthrough

1. The permission boundary between `gradebook.manage` and `gradebook.manage_own_config` is not uniformly enforced across controllers — some POST category / rubric / standard endpoints require `manage` at the controller decorator, so a teacher with ONLY `manage_own_config` would get 403. Confirm by reading `assessment-categories.controller.ts` line-by-line. Integration spec should pin this down.
2. `exclude_cancelled` is only applied on some fetches; a cancelled assessment created by another teacher might show in flat view if filter not applied. Verify.
3. Non-owned subject dimming relies on a client-side `mySubjectIds` set; RLS enforces at API level. If API errors, client still renders optimistically — possible information leak. See integration + security spec.
4. Unlock-request reason length is not documented on the client-side error message — users may type 9 characters and be confused. Error message should specify "min 10 chars".
5. The "request unlock" button does not debounce — a teacher double-clicking may hit 409 the second time. Add optimistic state + disable.
6. Teacher dashboard fetch for `assessment-categories?pageSize=100` returns ALL tenant categories (not just own) — confirm what filter UI applies; could leak draft names from other teachers if backend returns them.

---

## 51. Sign-Off

| Reviewer | Date | Pass count | Fail count | Notes |
| -------- | ---- | ---------- | ---------- | ----- |
|          |      |            |            |       |

Teacher UI leg ready when §§3–47 pass + §48 invariants green + §41 cross-tenant blocks green + §43 negatives confirmed + observations §50 triaged.

---
