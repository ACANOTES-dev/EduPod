# E2E Test Specification: Report Cards (Student View)

> **Scope Statement.** The Report Cards module has **no dedicated student portal pages**. There is no `/en/report-cards` surface for students, no "My Report Cards" page, no student-specific dashboard tile, and no navigation hub that exposes published report cards to the pupil directly. This spec documents (a) student access to their own published report cards via the shared PDF/JSON endpoints plus the public `/verify/:token` viewer, and (b) every negative boundary — the long list of admin/teacher/parent surfaces the student role MUST be denied.
>
> The guiding rule for every row below: **unless a cell explicitly says ALLOWED, the Pass/Fail column verifies a denial** (403, redirect, empty state, hidden nav item, or "permission denied" toast).
>
> **Pages / endpoints evaluated for the student role (all DENIED unless noted):**
>
> 1. `/en/report-cards` — admin/teacher dashboard — DENIED
> 2. `/en/report-cards/library` — DENIED
> 3. `/en/report-cards/generate` — DENIED
> 4. `/en/report-cards/analytics` — DENIED
> 5. `/en/report-cards/settings` — DENIED
> 6. `/en/report-cards/[classId]` — class matrix — DENIED
> 7. `/en/report-comments*` — teacher comment workspace — DENIED
> 8. `/en/report-cards/requests*` — teacher requests — DENIED
> 9. `GET /v1/report-cards/:id/pdf` — ALLOWED **only for own published report card** (permission `gradebook.view` scoped to linked student row)
> 10. `GET /v1/report-cards/:id` — ALLOWED **only for own published report card**
> 11. `GET /verify/:token` — ALLOWED (public viewer, token IS the auth)
> 12. `POST /v1/parent/report-cards/:id/acknowledge` — DENIED (parent-only route)
>
> **Matching specs:** `../admin_view/`, `../teacher_view/`, `../parent_view/` — run as a suite.

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite account:** **Ahmed Hassan** (`student.hassan@nhqs.test` / `Password123!`), Student role in tenant **Nurul Huda School (NHQS)**.

> **Precondition — VERIFY BEFORE RUN:** the account `student.hassan@nhqs.test` must exist with the `student` role, must be linked (via `student_user_link`) to a real student row in NHQS, and that student must have **at least one report card with `status = 'published'`** for the current academic period. If any of the three is missing, capture the gap in §18 and rerun once fixed.

**Navigation entry point:** Students have no morph-bar link to Report Cards — this spec largely exercises direct URL navigation and API probes using the student JWT.

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites--test-data)
2. [Login & Student Landing](#2-login--student-landing)
3. [Student Hub Navigation — No Report Cards Tab](#3-student-hub-navigation--no-report-cards-tab)
4. [Student Dashboard — "My Report Cards" Card](#4-student-dashboard--my-report-cards-card)
5. [Direct URL Attempts — All School-Facing Routes](#5-direct-url-attempts--all-school-facing-routes)
6. [Student's Own Report Card PDF Download](#6-students-own-report-card-pdf-download)
7. [Student's Own Report Card JSON](#7-students-own-report-card-json)
8. [Public Verification Viewer (`/verify/:token`)](#8-public-verification-viewer-verifytoken)
9. [Cross-Student Blocking — Student A Probes Student B](#9-cross-student-blocking--student-a-probes-student-b)
10. [Acknowledgment — Students CANNOT Acknowledge](#10-acknowledgment--students-cannot-acknowledge)
11. [Teacher Comments Visibility](#11-teacher-comments-visibility)
12. [Grade Visibility — Own Matrix Row Only](#12-grade-visibility--own-matrix-row-only)
13. [What Students MUST NOT See or Do (Negative Matrix)](#13-what-students-must-not-see-or-do-negative-matrix)
14. [Arabic / RTL — Student Locale Switch](#14-arabic--rtl--student-locale-switch)
15. [Mobile Responsiveness (375px)](#15-mobile-responsiveness-375px)
16. [Console & Network Health](#16-console--network-health)
17. [Backend Endpoint Map (Student Scope)](#17-backend-endpoint-map-student-scope)
18. [Observations & Gaps Flagged](#18-observations--gaps-flagged)
19. [Sign-Off](#19-sign-off)

---

## 1. Prerequisites & Test Data

| #   | What to Check                                                             | Expected Result                                                                                | Pass/Fail |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 1.1 | User row: `SELECT * FROM users WHERE email = 'student.hassan@nhqs.test'`  | Exactly one row. `status = 'active'`.                                                          |           |
| 1.2 | Membership holds the `student` role in NHQS (`role_key = 'student'`)      | Exactly one active membership in NHQS tenant; no other tenant memberships for this user.       |           |
| 1.3 | `student_user_link` row connects this user to a `students.id` in NHQS     | Exactly one link; `student_id` is used below as `OWN_STUDENT_ID`.                              |           |
| 1.4 | `SELECT id, status FROM report_cards WHERE student_id = OWN_STUDENT_ID`   | At least one row with `status = 'published'` for current period. Record its id as `OWN_RC_ID`. |           |
| 1.5 | Capture a **different** student's published report card id in same tenant | Record as `OTHER_RC_ID`. Must belong to a student Ahmed is NOT linked to.                      |           |
| 1.6 | Capture a published report card id from a **different tenant**            | Record as `CROSS_TENANT_RC_ID`. Must be a tenant Ahmed has no membership in (RLS boundary).    |           |
| 1.7 | Capture a valid `verification_token` for `OWN_RC_ID`                      | Record as `OWN_VERIFY_TOKEN`.                                                                  |           |
| 1.8 | Capture a valid `verification_token` for `OTHER_RC_ID`                    | Record as `OTHER_VERIFY_TOKEN`.                                                                |           |

> If **1.1–1.4** are not all satisfied, abort and raise in §18 as a blocker. The rest of the spec presumes these baseline fixtures.

---

## 2. Login & Student Landing

| #   | What to Check                                                          | Expected Result                                                                                                                                                             | Pass/Fail |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Open `https://nhqs.edupod.app/en/login` in a fresh incognito window    | Login form renders.                                                                                                                                                         |           |
| 2.2 | Enter `student.hassan@nhqs.test` / `Password123!` and click **Log in** | Browser navigates away from `/login`. Record actual landing URL.                                                                                                            |           |
| 2.3 | Confirm landing route                                                  | **GAP CHECK:** `apps/web/src/app/[locale]/(auth)/login/page.tsx` only routes `parent` and `teacher` explicitly — student falls through to `/en/dashboard`. Log actual path. |           |
| 2.4 | Top-right profile button                                               | Initials **AH**, name **Ahmed Hassan**, role label **Student**.                                                                                                             |           |
| 2.5 | Auth JWT payload contains `role_key = 'student'` and a `membership_id` | Decode `accessToken` from the auth provider — verify role + active membership.                                                                                              |           |
| 2.6 | Auth JWT does **NOT** carry admin/staff permissions                    | Payload's resolved permissions must NOT include `report_cards.manage`, `report_cards.view`, `report_cards.comment`, `gradebook.publish_report_cards`.                       |           |

---

## 3. Student Hub Navigation — No Report Cards Tab

| #   | What to Check                                                      | Expected Result                                                                                                                                                     | Pass/Fail |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Morph bar hubs visible after login                                 | Student sees a minimal hub set (Home only, or Home + Learning limited to their own class); **Finance, Operations, Reports, Settings, People hubs MUST NOT render**. |           |
| 3.2 | Search the morph bar text for "Report Cards"                       | No match — no nav entry, no sub-strip link.                                                                                                                         |           |
| 3.3 | Click **Learning** (if present) and inspect the Learning sub-strip | No **Assessment → Report Cards** tile. If Assessment tab renders, it must contain no link to `/report-cards`.                                                       |           |
| 3.4 | Command palette / search (`Cmd+K`) query "report card"             | No navigation result returned. No link to `/report-cards`, `/report-comments`, or `/report-cards/library`.                                                          |           |
| 3.5 | Inspect page HTML for any `<a href="/en/report-cards...">`         | Zero matches across the rendered DOM.                                                                                                                               |           |

---

## 4. Student Dashboard — "My Report Cards" Card

| #   | What to Check                                                          | Expected Result                                                                                                                                                                                                                                       | Pass/Fail |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Inspect dashboard landing (likely `/en/dashboard` after 2.3)           | Page renders without crashing. **GAP CHECK:** `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` routes Admin/Teacher/Parent/FrontOffice/Accounting homes only — there is no `StudentHome`. Student sees a generic or empty shell.               |           |
| 4.2 | Scan dashboard tiles for a "My Report Cards" surface                   | Expected: no tile exists today. If one renders, it must list ONLY `OWN_RC_ID` and no other student's row.                                                                                                                                             |           |
| 4.3 | If a tile renders, clicking **Download PDF** on `OWN_RC_ID`            | Must call `GET /v1/report-cards/OWN_RC_ID/pdf` with the student JWT and return a 200 PDF. See §6.                                                                                                                                                     |           |
| 4.4 | If a tile renders, clicking **View PDF** on any row NOT owned by Ahmed | Must not exist in the rendered data. A forged DOM click would 403 — see §9.                                                                                                                                                                           |           |
| 4.5 | Silent 4xx on dashboard load                                           | The admin/parent dashboard fetches (`/api/v1/dashboard/school-admin`, `/api/v1/finance/dashboard`, `/api/v1/report-card-teacher-requests`, etc.) MUST NOT fire for the student — or if they do, they must 403 silently without leaking any data rows. |           |

---

## 5. Direct URL Attempts — All School-Facing Routes

Every row below: navigate to the URL directly in the browser (same tab, authenticated session). Record behaviour. Allowed outcomes: **redirect to a safe page** (dashboard or login) **or** a permission-denied surface (403 page, toast "You don't have permission"). **Unacceptable:** page renders successfully with any real data.

| #    | URL                                                       | Expected Result                                                                                                                                         | Pass/Fail |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | `/en/report-cards`                                        | Redirect away OR 403. No dashboard panels, no class tiles, no counts.                                                                                   |           |
| 5.2  | `/en/report-cards/library`                                | Redirect or 403. Underlying `GET /v1/report-cards/library` must 403 for student (requires `report_cards.view`).                                         |           |
| 5.3  | `/en/report-cards/library?academic_period_id=...`         | Same as 5.2. Query-param variant must not unlock the page.                                                                                              |           |
| 5.4  | `/en/report-cards/generate`                               | Redirect or 403. Wizard must not render. `POST /v1/report-cards/generation-runs/dry-run` + `/generation-runs` both require `report_cards.manage` → 403. |           |
| 5.5  | `/en/report-cards/bulk`                                   | Redirect or 403.                                                                                                                                        |           |
| 5.6  | `/en/report-cards/analytics`                              | Redirect or 403.                                                                                                                                        |           |
| 5.7  | `/en/report-cards/settings`                               | Redirect or 403. `GET /v1/report-cards/settings` requires `report_cards.manage`.                                                                        |           |
| 5.8  | `/en/report-cards/approvals`                              | Redirect or 403.                                                                                                                                        |           |
| 5.9  | `/en/report-cards/requests`                               | Redirect or 403.                                                                                                                                        |           |
| 5.10 | `/en/report-cards/requests/new`                           | Redirect or 403.                                                                                                                                        |           |
| 5.11 | `/en/report-cards/requests/{anyId}`                       | Redirect or 403. No request detail rendered.                                                                                                            |           |
| 5.12 | `/en/report-cards/{anyClassId}` (class matrix)            | Redirect or 403. Matrix API requires `report_cards.view` + class scope — student has neither.                                                           |           |
| 5.13 | `/en/report-comments`                                     | Redirect or 403. Landing scope lookup returns empty — page must not render the scoped shell either.                                                     |           |
| 5.14 | `/en/report-comments/overall/{anyClassId}`                | Redirect or 403.                                                                                                                                        |           |
| 5.15 | `/en/report-comments/subject/{anyClassId}/{anySubjectId}` | Redirect or 403.                                                                                                                                        |           |
| 5.16 | Browser back/forward after a 403                          | Returning to a previous admin URL must re-deny — no stale content shown from the history cache.                                                         |           |

---

## 6. Student's Own Report Card PDF Download

The `GET /v1/report-cards/:id/pdf` route is decorated `@RequiresPermission('gradebook.view')`. The student role may hold `gradebook.view` to allow own-grade reading. Regardless, the student MUST only succeed for their own linked report card.

| #   | What to Check                                                                                  | Expected Result                                                                                                                                          | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | `GET /api/v1/report-cards/OWN_RC_ID/pdf` with student JWT — **IF** role holds `gradebook.view` | 200 OK, `Content-Type: application/pdf`, `Content-Disposition: inline; filename="report-card.pdf"`. Body is a non-empty PDF. Record outcome for §17.     |           |
| 6.2 | If 6.1 returns 403                                                                             | Document in §18 as a GAP: "student role lacks `gradebook.view` and therefore cannot view own published report card PDF." Until fixed, rows 6.3–6.5 skip. |           |
| 6.3 | Open the returned PDF and verify it is Ahmed's report card                                     | Cover page shows student name **Ahmed Hassan**, correct class, correct academic period. No other students' data leaks into the document.                 |           |
| 6.4 | Download while logged out (no JWT)                                                             | 401 Unauthorized. No PDF served.                                                                                                                         |           |
| 6.5 | Download with an expired / tampered JWT                                                        | 401 Unauthorized.                                                                                                                                        |           |
| 6.6 | Hit `GET /api/v1/report-cards/OWN_RC_ID/pdf` when `OWN_RC_ID.status = 'draft'`                 | 404 or 403 (drafts must not be visible to students even if the id is the student's own). Record which.                                                   |           |

---

## 7. Student's Own Report Card JSON

| #   | What to Check                                                                           | Expected Result                                                                                                                                    | Pass/Fail |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | `GET /api/v1/report-cards/OWN_RC_ID` with student JWT                                   | If permitted: 200 with full DTO. Response must include `student_id = OWN_STUDENT_ID` and `status = 'published'`.                                   |           |
| 7.2 | `GET /api/v1/report-cards?student_id=OWN_STUDENT_ID` (list endpoint)                    | If `gradebook.view` is granted, this would return rows unfiltered by class scope. Expected behaviour: either 403 OR only own rows. Capture actual. |           |
| 7.3 | `GET /api/v1/report-cards?student_id=OTHER_STUDENT_ID`                                  | 403 or empty `data: []`. Never returns another student's rows.                                                                                     |           |
| 7.4 | `GET /api/v1/report-cards?status=draft`                                                 | Drafts must not leak — 403 or empty.                                                                                                               |           |
| 7.5 | `GET /api/v1/report-cards` (no filter)                                                  | Either 403 OR restricted to own student. Never returns the full tenant library.                                                                    |           |
| 7.6 | Response body does NOT contain internal fields (`approvals`, `generation_run_metadata`) | Student DTO is a minimal published-card shape. Any leak is a finding.                                                                              |           |

---

## 8. Public Verification Viewer (`/verify/:token`)

The public verification viewer is unauthenticated — the token is the auth. A student may paste any token and see the summary just like any other person.

| #   | What to Check                                                               | Expected Result                                                                                                                                                       | Pass/Fail |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Open `/en/verify/OWN_VERIFY_TOKEN` in a new incognito tab                   | Public viewer renders. Shows student name, class, academic period, key totals. No login required.                                                                     |           |
| 8.2 | Open `/en/verify/OWN_VERIFY_TOKEN` while logged in as Ahmed                 | Same public view renders. Session cookie does not alter the page.                                                                                                     |           |
| 8.3 | Open `/en/verify/OTHER_VERIFY_TOKEN`                                        | Viewer renders **OTHER student's** summary — this is by design. Token IS the auth. Confirm no tenant leakage into the page chrome (tenant name matches token tenant). |           |
| 8.4 | Open `/en/verify/INVALID-TOKEN-STRING`                                      | 404 "Certificate not found" or equivalent. No PII leaks.                                                                                                              |           |
| 8.5 | Open `/en/verify/<revoked-token>`                                           | 404 / "revoked" state. No data returned.                                                                                                                              |           |
| 8.6 | Public viewer exposes no internal ids (no `report_card_id`, no `tenant_id`) | Verify network payload only includes display fields.                                                                                                                  |           |

---

## 9. Cross-Student Blocking — Student A Probes Student B

These tests confirm that even when the student holds `gradebook.view`, backend scoping restricts them to rows linked to their own `student_id`.

| #   | What to Check                                                       | Expected Result                                                                            | Pass/Fail |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 9.1 | `GET /api/v1/report-cards/OTHER_RC_ID` with Ahmed's JWT             | 403 or 404. Never 200 with another student's DTO.                                          |           |
| 9.2 | `GET /api/v1/report-cards/OTHER_RC_ID/pdf` with Ahmed's JWT         | 403 or 404. No PDF body. Content-Type must not be `application/pdf` on the error response. |           |
| 9.3 | `GET /api/v1/report-cards/CROSS_TENANT_RC_ID` with Ahmed's JWT      | 404 (RLS hides row entirely). Never 200. Never 403 revealing tenant existence.             |           |
| 9.4 | `GET /api/v1/report-cards/CROSS_TENANT_RC_ID/pdf`                   | 404. PDF must not render.                                                                  |           |
| 9.5 | Forged `GET /api/v1/report-cards/classes/{anyClassId}/matrix`       | 403 — requires `report_cards.view`.                                                        |           |
| 9.6 | Forged `GET /api/v1/report-cards/library`                           | 403.                                                                                       |           |
| 9.7 | Forged `GET /api/v1/report-cards/library/grouped`                   | 403.                                                                                       |           |
| 9.8 | Forged `GET /api/v1/report-cards/library/bundle-pdf?class_ids=...`  | 403 — requires `report_cards.manage`.                                                      |           |
| 9.9 | Forged `POST /api/v1/report-cards/generation-runs` with any payload | 403 — requires `report_cards.manage`.                                                      |           |

---

## 10. Acknowledgment — Students CANNOT Acknowledge

Acknowledgment is a **parent-only** action. The `report_card_acknowledgments` table keys rows by `parent_id`. A student has no parent row and no acknowledgment capability.

| #    | What to Check                                                                  | Expected Result                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------- |
| 10.1 | `POST /api/v1/parent/report-cards/OWN_RC_ID/acknowledge` with Ahmed's JWT      | 403 Forbidden — route is parent-scoped. No row written to `report_card_acknowledgments`. |           |
| 10.2 | `POST /api/v1/parent/report-cards/OTHER_RC_ID/acknowledge`                     | 403. Never creates an acknowledgment row attributed to Ahmed.                            |           |
| 10.3 | Any UI "Acknowledge" button in a student shell                                 | Must not exist. Grep the rendered DOM for `acknowledge` — zero matches.                  |           |
| 10.4 | `SELECT * FROM report_card_acknowledgments WHERE parent_id = <any>` after 10.1 | No new rows linked to Ahmed or any parent. Table state unchanged.                        |           |

---

## 11. Teacher Comments Visibility

Published report cards include overall + subject teacher comments inside `snapshot_payload_json`. Whether the student can see those comments (as rendered inside their own PDF / JSON) must be documented.

| #    | What to Check                                                                      | Expected Result                                                                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Open `OWN_RC_ID` PDF (from §6). Are the homeroom/overall comments visible?         | Document the answer. Expected: visible in the PDF — overall comments are part of the published snapshot and there is no per-role redaction today. |           |
| 11.2 | Are subject teacher comments visible?                                              | Document. Expected: visible (same snapshot).                                                                                                      |           |
| 11.3 | `GET /api/v1/report-card-overall-comments?class_id=...` with student JWT           | 403. These are authoring endpoints, not student-facing.                                                                                           |           |
| 11.4 | `GET /api/v1/report-card-subject-comments?class_id=...`                            | 403.                                                                                                                                              |           |
| 11.5 | `POST /api/v1/report-card-overall-comments` or `/subject-comments` (write attempt) | 403 — requires `report_cards.comment`.                                                                                                            |           |
| 11.6 | Student cannot see **in-progress / draft** comments for their own card             | Unpublished comments must never appear. Verify by pulling a draft card (if any) via API — must return 403 or hide draft commentary fields.        |           |

---

## 12. Grade Visibility — Own Matrix Row Only

| #    | What to Check                                                                  | Expected Result                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | `GET /api/v1/report-cards/classes/{OWN_CLASS_ID}/matrix`                       | 403 — requires `report_cards.view`. Student must NOT see the class-wide grade matrix (that would reveal peers' grades). |           |
| 12.2 | Confirm PDF from §6 contains only Ahmed's grades (not a peer row)              | Inspect every table — every row keyed to `student_id` must be `OWN_STUDENT_ID`.                                         |           |
| 12.3 | `GET /api/v1/gradebook/students/OWN_STUDENT_ID/period-grades` with student JWT | If `gradebook.view` granted: 200 with own grades. Otherwise 403. Document.                                              |           |
| 12.4 | `GET /api/v1/gradebook/students/OTHER_STUDENT_ID/period-grades`                | 403 / 404. Never another student's grades.                                                                              |           |
| 12.5 | Any UI that renders a class-wide grade heatmap for the student                 | Must not exist.                                                                                                         |           |

---

## 13. What Students MUST NOT See or Do (Negative Matrix)

| #     | Surface                                                          | Expected Denial                                                            | Pass/Fail |
| ----- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 13.1  | Morph bar link to Report Cards                                   | Not present.                                                               |           |
| 13.2  | Dashboard KPI for "Pending Report Card Requests"                 | Not present.                                                               |           |
| 13.3  | Dashboard KPI for "Cards Awaiting Approval"                      | Not present.                                                               |           |
| 13.4  | Class Matrix page                                                | 403 / redirect.                                                            |           |
| 13.5  | Library list / grouped / bundle PDF                              | 403.                                                                       |           |
| 13.6  | Generation wizard                                                | 403 / redirect.                                                            |           |
| 13.7  | Generation run listing / status                                  | 403.                                                                       |           |
| 13.8  | Approval queue                                                   | 403.                                                                       |           |
| 13.9  | Analytics dashboard                                              | 403.                                                                       |           |
| 13.10 | Tenant settings (signature, banner, thresholds, comment windows) | 403.                                                                       |           |
| 13.11 | Comment windows list / edit                                      | 403.                                                                       |           |
| 13.12 | Overall comments authoring surface                               | 403.                                                                       |           |
| 13.13 | Subject comments authoring surface                               | 403.                                                                       |           |
| 13.14 | AI-draft comment endpoints                                       | 403.                                                                       |           |
| 13.15 | Teacher request create / cancel / reject                         | 403.                                                                       |           |
| 13.16 | Publish / revise / bulk-delete endpoints                         | 403.                                                                       |           |
| 13.17 | Download another student's PDF                                   | 403 / 404.                                                                 |           |
| 13.18 | Read another student's JSON                                      | 403 / 404.                                                                 |           |
| 13.19 | Read cross-tenant report card                                    | 404 (RLS).                                                                 |           |
| 13.20 | Acknowledge (own or other)                                       | 403.                                                                       |           |
| 13.21 | Custom field authoring / template selection                      | 403.                                                                       |           |
| 13.22 | Transcript generation endpoint                                   | 403 (unless student transcript viewer is intentionally enabled; document). |           |

---

## 14. Arabic / RTL — Student Locale Switch

| #    | What to Check                                                        | Expected Result                                                                                         | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Switch locale to `ar` from the profile menu                          | All reachable pages (login, dashboard shell) mirror; `dir="rtl"` on `<html>`.                           |           |
| 14.2 | Navigate `/ar/report-cards`                                          | Same 403 / redirect behaviour as `/en/report-cards`. No locale bypass.                                  |           |
| 14.3 | `GET /api/v1/report-cards/OWN_RC_ID/pdf` when `template_locale = ar` | PDF renders with Arabic glyphs, RTL layout, Eastern-sensitive typography. No mojibake.                  |           |
| 14.4 | `/ar/verify/OWN_VERIFY_TOKEN`                                        | Public viewer renders in Arabic. School name (Arabic variant) and student name render correctly in RTL. |           |
| 14.5 | Locale switch does not change role boundaries                        | Every 403 in §5 / §9 repeats identically under `/ar/*` paths.                                           |           |

---

## 15. Mobile Responsiveness (375px)

| #    | What to Check                                                 | Expected Result                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Resize browser to 375×667 (iPhone SE). Log in as Ahmed        | Login form usable; inputs full-width; no horizontal scroll.                                              |           |
| 15.2 | Dashboard shell at 375px                                      | Morph bar collapses to hamburger. Content area has no horizontal overflow (`overflow-x-hidden` honored). |           |
| 15.3 | Hit `/en/report-cards` at 375px                               | 403 / redirect renders cleanly. No layout break on error page.                                           |           |
| 15.4 | Open `/verify/OWN_VERIFY_TOKEN` at 375px                      | Viewer readable; no overflow. Tap targets ≥ 44×44px.                                                     |           |
| 15.5 | Trigger `GET /v1/report-cards/OWN_RC_ID/pdf` on mobile Safari | Browser opens the PDF inline (or prompts download). PDF is legible when zoomed to fit width.             |           |
| 15.6 | All interactive elements on student dashboard ≥ 44×44px       | Profile button, locale switcher, logout button all meet touch-target floor.                              |           |

---

## 16. Console & Network Health

| #    | What to Check                                                 | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.1 | After login, inspect DevTools → Network                       | No successful (2xx) calls to admin-only endpoints (`/dashboard/school-admin`, `/report-cards/library`, `/report-card-teacher-requests`, `/analytics`). |           |
| 16.2 | DevTools → Console                                            | No red errors. Any 403 from a stray fetch should be silently handled (empty catch prohibited — must log via `console.error('[...]')`).                 |           |
| 16.3 | No response payload contains another tenant's `tenant_id`     | Grep Network responses for tenant ids other than NHQS.                                                                                                 |           |
| 16.4 | No response payload contains another student's `student_id`   | Only `OWN_STUDENT_ID` appears in student-scoped responses.                                                                                             |           |
| 16.5 | Repeated page loads stable (no flashing/remount of the shell) | Morph bar stays visually stable per frontend shell rule.                                                                                               |           |
| 16.6 | Any `Cache-Control` on PDF responses                          | Must NOT be publicly cacheable. Expect `private` or `no-store` for per-student PDF endpoint.                                                           |           |

---

## 17. Backend Endpoint Map (Student Scope)

| Endpoint                                               | Required Permission               | Student Outcome                                                                                         |
| ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET  /v1/report-cards`                                | `gradebook.view`                  | If granted → scoped to own student only (or 403 if role lacks key). Never returns other students' rows. |
| `GET  /v1/report-cards/:id`                            | `gradebook.view`                  | ALLOWED for `OWN_RC_ID` only (when published). 403/404 for all others.                                  |
| `GET  /v1/report-cards/:id/pdf`                        | `gradebook.view`                  | ALLOWED for `OWN_RC_ID` only. 403/404 for all others.                                                   |
| `PATCH /v1/report-cards/:id`                           | `gradebook.manage`                | DENIED.                                                                                                 |
| `POST /v1/report-cards/:id/publish`                    | `gradebook.publish_report_cards`  | DENIED.                                                                                                 |
| `POST /v1/report-cards/:id/revise`                     | `gradebook.manage`                | DENIED.                                                                                                 |
| `POST /v1/report-cards/generate`                       | `gradebook.manage`                | DENIED.                                                                                                 |
| `POST /v1/report-cards/generation-runs`                | `report_cards.manage`             | DENIED.                                                                                                 |
| `POST /v1/report-cards/generation-runs/dry-run`        | `report_cards.manage`             | DENIED.                                                                                                 |
| `GET  /v1/report-cards/generation-runs[ /:id]`         | `report_cards.manage`             | DENIED.                                                                                                 |
| `GET  /v1/report-cards/library`                        | `report_cards.view`               | DENIED.                                                                                                 |
| `GET  /v1/report-cards/library/grouped`                | `report_cards.view`               | DENIED.                                                                                                 |
| `GET  /v1/report-cards/library/bundle-pdf`             | `report_cards.manage`             | DENIED.                                                                                                 |
| `GET  /v1/report-cards/classes/:classId/matrix`        | `report_cards.view` + class scope | DENIED.                                                                                                 |
| `POST /v1/report-cards/bulk-delete`                    | `report_cards.manage`             | DENIED.                                                                                                 |
| `DELETE /v1/report-cards/:id`                          | `report_cards.manage`             | DENIED.                                                                                                 |
| `GET/POST /v1/report-card-overall-comments*`           | `report_cards.comment`            | DENIED.                                                                                                 |
| `GET/POST /v1/report-card-subject-comments*`           | `report_cards.comment`            | DENIED.                                                                                                 |
| `GET/POST /v1/report-comment-windows*`                 | `report_cards.manage`             | DENIED.                                                                                                 |
| `POST /v1/report-card-overall-comments/ai-draft`       | `report_cards.comment`            | DENIED.                                                                                                 |
| `GET  /v1/report-cards/settings` and variants          | `report_cards.manage`             | DENIED.                                                                                                 |
| `GET  /v1/report-card-teacher-requests*`               | `report_cards.manage`/`comment`   | DENIED.                                                                                                 |
| `GET  /v1/report-cards/analytics`                      | `report_cards.manage`             | DENIED.                                                                                                 |
| `POST /v1/parent/report-cards/:id/acknowledge`         | parent scope (not student)        | DENIED.                                                                                                 |
| `GET  /api/v1/parent/report-card-history`              | parent scope                      | DENIED.                                                                                                 |
| `GET  /verify/:token` (public)                         | none — token IS auth              | ALLOWED for any valid token (public).                                                                   |
| `GET  /v1/gradebook/students/:studentId/period-grades` | `gradebook.view`                  | ALLOWED only when `studentId = OWN_STUDENT_ID`. 403/404 otherwise.                                      |

---

## 18. Observations & Gaps Flagged

Log each as Severity (High / Med / Low), File/Route, Recommendation.

| #    | Observation                                                                                                                                                                                                                                                                                                                                                                    | Severity | Recommendation                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18.1 | **No student-specific dashboard exists.** `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` branches on Admin / Teacher / Parent / FrontOffice / Accounting — no `StudentHome`. Students fall into a generic shell with no "My Report Cards" tile.                                                                                                                       | High     | Build `dashboard/student/page.tsx` with a "My Report Cards" list sourced from `GET /v1/report-cards?student_id=OWN`. Add an explicit student landing route to `getDashboardPath()` in the login page.       |
| 18.2 | **No `/en/dashboard/student` route.** `login/page.tsx` only maps `parent` and `teacher` explicitly, so students get `/en/dashboard` (the admin shell).                                                                                                                                                                                                                         | High     | Add `if (roleKeys.includes('student')) return ...dashboard/student`.                                                                                                                                        |
| 18.3 | **Report Cards module has no student portal surface at all.** Every page under `/report-cards` targets staff. Students can only reach their own card via direct-hit `GET /v1/report-cards/:id/pdf` — requires knowing the id.                                                                                                                                                  | High     | Add a student-facing list view (or at least a dashboard tile) that enumerates their own published report cards by period and offers PDF download.                                                           |
| 18.4 | **`gradebook.view` permission granting is ambiguous for students.** If the `student` role carries `gradebook.view`, the list endpoint `GET /v1/report-cards` without a `student_id` filter may return the entire tenant library (no student-scope guard in the controller today — scoping is keyed on teacher-scope helpers). Confirm actual behaviour in §7 rows 7.2 and 7.5. | High     | Add an explicit "student-linked row only" branch to `ReportCardsController.findAll()` mirroring the teacher scope branch — scope student callers to rows where `student_id = student_user_link.student_id`. |
| 18.5 | **No per-role redaction of teacher comments.** Published `snapshot_payload_json` carries all comments for all audiences. If a school wants student-visible comments to differ from parent-visible comments, there is no mechanism today. (§11)                                                                                                                                 | Med      | Decide whether student view should redact overall/subject comments, or whether they are unified with parent view. Document in product spec.                                                                 |
| 18.6 | **Acknowledgment is parent-only by design but not loudly enforced in the UI.** The parent acknowledgment route would 403 a student JWT, but a malicious script could attempt it. Verify server-side rejection covers all student callers (§10).                                                                                                                                | Low      | Ensure `POST /v1/parent/report-cards/:id/acknowledge` checks caller is linked as a parent, not merely non-admin.                                                                                            |
| 18.7 | **Public `/verify/:token` viewer by design exposes any valid token holder's summary** (§8.3). This is not a gap, but document explicitly in the pre-launch security review that token leakage = summary leakage.                                                                                                                                                               | Low      | Consider short-lived tokens with audit logging on view.                                                                                                                                                     |
| 18.8 | **Morph bar / sub-strip audit:** confirm no orphan `<a>` links to `/report-cards*` render in the student shell even when denied (dead-link risk).                                                                                                                                                                                                                              | Low      | Add an e2e assertion that the student HTML contains zero `/report-cards` hrefs.                                                                                                                             |
| 18.9 | **Gradebook route `GET /v1/gradebook/students/:studentId/period-grades`** — confirm the student role cannot substitute another student's id. If the controller relies solely on `gradebook.view` without scope, this is a cross-student leak (§12.4).                                                                                                                          | High     | Add linked-student scope check at the controller level for student callers.                                                                                                                                 |

---

## 19. Sign-Off

| Role             | Name | Date | Notes |
| ---------------- | ---- | ---- | ----- |
| QA Engineer      |      |      |       |
| Engineering Lead |      |      |       |
| Product Owner    |      |      |       |
| Security Review  |      |      |       |

**Overall result:** PASS / FAIL / PARTIAL (circle one)

**Blocker issues found:** **\_\_\_\_**

**Follow-up tickets filed:** **\_\_\_\_**

> **Pair this spec with** `../admin_view/`, `../teacher_view/`, `../parent_view/`. A clean run here plus a clean parent run together validates the full student-facing report card surface (which is predominantly consumed by the guardian, not the pupil).
