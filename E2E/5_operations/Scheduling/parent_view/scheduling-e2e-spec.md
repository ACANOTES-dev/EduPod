# E2E Test Specification: Scheduling — Parent View

> **Coverage:** This document covers the entire Scheduling module **as visible (and as deliberately invisible) to the Parent role** in a multi-tenant school SaaS. Parents have effectively zero administrative or operational scheduling access. Their only legitimate touchpoint with the Scheduling module is the **published timetable of each child they are linked to as a guardian**, surfaced via a dedicated "My Children's Timetable" view and via a calendar widget on the parent dashboard.
>
> **Pages and surfaces documented here:**
>
> - `/{locale}/parent` — Parent dashboard (calendar widget showing today's lessons for each child)
> - `/{locale}/parent/timetable` — Parent timetable view (one tab per linked child)
> - `/{locale}/parent/students/[studentId]/timetable` — Per-child timetable deep link
> - `/{locale}/parent/students/[studentId]` — Child profile (timetable card on summary tab)
> - **Negative coverage** for every admin scheduling route (`/scheduling/*`, `/timetables`, `/schedules`) — parent must NEVER reach these
> - **Negative coverage** for every admin scheduling API endpoint — must return 403 / 404
> - **Cross-family** coverage — parent of child A must NEVER see child B's timetable
> - **Cross-tenant** coverage — `nhqs` parent must NEVER fetch any `stress-a` data
>
> **Total Pages-In-Scope:** 4 (allowed) + ~30 (denied)
> **Total APIs-In-Scope (allowed):** 1 (`GET /v1/timetables/student/:studentId`) + child resolution endpoints
> **Total APIs-In-Scope (denied):** ~120 admin scheduling endpoints

**Base URL:** `https://nhqs.edupod.app`
**Primary login:** **Zainab Ali** (`parent.single@nhqs.test` / `Password123!`) — Parent linked to ONE child (Adam Moore, Year 7).
**Secondary login:** **Fatima Hassan** (`parent.multi@nhqs.test` / `Password123!`) — Parent linked to TWO children (Layla Hassan Y9, Omar Hassan Y4).
**Cross-tenant probe login:** **Test-A Parent** (`parent@stress-a.test` / `StressTest2026!`) — Parent in tenant `stress-a`, used to confirm cross-tenant denial.
**Locales under test:** English (`en`) and Arabic (`ar`) — RTL must be visually correct.
**Navigation path to start:** Click avatar → **Dashboard** is the default landing for the parent role.

**Parent role permissions in this module:**

The parent role has **NO `schedule.*` permission whatsoever** in the permission registry. Their access to a child's timetable is granted IMPLICITLY by the existence of an `active` row in `guardian_links` linking `parent_user_id = self.user_id` to `student_id = child.student_id`, AND by `student.tenant_id = current_tenant_id`. Both conditions must hold simultaneously. The check lives in `TimetablesService.getStudentTimetable()` (called by `GET /v1/timetables/student/:studentId`).

**Permissions referenced (admin permissions that MUST be denied for parent):**

- `schedule.manage` — DENY
- `schedule.run_auto`, `schedule.apply_auto`, `schedule.view_auto_reports` — DENY
- `schedule.configure_requirements`, `schedule.configure_availability` — DENY
- `schedule.pin_entries` — DENY
- `schedule.manage_substitutions`, `schedule.report_own_absence`, `schedule.respond_to_offer` — DENY
- `schedule.view_reports`, `schedule.view_own`, `schedule.view_own_satisfaction` — DENY
- `schedule.manage_exams`, `schedule.manage_scenarios` — DENY
- `students.view` — DENY (parent uses guardian-link path, not the admin students.view path)

---

## Spec Pack Context

This document is the **parent UI leg (leg 1d)** of the `/e2e-full` release-readiness pack for the Scheduling module. The full pack includes four sibling legs that together target 99.99% release-readiness:

| Leg | Spec document                                    | Executor                       |
| --- | ------------------------------------------------ | ------------------------------ |
| 1a  | `admin_view/scheduling-e2e-spec.md`              | QC engineer + Playwright       |
| 1b  | `teacher_view/scheduling-e2e-spec.md`            | QC engineer + Playwright       |
| 1c  | `student_view/scheduling-e2e-spec.md`            | QC engineer + Playwright       |
| 1d  | `parent_view/scheduling-e2e-spec.md` (this file) | QC engineer + Playwright       |
| 2   | `integration/scheduling-integration-spec.md`     | Jest / Supertest harness       |
| 3   | `worker/scheduling-worker-spec.md`               | Jest + BullMQ / k6             |
| 4   | `perf/scheduling-perf-spec.md`                   | k6 / Artillery / Lighthouse    |
| 5   | `security/scheduling-security-spec.md`           | Security engineer / pen-tester |

A tester who runs ONLY this spec validates that the parent's read-only view of their children's timetable works AND that no admin scheduling surface leaks to the parent role. They are NOT running RLS leakage matrices for non-UI surfaces (covered in `/e2e-integration`).

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

A single-tenant single-child run is insufficient. This spec exercises:

1. The single-child happy path
2. The multi-child switcher
3. Cross-family isolation (parent guessing other parents' children's IDs)
4. Cross-tenant isolation (parent in tenant A guessing tenant B child IDs)
5. RTL bilingual layout

### Tenants

| Slug       | Currency | Hostname                      | Timetable state                                                                                | Locale split  |
| ---------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------- |
| `nhqs`     | GBP      | `https://nhqs.edupod.app`     | Published timetable for Y4, Y7, Y9, Y11. **Y2 has NO published timetable** (empty-state probe) | EN + heavy AR |
| `stress-a` | GBP      | `https://stress-a.edupod.app` | Published timetable for all year groups                                                        | EN            |

The `nhqs` tenant is heavy AR — Arabic parents are the dominant persona at NHQS. The `stress-a` tenant is purely the cross-tenant hostile probe.

### Users required (5 total)

| Tenant     | Role   | Name            | Login email                | Password          | Linked children                                        |
| ---------- | ------ | --------------- | -------------------------- | ----------------- | ------------------------------------------------------ |
| `nhqs`     | parent | Zainab Ali      | `parent.single@nhqs.test`  | `Password123!`    | Adam Moore (Y7, class 7B)                              |
| `nhqs`     | parent | Fatima Hassan   | `parent.multi@nhqs.test`   | `Password123!`    | Layla Hassan (Y9, 9C); Omar Hassan (Y4, 4A)            |
| `nhqs`     | parent | Khadija Ibrahim | `parent.empty@nhqs.test`   | `Password123!`    | Yusra Ibrahim (Y2 — class with NO published timetable) |
| `nhqs`     | parent | Hostile Parent  | `parent.hostile@nhqs.test` | `Password123!`    | One unrelated child (used for ID-guessing probes)      |
| `stress-a` | parent | Test-A Parent   | `parent@stress-a.test`     | `StressTest2026!` | Test-A child                                           |

### Seed data invariants

| Entity                                       | nhqs                                      | stress-a |
| -------------------------------------------- | ----------------------------------------- | -------- |
| Active `guardian_links` per parent           | 1 / 2 / 1 / 1 (per the four nhqs parents) | 1        |
| `archived` `guardian_links` (must be hidden) | 1 (Zainab → ex-stepchild, archived 2025)  | 0        |
| Year groups with published timetable         | Y4, Y7, Y9, Y11                           | All      |
| Year group WITHOUT timetable (empty state)   | Y2                                        | n/a      |
| Total `schedule` rows for tenant             | ≥ 200                                     | ≥ 100    |

### Hostile-pair assertions (enforce during execution)

The tester MUST execute these probes at least once during the run (captured in §9 below):

1. As Zainab (parent of Adam Y7, `nhqs`), `GET /api/v1/timetables/student/{layla_student_id}` → expected **404** (Layla is not Zainab's child).
2. As Zainab, `GET /api/v1/timetables/student/{stress_a_child_id}` → expected **404** (cross-tenant).
3. As Zainab, `GET /api/v1/timetables/student/{archived_link_student_id}` → expected **404** (link archived).
4. As Zainab, navigate UI to `/{locale}/parent/students/{layla_student_id}/timetable` → expected **404 page or redirect to /parent**, NEVER 200 with Layla's data.
5. As Zainab, attempt `GET /api/v1/scheduling/runs` → expected **403** (`schedule.view_auto_reports` denied).
6. As Zainab, attempt `GET /api/v1/scheduling/timetable/my` → expected **403** (`schedule.view_own` denied — that endpoint is for staff).
7. As Zainab, attempt `GET /api/v1/scheduling/dashboard/overview` → expected **403**.
8. As Zainab, attempt `GET /api/v1/scheduling/teacher-competencies` → expected **403**.

### Environment flags

- RLS must be `FORCE ROW LEVEL SECURITY` on all 22 scheduling tables (per `.inventory-backend.md`).
- The `users` table is the ONE platform-level table without `tenant_id` — all guardian_link / student joins MUST flow through tenant-scoped tables.
- Locale switcher must be reachable (avatar menu → Language).

---

## Out of Scope for This Spec

This spec exercises the UI-visible surface of the Scheduling module **as a parent**. It does NOT cover:

- Admin scheduling shells, run review, dashboards — `admin_view/scheduling-e2e-spec.md`
- Teacher self-service (`/scheduling/my-timetable`, absences, offers) — `teacher_view/scheduling-e2e-spec.md`
- Student self-service timetable view — `student_view/scheduling-e2e-spec.md`
- Full RLS matrix across every endpoint × every role × every sibling tenant — `integration/scheduling-integration-spec.md`
- BullMQ solver job, stale-reaper cron, CP-SAT sidecar — `worker/scheduling-worker-spec.md`
- Performance, p95/p99, large-tenant timetable load — `perf/scheduling-perf-spec.md`
- Security hardening (OWASP, IDOR fuzz, JWT replay, calendar-token forgery) — `security/scheduling-security-spec.md`
- Calendar `.ics` subscription tokens — parents do NOT receive a calendar token in the current product (deferred); any `.ics` access by parent is out of scope here

---

## Table of Contents

1. [Permission Matrix — Parent Role](#1-permission-matrix--parent-role)
2. [Parent Dashboard — Calendar Widget](#2-parent-dashboard--calendar-widget)
3. [Parent Timetable Page — Single Child](#3-parent-timetable-page--single-child)
4. [Parent Timetable Page — Multiple Children](#4-parent-timetable-page--multiple-children)
5. [Lesson Card Anatomy](#5-lesson-card-anatomy)
6. [Empty State — Child Class With No Published Timetable](#6-empty-state--child-class-with-no-published-timetable)
7. [Bilingual EN/AR + RTL](#7-bilingual-enar--rtl)
8. [Mobile (375px)](#8-mobile-375px)
9. [Hidden Navigation — No Scheduling Admin Items](#9-hidden-navigation--no-scheduling-admin-items)
10. [Direct URL Access Denial — Admin Scheduling Routes](#10-direct-url-access-denial--admin-scheduling-routes)
11. [API Permission Denial — Admin Scheduling Endpoints](#11-api-permission-denial--admin-scheduling-endpoints)
12. [Cross-Family RLS — Parent Cannot See Other Parents' Children](#12-cross-family-rls--parent-cannot-see-other-parents-children)
13. [Cross-Tenant RLS — nhqs Parent Cannot See stress-a Data](#13-cross-tenant-rls--nhqs-parent-cannot-see-stress-a-data)
14. [Cross-Cutting — Console / Network / Dark Mode / Theme](#14-cross-cutting--console--network--dark-mode--theme)
15. [Data Invariants](#15-data-invariants)
16. [Observations and Bugs Spotted](#16-observations-and-bugs-spotted)
17. [Sign-off](#17-sign-off)

---

## 1. Permission Matrix — Parent Role

This section enumerates **every** scheduling-namespace permission and confirms that parents hold none. The matrix doubles as the contract for §11 (API denial) and §10 (route denial).

| #         | Permission                            | Tier            | Parent grant  | Expected on call               | Actual | Pass/Fail |
| --------- | ------------------------------------- | --------------- | ------------- | ------------------------------ | ------ | --------- |
| SCH-P-001 | `schedule.manage`                     | Admin           | NEVER         | 403 on every gated endpoint    |        |           |
| SCH-P-002 | `schedule.run_auto`                   | Auto            | NEVER         | 403                            |        |           |
| SCH-P-003 | `schedule.apply_auto`                 | Auto            | NEVER         | 403                            |        |           |
| SCH-P-004 | `schedule.view_auto_reports`          | Auto            | NEVER         | 403                            |        |           |
| SCH-P-005 | `schedule.configure_requirements`     | Config          | NEVER         | 403                            |        |           |
| SCH-P-006 | `schedule.configure_availability`     | Config          | NEVER         | 403                            |        |           |
| SCH-P-007 | `schedule.pin_entries`                | Config          | NEVER         | 403                            |        |           |
| SCH-P-008 | `schedule.manage_substitutions`       | Substitution    | NEVER         | 403                            |        |           |
| SCH-P-009 | `schedule.report_own_absence`         | Substitution    | NEVER         | 403                            |        |           |
| SCH-P-010 | `schedule.respond_to_offer`           | Substitution    | NEVER         | 403                            |        |           |
| SCH-P-011 | `schedule.view_reports`               | Viewing         | NEVER         | 403                            |        |           |
| SCH-P-012 | `schedule.view_own`                   | Viewing (staff) | NEVER         | 403                            |        |           |
| SCH-P-013 | `schedule.view_own_satisfaction`      | Viewing (staff) | NEVER         | 403                            |        |           |
| SCH-P-014 | `schedule.manage_exams`               | Exam            | NEVER         | 403                            |        |           |
| SCH-P-015 | `schedule.manage_scenarios`           | Scenario        | NEVER         | 403                            |        |           |
| SCH-P-016 | `students.view`                       | Admin students  | NEVER         | 403                            |        |           |
| SCH-P-017 | (Implicit) guardian-link to own child | Implicit        | YES (per row) | 200 with own child's data only |        |           |

**Acceptance:** rows SCH-P-001 through SCH-P-016 must be DENY; row SCH-P-017 must be ALLOW exclusively for guardian-linked, same-tenant, non-archived children.

---

## 2. Parent Dashboard — Calendar Widget

**URL:** `/en/parent` (and `/ar/parent`)
**Login:** Zainab Ali (single-child parent).
**Requires:** authenticated parent role.

The parent dashboard MUST surface today's (and the upcoming week's) lessons for each linked child as a calendar widget. This is the lightweight at-a-glance surface; the full week grid is at `/parent/timetable` (Section 3).

| #         | Page / Endpoint                               | Action                                                | Expected                                                                                                                                                                                                                                           | Actual | Pass/Fail |
| --------- | --------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-018 | `/en/parent`                                  | Load page as Zainab                                   | Page renders without error; morph bar shows parent hubs (NOT scheduling admin); a card / widget titled **"Today's Lessons"** (or equivalent translated key) is present, scoped to Adam Moore.                                                      |        |           |
| SCH-P-019 | `/en/parent`                                  | Inspect network tab on dashboard load                 | Exactly one call: `GET /api/v1/timetables/student/{adam_id}?week_date=YYYY-MM-DD` returns **200**. NO call to `/api/v1/scheduling/dashboard/*`, `/api/v1/scheduling-runs/*`, `/api/v1/scheduling/teacher-config`, or any admin scheduling URL.     |        |           |
| SCH-P-020 | Dashboard widget                              | Inspect today's lesson card (e.g., first period)      | Shows subject (in current locale), teacher initials or full name, room code, start–end time. Time is in 24h or locale-appropriate format. Western numerals (0–9) used in BOTH `en` AND `ar` per repo convention.                                   |        |           |
| SCH-P-021 | Dashboard widget                              | Click on a lesson card                                | Either (a) a tooltip / popover with details, OR (b) navigation to `/parent/timetable?student={adam_id}&week=YYYY-MM-DD`. Either is acceptable; verify the chosen behaviour is consistent across cards.                                             |        |           |
| SCH-P-022 | Dashboard widget                              | Hover/click "View full timetable" link                | Navigates to `/en/parent/timetable` with Adam pre-selected.                                                                                                                                                                                        |        |           |
| SCH-P-023 | Dashboard widget — multi-child (login Fatima) | Reload as Fatima Hassan                               | Widget shows **two stacked sections** OR a per-child tab strip: one for Layla, one for Omar. Both load via two separate `GET /api/v1/timetables/student/:id` calls.                                                                                |        |           |
| SCH-P-024 | Dashboard widget — empty case (login Khadija) | Reload as Khadija Ibrahim                             | Widget renders in EMPTY STATE (Yusra's class has no published timetable). A friendly message ("No timetable published yet for Yusra Ibrahim's class — please contact the school office.") shows in the user's locale. NO 500. NO infinite spinner. |        |           |
| SCH-P-025 | Dashboard widget — archived link              | Confirm Zainab does NOT see her archived ex-stepchild | The widget shows ONLY Adam. The archived guardian_link row is silently filtered out at the API layer. No reference to the archived child appears in DOM.                                                                                           |        |           |
| SCH-P-026 | Loading state                                 | Throttle network to "Slow 3G", reload                 | Skeleton placeholder appears (matches design tokens — no raw `bg-gray-200`). No flash of "0 lessons".                                                                                                                                              |        |           |
| SCH-P-027 | Error state                                   | In DevTools, block `**/timetables/student/**`, reload | Widget shows a non-crashing error card with retry affordance. Toast (if user-triggered retry) shows error code. NO empty `catch {}` swallow.                                                                                                       |        |           |

---

## 3. Parent Timetable Page — Single Child

**URL:** `/en/parent/timetable`
**Login:** Zainab Ali.
**Requires:** authenticated parent with at least one active guardian_link in current tenant.

| #         | Page / Endpoint            | Action                                                                                | Expected                                                                                                                                                                                                                                               | Actual | Pass/Fail |
| --------- | -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-P-028 | `/en/parent/timetable`     | Navigate from dashboard via "View full timetable"                                     | URL is `/en/parent/timetable` (no query param required — single child auto-selected). Page header reads **"Adam Moore — Year 7 / 7B"** or equivalent.                                                                                                  |        |           |
| SCH-P-029 | `/en/parent/timetable`     | Inspect API call                                                                      | `GET /api/v1/timetables/student/{adam_id}?academic_year_id={current_year_id}&week_start=YYYY-MM-DD` returns 200 with `data: { weekday: [...periods], ... }` shape OR similar grid shape from `TimetablesService.getStudentTimetable()`.                |        |           |
| SCH-P-030 | Grid layout                | Inspect grid                                                                          | A timetable grid is rendered: rows = period order (1, 2, 3, ...), cols = weekdays Mon–Fri (or Sun–Thu for nhqs school week, per tenant config). Time labels in start cell of each row.                                                                 |        |           |
| SCH-P-031 | Empty period               | Locate a period that is a break or free                                               | Cell shows "Break" / "Free" / a neutral placeholder, NOT a blank cell with no semantics. Break group label (if applicable) shows in the user's locale.                                                                                                 |        |           |
| SCH-P-032 | Week navigation            | Click "Next week"                                                                     | URL updates with `?week_start=YYYY-MM-DD` (next Monday/Sunday). New API call fires with new week_date. Grid re-renders with the new week's data. NO full page reload.                                                                                  |        |           |
| SCH-P-033 | Week navigation            | Click "Previous week"                                                                 | URL updates back. Grid renders previous week's data.                                                                                                                                                                                                   |        |           |
| SCH-P-034 | Week navigation — boundary | Navigate beyond academic year start                                                   | Either (a) next-week button is disabled at boundary, or (b) API returns empty grid with a "No data for this week" notice. Either is acceptable; no crash.                                                                                              |        |           |
| SCH-P-035 | Today indicator            | Inspect today's column                                                                | A visual highlight (background tint, "TODAY" pill, or border accent) marks the current weekday column. Tint comes from a design token, not a hex literal.                                                                                              |        |           |
| SCH-P-036 | Current period indicator   | If during school hours, inspect current period row                                    | The active period cell is visually distinguished. If outside school hours, no current-period highlight is shown.                                                                                                                                       |        |           |
| SCH-P-037 | Read-only enforcement      | Try to interact with a lesson cell — right-click, attempt drag, double-click          | NO edit affordance, NO context menu with "Move", "Pin", "Edit". The cell is fully read-only. No PinToggle component is rendered.                                                                                                                       |        |           |
| SCH-P-038 | Read-only enforcement      | Inspect DOM for any `<button>` labelled "Edit", "Pin", "Move", "Delete", "Add lesson" | No such buttons exist anywhere in the timetable region.                                                                                                                                                                                                |        |           |
| SCH-P-039 | Read-only enforcement      | Inspect for any `<a>` to `/scheduling/*`, `/schedules/*`, `/timetables/*` (admin)     | No such links exist.                                                                                                                                                                                                                                   |        |           |
| SCH-P-040 | Substitution overlay       | If today has a substitute teacher for one of Adam's lessons, inspect that cell        | Cell shows the SUBSTITUTE teacher's name (per `SubstitutionRecord`), with a small badge ("Sub" / "بديل"). Original teacher name may appear struck-through or in tooltip. No internal admin metadata leaks (e.g., absence reason, cancellation_reason). |        |           |
| SCH-P-041 | Cancelled period           | If today has a cancelled period (emergency change), inspect cell                      | Cell shows "Cancelled" / "ملغاة" with a neutral or warning tint. Reason (if provided) is the public-facing reason only; no internal admin notes leak.                                                                                                  |        |           |
| SCH-P-042 | Print / export             | Click "Print" if exposed                                                              | Browser print dialog opens with timetable formatted for A4 / Letter. Header includes child name, week of, school name.                                                                                                                                 |        |           |
| SCH-P-043 | Print / export             | Inspect print-only routes                                                             | Parent can ONLY print own child's view. The admin print route `/(print)/timetables/rooms/[roomId]/print` returns 403 / redirect.                                                                                                                       |        |           |
| SCH-P-044 | Calendar subscription      | Look for ICS / calendar subscription button                                           | If exposed for parents (currently NOT in product per inventory), it must scope to one child. If NOT exposed, button is absent — no broken stub.                                                                                                        |        |           |
| SCH-P-045 | URL reflects state         | Bookmark current URL, log out, log back in, paste URL                                 | Returns to the same week & child. No 500. No silent week reset to current.                                                                                                                                                                             |        |           |
| SCH-P-046 | Browser back/forward       | Navigate next-week, next-week, then browser-back                                      | History stack respects week navigation. No double-render. No console error from React state mismatch.                                                                                                                                                  |        |           |

---

## 4. Parent Timetable Page — Multiple Children

**URL:** `/en/parent/timetable`
**Login:** Fatima Hassan (parent of Layla Y9 and Omar Y4).

| #         | Page / Endpoint                   | Action                                                                                             | Expected                                                                                                                                                                                                                                                  | Actual | Pass/Fail |
| --------- | --------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-047 | `/en/parent/timetable`            | Load as Fatima                                                                                     | A child switcher is visible at the top of the timetable view: either (a) a tab strip with two tabs **"Layla Hassan"** and **"Omar Hassan"**, OR (b) a dropdown selector. The first child (alphabetical, or oldest, or per design) is selected by default. |        |           |
| SCH-P-048 | Switcher — initial load           | Inspect network requests on first load                                                             | Either ONE call for the active child only, OR TWO parallel calls (one per child). Both are acceptable; verify the chosen pattern. NO N+1 problem (≤ 2 timetable calls total for two children).                                                            |        |           |
| SCH-P-049 | Switcher — switch tab             | Click "Omar Hassan" tab                                                                            | Active tab updates visually. URL reflects child selection (e.g., `?student={omar_id}`). New API call: `GET /api/v1/timetables/student/{omar_id}?...`. Grid re-renders with Omar's Y4 schedule.                                                            |        |           |
| SCH-P-050 | Switcher — distinct content       | Compare Layla (Y9) vs Omar (Y4) lessons                                                            | Subjects differ (Y4 has primary subjects; Y9 has secondary). Teacher names differ. Room codes likely differ.                                                                                                                                              |        |           |
| SCH-P-051 | Switcher — preserves week         | Navigate to "Next week" while viewing Layla, then switch to Omar                                   | Omar's tab shows the SAME week selection (next week), not reset to current week.                                                                                                                                                                          |        |           |
| SCH-P-052 | Switcher — keyboard accessibility | Tab through child switcher                                                                         | Focus ring visible (token-driven). Arrow keys cycle tabs. Enter activates. ARIA `role="tablist"` + `aria-selected`.                                                                                                                                       |        |           |
| SCH-P-053 | Deep link per-child               | Navigate directly to `/en/parent/students/{layla_id}/timetable`                                    | Loads Layla's timetable directly; switcher highlights Layla.                                                                                                                                                                                              |        |           |
| SCH-P-054 | Deep link to OTHER family's child | Navigate to `/en/parent/students/{adam_moore_id}/timetable` (Adam is Zainab's child, not Fatima's) | **404 page** OR redirect to `/parent/timetable` with a toast "You do not have access to that student". The page MUST NOT render any of Adam's data, even briefly. (See §12 for full cross-family RLS.)                                                    |        |           |
| SCH-P-055 | Switcher — no admin children      | Confirm switcher only shows linked children                                                        | The switcher MUST NOT show a "View all students" or "Pick another student" admin affordance. Only Layla and Omar are listed.                                                                                                                              |        |           |
| SCH-P-056 | Child profile — timetable card    | Navigate to `/en/parent/students/{layla_id}` (child profile summary)                               | Summary tab includes a small "Today's lessons" card scoped to Layla, with a "View full timetable" link to `/parent/students/{layla_id}/timetable`.                                                                                                        |        |           |

---

## 5. Lesson Card Anatomy

For every populated cell in the parent's grid, the following data must be visible (or accessible via tooltip on hover/tap):

| #         | Element                       | Source field                                                        | Expected                                                                                                                                       | Actual | Pass/Fail |
| --------- | ----------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-057 | Subject name                  | `schedule.subject.name` (localised)                                 | Shows in current locale; falls back to default name if no AR translation.                                                                      |        |           |
| SCH-P-058 | Teacher name                  | `schedule.teacher.first_name + last_name` (or formal title at NHQS) | Shows full name. Honorific (Mr/Ms/Sayyid) per tenant convention. NO email, NO phone, NO staff_profile_id leaks.                                |        |           |
| SCH-P-059 | Room                          | `schedule.room.code` or `schedule.room.name`                        | Shows the public room code. NO internal room_id. NO maintenance / closure metadata.                                                            |        |           |
| SCH-P-060 | Start–end time                | `period_template.start_time / end_time`                             | Format: `08:30 – 09:15` in EN; same in AR (Western numerals per repo convention).                                                              |        |           |
| SCH-P-061 | Period order / index          | `schedule.period_order`                                             | Optional — if shown, it's a small numeric pill (Period 1, Period 2). In AR: "الحصة 1" with Western numeral.                                    |        |           |
| SCH-P-062 | Substitute badge              | derived from `SubstitutionRecord` for that schedule + date          | If a confirmed sub is assigned for today's date, show "Sub" / "بديل" badge with the substitute teacher's name.                                 |        |           |
| SCH-P-063 | No leakage of internal fields | inspect DOM                                                         | NO rendered text containing: `tenant_id`, `staff_profile_id`, `is_pinned`, `pin_reason`, `source`, `scheduling_run_id`, `cancellation_reason`. |        |           |
| SCH-P-064 | No edit / drag handles        | inspect DOM                                                         | No `draggable="true"`, no resize handles, no `role="button"` on cells unless purely for tooltip-toggle.                                        |        |           |

---

## 6. Empty State — Child Class With No Published Timetable

**URL:** `/en/parent/timetable`
**Login:** Khadija Ibrahim (parent of Yusra in Y2 — Y2 has NO published timetable in `nhqs`).

| #         | Page / Endpoint                        | Action                                                      | Expected                                                                                                                                                                                                  | Actual | Pass/Fail |
| --------- | -------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-065 | `/en/parent/timetable` as Khadija      | Load page                                                   | Page loads in 200; empty-state illustration / icon + text "No timetable has been published for Yusra's class yet. Please check back later or contact the school office." in current locale. NO grid rows. |        |           |
| SCH-P-066 | API on empty case                      | Inspect API response                                        | `GET /api/v1/timetables/student/{yusra_id}` returns **200** with `data: []` (or grid of empty days). NOT 404 — the child exists, just no schedule rows.                                                   |        |           |
| SCH-P-067 | Empty state — locale parity            | Switch to AR                                                | Same empty-state message in Arabic. RTL layout maintained. Illustration mirrored or RTL-safe.                                                                                                             |        |           |
| SCH-P-068 | Empty state — no false positives       | Inspect dashboard widget for Khadija                        | Today's Lessons widget on dashboard ALSO shows empty state for Yusra, NOT a "0 lessons today" misleading number.                                                                                          |        |           |
| SCH-P-069 | Empty state — partially-published case | If a child's class has SOME days populated and others empty | Populated days render normally; empty days show "No lessons" inline within the day column.                                                                                                                |        |           |

---

## 7. Bilingual EN/AR + RTL

NHQS parents are heavy AR users — this section is non-negotiable.

| #         | Page / Endpoint                  | Action                                                                                                                                                  | Expected                                                                                                                                                                                                                  | Actual | Pass/Fail |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-070 | Locale switcher                  | Avatar → Language → Arabic                                                                                                                              | Page reloads at `/ar/parent/timetable`. `<html dir="rtl" lang="ar">`.                                                                                                                                                     |        |           |
| SCH-P-071 | RTL — grid direction             | Inspect timetable grid in AR                                                                                                                            | Weekday columns flow RIGHT-TO-LEFT (Sunday on the right edge for nhqs week, or as per tenant week-start). Time labels appear on the right edge of each row. CSS uses logical properties (`ps-`, `pe-`, `start-`, `end-`). |        |           |
| SCH-P-072 | RTL — no physical classes        | Grep DOM for `.ml-`, `.mr-`, `.pl-`, `.pr-`, `.left-`, `.right-`, `.text-left`, `.text-right`, `.rounded-l-`, `.rounded-r-`, `.border-l-`, `.border-r-` | ZERO instances inside the parent timetable subtree. Build-time lint should already enforce this; runtime grep is a belt-and-braces probe.                                                                                 |        |           |
| SCH-P-073 | RTL — chevrons                   | Inspect "next/previous week" chevron icons                                                                                                              | In AR, the "next" chevron points LEFT (because next is towards the start of the RTL flow). Implemented via `rtl:rotate-180` or icon swap.                                                                                 |        |           |
| SCH-P-074 | RTL — child tab strip            | Switch to AR with Fatima logged in                                                                                                                      | Tab strip flows RTL: first tab on the right edge. Active-tab underline / pill on correct edge.                                                                                                                            |        |           |
| SCH-P-075 | AR — translations present        | Inspect every visible string in the timetable subtree                                                                                                   | NO raw English fallback for translatable strings. NO `[object Object]`. NO `scheduling.timetable.heading` literal keys leaking through.                                                                                   |        |           |
| SCH-P-076 | AR — numerals                    | Inspect period numbers, times, dates                                                                                                                    | Western numerals (0–9) per repo convention. NO Eastern Arabic-Indic digits (٠١٢٣...) unless tenant explicitly opts in (NHQS does NOT).                                                                                    |        |           |
| SCH-P-077 | AR — calendar                    | Inspect date strings                                                                                                                                    | Gregorian calendar. Day-of-week names in Arabic (الأحد، الإثنين، ...). Month names in Arabic.                                                                                                                             |        |           |
| SCH-P-078 | LTR enforcement on mixed content | Inspect any embedded LTR content (e.g., room code "Lab-3", time "08:30")                                                                                | LTR content is wrapped (`<bdi>` or `dir="ltr"` span) so digits and codes don't visually scramble inside RTL flow.                                                                                                         |        |           |
| SCH-P-079 | Switch back to EN                | Avatar → Language → English                                                                                                                             | URL becomes `/en/parent/timetable`. `<html dir="ltr" lang="en">`. Layout flips back. No layout artefacts retained from RTL.                                                                                               |        |           |
| SCH-P-080 | AR — empty state                 | Khadija (empty class) in AR                                                                                                                             | Empty state message renders correctly in AR with proper RTL alignment.                                                                                                                                                    |        |           |
| SCH-P-081 | AR — substitute badge            | If a sub teacher exists for one of Adam's lessons, view in AR                                                                                           | Badge label is "بديل" (or tenant-defined translation), positioned per RTL layout.                                                                                                                                         |        |           |
| SCH-P-082 | AR — focus order                 | Tab through page in AR                                                                                                                                  | Logical tab order (header → switcher → week nav → grid). Focus ring on RTL side. No focus traps.                                                                                                                          |        |           |

---

## 8. Mobile (375px)

| #         | Page / Endpoint           | Action                                            | Expected                                                                                                                                                                                                                                                                                                                         | Actual | Pass/Fail |
| --------- | ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-083 | Resize to 375 × 812       | Open `/en/parent/timetable` on iPhone SE viewport | NO horizontal page scroll (no overflow at body level). Main content has `min-w-0 overflow-x-hidden`.                                                                                                                                                                                                                             |        |           |
| SCH-P-084 | Mobile — grid             | Inspect timetable grid                            | Either (a) full grid with internal `overflow-x-auto` (so user pans horizontally inside grid container — sticky time column on the start edge), OR (b) a stacked day-by-day card list (one card per day with its lessons listed). The chosen pattern must be consistent and usable. No raw 800px-wide grid forcing page overflow. |        |           |
| SCH-P-085 | Mobile — touch targets    | Tap "Next week" and tab switcher                  | Targets ≥ 44 × 44 px. No mis-taps.                                                                                                                                                                                                                                                                                               |        |           |
| SCH-P-086 | Mobile — child switcher   | Multi-child parent on mobile                      | Switcher works on small screens — either tab strip with `overflow-x-auto` and fade affordance, or full-width dropdown.                                                                                                                                                                                                           |        |           |
| SCH-P-087 | Mobile — lesson card text | Inspect lesson card font size                     | Body text ≥ 14px; subject name ≥ 14px. No 10px / 11px squeeze. No truncation that loses critical info (subject + time always visible; teacher may truncate with full name in tooltip).                                                                                                                                           |        |           |
| SCH-P-088 | Mobile — RTL              | AR locale at 375px                                | All §7 RTL guarantees still hold at small width. No layout collapse. No physical-class violations.                                                                                                                                                                                                                               |        |           |
| SCH-P-089 | Mobile — landscape        | Rotate to 812 × 375                               | Grid still readable; no clipping.                                                                                                                                                                                                                                                                                                |        |           |
| SCH-P-090 | Mobile — dashboard widget | `/en/parent` at 375px                             | Today's Lessons widget stacks naturally (1 column). Empty state is centered and readable.                                                                                                                                                                                                                                        |        |           |
| SCH-P-091 | Mobile — hamburger nav    | Open mobile nav drawer                            | Nav drawer shows ONLY parent-permitted hubs. NO scheduling admin entry.                                                                                                                                                                                                                                                          |        |           |

---

## 9. Hidden Navigation — No Scheduling Admin Items

The morph bar, sub-strip (if any), nav drawer, and footer must NEVER expose admin scheduling routes to a parent.

| #         | Surface                         | What to Check                                                         | Expected                                                                                                                                                                                                                                  | Actual | Pass/Fail |
| --------- | ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-092 | Morph bar (top)                 | Inspect every visible hub icon as Zainab                              | NO icon labelled "Scheduling", "Schedules", "Timetables (admin)", "Auto-scheduler", "Runs", "Substitutions", "Exams", "Scenarios". Parent should see only Home, child(ren), Communications, Wellbeing (if enabled), Finance (if enabled). |        |           |
| SCH-P-093 | Sub-strip                       | If a sub-strip appears for the parent dashboard hub, inspect contents | NO scheduling-admin entries. Allowed: "Today", "Timetable", "Attendance", "Reports".                                                                                                                                                      |        |           |
| SCH-P-094 | Mobile hamburger drawer         | Open mobile nav as Zainab                                             | Same as SCH-P-092: no admin scheduling entries.                                                                                                                                                                                           |        |           |
| SCH-P-095 | Quick actions / command palette | If a command palette (Cmd+K) exists, type "schedul"                   | Suggestions filter to parent-allowed surfaces only ("My children's timetable"). NO suggestions for "Auto scheduler", "Runs", "Substitutions admin", "Curriculum", "Competencies".                                                         |        |           |
| SCH-P-096 | Footer / utility links          | Inspect any footer or settings shortcut                               | NO admin scheduling shortcuts.                                                                                                                                                                                                            |        |           |
| SCH-P-097 | Search                          | Global search for "timetable", "schedule", "substitution"             | Results limited to child-scoped surfaces. No admin run, no admin schedule entries.                                                                                                                                                        |        |           |
| SCH-P-098 | Avatar menu                     | Open avatar menu                                                      | Items: Profile, Communication preferences, Children, Sign out. NO "Scheduling settings", NO "My availability", NO "My preferences" (those are staff-only).                                                                                |        |           |

---

## 10. Direct URL Access Denial — Admin Scheduling Routes

Parent navigates directly via URL bar. Every admin scheduling route must deny access.

**Acceptance for every row in this section:** the page either (a) returns a 404 or 403 page in our shell, OR (b) redirects to `/{locale}/parent` (or `/{locale}/dashboard`) with a toast / inline notice. The page MUST NOT render even a flash of admin content. The page MUST NOT make any admin scheduling API call (verify network tab).

Login: Zainab Ali.

| #         | URL                                              | Expected                                                                                            | Actual | Pass/Fail |
| --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-099 | `/en/scheduling`                                 | Redirect or 403/404; no admin hub renders                                                           |        |           |
| SCH-P-100 | `/en/scheduling/auto`                            | Redirect or 403/404                                                                                 |        |           |
| SCH-P-101 | `/en/scheduling/runs`                            | Redirect or 403/404                                                                                 |        |           |
| SCH-P-102 | `/en/scheduling/runs/{any_uuid}/review`          | Redirect or 403/404                                                                                 |        |           |
| SCH-P-103 | `/en/scheduling/runs/compare`                    | Redirect or 403/404                                                                                 |        |           |
| SCH-P-104 | `/en/scheduling/period-grid`                     | Redirect or 403/404                                                                                 |        |           |
| SCH-P-105 | `/en/scheduling/curriculum`                      | Redirect or 403/404                                                                                 |        |           |
| SCH-P-106 | `/en/scheduling/break-groups`                    | Redirect or 403/404                                                                                 |        |           |
| SCH-P-107 | `/en/scheduling/room-closures`                   | Redirect or 403/404                                                                                 |        |           |
| SCH-P-108 | `/en/scheduling/competencies`                    | Redirect or 403/404                                                                                 |        |           |
| SCH-P-109 | `/en/scheduling/substitute-competencies`         | Redirect or 403/404                                                                                 |        |           |
| SCH-P-110 | `/en/scheduling/competency-coverage`             | Redirect or 403/404                                                                                 |        |           |
| SCH-P-111 | `/en/scheduling/teacher-config`                  | Redirect or 403/404                                                                                 |        |           |
| SCH-P-112 | `/en/scheduling/availability`                    | Redirect or 403/404                                                                                 |        |           |
| SCH-P-113 | `/en/scheduling/preferences`                     | Redirect or 403/404                                                                                 |        |           |
| SCH-P-114 | `/en/scheduling/requirements`                    | Redirect or 403/404                                                                                 |        |           |
| SCH-P-115 | `/en/scheduling/requirements/subject-overrides`  | Redirect or 403/404                                                                                 |        |           |
| SCH-P-116 | `/en/scheduling/substitutions`                   | Redirect or 403/404                                                                                 |        |           |
| SCH-P-117 | `/en/scheduling/substitution-board`              | Redirect or 403/404 (kiosk page is staff/public, parent must NOT be funnelled here from in-app nav) |        |           |
| SCH-P-118 | `/en/scheduling/exams`                           | Redirect or 403/404                                                                                 |        |           |
| SCH-P-119 | `/en/scheduling/scenarios`                       | Redirect or 403/404                                                                                 |        |           |
| SCH-P-120 | `/en/scheduling/dashboard`                       | Redirect or 403/404                                                                                 |        |           |
| SCH-P-121 | `/en/scheduling/cover-reports`                   | Redirect or 403/404                                                                                 |        |           |
| SCH-P-122 | `/en/scheduling/my-timetable`                    | Redirect or 403/404 (this is staff-only)                                                            |        |           |
| SCH-P-123 | `/en/scheduling/my-preferences`                  | Redirect or 403/404                                                                                 |        |           |
| SCH-P-124 | `/en/scheduling/my-satisfaction`                 | Redirect or 403/404                                                                                 |        |           |
| SCH-P-125 | `/en/scheduling/leave-requests`                  | Redirect or 403/404                                                                                 |        |           |
| SCH-P-126 | `/en/timetables`                                 | Redirect or 403/404 (admin cross-module timetable)                                                  |        |           |
| SCH-P-127 | `/en/schedules`                                  | Redirect or 403/404                                                                                 |        |           |
| SCH-P-128 | `/en/(print)/timetables/rooms/{room_uuid}/print` | Redirect or 403/404                                                                                 |        |           |
| SCH-P-129 | `/ar/scheduling`                                 | Same denial behaviour in AR locale                                                                  |        |           |
| SCH-P-130 | `/ar/scheduling/runs`                            | Same denial behaviour in AR locale                                                                  |        |           |

---

## 11. API Permission Denial — Admin Scheduling Endpoints

Parent hits admin APIs directly via DevTools fetch / curl with their JWT. Every call must return **403** (`PermissionGuard` / `RequiresPermission` denial) or **404** (RLS scoped-out).

Login: Zainab Ali. JWT in `Authorization: Bearer ...`.

| #         | METHOD + Path                                                            | Required permission                                          | Expected | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | -------- | ------ | --------- |
| SCH-P-131 | GET `/api/v1/scheduling/teacher-competencies?academic_year_id={uuid}`    | schedule.configure_requirements                              | 403      |        |           |
| SCH-P-132 | POST `/api/v1/scheduling/teacher-competencies` with body                 | schedule.configure_requirements                              | 403      |        |           |
| SCH-P-133 | GET `/api/v1/scheduling/substitute-competencies?academic_year_id={uuid}` | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-134 | GET `/api/v1/scheduling/curriculum-requirements?academic_year_id={uuid}` | schedule.configure_requirements                              | 403      |        |           |
| SCH-P-135 | GET `/api/v1/scheduling/break-groups?academic_year_id={uuid}`            | schedule.configure_requirements                              | 403      |        |           |
| SCH-P-136 | GET `/api/v1/scheduling/room-closures?academic_year_id={uuid}`           | schedule.manage                                              | 403      |        |           |
| SCH-P-137 | POST `/api/v1/scheduling/room-closures`                                  | schedule.manage                                              | 403      |        |           |
| SCH-P-138 | GET `/api/v1/scheduling/teacher-config?academic_year_id={uuid}`          | schedule.configure_availability                              | 403      |        |           |
| SCH-P-139 | POST `/api/v1/scheduling/runs/prerequisites`                             | schedule.run_auto                                            | 403      |        |           |
| SCH-P-140 | POST `/api/v1/scheduling/runs/trigger`                                   | schedule.run_auto                                            | 403      |        |           |
| SCH-P-141 | GET `/api/v1/scheduling/runs`                                            | schedule.view_auto_reports                                   | 403      |        |           |
| SCH-P-142 | GET `/api/v1/scheduling/runs/{uuid}`                                     | schedule.view_auto_reports                                   | 403      |        |           |
| SCH-P-143 | POST `/api/v1/scheduling/runs/{uuid}/apply`                              | schedule.apply_auto                                          | 403      |        |           |
| SCH-P-144 | POST `/api/v1/scheduling/runs/{uuid}/discard`                            | schedule.run_auto                                            | 403      |        |           |
| SCH-P-145 | POST `/api/v1/scheduling/runs/{uuid}/cancel`                             | schedule.run_auto                                            | 403      |        |           |
| SCH-P-146 | GET `/api/v1/scheduling-runs/feasibility?academic_year_id={uuid}`        | schedule.run_auto                                            | 403      |        |           |
| SCH-P-147 | GET `/api/v1/scheduling-runs/{uuid}/diagnostics`                         | schedule.view_auto_reports                                   | 403      |        |           |
| SCH-P-148 | POST `/api/v1/scheduling/absences`                                       | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-149 | POST `/api/v1/scheduling/absences/self-report`                           | schedule.report_own_absence                                  | 403      |        |           |
| SCH-P-150 | GET `/api/v1/scheduling/absences`                                        | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-151 | POST `/api/v1/scheduling/substitutions`                                  | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-152 | GET `/api/v1/scheduling/substitution-board`                              | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-153 | GET `/api/v1/scheduling/offers/my`                                       | schedule.respond_to_offer                                    | 403      |        |           |
| SCH-P-154 | POST `/api/v1/scheduling/offers/{uuid}/accept`                           | schedule.respond_to_offer                                    | 403      |        |           |
| SCH-P-155 | POST `/api/v1/scheduling/offers/{uuid}/decline`                          | schedule.respond_to_offer                                    | 403      |        |           |
| SCH-P-156 | GET `/api/v1/scheduling/colleagues`                                      | schedule.report_own_absence                                  | 403      |        |           |
| SCH-P-157 | GET `/api/v1/scheduling/teachers`                                        | schedule.manage_substitutions                                | 403      |        |           |
| SCH-P-158 | GET `/api/v1/scheduling/cover-reports?date_from=&date_to=`               | schedule.view_reports                                        | 403      |        |           |
| SCH-P-159 | GET `/api/v1/scheduling/cover-reports/fairness`                          | schedule.view_reports                                        | 403      |        |           |
| SCH-P-160 | POST `/api/v1/scheduling/swaps/validate`                                 | schedule.manage                                              | 403      |        |           |
| SCH-P-161 | POST `/api/v1/scheduling/swaps/execute`                                  | schedule.manage                                              | 403      |        |           |
| SCH-P-162 | POST `/api/v1/scheduling/emergency-change`                               | schedule.manage                                              | 403      |        |           |
| SCH-P-163 | GET `/api/v1/scheduling/timetable/teacher/{uuid}`                        | schedule.view_reports                                        | 403      |        |           |
| SCH-P-164 | GET `/api/v1/scheduling/timetable/my`                                    | schedule.view_own                                            | 403      |        |           |
| SCH-P-165 | GET `/api/v1/scheduling/timetable/class/{uuid}`                          | schedule.view_reports                                        | 403      |        |           |
| SCH-P-166 | POST `/api/v1/scheduling/calendar-tokens`                                | schedule.view_own                                            | 403      |        |           |
| SCH-P-167 | GET `/api/v1/scheduling/calendar-tokens`                                 | schedule.view_own                                            | 403      |        |           |
| SCH-P-168 | PUT `/api/v1/scheduling/rotation`                                        | schedule.manage                                              | 403      |        |           |
| SCH-P-169 | GET `/api/v1/scheduling/rotation`                                        | schedule.view_reports                                        | 403      |        |           |
| SCH-P-170 | POST `/api/v1/scheduling/exam-sessions`                                  | schedule.manage_exams                                        | 403      |        |           |
| SCH-P-171 | GET `/api/v1/scheduling/exam-sessions`                                   | schedule.manage_exams                                        | 403      |        |           |
| SCH-P-172 | POST `/api/v1/scheduling/scenarios`                                      | schedule.manage_scenarios                                    | 403      |        |           |
| SCH-P-173 | GET `/api/v1/scheduling/scenarios`                                       | schedule.manage_scenarios                                    | 403      |        |           |
| SCH-P-174 | GET `/api/v1/scheduling/analytics/efficiency`                            | schedule.view_reports                                        | 403      |        |           |
| SCH-P-175 | GET `/api/v1/scheduling/analytics/workload`                              | schedule.view_reports                                        | 403      |        |           |
| SCH-P-176 | GET `/api/v1/scheduling/analytics/rooms`                                 | schedule.view_reports                                        | 403      |        |           |
| SCH-P-177 | GET `/api/v1/scheduling-dashboard/overview`                              | schedule.view_auto_reports                                   | 403      |        |           |
| SCH-P-178 | GET `/api/v1/scheduling-dashboard/workload`                              | schedule.view_auto_reports                                   | 403      |        |           |
| SCH-P-179 | GET `/api/v1/scheduling-dashboard/preferences`                           | schedule.view_own_satisfaction or schedule.view_auto_reports | 403      |        |           |
| SCH-P-180 | POST `/api/v1/schedules` (admin schedule create)                         | schedule.manage                                              | 403      |        |           |
| SCH-P-181 | GET `/api/v1/schedules`                                                  | schedule.manage                                              | 403      |        |           |
| SCH-P-182 | PATCH `/api/v1/schedules/{uuid}`                                         | schedule.manage                                              | 403      |        |           |
| SCH-P-183 | DELETE `/api/v1/schedules/{uuid}`                                        | schedule.manage                                              | 403      |        |           |
| SCH-P-184 | POST `/api/v1/schedules/bulk-pin`                                        | schedule.pin_entries                                         | 403      |        |           |
| SCH-P-185 | GET `/api/v1/timetables/teacher/{uuid}`                                  | schedule.manage / view_own (staff)                           | 403      |        |           |
| SCH-P-186 | GET `/api/v1/timetables/class/{uuid}`                                    | schedule.manage / view_class                                 | 403      |        |           |
| SCH-P-187 | GET `/api/v1/timetables/room/{uuid}`                                     | schedule.manage                                              | 403      |        |           |
| SCH-P-188 | GET `/api/v1/reports/workload`                                           | schedule.manage                                              | 403      |        |           |
| SCH-P-189 | GET `/api/v1/timetables/student/{adam_id}` (Zainab's OWN child)          | implicit guardian-link                                       | 200      |        |           |

**Note on row SCH-P-189:** this is the ONE allowed row — confirm a 200 response with Adam's data only. Compare the response body against the cross-family probes in §12 to ensure the same endpoint correctly DENIES other parents' children.

---

## 12. Cross-Family RLS — Parent Cannot See Other Parents' Children

This is the most security-critical section. The endpoint `GET /v1/timetables/student/:studentId` resolves access via `guardian_links` — a parent of child A must NEVER see child B (other family, same tenant).

Login: Zainab Ali (parent of Adam Moore only).

| #         | METHOD + Path                                                 | Target student                                                                                                                                      | Expected                                                                                                                           | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-190 | GET `/api/v1/timetables/student/{layla_id}`                   | Layla Hassan (Fatima's child, same tenant)                                                                                                          | **404** (or 403). Body MUST NOT contain any of Layla's schedule data. Error code is generic (e.g., `STUDENT_NOT_FOUND`).           |        |           |
| SCH-P-191 | GET `/api/v1/timetables/student/{omar_id}`                    | Omar Hassan (Fatima's child)                                                                                                                        | 404 / 403, no data leak.                                                                                                           |        |           |
| SCH-P-192 | GET `/api/v1/timetables/student/{yusra_id}`                   | Yusra Ibrahim (Khadija's child)                                                                                                                     | 404 / 403, no data leak.                                                                                                           |        |           |
| SCH-P-193 | GET `/api/v1/timetables/student/{hostile_child_id}`           | Hostile parent's child (any random other student in tenant)                                                                                         | 404 / 403, no data leak.                                                                                                           |        |           |
| SCH-P-194 | GET `/api/v1/timetables/student/{archived_link_student_id}`   | Zainab's ex-stepchild whose link is archived                                                                                                        | **404** — archived links must be filtered out. Confirm response body is identical to a true non-existent student probe.            |        |           |
| SCH-P-195 | UI deep-link `/{locale}/parent/students/{layla_id}/timetable` | Layla                                                                                                                                               | 404 page or redirect to `/parent`. NO flash of Layla's data. NO API call made (or API call returns 404 and UI handles it).         |        |           |
| SCH-P-196 | UI deep-link `/{locale}/parent/students/{layla_id}` (profile) | Layla                                                                                                                                               | 404 page or redirect.                                                                                                              |        |           |
| SCH-P-197 | Verify error response body                                    | Compare 404 for SCH-P-190 vs random UUID `00000000-...`                                                                                             | Response bodies are IDENTICAL (no oracle leak via different error messages between "not your child" and "doesn't exist").          |        |           |
| SCH-P-198 | Verify error response timing                                  | Time the SCH-P-190 vs random-UUID probe                                                                                                             | Response times within ±20% (no timing oracle).                                                                                     |        |           |
| SCH-P-199 | Verify no enumeration via list                                | GET `/api/v1/students` (admin endpoint)                                                                                                             | 403 — parent cannot enumerate students. Forces an attacker to GUESS UUIDs, which combined with SCH-P-197/SCH-P-198 yields no info. |        |           |
| SCH-P-200 | Verify guardian-link self-check                               | If a `GET /api/v1/parent/me/children` (or similar) endpoint exists                                                                                  | Returns ONLY Zainab's active-linked children. NO archived links. NO other parents' children.                                       |        |           |
| SCH-P-201 | Database-layer probe (read-only)                              | Direct query (out-of-band, with read-only DBA): `SELECT student_id FROM guardian_links WHERE parent_user_id = zainab_user_id AND status = 'active'` | Returns only Adam Moore's student_id. Confirms data layer matches API behaviour.                                                   |        |           |
| SCH-P-202 | Network-trace cross-check                                     | Inspect ALL API responses on `/parent/timetable` page                                                                                               | NO response body contains any student_id other than Adam's (or UUIDs of children-of-self).                                         |        |           |
| SCH-P-203 | Stale-token edge case                                         | Archive Adam's guardian_link in DB while Zainab still has active session                                                                            | Next API call for Adam returns 404 within one request cycle (no permission cached past one request).                               |        |           |

---

## 13. Cross-Tenant RLS — `nhqs` Parent Cannot See `stress-a` Data

Login: Zainab Ali (`nhqs`). Probe child UUIDs are real `stress-a` student IDs obtained out-of-band.

| #         | METHOD + Path                                                          | Target                                                                                              | Expected                                                                                                                                          | Actual | Pass/Fail |
| --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-204 | GET `/api/v1/timetables/student/{stress_a_child_id}`                   | A real `stress-a` student                                                                           | **404** — RLS prevents row visibility because `student.tenant_id != current_tenant_id`. Body has no leak.                                         |        |           |
| SCH-P-205 | UI deep-link `/{locale}/parent/students/{stress_a_child_id}/timetable` | Same target                                                                                         | 404 page or redirect.                                                                                                                             |        |           |
| SCH-P-206 | Hostname swap                                                          | While logged in to `nhqs.edupod.app`, navigate to `https://stress-a.edupod.app/en/parent/timetable` | Auth token is tenant-scoped; either logged out + sent to login, or "no tenant access" error. NEVER renders stress-a data using nhqs JWT.          |        |           |
| SCH-P-207 | Cross-tenant guardian-link enumeration                                 | Confirm `guardian_links` rows for Zainab are tenant-scoped                                          | Out-of-band DBA query confirms Zainab's `guardian_links.tenant_id = nhqs_tenant_id`. No row references stress-a.                                  |        |           |
| SCH-P-208 | Tenant header tampering                                                | Add `X-Tenant-Id: {stress_a_tenant_id}` header to a request                                         | Header is IGNORED — tenant context is derived from JWT/host, NOT from client header. Response remains 200/Adam (or 404 for cross-tenant student). |        |           |
| SCH-P-209 | Wrong subdomain probe                                                  | Try `https://test-tenant-fake.edupod.app/en/parent/timetable`                                       | Either 404 host, or "Tenant not found" page. No crash. No leak.                                                                                   |        |           |
| SCH-P-210 | Login as `stress-a` parent and probe `nhqs` child                      | As Test-A Parent, GET `/api/v1/timetables/student/{adam_id}`                                        | 404. Symmetric isolation confirmed.                                                                                                               |        |           |

---

## 14. Cross-Cutting — Console / Network / Dark Mode / Theme

| #         | What to Check                               | Expected                                                                                                                                                                                                    | Actual                                                                                                                                                   | Pass/Fail |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --- |
| SCH-P-211 | Console errors during entire parent journey | ZERO `console.error`. ZERO uncaught promise rejections. Any expected 4xx (e.g., from §12 probes) is logged via `console.error('[functionName]', err)` per repo convention, NOT swallowed silently.          |                                                                                                                                                          |           |
| SCH-P-212 | Console warnings                            | No React key warnings, no hydration mismatches, no `findDOMNode` deprecation, no missing `alt` attribute warnings.                                                                                          |                                                                                                                                                          |           |
| SCH-P-213 | Network — 4xx                               | The ONLY 4xx codes in the network tab are deliberate probes (§§10, 11, 12, 13). All allowed parent-facing requests return 2xx.                                                                              |                                                                                                                                                          |           |
| SCH-P-214 | Network — 5xx                               | ZERO 5xx responses across happy path AND probe paths.                                                                                                                                                       |                                                                                                                                                          |           |
| SCH-P-215 | Network — duplicate calls                   | No duplicate identical GET requests fired on a single page load (no `useEffect` double-firing in production build).                                                                                         |                                                                                                                                                          |           |
| SCH-P-216 | Dark mode                                   | Toggle dark mode (avatar → Theme → Dark). Timetable grid, lesson cards, child switcher, empty state, error state all render with correct contrast. NO hardcoded `bg-white` / `text-black` literals visible. |                                                                                                                                                          |           |
| SCH-P-217 | Light mode                                  | Toggle back. Layout returns identically.                                                                                                                                                                    |                                                                                                                                                          |           |
| SCH-P-218 | System-pref dark                            | If theme is set to "System", change OS to dark, reload                                                                                                                                                      | Page picks up dark theme on hydration without FOUC.                                                                                                      |           |     |
| SCH-P-219 | Theme tokens                                | Inspect computed styles on a lesson card                                                                                                                                                                    | Background/foreground come from CSS custom properties (e.g., `var(--surface-1)`, `var(--text-primary)`). No raw hex.                                     |           |     |
| SCH-P-220 | Fonts                                       | Inspect computed font-family on body text                                                                                                                                                                   | `Figtree` (per redesign spec) for primary UI text. `JetBrains Mono` for codes (room codes, period numbers). Loaded via `@/lib/fonts`, NOT CSS `@import`. |           |     |
| SCH-P-221 | Performance — TTI                           | Lighthouse run on `/en/parent/timetable` for Zainab (cached, simulated 4G)                                                                                                                                  | Time-to-interactive < 5s. No long-task warnings > 200ms.                                                                                                 |           |     |
| SCH-P-222 | Accessibility — axe scan                    | Run axe-core on `/en/parent/timetable`                                                                                                                                                                      | ZERO critical issues. Color contrast AA on all text. ARIA roles correct on tab strip and grid.                                                           |           |     |
| SCH-P-223 | Accessibility — screen reader               | Use VoiceOver / NVDA on the grid                                                                                                                                                                            | Lesson cells announce as "Mathematics with Mr Khan, Room Lab-3, 8:30 to 9:15, Monday". Tab strip announces selected child.                               |           |     |
| SCH-P-224 | Reduced motion                              | Set `prefers-reduced-motion: reduce`                                                                                                                                                                        | Tab transitions, week-nav transitions are instant or reduced. No spinner with continuous rotation.                                                       |           |     |
| SCH-P-225 | Refresh / re-auth resilience                | Hard refresh in middle of viewing timetable                                                                                                                                                                 | Page restores at the same URL with same data. JWT refresh (httpOnly cookie) silent.                                                                      |           |     |

---

## 15. Data Invariants

These invariants must hold after every probe / flow in this spec. Tester should run them at the end of each session. SQL is illustrative; out-of-band read-only DBA execution.

| #         | Invariant                                                                                 | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-P-226 | Parent only ever sees `schedule` rows joined to a class their linked child is enrolled in | For each `schedule_id` rendered to Zainab in the spec session, confirm `EXISTS (SELECT 1 FROM class_enrolment ce JOIN guardian_links gl ON gl.student_id = ce.student_id WHERE ce.class_id = schedule.class_id AND gl.parent_user_id = zainab_user_id AND gl.status = 'active' AND ce.tenant_id = nhqs_tenant_id)`.                                                                                                                                                                                                                                                                                                                                                                   |        |           |
| SCH-P-227 | Cross-tenant impossibility                                                                | Confirm `guardian_links` table has `tenant_id NOT NULL` and an RLS policy `guardian_links_tenant_isolation` with `FORCE ROW LEVEL SECURITY`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |        |           |
| SCH-P-228 | No write side-effect from any parent action                                               | Snapshot `schedule`, `scheduling_run`, `teacher_absence`, `substitution_record`, `substitution_offer`, `teacher_competency` row counts before and after the parent test session. Expect ZERO delta from parent activity (modulo unrelated background activity).                                                                                                                                                                                                                                                                                                                                                                                                                       |        |           |
| SCH-P-229 | No `audit_log` entries attributed to parent for admin actions                             | `SELECT * FROM audit_log WHERE user_id = zainab_user_id AND action LIKE 'schedule.%' AND action != 'schedule.timetable.view'` returns ZERO rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |        |           |
| SCH-P-230 | Archived guardian_link is invisible                                                       | After SCH-P-194/SCH-P-195 probes, no API response or rendered DOM contains the archived child's name or student_id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |        |           |
| SCH-P-231 | RLS policy present on every scheduling table                                              | Run `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('schedule','scheduling_run','teacher_absence','substitution_record','substitution_offer','teacher_competency','substitute_teacher_competency','break_group','break_group_year_group','teacher_scheduling_config','exam_session','exam_slot','exam_invigilation','scheduling_scenario','rotation_config','class_scheduling_requirement','staff_scheduling_preference','calendar_subscription_token','tenant_scheduling_settings','schedule_period_template','class_subject_requirement','curriculum_requirement')` and cross-reference `pg_policies` for `*_tenant_isolation`. All 22 tables present. |        |           |
| SCH-P-232 | No raw SQL outside RLS middleware touched on parent path                                  | Repo grep for `$executeRawUnsafe` / `$queryRawUnsafe` in `apps/api/src/modules/schedules/timetables.service.ts` and `personal-timetable.service.ts` returns ZERO matches outside the RLS middleware.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |        |           |
| SCH-P-233 | No JSONB fields leak                                                                      | Inspect `GET /api/v1/timetables/student/:studentId` response — must NOT contain `config_snapshot`, `result_json`, `proposed_adjustments`, `diagnostics_refined_report` from any related run. The student-timetable read should never join to scheduling_run JSONB.                                                                                                                                                                                                                                                                                                                                                                                                                    |        |           |

---

## 16. Observations and Bugs Spotted

To be filled by the executing tester. Suggested format per row:

| #         | Severity (P0/P1/P2/P3) | Page / Endpoint | Observation / Bug | Repro steps | Suggested action |
| --------- | ---------------------- | --------------- | ----------------- | ----------- | ---------------- |
| SCH-P-234 |                        |                 |                   |             |                  |
| SCH-P-235 |                        |                 |                   |             |                  |
| SCH-P-236 |                        |                 |                   |             |                  |
| SCH-P-237 |                        |                 |                   |             |                  |
| SCH-P-238 |                        |                 |                   |             |                  |

**Pre-known risk areas to look for** (based on inventory):

- The `students.view OR parent (linked child only)` permission expression on `GET /v1/timetables/student/:studentId` (per `.inventory-backend.md` line 246) suggests the route is defended by a custom guard combining permission + guardian-link check. Verify the parent-branch logic doesn't accidentally also accept the `students.view` admin permission for parents who somehow gained it (defence-in-depth).
- The frontend inventory shows there is NO explicit parent-facing `/parent/timetable` page documented in `.inventory-frontend.md` (the inventory lists `/scheduling/my-timetable` as staff-only). **If the parent timetable page does not exist as a built route, every test in §§2-8 will fail.** Tester MUST confirm route existence first; if missing, escalate as a P0 product gap before continuing.
- Frontend uses imperative `apiClient<T>()` with `useEffect`; no React Query / SWR. Verify no stale data persists across child-switcher tab changes.
- The `scheduling.my-timetable` translation namespace is staff-oriented; parent-facing strings need a separate `parent.timetable.*` namespace. Verify both EN and AR keys exist for parent-facing strings, or document the gap.
- Guardian-link soft-delete is status-based (`archived`) per repo convention — verify the API filters `status = 'active'` and not just `status != 'deleted'`.

---

## 17. Sign-off

| Field                    | Value                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Spec version             | 1.0                                                                                                                        |
| Module                   | Scheduling — Parent View                                                                                                   |
| Spec author              | Auto-generated via `/E2E` skill                                                                                            |
| Date drafted             | 2026-04-17                                                                                                                 |
| Test environment         | `https://nhqs.edupod.app` + `https://stress-a.edupod.app`                                                                  |
| Browsers required        | Desktop Chrome (latest), Safari (latest), Firefox (latest); mobile Safari (iOS 17+) and Chrome Android at 375 × 812        |
| Total test rows          | 238 (rows SCH-P-001 through SCH-P-238)                                                                                     |
| Allowed-path rows        | ~70 (sections 2–8)                                                                                                         |
| Negative / denial rows   | ~140 (sections 9–13)                                                                                                       |
| Cross-cutting rows       | ~20 (sections 14–15)                                                                                                       |
| Required executor passes | All §§1, 9, 10, 11, 12, 13, 15 must be 100% pass for release. §§2–8 must be ≥ 95% pass; any failure must be logged in §16. |
| Hostile probes confirmed | Cross-family (§12) AND cross-tenant (§13) — both required.                                                                 |
| Bilingual coverage       | English (`en`) AND Arabic (`ar`) — both required, with RTL parity assertions in §7.                                        |
| Mobile coverage          | 375 × 812 viewport — required (§8).                                                                                        |
| Tester                   | **************\_**************                                                                                             |
| Date executed            | **************\_**************                                                                                             |
| Pass count               | **************\_**************                                                                                             |
| Fail count               | **************\_**************                                                                                             |
| Blocked count            | **************\_**************                                                                                             |
| Sign-off                 | **************\_**************                                                                                             |

---

**End of spec.**
