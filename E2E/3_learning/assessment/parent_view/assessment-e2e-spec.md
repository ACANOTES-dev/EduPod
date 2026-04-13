# Assessment Module — Parent E2E Test Specification

**Module:** Assessment (Parent read-only access to own children's grades, report cards, transcripts)
**Perspective:** Parent — user holding `parent.view_grades`, `parent.view_transcripts`. NO gradebook write keys.
**Pages Covered:** Parent dashboard tiles + student grade views + report card + transcript PDFs. 5 relevant `/api/v1/parent/*` endpoints.
**Tester audience:** QC engineer OR headless Playwright agent.
**Last Updated:** 2026-04-12

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Test Data](#1-prerequisites--multi-tenant-test-data)
2. [Out of Scope — Sibling Specs](#2-out-of-scope--sibling-specs)
3. [Global Environment Setup](#3-global-environment-setup)
4. [Parent Login & Role Gate](#4-parent-login--role-gate)
5. [Parent Dashboard — Navigation](#5-parent-dashboard--navigation)
6. [Child Selector](#6-child-selector)
7. [My Child's Grades — List by Period](#7-my-childs-grades--list-by-period)
8. [Grade Detail — Per Subject](#8-grade-detail--per-subject)
9. [Report Cards — List](#9-report-cards--list)
10. [Report Card PDF Download](#10-report-card-pdf-download)
11. [Report Card Acknowledgement](#11-report-card-acknowledgement)
12. [Transcript PDF Download](#12-transcript-pdf-download)
13. [Published Grades Only](#13-published-grades-only)
14. [Cross-Child Isolation](#14-cross-child-isolation)
15. [Cross-Tenant Hostile Attempts](#15-cross-tenant-hostile-attempts)
16. [Negative Assertions — What Parent Must NOT See](#16-negative-assertions--what-parent-must-not-see)
17. [Error, Loading, Empty States](#17-error-loading-empty-states)
18. [Arabic / RTL](#18-arabic--rtl)
19. [Console & Network Health](#19-console--network-health)
20. [Mobile Responsiveness (375px)](#20-mobile-responsiveness-375px)
21. [Data Invariants](#21-data-invariants)
22. [Backend Endpoint Map — Parent](#22-backend-endpoint-map--parent)
23. [Observations from Walkthrough](#23-observations-from-walkthrough)
24. [Sign-Off](#24-sign-off)

---

## 1. Prerequisites & Multi-Tenant Test Data

### Tenant A

- **User:** `parent@nhqs.test` / `Password123!`.
- **Linked students:** ≥ 2 students linked via `student_parent` relationships (to exercise the child-selector flow).
- **Published grades:** ≥ 1 academic period with `grades_published_at` set for the student's subjects.
- **Unpublished grades:** ≥ 1 period that is NOT yet published — must remain invisible to parent.
- **Report cards:** ≥ 1 `published` report card per student + ≥ 1 `draft` (draft must remain invisible).
- **Transcript:** student has enough historical grades to generate a transcript.
- **Parent-linked ack:** one published report card with no acknowledgement yet (to exercise §11).

### Tenant B

- A separate parent + student pair in Tenant B to exercise cross-tenant hostile tests.
- Parent B must have ≥ 1 published report card and transcript.

### Hostile pair

- Capture Tenant B student_id, report_card_id, verification token (if generated).

---

## 2. Out of Scope — Sibling Specs

- Parent's behaviour management, attendance, finance — separate modules.
- Teacher / admin UI behavior → admin_view / teacher_view.
- RLS + API contract matrix → integration spec.
- Worker jobs (report card generation cron, etc.) → worker spec.
- OWASP (SSRF, IDOR, auth bypass) → security spec.

---

## 3. Global Environment Setup

| #   | What to Check                | Expected Result                                                                                | Pass/Fail |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 3.1 | DevTools open                | Network + Console ready.                                                                       |           |
| 3.2 | Clear browser storage        | No prior auth.                                                                                 |           |
| 3.3 | Log in as `parent@nhqs.test` | 200. JWT `role_keys` includes `parent`.                                                        |           |
| 3.4 | Landing                      | `/en/dashboard` (parent variant).                                                              |           |
| 3.5 | Hubs visible                 | Parent sees: **Home**, **Academics** (or child-scoped), **Finance** (for invoices), **Inbox**. |           |
| 3.6 | Console                      | Zero red errors.                                                                               |           |

---

## 4. Parent Login & Role Gate

| #   | What to Check              | Expected Result                                                                                | Pass/Fail |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Navigate `/en/assessments` | 403 or redirect to parent dashboard. Parents do not use the teacher/admin assessment surface.  |           |
| 4.2 | Navigate `/en/gradebook`   | 403.                                                                                           |           |
| 4.3 | Navigate `/en/analytics`   | 403.                                                                                           |           |
| 4.4 | Parent-specific URL        | `/en/academics/children/{studentId}/grades` or similar parent-facing path. Confirm exact path. |           |

---

## 5. Parent Dashboard — Navigation

| #   | What to Check                     | Expected Result                  | Pass/Fail |
| --- | --------------------------------- | -------------------------------- | --------- |
| 5.1 | Home tile: "My children's grades" | Navigates to grade list.         |           |
| 5.2 | Home tile: "Report cards"         | Navigates to report card list.   |           |
| 5.3 | Home tile: "Transcript"           | Direct PDF download link.        |           |
| 5.4 | Breadcrumb                        | Home > Academics > {child name}. |           |

---

## 6. Child Selector

| #   | What to Check                            | Expected Result                                                   | Pass/Fail |
| --- | ---------------------------------------- | ----------------------------------------------------------------- | --------- |
| 6.1 | When parent has multiple linked children | Dropdown at top shows all linked students by name + year group.   |           |
| 6.2 | Select child                             | Page re-fetches for `/api/v1/parent/students/{studentId}/grades`. |           |
| 6.3 | Attempt `studentId` not linked to parent | 403.                                                              |           |

---

## 7. My Child's Grades — List by Period

| #   | What to Check                                      | Expected Result                                                                                            | Pass/Fail |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Fetch `/api/v1/parent/academic-periods`            | Returns ONLY periods where any grade has been published. Unpublished periods are filtered out server-side. |           |
| 7.2 | Fetch `/api/v1/parent/students/{studentId}/grades` | Returns period grades grouped by period with subject + score + letter + comment (teacher and overall).     |           |
| 7.3 | Layout                                             | Accordion per period; click expands to subject list.                                                       |           |
| 7.4 | Unpublished periods                                | NOT shown. Parent must never see draft or unpublished grades.                                              |           |
| 7.5 | Empty state                                        | "No published grades yet".                                                                                 |           |
| 7.6 | Tenant scope                                       | Parent only sees their own tenant's students.                                                              |           |

---

## 8. Grade Detail — Per Subject

| #   | What to Check        | Expected Result                                                                                   | Pass/Fail |
| --- | -------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Click a subject row  | Expands to show: assessment list (only published), scores, grade letters, comments, teacher name. |           |
| 8.2 | Period grade summary | Computed + final; override not shown (admin-only concept).                                        |           |
| 8.3 | Graph of trend       | Simple line chart of scores across period's assessments.                                          |           |
| 8.4 | Override reason      | Hidden from parent — only final grade is shown.                                                   |           |

---

## 9. Report Cards — List

| #   | What to Check                                            | Expected Result                                                                                           | Pass/Fail |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Fetch `/api/v1/parent/students/{studentId}/report-cards` | Returns only PUBLISHED report cards. Draft/Archived filtered out.                                         |           |
| 9.2 | Table rows                                               | Period name, Published date, Acknowledged (Yes/No), Actions.                                              |           |
| 9.3 | Click a row                                              | Opens detail view showing grades snapshot + teacher/principal comments.                                   |           |
| 9.4 | Download PDF button                                      | `GET /api/v1/parent/students/{studentId}/report-cards/{reportCardId}/pdf`. Opens in new tab or downloads. |           |

---

## 10. Report Card PDF Download

| #    | What to Check        | Expected Result                                                                                                             | Pass/Fail |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | HTTP response        | 200. `Content-Type: application/pdf`. `Content-Disposition: attachment; filename="report-card-{studentName}-{period}.pdf"`. |           |
| 10.2 | File size            | Non-empty; typically 100–500 KB.                                                                                            |           |
| 10.3 | Rendered content     | (Structural byte check in integration spec.) UI-side: PDF viewer shows student name, school name, grades table, comments.   |           |
| 10.4 | Cross-child attempt  | Download another parent's child's report card (substituting studentId) → 403.                                               |           |
| 10.5 | Cross-tenant attempt | Tenant B reportCardId → 404.                                                                                                |           |

---

## 11. Report Card Acknowledgement

| #    | What to Check                        | Expected Result                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Unacknowledged report card           | Shows **"Acknowledge receipt"** button. Text: "Please confirm you've reviewed this report card.".                                             |           |
| 11.2 | Click Acknowledge                    | Dialog: "Confirm you've reviewed and discussed this report card with your child." Confirm.                                                    |           |
| 11.3 | Submit                               | `POST /api/v1/parent/report-cards/{reportCardId}/acknowledge` (or the relevant parent-side endpoint — verify). Server records IP + timestamp. |           |
| 11.4 | Post-ack                             | Row flag "Acknowledged" (green badge). Date visible.                                                                                          |           |
| 11.5 | Audit row                            | `ReportCardAcknowledgment` created with `parent_user_id`, `acknowledged_at`, `ip_address`.                                                    |           |
| 11.6 | Verification token flow (if enabled) | Some tenants use token-based acknowledgement (emailed link). Clicking the link goes through `ReportCardVerificationService.verifyToken`.      |           |

---

## 12. Transcript PDF Download

| #    | What to Check                | Expected Result                                                                | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------ | --------- |
| 12.1 | "Download transcript" button | `GET /api/v1/parent/students/{studentId}/transcript/pdf`. 200 application/pdf. |           |
| 12.2 | Transcript content           | Shows full academic history: grades per year × subject, GPA, standing.         |           |
| 12.3 | Permission                   | Requires `parent.view_transcripts`.                                            |           |
| 12.4 | Cross-child                  | Substituting studentId → 403.                                                  |           |

---

## 13. Published Grades Only

| #    | What to Check                          | Expected Result                                                                                                 | Pass/Fail |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Admin publishes a period               | Parent's period dropdown now includes that period (refresh).                                                    |           |
| 13.2 | Admin un-publishes (if feature exists) | Period should disappear from parent's view.                                                                     |           |
| 13.3 | Server enforcement                     | Try `GET /api/v1/parent/students/{studentId}/grades?academic_period_id={unpublishedId}` — returns 404 or empty. |           |
| 13.4 | Draft grades                           | Any grade with `assessment.grades_published_at IS NULL` must NOT appear.                                        |           |

---

## 14. Cross-Child Isolation

| #    | What to Check                                        | Expected Result                                      | Pass/Fail |
| ---- | ---------------------------------------------------- | ---------------------------------------------------- | --------- |
| 14.1 | URL-tamper to another student's grades (same tenant) | 403. Backend verifies `student_parent` relationship. |           |
| 14.2 | Child-selector only shows own children               | Confirmed via `/api/v1/parent/students`.             |           |

---

## 15. Cross-Tenant Hostile Attempts

| #    | Attempt                                                                                   | Expected Result | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------- | --------------- | --------- |
| 15.1 | Paste Tenant B studentId into parent URL                                                  | 404/403.        |           |
| 15.2 | `GET /api/v1/parent/students/{tenantB_studentId}/grades`                                  | 404/403.        |           |
| 15.3 | `GET /api/v1/parent/students/{tenantB_studentId}/report-cards/{tenantB_reportCardId}/pdf` | 404/403.        |           |
| 15.4 | `GET /api/v1/parent/students/{tenantB_studentId}/transcript/pdf`                          | 404/403.        |           |

---

## 16. Negative Assertions — What Parent Must NOT See

| #     | Must NOT appear                                                             | Pass/Fail |
| ----- | --------------------------------------------------------------------------- | --------- |
| 16.1  | Teacher or admin UI paths.                                                  |           |
| 16.2  | Unpublished grades.                                                         |           |
| 16.3  | Override reasons / override_actor_user_id / grade edit audit.               |           |
| 16.4  | Other children's grades.                                                    |           |
| 16.5  | Assessment draft status / locked status / unlock requests.                  |           |
| 16.6  | AI grading references / AI grading instructions.                            |           |
| 16.7  | Analytics pages.                                                            |           |
| 16.8  | Report card drafts / archived.                                              |           |
| 16.9  | Teacher comments during drafting (only published teacher comments allowed). |           |
| 16.10 | Internal rejection reasons on config items.                                 |           |

---

## 17. Error, Loading, Empty States

| #    | Scenario              | Expected Result                                      | Pass/Fail |
| ---- | --------------------- | ---------------------------------------------------- | --------- |
| 17.1 | Initial load skeleton | Loading skeleton for list.                           |           |
| 17.2 | Empty                 | "No published grades yet for {child name}".          |           |
| 17.3 | 500                   | Retry button.                                        |           |
| 17.4 | Network disconnect    | Red toast.                                           |           |
| 17.5 | 401 refresh           | Transparent.                                         |           |
| 17.6 | 403                   | Full-page block page (should not reach it normally). |           |

---

## 18. Arabic / RTL

| #    | Check            | Expected                                  | Pass/Fail |
| ---- | ---------------- | ----------------------------------------- | --------- |
| 18.1 | Switch to Arabic | Whole parent shell mirrors.               |           |
| 18.2 | Grade numbers    | Latin digits; `dir="ltr"` on score cells. |           |
| 18.3 | Report card PDF  | Arabic template (if tenant configured).   |           |
| 18.4 | Dates            | Gregorian + Latin digits.                 |           |
| 18.5 | Logical CSS      | ms-/me-/ps-/pe-/start-/end- only.         |           |

---

## 19. Console & Network Health

| #    | Check                               | Expected                                                            | Pass/Fail |
| ---- | ----------------------------------- | ------------------------------------------------------------------- | --------- |
| 19.1 | Zero uncaught errors                | OK.                                                                 |           |
| 19.2 | No admin / teacher endpoints called | Network tab must be clean of any `/gradebook/*` (non-parent) calls. |           |
| 19.3 | PDF download                        | Single request, no duplicates.                                      |           |

---

## 20. Mobile Responsiveness (375px)

| #    | Check               | Expected                       | Pass/Fail |
| ---- | ------------------- | ------------------------------ | --------- |
| 20.1 | Dashboard tiles     | Stack vertically.              |           |
| 20.2 | Period accordion    | Tap-friendly; 44x44px targets. |           |
| 20.3 | PDF download button | Full-width, inline.            |           |
| 20.4 | Acknowledge dialog  | Fits.                          |           |

---

## 21. Data Invariants

| #    | Flow                                        | Invariant                                                                                                                                 | Expected result    | Pass/Fail |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------- |
| 21.1 | Parent views grade list                     | Every returned grade belongs to `SELECT student_id FROM student_parent WHERE parent_user_id = parent.id AND tenant_id = parent.tenant_id` | 100% match         |           |
| 21.2 | Parent views report card list               | Every returned `ReportCard` has `status = 'published'`                                                                                    | 100%               |           |
| 21.3 | Parent downloads PDF                        | `s3_key` in the response comes from the report card's stored assets. No cross-tenant bucket access.                                       | 100% tenant-scoped |           |
| 21.4 | Acknowledgement records IP                  | `SELECT ip_address FROM report_card_acknowledgments WHERE report_card_id = ?` non-null                                                    | non-null           |           |
| 21.5 | Acknowledgement unique per (parent, report) | `SELECT COUNT(*) FROM report_card_acknowledgments WHERE parent_user_id = ? AND report_card_id = ?`                                        | ≤ 1                |           |
| 21.6 | Transcript download audit                   | If `audit_logs` tracks download: one row per download with parent_user_id + student_id + timestamp.                                       | 1 row per download |           |

---

## 22. Backend Endpoint Map — Parent

| Endpoint                                                            | Method | Permission              | Exercised |
| ------------------------------------------------------------------- | ------ | ----------------------- | --------- |
| /api/v1/parent/academic-periods                                     | GET    | parent.view_grades      | §7.1      |
| /api/v1/parent/students/{studentId}/grades                          | GET    | parent.view_grades      | §7.2      |
| /api/v1/parent/students/{studentId}/report-cards                    | GET    | parent.view_grades      | §9.1      |
| /api/v1/parent/students/{studentId}/report-cards/{reportCardId}/pdf | GET    | parent.view_grades      | §10       |
| /api/v1/parent/students/{studentId}/transcript/pdf                  | GET    | parent.view_transcripts | §12       |

**Endpoints parent must NOT hit (403):** ALL `/v1/gradebook/*`, ALL `/v1/report-cards/*` (non-parent variants), ALL `/v1/transcripts/*` (non-parent variants).

---

## 23. Observations from Walkthrough

1. The parent-facing URL structure is less explicit in the frontend inventory than admin/teacher. Confirm the actual paths in `apps/web/src/app/[locale]/(parent)/...` or wherever parent routes live.
2. Report card acknowledgement endpoint is not in the backend inventory — verify it exists (may live in ReportCardAcknowledgmentService). If missing, file as a bug.
3. Verification token flow (email link → parent views report card without login) is intended for weekly deliveries but may not be fully wired in UI. Validate or skip with note.
4. Transcripts rely on `gradebook.view` data + `transcripts.generate` permission — parent permission `parent.view_transcripts` likely wraps this. Confirm alignment.
5. Parent access to past-period grades: ensure older-than-current-year periods remain accessible (backfill concern).

---

## 24. Sign-Off

| Reviewer | Date | Pass | Fail | Notes |
| -------- | ---- | ---- | ---- | ----- |
|          |      |      |      |       |

Parent UI leg ready when §§3–20 pass + §21 invariants green + §15 cross-tenant blocks green + §16 negatives confirmed.

---
