# People — E2E Test Specification (Teacher)

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Perspective:** Teacher (role_key `teacher`, role_tier `staff`)  
> **Base URL:** `https://nhqs.edupod.app`  
> **Companion spec:** `../admin_view/people-e2e-spec.md` (authoritative page inventory); this spec documents scoped variants + negative assertions.

## How this spec relates to the admin spec

Teachers share the same URLs as admins but see a **restricted** People module:

- **Students** — visible (read-only-ish; can view detail, cannot create, edit, change status, or export).
- **Staff** — **hidden from morph-bar sub-strip**. Direct URL navigation must return 403 or a redirect, NOT a silently-loaded list.
- **Households** — **hidden from morph-bar sub-strip**. Same rule.
- **Parents** — accessible via linked students but detail page renders in read-only mode; no edit affordance.
- **Allergy report** — needs `students.view` AND the consent-gated server behaviour; teachers do hold `students.view` so the page loads, but rows filtered by consent are the same as for admin.

Permission summary (from `packages/prisma/seed/system-roles.ts` lines 331–352):

```
'students.view'
'attendance.take', 'attendance.view'
'gradebook.enter_grades', 'gradebook.view', 'gradebook.manage_ai_grading'
'report_cards.view', 'report_cards.comment'
'schedule.view_own', 'schedule.manage_own_preferences', 'schedule.view_own_satisfaction', 'schedule.view_personal_timetable'
'sen.view'
'legal.view'
'inbox.send'
```

Teachers **do NOT** hold `students.manage`, `users.view`, `users.manage`, `payroll.view_bank_details`, or any household-mutation permission.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [Sign-in + morph-bar visibility](#3-sign-in--morph-bar-visibility)
4. [People hub sub-strip (teacher variant)](#4-people-hub-sub-strip-teacher-variant)
5. [Students — List page (teacher)](#5-students--list-page-teacher)
6. [Students — Detail page (teacher)](#6-students--detail-page-teacher)
7. [Students — Create / Edit / Status denied](#7-students--create--edit--status-denied)
8. [Students — Allergy report (teacher)](#8-students--allergy-report-teacher)
9. [Staff — All routes denied](#9-staff--all-routes-denied)
10. [Households — All routes denied](#10-households--all-routes-denied)
11. [Parents — Read via linked student](#11-parents--read-via-linked-student)
12. [Sensitive-data audit](#12-sensitive-data-audit)
13. [Arabic / RTL](#13-arabic--rtl)
14. [Data invariants (teacher scope)](#14-data-invariants-teacher-scope)
15. [Backend endpoint matrix (teacher)](#15-backend-endpoint-matrix-teacher)
16. [Console / network health](#16-console--network-health)
17. [Observations](#17-observations)
18. [Sign-off](#18-sign-off)

---

## 1. Prerequisites

| #   | What to Check                                                                                                                                                                                                                   | Expected Result                                                                                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | Multi-tenant fixture from admin spec §1 is provisioned (Tenant A = NHQS, Tenant B = Acme). Teacher user `teacher@nhqs.test` / `Password123!` exists in Tenant A with role `teacher`.                                            | Fixture present. Login succeeds.                                                                                                                                                                                          |           |
| 1.2 | At least 1 teacher in Tenant A has `class_staff` assignments covering ≥ 2 classes with ≥ 20 total students.                                                                                                                     | `SELECT COUNT(DISTINCT ce.student_id) FROM class_staff cs JOIN classes c ON c.id=cs.class_id JOIN class_enrolments ce ON ce.class_id=c.id WHERE cs.staff_profile_id=<teacher_staff_profile> AND ce.status='active'` ≥ 20. |           |
| 1.3 | Capture UUIDs: `teacher_assigned_student_id` (one they teach), `teacher_unassigned_student_id` (one they do NOT teach). Teacher should see the first in their scope, but the current list is NOT filtered — see observation T1. | Capture both.                                                                                                                                                                                                             |           |
| 1.4 | Capture a staff id, household id, and parent id from Tenant A to use in negative-assertion rows.                                                                                                                                | Captured.                                                                                                                                                                                                                 |           |
| 1.5 | Browser: Chromium, 1440×900 + 375×812. Locale: `/en/*` then `/ar/*`.                                                                                                                                                            | Ready.                                                                                                                                                                                                                    |           |

---

## 2. Out of scope

This spec exercises the People module **from the teacher's browser session only**. It does NOT cover:

- **Admin affordances** (create, edit, export, merge, split, status changes) → `../admin_view/people-e2e-spec.md`.
- **RLS leakage** across tenants → `../integration/people-integration-spec.md`.
- **Worker jobs, cron, dead-letter** → `../worker/people-worker-spec.md`.
- **Perf budgets for teacher-scoped reads** → `../perf/people-perf-spec.md` (teacher users share the same endpoints, so budgets apply identically).
- **OWASP + permission matrix for all roles** → `../security/people-security-spec.md` (includes the full matrix with teacher cells).
- **Parent-perspective / student-perspective** — the People module has no parent/student-facing UI. Parent access to their own child's record lives under `/parent/*` and is covered by `5_operations/communications/` + `4_Wellbeing/` as applicable.

---

## 3. Sign-in + morph-bar visibility

| #   | What to Check                                                                                                                                                                                                                                                                                            | Expected Result                                 | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| 3.1 | Navigate to `https://nhqs.edupod.app/en/login`. Sign in with `teacher@nhqs.test` / `Password123!`.                                                                                                                                                                                                       | Redirects to `/en/dashboard`.                   |           |
| 3.2 | Inspect the morph bar. Hubs visible (per `nav-config.ts`): Home, People, Academics, Assessment Records, Behaviour, Wellbeing, Scheduling (own only), Communications, Pastoral (if conf), Reports (own), Settings (own), Profile. **NOT visible**: Admissions, Finance, Regulatory (or limited), Website. | Hub list matches teacher-role roles.            |           |
| 3.3 | Open DevTools → Application tab → inspect JWT stored in memory (if visible) or inspect `GET /api/v1/me` response. Confirm `roles: ['teacher']`.                                                                                                                                                          | Confirmed.                                      |           |
| 3.4 | Click **People** hub.                                                                                                                                                                                                                                                                                    | Navigates to `/en/students`. Sub-strip appears. |           |

---

## 4. People hub sub-strip (teacher variant)

Per `nav-config.ts`:

```ts
{ labelKey: 'nav.people', roles: STAFF_ROLES, items: [
  { labelKey: 'nav.students', href: '/students' },
  { labelKey: 'nav.staff', href: '/staff', roles: ADMIN_ROLES },
  { labelKey: 'nav.households', href: '/households', roles: ADMIN_ROLES },
]}
```

`STAFF_ROLES` includes teacher; `ADMIN_ROLES` does not. So teachers see only **Students** in the sub-strip.

| #   | What to Check                                                                                        | Expected Result | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 4.1 | Sub-strip renders exactly one item: **Students**. No **Staff**. No **Households**.                   | 1 item.         |           |
| 4.2 | Item is active when URL is `/en/students/*`.                                                         | Correct.        |           |
| 4.3 | Verify the People hub itself is visible (teachers hold `STAFF_ROLES`).                               | Visible.        |           |
| 4.4 | In mobile (375 px), open the hamburger drawer. People expands to show a sub-list with only Students. | Correct.        |           |

---

## 5. Students — List page (teacher)

**URL:** `/{locale}/students`  
**Permission:** teacher has `students.view`, so API returns 200.

### 5.1 Page behaviour

| #     | What to Check                                                                                                                                                                                                                                                                                                                                     | Expected Result                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------- |
| 5.1.1 | Navigate. Heading "Students". List renders.                                                                                                                                                                                                                                                                                                       | 200.                              |           |
| 5.1.2 | **Observation T1 — scope**: the list endpoint `GET /v1/students` does NOT filter by the teacher's class assignments. The teacher sees ALL students in the tenant (same rows admins see). Confirm: row count matches admin count. If the product requires scoping to teacher's classes only, this is a design gap — flag as observation T1 in §17. | Teacher sees full list.           |           |
| 5.1.3 | Export buttons (Excel / PDF) are visible in the toolbar. Teacher holds `students.view`, and the export endpoint uses `students.view` — so the API permits export. Flag as observation T2: teachers exporting the full student roster may not be the intended product behaviour.                                                                   | Buttons present; exports succeed. |           |
| 5.1.4 | Filters (search, status, year group, allergy) work identically to admin (admin spec §4.4–§4.8).                                                                                                                                                                                                                                                   | Works.                            |           |
| 5.1.5 | Row click → `/en/students/{id}` — teacher can view any student's detail (see §6).                                                                                                                                                                                                                                                                 | Navigation works.                 |           |

### 5.2 Negative assertions

| #     | What to Check                                                                                                                                | Expected Result                                                                            | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 5.2.1 | There is NO "New Student" button on the list or in a top-bar quick action (admin spec also notes no button; teachers are no different here). | Correct.                                                                                   |           |
| 5.2.2 | Attempt to navigate directly to `/en/students/new`.                                                                                          | Page loads but form submit fails 403 — OR the layout redirects earlier. Confirm behaviour. |           |

---

## 6. Students — Detail page (teacher)

**URL:** `/{locale}/students/{id}`  
**Permission:** `students.view` (audit classification `special_category`).

### 6.1 Page behaviour

| #     | What to Check                                                                                                         | Expected Result                                                                                        | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 6.1.1 | Navigate to `/en/students/{assignedStudentId}`.                                                                       | 200. Detail renders: header, quick metrics, tabs (Overview, Classes, Homework, Medical, optional SEN). |           |
| 6.1.2 | Navigate to `/en/students/{unassignedStudentId}` (a student the teacher doesn't teach).                               | 200 — the teacher still loads the page. See observation T1.                                            |           |
| 6.1.3 | Header action buttons: **Edit** button is hidden OR disabled. Status Change dropdown is hidden.                       | Hidden/disabled. Confirm via DOM.                                                                      |           |
| 6.1.4 | If Edit is disabled but still visible, clicking it has no effect (preferred) or opens the edit page where PATCH 403s. | Confirm.                                                                                               |           |

### 6.2 Tab behaviour

| #     | What to Check                                                                                                                                                                                                                                                                                                                                                                           | Expected Result | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 6.2.1 | **Overview tab**: parents/guardians section renders with parent EntityLinks. Clicking one navigates to `/en/parents/{id}` (teacher-accessible read-only; see §11).                                                                                                                                                                                                                      | Links work.     |           |
| 6.2.2 | **Classes & Enrolments tab**: shows all enrolments (not filtered to teacher's own classes — see observation T3).                                                                                                                                                                                                                                                                        | All visible.    |           |
| 6.2.3 | **Homework tab**: shows overall + by-subject. API `GET /v1/homework/analytics/student/{id}` — teacher has `gradebook.view` + implicit homework view via their role; confirm no 403. If 403, the tab shows "No homework data available" silently.                                                                                                                                        | Renders.        |           |
| 6.2.4 | **Medical tab**: allergy info visible. Teachers **do** have `students.view` which is the permission on the detail endpoint; medical notes are in the response. This means teachers can see every student's medical information for their tenant, even students they don't teach. Flag T4 (privacy / data minimisation) if the product requires restricting medical to assigned classes. | Visible.        |           |
| 6.2.5 | **SEN tab** (if SEN profile exists): teacher has `sen.view`, so the tab loads. **View Full SEN Profile** button → `/en/sen/students/{id}` (teacher may or may not access that — test target page separately).                                                                                                                                                                           | Tab renders.    |           |

### 6.3 Sensitive-data audit

| #     | What to Check                                                                                                    | Expected Result                                                                                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Each detail view generates an audit row with `actor_id=<teacher.user_id>` and `classification=special_category`. | `SELECT COUNT(*) FROM audit_logs WHERE actor_id=<teacher.user_id> AND metadata->>'classification'='special_category' AND created_at > now() - interval '5 minutes'` increases per view. |           |

---

## 7. Students — Create / Edit / Status denied

### 7.1 Navigation attempts

| #     | What to Check                                   | Expected Result                                                                                                                                    | Pass/Fail |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Navigate directly to `/en/students/new`.        | Either: (a) layout redirects to `/en/students` with no toast, or (b) page loads but form submission fails with 403. If (b), the UI must not crash. |           |
| 7.1.2 | Attempt POST `/v1/students` via DevTools.       | 403 `FORBIDDEN` with `students.manage` required. Toast if surfaced by UI.                                                                          |           |
| 7.1.3 | Navigate to `/en/students/{id}/edit`.           | Same behaviour as 7.1.1.                                                                                                                           |           |
| 7.1.4 | Attempt PATCH `/v1/students/{id}` via DevTools. | 403.                                                                                                                                               |           |
| 7.1.5 | Attempt PATCH `/v1/students/{id}/status`.       | 403.                                                                                                                                               |           |
| 7.1.6 | Attempt GET `/v1/students/{id}/export-pack`.    | 403 (requires `students.manage`).                                                                                                                  |           |

### 7.2 Confirm no data change

| #     | What to Check                                                                                       | Expected Result | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 7.2.1 | After each blocked attempt, run `SELECT updated_at FROM students WHERE id=?` — timestamp unchanged. | No mutation.    |           |

---

## 8. Students — Allergy report (teacher)

**URL:** `/{locale}/students/allergy-report`  
**Permission:** `students.view` (teacher holds this).

| #   | What to Check                                                                                                                                                                                              | Expected Result           | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------- |
| 8.1 | Navigate. Page loads 200.                                                                                                                                                                                  | Correct.                  |           |
| 8.2 | Consent gate applies identically — only students with a granted health-data consent record appear.                                                                                                         | Same count as admin view. |           |
| 8.3 | Filters (year group, class) work.                                                                                                                                                                          | Correct.                  |           |
| 8.4 | **Observation T5**: just like §5.1.2, the allergy report is NOT scoped to the teacher's classes. Teachers can see allergy data for every student tenant-wide. This is a design decision — flag for review. | All rows visible.         |           |
| 8.5 | Audit log row written with classification=`special_category` for the allergy-report load.                                                                                                                  | Row present.              |           |

---

## 9. Staff — All routes denied

**Permission required:** `users.view` (teacher does NOT have it).

| #   | What to Check                                            | Expected Result                                                                                                                                                                                  | Pass/Fail |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | Morph-bar sub-strip does NOT render **Staff**.           | Correct.                                                                                                                                                                                         |           |
| 9.2 | Navigate directly to `/en/staff`.                        | Either: layout redirect to `/en/students` with "access denied" toast, OR the page's API call returns 403 and the UI renders a generic "You do not have permission" page. No staff data rendered. |           |
| 9.3 | Navigate to `/en/staff/{id}`.                            | Same — 403 or redirect.                                                                                                                                                                          |           |
| 9.4 | GET `/v1/staff-profiles` via DevTools.                   | 403.                                                                                                                                                                                             |           |
| 9.5 | GET `/v1/staff-profiles/{id}` via DevTools.              | 403.                                                                                                                                                                                             |           |
| 9.6 | GET `/v1/staff-profiles/{id}/bank-details` via DevTools. | 403 — requires `payroll.view_bank_details`, which the teacher doesn't hold.                                                                                                                      |           |
| 9.7 | POST / PATCH on staff endpoints.                         | 403 — requires `users.manage`.                                                                                                                                                                   |           |
| 9.8 | GET `/v1/staff-profiles/{id}/preview` via DevTools.      | 403 — requires `users.view`.                                                                                                                                                                     |           |

---

## 10. Households — All routes denied

**Permission required:** `students.view` is held BUT the sub-strip hides the Households link. Verify whether the route also rejects teachers.

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                                                                                                                                                             | Pass/Fail |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | Morph-bar sub-strip does NOT render **Households**.  | Correct.                                                                                                                                                                                                                                                                                                                                                    |           |
| 10.2  | Navigate directly to `/en/households`.               | **Observation T6 — the backend policy**: `GET /v1/households` is gated on `students.view`, which teachers HOLD. The page will load; the sub-strip merely hides the link. If the product requires hiding households from teachers server-side, the permission should be tightened to `students.manage` or a new `households.view`. Confirm actual behaviour. |           |
| 10.3  | Navigate to `/en/households/{id}`.                   | Same — the API returns 200 (permission held). The layout MAY redirect based on the nav config; confirm.                                                                                                                                                                                                                                                     |           |
| 10.4  | Navigate to `/en/households/new`.                    | `POST /v1/households` requires `students.manage` → teachers get 403 if they try to submit.                                                                                                                                                                                                                                                                  |           |
| 10.5  | PATCH `/v1/households/{id}` via DevTools.            | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.6  | POST `/v1/households/merge`                          | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.7  | POST `/v1/households/split`                          | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.8  | POST/PATCH/DELETE emergency-contact endpoints.       | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.9  | PUT `/v1/households/{id}/billing-parent`             | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.10 | POST/DELETE `/v1/households/{id}/parents/{parentId}` | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.11 | POST `/v1/households/{id}/students`                  | 403.                                                                                                                                                                                                                                                                                                                                                        |           |
| 10.12 | GET `/v1/households/next-number`                     | 403 (requires `students.manage`).                                                                                                                                                                                                                                                                                                                           |           |
| 10.13 | GET `/v1/households/{id}/preview`                    | 200 (requires `students.view`).                                                                                                                                                                                                                                                                                                                             |           |

---

## 11. Parents — Read via linked student

**URL:** `/{locale}/parents/{id}`  
**Permission:** `students.view` (teacher holds this).

| #    | What to Check                                                                     | Expected Result                                     | Pass/Fail |
| ---- | --------------------------------------------------------------------------------- | --------------------------------------------------- | --------- |
| 11.1 | From a student detail's Parents/Guardians section, click a parent link.           | Navigates to `/en/parents/{id}`. Page renders. 200. |           |
| 11.2 | Parent detail: shows contact info + households + children.                        | Correct.                                            |           |
| 11.3 | No Edit button. (Consistent with admin — no Edit exists on parent detail at all.) | Correct.                                            |           |
| 11.4 | PATCH `/v1/parents/{id}` via DevTools.                                            | 403 — requires `students.manage`.                   |           |
| 11.5 | POST `/v1/parents/{id}/students` via DevTools.                                    | 403.                                                |           |
| 11.6 | Navigate directly to `/en/parents/{unknownId}`.                                   | "Parent not found".                                 |           |
| 11.7 | Navigate to `/en/parents/{tenantB_parent_id}`.                                    | "Parent not found". 404.                            |           |

---

## 12. Sensitive-data audit

| #    | What to Check                                                                                                                            | Expected Result                                                                                             | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Each `/v1/students/:id` read as teacher generates an audit row tagged `special_category`.                                                | Row present with teacher actor.                                                                             |           |
| 12.2 | Attempts to read bank details (denied at 403) do NOT generate a `financial` audit row (the decorator runs only after the guard permits). | `SELECT COUNT(*) FROM audit_logs WHERE actor_id=<teacher> AND metadata->>'classification'='financial'` = 0. |           |
| 12.3 | The allergy-report view as teacher is audited.                                                                                           | Row present.                                                                                                |           |

---

## 13. Arabic / RTL

| #    | What to Check                                                                                                                         | Expected Result     | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 13.1 | Sign out, sign back in at `/ar/login`. Navigate to People hub. Sub-strip has exactly 1 item labelled with `nav.students` translation. | 1 RTL-aligned item. |           |
| 13.2 | Student detail loads with translated headings and RTL layout. Arabic names render right-aligned inside the person-name block.         | Correct.            |           |
| 13.3 | Emails, phone numbers, student numbers remain LTR within the RTL page.                                                                | Correct.            |           |
| 13.4 | Access-denied messaging (when hitting /en/staff) is translated in Arabic.                                                             | Translated.         |           |

---

## 14. Data invariants (teacher scope)

| #    | What to Check                                                                                                                                                   | Query / Result | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 14.1 | Teacher's `students.view` reads must NOT mutate any table. After 20 detail views, `SELECT MAX(updated_at) FROM students` is unchanged vs. the pre-run snapshot. | No drift.      |           |
| 14.2 | Audit log rows for teacher reads exist and have `actor_id=<teacher.user_id>`.                                                                                   | Correct.       |           |
| 14.3 | Denied-write attempts leave the target row's `updated_at` unchanged.                                                                                            | No drift.      |           |
| 14.4 | Cross-tenant attempts (e.g. `/en/students/{tenantB_student_id}`) do not expose any Tenant B data to the teacher's session. Verify by inspecting payloads.       | No leakage.    |           |

---

## 15. Backend endpoint matrix (teacher)

| Endpoint                                  | Method | Teacher outcome | Notes                          |
| ----------------------------------------- | ------ | --------------- | ------------------------------ |
| `/v1/students`                            | GET    | 200             | `students.view`                |
| `/v1/students/:id`                        | GET    | 200             | `students.view`, audited       |
| `/v1/students/:id/preview`                | GET    | 200             | `students.view`                |
| `/v1/students/export-data`                | GET    | 200             | `students.view` — T2 concern   |
| `/v1/students/allergy-report`             | GET    | 200             | `students.view`, consent-gated |
| `/v1/students/:id/export-pack`            | GET    | 403             | `students.manage` required     |
| `/v1/students`                            | POST   | 403             | `students.manage`              |
| `/v1/students/:id`                        | PATCH  | 403             | `students.manage`              |
| `/v1/students/:id/status`                 | PATCH  | 403             | `students.manage`              |
| `/v1/staff-profiles`                      | GET    | 403             | `users.view`                   |
| `/v1/staff-profiles/:id`                  | GET    | 403             | `users.view`                   |
| `/v1/staff-profiles/:id/preview`          | GET    | 403             | `users.view`                   |
| `/v1/staff-profiles/:id/bank-details`     | GET    | 403             | `payroll.view_bank_details`    |
| `/v1/staff-profiles`                      | POST   | 403             | `users.manage`                 |
| `/v1/staff-profiles/:id`                  | PATCH  | 403             | `users.manage`                 |
| `/v1/households`                          | GET    | 200             | `students.view` — T6 concern   |
| `/v1/households/:id`                      | GET    | 200             | `students.view` — T6 concern   |
| `/v1/households/:id/preview`              | GET    | 200             | `students.view`                |
| `/v1/households/next-number`              | GET    | 403             | `students.manage`              |
| `/v1/households`                          | POST   | 403             | `students.manage`              |
| `/v1/households/merge`                    | POST   | 403             | `students.manage`              |
| `/v1/households/split`                    | POST   | 403             | `students.manage`              |
| `/v1/households/:id`                      | PATCH  | 403             | `students.manage`              |
| `/v1/households/:id/status`               | PATCH  | 403             | `students.manage`              |
| `/v1/households/:id/billing-parent`       | PUT    | 403             | `students.manage`              |
| `/v1/households/:id/emergency-contacts`   | POST   | 403             | `students.manage`              |
| `/v1/households/:h/emergency-contacts/:c` | PATCH  | 403             | `students.manage`              |
| `/v1/households/:h/emergency-contacts/:c` | DELETE | 403             | `students.manage`              |
| `/v1/households/:id/parents`              | POST   | 403             | `students.manage`              |
| `/v1/households/:h/parents/:p`            | DELETE | 403             | `students.manage`              |
| `/v1/households/:id/students`             | POST   | 403             | `students.manage`              |
| `/v1/parents`                             | GET    | 200             | `students.view`                |
| `/v1/parents/:id`                         | GET    | 200             | `students.view`                |
| `/v1/parents`                             | POST   | 403             | `students.manage`              |
| `/v1/parents/:id`                         | PATCH  | 403             | `students.manage`              |
| `/v1/parents/:id/students`                | POST   | 403             | `students.manage`              |
| `/v1/parents/:p/students/:s`              | DELETE | 403             | `students.manage`              |

Every row in this matrix must be exercised at least once by the tester (or by the automated integration spec).

---

## 16. Console / network health

| #    | What to Check                                                                                                                                     | Expected Result | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 16.1 | Zero uncaught exceptions in Console during a full teacher run.                                                                                    | Correct.        |           |
| 16.2 | 403s fire exactly where expected per §15 — no stray 403s on read endpoints the teacher holds.                                                     | Correct.        |           |
| 16.3 | No 5xx responses.                                                                                                                                 | Correct.        |           |
| 16.4 | Forbidden responses carry the structured `{ code, message }` shape with code `FORBIDDEN` or `INSUFFICIENT_PERMISSION` (per the permission guard). | Correct.        |           |

---

## 17. Observations

| ID  | Severity     | Area                                         | Observation                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence                                         |
| --- | ------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| T1  | P2 (design)  | Students list scope                          | Teacher sees the **full** tenant-wide student list — not scoped to their assigned classes. If the product requires class-scoped visibility, a filter (e.g. `teacherScopeGuard`) or query constraint must be added to `GET /v1/students` for teacher tier.                                                                                                                                                                    | `students.service.ts:253-314`                    |
| T2  | P2 (design)  | Students export scope                        | Teachers can export the full tenant-wide student roster via `/v1/students/export-data` (permission is `students.view`). Product may want to scope exports to teachers' classes only, or require `students.manage`.                                                                                                                                                                                                           | `students.controller.ts:128-143`                 |
| T3  | P3 (design)  | Student detail enrolments                    | Classes tab on student detail shows all enrolments, not only the teacher's own classes.                                                                                                                                                                                                                                                                                                                                      | Student detail page                              |
| T4  | P2 (privacy) | Medical data access                          | Teachers can see every student's medical tab (allergy + medical notes). This is broader than many schools permit — typically only the school nurse, pastoral team, or a student's teacher on a need-to-know basis should see medical data. Consider gating medical fields behind `sen.view_sensitive` or a new `students.view_medical`.                                                                                      | `students.service.ts:319-371`                    |
| T5  | P2 (privacy) | Allergy report scope                         | Same concern as T4 — allergy report is tenant-wide for teachers.                                                                                                                                                                                                                                                                                                                                                             | `students.service.ts:688-745`                    |
| T6  | P2 (design)  | Households visibility                        | The `/v1/households` endpoints (GET list + GET detail + preview) accept `students.view`, which teachers hold. The sub-strip hides the **link**, but teachers can still reach the data via direct URL navigation (e.g. following a link from a student's detail). If the product requires households to be admin-only, tighten the permission on these three endpoints to `students.manage` (or introduce `households.view`). | `households.controller.ts:85-99,128-132,239-243` |
| T7  | P3 (UX)      | Access-denied UX                             | When teachers hit `/en/staff` (or an analogous denied route), the user experience varies — layout redirect vs. inline 403 render. A consistent "access denied" page with a clear heading + link back would improve teacher ergonomics when they land on a denied route via an email link.                                                                                                                                    | Layout + permission-guard wiring                 |
| T8  | P3 (UX)      | Edit affordance visibility on student detail | Student detail's Edit button may render for teachers and only fail on click. Hide it client-side when the user lacks `students.manage` to prevent confusion.                                                                                                                                                                                                                                                                 | Student detail page                              |

---

## 18. Sign-off

| Section                          | Reviewer | Date | Pass | Fail | Blocker? | Notes |
| -------------------------------- | -------- | ---- | ---- | ---- | -------- | ----- |
| 3. Sign-in + hub visibility      |          |      |      |      |          |       |
| 4. Sub-strip (teacher variant)   |          |      |      |      |          |       |
| 5. Students list (teacher)       |          |      |      |      |          |       |
| 6. Students detail (teacher)     |          |      |      |      |          |       |
| 7. Create / Edit / Status denied |          |      |      |      |          |       |
| 8. Allergy report (teacher)      |          |      |      |      |          |       |
| 9. Staff denied                  |          |      |      |      |          |       |
| 10. Households denied            |          |      |      |      |          |       |
| 11. Parents read-only            |          |      |      |      |          |       |
| 12. Sensitive-data audit         |          |      |      |      |          |       |
| 13. Arabic / RTL                 |          |      |      |      |          |       |
| 14. Data invariants              |          |      |      |      |          |       |
| 15. Endpoint matrix              |          |      |      |      |          |       |
| 16. Console / network health     |          |      |      |      |          |       |

**Spec release-ready when:**

- Every row signed off Pass, AND
- Zero Fails in §7, §9, §10, §12 (negative assertions — these are where permission leakage would show), AND
- Observations T1–T6 reviewed and accepted OR resolved before onboarding any tenant that requires strict teacher scoping.

---

**End of Teacher Spec.**
