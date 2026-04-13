# People — E2E Test Specification (Admin / School Owner)

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Perspective:** Admin, School Owner, School Principal, School Vice-Principal  
> **Pages covered:** 14 unique routes + 10 sub-flows (merge, split, add-student, guardian CRUD, emergency-contact CRUD)  
> **Base URL:** `https://nhqs.edupod.app`  
> **Test fixture tenant:** Nurul Huda School (NHQS), slug `nhqs`  
> **Companion specs:** `teacher_view/`, `integration/`, `worker/`, `perf/`, `security/` — see `RELEASE-READINESS.md` for the full pack.

---

## How to use this spec

Every row is one observable check. Mark **Pass / Fail / Blocked** in the rightmost column. A `Fail` on any row where severity is unspecified is a release blocker. Rows explicitly labelled `(info)` are diagnostic and do not block release.

Run this spec top-to-bottom in a fresh browser session per locale (once in `/en/*`, once in `/ar/*`). The tester should keep DevTools open with the **Network** and **Console** tabs visible — both are asserted on.

---

## Table of Contents

1. [Prerequisites & Multi-Tenant Fixture](#1-prerequisites--multi-tenant-fixture)
2. [Out of scope for this spec](#2-out-of-scope-for-this-spec)
3. [People Hub — Morph Bar + Sub-strip](#3-people-hub--morph-bar--sub-strip)
4. [Students — List page](#4-students--list-page)
5. [Students — Export (Excel + PDF)](#5-students--export-excel--pdf)
6. [Students — New student page](#6-students--new-student-page)
7. [Students — Detail page (RecordHub)](#7-students--detail-page-recordhub)
8. [Students — Edit page](#8-students--edit-page)
9. [Students — Status transitions](#9-students--status-transitions)
10. [Students — Allergy report page](#10-students--allergy-report-page)
11. [Staff — List page](#11-staff--list-page)
12. [Staff — Export (Excel + PDF)](#12-staff--export-excel--pdf)
13. [Staff — New staff page](#13-staff--new-staff-page)
14. [Staff — Detail page (RecordHub)](#14-staff--detail-page-recordhub)
15. [Staff — Bank details tab](#15-staff--bank-details-tab)
16. [Staff — Edit page](#16-staff--edit-page)
17. [Households — List page](#17-households--list-page)
18. [Households — New household page](#18-households--new-household-page)
19. [Households — Detail page — Header + metrics](#19-households--detail-page--header--metrics)
20. [Households — Overview tab](#20-households--overview-tab)
21. [Households — Students tab + Add-student dialog](#21-households--students-tab--add-student-dialog)
22. [Households — Guardians tab + Guardian CRUD](#22-households--guardians-tab--guardian-crud)
23. [Households — Emergency contacts tab + contact CRUD](#23-households--emergency-contacts-tab--contact-crud)
24. [Households — Finance tab + statement link](#24-households--finance-tab--statement-link)
25. [Households — Edit page](#25-households--edit-page)
26. [Households — Merge dialog + flow](#26-households--merge-dialog--flow)
27. [Households — Split dialog + flow](#27-households--split-dialog--flow)
28. [Households — Needs-completion banner + derivation](#28-households--needs-completion-banner--derivation)
29. [Parents — Detail page (read-only)](#29-parents--detail-page-read-only)
30. [Cross-entity navigation + EntityLink behaviour](#30-cross-entity-navigation--entitylink-behaviour)
31. [Sensitive-data audit banners](#31-sensitive-data-audit-banners)
32. [Arabic / RTL walkthrough](#32-arabic--rtl-walkthrough)
33. [Cross-tenant hostile checks (UI-visible side)](#33-cross-tenant-hostile-checks-ui-visible-side)
34. [Backend Endpoint Map](#34-backend-endpoint-map)
35. [DevTools console & network health](#35-devtools-console--network-health)
36. [Data invariants — SQL / API post-conditions](#36-data-invariants--sql--api-post-conditions)
37. [Observations spotted during the walkthrough](#37-observations-spotted-during-the-walkthrough)
38. [Sign-off](#38-sign-off)

---

## 1. Prerequisites & Multi-Tenant Fixture

The tester must provision **two isolated tenants** with overlapping entity shapes. A single-tenant run is structurally unable to exercise tenant-isolation assertions in sections 30, 32, and 33.

| #   | What to Check                                                                                                                                                                                                                               | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | **Tenant A — NHQS** exists with slug `nhqs`, currency `EUR`, ≥ 200 students, ≥ 50 households, ≥ 30 parents, ≥ 20 staff, ≥ 2 withdrawn students, ≥ 1 graduated student, ≥ 1 archived household, ≥ 5 households with `needs_completion=true`. | Prisma seed `qa-nhqs` (or similar) produces these counts. Verify via `SELECT COUNT(*) FROM students WHERE tenant_id=<A>` = 209 (or current total).                                                                                 |           |
| 1.2 | **Tenant B — Acme Test School** exists with slug `acme-test`, currency `USD`, ≥ 50 students, ≥ 20 households, ≥ 10 parents, ≥ 10 staff. Disjoint user set from Tenant A.                                                                    | `SELECT COUNT(*) FROM students WHERE tenant_id=<B>` returns ≥ 50, and `SELECT COUNT(*) FROM users WHERE email IN ('owner@nhqs.test','owner@acme-test.test')` returns 2 (both unique).                                              |           |
| 1.3 | **Users provisioned per tenant:** owner, principal, admin, teacher, accounting, front_office, parent, student. All with password `Password123!`.                                                                                            | `SELECT email FROM users WHERE email LIKE '%@nhqs.test'` returns 8 rows; same for `@acme-test.test`.                                                                                                                               |           |
| 1.4 | **Role assignment:** each user has exactly one `membership_role` row linking them to their tenant with their named role.                                                                                                                    | `SELECT tm.user_id, r.role_key FROM tenant_memberships tm JOIN membership_roles mr ON mr.membership_id=tm.id JOIN roles r ON r.id=mr.role_id WHERE tm.tenant_id=<A>` returns one row per user.                                     |           |
| 1.5 | **Encrypted-field setup:** Tenant A has ≥ 5 staff with bank details encrypted; raw ciphertext starts with version byte (not plaintext).                                                                                                     | `SELECT id, SUBSTRING(bank_account_number_encrypted, 1, 6) FROM staff_profiles WHERE tenant_id=<A> AND bank_account_number_encrypted IS NOT NULL LIMIT 5` — values look like `enc:v1:...` or similar; NO plaintext digits visible. |           |
| 1.6 | **Consent records:** ≥ 10 students in Tenant A have `gdpr_consent_records` with `consent_type='health_data'` and `status='granted'`; ≥ 5 have `status='withdrawn'` or no record (will be excluded from allergy report).                     | `SELECT COUNT(DISTINCT subject_id) FROM gdpr_consent_records WHERE tenant_id=<A> AND subject_type='student' AND consent_type='health_data' AND status='granted'` ≥ 10.                                                             |           |
| 1.7 | **Hostile pair:** capture a known student UUID from Tenant B. The tester will, in section 33, attempt to read it while logged in as a Tenant A user. Expected outcome: 404 / empty — never 200 with Tenant B data.                          | Save `tenantB_student_id` alongside the spec answers.                                                                                                                                                                              |           |
| 1.8 | **Browser:** Chromium-based (Chrome or Edge), viewport 1440×900 for desktop, then repeat critical flows at 375×812 (iPhone SE emulation) for mobile.                                                                                        | Spec must pass in both viewports.                                                                                                                                                                                                  |           |
| 1.9 | **Locales:** Run twice — once at `/en/*`, once at `/ar/*`. Arabic RTL assertions live in §32.                                                                                                                                               | Both runs complete without Console errors.                                                                                                                                                                                         |           |

### Login primer

| #    | Action                                                                                                                                                                 | Expected                                                                                     | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 1.10 | Navigate to `https://nhqs.edupod.app/en/login`. Enter `owner@nhqs.test` / `Password123!`. Click **Sign in**.                                                           | Redirects to `/en/dashboard`. Morph bar visible. Avatar initials read "O". No console error. |           |
| 1.11 | Click avatar → **Sign out** → Sign back in as `principal@nhqs.test` / `Password123!`. Confirm menu differences below; sign back in as owner for the rest of this spec. | Principal has **all** morph-bar hubs except platform-only ones. People hub is visible.       |           |

---

## 2. Out of scope for this spec

This spec exercises the UI-visible surface of the **People** module (Students, Staff, Households, Parents) as an admin-tier user (`school_owner`, `school_principal`, `school_vice_principal`, `admin`) clicking through the school shell. It does **NOT** cover:

- **RLS leakage and cross-tenant isolation** → `../integration/people-integration-spec.md` (multi-tenant matrix over all 8 tenant-scoped tables, direct-API cross-reads with a hostile token, bank-ciphertext access control).
- **API contract tests bypassing the UI** → `../integration/people-integration-spec.md` (every Zod edge case, every state-machine invalid transition, every permission-denial variant per endpoint).
- **Webhook signature + idempotency** → N/A: the People module has no webhook endpoints of its own (Stripe webhook lives in `finance` module; the admissions webhook is covered by `5_operations/admissions/`).
- **DB-level invariants after each flow** → covered here as a separate "Data invariants" section (§36) AND in the integration spec for the machine-executable version.
- **Concurrency / race conditions** → `../integration/people-integration-spec.md` (parallel merges on the same source, parallel split on same source, parallel emergency-contact creates, `SELECT FOR UPDATE` verification).
- **BullMQ jobs, cron, dead-letter** → `../worker/people-worker-spec.md` — specifically `search:index-entity`, `search:full-reindex` on the `search-sync` queue, plus the `audit-log` and `notifications` queues' interaction with people-module mutations.
- **Load / throughput / latency budgets** → `../perf/people-perf-spec.md` (p50/p95/p99 per endpoint, list endpoints at 10k rows, N+1 detection on household detail with 100+ students).
- **Security hardening** → `../security/people-security-spec.md` (OWASP Top 10, bank-field leak vectors, PII exposure review, injection fuzz over every free-text input).
- **Teacher-perspective walkthrough** → `../teacher_view/people-e2e-spec.md` (scoped students list, staff directory read-only, negative assertions for households + parents).
- **Parent / student perspectives** — the People module intentionally has no parent or student UI. Parent-facing pages live under `/parent/*` and are covered by the `(5_operations)/communications` pack; students have no People-module access at all. Negative assertions for these roles are in the security spec, §11 (permission matrix).
- **PDF byte-level correctness** — this spec verifies `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Students_List.pdf"`, the download completes, and the file opens. The integration spec parses bytes and asserts row contents via `pdf-parse`.
- **Browser / device matrix beyond desktop Chrome + 375px iPhone SE emulation** — defer Firefox, Safari, iPad, and real-device testing to a manual QA cycle.
- **Accessibility audits** — structural checks only here (`alt` attributes, keyboard focus). Run `axe-core` / Lighthouse as a sibling workflow.
- **Visual regression** — no pixel diffs here; run Percy or Playwright screenshots separately.

A tester who runs **only** this spec has completed a thorough admin-shell smoke + regression pass. They have **NOT** validated tenant-readiness on their own. For that, the full pack (see `../RELEASE-READINESS.md`) must be executed and signed off.

---

## 3. People Hub — Morph Bar + Sub-strip

**URL (any People page):** `/{locale}/students`, `/{locale}/staff`, or `/{locale}/households`

### 3.1 Morph-bar visibility (admin)

| #     | What to Check                                                    | Expected Result                                                                                                                                                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Load `/en/dashboard`. Inspect the top morph bar.                 | Morph bar renders **collapsed** on dashboard. Hubs visible include (in order): Home, People, Academics, Assessment Records, Behaviour, Wellbeing, Scheduling, Engagement, Admissions, Finance, Communications, Pastoral, Compliance, Reports, Settings. |           |
| 3.1.2 | Hover the **People** hub label.                                  | Cursor changes to pointer. No sub-strip yet (home collapses it).                                                                                                                                                                                        |           |
| 3.1.3 | Click **People**.                                                | Sub-strip appears below morph bar with 3 links (admin): **Students**, **Staff**, **Households**. Navigated to `/en/students` (the default first item). URL bar now reads `/en/students`.                                                                |           |
| 3.1.4 | Verify sub-strip links: **Students**, **Staff**, **Households**. | Exactly 3 links, in that order. Active state on **Students** (matches URL).                                                                                                                                                                             |           |
| 3.1.5 | Click **Staff** in sub-strip.                                    | URL changes to `/en/staff`. Sub-strip **does not remount** (the morph bar and sub-strip must remain visually stable — no flash). Active indicator moves to **Staff**.                                                                                   |           |
| 3.1.6 | Click **Households**.                                            | URL changes to `/en/households`. Active moves to **Households**. No flicker.                                                                                                                                                                            |           |
| 3.1.7 | Click **Home** in morph bar (or navigate to `/en/dashboard`).    | Sub-strip collapses. URL → `/en/dashboard`.                                                                                                                                                                                                             |           |

### 3.2 Morph-bar keyboard nav

| #     | What to Check                                                                                          | Expected Result                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------- |
| 3.2.1 | Focus the morph bar via `Tab` from the page body. Use `ArrowLeft` / `ArrowRight` to move between hubs. | Focus outline moves between hubs. Arrow keys navigate horizontally. |           |
| 3.2.2 | With **People** focused, press `Enter`.                                                                | Navigates to `/en/students`. Sub-strip appears.                     |           |
| 3.2.3 | With a sub-strip item focused, press `Tab` again.                                                      | Focus moves into the page content, not back to the morph bar.       |           |

### 3.3 Mobile morph-bar

| #     | What to Check                                          | Expected Result                                                                                                        | Pass/Fail |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | Resize viewport to 375×812. Morph bar renders compact. | Hamburger icon visible at start-of-row. Hub labels collapsed into an overlay accessed via hamburger.                   |           |
| 3.3.2 | Click hamburger.                                       | Overlay drawer slides in with the full hub list. **People** is listed with a chevron indicating its sub-items.         |           |
| 3.3.3 | Tap **People** in the drawer.                          | Drawer closes. Navigates to `/en/students`. Mobile sub-strip appears as a horizontally scrollable row below morph bar. |           |
| 3.3.4 | Swipe the sub-strip left / right.                      | Hidden items scroll into view. No overflow of the full viewport (no horizontal page scroll).                           |           |

---

## 4. Students — List page

**URL:** `/{locale}/students`  
**Permission:** `students.view`  
**Primary API:** `GET /v1/students`

### 4.1 Page chrome

| #     | What to Check                                                                                                                                                                                                                            | Expected Result                                                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Navigate to `/en/students`.                                                                                                                                                                                                              | Page renders with heading **"Students"** and subtitle **"Manage student records and enrolments"**. URL unchanged. `document.title` includes "Students". |           |
| 4.1.2 | Verify header actions at end-of-row: **Excel** button (FileSpreadsheet icon), **PDF** button (Download icon). No "New Student" button (creation flow is via `/students/new`; the UI does not wire a top-bar shortcut — flag if present). | Exactly two action buttons, in the stated order.                                                                                                        |           |
| 4.1.3 | Verify breadcrumb / page context: in the morph bar sub-strip, **Students** is visually active.                                                                                                                                           | Active state present.                                                                                                                                   |           |
| 4.1.4 | Confirm no secondary tabs render (this page has no in-page tabs).                                                                                                                                                                        | Page body is a single panel with toolbar + table.                                                                                                       |           |

### 4.2 Initial data load

| #     | What to Check                                                                                                                                                 | Expected Result                                                                                                       | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Watch Network tab on first load.                                                                                                                              | `GET /api/v1/students?page=1&pageSize=20` fires, returns 200 with `{ data: [...], meta: { page, pageSize, total } }`. |           |
| 4.2.2 | Watch Network tab for year-groups fetch.                                                                                                                      | `GET /api/v1/year-groups?pageSize=100` fires, returns 200. This populates the Year Group filter dropdown.             |           |
| 4.2.3 | Confirm table renders 20 rows on page 1. Count in paginator reads **"Showing 1–20 of {total}"** where `{total}` matches the `meta.total` in the API response. | Row count = 20. Paginator label matches `meta.total`.                                                                 |           |
| 4.2.4 | Check table headers in order: **Name**, **Student #**, **Year Group**, **Status**, **Household**.                                                             | 5 columns, in that order.                                                                                             |           |

### 4.3 Row rendering

| #     | What to Check                                                                                                                                                                                                                                           | Expected Result                                                        | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 4.3.1 | First row's **Name** column is rendered as an `<a>` (EntityLink) with `href="/en/students/{row.id}"`.                                                                                                                                                   | Link exists. Colour matches the link token (blue). Underline on hover. |           |
| 4.3.2 | Student # column uses monospace font and shows `STU-NNNNNN` or household-derived format (e.g. `ABC001-1`). No `YYYYMM` infix.                                                                                                                           | Format matches one of the two documented patterns.                     |           |
| 4.3.3 | Year Group column shows a plain label (e.g. "1st class") or "—" if null.                                                                                                                                                                                | Text present, no raw UUID.                                             |           |
| 4.3.4 | Status column shows a coloured `StatusBadge`: `active` → green (success), `applicant` → blue (info), `withdrawn` → orange (warning), `graduated` → gray (neutral), `archived` → gray (neutral). Badge text is translated (`t('students.active')` etc.). | Colour + label correct per status.                                     |           |
| 4.3.5 | Household column renders as an `<a>` linking to `/en/households/{household.id}` with text `household_name`. "—" if somehow null.                                                                                                                        | Link works. Clicking navigates (covered in §30).                       |           |

### 4.4 Search input

| #     | What to Check                                                                                                                                 | Expected Result                                                                                                                                                                                                                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.4.1 | Focus the search input (placeholder: `Search students…`). Type `Ryan`.                                                                        | Network fires `GET /api/v1/students?page=1&pageSize=20&search=Ryan`. Table re-renders with matching rows only. Paginator label updates.                                                                                                                                 |           |
| 4.4.2 | While typing, verify each keystroke fires at most one request (no per-keystroke storm; the search-state update is OK but the API is bounded). | Network count stays low (< 1 per 250 ms).                                                                                                                                                                                                                               |           |
| 4.4.3 | Clear the input.                                                                                                                              | `GET /api/v1/students?page=1&pageSize=20` fires (no `search` param). Full list returns.                                                                                                                                                                                 |           |
| 4.4.4 | Type a string that matches nothing, e.g. `ZZZZZZZZZ`.                                                                                         | API returns 200 with empty `data` array. Table shows empty state (no skeleton, no spinner, just a message — OR the row count renders as `Showing 0–0 of 0`).                                                                                                            |           |
| 4.4.5 | Type an Arabic name, e.g. `محمد`.                                                                                                             | Search is sent as UTF-8. Matching students (those with `first_name_ar` or `last_name_ar` containing the substring) appear. (Note: backend applies `contains` on `first_name`, `last_name`, `full_name` only — `first_name_ar` is NOT searched. See §37, observation A.) |           |

### 4.5 Status filter

| #     | What to Check             | Expected Result                                                                                                                                   | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.5.1 | Open **Status** dropdown. | Options appear: **All Statuses**, **Applicant**, **Active**, **Withdrawn**, **Graduated**, **Archived**. Labels translated.                       |           |
| 4.5.2 | Select **Active**.        | Network fires `GET /api/v1/students?...&status=active`. Table shows only `status=active` rows. Paginator reflects new total.                      |           |
| 4.5.3 | Select **Withdrawn**.     | `GET /api/v1/students?...&status=withdrawn` fires. Count should match `SELECT COUNT(*) FROM students WHERE tenant_id=<A> AND status='withdrawn'`. |           |
| 4.5.4 | Select **Applicant**.     | Only applicants.                                                                                                                                  |           |
| 4.5.5 | Select **All Statuses**.  | The `status` param is removed. Full list returns.                                                                                                 |           |

### 4.6 Year Group filter

| #     | What to Check               | Expected Result                                                                                            | Pass/Fail |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 4.6.1 | Open Year Group dropdown.   | Options: **All Year Groups** + one option per active year group (sorted by name as returned from the API). |           |
| 4.6.2 | Select `1st class`.         | `GET /api/v1/students?...&year_group_id={uuid}` fires. Only students with that year group.                 |           |
| 4.6.3 | Select **All Year Groups**. | `year_group_id` param removed.                                                                             |           |

### 4.7 Allergy filter

| #     | What to Check                                                             | Expected Result                                                                                  | Pass/Fail |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 4.7.1 | Open Allergy dropdown. Options: **All**, **Has Allergy**, **No Allergy**. | 3 options, translated.                                                                           |           |
| 4.7.2 | Select **Has Allergy**.                                                   | `GET /api/v1/students?...&has_allergy=true` fires. Only students with `has_allergy=true` appear. |           |
| 4.7.3 | Select **No Allergy**.                                                    | `has_allergy=false` fires. No students with allergies.                                           |           |
| 4.7.4 | Select **All**.                                                           | `has_allergy` param removed.                                                                     |           |

### 4.8 Combined filters

| #     | What to Check                                                                      | Expected Result                                                                                                                                               | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.8.1 | Set Status=Active + Year Group=`1st class` + Allergy=Has Allergy + search=`Ahmed`. | Network fires `GET /api/v1/students?page=1&pageSize=20&status=active&year_group_id=<uuid>&has_allergy=true&search=Ahmed`. All four filters combined with AND. |           |
| 4.8.2 | Reset each to its default / clear search.                                          | Full list returns.                                                                                                                                            |           |

### 4.9 Pagination

| #     | What to Check                                                                                | Expected Result                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.9.1 | Click "next page" arrow in paginator.                                                        | `page=2` request. Table renders rows 21–40. Paginator label updates.                                                                                  |           |
| 4.9.2 | Click "previous" arrow.                                                                      | Returns to page 1.                                                                                                                                    |           |
| 4.9.3 | Type `5` into page input (if present) and commit.                                            | `page=5` fires. If total pages < 5, request either returns empty data (valid) or is clamped — verify behaviour matches `?page=` being >= total pages. |           |
| 4.9.4 | Type `-1` or `abc` into page input.                                                          | Input either rejects the character (typical HTML5) or the state stays at previous valid page. No crash.                                               |           |
| 4.9.5 | Setting a filter resets to page 1. Confirm by going to page 3, then selecting Status=Active. | Page resets to 1 before filter request fires.                                                                                                         |           |

### 4.10 Sorting

| #      | What to Check                                                                                                                                                                                            | Expected Result                                                 | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 4.10.1 | Default sort is by `last_name` ASC. Verify row 1 has the alphabetically-lowest last name.                                                                                                                | Row 1 last name ≤ row 2 last name (case-insensitive).           |           |
| 4.10.2 | The current UI does **not** expose column-header click-to-sort. (Backend supports `sort` + `order` query params, but the DataTable component does not render sortable headers — see §37, observation B.) | Column headers are non-interactive (no cursor change on hover). |           |

### 4.11 Empty state

| #      | What to Check                                                                                                                                                         | Expected Result                                                                                                                                                                | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.11.1 | In a tenant with zero students (fresh tenant), load `/en/students`.                                                                                                   | Empty state renders with **GraduationCap** icon, heading `No students yet`, description `Register a new family using the wizard, or add a student from an existing household.` |           |
| 4.11.2 | In NHQS with active filters that exclude every row (e.g. `search=ZZZZZZZZZ`), verify the empty state differs: the filter set is the "cause", not a zero-tenant state. | Table shows an empty-result state (may or may not show the full EmptyState component — acceptable either way as long as the paginator reads `0 of 0`).                         |           |

### 4.12 Loading state

| #      | What to Check                                               | Expected Result                                 | Pass/Fail |
| ------ | ----------------------------------------------------------- | ----------------------------------------------- | --------- |
| 4.12.1 | Throttle Network to "Slow 3G" in DevTools. Reload the page. | Skeleton rows render (no flash of empty table). |           |
| 4.12.2 | Reset throttling.                                           | Normal load.                                    |           |

### 4.13 Error state

| #      | What to Check                                                                             | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.13.1 | In DevTools Network → right-click `GET /api/v1/students` → **Block request URL**. Reload. | API call fails. UI either (a) renders empty with no error toast — silent failure (observation C in §37), OR (b) shows a toast "Failed to load students". Confirm which and mark the appropriate outcome. |           |
| 4.13.2 | Unblock and reload.                                                                       | Normal load resumes.                                                                                                                                                                                     |           |

---

## 5. Students — Export (Excel + PDF)

**Primary APIs:** `GET /v1/students/export-data` (`students.view`).  
**UI component:** `StudentExportDialog` in `apps/web/src/app/[locale]/(school)/students/_components/export-dialog.tsx`.

### 5.1 Dialog open — Excel

| #     | What to Check                                                                                                                                                                                                    | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Click **Excel** button in toolbar.                                                                                                                                                                               | Dialog opens with title **Export to Excel**. Radix modal overlay fades in. Background dimmed, focus trap active.                                                                                                     |           |
| 5.1.2 | Columns are grouped by section: **Student Details**, **Enrolment**, **Parent/Guardian**, **Medical**. Each group has a header label and a set of checkboxes.                                                     | 4 column groups visible.                                                                                                                                                                                             |           |
| 5.1.3 | Verify default selected columns match `DEFAULT_SELECTED_COLUMNS` in `export-utils.ts`: first name, last name, student_number, year_group, status, household_name, DOB. Medical / allergy columns default to OFF. | Default checkmarks match the list.                                                                                                                                                                                   |           |
| 5.1.4 | Toggle **Has Allergy** and **Allergy Details** columns ON.                                                                                                                                                       | Checkmarks appear.                                                                                                                                                                                                   |           |
| 5.1.5 | Toggle all columns OFF, then attempt to click **Export**.                                                                                                                                                        | Export button is disabled (no columns selected is an invalid state) OR export triggers with zero-column payload. Confirm the UI behaviour matches the design: expected = button disabled when zero columns selected. |           |
| 5.1.6 | Toggle at least one column back ON. **Export** button re-enables.                                                                                                                                                | Button enabled.                                                                                                                                                                                                      |           |

### 5.2 Export execution — Excel

| #     | What to Check                                                                                                                                                                 | Expected Result                                                                                                   | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Click **Export**.                                                                                                                                                             | Button shows spinner + "Exporting…" label. Network fires `GET /api/v1/students/export-data?{current filter set}`. |           |
| 5.2.2 | Response 200 with JSON `{ data: [...] }` — full, unpaginated list matching current filter set.                                                                                | Verify via DevTools preview panel.                                                                                |           |
| 5.2.3 | Browser triggers a file download. Filename: `Students_List.xlsx`.                                                                                                             | File saved to Downloads.                                                                                          |           |
| 5.2.4 | Open the `.xlsx`. Confirm headers match selected columns. Row count matches `data.length`.                                                                                    | Content correct.                                                                                                  |           |
| 5.2.5 | Arabic-name rows render correctly (UTF-8). Dates are ISO strings or formatted per export helper. Student numbers are text (not auto-coerced to scientific notation in Excel). | No mojibake. Dates legible. Student numbers intact.                                                               |           |
| 5.2.6 | Close the dialog via **Cancel** or clicking outside.                                                                                                                          | Dialog closes. Focus returns to the **Excel** button in the toolbar.                                              |           |

### 5.3 Export — PDF

| #     | What to Check                                                                             | Expected Result                                                                                                                                                                               | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.3.1 | Click **PDF** button. Dialog opens with title **Export to PDF**. Same column selector UI. | Dialog renders in PDF mode.                                                                                                                                                                   |           |
| 5.3.2 | Default column set is the same as Excel.                                                  | Confirmed.                                                                                                                                                                                    |           |
| 5.3.3 | Click **Export**.                                                                         | Same API fetch. jsPDF generates PDF. File downloads as `Students_List.pdf`.                                                                                                                   |           |
| 5.3.4 | Open PDF in a viewer.                                                                     | A4 landscape orientation, table with selected columns. Row count = data length. Arabic rows render correctly (if the export helper's font supports it — flag in §37 if glyphs show as boxes). |           |
| 5.3.5 | Page numbers in PDF footer (if implemented).                                              | Optional — if not present, mark Pass and flag as observation if desired.                                                                                                                      |           |

### 5.4 Export respects filters

| #     | What to Check                                                           | Expected Result                                                                                                          | Pass/Fail |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.4.1 | Apply `search=Ryan` + `status=active`. Open Excel dialog. Click Export. | `export-data` call includes `?search=Ryan&status=active`. File contains only active students whose name contains "Ryan". |           |
| 5.4.2 | Open a filtered export while `has_allergy=true`.                        | `has_allergy=true` param included. File has only allergy-flagged students.                                               |           |

### 5.5 Export while logged in as principal / admin / owner

| #     | What to Check                                                                         | Expected Result                                                                                                                                                       | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.5.1 | Sign in as `admin@nhqs.test`. Repeat 5.2 Excel export.                                | Works. `students.view` permission grants the export endpoint.                                                                                                         |           |
| 5.5.2 | Sign in as `front_office@nhqs.test` (no `students.view`). Navigate to `/en/students`. | Redirected, 403, or the People hub item is hidden. Confirm the role lacks visibility and the export endpoint returns 403 if invoked via URL. (See security spec §11.) |           |

---

## 6. Students — New student page

**URL:** `/{locale}/students/new`  
**Permission:** `students.manage` (implied for POST)  
**Primary API:** `POST /v1/students`  
**Zod schema:** `createStudentSchema` (`packages/shared/src/schemas/student.schema.ts`).

### 6.1 Page chrome

| #     | What to Check                                                                                | Expected Result                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Navigate to `/en/students/new`.                                                              | Page renders with heading **"New Student"** and subtitle **"Add a new student record"**. Form below. |           |
| 6.1.2 | Sidebar sub-strip still shows **Students** as active (we're in the `/students/*` namespace). | Active state present.                                                                                |           |

### 6.2 Form fields

| #     | What to Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Expected Result                                                           | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 6.2.1 | All visible fields (in order): `first_name`, `middle_name`, `last_name`, `first_name_ar`, `last_name_ar`, `date_of_birth` (date picker), `gender` (select: male, female, other, prefer_not_to_say), `nationality`, `city_of_birth`, `national_id`, `household_id` (searchable combobox), `year_group_id` (select), `class_homeroom_id` (optional select), `status` (select: applicant, active), `entry_date`, `medical_notes` (textarea), `has_allergy` (checkbox), `allergy_details` (textarea, conditional). | All fields present.                                                       |           |
| 6.2.2 | Required-field indicators (asterisk or `required` attribute) visible on: `first_name`, `last_name`, `date_of_birth`, `national_id`, `nationality`, `household_id`, `status`.                                                                                                                                                                                                                                                                                                                                   | Required indicators present.                                              |           |
| 6.2.3 | The `household_id` combobox fetches via `GET /api/v1/households?pageSize=...` on focus / type.                                                                                                                                                                                                                                                                                                                                                                                                                 | Dropdown populates on focus with the first 20 households; typing filters. |           |
| 6.2.4 | The `year_group_id` select fetches via `GET /api/v1/year-groups?pageSize=100` on mount.                                                                                                                                                                                                                                                                                                                                                                                                                        | Populated before first interaction.                                       |           |
| 6.2.5 | `first_name_ar` / `last_name_ar` inputs render `dir="rtl"` regardless of page locale.                                                                                                                                                                                                                                                                                                                                                                                                                          | Arabic glyphs render correctly right-aligned within the input.            |           |
| 6.2.6 | `has_allergy` checkbox is unchecked by default. `allergy_details` textarea is **disabled** until `has_allergy` is checked.                                                                                                                                                                                                                                                                                                                                                                                     | Disabled state visible until checked.                                     |           |

### 6.3 Client-side validation (Zod)

| #     | What to Check                                                                                                     | Expected Result                                                                                                                                                                                | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Submit the form empty.                                                                                            | Form prevents submit. Error messages render under each missing required field: `first_name is required`, `last_name is required`, `national_id is required`, etc. Translated in Arabic locale. |           |
| 6.3.2 | Enter `first_name` with 101 characters.                                                                           | Field-level error: `First name must be at most 100 characters`. Submit blocked.                                                                                                                |           |
| 6.3.3 | Enter an invalid UUID for `household_id` via programmatic means (e.g. DevTools + browser console to patch state). | Form blocks on Zod `.uuid()` — error: `Invalid household_id`.                                                                                                                                  |           |
| 6.3.4 | Check `has_allergy` but leave `allergy_details` empty. Submit.                                                    | Error under `allergy_details`: `allergy_details is required when has_allergy is true`. Submit blocked.                                                                                         |           |
| 6.3.5 | Set `date_of_birth` to an empty string.                                                                           | Error: `date_of_birth is required`.                                                                                                                                                            |           |
| 6.3.6 | Fill all required fields. Set `status = applicant`. Submit.                                                       | Form disables submit button (spinner), fires `POST /api/v1/students` with request body matching the Zod shape.                                                                                 |           |

### 6.4 Happy-path submit

| #     | What to Check                                                                                                                                                                                       | Expected Result                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| 6.4.1 | POST `/api/v1/students` returns 201 with `{ id: "...", ... }`.                                                                                                                                      | Network shows 201.                                                      |           |
| 6.4.2 | Toast appears: `Student created successfully`. Arabic: translated equivalent.                                                                                                                       | Toast visible for ≥ 3 seconds, top-right (or spec's toast position).    |           |
| 6.4.3 | Redirected to `/en/students/{newId}` — the detail page of the just-created student.                                                                                                                 | URL matches `newId` from response. Detail renders.                      |           |
| 6.4.4 | Network tab shows the follow-up `GET /api/v1/students/{newId}` call for the detail page.                                                                                                            | Detail fetched.                                                         |           |
| 6.4.5 | A search-sync job is enqueued (`search:index-entity` on `search-sync` queue) — verify via `redis-cli LLEN bull:search-sync:wait` (or BullBoard UI): count increments by 1 immediately after create. | Queue length +1 (may be processed before you can observe — acceptable). |           |

### 6.5 Edge cases on create

| #     | What to Check                                                                                                                                                                                     | Expected Result                                                                                                                                                        | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.5.1 | Create a student with `year_group_id` belonging to another tenant (Tenant B) — use DevTools to patch state before submit.                                                                         | POST returns 404 `YEAR_GROUP_NOT_FOUND`. UI shows an error toast with the API message.                                                                                 |           |
| 6.5.2 | Create with `household_id` that doesn't exist.                                                                                                                                                    | POST returns 404 `HOUSEHOLD_NOT_FOUND`. Toast.                                                                                                                         |           |
| 6.5.3 | Create with `parent_links` referencing a non-existent parent UUID.                                                                                                                                | POST returns 404 `PARENT_NOT_FOUND`. Toast.                                                                                                                            |           |
| 6.5.4 | Create identical student twice in rapid succession (same all fields, same household).                                                                                                             | Both succeed — there is no uniqueness constraint on `(tenant_id, first_name, last_name, date_of_birth)`. Two distinct rows created, each with a unique student_number. |           |
| 6.5.5 | Inspect `student_number` returned in the response. Format is `AAA999-N` (household-derived) where `AAA999` is the household_number and `N` is the sequence within that household (starting at 1). | Matches the format.                                                                                                                                                    |           |

---

## 7. Students — Detail page (RecordHub)

**URL:** `/{locale}/students/{id}`  
**Permission:** `students.view` (sensitive-data audit: `special_category`).  
**Primary APIs:** `GET /v1/students/{id}`, `GET /v1/homework/analytics/student/{id}`, `GET /v1/sen/students/{id}/profile`, `PATCH /v1/students/{id}/status`.

### 7.1 Header

| #     | What to Check                                                                                                                                                              | Expected Result                                                   | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 7.1.1 | Navigate to a known active student's detail page.                                                                                                                          | Heading reads the student's full_name (e.g. `Ahmed Al-Mansouri`). |           |
| 7.1.2 | Subtitle shows `year_group.name` (e.g. `1st class`). If year_group is null, subtitle is empty.                                                                             | Correct subtitle or blank.                                        |           |
| 7.1.3 | Reference chip: `student_number` in monospace (e.g. `ABC001-1`).                                                                                                           | Correct format.                                                   |           |
| 7.1.4 | Status badge: matches `student.status` with the colour mapping from §4.3.4.                                                                                                | Correct badge.                                                    |           |
| 7.1.5 | Top-right actions: **Edit** button. If allowed status transitions exist for current status, a **Status Change** dropdown is also visible.                                  | Buttons present per the transition map in §9.1.                   |           |
| 7.1.6 | Back navigation: no explicit "back" button on this page (RecordHub chrome handles via morph-bar sub-strip). Verify clicking **Students** in sub-strip returns to the list. | Sub-strip click returns to `/en/students`.                        |           |

### 7.2 Quick-metrics cards

| #     | What to Check                                                                                                                                               | Expected Result         | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------- |
| 7.2.1 | Three metric cards render below the header: **Date of Birth**, **Entry Date**, **Household** (EntityLink).                                                  | Cards visible in order. |           |
| 7.2.2 | Date of Birth formats as `DD MMM YYYY` in English (e.g. `14 Aug 2015`) or the locale-appropriate format in Arabic, using Gregorian calendar + Latin digits. | Correct.                |           |
| 7.2.3 | Entry Date same format; `—` if null.                                                                                                                        | Correct.                |           |
| 7.2.4 | Household link has `href="/en/households/{household.id}"` and text = `household_name`. Click navigates.                                                     | Navigation works.       |           |

### 7.3 Tabs

| #     | What to Check                                                                                                                                       | Expected Result                           | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 7.3.1 | RecordHub tabs render. For an active student **without** a SEN profile: **Overview**, **Classes & Enrolments**, **Homework**, **Medical** (4 tabs). | 4 tabs visible.                           |           |
| 7.3.2 | For a student WITH a SEN profile: a 5th tab **SEN** appears.                                                                                        | 5 tabs.                                   |           |
| 7.3.3 | Default active tab is **Overview**.                                                                                                                 | Overview content visible on first render. |           |

### 7.4 Overview tab

| #     | What to Check                                                                                                                                                                                                                                       | Expected Result      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 7.4.1 | Fields shown (grid): **Gender** (formatted with first letter capitalised), **Year Group**, **Nationality**, **City of Birth**. Missing ones render `—`.                                                                                             | Correct.             |           |
| 7.4.2 | **Household** section: title + EntityLink to household. Shows full household_name.                                                                                                                                                                  | Correct.             |           |
| 7.4.3 | **Parents / Guardians** section: list of parents linked via `student_parents`. Each entry shows: `{first_name} {last_name}` (EntityLink to `/parents/{id}`), relationship_label in parens (if any), **Primary** badge if `is_primary_contact=true`. | Correct.             |           |
| 7.4.4 | If no parents are linked, the section renders an empty message: "No guardians on file".                                                                                                                                                             | Empty state correct. |           |

### 7.5 Classes & Enrolments tab

| #     | What to Check                                                                                                                                                                      | Expected Result                                                           | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 7.5.1 | Click **Classes & Enrolments** tab.                                                                                                                                                | List renders (no loading spinner — data was prefetched with the student). |           |
| 7.5.2 | For a student with enrolments: rows show class name (EntityLink → `/classes/{id}`), subject name (if any), status badge (active = green, dropped = red, etc.), academic_year name. | All fields rendered.                                                      |           |
| 7.5.3 | Rows ordered by `start_date DESC` (most recent first).                                                                                                                             | Correct order.                                                            |           |
| 7.5.4 | For a student with zero enrolments, empty message: "No class enrolments found".                                                                                                    | Empty state correct.                                                      |           |

### 7.6 Homework tab

| #     | What to Check                                                                                                                                                           | Expected Result                                                               | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 7.6.1 | Click **Homework** tab. Network fires `GET /api/v1/homework/analytics/student/{id}`.                                                                                    | API call fires (lazy, only on first tab activation).                          |           |
| 7.6.2 | Response 200 with `{ overall: { total_assigned, completed, completion_rate }, by_subject: [...] }`.                                                                     | Shape matches.                                                                |           |
| 7.6.3 | Overall stats: 3-column grid — **Total Assigned**, **Completed** (green), **Completion Rate** (percentage in primary colour).                                           | Correct.                                                                      |           |
| 7.6.4 | By-subject breakdown table: subject name, completed / assigned ratio, completion rate %.                                                                                | Correct.                                                                      |           |
| 7.6.5 | If the homework analytics API returns 404 or errors (e.g. tenant has homework module disabled), the tab shows "No homework data available" and does NOT toast or crash. | Silent failure is the intended behaviour (see code: `.catch(console.error)`). |           |
| 7.6.6 | Re-click the tab. No duplicate network call (cached in component state) — or a fresh call fires (acceptable).                                                           | Either is acceptable.                                                         |           |

### 7.7 Medical tab

| #     | What to Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Expected Result                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| 7.7.1 | Click **Medical** tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Content renders (data is part of the initial student fetch). |           |
| 7.7.2 | Allergy status badge: **Has Allergies** (warning/orange) if `has_allergy=true`, else **No Known Allergies** (neutral).                                                                                                                                                                                                                                                                                                                                                                        | Correct badge.                                               |           |
| 7.7.3 | If `has_allergy=true`, an orange-bordered box shows `allergy_details` in full.                                                                                                                                                                                                                                                                                                                                                                                                                | Box renders.                                                 |           |
| 7.7.4 | If `medical_notes` present, a heading + text block shows the notes.                                                                                                                                                                                                                                                                                                                                                                                                                           | Correct.                                                     |           |
| 7.7.5 | If no allergy AND no medical notes: empty state "No medical information on file".                                                                                                                                                                                                                                                                                                                                                                                                             | Empty state correct.                                         |           |
| 7.7.6 | **Audit-log check:** every detail view of this student must generate an audit row tagged `special_category` (from the `@SensitiveDataAccess('special_category')` decorator on `GET /v1/students/:id`). Run `SELECT action, entity_id, created_at FROM audit_logs WHERE actor_id=<owner.id> AND entity_type='student' AND entity_id=<this_student.id> ORDER BY created_at DESC LIMIT 5` — the most recent row has `action='read'` (or similar) with metadata flagging special-category access. | Audit row present.                                           |           |

### 7.8 SEN tab (conditional)

| #     | What to Check                                                                                                                | Expected Result                       | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 7.8.1 | For a student with a SEN profile (primary_category + support_level + coordinator): tab visible.                              | Tab renders.                          |           |
| 7.8.2 | Fields: **Primary Category**, **Support Level**, **SEN Coordinator Name**.                                                   | All three present.                    |           |
| 7.8.3 | If `senProfile.has_active_plan=true`, a **View Full SEN Profile** button renders → `/en/sen/students/{id}`. Click navigates. | Navigation works.                     |           |
| 7.8.4 | Header gains a **SEN** badge with category + support level.                                                                  | Badge present alongside status badge. |           |
| 7.8.5 | For a student without a SEN profile, the tab is absent (count = 4 tabs).                                                     | Tab absent.                           |           |
| 7.8.6 | If the SEN API returns 404 / error, the tab does not render and no error toast fires.                                        | Silent failure.                       |           |

### 7.9 Loading, not-found, and error states

| #     | What to Check                                         | Expected Result                                                                                        | Pass/Fail |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 7.9.1 | Navigate to `/en/students/{unknown-uuid}`.            | Page attempts fetch, API 404s, UI renders a "Student not found" message (no redirect).                 |           |
| 7.9.2 | Navigate to `/en/students/not-a-uuid`.                | `ParseUUIDPipe` rejects — 400 — UI renders an error state OR the initial loader stays; flag behaviour. |           |
| 7.9.3 | Throttle Network to Slow 3G and reload a detail page. | Skeleton renders for header + content.                                                                 |           |

---

## 8. Students — Edit page

**URL:** `/{locale}/students/{id}/edit`  
**Permission:** `students.manage`  
**Primary API:** `PATCH /v1/students/{id}`  
**Zod schema:** `updateStudentSchema` (all fields optional; `.nullable().optional()` for clearable ones).

### 8.1 Page load

| #     | What to Check                                                                                                    | Expected Result                                                                            | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 8.1.1 | From detail page, click **Edit**.                                                                                | URL → `/en/students/{id}/edit`. Network fires `GET /api/v1/students/{id}` to hydrate form. |           |
| 8.1.2 | Header: heading "Edit Student" + subtitle "Editing record for {first_name} {last_name}".                         | Correct.                                                                                   |           |
| 8.1.3 | All form fields are pre-populated from the fetched student.                                                      | Every field matches detail.                                                                |           |
| 8.1.4 | `has_allergy` checkbox reflects current value; if checked, `allergy_details` textarea is enabled and pre-filled. | Correct.                                                                                   |           |

### 8.2 Field-level clearing

| #     | What to Check                                              | Expected Result                                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.2.1 | Clear `middle_name` (delete text). Submit.                 | PATCH sends `middle_name: null`. DB row updates. Detail reflects null / blank.                                                                                                       |           |
| 8.2.2 | Clear `medical_notes`. Submit.                             | PATCH sends `medical_notes: null`. DB reflects null.                                                                                                                                 |           |
| 8.2.3 | Attempt to clear `first_name`.                             | Zod `.min(1)` on `first_name` (optional but min 1). Error shown; submit blocked.                                                                                                     |           |
| 8.2.4 | Uncheck `has_allergy` (from a student who had it). Submit. | PATCH sends `has_allergy: false`, `allergy_details: null` (or omitted — behaviour depends on form logic; confirm `allergy_details` is cleared server-side when `has_allergy=false`). |           |

### 8.3 Partial updates

| #     | What to Check                        | Expected Result                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.3.1 | Change only `year_group_id`. Submit. | PATCH body contains just `year_group_id`. Only that field changes server-side. `updated_at` increments. Other fields unchanged. |           |
| 8.3.2 | Submit with no changes.              | Request may still fire; response 200 with unchanged body. Toast: "Student updated successfully".                                |           |

### 8.4 Household change

| #     | What to Check                                                            | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.4.1 | Change `household_id` to a different valid household. Submit.            | PATCH succeeds. `student.household_id` updates. `student_number` remains unchanged (the number is assigned at create and does not re-generate on household change — confirm by comparing pre/post). |           |
| 8.4.2 | Attempt to set `household_id` to Tenant B's household id (via DevTools). | PATCH 404 `HOUSEHOLD_NOT_FOUND` (tenant-scoped existence check fails).                                                                                                                              |           |

### 8.5 Submit success

| #     | What to Check                                                                                                                                                        | Expected Result  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 8.5.1 | Successful PATCH returns 200. Toast: "Student updated successfully".                                                                                                 | Toast visible.   |           |
| 8.5.2 | Redirects to `/en/students/{id}` (detail). Updated fields reflected.                                                                                                 | Correct.         |           |
| 8.5.3 | Redis preview cache key `preview:student:{id}` is deleted (verify with `redis-cli DEL preview:student:{id}` returning 0 immediately after — i.e. it's already gone). | Cache cleared.   |           |
| 8.5.4 | A `search:index-entity` job enqueues to the `search-sync` queue with `action=upsert`.                                                                                | Queue length +1. |           |

### 8.6 Cancel

| #     | What to Check                                              | Expected Result                                 | Pass/Fail |
| ----- | ---------------------------------------------------------- | ----------------------------------------------- | --------- |
| 8.6.1 | On edit page, click Cancel (or navigate back via browser). | Returns to `/en/students/{id}`. No PATCH fired. |           |

---

## 9. Students — Status transitions

Controller: `PATCH /v1/students/{id}/status`. State map (from `students.service.ts` lines 26–32):

| Current status | Allowed next                   |
| -------------- | ------------------------------ |
| applicant      | active                         |
| active         | withdrawn, graduated, archived |
| withdrawn      | active                         |
| graduated      | archived                       |
| archived       | (none)                         |

### 9.1 Dropdown visibility

| #     | What to Check                                                                                                                                                 | Expected Result                                                                                                  | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Open an **applicant** student. Header shows **Status Change** dropdown with option **Activate** (→ active).                                                   | 1 option.                                                                                                        |           |
| 9.1.2 | Open an **active** student. Dropdown has **Withdraw**, **Graduate**, **Archive**.                                                                             | 3 options.                                                                                                       |           |
| 9.1.3 | Open a **withdrawn** student. Dropdown has **Re-activate** (→ active). Archive is intentionally NOT a direct transition from withdrawn (enforced by the map). | 1 option. **Flag in §37** if the UI exposes Archive directly — the service will 400 `INVALID_STATUS_TRANSITION`. |           |
| 9.1.4 | Open a **graduated** student. Dropdown has **Archive**.                                                                                                       | 1 option.                                                                                                        |           |
| 9.1.5 | Open an **archived** student. Dropdown is hidden OR disabled (no transitions available).                                                                      | Disabled / hidden.                                                                                               |           |

### 9.2 Applicant → Active

| #     | What to Check                                                                                       | Expected Result                                                                                                           | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.2.1 | From applicant detail, click Status Change → **Activate**.                                          | Confirm dialog (if any) — click Confirm. PATCH `/v1/students/{id}/status` with body `{ status: "active" }`. 200 response. |           |
| 9.2.2 | Status badge in header updates to green **Active**.                                                 | Badge updates.                                                                                                            |           |
| 9.2.3 | DB: `student.status` = `'active'`, `entry_date` unchanged (only withdrawn/graduated set exit_date). | DB matches.                                                                                                               |           |

### 9.3 Active → Withdrawn (requires reason)

| #     | What to Check                                                                                                                                              | Expected Result                                                                                                                                  | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.3.1 | Click Status Change → **Withdraw**. A reason input appears (inline or dialog).                                                                             | Input visible.                                                                                                                                   |           |
| 9.3.2 | Submit with empty reason.                                                                                                                                  | 400 `WITHDRAWAL_REASON_REQUIRED`. Toast: "A reason is required when withdrawing a student".                                                      |           |
| 9.3.3 | Enter reason `Moved overseas`. Submit.                                                                                                                     | PATCH succeeds with `{ status: "withdrawn", reason: "Moved overseas" }`. 200.                                                                    |           |
| 9.3.4 | DB: `student.status='withdrawn'`, `student.exit_date=<today>`. All active `class_enrolments` for this student have `status='dropped'`, `end_date=<today>`. | `SELECT status, exit_date FROM students WHERE id=?` matches. `SELECT COUNT(*) FROM class_enrolments WHERE student_id=? AND status='active'` = 0. |           |
| 9.3.5 | Badge in header turns orange **Withdrawn**.                                                                                                                | Correct.                                                                                                                                         |           |
| 9.3.6 | Attempting to re-submit Withdraw on the same student returns 400 `INVALID_STATUS_TRANSITION` (can't withdraw a withdrawn).                                 | Blocked.                                                                                                                                         |           |

### 9.4 Active → Graduated

| #     | What to Check                                                                                                   | Expected Result                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 9.4.1 | Click Status Change → **Graduate**.                                                                             | Confirm dialog. PATCH with `{ status: "graduated" }`. 200.                        |           |
| 9.4.2 | DB: status=graduated, exit_date=today. Enrolments **NOT** auto-dropped (different side-effect from withdrawal). | `SELECT status FROM class_enrolments WHERE student_id=?` still shows active rows. |           |

### 9.5 Active → Archived

| #     | What to Check                             | Expected Result                      | Pass/Fail |
| ----- | ----------------------------------------- | ------------------------------------ | --------- |
| 9.5.1 | Click Status Change → **Archive**.        | PATCH `{ status: "archived" }`. 200. |           |
| 9.5.2 | DB: status=archived, exit_date unchanged. | Correct.                             |           |

### 9.6 Withdrawn → Active (re-activation)

| #     | What to Check                                                                                                                                                                                                             | Expected Result                                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 9.6.1 | From a withdrawn student, click **Re-activate**.                                                                                                                                                                          | PATCH `{ status: "active" }`. 200.                                                |           |
| 9.6.2 | `exit_date` is NOT cleared by the server on re-activation — confirm `SELECT exit_date FROM students WHERE id=?` still shows the old exit_date. Flag as observation D in §37 if this is not the desired product behaviour. | Exit date remains.                                                                |           |
| 9.6.3 | Dropped enrolments are **NOT** auto-restored.                                                                                                                                                                             | `SELECT status FROM class_enrolments WHERE student_id=? AND status='active'` = 0. |           |

### 9.7 Graduated → Archived

| #     | What to Check                                          | Expected Result | Pass/Fail |
| ----- | ------------------------------------------------------ | --------------- | --------- |
| 9.7.1 | PATCH `{ status: "archived" }` on a graduated student. | 200.            |           |

### 9.8 Invalid transitions rejected

| #     | What to Check                                                              | Expected Result                                                                                 | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 9.8.1 | Via DevTools, PATCH `{ status: "withdrawn" }` on an **applicant** student. | 400 `INVALID_STATUS_TRANSITION` — message: `Cannot transition from "applicant" to "withdrawn"`. |           |
| 9.8.2 | PATCH `{ status: "archived" }` on a **withdrawn** student.                 | 400 `INVALID_STATUS_TRANSITION`.                                                                |           |
| 9.8.3 | PATCH `{ status: "active" }` on a **graduated** student.                   | 400 `INVALID_STATUS_TRANSITION`.                                                                |           |
| 9.8.4 | PATCH `{ status: "foo" }` (invalid enum value).                            | 400 Zod enum error.                                                                             |           |

---

## 10. Students — Allergy report page

**URL:** `/{locale}/students/allergy-report`  
**Permission:** `students.view` (sensitive-data audit: `special_category`).  
**Primary API:** `GET /v1/students/allergy-report` (note: no pagination params — returns all filtered rows).  
**Consent gate:** students are only included if they have a granted `gdpr_consent_records` row with `consent_type='health_data'` (see §7 in the integration spec).

### 10.1 Page load

| #      | What to Check                                                                                                                       | Expected Result                                                                            | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 10.1.1 | Navigate to `/en/students/allergy-report`.                                                                                          | Heading "Allergy Report", subtitle "Students with known allergies across all year groups". |           |
| 10.1.2 | Two filter dropdowns: **Year Group** (All Year Groups + list), **Class** (All Classes + list).                                      | Dropdowns present.                                                                         |           |
| 10.1.3 | Fetches `GET /api/v1/year-groups?pageSize=100` and `GET /api/v1/classes?pageSize=100&status=active` on mount to populate dropdowns. | Both calls fire.                                                                           |           |
| 10.1.4 | `GET /api/v1/students/allergy-report` fires. Returns `{ data: [...], meta: { total } }`.                                            | Correct.                                                                                   |           |

### 10.2 Table

| #      | What to Check                                                                                                   | Expected Result              | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| 10.2.1 | Columns: **Student** (EntityLink), **Year Group**, **Homeroom Class**, **Allergy Details** (red / danger text). | 4 columns.                   |           |
| 10.2.2 | Row count = `meta.total` = number of students with `has_allergy=true` AND a granted health-data consent.        | Consent-gated count matches. |           |
| 10.2.3 | Rows are ordered by `last_name ASC`.                                                                            | Correct order.               |           |
| 10.2.4 | Each student link goes to `/students/{id}`. Clicking navigates.                                                 | Correct.                     |           |

### 10.3 Filtering

| #      | What to Check                                                                                                                              | Expected Result  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------- |
| 10.3.1 | Select a year group. `year_group_id={uuid}` added to request. Table filters to that year group only.                                       | Correct.         |           |
| 10.3.2 | Select a class. `class_id={uuid}` added. Table filters to students with an active enrolment in that class (joined via `class_enrolments`). | Correct.         |           |
| 10.3.3 | Apply both year group + class. Request carries both params.                                                                                | Combined filter. |           |
| 10.3.4 | Reset both to "All". Full list returns.                                                                                                    | Correct.         |           |

### 10.4 Consent gate

| #      | What to Check                                                                                                                         | Expected Result     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 10.4.1 | Pick a student with `has_allergy=true` but NO health-data consent row (or a withdrawn one). Confirm they do NOT appear in the report. | Not in the list.    |           |
| 10.4.2 | Revoke health-data consent for a currently-listed student via the GDPR module (or SQL). Reload the report.                            | Student disappears. |           |

### 10.5 Empty state

| #      | What to Check                        | Expected Result                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.5.1 | Apply filters that return zero rows. | AlertTriangle icon, heading "No allergy records found", description "No students with recorded allergies match the current filters." |           |

### 10.6 Pagination

| #      | What to Check                                                                                                                                                                                                                                                                  | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 10.6.1 | The API returns **all** matching rows in one payload (no `page` / `pageSize` params on the server). If the tenant has 500 allergy students, the response is 500 rows. Verify: load a large tenant and check response size. Render cost (p95 < 1s) is covered in the perf spec. | Single payload. |           |

### 10.7 Sensitive-data audit

| #      | What to Check                                                                                                                                                                                             | Expected Result | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 10.7.1 | Each allergy-report load generates one audit log row with `entity_type='student'`, `entity_id=null` or a collection marker, `action='allergy_report_view'` (or equivalent), and a `special_category` tag. | Row present.    |           |

---

## 11. Staff — List page

**URL:** `/{locale}/staff`  
**Permission:** `users.view`  
**Primary API:** `GET /v1/staff-profiles`

### 11.1 Page chrome

| #      | What to Check                                                                                                                                           | Expected Result                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Navigate to `/en/staff`.                                                                                                                                | Heading "Staff", with action buttons: **Export** (dropdown: Excel / PDF), **New Staff** (Plus icon). |           |
| 11.1.2 | Only admin-tier roles see this page (per `nav-config.ts`: `ADMIN_ROLES`). Teachers land on `/students` if they click People (verified in teacher spec). | Confirmed via role login.                                                                            |           |
| 11.1.3 | Sub-strip active on **Staff**.                                                                                                                          | Correct.                                                                                             |           |

### 11.2 Data load + columns

| #      | What to Check                                                                                                                          | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 11.2.1 | `GET /api/v1/staff-profiles?page=1&pageSize=20` returns 200.                                                                           | Correct.        |           |
| 11.2.2 | Columns: **Name**, **Job Title**, **Department**, **Role**, **Status**, **Employment Type**.                                           | 6 columns.      |           |
| 11.2.3 | **Name** is `user.first_name` + `user.last_name` (bold).                                                                               | Correct.        |           |
| 11.2.4 | **Role** is a comma-separated list of `membership_roles[].role.display_name` for this tenant. If empty, "—".                           | Correct.        |           |
| 11.2.5 | **Status** badge: `active` (green), `inactive` (gray).                                                                                 | Correct.        |           |
| 11.2.6 | **Employment Type** prints the enum with underscores replaced by spaces and first letter capitalised (e.g. `full_time` → `Full time`). | Correct.        |           |
| 11.2.7 | Default sort is `created_at DESC`.                                                                                                     | Correct.        |           |

### 11.3 Search

| #      | What to Check                                                                                                                                                 | Expected Result                                                                                  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 11.3.1 | Search form requires an explicit submit (button `Search` or Enter). Backend applies `OR` on `user.first_name`, `user.last_name` only — email is NOT searched. | Confirm which fields match; flag if email-search is expected but missing (observation E in §37). |           |
| 11.3.2 | Submit search `Fatima`.                                                                                                                                       | `GET /api/v1/staff-profiles?search=Fatima` fires. Results filtered.                              |           |

### 11.4 Status filter

| #      | What to Check                                                                        | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------ | --------------- | --------- |
| 11.4.1 | Filter options: **All**, **Active**, **Inactive**.                                   | 3 options.      |           |
| 11.4.2 | Select **Inactive**. `employment_status=inactive` added. Only inactive staff appear. | Correct.        |           |

### 11.5 Row click

| #      | What to Check | Expected Result                | Pass/Fail |
| ------ | ------------- | ------------------------------ | --------- |
| 11.5.1 | Click a row.  | Navigates to `/en/staff/{id}`. |           |

---

## 12. Staff — Export (Excel + PDF)

### 12.1 Export dropdown

| #      | What to Check                                                                                                                                                 | Expected Result                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 12.1.1 | Click **Export** dropdown. Options: **Excel (.xlsx)**, **PDF**.                                                                                               | 2 options.                             |           |
| 12.1.2 | Click Excel. Export dialog opens with staff-specific column selector (job title, department, role, employment type, employment status, staff number, email).  | Columns match the staff export preset. |           |
| 12.1.3 | Bank fields are **NOT** in the export column list (the export endpoint does not include encrypted fields, and masking would be inappropriate in a bulk file). | Verify bank columns absent.            |           |

### 12.2 Execute export

| #      | What to Check                                                                                                                                   | Expected Result                           | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 12.2.1 | Click Export. The client fetches all matching staff in batches of `pageSize=100` via repeated `GET /v1/staff-profiles?page=N&pageSize=100&...`. | Loop runs until `data.length < pageSize`. |           |
| 12.2.2 | File saved as `Staff_List.xlsx` or `Staff_List.pdf`. Toast `Export successful`.                                                                 | Correct.                                  |           |
| 12.2.3 | Toast on error: `Export failed` with the API error message.                                                                                     | Correct.                                  |           |

---

## 13. Staff — New staff page

**URL:** `/{locale}/staff/new`  
**Permission:** `users.manage`  
**Primary API:** `POST /v1/staff-profiles`  
**Zod schema:** `createStaffProfileSchema`.

### 13.1 Form fields

| #      | What to Check                                                                                                                                                                                                                                                                             | Expected Result     | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 13.1.1 | Fields: `first_name`, `last_name`, `email`, `phone`, `role_id` (select populated from `/v1/roles`), `job_title`, `employment_status` (active/inactive), `department`, `employment_type` (full_time / part_time / contract / substitute), `bank_name`, `bank_account_number`, `bank_iban`. | All fields present. |           |
| 13.1.2 | `staff_number` is NOT editable — auto-generated server-side. The form does not render this field.                                                                                                                                                                                         | Absent.             |           |
| 13.1.3 | `role_id` dropdown populates with tenant's roles. Default = none (required).                                                                                                                                                                                                              | Correct.            |           |
| 13.1.4 | `employment_status` default = `active`. `employment_type` default = `full_time`.                                                                                                                                                                                                          | Correct defaults.   |           |

### 13.2 Validation

| #      | What to Check                                                                                                  | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 13.2.1 | Submit empty. Required fields: first_name, last_name, email, phone, role_id, employment_status. Errors appear. | Blocked.        |           |
| 13.2.2 | Invalid email (e.g. `not-an-email`). Zod error: `Invalid email`.                                               | Blocked.        |           |
| 13.2.3 | Phone < 1 char. Blocked (z.string().min(1).max(50)).                                                           | Blocked.        |           |
| 13.2.4 | `role_id` not a UUID. Blocked.                                                                                 | Blocked.        |           |
| 13.2.5 | Valid payload. Submit.                                                                                         | POST succeeds.  |           |

### 13.3 Existing-user handling

| #      | What to Check                                                               | Expected Result                                                                                                | Pass/Fail |
| ------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 13.3.1 | Create a staff with email that already belongs to a user in another tenant. | Service finds existing user, ensures membership, creates staff_profile + assigns role. Response 201.           |           |
| 13.3.2 | Create with email that already has a staff_profile in THIS tenant.          | 409 `STAFF_PROFILE_EXISTS` with message "A staff profile already exists for this email in this school". Toast. |           |
| 13.3.3 | Create with a brand-new email.                                              | New user + membership + staff_profile + role created in one transaction.                                       |           |

### 13.4 Credentials dialog

| #      | What to Check                                                                                                                                             | Expected Result                                                   | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 13.4.1 | After 201 success, a dialog opens titled **Credentials** (or similar). Shows `Email: {email}` and `Password: {staff_number}`.                             | Dialog visible.                                                   |           |
| 13.4.2 | Copy buttons next to each field copy to clipboard. Confirm via pasting.                                                                                   | Copy works.                                                       |           |
| 13.4.3 | The dialog is the ONLY surface that shows the initial password. Closing it before copying means the operator must reset the password via auth reset flow. | Confirmed by dismissing and checking no other surface exposes it. |           |
| 13.4.4 | Click **Done**. Dialog closes. Navigation → `/en/staff`.                                                                                                  | Correct.                                                          |           |

### 13.5 Bank details on create

| #      | What to Check                                                                                                  | Expected Result                                                                                      | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 13.5.1 | Enter `bank_name="Revolut"`, `bank_account_number="12345678"`, `bank_iban="IE29AIBK93115212345678"`. Submit.   | POST succeeds. Response masks bank fields (`bank_account_last4: "****"`, `bank_iban_last4: "****"`). |           |
| 13.5.2 | DB: `SELECT bank_account_number_encrypted FROM staff_profiles WHERE id=?` — ciphertext present, NOT plaintext. | Ciphertext.                                                                                          |           |
| 13.5.3 | DB: `bank_encryption_key_ref` is not null.                                                                     | Correct.                                                                                             |           |

### 13.6 Create without bank fields

| #      | What to Check                        | Expected Result                                                                                | Pass/Fail |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------- |
| 13.6.1 | Leave all bank fields empty. Submit. | 201. Response: `bank_account_last4: null`, `bank_iban_last4: null`. DB: encrypted fields null. |           |

### 13.7 Staff number format

| #      | What to Check                                                                                                                                                            | Expected Result                     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | --------- |
| 13.7.1 | After create, inspect `staff_number` in the response. Format: `AAA9999-N` (3 uppercase letters, 4 digits, hyphen, 1 digit).                                              | Matches regex `^[A-Z]{3}\d{4}-\d$`. |           |
| 13.7.2 | Uniqueness: service retries up to 5 times on collision. In a tenant with many staff, duplicate probability is 1/260,000 per attempt — very low. No external test needed. | Acceptable.                         |           |

---

## 14. Staff — Detail page (RecordHub)

**URL:** `/{locale}/staff/{id}`  
**Permission:** `users.view`  
**Primary API:** `GET /v1/staff-profiles/{id}` (no `@SensitiveDataAccess` decorator on this endpoint — the decorator is only on `/bank-details`).

### 14.1 Header

| #      | What to Check                                                       | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------- | --------------- | --------- |
| 14.1.1 | Title: `{user.first_name} {user.last_name}`.                        | Correct.        |           |
| 14.1.2 | Subtitle: `job_title` if present.                                   | Correct.        |           |
| 14.1.3 | Reference chip: `#{staff_number}` (monospace, includes `#` prefix). | Correct.        |           |
| 14.1.4 | Status badge: `active` → green; else neutral.                       | Correct.        |           |
| 14.1.5 | Actions: **Back** (arrow-left), **Edit** (edit icon).               | Both present.   |           |

### 14.2 Quick metrics

| #      | What to Check                                       | Expected Result | Pass/Fail |
| ------ | --------------------------------------------------- | --------------- | --------- |
| 14.2.1 | 3 cards: Department, Employment Type, Staff Number. | Correct.        |           |

### 14.3 Tabs

| #      | What to Check                                      | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------- | --------------- | --------- |
| 14.3.1 | Tabs: **Overview**, **Classes**, **Bank Details**. | 3 tabs.         |           |
| 14.3.2 | Default active: Overview.                          | Correct.        |           |

### 14.4 Overview tab

| #      | What to Check                                                                                                                           | Expected Result             | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------- |
| 14.4.1 | Fields in a 2-column grid: **User**, **Email** (ltr), **Job Title**, **Department**, **Employment Type**, **Staff Number** (monospace). | 6 fields.                   |           |
| 14.4.2 | Email is displayed with `dir="ltr"` even on the Arabic page (LTR enforcement for emails per the frontend spec).                         | Confirmed in Arabic locale. |           |

### 14.5 Classes tab

| #      | What to Check                                                                                                             | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 14.5.1 | Click **Classes**. Shows a table of class assignments via `class_staff`: Class Name (link to class), Academic Year, Role. | Correct.        |           |
| 14.5.2 | For staff with no assignments: empty state / message.                                                                     | Correct.        |           |

---

## 15. Staff — Bank details tab

**URL:** `/{locale}/staff/{id}` (Bank Details tab)  
**Permission:** `payroll.view_bank_details` (sensitive-data audit: `financial`). Admin (`admin` role) does NOT have this permission — principal + owner + accounting do.  
**Primary API:** `GET /v1/staff-profiles/{id}/bank-details`

### 15.1 Permission gate

| #      | What to Check                                                                  | Expected Result                                                                                                                                                                                                                                                                              | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1.1 | Sign in as `admin@nhqs.test`. Open a staff detail. Click **Bank Details** tab. | The frontend renders the tab but the API returns 403 on load. The UI handles this by showing "No bank details" OR an explicit "Permission denied" message. **Confirm actual behaviour** and flag if the tab itself should be hidden for roles lacking the permission (observation F in §37). |           |
| 15.1.2 | Sign in as `principal@nhqs.test`. Same page.                                   | Bank tab loads the masked values (see below).                                                                                                                                                                                                                                                |           |
| 15.1.3 | Sign in as `accounting@nhqs.test`. Same page.                                  | Bank tab loads. (Accounting has `finance.*` but may not have `payroll.view_bank_details`; confirm via system-roles seed — line 354–365: accounting has `finance.manage, finance.view, finance.process_payments`; NO `payroll.view_bank_details`. So accounting should get 403. Flag.)        |           |

### 15.2 Rendering

| #      | What to Check                                                                                                                                                                                                                  | Expected Result                                                  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------- |
| 15.2.1 | On load as owner, API returns `{ id, bank_name, bank_account_number_masked, bank_iban_masked }`. Masked values show last-4 digits only, with leading `****`. Full plaintext MUST NOT be in the response.                       | Verify payload in Network tab.                                   |           |
| 15.2.2 | Initial UI state: details hidden. Only `****1234` shown. A **Show Details** button (Eye icon) toggles visibility.                                                                                                              | Toggle present.                                                  |           |
| 15.2.3 | Click Show Details → text reveals the full masked value (still `****1234` — the "show" in this UI only toggles which piece of the mask is displayed; the full account number never leaves the server). Icon toggles to EyeOff. | Click works; no new network call (the mask is client-side only). |           |
| 15.2.4 | If `bank_account_number_encrypted` is null on the DB row, the tab shows `bank_account_number_masked: null` and the UI renders "—".                                                                                             | Correct.                                                         |           |

### 15.3 Sensitive-data audit

| #      | What to Check                                                                                                                                                                                                                                                        | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 15.3.1 | Each load of `/bank-details` writes an audit row tagged `financial`. Run `SELECT * FROM audit_logs WHERE actor_id=<owner.id> AND entity_type='staff_profile' AND entity_id=<staff.id> AND metadata->>'classification'='financial' ORDER BY created_at DESC LIMIT 1`. | Row present.    |           |

### 15.4 Cross-tenant bank read

| #      | What to Check                                                                                                      | Expected Result                                                                                            | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 15.4.1 | Logged in as Tenant A owner, navigate directly to `/en/staff/{tenantB_staff_id}` — a known staff id from Tenant B. | UI shows "Staff not found". API returns 404 with `STAFF_PROFILE_NOT_FOUND` (NOT 403, NOT Tenant B's data). |           |

---

## 16. Staff — Edit page

**URL:** `/{locale}/staff/{id}/edit`  
**Permission:** `users.manage`  
**Primary API:** `PATCH /v1/staff-profiles/{id}`

### 16.1 Editable fields

| #      | What to Check                                                                                                                                                                                                                                     | Expected Result                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 16.1.1 | Editable fields: `staff_number`, `job_title`, `employment_status`, `department`, `employment_type`, `bank_name`, `bank_account_number`, `bank_iban`. **Not editable**: email, first_name, last_name, phone, role_id. These are user-level fields. | Read-only fields are rendered as text or omitted. |           |
| 16.1.2 | Bank fields on the edit form — if `showBankDetails=false` (per code, the edit page passes `false`), bank fields are NOT visible. Flag if they are (observation G in §37).                                                                         | Check form render.                                |           |
| 16.1.3 | Clearing a clearable field (e.g. `job_title`) and submitting sends `null` to the API.                                                                                                                                                             | PATCH body contains `job_title: null`.            |           |

### 16.2 Employment status change

| #      | What to Check                                                                                                                                                                                                                                                                                            | Expected Result                                   | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 16.2.1 | Change employment_status from active to inactive. Submit.                                                                                                                                                                                                                                                | 200. Detail page reflects the change.             |           |
| 16.2.2 | Side-effects: does the service deactivate the user's tenant_membership or revoke their login? **Confirm** — the code does not do this automatically (observation H in §37). If the user is meant to lose access when their staff profile is inactive, the membership or role must be revoked separately. | DB: membership remains active; login still works. |           |

### 16.3 Bank details update

| #      | What to Check                                                                                                   | Expected Result                                            | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 16.3.1 | (If bank fields are present on the edit form — see 16.1.2) Update `bank_account_number` to a new value. Submit. | PATCH succeeds. Service re-encrypts. New ciphertext in DB. |           |
| 16.3.2 | Clear `bank_iban` (set to null).                                                                                | Ciphertext cleared.                                        |           |

---

## 17. Households — List page

**URL:** `/{locale}/households`  
**Permission:** `students.view`  
**Primary API:** `GET /v1/households`  
**Role visibility:** admin-tier only (admin-view spec).

### 17.1 Page load

| #      | What to Check                                                                                                                                                              | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 17.1.1 | Navigate to `/en/households`. Heading "Households", subtitle "Manage family household records".                                                                            | Correct.        |           |
| 17.1.2 | No top-right "New Household" button — creation flow is via `/households/new` (link likely on dashboard quick-action). Flag if UI should expose one (observation I in §37). | Confirm.        |           |
| 17.1.3 | `GET /api/v1/households?page=1&pageSize=20` fires on mount.                                                                                                                | Correct.        |           |

### 17.2 Table

| #      | What to Check                                                                                                                                                         | Expected Result          | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 17.2.1 | Columns: **Household Name**, **Status**, **Students** (count), **Billing Parent**.                                                                                    | 4 columns.               |           |
| 17.2.2 | Name cell: EntityLink to detail + monospace household_number in secondary text + **Incomplete** badge with tooltip listing issues (if `needs_completion=true`).       | Correct.                 |           |
| 17.2.3 | Incomplete-issue mapping (from `buildCompletionIssues` helper): `missing_emergency_contact` → "No emergency contact"; `missing_billing_parent` → "No billing parent". | Correct tooltip content. |           |
| 17.2.4 | Students count = `_count.students` from response.                                                                                                                     | Matches.                 |           |
| 17.2.5 | Billing Parent column: EntityLink to parent detail, or "—" if null.                                                                                                   | Correct.                 |           |

### 17.3 Search + filter

| #      | What to Check                                                           | Expected Result | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | --------------- | --------- |
| 17.3.1 | Search input filters by `household_name` (case-insensitive `contains`). | Correct.        |           |
| 17.3.2 | Status filter: All / Active / Inactive / Archived.                      | 4 options.      |           |
| 17.3.3 | Select Archived. `status=archived` applied.                             | Correct.        |           |

### 17.4 Empty state

| #      | What to Check                                                                                                                                           | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 17.4.1 | Zero-household tenant. Empty state: Home icon, heading "No households yet", description "Register a new family using the wizard to create a household." | Correct.        |           |

---

## 18. Households — New household page

**URL:** `/{locale}/households/new`  
**Permission:** `students.manage`  
**Primary API:** `POST /v1/households`  
**Zod:** `createHouseholdSchema` (emergency_contacts min 1, max 3).

### 18.1 Form fields

| #      | What to Check                                                                                                                                                                                                                                                    | Expected Result      | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 18.1.1 | Fields: `household_name` (required), address_line1, address_line2, city, postal_code, country.                                                                                                                                                                   | Text inputs present. |           |
| 18.1.2 | Emergency contacts section: initially 1 row, with fields `contact_name`, `phone`, `relationship_label`, `display_order` (auto-set). An **Add Contact** button appears. A **Remove** button appears next to each row (but disabled on the only row, since min 1). | Correct.             |           |
| 18.1.3 | Add Contact — max 3 contacts. After adding the 3rd, the Add button is disabled.                                                                                                                                                                                  | Disabled at 3.       |           |

### 18.2 Validation

| #      | What to Check                                                                                     | Expected Result                              | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------- |
| 18.2.1 | Submit empty. Errors: "Household name is required", "At least one emergency contact is required". | Blocked.                                     |           |
| 18.2.2 | Contact with empty name. Error: `contact_name is required` (min 1).                               | Blocked.                                     |           |
| 18.2.3 | Fill all fields. Submit.                                                                          | POST returns 201. Toast. Redirect to detail. |           |

### 18.3 Next-number preview (optional)

| #      | What to Check                                                                                                                                                                                  | Expected Result                     | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- |
| 18.3.1 | If the UI calls `GET /v1/households/next-number` to preview the household_number before create, verify the response format: `{ household_number: "XYZ123" }` (3 uppercase letters + 3 digits). | Preview call fires; format matches. |           |

### 18.4 Create succeeds

| #      | What to Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Expected Result                                | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| 18.4.1 | POST `/v1/households` returns 201 with the new household including emergency_contacts, household_parents (empty), billing_parent (null). `household_number` assigned (format `AAA999`). `status='active'`, `needs_completion=false` (since at least one contact but no billing parent yet — wait, the logic: `needsCompletion = !(hasContacts && hasBillingParent)`. With contacts but no billing parent, `hasContacts=true, hasBillingParent=false`, so `needsCompletion=true`). Verify the new household shows "Incomplete — No billing parent" on the list page. | Status correct. Needs-completion flag present. |           |
| 18.4.2 | Search-sync job enqueued for the new household (upsert).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Queue length +1.                               |           |

---

## 19. Households — Detail page — Header + metrics

**URL:** `/{locale}/households/{id}`  
**Permission:** `students.view`

### 19.1 Header

| #      | What to Check                                                                                                                                                                                                                                                             | Expected Result  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 19.1.1 | Title: `household_name`.                                                                                                                                                                                                                                                  | Correct.         |           |
| 19.1.2 | Reference: `household_number` (monospace, e.g. `XYZ123`).                                                                                                                                                                                                                 | Correct.         |           |
| 19.1.3 | Status badge: `active` (green), `inactive` (orange), `archived` (gray).                                                                                                                                                                                                   | Correct.         |           |
| 19.1.4 | Completion warning banner: renders above content if `needs_completion=true`. Content: AlertTriangle icon, heading "This household is incomplete", bullet list of issues ("No emergency contact on file", "No billing parent assigned"). Orange / warning-variant styling. | Warning correct. |           |
| 19.1.5 | Actions in header: **Edit** (Edit icon), **Merge**, **Split**.                                                                                                                                                                                                            | 3 actions.       |           |

### 19.2 Quick metrics

| #      | What to Check                                                                                 | Expected Result | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------- | --------------- | --------- |
| 19.2.1 | 3 metric cards: **Students**, **Guardians**, **Emergency Contacts** — each showing the count. | Correct.        |           |

### 19.3 Tabs

| #      | What to Check                                                                                                                                           | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 19.3.1 | 5 tabs: **Overview**, **Students** (with count), **Guardians** (with count), **Emergency Contacts** (with count), **Finance** (with count of invoices). | 5 tabs.         |           |

---

## 20. Households — Overview tab

| #    | What to Check                                                                                                                                                                                                   | Expected Result | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 20.1 | **Address** section: shows concatenated address (`address_line_1, address_line_2, city, postal_code, country`) separated by commas, skipping nulls. If all address fields are null, shows "No address on file". | Correct.        |           |
| 20.2 | **Billing Parent** section: EntityLink to parent with full name. If null, "Not set".                                                                                                                            | Correct.        |           |

---

## 21. Households — Students tab + Add-student dialog

### 21.1 Students list

| #      | What to Check                                                                                                                                            | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 21.1.1 | Click **Students** tab. Lists all `students[]` from the household response. Each row: EntityLink to student, year_group_name (right-side), status badge. | Correct.        |           |
| 21.1.2 | Empty state: "No students in this household".                                                                                                            | Correct.        |           |
| 21.1.3 | **Add Student** button (Plus icon) at top of tab.                                                                                                        | Present.        |           |

### 21.2 Add-student dialog

| #      | What to Check                                                                                                                                                                                   | Expected Result                                                                                                                                         | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.2.1 | Click **Add Student**. Dialog opens: "Add Student to {household_name}".                                                                                                                         | Correct.                                                                                                                                                |           |
| 21.2.2 | Fields: first_name, middle_name, last_name (placeholder suggests last word of household_name), date_of_birth, gender (select), year_group_id (select), national_id, nationality, city_of_birth. | All fields.                                                                                                                                             |           |
| 21.2.3 | Gender options: male, female, other, prefer_not_to_say.                                                                                                                                         | 4 options.                                                                                                                                              |           |
| 21.2.4 | Required fields: first_name, date_of_birth, gender, year_group_id, national_id. Submit empty to verify.                                                                                         | Validation blocks.                                                                                                                                      |           |
| 21.2.5 | Submit valid payload.                                                                                                                                                                           | `POST /v1/households/{id}/students` fires (delegated to RegistrationService). 201. Dialog closes. Household refetches. New student appears in the list. |           |

### 21.3 Household refresh

| #      | What to Check                                                                            | Expected Result                                                                                                           | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.3.1 | After Add, the Finance tab also refetches invoices (if fee assignments auto-create any). | Network shows both `GET /v1/households/{id}` and `GET /v1/finance/invoices?household_id={id}` (per spec for tab content). |           |

### 21.4 Cross-tenant student add (negative)

| #      | What to Check                                                                                                                              | Expected Result                            | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------- |
| 21.4.1 | While on Tenant A household detail, attempt via DevTools to POST to `/v1/households/{tenantB_household_id}/students` with a valid payload. | 404 `HOUSEHOLD_NOT_FOUND` (tenant-scoped). |           |

---

## 22. Households — Guardians tab + Guardian CRUD

### 22.1 Guardians list

| #      | What to Check                                                                                                                                                                                                                        | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 22.1.1 | Tab shows `household_parents[]`. Each row: EntityLink to parent, relationship_label, **Primary** badge (if `is_primary_contact`), **Billing** badge (if `is_billing_contact`), **Set Billing** button (if not billing), edit pencil. | Correct.        |           |
| 22.1.2 | Empty state: "No guardians in this household".                                                                                                                                                                                       | Correct.        |           |
| 22.1.3 | **Add Guardian** button (Plus).                                                                                                                                                                                                      | Present.        |           |

### 22.2 Add-guardian dialog

| #      | What to Check                                                                                                                                                     | Expected Result                                                                                                                            | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 22.2.1 | Click Add. Dialog: title "Add Guardian".                                                                                                                          | Correct.                                                                                                                                   |           |
| 22.2.2 | Fields: first_name, last_name, email, phone, whatsapp_phone, relationship_label, preferred_contact_channels (multi-select: email + whatsapp).                     | All fields.                                                                                                                                |           |
| 22.2.3 | Validation: `preferred_contact_channels` min 1 max 2. `whatsapp_phone` required if whatsapp selected.                                                             | Blocked.                                                                                                                                   |           |
| 22.2.4 | Submit.                                                                                                                                                           | Two-call flow: `POST /v1/parents` creates the parent, then `POST /v1/households/{id}/parents` links it. Both succeed. Household refetches. |           |
| 22.2.5 | If the parent email already exists in this tenant → 409 `PARENT_EMAIL_EXISTS` on the first call. Toast: "A parent with this email already exists in this tenant". | Error shown.                                                                                                                               |           |

### 22.3 Edit guardian

| #      | What to Check                                                                 | Expected Result                                        | Pass/Fail |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 22.3.1 | Click pencil on an existing guardian row. Dialog: "Edit Guardian" pre-filled. | Correct.                                               |           |
| 22.3.2 | Change last_name. Submit.                                                     | `PATCH /v1/parents/{id}` with only last_name. Updates. |           |

### 22.4 Set billing parent

| #      | What to Check                                                                                                                                                     | Expected Result                                                                                          | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 22.4.1 | Click **Set Billing** on a guardian.                                                                                                                              | `PUT /v1/households/{id}/billing-parent` with `{ parent_id }`. 200. `primary_billing_parent_id` updates. |           |
| 22.4.2 | Household `needs_completion` recalculates (if contacts exist, becomes false). Banner disappears if no other issues.                                               | Correct.                                                                                                 |           |
| 22.4.3 | **Billing** badge now shows on the selected guardian. The previous **Billing** guardian (if any) no longer has the badge (only one billing parent per household). | Correct.                                                                                                 |           |
| 22.4.4 | Attempt `Set Billing` on a guardian that isn't in the household (force via DevTools).                                                                             | 400 `PARENT_NOT_IN_HOUSEHOLD`.                                                                           |           |

### 22.5 Unlink parent

| #      | What to Check                                                                                                                                                      | Expected Result                                                                                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 22.5.1 | On a non-billing guardian, click a remove / unlink affordance (if present). (Confirm the UI exposes this — if only via Merge/Split, flag as observation J in §37.) | `DELETE /v1/households/{id}/parents/{parent_id}`. 204.                                                            |           |
| 22.5.2 | Attempt to unlink the billing parent.                                                                                                                              | 400 `IS_BILLING_PARENT` with message "Cannot unlink the billing parent. Assign a different billing parent first." |           |

---

## 23. Households — Emergency contacts tab + contact CRUD

### 23.1 Contacts list

| #      | What to Check                                                                                               | Expected Result       | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 23.1.1 | Tab shows `emergency_contacts[]` sorted by `display_order ASC`.                                             | Correct.              |           |
| 23.1.2 | Each row: contact_name (bold), relationship_label (gray), phone (ltr monospace), edit pencil, delete trash. | Correct.              |           |
| 23.1.3 | **Add Contact** button visible ONLY when contacts < 3.                                                      | Disabled/hidden at 3. |           |

### 23.2 Add contact

| #      | What to Check                                                                            | Expected Result                                                                                                                | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 23.2.1 | Click Add. Dialog: "Add Emergency Contact" with contact_name, phone, relationship_label. | Correct.                                                                                                                       |           |
| 23.2.2 | Submit.                                                                                  | `POST /v1/households/{id}/emergency-contacts` with `display_order` set to the next free slot (1, 2, or 3). 201. Tab refreshes. |           |
| 23.2.3 | Attempting to add a 4th contact server-side returns 400 `CONTACTS_LIMIT_REACHED`.        | Blocked.                                                                                                                       |           |

### 23.3 Edit contact

| #      | What to Check                                         | Expected Result                                                  | Pass/Fail |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 23.3.1 | Click pencil. Dialog pre-fills. Change phone. Submit. | `PATCH /v1/households/{id}/emergency-contacts/{contactId}`. 200. |           |

### 23.4 Delete contact

| #      | What to Check                                                                            | Expected Result                                                                                  | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 23.4.1 | Click trash on a contact where the household has ≥ 2 contacts. Confirm dialog → Confirm. | `DELETE`. 204. Contact disappears. Household refreshes.                                          |           |
| 23.4.2 | Attempt to delete the LAST contact (when only 1 remains).                                | 400 `MIN_CONTACTS_REQUIRED` with message "A household must have at least one emergency contact". |           |

### 23.5 Needs-completion recalc

| #      | What to Check                                                                                                                            | Expected Result | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 23.5.1 | Delete a contact down to 1 contact + billing parent set. `needs_completion` should stay false (still has 1+ contact and billing parent). | Correct.        |           |
| 23.5.2 | Delete contacts to reach 0 (should be blocked by §23.4.2). If bypassed somehow, `needs_completion` flips to true.                        | Correct.        |           |

---

## 24. Households — Finance tab + statement link

| #    | What to Check                                                                                          | Expected Result                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------- |
| 24.1 | Click **Finance** tab. Invoice table renders (5 columns: Invoice #, Status, Total, Balance, Due Date). | Correct.                           |           |
| 24.2 | API: `GET /v1/finance/invoices?household_id={id}&pageSize=50` fires on tab activation.                 | Correct.                           |           |
| 24.3 | **View Statement** link (or button) at top → `/en/finance/statements/{household_id}`. Click navigates. | Link works.                        |           |
| 24.4 | Invoice row click → `/en/finance/invoices/{invoice.id}`.                                               | Navigation works.                  |           |
| 24.5 | Empty state: FileText icon, "No invoices for this household".                                          | Correct.                           |           |
| 24.6 | Currency formatting per tenant currency (`€` for NHQS). Uses `<CurrencyDisplay>`.                      | Correct per finance module tokens. |           |

---

## 25. Households — Edit page

**URL:** `/{locale}/households/{id}/edit`  
**Permission:** `students.manage`  
**Primary API:** `PATCH /v1/households/{id}` + contact CRUD endpoints.

| #    | What to Check                                                                                                                                         | Expected Result                  | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 25.1 | Form fields: household_name, address_line1-2, city, postal_code, country, emergency_contacts (dynamic).                                               | Correct.                         |           |
| 25.2 | Submit changes. Frontend syncs contacts: DELETE removed, PATCH existing (changed), POST new.                                                          | Multiple calls fire in sequence. |           |
| 25.3 | Validation: household_name min 1.                                                                                                                     | Blocked.                         |           |
| 25.4 | Success toast + redirect to detail.                                                                                                                   | Correct.                         |           |
| 25.5 | `household_number` is read-only (not editable on this form). Server-side, UPDATE on `household_number` is also not exposed via updateHouseholdSchema. | Confirmed.                       |           |

---

## 26. Households — Merge dialog + flow

**Primary API:** `POST /v1/households/merge`

### 26.1 Open dialog

| #      | What to Check                                                                                                                                   | Expected Result                  | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 26.1.1 | On a household detail (source), click **Merge** in the header.                                                                                  | Dialog opens: "Merge Household". |           |
| 26.1.2 | Dialog has a target-household selector (searchable combobox of active households, excluding the current one). Archived households are excluded. | Correct.                         |           |
| 26.1.3 | Preview section shows what will move: all students from source, all parent links (dedup), up to 3 emergency contacts onto target.               | Correct.                         |           |

### 26.2 Execute merge

| #      | What to Check                                                                                                                                                                       | Expected Result                                                                       | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 26.2.1 | Select target. Click **Confirm Merge**.                                                                                                                                             | POST `/v1/households/merge` with `{ source_household_id, target_household_id }`. 200. |           |
| 26.2.2 | DB: source household `status='archived'`, source students' `household_id` moved to target, source parent_links moved (dedup), up to 3 source emergency contacts appended to target. | Verify via SQL.                                                                       |           |
| 26.2.3 | Redirects to target detail. Target shows merged students + contacts + parents.                                                                                                      | Correct.                                                                              |           |

### 26.3 Edge cases

| #      | What to Check                                                                                                                   | Expected Result                                                                     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 26.3.1 | Attempt to merge a household with itself (source = target).                                                                     | 400 `SAME_HOUSEHOLD` with message "Source and target households must be different". |           |
| 26.3.2 | Attempt merge where source is archived.                                                                                         | 400 `HOUSEHOLD_ARCHIVED`.                                                           |           |
| 26.3.3 | Attempt merge where target is archived.                                                                                         | 400 `HOUSEHOLD_ARCHIVED`.                                                           |           |
| 26.3.4 | Cross-tenant merge (target in Tenant B).                                                                                        | 404 `HOUSEHOLD_NOT_FOUND` on the target.                                            |           |
| 26.3.5 | Contact overflow: source has 2 contacts, target already has 2. After merge, target has 3 (only 1 of source's contacts moved).   | Verify count = 3 post-merge.                                                        |           |
| 26.3.6 | Contact overflow: target has 3. None from source move.                                                                          | Target contact count stays 3.                                                       |           |
| 26.3.7 | Merge preserves students' `student_number`. (The number references the old household via its prefix, but we don't re-generate.) | Numbers unchanged.                                                                  |           |
| 26.3.8 | Merge is atomic — forcing a failure mid-transaction (via mock) rolls everything back. (Covered in integration spec §6.)         | N/A here (UI view).                                                                 |           |

### 26.4 Preview cache

| #      | What to Check                                                                                                                                       | Expected Result | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 26.4.1 | Post-merge, Redis preview cache for both source and target is invalidated. `redis-cli GET preview:household:{source}` returns nil; same for target. | Both cleared.   |           |

### 26.5 Search-sync

| #      | What to Check                                              | Expected Result  | Pass/Fail |
| ------ | ---------------------------------------------------------- | ---------------- | --------- |
| 26.5.1 | After merge, search-sync jobs enqueue for both households. | Queue length +2. |           |

---

## 27. Households — Split dialog + flow

**Primary API:** `POST /v1/households/split`

### 27.1 Open dialog

| #      | What to Check                                                                                                                                                                                                            | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------- |
| 27.1.1 | Click **Split**. Dialog: "Split Household".                                                                                                                                                                              | Correct.        |           |
| 27.1.2 | Fields: **new_household_name** (required), list of the source's students with checkboxes (select which move to new), list of parents with checkboxes, emergency contacts section (min 1 required for the new household). | Correct.        |           |

### 27.2 Execute split

| #      | What to Check                                                                                          | Expected Result                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------- |
| 27.2.1 | Select a new name, tick 2 students, tick 1 parent, add 1 emergency contact. Confirm.                   | POST `/v1/households/split` with the payload. 200. |           |
| 27.2.2 | New household created with `status='active'`, needs_completion depending on billing parent assignment. | Created.                                           |           |
| 27.2.3 | Selected students moved (`student.household_id` → new). Non-selected remain on source.                 | Verify SQL.                                        |           |
| 27.2.4 | Selected parents linked to new household (duplicate links silently ignored).                           | Correct.                                           |           |
| 27.2.5 | Emergency contacts created on new household per the dto.                                               | Correct.                                           |           |
| 27.2.6 | Source household is NOT archived by split (only merge archives).                                       | Source still active.                               |           |

### 27.3 Edge cases

| #      | What to Check                                 | Expected Result                                                                                          | Pass/Fail |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 27.3.1 | Split from an archived source.                | 400 `HOUSEHOLD_ARCHIVED`.                                                                                |           |
| 27.3.2 | Split with 0 emergency contacts.              | 400 Zod: "At least one emergency contact is required".                                                   |           |
| 27.3.3 | Split with 0 students AND 0 parents selected. | The spec allows this (creates an empty new household). Flag observation K in §37 if this is undesirable. |           |
| 27.3.4 | `new_household_name` empty.                   | Zod: min 1 → 400.                                                                                        |           |

### 27.4 Preview cache invalidation

| #      | What to Check                                                                  | Expected Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | --------------- | --------- |
| 27.4.1 | `preview:household:{source}` + `preview:household:{new}` are both invalidated. | Both gone.      |           |

---

## 28. Households — Needs-completion banner + derivation

`needs_completion = !(hasContacts >= 1 && primary_billing_parent_id != null)`

| #    | Scenario                                                                   | needs_completion | Banner shown?                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | ---------------- | ------------------------------------ | --------- |
| 28.1 | Fresh create: 1 contact, no billing parent.                                | true             | yes ("No billing parent assigned")   |           |
| 28.2 | Billing parent set, 1 contact.                                             | false            | no                                   |           |
| 28.3 | Billing parent set, 0 contacts (blocked by §23.4.2 but simulated via SQL). | true             | yes ("No emergency contact on file") |           |
| 28.4 | 0 contacts, no billing parent.                                             | true             | yes (both)                           |           |

---

## 29. Parents — Detail page (read-only)

**URL:** `/{locale}/parents/{id}`  
**Permission:** `students.view`  
**Primary API:** `GET /v1/parents/{id}`

### 29.1 Header + metrics

| #      | What to Check                                                                                                                                            | Expected Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 29.1.1 | Title: `{first_name} {last_name}`. Subtitle: capitalised relationship_label. No reference chip.                                                          | Correct.        |           |
| 29.1.2 | Status badge: active (green) / inactive (gray).                                                                                                          | Correct.        |           |
| 29.1.3 | Quick-metrics: **Email** (ltr), **Phone** (ltr), **Relationship**.                                                                                       | Correct.        |           |
| 29.1.4 | No Edit button on this page (parent edits happen from the household detail's guardian dialog). Flag as observation L if dedicated edit surface expected. | Confirmed.      |           |

### 29.2 Overview tab

| #      | What to Check                                                                                                           | Expected Result | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 29.2.1 | **Contact Info** section: `is_primary_contact` (Yes/No), `is_billing_contact` (Yes/No).                                 | Correct.        |           |
| 29.2.2 | **Households** section: list of linked households with EntityLinks, role_label (if any).                                | Correct.        |           |
| 29.2.3 | **Children** section: table of linked students (name EntityLink, relationship_label, student_number ltr, status badge). | Correct.        |           |

### 29.3 Not-found + errors

| #      | What to Check                                                                                             | Expected Result                         | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------- |
| 29.3.1 | `/en/parents/{unknown-uuid}` → "Parent not found" message (from the service's `PARENT_NOT_FOUND` on GET). | Correct.                                |           |
| 29.3.2 | Cross-tenant: `/en/parents/{tenantB_parent_id}` → "Parent not found".                                     | 404 from API. UI shows not-found state. |           |

---

## 30. Cross-entity navigation + EntityLink behaviour

| #    | What to Check                                                                                                          | Expected Result              | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| 30.1 | From student detail, click Household link → `/en/households/{id}` loads without full-page reload (Next.js client nav). | SPA navigation, no flash.    |           |
| 30.2 | From household detail's Students tab, click a student → `/en/students/{id}`.                                           | SPA nav.                     |           |
| 30.3 | From household detail's Guardians tab, click a parent → `/en/parents/{id}`.                                            | SPA nav.                     |           |
| 30.4 | From parent detail, click a household → `/en/households/{id}`.                                                         | Works.                       |           |
| 30.5 | From student's Parents/Guardians section, click a parent → parent detail.                                              | Works.                       |           |
| 30.6 | Browser back button after each navigation returns to previous page. History stack is correct.                          | Correct.                     |           |
| 30.7 | Copy a household detail URL, paste in a new tab.                                                                       | Page loads directly, no 404. |           |

---

## 31. Sensitive-data audit banners

The code uses `@SensitiveDataAccess('special_category' | 'financial' | 'full_export')` on specific endpoints. The spec for the audit interceptor (below) documents what the tester can observe.

| #    | What to Check                                                                                                                                                                                                                                                                                               | Expected Result          | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 31.1 | Every `GET /v1/students/:id` load generates an audit row with classification=`special_category`. Run a SQL check after 10 detail views: `SELECT COUNT(*) FROM audit_logs WHERE actor_id=<owner.id> AND metadata->>'classification'='special_category' AND created_at > now() - interval '10 minutes'` ≥ 10. | Row count matches views. |           |
| 31.2 | Every `GET /v1/students/allergy-report` generates one audit row (bulk-view).                                                                                                                                                                                                                                | Row present.             |           |
| 31.3 | Every `GET /v1/students/:id/export-pack` — classification `full_export`.                                                                                                                                                                                                                                    | Row present.             |           |
| 31.4 | Every `GET /v1/staff-profiles/:id/bank-details` — classification `financial`.                                                                                                                                                                                                                               | Row present.             |           |
| 31.5 | Audit rows are not editable by any API. Attempt `PATCH /v1/audit-logs/:id` via DevTools → 404 (no such endpoint) or 403.                                                                                                                                                                                    | Immutable.               |           |

---

## 32. Arabic / RTL walkthrough

Sign out of English, sign back in at `/ar/login`. Re-run sections 4, 7, 17, 19, 22 with the following RTL-specific assertions.

| #     | What to Check                                                                                                                                                                                  | Expected Result                                 | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| 32.1  | `<html dir="rtl" lang="ar">`.                                                                                                                                                                  | Correct.                                        |           |
| 32.2  | Morph-bar labels right-aligned. Hub order mirrors (rightmost element becomes leftmost visually).                                                                                               | Correct.                                        |           |
| 32.3  | Sub-strip reads right-to-left.                                                                                                                                                                 | Correct.                                        |           |
| 32.4  | DataTable columns mirror. First column (Name) appears on the right.                                                                                                                            | Correct.                                        |           |
| 32.5  | Text content is in Arabic where translation keys exist. Verify `messages/ar.json` has keys: `students.title`, `students.active`, `households.title`, `staff.title`, `parents.households`, etc. | All keys present (no `students.title` literal). |           |
| 32.6  | **Email** fields are `dir="ltr"` inside the RTL page. Verify by inspecting an email cell on staff detail overview.                                                                             | LTR local.                                      |           |
| 32.7  | **Phone** numbers are `dir="ltr"`.                                                                                                                                                             | Correct.                                        |           |
| 32.8  | **Student numbers** (e.g. `ABC001-1`) are `dir="ltr"`.                                                                                                                                         | Correct.                                        |           |
| 32.9  | **Dates** use Gregorian + Latin digits (e.g. `12 أبريل 2026`, with digits `12` and `2026` Latin).                                                                                              | Correct.                                        |           |
| 32.10 | Status badges retain icon-first-then-label order (mirrored on RTL).                                                                                                                            | Correct.                                        |           |
| 32.11 | Form inputs with Arabic names (`first_name_ar`, `last_name_ar`) render `dir="rtl"` regardless of page locale.                                                                                  | Correct.                                        |           |
| 32.12 | Confirm no overflow or cut-off text at 375px viewport in Arabic.                                                                                                                               | Correct.                                        |           |
| 32.13 | Toast positions: in RTL, toasts appear top-**left** (mirror of top-right).                                                                                                                     | Correct.                                        |           |

---

## 33. Cross-tenant hostile checks (UI-visible side)

Logged in as Tenant A owner (`owner@nhqs.test`). Use UUIDs captured from Tenant B in §1.7.

| #     | What to Check                                                                                       | Expected Result                                                                                                                        | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1  | Navigate to `/en/students/{tenantB_student_id}`.                                                    | UI shows "Student not found". API: 404 `STUDENT_NOT_FOUND`. No Tenant B data leaks.                                                    |           |
| 33.2  | Navigate to `/en/households/{tenantB_household_id}`.                                                | "Household not found". 404.                                                                                                            |           |
| 33.3  | Navigate to `/en/staff/{tenantB_staff_id}`.                                                         | "Staff not found". 404.                                                                                                                |           |
| 33.4  | Navigate to `/en/parents/{tenantB_parent_id}`.                                                      | "Parent not found". 404.                                                                                                               |           |
| 33.5  | Navigate to `/en/students/{tenantB_student_id}/edit`.                                               | Form attempts to load; fails with 404. Edit form either shows not-found message or redirects to list.                                  |           |
| 33.6  | PATCH `/v1/students/{tenantB_student_id}` via DevTools with a valid body.                           | 404 `STUDENT_NOT_FOUND`. No row mutated in Tenant B.                                                                                   |           |
| 33.7  | POST `/v1/students` with `household_id: <tenantB_household_id>` in the body.                        | 404 `HOUSEHOLD_NOT_FOUND` (the service's `existsOrThrow` is tenant-scoped).                                                            |           |
| 33.8  | POST `/v1/students` with `tenant_id: <tenantB_id>` in the body (if the client allows injecting it). | `tenant_id` is NOT accepted in the schema — the value is ignored and overwritten with the session tenant. New row created in Tenant A. |           |
| 33.9  | POST `/v1/households/merge` with `source_household_id=<A>, target_household_id=<B>`.                | 404 on target (target not found in Tenant A scope).                                                                                    |           |
| 33.10 | Allergy report as owner A — no Tenant B student appears.                                            | Confirmed via UI + payload.                                                                                                            |           |

Every row above MUST end in 404 / 400 / 403. A single 200-with-Tenant-B-data result is a P0 security finding.

---

## 34. Backend Endpoint Map

| Section  | Method + Path                                                      | Permission                | Audit tag        | Notes                                                                  |
| -------- | ------------------------------------------------------------------ | ------------------------- | ---------------- | ---------------------------------------------------------------------- |
| §4, §5   | GET `/v1/students`                                                 | students.view             | —                | List, paginated                                                        |
| §5       | GET `/v1/students/export-data`                                     | students.view             | —                | Bulk export, unpaginated                                               |
| §10      | GET `/v1/students/allergy-report`                                  | students.view             | special_category | Consent-gated                                                          |
| §6       | POST `/v1/students`                                                | students.manage           | —                | Create                                                                 |
| §7, §31  | GET `/v1/students/:id`                                             | students.view             | special_category | Detail (audit-logged per view)                                         |
| §8       | PATCH `/v1/students/:id`                                           | students.manage           | —                | Edit                                                                   |
| §9       | PATCH `/v1/students/:id/status`                                    | students.manage           | —                | State machine                                                          |
| —        | GET `/v1/students/:id/preview`                                     | students.view             | —                | Redis-cached 30s; used by hover cards elsewhere                        |
| §31      | GET `/v1/students/:id/export-pack`                                 | students.manage           | full_export      | Student full export                                                    |
| §11, §12 | GET `/v1/staff-profiles`                                           | users.view                | —                | List                                                                   |
| §13      | POST `/v1/staff-profiles`                                          | users.manage              | —                | Create (user + membership + role + profile)                            |
| §14      | GET `/v1/staff-profiles/:id`                                       | users.view                | —                | Detail                                                                 |
| §16      | PATCH `/v1/staff-profiles/:id`                                     | users.manage              | —                | Edit                                                                   |
| §15, §31 | GET `/v1/staff-profiles/:id/bank-details`                          | payroll.view_bank_details | financial        | Masked response only                                                   |
| —        | GET `/v1/staff-profiles/:id/preview`                               | users.view                | —                | Redis-cached preview                                                   |
| §17      | GET `/v1/households`                                               | students.view             | —                | List                                                                   |
| §18      | POST `/v1/households`                                              | students.manage           | —                | Create + initial emergency contacts                                    |
| §18      | GET `/v1/households/next-number`                                   | students.manage           | —                | Preview next household number                                          |
| —        | GET `/v1/households/merge`                                         | students.view             | —                | 405 placeholder (use POST)                                             |
| §26      | POST `/v1/households/merge`                                        | students.manage           | —                | Merge (source archived, students + parents + contacts moved to target) |
| §27      | POST `/v1/households/split`                                        | students.manage           | —                | Split (new household created)                                          |
| §19–§24  | GET `/v1/households/:id`                                           | students.view             | —                | Detail                                                                 |
| §25      | PATCH `/v1/households/:id`                                         | students.manage           | —                | Edit                                                                   |
| —        | PATCH `/v1/households/:id/status`                                  | students.manage           | —                | Status transitions (active / inactive / archived)                      |
| §22      | PUT `/v1/households/:id/billing-parent`                            | students.manage           | —                | Set billing                                                            |
| §23      | POST `/v1/households/:id/emergency-contacts`                       | students.manage           | —                | Add contact                                                            |
| §23      | PATCH `/v1/households/:householdId/emergency-contacts/:contactId`  | students.manage           | —                | Update                                                                 |
| §23      | DELETE `/v1/households/:householdId/emergency-contacts/:contactId` | students.manage           | —                | Delete (204)                                                           |
| §22      | POST `/v1/households/:id/parents`                                  | students.manage           | —                | Link parent                                                            |
| §22      | DELETE `/v1/households/:householdId/parents/:parentId`             | students.manage           | —                | Unlink                                                                 |
| §21      | POST `/v1/households/:id/students`                                 | students.manage           | —                | Registration-service delegated; creates student under this household   |
| —        | GET `/v1/households/:id/preview`                                   | students.view             | —                | Redis-cached preview                                                   |
| §22      | POST `/v1/parents`                                                 | students.manage           | —                | Create parent                                                          |
| —        | GET `/v1/parents`                                                  | students.view             | —                | List                                                                   |
| §29      | GET `/v1/parents/:id`                                              | students.view             | —                | Detail                                                                 |
| §22      | PATCH `/v1/parents/:id`                                            | students.manage           | —                | Update                                                                 |
| —        | POST `/v1/parents/:id/students`                                    | students.manage           | —                | Link to student                                                        |
| —        | DELETE `/v1/parents/:parentId/students/:studentId`                 | students.manage           | —                | Unlink                                                                 |

All endpoints run under `AuthGuard + PermissionGuard`. Missing token → 401; missing permission → 403; missing tenant scope (cross-tenant id) → 404.

---

## 35. DevTools console & network health

| #    | What to Check                                                                                                                     | Expected Result | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 35.1 | Full run of this spec produces **zero uncaught exceptions** in Console.                                                           | No red errors.  |           |
| 35.2 | Allowed warnings: none from React hydration (no mismatches).                                                                      | Correct.        |           |
| 35.3 | 4xx responses expected only from explicit permission-denied checks (§5.5, §33). No stray 403s.                                    | Correct.        |           |
| 35.4 | 5xx responses: **zero tolerance**. A single 500 is a release blocker.                                                             | Correct.        |           |
| 35.5 | Polling: the People module does NOT poll. Confirm no repeat requests fire after initial load on any page (except filter changes). | No polling.     |           |
| 35.6 | Rate-limit headers: each response has `x-ratelimit-remaining` > 0. The People endpoints are on the standard tier.                 | Correct.        |           |
| 35.7 | No request exposes secrets (no API keys, JWTs, bank plaintext) in request URL or body.                                            | Confirmed.      |           |

---

## 36. Data invariants — SQL / API post-conditions

Run these after each noted flow. These catch silent data corruption that UI-only checks are blind to. The integration spec turns each into a machine-executable test; the admin tester records Pass/Fail alongside the UI row.

### 36.1 Create student

| #      | What to Check                                                           | Query / Result                                                                                                                                                                                             | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.1.1 | After §6.4: the new student row has `tenant_id=<current>`.              | `SELECT tenant_id FROM students WHERE id=<newId>` = session tenant.                                                                                                                                        |           |
| 36.1.2 | `student_number` matches the household_number-derived format.           | `SELECT student_number, household_id FROM students WHERE id=<newId>` then `SELECT household_number FROM households WHERE id=<household_id>`. student_number should start with the household_number prefix. |           |
| 36.1.3 | `full_name` and `full_name_ar` are computed.                            | Non-null if first_name + last_name were provided.                                                                                                                                                          |           |
| 36.1.4 | If `parent_links` were provided, matching `student_parents` rows exist. | `SELECT COUNT(*) FROM student_parents WHERE student_id=<newId>` = count of provided links.                                                                                                                 |           |

### 36.2 Update student status

| #      | What to Check                                                                                                 | Query / Result                                                                             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 36.2.1 | After withdraw: `student.status='withdrawn'`, `exit_date=<today>`.                                            | SQL matches.                                                                               |           |
| 36.2.2 | Active class_enrolments dropped.                                                                              | `SELECT COUNT(*) FROM class_enrolments WHERE student_id=? AND status='active'` = 0.        |           |
| 36.2.3 | After graduate: status=graduated, exit_date=today. Enrolments NOT dropped.                                    | `SELECT status FROM class_enrolments WHERE student_id=? AND status='active'` returns rows. |           |
| 36.2.4 | Audit log: a row exists with `action='status_change'` and `before.status='active', after.status='withdrawn'`. | Row present.                                                                               |           |

### 36.3 Create household

| #      | What to Check                                                             | Query / Result                                                            | Pass/Fail |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 36.3.1 | `household_number` matches `^[A-Z]{3}\d{3}$`. Unique within tenant.       | Format + uniqueness.                                                      |           |
| 36.3.2 | Emergency contact count = payload count.                                  | `SELECT COUNT(*) FROM household_emergency_contacts WHERE household_id=?`. |           |
| 36.3.3 | `needs_completion=true` immediately after create (no billing parent yet). | Correct.                                                                  |           |

### 36.4 Merge

| #      | What to Check                                                                        | Query / Result                                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------- |
| 36.4.1 | Post-merge: source.status=archived.                                                  | Correct.                                                         |           |
| 36.4.2 | All source students now have `household_id=<target>`.                                | `SELECT COUNT(*) FROM students WHERE household_id=<source>` = 0. |           |
| 36.4.3 | Target parent count = (source parents + target parents − overlap).                   | Count matches.                                                   |           |
| 36.4.4 | Target emergency contact count ≤ 3.                                                  | Count ≤ 3.                                                       |           |
| 36.4.5 | `preview:household:{source}` and `preview:household:{target}` both cleared in Redis. | Both missing.                                                    |           |

### 36.5 Split

| #      | What to Check                                              | Query / Result | Pass/Fail |
| ------ | ---------------------------------------------------------- | -------------- | --------- |
| 36.5.1 | New household created with correct tenant_id.              | Correct.       |           |
| 36.5.2 | Selected students moved. Non-selected stay.                | Counts match.  |           |
| 36.5.3 | New household emergency contacts count ≥ 1 (Zod enforces). | ≥ 1.           |           |

### 36.6 Emergency contact CRUD

| #      | What to Check            | Query / Result | Pass/Fail |
| ------ | ------------------------ | -------------- | --------- |
| 36.6.1 | After add, count ≤ 3.    | Check.         |           |
| 36.6.2 | After delete, count ≥ 1. | Check.         |           |

### 36.7 Set billing parent

| #      | What to Check                                            | Query / Result | Pass/Fail |
| ------ | -------------------------------------------------------- | -------------- | --------- |
| 36.7.1 | `household.primary_billing_parent_id` = selected parent. | Correct.       |           |
| 36.7.2 | `needs_completion` recalculated (false if contacts ≥ 1). | Correct.       |           |

### 36.8 Create parent

| #      | What to Check                                                                  | Query / Result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | -------------- | --------- |
| 36.8.1 | `parents.tenant_id` = session.                                                 | Correct.       |           |
| 36.8.2 | If email matches an existing `users` row, `parents.user_id` is set; else null. | Correct.       |           |
| 36.8.3 | If `household_id` in payload, `household_parents` row exists.                  | Correct.       |           |

### 36.9 Create staff

| #      | What to Check                                                                                                                                     | Query / Result                                                                                                                | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.9.1 | `staff_profiles.tenant_id` = session.                                                                                                             | Correct.                                                                                                                      |           |
| 36.9.2 | If email is new, a new `users` row exists (platform-level).                                                                                       | Row present.                                                                                                                  |           |
| 36.9.3 | `tenant_memberships` row exists for this user + tenant with `membership_status='active'`.                                                         | Present.                                                                                                                      |           |
| 36.9.4 | `membership_roles` row exists linking membership → role.                                                                                          | Present.                                                                                                                      |           |
| 36.9.5 | `staff_number` matches `^[A-Z]{3}\d{4}-\d$`. Unique within tenant.                                                                                | Correct.                                                                                                                      |           |
| 36.9.6 | If bank fields provided: encrypted values in DB; `bank_account_number_encrypted` contains non-printable / versioned bytes (NOT plaintext digits). | `SELECT CAST(bank_account_number_encrypted AS TEXT) FROM staff_profiles WHERE id=?` — no plaintext substring of the original. |           |

### 36.10 Encrypted-field round-trip

| #       | What to Check                                                                                             | Query / Result | Pass/Fail |
| ------- | --------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 36.10.1 | `GET /v1/staff-profiles/{id}/bank-details` response carries masked values. Raw SELECT returns ciphertext. | Correct.       |           |
| 36.10.2 | Decrypt → re-encrypt via the service produces stable plaintext across reads.                              | Stable.        |           |

---

## 37. Observations spotted during the walkthrough

The following behaviours surfaced during the code review + walkthrough. Each is a candidate for a follow-up fix sweep; none are silently fixed in this pass.

| ID  | Severity              | Area                               | Observation                                                                                                                                                                                                                                                                                                         | Evidence (file:line)                                                  |
| --- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A   | P3 (UX)               | Students list search               | Search does NOT match `first_name_ar` / `last_name_ar` / `full_name_ar` — Arabic users searching in Arabic see no results for a student whose English transliteration doesn't contain the query.                                                                                                                    | `students.service.ts:283-287`                                         |
| B   | P3 (UX)               | Students list sort                 | Backend supports `sort` + `order` query params but the DataTable component does not expose sortable column headers. Users can only sort by last_name ASC.                                                                                                                                                           | `students.service.ts:290-294` and list page code                      |
| C   | P2 (reliability)      | Students list error                | Network failure on `GET /v1/students` shows no toast — the fetch fails silently and the list stays empty. Users cannot distinguish "tenant has no students" from "the API is down".                                                                                                                                 | Students page useEffect error handler (silent catch or missing toast) |
| D   | P3 (data consistency) | Student re-activation              | When a withdrawn student is re-activated, `exit_date` is NOT cleared and dropped class enrolments are NOT restored. Re-activation leaves the student in an inconsistent state vs. a true active student.                                                                                                            | `students.service.ts:487-521`                                         |
| E   | P3 (UX)               | Staff list search                  | Search matches `user.first_name`, `user.last_name` but NOT `user.email`, `staff_number`, `job_title`, or `department`. Users frequently search by staff number — this will miss.                                                                                                                                    | `staff-profiles.service.ts:289-296`                                   |
| F   | P2 (UX)               | Staff bank tab                     | The Bank Details tab is rendered for all admin-tier users, but the `payroll.view_bank_details` permission is only held by `school_owner` and `school_principal`. Admins and accounting see the tab, click it, and get a 403 / "Permission denied" toast. The tab should be hidden if the user lacks the permission. | Staff detail page tab render                                          |
| G   | P3 (UX)               | Staff edit page                    | Bank fields render on the CREATE page (`showBankDetails=true`) but NOT on the EDIT page (`showBankDetails=false`). Users cannot update bank details after the initial create — they'd have to delete & recreate the staff. The backend supports the update via PATCH.                                               | Staff edit page + staff-form component                                |
| H   | P2 (consistency)      | Staff deactivation                 | Setting `employment_status=inactive` on a staff profile does NOT revoke the user's `tenant_membership` or assigned role — the user can still log in and act with their role's permissions. If "inactive staff" is meant to block login, an additional service hook is needed.                                       | `staff-profiles.service.ts:423-489`                                   |
| I   | P3 (UX)               | Households list                    | No "New Household" button in the list header. The create flow exists at `/households/new` but users must know the URL or navigate via a dashboard quick-action.                                                                                                                                                     | Households list page                                                  |
| J   | P3 (UX)               | Household guardians                | The Guardians tab does not expose an "Unlink" / "Remove Guardian" button in the UI. The backend supports `DELETE /households/:id/parents/:parentId` but the only way to remove a guardian is via Merge/Split — confusing workflow.                                                                                  | Household detail Guardians tab                                        |
| K   | P3 (design)           | Household split                    | Split permits an empty split (0 students, 0 parents) — creates a phantom household. UI should block or warn when no entities are selected.                                                                                                                                                                          | `households-structural.service.ts:210-338`                            |
| L   | P3 (UX)               | Parent detail                      | The parent detail page has no direct Edit affordance. Editing happens from the household's Guardians tab. Users landing directly on `/parents/{id}` (via search or email link) cannot edit from there.                                                                                                              | `parents/[id]/page.tsx`                                               |
| M   | P2 (data)             | Student number on household change | When a student's `household_id` is changed via edit, `student_number` stays as the old-household-derived format. The number now mismatches the current household. Intentional (for historical traceability) or a bug? — decide.                                                                                     | `students.service.ts:407-445`                                         |
| N   | P3 (UX)               | Parent create validation           | Parent create allows creating with no email and no phone (both are optional at the schema level). A contactless parent is unusable. Product may want `.refine` rejecting this combination.                                                                                                                          | `parent.schema.ts:4-31`                                               |
| O   | P3 (data)             | Allergy filter on list             | The `has_allergy=false` list filter returns students with `has_allergy=false` in the DB — including those without a health-data consent record. The allergy REPORT page gates on consent but the list page does NOT. Mixed signal.                                                                                  | `students.service.ts:279-281` vs `allergyReport` lines 688-745        |
| P   | P3 (UX)               | Household number preview           | `GET /v1/households/next-number` is exposed but the New Household form may not call it (confirm during walkthrough). If unused, the endpoint is dead code.                                                                                                                                                          | `households.controller.ts:96-100`                                     |
| Q   | P2 (security)         | Staff profile race                 | In `create()`, the 5-retry loop on `staff_number` collision uses `findFirst` then `create` — a classic TOCTOU. Two concurrent creates could theoretically get the same number, rejected only by the unique index. Fine, but noisy logs. Flag as low-priority.                                                       | `staff-profiles.service.ts:134-141`                                   |
| R   | P3 (design)           | Household status transitions       | `/v1/households/:id/status` accepts any of active/inactive/archived without state-machine validation. A household can go directly from archived back to active — which could revive a merge's source. Intentional?                                                                                                  | `households-crud.service.ts:320-344`                                  |

All findings are **candidate fixes**, not silent changes. The user decides which to include in a follow-up sweep (see `RELEASE-READINESS.md`, "Observations & findings" section).

---

## 38. Sign-off

| Section                          | Reviewer | Date | Pass Count | Fail Count | Blocker? | Notes |
| -------------------------------- | -------- | ---- | ---------- | ---------- | -------- | ----- |
| 1. Prerequisites                 |          |      |            |            |          |       |
| 2. Out of scope (informational)  | n/a      | n/a  | n/a        | n/a        | no       |       |
| 3. People hub + sub-strip        |          |      |            |            |          |       |
| 4. Students list                 |          |      |            |            |          |       |
| 5. Students export               |          |      |            |            |          |       |
| 6. New student                   |          |      |            |            |          |       |
| 7. Student detail                |          |      |            |            |          |       |
| 8. Edit student                  |          |      |            |            |          |       |
| 9. Status transitions            |          |      |            |            |          |       |
| 10. Allergy report               |          |      |            |            |          |       |
| 11. Staff list                   |          |      |            |            |          |       |
| 12. Staff export                 |          |      |            |            |          |       |
| 13. New staff                    |          |      |            |            |          |       |
| 14. Staff detail                 |          |      |            |            |          |       |
| 15. Bank details tab             |          |      |            |            |          |       |
| 16. Edit staff                   |          |      |            |            |          |       |
| 17. Households list              |          |      |            |            |          |       |
| 18. New household                |          |      |            |            |          |       |
| 19. Household header + metrics   |          |      |            |            |          |       |
| 20. Household overview           |          |      |            |            |          |       |
| 21. Household students tab       |          |      |            |            |          |       |
| 22. Household guardians          |          |      |            |            |          |       |
| 23. Household emergency contacts |          |      |            |            |          |       |
| 24. Household finance tab        |          |      |            |            |          |       |
| 25. Edit household               |          |      |            |            |          |       |
| 26. Merge                        |          |      |            |            |          |       |
| 27. Split                        |          |      |            |            |          |       |
| 28. Needs-completion banner      |          |      |            |            |          |       |
| 29. Parent detail                |          |      |            |            |          |       |
| 30. Cross-entity navigation      |          |      |            |            |          |       |
| 31. Sensitive-data audit         |          |      |            |            |          |       |
| 32. Arabic / RTL                 |          |      |            |            |          |       |
| 33. Cross-tenant hostile checks  |          |      |            |            |          |       |
| 34. Endpoint map (informational) | n/a      | n/a  | n/a        | n/a        | no       |       |
| 35. Console & network health     |          |      |            |            |          |       |
| 36. Data invariants              |          |      |            |            |          |       |
| 37. Observations (informational) | n/a      | n/a  | n/a        | n/a        | no       |       |

**Spec release-ready for this role when:**

- Every non-informational row in the table above is signed off at **Pass**, AND
- Zero rows in §33 (cross-tenant hostile checks) are Fail, AND
- Zero rows in §36 (data invariants) are Fail, AND
- Any P0 / P1 observations in §37 have been resolved or explicitly accepted as known issues.

---

**End of Admin Spec.**
