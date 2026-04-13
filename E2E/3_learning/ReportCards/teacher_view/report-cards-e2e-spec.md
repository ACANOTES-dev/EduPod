# Report Cards — Teacher View — End-to-End Test Specification

**Tenant:** Nurul Huda School (`nhqs.edupod.app`)
**Actor:** Sarah Daly — Teacher (`sarah.daly@nhqs.test` / `Password123!`)
**Role Scope:** Homeroom teacher for Class 2A. Subject teacher for Business (1st), English (2nd), History (3rd), Mathematics (4th), Biology (5th), Arabic (KG, Junior infants, Senior infants).
**Module Entry:** Learning → Assessment → Report Cards sub-strip.
**Companion Spec:** `../admin_view/report-cards-e2e-spec.md` — authoritative for shared behaviours (schema, state machines, audit log wiring, AI prompts, template lifecycle). This document tests only the **teacher-scoped** view, focusing on what Sarah can see, what she must not see, and how permission boundaries are enforced across UI + API + DB.
**Last Updated:** 2026-04-12

---

## Spec Conventions

- Every permission-denied row cites the **exact API path + HTTP status + error code** returned by `ReportCardsController` / `ReportCommentsController` / `ReportCardRequestsController`.
- Every autosave row records the debounce timing (standard: **800 ms after keystroke idle**) and the full PATCH body sent to the API.
- Legend: `CLASS_OUT_OF_SCOPE` = teacher has neither competency nor homeroom assignment; `SUBJECT_OUT_OF_SCOPE` = competency missing for the target subject; `INVALID_AUTHOR` = author_user_id ≠ current user; `INVALID_STATUS_TRANSITION` = state machine rejects the requested transition; `WINDOW_CLOSED` = comment window not in `open` status; `FORBIDDEN_ROLE` = endpoint requires admin role only; `VERSION_CONFLICT` = optimistic lock mismatch; `DUPLICATE_REQUEST` = idempotency key already used.
- All dates assume the active academic year **2025–2026**, Term 2 (the currently open reporting window on the tenant).
- Reference to admin spec rows uses `[ADMIN §X.Y]` notation so reviewers can cross-walk without copy-paste drift.

---

## 1. Prerequisites & Test Data

| #    | What to Check                                                           | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | Login credentials valid                                                 | `sarah.daly@nhqs.test / Password123!` authenticates and `/v1/auth/login` returns 200 with `role=teacher` in JWT claims                                                                                      |           |
| 1.2  | Teacher has homeroom assignment                                         | `classes.homeroom_teacher_id = Sarah.user_id` for class **2A** in active academic year                                                                                                                      |           |
| 1.3  | Teacher competency rows exist                                           | `teacher_competencies` has rows for `{sarah, business, 1st}`, `{sarah, english, 2nd}`, `{sarah, history, 3rd}`, `{sarah, mathematics, 4th}`, `{sarah, biology, 5th}`, `{sarah, arabic, KG / JrInf / SrInf}` |           |
| 1.4  | A published Term 2 template exists                                      | At least one `report_card_templates` row with `status='published'` covering Sarah's classes                                                                                                                 |           |
| 1.5  | An open **overall** comment window exists for 2A                        | `report_comment_windows` has a row with `audience='overall'`, `class_id=2A`, `status='open'`, `closes_at > now()`                                                                                           |           |
| 1.6  | An open **subject** comment window exists for each Sarah-taught subject | One row per subject in `report_comment_windows` with `status='open'`, `subject_id` matching each competency                                                                                                 |           |
| 1.7  | A closed window exists (for negative tests)                             | Seed one `report_comment_windows` row with `status='closed'` for Class 2A Term 1                                                                                                                            |           |
| 1.8  | A future window exists (not yet open)                                   | Seed one `report_comment_windows` with `opens_at > now()`, `status='scheduled'` for Term 3                                                                                                                  |           |
| 1.9  | Report cards in library                                                 | ≥ 20 `report_cards` rows exist across Sarah's classes, mixed `status` (`draft`, `pending_review`, `finalised`, `published`)                                                                                 |           |
| 1.10 | A non-Sarah class exists (for negative tests)                           | Class **3B** has a different homeroom teacher and no Sarah competency — used as the "out-of-scope" control                                                                                                  |           |
| 1.11 | Two seeded teacher requests                                             | One `pending` teacher-request owned by Sarah, one `pending` owned by another teacher (to prove she cannot act on it)                                                                                        |           |
| 1.12 | Seeded finalised comment owned by Sarah                                 | One `report_comments` row with `author_user_id=sarah`, `status='finalised'` — used to assert read-only enforcement                                                                                          |           |
| 1.13 | Seeded AI quota state                                                   | Tenant `ai_monthly_quota = 5000`, `ai_monthly_used ~ 1500` — room to test quota but not at edge                                                                                                             |           |
| 1.14 | RLS middleware active                                                   | `GET /v1/health/rls` returns `{ enabled: true, enforced: true }` — prerequisite to all cross-tenant assumptions                                                                                             |           |
| 1.15 | Clock source                                                            | Tests reference server-side `now()` (via `GET /v1/time`) — never browser-local time — to avoid skew on window boundary tests                                                                                |           |

---

## 2. Login & Teacher Landing

| #    | What to Check                                  | Expected Result                                                                                                                                                                                                                                                                      | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.1  | Navigate to `https://nhqs.edupod.app/en/login` | Login form renders; no console errors                                                                                                                                                                                                                                                |           |
| 2.2  | Submit Sarah's credentials                     | `POST /v1/auth/login` 200; JWT set; redirect to `/en/dashboard/teacher`                                                                                                                                                                                                              |           |
| 2.3  | Dashboard route                                | Final URL `https://nhqs.edupod.app/en/dashboard/teacher` — not `/dashboard/admin`, not `/dashboard` (generic)                                                                                                                                                                        |           |
| 2.4  | JWT payload                                    | `role=teacher`, `tenant_id=<NHQS uuid>`, `permissions` array contains `report_cards.comment.write`, `report_cards.library.view`, but **NOT** `report_cards.generate`, `report_cards.analytics.view`, `report_cards.settings.manage`, `report_cards.publish`, `report_cards.finalise` |           |
| 2.5  | Dashboard greets correct user                  | Header reads "Welcome, Sarah" (or Arabic equivalent in RTL)                                                                                                                                                                                                                          |           |
| 2.6  | No admin surfaces leak onto dashboard          | No "Generate Report Cards", "Analytics", "Settings" tiles on teacher dashboard home                                                                                                                                                                                                  |           |
| 2.7  | Request-to-server tenant header                | Every XHR has `X-Tenant-Id: <NHQS uuid>` or equivalent cookie; no cross-tenant leakage                                                                                                                                                                                               |           |
| 2.8  | Refresh token rotation                         | Refresh token stored in `httpOnly` cookie; `localStorage` empty of tokens                                                                                                                                                                                                            |           |
| 2.9  | Logout round-trip                              | `POST /v1/auth/logout` 204; subsequent `GET /v1/report-cards/dashboard` returns 401                                                                                                                                                                                                  |           |
| 2.10 | Role-switch attempt                            | Admin-JWT forged with `role: 'admin'` client-side → server re-derives role from `user_roles` table; call still returns 403 (server is source of truth)                                                                                                                               |           |

---

## 3. Navigation — Teacher Morph Bar

| #    | What to Check                 | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Morph bar hubs visible        | `Home`, `Learning`, `People`, `Comms` — NO `Finance`, `Admin Console`, `Platform`                                                                                       |           |
| 3.2  | Hover Learning hub            | Sub-strip shows: Lessons, Assessment, Resources. Analytics hub absent unless Sarah has analytics permissions (she does not)                                             |           |
| 3.3  | Click `Learning → Assessment` | Sub-strip exposes: Gradebook, Assessments, **Report Cards**, Rubrics                                                                                                    |           |
| 3.4  | Click Report Cards            | Navigate to `/en/report-cards` — URL stable, morph bar does not remount, sub-strip stays visible                                                                        |           |
| 3.5  | Report Cards sub-strip        | Tabs visible: **Library**, **Comments** — Tabs NOT visible: **Generate**, **Analytics**, **Settings**, **Templates**                                                    |           |
| 3.6  | Browser back/forward          | Returning to `/en/report-cards` from any sub-tab preserves sub-strip active state (no flicker)                                                                          |           |
| 3.7  | Direct deep link cold load    | `/en/report-cards/library` from cold start shows sub-strip synchronously; no blank-state flash > 200 ms                                                                 |           |
| 3.8  | Keyboard navigation           | `Tab` reaches all sub-strip tabs in order; `Enter` activates; focus ring visible                                                                                        |           |
| 3.9  | Morph bar permission-aware    | Removing `report_cards.library.view` (admin test harness) hides Report Cards entry                                                                                      |           |
| 3.10 | Permission toggle mid-session | Admin revokes `report_cards.comment.write` in another browser; Sarah's next navigation re-reads perms and hides Comments tab (within 30 s via realtime or page refresh) |           |

---

## 4. Report Cards Dashboard (Teacher View — 2 Tiles Only)

| #    | What to Check                          | Expected Result                                                                                                                                  | Pass/Fail |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1  | Navigate to `/en/report-cards`         | Dashboard shell loads; page title "Report Cards"                                                                                                 |           |
| 4.2  | Tile count                             | Exactly **2** tiles rendered: `Library` and `Write Comments`                                                                                     |           |
| 4.3  | Missing admin tiles                    | "Generate Report Cards", "Analytics", "Template Designer", "Settings" tiles MUST NOT render in the DOM (not just hidden via CSS — absent)        |           |
| 4.4  | Library tile content                   | Shows scoped count, e.g. "Report cards in your classes: 23" — count matches `GET /v1/report-cards?scope=mine`                                    |           |
| 4.5  | Write Comments tile content            | Shows scoped summary: "Overall comments due: 1 class · Subject comments due: N subjects" where N = count of open competency windows for Sarah    |           |
| 4.6  | Tile click — Library                   | Navigates to `/en/report-cards/library`                                                                                                          |           |
| 4.7  | Tile click — Write Comments            | Navigates to `/en/report-cards/comments`                                                                                                         |           |
| 4.8  | No hidden admin tiles in React tree    | DevTools → Components: neither `<GenerateTile>` nor `<AnalyticsTile>` mounted                                                                    |           |
| 4.9  | Permission-aware rendering             | `useFeatureFlags()` hook returns `{ canGenerate: false, canAnalytics: false, canSettings: false }` for Sarah                                     |           |
| 4.10 | Dashboard endpoint                     | `GET /v1/report-cards/dashboard` 200 returns `{ library_count, overall_due, subject_due }` — omits `analytics_metrics`, `generation_queue_depth` |           |
| 4.11 | Counts update on comment submit        | Submit a draft; tile count refreshes within 10 s or on next navigation                                                                           |           |
| 4.12 | Counts scope — tenant leakage          | A different NHQS teacher's counts do not affect Sarah's tile values                                                                              |           |
| 4.13 | Inspect raw DOM for hidden admin flags | No `data-admin-only` or similar attributes carrying admin data into page props                                                                   |           |

---

## 5. Class Matrix (Scoped)

The class matrix lives at `/en/report-cards/library` and lists classes Sarah may act on.

| #    | What to Check                       | Expected Result                                                                                                                        | Pass/Fail |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Navigate `/en/report-cards/library` | Scoped class matrix renders                                                                                                            |           |
| 5.2  | Class list source                   | `GET /v1/report-cards/scoped-classes` 200 returns union of (homeroom_teacher_id=Sarah) ∪ (teacher_competencies WHERE teacher_id=Sarah) |           |
| 5.3  | Classes visible                     | 2A (homeroom), plus 1st/2nd/3rd/4th/5th/KG/JrInf/SrInf entries — grouped as subject rows                                               |           |
| 5.4  | Classes NOT visible                 | Class 3B, any non-Sarah class — absent from DOM and from API response                                                                  |           |
| 5.5  | Homeroom badge                      | Row for 2A displays a "Homeroom" pill                                                                                                  |           |
| 5.6  | Competency-only badge               | Rows for 1st/2nd/... display "Subject: {name}" badge only, no Homeroom pill                                                            |           |
| 5.7  | Row action buttons                  | Only `View Report Cards`, `Write Comments` — NO `Generate`, `Publish`, `Delete Cards`, `Export PDF Bundle`                             |           |
| 5.8  | Window status column                | Displays `open` / `closed` / `not scheduled` per class+term — fetched from `report_comment_windows`                                    |           |
| 5.9  | Count discrepancy detection         | Teacher-count = admin-count − out-of-scope rows (verify by logging in as admin in a second browser and comparing)                      |           |
| 5.10 | Archived classes excluded           | Class with `archived_at IS NOT NULL` not returned even if Sarah had competency                                                         |           |
| 5.11 | Academic-year boundary              | Last year's homeroom 1A does NOT appear (old `academic_year_id` filtered out)                                                          |           |
| 5.12 | Sort order                          | Homeroom first, then subjects alphabetical, then grades ascending                                                                      |           |

---

## 6. Class Matrix — Cross-Class Blocking

| #    | What to Check                                                              | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1  | URL tamper: `/en/report-cards/library?class_id=<3B-uuid>`                  | Page loads shell, but row list filter ignores param; 3B not shown                                                                                      |           |
| 6.2  | Direct action link `/en/report-cards/comments/overall/<3B-uuid>`           | Redirect to `/en/report-cards/comments` + toast "You don't teach this class"                                                                           |           |
| 6.3  | API: `GET /v1/report-cards?class_id=<3B-uuid>`                             | 403 `{ code: 'CLASS_OUT_OF_SCOPE', message: 'You are not assigned to this class' }`                                                                    |           |
| 6.4  | API: `GET /v1/report-comments/windows?class_id=<3B-uuid>&audience=overall` | 403 `CLASS_OUT_OF_SCOPE`                                                                                                                               |           |
| 6.5  | API: `GET /v1/report-cards/<3B-card-uuid>`                                 | 403 `CLASS_OUT_OF_SCOPE` (service must check class scope, not just RLS)                                                                                |           |
| 6.6  | RLS sanity                                                                 | Even if controller check were bypassed, RLS would still scope by tenant — but cross-class protection is an application-layer permission check, not RLS |           |
| 6.7  | Query param IDN / mixed-case                                               | UUIDs are case-insensitive; `/library?class_id=<3B-UPPERCASE>` produces same 403                                                                       |           |
| 6.8  | SQL-injection in class_id                                                  | `/library?class_id=' OR 1=1--` → 400 `VALIDATION_FAILED`, not 500                                                                                      |           |
| 6.9  | Array class_id                                                             | `/library?class_id=<2A>&class_id=<3B>` → server takes last OR returns 400; in all cases 3B results excluded                                            |           |
| 6.10 | WebSocket payload for 3B                                                   | Tenant broadcast of a 3B comment finalise does NOT reach Sarah's socket (server filters per-user subscription)                                         |           |

---

## 7. Library (Scoped)

| #    | What to Check                                            | Expected Result                                                                                                                         | Pass/Fail |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Navigate `/en/report-cards/library`                      | List renders; columns: Student, Class, Term, Status, Updated, Actions                                                                   |           |
| 7.2  | API `GET /v1/report-cards?scope=mine&page=1&pageSize=20` | 200; `data.length ≤ 20`; `meta.total` matches tile count                                                                                |           |
| 7.3  | Rows are Sarah-scoped                                    | Every row's `class_id` ∈ Sarah's scoped classes                                                                                         |           |
| 7.4  | Filter by status: Finalised                              | `GET /v1/report-cards?scope=mine&status=finalised` 200; only finalised returned                                                         |           |
| 7.5  | Filter by class: 2A                                      | Dropdown lists only Sarah's classes; selecting 2A filters to homeroom roster                                                            |           |
| 7.6  | Search by student name                                   | Full-text search `?q=Ali` returns only Ali records IN Sarah's classes                                                                   |           |
| 7.7  | Empty state (filter yields zero)                         | "No report cards match your filters" message + Reset Filters button                                                                     |           |
| 7.8  | Pagination                                               | Page 2 controls enabled only when `meta.total > pageSize`                                                                               |           |
| 7.9  | Sort by Updated desc                                     | Default sort `updated_at DESC`; explicit click toggles                                                                                  |           |
| 7.10 | Row click opens preview                                  | `/en/report-cards/library/<card_id>` → read-only preview renders in-scope cards; 403 for out-of-scope cards                             |           |
| 7.11 | Preview columns                                          | Student name, class, template, term, status, finalised_at, published_at (if any). No admin-only fields: `approval_notes`, `reviewer_id` |           |
| 7.12 | Large-page pagination                                    | `pageSize=100` accepted; `pageSize=500` rejected 400 `VALIDATION_FAILED`                                                                |           |
| 7.13 | Filter combinations                                      | `status=draft&class_id=2A` intersects correctly                                                                                         |           |
| 7.14 | URL reflects filters                                     | Filter changes update query string so deep link is reproducible                                                                         |           |
| 7.15 | Stale data                                               | After admin publishes a card Sarah can see, her next list refresh shows new `status` and `published_at`                                 |           |

---

## 8. Library — Blocked Actions (no bulk-delete, no bundle-PDF)

| #    | What to Check                            | Expected Result                                                                             | Pass/Fail |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 8.1  | Bulk-select checkboxes                   | Checkbox column is **not rendered** for teachers (admin only)                               |           |
| 8.2  | "Delete Selected" button                 | Absent from toolbar                                                                         |           |
| 8.3  | "Publish Selected" button                | Absent from toolbar                                                                         |           |
| 8.4  | "Download PDF Bundle" button             | Absent from toolbar                                                                         |           |
| 8.5  | "Export to CSV" button                   | Absent (admin reporting export)                                                             |           |
| 8.6  | API `DELETE /v1/report-cards/<any-id>`   | 403 `FORBIDDEN_ROLE` — endpoint is admin-only                                               |           |
| 8.7  | API `POST /v1/report-cards/bulk-publish` | 403 `FORBIDDEN_ROLE`                                                                        |           |
| 8.8  | API `POST /v1/report-cards/bulk-delete`  | 403 `FORBIDDEN_ROLE`                                                                        |           |
| 8.9  | API `POST /v1/report-cards/pdf-bundle`   | 403 `FORBIDDEN_ROLE`                                                                        |           |
| 8.10 | API `POST /v1/report-cards/export.csv`   | 403 `FORBIDDEN_ROLE`                                                                        |           |
| 8.11 | `/report-cards/generate` direct URL      | Redirect to `/en/report-cards` + toast "You don't have permission to generate report cards" |           |
| 8.12 | `/report-cards/analytics` direct URL     | Redirect to `/en/report-cards` + toast                                                      |           |
| 8.13 | `/report-cards/settings` direct URL      | Either redirect OR read-only view (see §26); must not render write controls                 |           |
| 8.14 | Context menu right-click                 | Does not expose admin actions (Delete / Publish)                                            |           |
| 8.15 | Devtools-injected button click           | Even if admin button injected into DOM, clicking results in 403 from backend                |           |

---

## 9. Library — Own Class PDF Download Only

Single-card PDF download is permitted for scoped cards only.

| #    | What to Check                              | Expected Result                                                                                                             | Pass/Fail |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Row for a 2A student — Download PDF button | Button present on row action menu                                                                                           |           |
| 9.2  | Click Download PDF                         | `GET /v1/report-cards/<id>/pdf` 200; `Content-Type: application/pdf`; file downloads                                        |           |
| 9.3  | Download for draft card                    | Allowed only if admin setting `teachers_can_download_drafts = true` — otherwise 403 `CARD_NOT_READY`                        |           |
| 9.4  | Audit log emitted                          | `audit_log` row: `{ action: 'report_card.pdf.downloaded', user_id: sarah.id, entity_id: card.id, tenant_id }`               |           |
| 9.5  | Cross-scope card PDF                       | `GET /v1/report-cards/<3B-card-id>/pdf` → 403 `CLASS_OUT_OF_SCOPE`                                                          |           |
| 9.6  | Rate limit                                 | After 30 rapid downloads within 60 s, server returns 429 `RATE_LIMITED`                                                     |           |
| 9.7  | PDF watermark                              | Teacher-downloaded PDFs carry "Internal — Do Not Distribute" watermark (admin-only PDFs omit it). Confirm via rendered file |           |
| 9.8  | Filename format                            | `report-card_<student_code>_<term>_<YYYYMM>.pdf` — no tenant leakage in filename                                            |           |
| 9.9  | Signed URL expiry                          | If backend uses signed URL pattern, URL expires after 5 min                                                                 |           |
| 9.10 | Concurrent download                        | Ten parallel downloads of the same card succeed up to rate limit                                                            |           |
| 9.11 | Content hash stability                     | Same card + same template version → identical SHA256 of PDF bytes                                                           |           |

---

## 10. Report Comments Landing (Scoped)

Entry point: `/en/report-cards/comments`.

| #     | What to Check                         | Expected Result                                                                                                                       | Pass/Fail |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | Route renders                         | Two cards visible: "Overall Comments" and "Subject Comments"                                                                          |           |
| 10.2  | Overall card summary                  | Shows 2A (Sarah's homeroom) with counts: "X of Y students written, Z finalised". Only homeroom classes listed                         |           |
| 10.3  | Subject card summary                  | Lists one row per Sarah competency × open window — e.g. "Mathematics · Grade 4 · 18 of 22 written"                                    |           |
| 10.4  | No homeroom case (control)            | If Sarah were stripped of 2A homeroom, Overall card displays empty state "You aren't a homeroom teacher this term" with no Enter link |           |
| 10.5  | Closed window handling                | Rows for closed windows show "Closed" chip and disabled Enter button; hover tooltip: "Comment window closed on <date>"                |           |
| 10.6  | Window countdown                      | Open windows show "Closes in X days" — matches `closes_at`                                                                            |           |
| 10.7  | API `GET /v1/report-comments/landing` | 200 returns `{ overall: [...homeroom windows], subjects: [...competency windows] }` — excludes out-of-scope windows                   |           |
| 10.8  | Reopen-request badge                  | If Sarah has a pending reopen request, row shows "Reopen requested" chip linked to request detail                                     |           |
| 10.9  | Realtime event on window open         | Admin opens a new window for 2A; within 30 s Sarah's landing reflects it (websocket `report_comment_window.opened`)                   |           |
| 10.10 | Progress counter accuracy             | Counts match `SELECT COUNT(*) FROM report_comments WHERE window_id = ? AND author_user_id = ?` grouped by status                      |           |

---

## 11. Overall Comments Editor — Entry (Homeroom Check)

URL: `/en/report-cards/comments/overall/<class_id>`.

| #     | What to Check                                                | Expected Result                                                                                             | Pass/Fail |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | Enter for 2A (homeroom)                                      | Loads editor table; every 2A active student listed                                                          |           |
| 11.2  | Enter for 3B (not homeroom)                                  | 403; redirect to `/en/report-cards/comments`; toast "You are not the homeroom teacher for this class"       |           |
| 11.3  | API `GET /v1/report-comments?class_id=2A&audience=overall`   | 200; data scoped to 2A roster                                                                               |           |
| 11.4  | API `GET /v1/report-comments?class_id=<3B>&audience=overall` | 403 `CLASS_OUT_OF_SCOPE`                                                                                    |           |
| 11.5  | Window state = closed                                        | Banner: "This comment window closed on <date>"; all input fields disabled; save buttons hidden              |           |
| 11.6  | Window state = not_open_yet                                  | Banner: "This comment window opens on <date>"; editor read-only; no draft allowed                           |           |
| 11.7  | Per-row author constraint                                    | Every draft shows `author_user_id = sarah.id` — no "Authored by" dropdown for teachers (admin view has one) |           |
| 11.8  | Row header                                                   | Student full name, student code, DOB; no PII beyond what ClassList page shows                               |           |
| 11.9  | Students added mid-term                                      | Newly enrolled student appears in editor within 60 s of enrolment finalisation                              |           |
| 11.10 | Students withdrawn mid-term                                  | Withdrawn student row shown disabled with "Withdrawn on <date>" and any existing draft locked read-only     |           |
| 11.11 | Roster size perf                                             | 30-student roster renders editor in < 800 ms (measured via Performance panel)                               |           |

---

## 12. Overall Comments — Write & Autosave

| #     | What to Check                         | Expected Result                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1  | Type into row 1 comment field         | Keystrokes render; textarea min-height 96 px; character counter updates live                                                                             |           |
| 12.2  | Stop typing                           | After **800 ms** debounce, autosave fires                                                                                                                |           |
| 12.3  | Autosave PATCH body                   | `PATCH /v1/report-comments/<comment_id>` with `{ body_en: '...', status: 'draft', author_user_id: sarah.id }`. `body_ar` sent only if Arabic tab touched |           |
| 12.4  | Autosave response                     | 200 `{ id, updated_at, status: 'draft', version: N+1 }`; row shows "Saved" chip                                                                          |           |
| 12.5  | Autosave on closed window             | PATCH returns 409 `WINDOW_CLOSED`; row shows "Window closed — changes not saved"                                                                         |           |
| 12.6  | Autosave on another teacher's comment | Scenario: admin reassigned comment author. PATCH returns 403 `INVALID_AUTHOR`                                                                            |           |
| 12.7  | Optimistic version conflict           | If `version` header mismatches, 409 `VERSION_CONFLICT`; UI prompts reload                                                                                |           |
| 12.8  | Character cap                         | `body_en` max length 2000; server returns 400 `VALIDATION_FAILED` when exceeded                                                                          |           |
| 12.9  | Markdown stripping                    | Server strips script tags + suspicious HTML before save (verify via returned `body_en`)                                                                  |           |
| 12.10 | Bilingual entry                       | Sarah switches to Arabic tab, types RTL text; autosave body: `{ body_ar: '...'} `; independent character count                                           |           |
| 12.11 | Offline behaviour                     | Disconnect network → autosave queues; reconnect → batched retry; no silent drop                                                                          |           |
| 12.12 | Reload preserves draft                | Refresh page → draft restored from server; no data loss                                                                                                  |           |
| 12.13 | Fast typing debounce                  | Typing continuously for 3 s generates exactly one PATCH (the one 800 ms after last keystroke)                                                            |           |
| 12.14 | Multi-row concurrent typing           | Editing rows A, B, C within 1 s triggers 3 independent PATCH calls, one per row_id                                                                       |           |
| 12.15 | Navigation guard                      | Navigating away with unsaved edits triggers beforeunload prompt                                                                                          |           |
| 12.16 | Idempotency key                       | Each PATCH carries a client-generated idempotency key; replay of same key returns cached 200                                                             |           |
| 12.17 | 500 retry                             | Simulated 500 from server → UI retries twice with exponential backoff, then surfaces toast "Save failed, retrying"                                       |           |
| 12.18 | Stored on server matches UI           | After autosave, `GET /v1/report-comments/<id>` returns same body as UI                                                                                   |           |
| 12.19 | Unicode                               | Emojis + RTL + Latin diacritics all preserved byte-exact                                                                                                 |           |
| 12.20 | Audit log                             | `report_comment.updated` row emitted per save with previous/new length                                                                                   |           |

---

## 13. Overall Comments — Finalise DENIED

Teachers **cannot** finalise overall comments — admin-only.

| #    | What to Check                                             | Expected Result                                                                        | Pass/Fail |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 13.1 | "Finalise" button per row                                 | NOT rendered for teachers                                                              |           |
| 13.2 | "Bulk Finalise" button in toolbar                         | NOT rendered                                                                           |           |
| 13.3 | API `POST /v1/report-comments/<id>/finalise`              | 403 `FORBIDDEN_ROLE` — only `report_cards.comment.finalise` permission holders succeed |           |
| 13.4 | API `POST /v1/report-comments/bulk-finalise` with row IDs | 403 `FORBIDDEN_ROLE`; no partial success — all-or-nothing rejection                    |           |
| 13.5 | Submit-for-Review flow (if enabled)                       | Teacher may PATCH `status='pending_review'` — 200 succeeds; admin later finalises      |           |
| 13.6 | State machine enforcement                                 | `INVALID_STATUS_TRANSITION` returned if teacher attempts `draft → finalised` directly  |           |
| 13.7 | UI hint after Submit                                      | Row shows "Pending review" chip; further edits blocked until admin returns to draft    |           |
| 13.8 | Concurrent finalise request                               | If teacher's PATCH races admin's finalise, teacher receives 409 `VERSION_CONFLICT`     |           |

---

## 14. Overall Comments — Unfinalise DENIED

| #    | What to Check                                                                      | Expected Result                                                              | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 14.1 | Once admin finalises a comment, Sarah sees it read-only                            | Row locked, no edit affordance                                               |           |
| 14.2 | Unfinalise button                                                                  | Not rendered for teachers                                                    |           |
| 14.3 | API `POST /v1/report-comments/<id>/unfinalise`                                     | 403 `FORBIDDEN_ROLE`                                                         |           |
| 14.4 | API `PATCH /v1/report-comments/<id>` with `{ body_en: 'new text' }` after finalise | 409 `INVALID_STATUS_TRANSITION` — `finalised` is terminal for teacher writes |           |
| 14.5 | Suggested path                                                                     | UI shows "Request Reopen" link which opens the reopen modal (§15)            |           |
| 14.6 | Finalised comments visible in read-only                                            | Sarah can still read her finalised comment body (for reference)              |           |

---

## 15. Overall Comments — Request Reopen Modal

| #     | What to Check                                 | Expected Result                                                                                                           | Pass/Fail |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | "Request Reopen" link on closed window banner | Opens `ReopenRequestModal`                                                                                                |           |
| 15.2  | Modal fields                                  | Reason (textarea, required, 20-500 chars), Target comment IDs (pre-filled from current window), Urgency (normal / urgent) |           |
| 15.3  | Submit                                        | `POST /v1/report-card-requests` with `{ type: 'reopen_window', class_id, audience: 'overall', reason, urgency }`          |           |
| 15.4  | Response                                      | 201; new request appears in Teacher Requests list with `status='pending'`                                                 |           |
| 15.5  | Validation — too short                        | Reason < 20 chars → client-side error, no network call                                                                    |           |
| 15.6  | Validation — reason missing                   | 400 `VALIDATION_FAILED`                                                                                                   |           |
| 15.7  | Duplicate request                             | Sending a second pending reopen for same window → 409 `DUPLICATE_REQUEST`                                                 |           |
| 15.8  | Out-of-scope window reopen                    | Sending for 3B → 403 `CLASS_OUT_OF_SCOPE`                                                                                 |           |
| 15.9  | Cancel own pending                            | See §24                                                                                                                   |           |
| 15.10 | Modal accessibility                           | Focus trapped inside; Esc closes; Tab cycles; aria-modal set                                                              |           |

---

## 16. Subject Comments Editor — Entry (Competencies Check)

URL: `/en/report-cards/comments/subject/<class_id>/<subject_id>`.

| #    | What to Check                                                                   | Expected Result                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Enter for Mathematics × Grade 4 (has competency)                                | Editor renders; roster = Grade 4 students                                                         |           |
| 16.2 | Enter for Physics × Grade 4 (no competency)                                     | 403; redirect to `/en/report-cards/comments`; toast "You don't teach this subject"                |           |
| 16.3 | Enter for Mathematics × Grade 3 (teaches Math but to 4th only)                  | 403; redirect; toast "You don't teach this subject in this class"                                 |           |
| 16.4 | API `GET /v1/report-comments?class_id=G4&subject_id=<math>&audience=subject`    | 200; roster scoped                                                                                |           |
| 16.5 | API `GET /v1/report-comments?class_id=G4&subject_id=<physics>&audience=subject` | 403 `SUBJECT_OUT_OF_SCOPE`                                                                        |           |
| 16.6 | Window check                                                                    | Same closed/not-yet-open handling as overall (§11.5–11.6)                                         |           |
| 16.7 | Row content                                                                     | Student name + current grade (A, B, 85%) + comment body_en / body_ar + AI Draft button            |           |
| 16.8 | Competency vs enrolment mismatch                                                | If a competency row points at a now-empty class, empty state "No students in this class" rendered |           |
| 16.9 | Revoked competency between page load and save                                   | PATCH after revocation → 403 `SUBJECT_OUT_OF_SCOPE`                                               |           |

---

## 17. Subject Comments — Write & Autosave

| #     | What to Check                               | Expected Result                                                                                                            | Pass/Fail |
| ----- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1  | Type into row                               | Textarea accepts input; counter live                                                                                       |           |
| 17.2  | Debounce                                    | **800 ms** after last keystroke                                                                                            |           |
| 17.3  | PATCH body                                  | `PATCH /v1/report-comments/<id>` with `{ body_en, status: 'draft', author_user_id: sarah.id, subject_id: <math_uuid> }`    |           |
| 17.4  | PATCH response                              | 200; `version` increments                                                                                                  |           |
| 17.5  | Rapid multi-row edits                       | Edits across 3 students queue correctly; no dropped saves                                                                  |           |
| 17.6  | Save on closed window                       | 409 `WINDOW_CLOSED`                                                                                                        |           |
| 17.7  | Save on wrong subject                       | PATCH tamper `subject_id=<physics>` → 403 `SUBJECT_OUT_OF_SCOPE`                                                           |           |
| 17.8  | Save with wrong author                      | PATCH tamper `author_user_id=<other>` → 403 `INVALID_AUTHOR`                                                               |           |
| 17.9  | Bilingual entry                             | Arabic tab autosaves independently; `body_ar` included only when touched                                                   |           |
| 17.10 | Validation — empty body with submit attempt | Server allows empty draft but blocks `pending_review` transition with 400                                                  |           |
| 17.11 | Audit trail                                 | Every save writes `audit_log` row — `{ action: 'report_comment.updated', entity_type: 'subject', actor: sarah.id }`        |           |
| 17.12 | Concurrent authors (if co-teaching enabled) | Two teachers on same subject: server uses last-write-wins with version increment; stale writer receives `VERSION_CONFLICT` |           |
| 17.13 | Retry on network flap                       | PATCH fails with network error; UI retries and succeeds; no duplicate version bump                                         |           |

---

## 18. Subject Comments — Per-Row AI Draft

| #     | What to Check                     | Expected Result                                                                                                     | Pass/Fail |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1  | "AI Draft" button visible per row | Enabled when Sarah has competency on subject × class                                                                |           |
| 18.2  | Click AI Draft                    | Modal opens showing student summary: current grade, effort band, attendance %                                       |           |
| 18.3  | Tone selector                     | Options: Encouraging / Neutral / Concerned — default Encouraging                                                    |           |
| 18.4  | Generate                          | `POST /v1/report-comments/<id>/ai-draft` body `{ tone: 'encouraging', locale: 'en' }`; 202 returns `{ job_id }`     |           |
| 18.5  | Polling                           | `GET /v1/report-comments/<id>/ai-draft/<job_id>` → 200 when complete, 202 while pending                             |           |
| 18.6  | Draft suggestion rendered         | Preview shown in modal; Accept / Regenerate / Cancel buttons                                                        |           |
| 18.7  | Accept                            | Modal closes; draft body pre-filled in textarea; autosave fires immediately                                         |           |
| 18.8  | Regenerate                        | Same endpoint, fresh job_id; no stale content                                                                       |           |
| 18.9  | Out-of-scope AI draft attempt     | `POST /v1/report-comments/<id>/ai-draft` for a comment Sarah doesn't own → 403 `INVALID_AUTHOR`                     |           |
| 18.10 | Rate limit                        | After 20 AI drafts within 5 minutes, 429 `AI_RATE_LIMITED`                                                          |           |
| 18.11 | Quota enforcement                 | Tenant-level `ai_monthly_quota` checked; 402 `QUOTA_EXCEEDED` when spent                                            |           |
| 18.12 | Injection-safe                    | Student name with quotes/newlines rendered without breaking prompt (verify with fixture student "O'Brien, \"Tom\"") |           |
| 18.13 | Cancel mid-generation             | Closing modal aborts polling; BullMQ job allowed to complete but result discarded                                   |           |
| 18.14 | PII redaction                     | AI prompt redacts student emails/phone/address; only first name + grade-band + attendance-band used                 |           |
| 18.15 | Audit log                         | `report_comment.ai_draft.requested` row per generate, with tone + locale                                            |           |
| 18.16 | Locale mismatch                   | Generate with `locale=ar` while English tab active → draft populates Arabic field, NOT English                      |           |

---

## 19. Subject Comments — Bulk AI Draft All

| #     | What to Check                     | Expected Result                                                                                                                                       | Pass/Fail |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1  | "Bulk AI Draft" button in toolbar | Visible only when ≥ 1 row empty AND subject is in Sarah's competencies                                                                                |           |
| 19.2  | Click Bulk AI Draft               | Confirmation modal: "Generate AI drafts for X students?"                                                                                              |           |
| 19.3  | Confirm                           | `POST /v1/report-comments/bulk-ai-draft` body `{ class_id, subject_id, audience: 'subject', tone, locale, only_empty: true }`; 202 `{ batch_job_id }` |           |
| 19.4  | Progress bar                      | Polls `GET /v1/report-comments/bulk-ai-draft/<batch_job_id>` every 2 s; shows X / Y complete                                                          |           |
| 19.5  | Completion                        | All eligible rows populated with AI drafts as `status=draft`; non-empty rows untouched                                                                |           |
| 19.6  | Partial failure                   | If 2 of 22 fail, failures listed in summary modal with retry button per row                                                                           |           |
| 19.7  | Out-of-scope subject              | Bulk for Physics → 403 `SUBJECT_OUT_OF_SCOPE` (same check as single)                                                                                  |           |
| 19.8  | Window closed                     | 409 `WINDOW_CLOSED` — bulk rejected atomically                                                                                                        |           |
| 19.9  | Audit log                         | One `bulk_ai_draft.started` + one `bulk_ai_draft.completed` row per batch                                                                             |           |
| 19.10 | Cancellation                      | User closes tab mid-batch → server still completes; on return, rows populated                                                                         |           |
| 19.11 | Quota partial fail                | Bulk starts with 18 of 22 tokens available → first 18 succeed, remaining 4 return `QUOTA_EXCEEDED` in summary                                         |           |
| 19.12 | Rate limit                        | If bulk triggers > 20 requests/minute, server throttles jobs (not rejects); UI shows "Paused — rate limit"                                            |           |
| 19.13 | Only_empty flag honoured          | Rows with `body_en.length > 0` not overwritten                                                                                                        |           |

---

## 20. Subject Comments — Finalise / Bulk Finalise DENIED

| #    | What to Check                                | Expected Result                                                                                 | Pass/Fail |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Per-row Finalise button                      | NOT rendered                                                                                    |           |
| 20.2 | Bulk Finalise toolbar button                 | NOT rendered                                                                                    |           |
| 20.3 | API `POST /v1/report-comments/<id>/finalise` | 403 `FORBIDDEN_ROLE`                                                                            |           |
| 20.4 | API `POST /v1/report-comments/bulk-finalise` | 403 `FORBIDDEN_ROLE`                                                                            |           |
| 20.5 | Submit-for-review                            | `PATCH /v1/report-comments/<id>` with `{ status: 'pending_review' }` — 200 succeeds for teacher |           |
| 20.6 | Admin-returned-to-draft round-trip           | Admin reverts to draft → teacher sees editable row again; autosave works                        |           |
| 20.7 | Terminal state enforcement                   | After admin finalises, teacher PATCH returns 409 `INVALID_STATUS_TRANSITION`                    |           |
| 20.8 | Submit-for-review while empty                | PATCH `{ status: 'pending_review' }` with `body_en=''` → 400 `EMPTY_COMMENT`                    |           |

---

## 21. Subject Comments — Cross-Subject Blocking

| #    | What to Check                                                                    | Expected Result                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | URL `/en/report-cards/comments/subject/<G4>/<physics>`                           | 403; redirect; toast "You don't teach this subject"                                                                    |           |
| 21.2 | URL `/en/report-cards/comments/subject/<G3>/<math>` (teaches Math but not to G3) | 403 `SUBJECT_OUT_OF_SCOPE`                                                                                             |           |
| 21.3 | API tamper — correct competency on path, wrong subject_id in PATCH               | Server re-validates against competency table; 403 `SUBJECT_OUT_OF_SCOPE`                                               |           |
| 21.4 | Sub-subject granularity                                                          | If curriculum introduces sub-strands (e.g. Math → Geometry), competency must cover the specific strand or 403 returned |           |
| 21.5 | Revoked competency mid-session                                                   | Admin revokes Sarah's History competency → her next PATCH returns 403; UI shows toast + redirect                       |           |
| 21.6 | Subject_id not in tenant                                                         | PATCH with subject_id from another tenant → RLS at DB layer returns empty; service returns 404 `SUBJECT_NOT_FOUND`     |           |

---

## 22. Teacher Requests — List Page

URL: `/en/report-cards/requests` (accessible from comment landing via "My Requests" link).

| #     | What to Check                                                              | Expected Result                                                               | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 22.1  | List renders                                                               | Columns: Type, Class / Subject, Reason, Status, Created, Actions              |           |
| 22.2  | API `GET /v1/report-card-requests?scope=mine`                              | 200; only requests with `requester_user_id = sarah.id`                        |           |
| 22.3  | Another teacher's pending request                                          | NOT visible in Sarah's list                                                   |           |
| 22.4  | Filter: status pending / approved / rejected / cancelled                   | Client-side filter updates list                                               |           |
| 22.5  | Request types supported                                                    | `reopen_window`, `reassign_comment`, `add_competency` (if tenant has flag on) |           |
| 22.6  | Direct API tamper `?scope=all`                                             | 403 `FORBIDDEN_ROLE` — teacher scope overriden by server regardless of param  |           |
| 22.7  | Direct ID access `GET /v1/report-card-requests/<other-teacher-request-id>` | 403 `FORBIDDEN_ROLE`                                                          |           |
| 22.8  | Empty state                                                                | "You haven't made any requests yet" + New Request CTA                         |           |
| 22.9  | Pagination                                                                 | `pageSize` defaults 20; list sorted `created_at DESC`                         |           |
| 22.10 | Realtime update on admin decision                                          | Admin approves → Sarah's row updates `status='approved'` within 30 s          |           |

---

## 23. Teacher Requests — New Request Form

| #     | What to Check                                   | Expected Result                                                                           | Pass/Fail |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- | ---------------------------- | --- |
| 23.1  | New Request button                              | Opens form dialog                                                                         |           |
| 23.2  | Request type dropdown                           | Lists only teacher-permitted types: Reopen Window, Reassign Comment                       |           |
| 23.3  | Class dropdown                                  | Scoped to Sarah's classes only                                                            |           |
| 23.4  | Subject dropdown (if type=subject)              | Scoped to Sarah's competencies                                                            |           |
| 23.5  | Reason field                                    | Required, 20-500 chars                                                                    |           |
| 23.6  | Submit                                          | `POST /v1/report-card-requests` 201; row added to list                                    |           |
| 23.7  | Submit with out-of-scope class via devtools     | 403 `CLASS_OUT_OF_SCOPE`                                                                  |           |
| 23.8  | Submit with request type "grant_admin" (tamper) | 400 `VALIDATION_FAILED` — enum rejects                                                    |           |
| 23.9  | Duplicate request                               | Second identical request → 409 `DUPLICATE_REQUEST`                                        |           |
| 23.10 | Notification fires                              | Admin users receive in-app + email notification (validate via admin login second browser) |           |
| 23.11 | Attachment (optional)                           | If enabled, file upload limited to 5 MB, `pdf                                             | png       | jpg`; otherwise field hidden |     |
| 23.12 | Self-request validation                         | Reassign to same requester rejected 400 `SELF_REASSIGN_NOT_ALLOWED`                       |           |

---

## 24. Teacher Requests — Cancel Own Pending

| #    | What to Check                    | Expected Result                                                                          | Pass/Fail |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| 24.1 | Cancel button on own pending row | Visible                                                                                  |           |
| 24.2 | Click Cancel                     | Confirmation dialog                                                                      |           |
| 24.3 | Confirm                          | `POST /v1/report-card-requests/<id>/cancel` 200; row status → `cancelled`                |           |
| 24.4 | Cancel already-approved request  | Button disabled; tooltip "Approved requests cannot be cancelled"                         |           |
| 24.5 | Cancel another teacher's request | Cancel button NOT rendered; API returns 403 `FORBIDDEN_ROLE`                             |           |
| 24.6 | Cancel already-rejected          | Button disabled                                                                          |           |
| 24.7 | Cancel invalid transition        | `cancelled → pending` impossible; only `pending → cancelled`                             |           |
| 24.8 | Audit log                        | `report_card_request.cancelled` with actor + reason (auto-fill "Cancelled by requester") |           |
| 24.9 | Side effects on cancel           | No downstream changes to comment rows — request cancellation is metadata-only            |           |

---

## 25. Teacher Requests — Approve/Reject Buttons NOT Visible

| #    | What to Check                                                    | Expected Result                                       | Pass/Fail |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 25.1 | Approve button on any request                                    | NOT rendered                                          |           |
| 25.2 | Reject button on any request                                     | NOT rendered                                          |           |
| 25.3 | API `POST /v1/report-card-requests/<id>/approve`                 | 403 `FORBIDDEN_ROLE`                                  |           |
| 25.4 | API `POST /v1/report-card-requests/<id>/reject`                  | 403 `FORBIDDEN_ROLE`                                  |           |
| 25.5 | API `POST /v1/report-card-requests/<id>/approve` for own request | 403 `FORBIDDEN_ROLE` — even self-approval blocked     |           |
| 25.6 | Admin-only visible detail fields                                 | Admin-notes textarea hidden; internal_priority hidden |           |
| 25.7 | Status change view                                               | Status read-only; no dropdown to override             |           |

---

## 26. Cross-Class Blocking (URL Negative Matrix)

Every row tests a deep-link tamper a malicious teacher might try.

| #     | URL / Action                                                    | Expected Result                                                                 | Pass/Fail |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 26.1  | `/en/report-cards/library?class_id=<3B>`                        | List unaffected — shows Sarah-scoped rows only                                  |           |
| 26.2  | `/en/report-cards/library/<3B-card-uuid>`                       | 403 page OR redirect to `/library` with toast                                   |           |
| 26.3  | `/en/report-cards/comments/overall/<3B>`                        | Redirect + toast "Not homeroom"                                                 |           |
| 26.4  | `/en/report-cards/comments/subject/<G4>/<physics>`              | Redirect + toast "Don't teach subject"                                          |           |
| 26.5  | `/en/report-cards/generate`                                     | Redirect + toast "No permission"                                                |           |
| 26.6  | `/en/report-cards/analytics`                                    | Redirect + toast                                                                |           |
| 26.7  | `/en/report-cards/settings`                                     | Read-only view OR redirect (§27.x) — never write UI                             |           |
| 26.8  | `/en/report-cards/templates`                                    | 403 OR redirect — templates are admin-only                                      |           |
| 26.9  | `/en/report-cards/bulk-publish`                                 | 403 OR redirect                                                                 |           |
| 26.10 | `/en/report-cards/audit-log`                                    | 403 — teacher-scoped audit log is future work                                   |           |
| 26.11 | `/en/report-cards/requests/<other-teacher-request>`             | 403 OR redirect to `/requests`                                                  |           |
| 26.12 | POST `/v1/report-cards/<3B-card>/publish`                       | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.13 | POST `/v1/report-cards/<own-card>/publish`                      | 403 `FORBIDDEN_ROLE` — teachers never publish                                   |           |
| 26.14 | DELETE `/v1/report-comment-windows/<id>`                        | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.15 | POST `/v1/report-comment-windows`                               | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.16 | PATCH `/v1/report-card-templates/<id>`                          | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.17 | GET `/v1/report-cards/analytics/summary`                        | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.18 | GET `/v1/report-cards/audit-log?scope=all`                      | 403 `FORBIDDEN_ROLE`                                                            |           |
| 26.19 | WebSocket subscribe to `tenant:report-cards:admin` channel      | Rejected at handshake (403); teachers subscribe only to their per-user channel  |           |
| 26.20 | GraphQL / `/trpc` paths (if any)                                | Same permission gates as REST                                                   |           |
| 26.21 | Tenant-swap cookie tamper (force `tenant_id=<other>` in cookie) | 401 `INVALID_TENANT_CONTEXT` — server re-derives from user                      |           |
| 26.22 | JWT replay across tenants                                       | Sarah's NHQS token used on different tenant's subdomain → 403 `TENANT_MISMATCH` |           |

---

## 27. What Teachers Must NOT See or Do (Full Negative Matrix)

| #     | Capability                         | Teacher Behaviour                                                                  | Pass/Fail |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 27.1  | Generate report cards              | No tile, no URL, no endpoint                                                       |           |
| 27.2  | Analytics dashboard                | No tile, no URL, no endpoint                                                       |           |
| 27.3  | Settings write                     | No write UI; settings may render read-only                                         |           |
| 27.4  | Template CRUD                      | No UI; endpoints 403                                                               |           |
| 27.5  | Comment window CRUD                | No UI; endpoints 403                                                               |           |
| 27.6  | Finalise comments                  | No UI; endpoint 403                                                                |           |
| 27.7  | Unfinalise comments                | No UI; endpoint 403                                                                |           |
| 27.8  | Bulk publish cards                 | No UI; endpoint 403                                                                |           |
| 27.9  | Bulk delete cards                  | No UI; endpoint 403                                                                |           |
| 27.10 | PDF bundle                         | No UI; endpoint 403                                                                |           |
| 27.11 | CSV export                         | No UI; endpoint 403                                                                |           |
| 27.12 | Cross-class read                   | UI scoped; endpoint 403                                                            |           |
| 27.13 | Cross-subject read                 | UI scoped; endpoint 403                                                            |           |
| 27.14 | Cross-tenant read                  | RLS blocks at DB layer                                                             |           |
| 27.15 | Approve requests                   | No UI; endpoint 403                                                                |           |
| 27.16 | Reject requests                    | No UI; endpoint 403                                                                |           |
| 27.17 | Grant competencies to self         | No UI; endpoint 403; also blocked by validation                                    |           |
| 27.18 | Change student grades              | Not this module's concern — direct to Gradebook spec; endpoint here 403 regardless |           |
| 27.19 | Edit student roster                | Not this module; 403                                                               |           |
| 27.20 | See other teacher's AI quota       | No UI; endpoint 403                                                                |           |
| 27.21 | Download teacher-comment audit log | No UI; endpoint 403                                                                |           |
| 27.22 | See system feature flags JSON      | No UI; endpoint 403                                                                |           |
| 27.23 | Impersonate                        | No UI; platform-admin-only                                                         |           |
| 27.24 | Edit other teacher's comments      | No UI; API `PATCH /v1/report-comments/<other>` → 403 `INVALID_AUTHOR`              |           |
| 27.25 | Directly enqueue BullMQ jobs       | No public endpoint; admin-API-only                                                 |           |
| 27.26 | Force-publish via bulk export      | No endpoint exists for teachers                                                    |           |

---

## 28. Role-Specific Empty States

| #     | Scenario                                     | Expected Result                                                                                  | Pass/Fail |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 28.1  | Sarah has no homeroom (admin revokes 2A)     | Landing page "Overall Comments" card shows empty state "You aren't a homeroom teacher this term" |           |
| 28.2  | No enter links for overall                   | Enter link hidden; if deep-linked, 403 + redirect                                                |           |
| 28.3  | Sarah has no competencies (admin strips all) | Subject Comments card shows empty state "You have no subject assignments this term"              |           |
| 28.4  | Enter links hidden                           | No subject rows rendered; API returns empty `subjects: []`                                       |           |
| 28.5  | Both homeroom and competencies revoked       | Dashboard Write Comments tile shows "Nothing to write yet" and is disabled                       |           |
| 28.6  | Library tile empty                           | "No report cards in your classes yet" + link to Learning module                                  |           |
| 28.7  | All windows closed                           | Subject cards show grey "Closed" state; no action buttons                                        |           |
| 28.8  | Window upcoming                              | "Opens on <date>" state; no action buttons                                                       |           |
| 28.9  | Template unpublished for term                | Landing shows "No active template — contact admin"                                               |           |
| 28.10 | Tenant disables module                       | Entire `/report-cards` route → 404; morph bar hides Report Cards link                            |           |

---

## 29. Arabic / RTL

| #     | What to Check            | Expected Result                                                                                | Pass/Fail |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------- | --------- |
| 29.1  | Switch locale to AR      | URL becomes `/ar/report-cards`; `<html dir="rtl">`                                             |           |
| 29.2  | Morph bar mirrored       | Hub labels right-aligned; sub-strip order reversed                                             |           |
| 29.3  | Report card editor tabs  | English / Arabic tabs swap sides in RTL                                                        |           |
| 29.4  | Textarea direction       | English textarea remains `dir="ltr"` inside `dir="rtl"` container; Arabic textarea `dir="rtl"` |           |
| 29.5  | Numerals                 | Western numerals (0-9) in both locales — enrolment codes do not switch to Arabic-Indic         |           |
| 29.6  | Dates                    | Gregorian dates in both locales                                                                |           |
| 29.7  | Padding/margins          | No `ml-`/`mr-` classes; only `ms-`/`me-` logical properties — confirm with DOM inspector       |           |
| 29.8  | Icons                    | Chevrons flip; calendar icons stay neutral                                                     |           |
| 29.9  | Autosave chip            | "Saved" ↔ Arabic equivalent translation renders correctly                                      |           |
| 29.10 | AI Draft modal in Arabic | Generated text arrives in Arabic when `locale=ar`; RTL rendering preserved                     |           |
| 29.11 | Student names            | Latin names remain LTR inside RTL flow (auto-detect)                                           |           |
| 29.12 | Mixed content cell       | Row containing Arabic comment + Latin student code wraps correctly, no overflow                |           |

---

## 30. Mobile Responsiveness (375 px)

| #     | What to Check              | Expected Result                                                                               | Pass/Fail |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 30.1  | Resize to 375 × 812        | Morph bar collapses to hamburger; sub-strip becomes horizontally scrollable                   |           |
| 30.2  | Report Cards dashboard     | 2 tiles stack vertically; each full-width; no horizontal scroll                               |           |
| 30.3  | Library list               | Table wraps in `overflow-x-auto` container; row renders as card-stack OR scrolls horizontally |           |
| 30.4  | Filter dropdowns           | Open as bottom sheets, not tiny floating menus                                                |           |
| 30.5  | Comment editor textarea    | `w-full`, `text-base` (16 px) → no iOS autozoom                                               |           |
| 30.6  | Autosave chip              | Visible without horizontal scroll                                                             |           |
| 30.7  | AI Draft modal             | Fills screen; close X reachable in top-end corner                                             |           |
| 30.8  | Keyboard overlay           | Focus scrolls textarea into view above keyboard                                               |           |
| 30.9  | Tap targets                | All buttons ≥ 44 × 44 px                                                                      |           |
| 30.10 | No `100vw` overflow        | Body width ≤ 375 px at rest                                                                   |           |
| 30.11 | Bulk AI Draft confirmation | Modal usable; buttons stack vertically                                                        |           |
| 30.12 | Language switcher          | Accessible from hamburger overlay                                                             |           |
| 30.13 | Request modal              | Fields stack; reason textarea 4 rows min                                                      |           |
| 30.14 | Sub-strip overflow         | "Comments" and "Library" tabs stay tappable; scroll affordance (fade) present                 |           |

---

## 31. Console & Network Health

| #     | What to Check                        | Expected Result                                                                   | Pass/Fail |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------- | --------- |
| 31.1  | Console errors                       | Zero on all teacher-scoped pages                                                  |           |
| 31.2  | Console warnings                     | Known React warnings only; no new violations                                      |           |
| 31.3  | 4xx / 5xx responses on healthy flows | Zero during steady-state (filter: Network tab)                                    |           |
| 31.4  | WebSocket reconnection               | Single stable connection per session; reconnection on tab sleep within 5 s        |           |
| 31.5  | No PII in console logs               | Student names, emails must not appear                                             |           |
| 31.6  | No access-token in URL               | Token always in Authorization header                                              |           |
| 31.7  | Sentry events                        | No new uncaught exceptions reported                                               |           |
| 31.8  | Performance                          | LCP < 2.5 s on library page; FID < 100 ms                                         |           |
| 31.9  | Memory                               | No unbounded growth over 5-minute editing session (heap snapshot ≤ +15 MB)        |           |
| 31.10 | Network chatter                      | Autosave does not refetch the full list after save (patch response is sufficient) |           |

---

## 32. Backend Endpoint Map (Teacher Scope — ALLOWED / DENIED / CONDITIONAL)

| #     | Method + Path                                       | Teacher Access                                           | Status Code (Denied)                               | Pass/Fail |
| ----- | --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | --------- |
| 32.1  | `GET /v1/report-cards?scope=mine`                   | ALLOWED                                                  | —                                                  |           |
| 32.2  | `GET /v1/report-cards?scope=all`                    | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.3  | `GET /v1/report-cards/<id>` (in-scope)              | ALLOWED                                                  | —                                                  |           |
| 32.4  | `GET /v1/report-cards/<id>` (out-of-scope)          | DENIED                                                   | 403 `CLASS_OUT_OF_SCOPE`                           |           |
| 32.5  | `GET /v1/report-cards/<id>/pdf` (in-scope)          | ALLOWED                                                  | —                                                  |           |
| 32.6  | `POST /v1/report-cards/bulk-publish`                | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.7  | `POST /v1/report-cards/bulk-delete`                 | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.8  | `POST /v1/report-cards/pdf-bundle`                  | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.9  | `POST /v1/report-cards/export.csv`                  | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.10 | `POST /v1/report-cards/generate`                    | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.11 | `GET /v1/report-cards/analytics/summary`            | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.12 | `GET /v1/report-cards/dashboard`                    | ALLOWED                                                  | —                                                  |           |
| 32.13 | `GET /v1/report-cards/scoped-classes`               | ALLOWED                                                  | —                                                  |           |
| 32.14 | `GET /v1/report-comments/landing`                   | ALLOWED                                                  | —                                                  |           |
| 32.15 | `GET /v1/report-comments?class_id=<in>`             | ALLOWED                                                  | —                                                  |           |
| 32.16 | `GET /v1/report-comments?class_id=<out>`            | DENIED                                                   | 403 `CLASS_OUT_OF_SCOPE`                           |           |
| 32.17 | `PATCH /v1/report-comments/<own-id>`                | ALLOWED                                                  | —                                                  |           |
| 32.18 | `PATCH /v1/report-comments/<other-id>`              | DENIED                                                   | 403 `INVALID_AUTHOR`                               |           |
| 32.19 | `POST /v1/report-comments/<id>/finalise`            | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.20 | `POST /v1/report-comments/<id>/unfinalise`          | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.21 | `POST /v1/report-comments/bulk-finalise`            | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.22 | `POST /v1/report-comments/<id>/ai-draft` (own)      | ALLOWED                                                  | —                                                  |           |
| 32.23 | `POST /v1/report-comments/<id>/ai-draft` (other)    | DENIED                                                   | 403 `INVALID_AUTHOR`                               |           |
| 32.24 | `POST /v1/report-comments/bulk-ai-draft` (in-scope) | ALLOWED                                                  | —                                                  |           |
| 32.25 | `POST /v1/report-comments/bulk-ai-draft` (out)      | DENIED                                                   | 403 `SUBJECT_OUT_OF_SCOPE` or `CLASS_OUT_OF_SCOPE` |           |
| 32.26 | `GET /v1/report-comment-windows` (scoped)           | ALLOWED (read-only, scoped)                              | —                                                  |           |
| 32.27 | `POST /v1/report-comment-windows`                   | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.28 | `PATCH /v1/report-comment-windows/<id>`             | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.29 | `DELETE /v1/report-comment-windows/<id>`            | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.30 | `GET /v1/report-card-requests?scope=mine`           | ALLOWED                                                  | —                                                  |           |
| 32.31 | `GET /v1/report-card-requests?scope=all`            | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.32 | `POST /v1/report-card-requests`                     | ALLOWED (scope-validated)                                | —                                                  |           |
| 32.33 | `POST /v1/report-card-requests/<own>/cancel`        | ALLOWED (pending only)                                   | —                                                  |           |
| 32.34 | `POST /v1/report-card-requests/<other>/cancel`      | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.35 | `POST /v1/report-card-requests/<id>/approve`        | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.36 | `POST /v1/report-card-requests/<id>/reject`         | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.37 | `GET /v1/report-card-templates`                     | CONDITIONAL (read-only list; bodies restricted)          | —                                                  |           |
| 32.38 | `POST /v1/report-card-templates`                    | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.39 | `PATCH /v1/report-card-templates/<id>`              | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.40 | `DELETE /v1/report-card-templates/<id>`             | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.41 | `GET /v1/report-cards/settings`                     | CONDITIONAL (read-only)                                  | —                                                  |           |
| 32.42 | `PATCH /v1/report-cards/settings`                   | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.43 | `GET /v1/report-cards/audit-log?scope=mine`         | CONDITIONAL (future work — currently 403 if not enabled) | 403 `FEATURE_NOT_ENABLED`                          |           |
| 32.44 | `GET /v1/report-cards/audit-log?scope=all`          | DENIED                                                   | 403 `FORBIDDEN_ROLE`                               |           |
| 32.45 | `GET /v1/report-comments/<id>/versions` (own)       | ALLOWED                                                  | —                                                  |           |
| 32.46 | `GET /v1/report-comments/<id>/versions` (other)     | DENIED                                                   | 403 `INVALID_AUTHOR`                               |           |

---

## 33. Observations & Bugs Flagged (UX gaps noted during spec authoring)

Pre-populated from walkthrough notes. Mark each Confirmed / Not Reproduced during live runs.

| #     | Observation                                                                                                                                | Severity | Notes                                                           | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------- | --------- |
| 33.1  | Teachers see "Finalise" buttons momentarily during initial render before permission check strips them (flash-of-unauthorised-button)       | Medium   | Gate on server-hydrated permission props, not client hook alone |           |
| 33.2  | Out-of-scope class URL (`/comments/overall/<3B>`) loads editor shell for ~300 ms before 403 redirect — shows student names (PII) briefly   | High     | Guard must run before data fetch, not after                     |           |
| 33.3  | "Bulk AI Draft" button disabled tooltip reads "You don't have permission" even when the real cause is window-closed                        | Low      | Disambiguate tooltip reasons                                    |           |
| 33.4  | `GET /v1/report-cards/scoped-classes` has no cache header; re-fetched on every route change                                                | Low      | Add `Cache-Control: private, max-age=60`                        |           |
| 33.5  | Autosave debounce timer continues after unmount, causing a stale PATCH on tab close                                                        | Medium   | Clear timer in cleanup effect                                   |           |
| 33.6  | Cross-subject blocking on PATCH returns 403 but client UI does not show toast — silent failure on devtools tamper                          | Medium   | `error boundary` + toast on 403 from autosave                   |           |
| 33.7  | Request-reopen modal allows reason < 20 chars to submit if IME composition is open (Arabic input)                                          | Low      | Validate on `compositionend` as well                            |           |
| 33.8  | Settings page renders read-only but includes the "Save" button greyed-out — confusing; better to hide entirely                             | Low      | Conditional render                                              |           |
| 33.9  | Teacher dashboard tile counts cached 60 s; stale after comment submit                                                                      | Low      | Invalidate on PATCH success                                     |           |
| 33.10 | PDF watermark "Internal — Do Not Distribute" uses physical `text-align: right` in RTL variant                                              | Medium   | Switch to `text-end`                                            |           |
| 33.11 | Mobile: AI Draft modal close X positioned with `right-4` — breaks RTL                                                                      | Medium   | Use `end-4`                                                     |           |
| 33.12 | Console warning: "Can't perform React state update on unmounted component" in CommentsEditor when navigating during autosave               | Low      | Guard setState                                                  |           |
| 33.13 | `/en/report-cards/analytics` redirect shows toast twice (once from layout guard, once from page guard)                                     | Low      | Consolidate guards                                              |           |
| 33.14 | `audit_log` rows for teacher AI drafts record `request.body.tone` field — may exceed column length for long prompt customisations (future) | Low      | Tracked for future                                              |           |
| 33.15 | Cancelling a request does NOT notify admin; only creation does                                                                             | Low      | Symmetry for admin visibility                                   |           |
| 33.16 | Homeroom revocation mid-session doesn't force UI refresh — stale tile until reload                                                         | Medium   | Invalidate via realtime event                                   |           |
| 33.17 | Bulk AI Draft endpoint returns 202 but no way to track progress if browser closes; admin has resume UI, teacher doesn't                    | Low      | Surface running batches on Teacher Requests page                |           |
| 33.18 | Library PDF download uses `window.open()` which triggers popup blocker on some browsers                                                    | Low      | Use anchor `download` attribute                                 |           |
| 33.19 | `GET /v1/report-comments/landing` returns full window objects including `closed_by_user_id` — should be scrubbed for teacher role          | Medium   | Shape-layer in DTO                                              |           |
| 33.20 | Version conflict modal on autosave does not preserve user's unsaved typed text; forces reload and loses input                              | High     | Keep user text in clipboard or local buffer before reload       |           |

---

## 34. Sign-Off

| #     | Criterion                                                              | Status |
| ----- | ---------------------------------------------------------------------- | ------ |
| 34.1  | All §1–§32 rows executed                                               | ☐      |
| 34.2  | Every denied endpoint returns documented status + code                 | ☐      |
| 34.3  | Every scoped view excludes out-of-scope data at both UI and API layers | ☐      |
| 34.4  | No admin-only UI surfaces rendered for teacher                         | ☐      |
| 34.5  | Autosave debounce verified at 800 ms ± 50 ms                           | ☐      |
| 34.6  | Cross-class and cross-subject tamper matrices fully negative           | ☐      |
| 34.7  | §33 observations triaged                                               | ☐      |
| 34.8  | RTL + mobile spot-checks complete                                      | ☐      |
| 34.9  | Console and network clean on happy paths                               | ☐      |
| 34.10 | Spec reviewed against admin spec for duplicate coverage                | ☐      |

**Tested by:** ********\_\_\_\_********
**Date:** ********\_\_\_\_********
**Build SHA:** ********\_\_\_\_********
**Sign-off:** ********\_\_\_\_********

---

## Appendix A — Concurrency & Race Conditions

These scenarios probe the boundaries where multiple actors or multiple tabs touch the same row simultaneously. Teachers operate without the admin's override paths, so race handling must surface consistent, non-destructive results.

| #    | Scenario                                                                                                              | Expected Result                                                                                                        | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| A.1  | Two tabs open the same 2A overall-comment editor; tab 1 types "Alpha", tab 2 types "Beta" within 200 ms of each other | Last-write-wins via `version` increment; loser receives 409 `VERSION_CONFLICT`; no silent overwrite                    |           |
| A.2  | Sarah submits row for review while admin simultaneously finalises                                                     | Whichever resolves first wins; second returns 409 `INVALID_STATUS_TRANSITION`                                          |           |
| A.3  | Admin closes a comment window mid-autosave                                                                            | Autosave PATCH in flight completes with 200; next autosave fails 409 `WINDOW_CLOSED`                                   |           |
| A.4  | Admin revokes Sarah's competency while she has subject editor open                                                    | Next autosave returns 403 `SUBJECT_OUT_OF_SCOPE`; UI shows toast and redirects to `/comments`                          |           |
| A.5  | Duplicate bulk AI draft request — Sarah clicks "Bulk AI Draft" twice                                                  | Server uses idempotency key from client; second click returns the first `batch_job_id` 200, no duplicate queue entries |           |
| A.6  | Comment owner reassigned to another teacher while Sarah types                                                         | Sarah's next autosave returns 403 `INVALID_AUTHOR`; unsaved text preserved in UI via recovery banner                   |           |
| A.7  | Homeroom reassignment during session                                                                                  | Sarah's next landing fetch shows 2A removed; Enter link disappears within 30 s                                         |           |
| A.8  | Two rows autosaved simultaneously from keyboard macro                                                                 | Both PATCHes succeed; neither blocks the other; both `version` rows incremented independently                          |           |
| A.9  | Server rolling deploy mid-save                                                                                        | PATCH fails with 502; client retries with same idempotency key; succeeds on second attempt                             |           |
| A.10 | Token expires during autosave                                                                                         | PATCH returns 401; client silently refreshes token and retries once; autosave succeeds without user intervention       |           |

---

## Appendix B — Security Headers & Transport

| #    | What to Check                                | Expected Result                                                               | Pass/Fail |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| B.1  | `Strict-Transport-Security` on all responses | `max-age=31536000; includeSubDomains; preload`                                |           |
| B.2  | `Content-Security-Policy`                    | Denies inline scripts; allows self + Sentry + Stripe where relevant           |           |
| B.3  | `X-Content-Type-Options`                     | `nosniff`                                                                     |           |
| B.4  | `X-Frame-Options`                            | `DENY` or `SAMEORIGIN` on all teacher routes                                  |           |
| B.5  | `Referrer-Policy`                            | `strict-origin-when-cross-origin`                                             |           |
| B.6  | PDF responses                                | `Content-Disposition: attachment`; no `X-Frame` of PDF iframes                |           |
| B.7  | CORS                                         | `/v1/report-*` rejects cross-origin requests from non-allowed origins         |           |
| B.8  | Cookie flags                                 | Refresh token cookie: `HttpOnly; Secure; SameSite=Strict; Path=/`             |           |
| B.9  | Access-token header                          | Authorization: Bearer; never logged server-side                               |           |
| B.10 | No token in network referer                  | Navigation from editor to external link does not leak token in referer header |           |

---

## Appendix C — i18n Edge Cases

| #   | Case                               | Expected Result                                                                                           | Pass/Fail |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| C.1 | Toggle English ↔ Arabic mid-edit   | Editor preserves draft; autosave not retriggered; Arabic tab shows `body_ar` field                        |           |
| C.2 | Translation key missing            | Falls back to English string; no raw `t:foo.bar.baz` leak to user                                         |           |
| C.3 | Plural rule Arabic                 | "2 windows" ↔ correct dual form in Arabic                                                                 |           |
| C.4 | RTL number alignment               | Comment counts `18 of 22` align right-of-label in RTL without mirroring digits                            |           |
| C.5 | Combined LTR email within RTL text | Bidirectional algorithm renders email inline without reordering characters                                |           |
| C.6 | Arabic search query                | Searching `q=أحمد` against Latin-named students returns nothing (no false positives from transliteration) |           |
| C.7 | Keyboard shortcuts                 | `Ctrl+S` triggers manual save in both locales; not captured by browser                                    |           |
| C.8 | Toast position                     | Toasts appear end-aligned (right in LTR, left in RTL) using logical CSS                                   |           |

---

## Appendix D — Permission Matrix Replay

Single table, one row per distinct permission-dimension pair. Each row MUST pass both in UI (hidden/visible) and in API (allowed/denied).

| #    | Action                   | Required Permission                  | Teacher Has It? | UI Visible | API Allowed  |
| ---- | ------------------------ | ------------------------------------ | --------------- | ---------- | ------------ |
| D.1  | View own scoped library  | `report_cards.library.view`          | Yes             | Yes        | Yes          |
| D.2  | View analytics           | `report_cards.analytics.view`        | No              | No         | No           |
| D.3  | Generate report cards    | `report_cards.generate`              | No              | No         | No           |
| D.4  | Publish report card      | `report_cards.publish`               | No              | No         | No           |
| D.5  | Unpublish report card    | `report_cards.unpublish`             | No              | No         | No           |
| D.6  | Delete report card       | `report_cards.delete`                | No              | No         | No           |
| D.7  | Export PDF bundle        | `report_cards.bundle_export`         | No              | No         | No           |
| D.8  | Export CSV               | `report_cards.csv_export`            | No              | No         | No           |
| D.9  | Write own comment        | `report_cards.comment.write`         | Yes             | Yes        | Yes          |
| D.10 | Finalise any comment     | `report_cards.comment.finalise`      | No              | No         | No           |
| D.11 | Unfinalise any comment   | `report_cards.comment.unfinalise`    | No              | No         | No           |
| D.12 | Bulk finalise            | `report_cards.comment.bulk_finalise` | No              | No         | No           |
| D.13 | AI draft own comment     | `report_cards.comment.ai_draft`      | Yes             | Yes        | Yes          |
| D.14 | Bulk AI draft            | `report_cards.comment.ai_draft.bulk` | Yes (scoped)    | Yes        | Yes (scoped) |
| D.15 | Manage templates         | `report_cards.template.manage`       | No              | No         | No           |
| D.16 | Manage windows           | `report_cards.window.manage`         | No              | No         | No           |
| D.17 | Manage settings          | `report_cards.settings.manage`       | No              | No         | No           |
| D.18 | Approve teacher requests | `report_cards.request.approve`       | No              | No         | No           |
| D.19 | View audit log (all)     | `report_cards.audit.view.all`        | No              | No         | No           |
| D.20 | View audit log (own)     | `report_cards.audit.view.own`        | Future-flagged  | No (yet)   | No (yet)     |

---

## Appendix E — Data-Shape Inspections

Verify responses omit admin-only fields from wire payloads. Teachers must never receive an object they shouldn't see even if the UI hides it.

| #   | Response                                               | Fields Present                                                                  | Fields MUST NOT Appear                                                | Pass/Fail |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| E.1 | `GET /v1/report-cards/dashboard`                       | `library_count`, `overall_due`, `subject_due`                                   | `tenant_analytics_breakdown`, `generation_queue_depth`, `admin_notes` |           |
| E.2 | `GET /v1/report-cards/<id>`                            | `student_id`, `class_id`, `template_id`, `status`, `updated_at`                 | `internal_publish_notes`, `reviewer_id`, `approval_trail`             |           |
| E.3 | `GET /v1/report-comments/landing`                      | `overall[].class_id`, `overall[].counts`, `subjects[].subject_id`               | `closed_by_user_id`, `tenant_wide_completion_rate`                    |           |
| E.4 | `GET /v1/report-comments?class_id=2A&audience=overall` | `id`, `student_id`, `body_en`, `body_ar`, `status`, `version`, `author_user_id` | `reviewer_id`, `admin_flagged`, `moderation_reason`                   |           |
| E.5 | `GET /v1/report-card-requests?scope=mine`              | `id`, `type`, `status`, `reason`, `created_at`, `class_id`, `subject_id`        | `admin_notes`, `internal_priority`, `requester_metadata`              |           |
| E.6 | WebSocket broadcast                                    | Per-user events only; `body_ar`, `body_en` scrubbed when not owner              | Tenant-wide analytics events; admin-only job progress                 |           |

---

## Appendix F — Audit-Log Expectations

Teacher-triggered actions must each emit an audit row with actor + tenant context. Verify by querying `audit_log` after the action.

| #    | Teacher Action               | Audit `action` Value                                     | Actor                         | Pass/Fail |
| ---- | ---------------------------- | -------------------------------------------------------- | ----------------------------- | --------- |
| F.1  | Login                        | `auth.login`                                             | Sarah                         |           |
| F.2  | Library PDF download         | `report_card.pdf.downloaded`                             | Sarah                         |           |
| F.3  | Comment draft saved          | `report_comment.updated`                                 | Sarah                         |           |
| F.4  | Comment submitted for review | `report_comment.status_changed` (`draft→pending_review`) | Sarah                         |           |
| F.5  | AI draft requested           | `report_comment.ai_draft.requested`                      | Sarah                         |           |
| F.6  | AI draft accepted            | `report_comment.ai_draft.accepted`                       | Sarah                         |           |
| F.7  | Bulk AI draft started        | `report_comment.bulk_ai_draft.started`                   | Sarah                         |           |
| F.8  | Bulk AI draft completed      | `report_comment.bulk_ai_draft.completed`                 | system (correlation to Sarah) |           |
| F.9  | Reopen request created       | `report_card_request.created`                            | Sarah                         |           |
| F.10 | Reopen request cancelled     | `report_card_request.cancelled`                          | Sarah                         |           |
| F.11 | Denied endpoint hit          | `auth.permission_denied`                                 | Sarah (with path + verb)      |           |
| F.12 | Cross-tenant attempt         | `auth.tenant_mismatch`                                   | Sarah                         |           |

---

## Appendix G — Feedback from Admin Spec Cross-Walk

Items reviewed against `../admin_view/report-cards-e2e-spec.md` (1800 lines) to ensure teacher spec neither duplicates unnecessarily nor skips shared validations.

| #    | Admin Spec Section                                 | Relevance To Teacher Spec                                              | Status               |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------- | -------------------- |
| G.1  | [ADMIN §4] Report Cards Dashboard (4 tiles)        | Teacher reduced to 2 tiles — §4 here is the authoritative teacher view | Covered              |
| G.2  | [ADMIN §7] Template Designer                       | N/A to teachers (admin-only)                                           | Excluded             |
| G.3  | [ADMIN §11] Overall Comments Editor (authoring UX) | Shared inputs; teacher reuses controls but cannot finalise             | §11–§14 cover deltas |
| G.4  | [ADMIN §15] Finalise + Bulk Finalise               | Teacher denied; admin validates state machine                          | §13 §20 cover denial |
| G.5  | [ADMIN §22] Teacher-Request Approval Queue         | Mirror admin view; teacher sees own only                               | §22–§25 cover denial |
| G.6  | [ADMIN §30] Analytics                              | Out of scope for teachers                                              | §32.11 covers denial |
| G.7  | [ADMIN §36] PDF Bundle                             | Out of scope for teachers                                              | §8 covers denial     |
| G.8  | [ADMIN §41] Audit Log                              | Out of scope for teachers                                              | §32.44 covers denial |
| G.9  | [ADMIN Appendix A] State Machine table             | Reused here via error codes (`INVALID_STATUS_TRANSITION`)              | Referenced           |
| G.10 | [ADMIN Appendix C] AI Prompt Rubric                | Reused; teachers call same endpoints with narrower scope               | Referenced           |

---

**End of Teacher View Spec.**
