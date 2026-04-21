# Wellbeing — E2E Test Specification (Student)

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Perspective:** Student tier — role key `student`. Students hold the **smallest** wellbeing surface in the product. The only fully-wired student-facing capability today is the **self-check-in** (submit + own history + own status). Everything else in the umbrella — incidents, concerns, safeguarding, sanctions, appeals, recognition wall, staff-wellbeing surveys, tier-3, early-warning, break-glass, DSAR, SST, settings, platform admin — is explicitly **NOT** a student surface and must be 403/redirected when touched.
> **What the student CAN do:**
>
> 1. Submit a daily self-check-in (`mood_score` + optional `freeform_text`) via `POST /api/v1/pastoral/checkins`.
> 2. Read **their own** check-in history via `GET /api/v1/pastoral/checkins/my`.
> 3. Read **their own** check-in eligibility status via `GET /api/v1/pastoral/checkins/status`.
> 4. (Speculative — API shape tested, UI may not be shipped.) Read **their own** recognition awards, incidents, sanctions if a student portal is wired for the tenant.
>    **What the student CANNOT do:** log a behaviour incident, log a pastoral concern, report a safeguarding concern, submit an appeal, view any hub/sub-hub landing page, access any settings, view Tier-3, view safeguarding, view early-warning, view the staff-wellbeing surveys tree, or see another student's data.
>    **Pages covered:** 0–1 student-facing wellbeing pages depending on whether the tenant has wired a student portal. This spec tests the API surface regardless and documents the UI surface as "ships or not-yet-shipped" on a per-tile basis.
>    **Base URL:** `https://nhqs.edupod.app`
>    **Test fixture tenant:** Nurul Huda School (NHQS), slug `nhqs`.
>    **Companion specs:** `admin_view/wellbeing-e2e-spec.md`, `teacher_view/wellbeing-e2e-spec.md`, `parent_view/wellbeing-e2e-spec.md`, `integration/wellbeing-integration-spec.md`, `worker/wellbeing-worker-spec.md`, `perf/wellbeing-perf-spec.md`, `security/wellbeing-security-spec.md`.

---

## How to use this spec

Every row is one observable check. Mark **Pass / Fail / Blocked** in the rightmost column. A `Fail` on any row where severity is unspecified is a release blocker. Rows explicitly labelled `(info)` are diagnostic and do not block release.

Because the student surface is intentionally small, the **primary deliverable of this spec is the large negative matrix** (§11–§13). If a student can reach any non-check-in wellbeing surface — UI or API — it is a release-blocking permission leak. Treat every green row in §11/12/13 as one nail in the coffin of a potential RBAC hole.

Run this spec top-to-bottom in a fresh browser session per locale (once in `/en/*`, once in `/ar/*`). The tester should keep DevTools open with the **Network** and **Console** tabs visible — both are asserted on.

The tester needs **two student logins** available for cross-student isolation in §12: `student@nhqs.test` (linked to student record `S_ALPHA`) and `student-other@nhqs.test` (linked to student record `S_BETA`). Rotate between them where called for.

---

## Table of contents

1. [Prerequisites & fixture](#1-prerequisites--fixture)
2. [Out of scope for this spec](#2-out-of-scope-for-this-spec)
3. [Login & shell](#3-login--shell)
4. [Self-check-in submit](#4-self-check-in-submit)
5. [Check-in eligibility status](#5-check-in-eligibility-status)
6. [Own check-in history](#6-own-check-in-history)
7. [Flagged check-in privacy](#7-flagged-check-in-privacy)
8. [Own recognition awards (speculative)](#8-own-recognition-awards-speculative)
9. [Own incidents / sanctions (speculative)](#9-own-incidents--sanctions-speculative)
10. [Staff-wellbeing survey attempt (must be blocked)](#10-staff-wellbeing-survey-attempt-must-be-blocked)
11. [Negative matrix — UI](#11-negative-matrix--ui)
12. [Negative matrix — API](#12-negative-matrix--api)
13. [Cross-student isolation](#13-cross-student-isolation)
14. [Cross-tenant hostile check](#14-cross-tenant-hostile-check)
15. [Arabic / RTL spot check](#15-arabic--rtl-spot-check)
16. [Mobile walkthrough (375×812)](#16-mobile-walkthrough-375812)
17. [Backend endpoint map](#17-backend-endpoint-map)
18. [DevTools console & network health](#18-devtools-console--network-health)
19. [Data invariants — post-conditions](#19-data-invariants--post-conditions)
20. [Observations](#20-observations)
21. [Sign-off](#21-sign-off)

---

## 1. Prerequisites & fixture

The student fixture is deliberately minimal: we need two students with a bit of behaviour / recognition history so we can probe "own data" vs "other student's data" isolation, and we need to know ahead of time that the student portal pages may **not** be shipped.

| #    | What to Check                                                                                                                                                                                                                                                                                                           | Expected                                                                                                                                                                                    | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | **Tenant A — NHQS** exists with slug `nhqs`, currency `EUR`, `pastoral` module enabled in `tenant_modules`. `behaviour` module also enabled so we have incidents/recognition to probe.                                                                                                                                  | `SELECT is_active FROM tenant_modules WHERE tenant_id=<A> AND module_key IN ('pastoral','behaviour')` → both `true`.                                                                        |           |
| 1.2  | **Tenant B — Acme Test School** exists with slug `acme-test`. Used only for the cross-tenant hostile check in §14.                                                                                                                                                                                                      | `SELECT COUNT(*) FROM tenants WHERE slug='acme-test'` = 1.                                                                                                                                  |           |
| 1.3  | **Student users seeded in Tenant A:** `student@nhqs.test` (role `student`, linked to student record `S_ALPHA`) and `student-other@nhqs.test` (role `student`, linked to student record `S_BETA`). Password `Password123!` for both.                                                                                     | 2 rows in `users` each with a row in `tenant_memberships` (tenant A, role_key `student`) and a row in `student_guardians`/`student_users` link table wiring each user to their student row. |           |
| 1.4  | `S_ALPHA` has behaviour history: ≥ 2 incidents they are a participant in and ≥ 1 positive recognition award. `S_BETA` has ≥ 1 incident (for the cross-student probe in §13).                                                                                                                                            | `SELECT COUNT(*) FROM behaviour_incidents WHERE tenant_id=<A> AND id IN (SELECT incident_id FROM behaviour_incident_students WHERE student_id=<S_ALPHA>)` ≥ 2.                              |           |
| 1.5  | `S_ALPHA` has **no** existing check-in for today's date. This is mandatory — §4 is a create flow, not an update flow.                                                                                                                                                                                                   | `SELECT COUNT(*) FROM student_checkins WHERE tenant_id=<A> AND student_id=<S_ALPHA> AND checkin_date=CURRENT_DATE` = 0.                                                                     |           |
| 1.6  | **Daily check-in frequency config** — tenant-level pastoral config has `checkin_frequency = 'daily'` (default). This drives the `@@unique(tenant_id, student_id, checkin_date)` collision in §4.                                                                                                                        | `SELECT checkin_frequency FROM pastoral_checkin_configs WHERE tenant_id=<A>` = `'daily'`.                                                                                                   |           |
| 1.7  | **Flag keywords** exist for the tenant. At least one safeguarding keyword (e.g. "hurt myself") so that §7 can exercise the auto-flag path.                                                                                                                                                                              | `SELECT COUNT(*) FROM pastoral_safeguarding_keywords WHERE tenant_id=<A> AND enabled=true` ≥ 1.                                                                                             |           |
| 1.8  | **AI flags off.** `behaviour`, `pastoral`, `staff_wellbeing`, `early_warning` all `enabled=false`. Students should never see AI-gated content even when flags are on; keeping them off is the safer default for this spec.                                                                                              | `SELECT module_key, enabled FROM tenant_ai_flags WHERE tenant_id=<A>` — all `false`.                                                                                                        |           |
| 1.9  | **RLS enabled** on `student_checkins`, `pastoral_checkin_config`, `behaviour_incidents`, `behaviour_awards`, `safeguarding_concerns`, `survey_responses`, `staff_surveys`. (The spec does not need the full 54-table count here.)                                                                                       | `SELECT COUNT(*) FROM pg_class WHERE relname = ANY($1) AND relrowsecurity=true AND relforcerowsecurity=true` = 7 for the listed subset.                                                     |           |
| 1.10 | **Hostile pair:** capture one behaviour-incident UUID, one pastoral-concern UUID, one safeguarding-concern UUID, and one checkin UUID from Tenant B for §14.                                                                                                                                                            | Four UUIDs saved alongside spec answers.                                                                                                                                                    |           |
| 1.11 | **Known unknown — student portal shipped?** Before running §8/§9, check whether the tenant has any student-portal pages wired. The default expectation is **no** — if no route returns a page at `/students/me/incidents` or `/students/me/recognition`, those sections collapse to "UI not shipped — API tested only". | Tester notes one of two outcomes: (a) UI shipped (run full UI assertions) or (b) UI not shipped (API-only assertions and mark UI rows N/A).                                                 |           |
| 1.12 | **Browser:** Chromium-based (Chrome/Edge), viewport 1440×900 for desktop; repeat §16 at 375×812 (iPhone SE emulation) for mobile.                                                                                                                                                                                       | Spec passes in both viewports.                                                                                                                                                              |           |
| 1.13 | **Locales:** run twice — `/en/*` then `/ar/*`. RTL assertions in §15.                                                                                                                                                                                                                                                   | Both runs complete without console errors.                                                                                                                                                  |           |

---

## 2. Out of scope for this spec

This spec exercises the UI-visible surface of the **wellbeing umbrella** as a student-tier user clicking through the school shell, plus the API surface they can reach directly. It does **NOT** cover:

- **Admin-tier walkthroughs** (super-hub, sub-hubs, settings, platform admin) → `../admin_view/wellbeing-e2e-spec.md`.
- **Teacher-tier walkthroughs** (incident logging, sanction scheduling, check-in monitoring, tier-3 views) → `../teacher_view/wellbeing-e2e-spec.md`.
- **Parent-tier walkthroughs** (child's behaviour history, sanction acknowledgement, appeal submission, safeguarding concerns on behalf of child) → `../parent_view/wellbeing-e2e-spec.md`.
- **RLS leakage and cross-tenant isolation matrix** (across all 54 tenant-scoped wellbeing tables) → `../integration/wellbeing-integration-spec.md`.
- **API contract edges** (every Zod boundary, every state-machine transition, every denial variant per endpoint) → `../integration/wellbeing-integration-spec.md`.
- **Concurrency / race conditions** (parallel check-in submits, flood protection) → `../integration/wellbeing-integration-spec.md`.
- **BullMQ jobs, cron, dead-letter** (`pastoral:checkin-alert`, etc.) → `../worker/wellbeing-worker-spec.md`. This spec only asserts **what the student sees** after a flagged check-in, not the job chain.
- **Load / throughput / latency budgets** → `../perf/wellbeing-perf-spec.md`.
- **Security hardening** (OWASP 10/10, permission matrix across ~250 endpoints × 8 roles, injection fuzz) → `../security/wellbeing-security-spec.md`. This spec is the **student slice** of the permission matrix, not the whole thing.
- **Accessibility audits** — structural checks only here (`alt`, keyboard focus, aria-labels). Run `axe-core` / Lighthouse separately.
- **Visual regression** — no pixel diffs.

---

## 3. Login & shell

A student's day-one relationship with the wellbeing umbrella is almost nothing: they log in, they see their dashboard, they submit today's check-in if that surface exists for their tenant, they sign out. No hub, no sub-hub, no pill, no settings.

### 3.1 Sign-in primer

| #     | Action                                                                                                             | Expected                                                                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Navigate to `https://nhqs.edupod.app/en/login`. Sign in as `student@nhqs.test` / `Password123!`.                   | Redirects to `/en/dashboard` (student variant) or `/en/dashboard/student`. No 500. No console errors. |           |
| 3.1.2 | Inspect JWT / auth context: `auth.user.role_key` is `student`; `auth.user.tenant_id` is Tenant A.                  | Role = `student`, tenant = A.                                                                         |           |
| 3.1.3 | JWT is in memory only; NOT in `localStorage` / `sessionStorage`.                                                   | Both storage areas empty for auth. Only refresh is an httpOnly cookie.                                |           |
| 3.1.4 | Student landing renders a "hello <first name>" title, timetable card, homework card (or similar role-aware tiles). | Page renders, no admin-flavoured tiles present.                                                       |           |

### 3.2 Morph bar — what a student must NOT see

| #     | What to Check                                                                                                                                                     | Expected                                                                                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Inspect the morph bar at `/en/dashboard`.                                                                                                                         | **No Wellbeing pill.** No Behaviour, Pastoral, Safeguarding, Early Warning, or Staff-Wellbeing pill. No Settings pill.                                                                                         |           |
| 3.2.2 | DOM contains no `<a>` or `<button>` with label / aria-label `"Wellbeing"`, `"Behaviour"`, `"Pastoral"`, `"Safeguarding"`, `"Early Warning"`, `"Staff Wellbeing"`. | `document.querySelectorAll('[aria-label~="Wellbeing"], [aria-label~="Safeguarding"]').length` = 0. (Diagnostic — a student check-in entry point is OK if it is labelled e.g. "Check-in" or "How I'm feeling".) |           |
| 3.2.3 | Open the profile / avatar menu in the morph bar.                                                                                                                  | Menu shows student-appropriate items (profile, logout, language). No admin shortcuts.                                                                                                                          |           |
| 3.2.4 | Press `/` (slash) to focus command palette (if any) and type `wellbeing` / `safeguarding` / `incidents`.                                                          | Either palette is absent, or palette returns zero wellbeing-umbrella hits for this role. No admin commands surface.                                                                                            |           |
| 3.2.5 | Refresh the page. Morph bar must stay visually stable — no flash, no remount.                                                                                     | Bar is stable.                                                                                                                                                                                                 |           |

### 3.3 Check-in entry point (tenant-dependent)

| #     | What to Check                                                                                                                                                                                                                                                                                        | Expected                                                                                                                             | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.3.1 | From the student dashboard, look for a check-in tile / CTA. If one exists, note the URL it links to (likely `/{locale}/dashboard/student/checkin`, `/{locale}/pastoral/checkins/submit`, or similar student-scoped route). If none exists, record it as **O-1** and fall back to the API flow in §4. | Either a tile is present and clickable, or it's absent and the tester uses the direct `POST /api/v1/pastoral/checkins` call in §4.2. |           |
| 3.3.2 | If the tile is present, click it.                                                                                                                                                                                                                                                                    | Navigates to the check-in form. No flash of admin UI, no sidebar.                                                                    |           |
| 3.3.3 | If no tile and the student visits `/en/pastoral/checkins` directly, they must **NOT** land on the staff monitoring page.                                                                                                                                                                             | 403 or redirect to `/dashboard` or `/dashboard/student`. **NEVER** render the staff list view. (§11.5 re-asserts this.)              |           |

---

## 4. Self-check-in submit

This is the **only** write endpoint the student has in the wellbeing umbrella. The contract is enforced by `submitCheckinSchema` in `packages/shared/src/pastoral/schemas/checkin.schema.ts`:

```
{ mood_score: int 1..5, freeform_text?: string<=500 }
```

The backing endpoint is `POST /api/v1/pastoral/checkins` (see `apps/api/src/modules/pastoral/controllers/checkins.controller.ts`). It is wired behind `AuthGuard` + `ModuleEnabledGuard('pastoral')` **only** — no `PermissionGuard` and no `@RequiresPermission` today. That means any authenticated user in a tenant with pastoral enabled can submit. The service uses the JWT `user.sub` as the student identity — the server never trusts a body-supplied student id.

### 4.1 Form — UI-level assertions (run only if a student check-in page is shipped)

| #     | What to Check                                                                                                                                                 | Expected                                                                             | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 4.1.1 | Form renders with a **mood slider / 5-option radio** labelled "How are you feeling today?" (or locale equivalent). Values 1..5. No 0, no 6.                   | 5 options visible. Min = 1, Max = 5. Aria labels present.                            |           |
| 4.1.2 | Form renders a **freeform text area** labelled "Anything you'd like to share? (optional)". Max length 500 chars with a live counter.                          | Counter visible. Typing past 500 is blocked (or the submit button disabled + error). |           |
| 4.1.3 | Submit button disabled until mood_score is chosen.                                                                                                            | Button disabled on load; enables on selection.                                       |           |
| 4.1.4 | Form uses `react-hook-form` + `zodResolver(submitCheckinSchema)`. (Confirm via React DevTools or form behaviour on invalid input.)                            | Validation is schema-driven; client-side error shown on violation before API hit.    |           |
| 4.1.5 | The student record pre-selected is the **signed-in student** — no dropdown to pick a different student, no ability to re-target via devtools field injection. | No student-picker widget. If one exists, that's a permission leak — flag as Fail.    |           |
| 4.1.6 | No admin-flavoured fields visible: no "flag as concern", no "internal notes", no "tier", no "assign to DSL".                                                  | None of these fields are present.                                                    |           |

### 4.2 Submit happy path

| #     | What to Check                                                                                                                                                                             | Expected                                                                                                                                                                                                               | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Submit `{ mood_score: 4, freeform_text: "Good day." }`. Observe Network tab: request is `POST /api/v1/pastoral/checkins`.                                                                 | Request method `POST`, path `/api/v1/pastoral/checkins`, status **201**. `Content-Type: application/json`. Response body shape: `{ id, checkin_date, mood_score: 4, freeform_text: "Good day.", was_flagged: false }`. |           |
| 4.2.2 | Response body does **NOT** contain `flag_reason`, `auto_concern_id`, `reviewed_by_id`, `notes`, or any staff-only field (see `CheckinResponse` construction at `checkin.service.ts:169`). | Body keys limited to `id, checkin_date, mood_score, freeform_text, was_flagged`. Extra staff-only keys → Fail.                                                                                                         |           |
| 4.2.3 | Toast / banner confirms submission in the student's language (e.g. "Thanks — your check-in has been recorded.").                                                                          | Toast appears. No technical error vocabulary leaks through.                                                                                                                                                            |           |
| 4.2.4 | DB row created: `SELECT id, student_id, mood_score, flagged FROM student_checkins WHERE id = <response.id>` → student_id = S_ALPHA, mood_score = 4, flagged = false.                      | Row present with correct values.                                                                                                                                                                                       |           |
| 4.2.5 | Row is tenant-scoped: `tenant_id = <A>`.                                                                                                                                                  | Matches.                                                                                                                                                                                                               |           |
| 4.2.6 | No `pastoral:checkin-alert` job enqueued (mood 4, neutral text → no flag). Check Redis `bull:pastoral:*`.                                                                                 | Queue depth unchanged.                                                                                                                                                                                                 |           |

### 4.3 Submit — validation edges

| #     | Payload                                                                                                     | Expected                                                                                                                                                                                                  | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | `{ mood_score: 0 }`                                                                                         | **400** Zod error. Code mentions `mood_score`. No row written.                                                                                                                                            |           |
| 4.3.2 | `{ mood_score: 6 }`                                                                                         | **400** Zod error.                                                                                                                                                                                        |           |
| 4.3.3 | `{ mood_score: 3.5 }`                                                                                       | **400** Zod error (`int`).                                                                                                                                                                                |           |
| 4.3.4 | `{}` — missing mood                                                                                         | **400** Zod error — `mood_score` required.                                                                                                                                                                |           |
| 4.3.5 | `{ mood_score: 3, freeform_text: <501-char string> }`                                                       | **400** Zod error — max length.                                                                                                                                                                           |           |
| 4.3.6 | `{ mood_score: 3, freeform_text: null }`                                                                    | **400** — schema marks optional but not nullable (`z.string().max(500).optional()` — null is not string).                                                                                                 |           |
| 4.3.7 | `{ mood_score: 3, student_id: <S_BETA id> }` — body-supplied student id (hostile)                           | **201** — but DB row is written against **signed-in student (S_ALPHA)**, not S_BETA. The server ignores `student_id` in the body. Confirm via `SELECT student_id FROM student_checkins WHERE id = <new>`. |           |
| 4.3.8 | Unauthenticated `POST` (no JWT)                                                                             | **401** Unauthorized.                                                                                                                                                                                     |           |
| 4.3.9 | `POST` when `pastoral` module is disabled for the tenant (simulate with Tenant B if that tenant has it off) | **403** — `ModuleEnabledGuard` fires. No row written.                                                                                                                                                     |           |

### 4.4 Duplicate submission — the `@@unique(tenant_id, student_id, checkin_date)` collision

| #     | What to Check                                                                                                                          | Expected                                                                                                                                  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.4.1 | After §4.2 succeeds, immediately submit a second check-in for the same day `{ mood_score: 2, freeform_text: "Actually not great." }`.  | **409 Conflict** with `{ error: { code: "CHECKIN_ALREADY_SUBMITTED", message: ... } }`. Verify code matches `checkin.service.ts:116/140`. |           |
| 4.4.2 | UI handles the 409 gracefully — toast reads "You've already checked in today" (or locale equivalent).                                  | No uncaught promise rejection. No raw JSON payload flashed to the user.                                                                   |           |
| 4.4.3 | Only ONE row exists for the day: `SELECT COUNT(*) FROM student_checkins WHERE student_id=<S_ALPHA> AND checkin_date=CURRENT_DATE` = 1. | 1.                                                                                                                                        |           |
| 4.4.4 | The original row was **not mutated**: `mood_score` still = 4 (the first submission), `freeform_text` still = "Good day."               | No overwrite. Confirms idempotent-by-collision semantics.                                                                                 |           |

---

## 5. Check-in eligibility status

Endpoint: `GET /api/v1/pastoral/checkins/status` (see `checkins.controller.ts:71`). Returns `{ eligible, last_checkin_date, next_eligible_at? }` — shape based on `getCheckinStatus` in `checkin.service.ts`.

| #   | What to Check                                                                                                                                                                                              | Expected                                                                                                                            | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | After §4.2 succeeds, `GET /api/v1/pastoral/checkins/status`.                                                                                                                                               | 200. Body: `{ eligible: false, last_checkin_date: "<today>", ... }`. If frequency is daily, `eligible=false` because today is done. |           |
| 5.2 | Clear the day's check-in (admin DB intervention) and re-hit the status endpoint.                                                                                                                           | `eligible: true`, `last_checkin_date: null` or an earlier date.                                                                     |           |
| 5.3 | Unauthenticated `GET`                                                                                                                                                                                      | **401**.                                                                                                                            |           |
| 5.4 | Response body contains **no** staff-only fields (no flagged-queue-count, no DSL assignment, no `flag_reason`).                                                                                             | Body keys limited to the eligibility shape. Extra keys → Fail.                                                                      |           |
| 5.5 | UI surfaces the eligibility state — a disabled "Check-in" button with a friendly "You've already checked in today. See you tomorrow." when `eligible=false`. (Skip if UI not shipped — record as **O-2**.) | Behaves as described. No exposed internals.                                                                                         |           |
| 5.6 | If the tenant's `checkin_frequency` is `weekly`, `eligible=false` persists until the next window. (Requires config change; this row is informational if the fixture is daily.)                             | Behaves per config. (info)                                                                                                          |           |
| 5.7 | Rapid poll: hit `/status` 10 times in a row. No rate-limit bypass, no performance degradation (each returns < 500 ms).                                                                                     | All 200. No 5xx. No 429 unless a student-facing rate limit is in place (which is fine).                                             |           |

---

## 6. Own check-in history

Endpoint: `GET /api/v1/pastoral/checkins/my?page=1&pageSize=10`. Controller at `checkins.controller.ts:54`. Pagination via `myCheckinsQuerySchema` (inline, page 1..∞, pageSize 1..100 default 20). Service returns `{ data: CheckinResponse[], meta: { page, pageSize, total } }` per the standard shape.

| #   | What to Check                                                                                                                                                                                                                                           | Expected                                                                                                                                                                                                                                                                                   | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1 | `GET /api/v1/pastoral/checkins/my?pageSize=10`                                                                                                                                                                                                          | 200. `data` is an array of CheckinResponse, `meta.pageSize` = 10, `meta.total` ≥ 1 (has at least today's from §4.2). `data[i]` includes `{ id, checkin_date, mood_score, freeform_text, was_flagged }`.                                                                                    |           |
| 6.2 | `data[i]` keys do **NOT** include `flag_reason`, `auto_concern_id`, `reviewed_by_id`, `reviewed_at`, `notes`, `student_name`, `student_id_shown_to_staff`, `escalated_to`. (Per `CheckinResponse` shape, `flag_reason` is omitted for student callers.) | Keys exactly match the student-facing shape. Any staff-only key → Fail.                                                                                                                                                                                                                    |           |
| 6.3 | Results are sorted most-recent-first (`orderBy: { checkin_date: 'desc' }` per `checkin.service.ts:199`).                                                                                                                                                | `data[0].checkin_date` ≥ `data[1].checkin_date`.                                                                                                                                                                                                                                           |           |
| 6.4 | `pageSize=101` → clamped by schema (`max(100)`). `pageSize=0` → 400.                                                                                                                                                                                    | 400 for `0`; for `101`, Zod rejects with 400 (since the schema is `max(100)`).                                                                                                                                                                                                             |           |
| 6.5 | `page=9999` on small dataset                                                                                                                                                                                                                            | 200 with `data: []` and correct `meta.total`. No error.                                                                                                                                                                                                                                    |           |
| 6.6 | `GET /api/v1/pastoral/checkins/my?student_id=<S_BETA>` (attempt to widen scope)                                                                                                                                                                         | `student_id` is **not** in `myCheckinsQuerySchema`. Zod will strip the extra field (or reject, depending on `.strict()` usage). The service always resolves the student from `user.sub` → results are still S_ALPHA's history. Confirm by asserting `data[0].id` is one of S_ALPHA's rows. |           |
| 6.7 | Unauthenticated `GET`                                                                                                                                                                                                                                   | **401**.                                                                                                                                                                                                                                                                                   |           |
| 6.8 | UI (if shipped): renders calendar or list view with 7+ days back. Chronological. Flagged rows appear **without** flag-reason exposed to the student (just a subtle icon, or nothing at all).                                                            | Calendar/list renders. No staff-only info leaks.                                                                                                                                                                                                                                           |           |
| 6.9 | UI (if shipped): if zero history, empty state reads "No check-ins yet" with a CTA to submit today. No stack trace, no JSON blob.                                                                                                                        | Empty state friendly.                                                                                                                                                                                                                                                                      |           |

---

## 7. Flagged check-in privacy

When the freeform text hits a configured safeguarding keyword, the service writes the row with `flagged=true` and evaluates `alertService.evaluateCheckin` which enqueues the `pastoral:checkin-alert` job. The **student must see nothing** that gives away the flag — the server response to the student is intentionally redacted (`CheckinResponse` exposes `was_flagged: boolean` but **not** `flag_reason` or `auto_concern_id`; see `checkin.service.ts:170-176`). This section verifies that redaction end-to-end.

| #    | What to Check                                                                                                                                                                                                                        | Expected                                                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | First, reset today's check-in (admin DB delete from §4). Submit `{ mood_score: 1, freeform_text: "I want to hurt myself" }` (use a configured keyword — see 1.7).                                                                    | **201**. Response body: `{ id, checkin_date, mood_score: 1, freeform_text: "...", was_flagged: true }`.                                                                                               |           |
| 7.2  | Response body does **NOT** include: `flag_reason`, `auto_concern_id`, `notes`, `review_state`, `assigned_dsl`, `dsl_notified_at`, `pastoral_event_id`, `staff_visible_narrative`.                                                    | Keys strictly: `id, checkin_date, mood_score, freeform_text, was_flagged`. Any other key → Fail (privacy leak).                                                                                       |           |
| 7.3  | Toast / UI feedback after submission is **neutral** — "Thanks for sharing" or similar. No "You've been flagged", no "A counsellor will contact you", no exposure of internal routing.                                                | Neutral copy. Bonus: optionally a gentle "If you'd like to talk to someone, here's a link to support resources" — acceptable as long as it's not flag-state-dependent from the student's perspective. |           |
| 7.4  | DB row: `SELECT flagged, flag_reason, auto_concern_id FROM student_checkins WHERE id = <response.id>`.                                                                                                                               | `flagged = true`, `flag_reason` populated by the alert service, `auto_concern_id` may be populated (if auto-escalation is on). Student never saw any of these.                                        |           |
| 7.5  | BullMQ job `pastoral:checkin-alert` enqueued. Inspect Redis `bull:pastoral:*`.                                                                                                                                                       | One job present with payload containing `tenant_id`, `checkin_id`, `student_id`. No PII leak in job name. (Worker behaviour tested in `../worker/wellbeing-worker-spec.md`.)                          |           |
| 7.6  | Re-query own history via `GET /api/v1/pastoral/checkins/my`. The flagged row is returned with `was_flagged: true` but **still no** `flag_reason`.                                                                                    | Shape consistent with §6.2.                                                                                                                                                                           |           |
| 7.7  | Student tries `GET /api/v1/pastoral/checkins/flagged` (a staff endpoint) with their JWT.                                                                                                                                             | **403** — requires `pastoral.checkin.view_flagged` permission which a student does not have.                                                                                                          |           |
| 7.8  | Student tries to dismiss their own flag: `POST /api/v1/pastoral/checkins/<id>/dismiss` or `PATCH /api/v1/pastoral/checkins/<id>/review`.                                                                                             | **403** — student has no review permission. Flag stays `true`.                                                                                                                                        |           |
| 7.9  | Student tries to delete a check-in: `DELETE /api/v1/pastoral/checkins/<id>`.                                                                                                                                                         | **404** or **403** — endpoint does not exist for students, or denies. Row persists.                                                                                                                   |           |
| 7.10 | Downstream worker output (pastoral event, DSL notification) is invisible to the student. Student polls `/api/v1/pastoral/concerns?student_id=me` (or any similar endpoint) — should be 403, not a peek into an auto-created concern. | **403**. (See §12 for the full API negative matrix.)                                                                                                                                                  |           |
| 7.11 | Student's timeline / dashboard does not gain a new "Concern logged" card or similar. Counter badges in the nav (if any) unchanged.                                                                                                   | No staff-derived card appears to the student.                                                                                                                                                         |           |
| 7.12 | Submit a non-flagged check-in right after (tomorrow, or reset). `was_flagged: false` in the response. Pattern confirms we're not leaking the old flag state across submissions.                                                      | `was_flagged: false`. Clean.                                                                                                                                                                          |           |

---

## 8. Own recognition awards (speculative)

Some tenants surface a student-facing "my awards" wall. Most do not. If `GET /api/v1/behaviour/recognition/awards?student_id=me` (or a student-portal equivalent route) returns 200 for the signed-in student, run 8.1–8.6. Otherwise mark 8.1–8.6 as **N/A — UI not shipped** and run only the negative fallback in 8.7–8.9.

| #   | What to Check                                                                                                                                                                                                 | Expected                                                                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | UI (if shipped): student lands on `/{locale}/dashboard/student/recognition` or `/students/me/recognition`. Page renders a list of awards earned.                                                              | Page loads, no 403/500.                                                                                                                                                                            |           |
| 8.2 | Each award row shows: award name, reason (short, non-private), points, awarded-on date, awarder (first name + initial or "A teacher"). No private staff notes. No amendment history.                          | Read-only view, friendly copy.                                                                                                                                                                     |           |
| 8.3 | API: `GET /api/v1/behaviour/recognition/awards?student_id=<me>` or the student-scoped variant → 200. Response items do **not** include admin-only fields (`internal_reason`, `amended_at`, `moderator_note`). | Student-safe shape only.                                                                                                                                                                           |           |
| 8.4 | Student attempts `?student_id=<S_BETA>` (sibling / classmate UUID).                                                                                                                                           | **403** or empty result (if the endpoint filters by JWT). Never returns S_BETA's awards.                                                                                                           |           |
| 8.5 | Leaderboard — `GET /api/v1/behaviour/recognition/leaderboard` with student JWT.                                                                                                                               | Either **403** (leaderboard is staff-only) or a sanitised public leaderboard (anonymised first names + totals). Confirm with the product owner which is intended — record as **O-3** if ambiguous. |           |
| 8.6 | Publication approval queue: `GET /api/v1/behaviour/recognition/publication-queue` with student JWT → 403.                                                                                                     | **403**.                                                                                                                                                                                           |           |
| 8.7 | Negative fallback: student visits `/en/behaviour/recognition` (the staff wall).                                                                                                                               | **403** or redirect. See §11.                                                                                                                                                                      |           |
| 8.8 | Negative fallback: `POST /api/v1/behaviour/recognition/awards` with student JWT.                                                                                                                              | **403** — students cannot create awards.                                                                                                                                                           |           |
| 8.9 | Negative fallback: `PATCH /api/v1/behaviour/recognition/awards/<id>` with student JWT.                                                                                                                        | **403**.                                                                                                                                                                                           |           |

---

## 9. Own incidents / sanctions (speculative)

A student portal showing their own behaviour history is a privacy-sensitive surface most tenants do NOT enable. If shipped, the student sees their own incidents (filtered) and own sanctions (scheduled / served). Run 9.1–9.8 if the surface exists; otherwise mark N/A and do the negative fallback in 9.9–9.14.

| #    | What to Check                                                                                                                                                                               | Expected                                                                                                           | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1  | UI: student lands on `/{locale}/dashboard/student/behaviour` (or similar). Page lists own incidents.                                                                                        | Page loads. Only the signed-in student's incidents.                                                                |           |
| 9.2  | Each row shows: date, category, short summary, outcome. **Narrative is redacted or shortened** — the full staff narrative is not shown to a student. No staff notes, no moderation history. | Read-only, redacted view.                                                                                          |           |
| 9.3  | API: `GET /api/v1/behaviour/incidents?student_id=<me>` with student JWT. Returns only incidents where the student is a participant.                                                         | 200. All items include `<me>` as a participant. Zero items for other students.                                     |           |
| 9.4  | API: `GET /api/v1/behaviour/incidents/<id_of_my_incident>` — 200 with a student-safe projection (no internal classification notes, no reporter identity beyond "A teacher").                | Student-safe projection only.                                                                                      |           |
| 9.5  | `GET /api/v1/behaviour/incidents/<id_of_S_BETA_incident>` — student is not a participant.                                                                                                   | **403** or **404**.                                                                                                |           |
| 9.6  | Sanctions: `GET /api/v1/behaviour/sanctions?student_id=<me>` — 200 with own sanctions.                                                                                                      | Only own sanctions; statuses visible.                                                                              |           |
| 9.7  | Attempt to mark a sanction as served: `POST /api/v1/behaviour/sanctions/<id>/serve`.                                                                                                        | **403** — only staff serve sanctions.                                                                              |           |
| 9.8  | Attempt to log a new incident on self: `POST /api/v1/behaviour/incidents` with body referencing self.                                                                                       | **403**.                                                                                                           |           |
| 9.9  | Negative fallback (no UI shipped): visit `/en/behaviour/incidents`. Expect **403** / redirect.                                                                                              | **403**.                                                                                                           |           |
| 9.10 | Negative fallback: visit `/en/behaviour/sanctions`. Expect **403** / redirect.                                                                                                              | **403**.                                                                                                           |           |
| 9.11 | Negative fallback: visit `/en/behaviour/exclusions`.                                                                                                                                        | **403**.                                                                                                           |           |
| 9.12 | Negative fallback: visit `/en/behaviour/appeals`.                                                                                                                                           | **403** — appeals are parent-submitted, never student-submitted.                                                   |           |
| 9.13 | Appeal API: `POST /api/v1/behaviour/appeals` with student JWT.                                                                                                                              | **403**.                                                                                                           |           |
| 9.14 | Guardian restriction lookup: `GET /api/v1/behaviour/guardian-restrictions?student_id=<me>` with student JWT.                                                                                | **403** — this is staff / parent territory; a student should not see or alter restrictions on their own guardians. |           |

---

## 10. Staff-wellbeing survey attempt (must be blocked)

The staff-wellbeing surveys tree (`/wellbeing/staff`) is explicitly not for students — anonymity is preserved by restricting `respond/active` to staff roles. This section exists to verify that a student **cannot** slip into a survey, either via the UI or via a direct `POST /v1/staff-wellbeing/respond/:surveyId`.

| #    | What to Check                                                                                                                                | Expected                                                                                                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Student navigates to `/en/wellbeing/staff`.                                                                                                  | **403** or redirect to `/dashboard`. Never renders the staff surveys page.                                                                                                                                                      |           |
| 10.2 | Student navigates to `/en/wellbeing/surveys` (alternate alias).                                                                              | **403** / redirect.                                                                                                                                                                                                             |           |
| 10.3 | `GET /api/v1/staff-wellbeing/surveys` with student JWT.                                                                                      | **403**.                                                                                                                                                                                                                        |           |
| 10.4 | `GET /api/v1/staff-wellbeing/respond/active` with student JWT.                                                                               | **403** — the endpoint filters **by staff roles**; student roles are never included. Even if the student somehow got a 200, the response `data` array must be empty.                                                            |           |
| 10.5 | Harvest an active `surveyId` from an admin login. With student JWT, `POST /api/v1/staff-wellbeing/respond/<surveyId>` with a plausible body. | **403**. `SELECT COUNT(*) FROM survey_responses WHERE survey_id=<x> AND tenant_id=<A>` is **not** incremented by this attempt. If the count increases, that's a catastrophic anonymity bypass — immediate Fail + release-block. |           |
| 10.6 | `POST /api/v1/staff-wellbeing/surveys` (create a new survey) with student JWT.                                                               | **403**.                                                                                                                                                                                                                        |           |
| 10.7 | `GET /api/v1/staff-wellbeing/results/<surveyId>` with student JWT.                                                                           | **403**.                                                                                                                                                                                                                        |           |
| 10.8 | `GET /api/v1/staff-wellbeing/aggregate` with student JWT.                                                                                    | **403**.                                                                                                                                                                                                                        |           |

---

## 11. Negative matrix — UI

For each row, the student is signed in as `student@nhqs.test` and navigates to the listed URL. The expected outcome is **403** (or a redirect to `/dashboard` / `/403`). No redesign sub-hub surface, no settings surface, no platform-admin surface is permitted to render for a student. This matrix is the core deliverable of the spec.

| #     | URL (locale prefix `/en/` omitted for brevity)                                                                  | Expected                                                                                                                                             | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1  | `/wellbeing`                                                                                                    | **403** or redirect. Super-hub never renders for a student.                                                                                          |           |
| 11.2  | `/behaviour`                                                                                                    | **403** / redirect. Sub-hub never renders.                                                                                                           |           |
| 11.3  | `/behaviour/incidents`                                                                                          | **403**.                                                                                                                                             |           |
| 11.4  | `/behaviour/incidents/new`                                                                                      | **403**. No form renders — no student self-report path.                                                                                              |           |
| 11.5  | `/behaviour/incidents/<known_id>` (incident involving S_ALPHA)                                                  | **403** (unless the student portal in §9 is shipped, in which case a read-only student-safe projection may render. Default = 403).                   |           |
| 11.6  | `/behaviour/incidents/<known_id>` (incident NOT involving S_ALPHA)                                              | **403** / **404**.                                                                                                                                   |           |
| 11.7  | `/behaviour/sanctions`                                                                                          | **403**.                                                                                                                                             |           |
| 11.8  | `/behaviour/sanctions/today`                                                                                    | **403**.                                                                                                                                             |           |
| 11.9  | `/behaviour/exclusions`                                                                                         | **403**.                                                                                                                                             |           |
| 11.10 | `/behaviour/appeals`                                                                                            | **403**.                                                                                                                                             |           |
| 11.11 | `/behaviour/appeals/new`                                                                                        | **403**.                                                                                                                                             |           |
| 11.12 | `/behaviour/recognition`                                                                                        | **403** (admin wall). Student recognition page (if shipped) lives under a different path — see §8.                                                   |           |
| 11.13 | `/behaviour/recognition/leaderboard`                                                                            | **403** unless explicitly public.                                                                                                                    |           |
| 11.14 | `/behaviour/documents`                                                                                          | **403**.                                                                                                                                             |           |
| 11.15 | `/behaviour/tasks`                                                                                              | **403**.                                                                                                                                             |           |
| 11.16 | `/behaviour/interventions`                                                                                      | **403**.                                                                                                                                             |           |
| 11.17 | `/behaviour/analytics`                                                                                          | **403**.                                                                                                                                             |           |
| 11.18 | `/behaviour/admin`                                                                                              | **403**.                                                                                                                                             |           |
| 11.19 | `/behaviour/parent-portal`                                                                                      | **403**. Parent surfaces are parent-only.                                                                                                            |           |
| 11.20 | `/behaviour/students/<S_ALPHA>`                                                                                 | **403** (staff-side profile; the student has no reason to view their "case file" from the staff perspective).                                        |           |
| 11.21 | `/pastoral`                                                                                                     | **403** / redirect. Sub-hub never renders.                                                                                                           |           |
| 11.22 | `/pastoral/concerns`                                                                                            | **403**.                                                                                                                                             |           |
| 11.23 | `/pastoral/concerns/new`                                                                                        | **403**. (Students may need a safe "ask for help" channel, but pastoral concern logging is the staff workflow and not a student surface.)            |           |
| 11.24 | `/pastoral/cases`                                                                                               | **403**.                                                                                                                                             |           |
| 11.25 | `/pastoral/referrals`                                                                                           | **403**.                                                                                                                                             |           |
| 11.26 | `/pastoral/checkins` (the staff monitoring list)                                                                | **403** or redirect. **Never** render the staff list to a student. Verified against `apps/web/src/app/[locale]/(school)/pastoral/checkins/page.tsx`. |           |
| 11.27 | `/pastoral/checkins/flagged`                                                                                    | **403**.                                                                                                                                             |           |
| 11.28 | `/pastoral/critical-incidents`                                                                                  | **403**.                                                                                                                                             |           |
| 11.29 | `/pastoral/sst`                                                                                                 | **403**.                                                                                                                                             |           |
| 11.30 | `/pastoral/dsar`                                                                                                | **403**.                                                                                                                                             |           |
| 11.31 | `/safeguarding`                                                                                                 | **403** / redirect.                                                                                                                                  |           |
| 11.32 | `/safeguarding/concerns`                                                                                        | **403**.                                                                                                                                             |           |
| 11.33 | `/safeguarding/concerns/new`                                                                                    | **403**. Students do not self-report safeguarding — a trusted adult files on their behalf.                                                           |           |
| 11.34 | `/safeguarding/seal`                                                                                            | **403**.                                                                                                                                             |           |
| 11.35 | `/safeguarding/break-glass`                                                                                     | **403**.                                                                                                                                             |           |
| 11.36 | `/safeguarding/sla`                                                                                             | **403**.                                                                                                                                             |           |
| 11.37 | `/early-warnings`                                                                                               | **403**.                                                                                                                                             |           |
| 11.38 | `/early-warnings/cohort`                                                                                        | **403**.                                                                                                                                             |           |
| 11.39 | `/early-warnings/intervene`                                                                                     | **403**.                                                                                                                                             |           |
| 11.40 | `/wellbeing/staff`                                                                                              | **403**.                                                                                                                                             |           |
| 11.41 | `/wellbeing/surveys`                                                                                            | **403**.                                                                                                                                             |           |
| 11.42 | `/settings`                                                                                                     | **403** / redirect. Students never enter any settings surface.                                                                                       |           |
| 11.43 | `/settings/behaviour`                                                                                           | **403**.                                                                                                                                             |           |
| 11.44 | `/settings/safeguarding`                                                                                        | **403**.                                                                                                                                             |           |
| 11.45 | `/settings/ai-flags`                                                                                            | **403**.                                                                                                                                             |           |
| 11.46 | `/settings/wellbeing-notifications`                                                                             | **403**.                                                                                                                                             |           |
| 11.47 | `/admin/security-incidents` (platform admin surface)                                                            | **403** / redirect. Never rendered for tenant users, certainly not for students.                                                                     |           |
| 11.48 | `/admin/tenants` (platform admin)                                                                               | **403**.                                                                                                                                             |           |
| 11.49 | DevTools: console across §11 must be free of stack traces from permission-denial pages. Friendly 403 page only. | No noisy errors on any 403. Confirmed info-rich error page renders instead.                                                                          |           |
| 11.50 | DevTools: no outbound API call to wellbeing endpoints triggered by simply hitting a 403 page.                   | Network tab shows at most one `/v1/wellbeing/dashboard-summary` attempt returning 403. No cascade of failed data fetches.                            |           |

---

## 12. Negative matrix — API

For each row, the student sends the HTTP request directly using their JWT (bypass UI). Expected is **403** unless stated otherwise. Do not depend on the frontend to block — the backend must enforce.

| #     | Method + Path                                                    | Expected            | Pass/Fail                                                 |
| ----- | ---------------------------------------------------------------- | ------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | --- |
| 12.1  | `GET /api/v1/wellbeing/dashboard-summary`                        | **403**.            |                                                           |
| 12.2  | `POST /api/v1/behaviour/incidents`                               | **403**.            |                                                           |
| 12.3  | `GET /api/v1/behaviour/incidents`                                | **403**.            |                                                           |
| 12.4  | `PATCH /api/v1/behaviour/incidents/<id>`                         | **403**.            |                                                           |
| 12.5  | `POST /api/v1/behaviour/sanctions`                               | **403**.            |                                                           |
| 12.6  | `POST /api/v1/behaviour/sanctions/<id>/serve`                    | **403**.            |                                                           |
| 12.7  | `POST /api/v1/behaviour/exclusions`                              | **403**.            |                                                           |
| 12.8  | `POST /api/v1/behaviour/appeals`                                 | **403**.            |                                                           |
| 12.9  | `POST /api/v1/behaviour/recognition/awards`                      | **403**.            |                                                           |
| 12.10 | `PATCH /api/v1/behaviour/recognition/awards/<id>`                | **403**.            |                                                           |
| 12.11 | `GET /api/v1/behaviour/recognition/publication-queue`            | **403**.            |                                                           |
| 12.12 | `POST /api/v1/behaviour/documents/generate`                      | **403**.            |                                                           |
| 12.13 | `POST /api/v1/behaviour/tasks`                                   | **403**.            |                                                           |
| 12.14 | `GET /api/v1/behaviour/analytics/summary`                        | **403**.            |                                                           |
| 12.15 | `GET /api/v1/behaviour/admin/legal-holds`                        | **403**.            |                                                           |
| 12.16 | `POST /api/v1/pastoral/concerns`                                 | **403**.            |                                                           |
| 12.17 | `GET /api/v1/pastoral/concerns`                                  | **403**.            |                                                           |
| 12.18 | `POST /api/v1/pastoral/cases`                                    | **403**.            |                                                           |
| 12.19 | `GET /api/v1/pastoral/cases`                                     | **403**.            |                                                           |
| 12.20 | `POST /api/v1/pastoral/referrals`                                | **403**.            |                                                           |
| 12.21 | `GET /api/v1/pastoral/sst/meetings`                              | **403**.            |                                                           |
| 12.22 | `POST /api/v1/pastoral/critical-incidents`                       | **403**.            |                                                           |
| 12.23 | `GET /api/v1/pastoral/checkins` (staff list)                     | **403**.            |                                                           |
| 12.24 | `GET /api/v1/pastoral/checkins/flagged`                          | **403**.            |                                                           |
| 12.25 | `POST /api/v1/pastoral/checkins/<id>/dismiss`                    | **403**.            |                                                           |
| 12.26 | `POST /api/v1/pastoral/checkins/<id>/escalate`                   | **403**.            |                                                           |
| 12.27 | `GET /api/v1/pastoral/dsar`                                      | **403**.            |                                                           |
| 12.28 | `POST /api/v1/safeguarding/concerns`                             | **403**.            |                                                           |
| 12.29 | `GET /api/v1/safeguarding/concerns`                              | **403**.            |                                                           |
| 12.30 | `POST /api/v1/safeguarding/break-glass`                          | **403**.            |                                                           |
| 12.31 | `POST /api/v1/safeguarding/concerns/<id>/seal`                   | **403**.            |                                                           |
| 12.32 | `GET /api/v1/safeguarding/sla`                                   | **403**.            |                                                           |
| 12.33 | `GET /api/v1/early-warnings/cohort`                              | **403**.            |                                                           |
| 12.34 | `POST /api/v1/early-warnings/intervene`                          | **403**.            |                                                           |
| 12.35 | `POST /api/v1/staff-wellbeing/surveys`                           | **403**.            |                                                           |
| 12.36 | `GET /api/v1/staff-wellbeing/surveys`                            | **403**.            |                                                           |
| 12.37 | `POST /api/v1/staff-wellbeing/respond/<id>`                      | **403**.            |                                                           |
| 12.38 | `PATCH /api/v1/ai-flags/behaviour`                               | **403**.            |                                                           |
| 12.39 | `PATCH /api/v1/ai-flags/pastoral`                                | **403**.            |                                                           |
| 12.40 | `PATCH /api/v1/wellbeing/notification-channels`                  | **403**.            |                                                           |
| 12.41 | `GET /api/v1/admin/security-incidents` (platform admin)          | **403** / **404**.  |                                                           |
| 12.42 | `POST /api/v1/pastoral/concerns/<id>/amend`                      | **403**.            |                                                           |
| 12.43 | `GET /api/v1/behaviour/settings/categories`                      | **403**.            |                                                           |
| 12.44 | `PATCH /api/v1/behaviour/settings/categories/<id>`               | **403**.            |                                                           |
| 12.45 | `GET /api/v1/behaviour/settings/policies`                        | **403**.            |                                                           |
| 12.46 | `POST /api/v1/behaviour/settings/houses`                         | **403**.            |                                                           |
| 12.47 | `GET /api/v1/safeguarding/settings/keywords`                     | **403**.            |                                                           |
| 12.48 | `GET /api/v1/safeguarding/settings/break-glass-reasons`          | **403**.            |                                                           |
| 12.49 | `POST /api/v1/pastoral/historical-import`                        | **403**.            |                                                           |
| 12.50 | Response shape on every 403 above: `{ error: { code: "FORBIDDEN" | "PERMISSION_DENIED" | "MODULE_DISABLED", message } }`. No stack traces, no PII. | All 403s follow the structured error shape. (§18.2 re-asserts.) |     |

---

## 13. Cross-student isolation

The JWT-scoped endpoints (`checkins/my`, `checkins/status`) are trivially safe because the server reads `user.sub`. But the matrix below verifies that any attempt to **widen** scope via body/query parameters is ignored, and that direct UUID targeting for other students returns 403/404.

| #    | What to Check                                                                                                                                                                         | Expected                                                                                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Signed-in as S_ALPHA's user. `GET /api/v1/pastoral/checkins/my?student_id=<S_BETA>&pageSize=5`.                                                                                       | Server ignores `student_id`. Response contains only S_ALPHA's rows. `data[i].id` in the set of known S_ALPHA check-in IDs.                                                                                 |           |
| 13.2 | Same signed-in user. Harvest one of S_BETA's known check-in IDs from admin context. `GET /api/v1/pastoral/checkins/<that_id>`. (Endpoint may not exist for student; test regardless.) | **404** or **403**. **Never** return S_BETA's body. If a 200 is returned containing S_BETA data, that's a catastrophic leakage — Fail + release-block.                                                     |           |
| 13.3 | `POST /api/v1/pastoral/checkins { mood_score: 3, freeform_text: "...", student_id: <S_BETA> }` (hostile body).                                                                        | **201** — the DB row is written as S_ALPHA (server ignores `student_id`). Confirm via `SELECT student_id FROM student_checkins WHERE id = <new>` — value = `<S_ALPHA>`, not S_BETA. No leaking write-path. |           |
| 13.4 | `GET /api/v1/behaviour/incidents/<S_BETA_incident_id>` (an incident in which S_ALPHA has no role).                                                                                    | **403** / **404**. Never S_BETA's incident body.                                                                                                                                                           |           |
| 13.5 | `GET /api/v1/behaviour/recognition/awards?student_id=<S_BETA>`.                                                                                                                       | **403** or empty result. Never S_BETA's awards. If §8 ships a student recognition endpoint, confirm it hard-scopes to the signed-in student.                                                               |           |
| 13.6 | `GET /api/v1/pastoral/checkins/status?student_id=<S_BETA>`.                                                                                                                           | Server ignores `student_id`. Status reflects S_ALPHA's state.                                                                                                                                              |           |
| 13.7 | Sign in as `student-other@nhqs.test` (S_BETA's user). `GET /api/v1/pastoral/checkins/my`. Confirm none of S_ALPHA's rows appear.                                                      | Response contains only S_BETA's rows. Zero overlap with S_ALPHA set.                                                                                                                                       |           |
| 13.8 | As S_BETA user: `GET /api/v1/pastoral/checkins/<S_ALPHA_checkin_id>`.                                                                                                                 | **403** / **404**.                                                                                                                                                                                         |           |
| 13.9 | DB audit: `SELECT id, tenant_id, student_id FROM student_checkins WHERE id IN (<new rows from this spec>)`. Every `student_id` matches the JWT user, never a body-supplied one.       | Zero rows where `student_id` ≠ JWT user's linked student id.                                                                                                                                               |           |

---

## 14. Cross-tenant hostile check

The student in Tenant A (NHQS) attempts any Tenant B UUID (captured in §1.10). Because RLS is enforced at the DB layer and the JWT carries Tenant A as context, nothing should resolve.

| #    | What to Check                                                                                                          | Expected                                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | `GET /api/v1/pastoral/checkins/<B_checkin_id>`.                                                                        | **403** / **404**. No RLS bypass. Response body does not leak Tenant B data.                                                            |           |
| 14.2 | `GET /api/v1/behaviour/incidents/<B_incident_id>`.                                                                     | **403** / **404**.                                                                                                                      |           |
| 14.3 | `GET /api/v1/pastoral/concerns/<B_concern_id>`.                                                                        | **403** / **404**.                                                                                                                      |           |
| 14.4 | `GET /api/v1/safeguarding/concerns/<B_safeguarding_id>`.                                                               | **403** / **404**.                                                                                                                      |           |
| 14.5 | `POST /api/v1/pastoral/checkins` with `tenant_id: <B>` in the body (hostile).                                          | Body `tenant_id` ignored. Row is written to Tenant A. Confirm via `SELECT tenant_id FROM student_checkins WHERE id = <new>` → A, not B. |           |
| 14.6 | `GET /api/v1/pastoral/checkins/my` returns only Tenant A rows. Zero rows with `tenant_id = <B>`.                       | Zero leak.                                                                                                                              |           |
| 14.7 | Host header / origin mangling — set `Origin: https://acme-test.edupod.app` with Tenant A JWT. Expect no tenant switch. | Server resolves tenant from JWT, not origin. Same behaviour as without the header.                                                      |           |
| 14.8 | Sub-domain probe — `GET https://acme-test.edupod.app/api/v1/pastoral/checkins/my` with Tenant A JWT.                   | **403** or **401** — the auth layer rejects a token whose tenant does not match the resolved sub-domain.                                |           |

---

## 15. Arabic / RTL spot check

Same student account, but URL prefix `/ar/*`. Arabic and English share the same routes and data model; only translations and direction differ.

| #    | What to Check                                                                                                                            | Expected                                                                                                                  | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | `GET https://nhqs.edupod.app/ar/dashboard` with student JWT.                                                                             | Page renders RTL. `<html dir="rtl">`. No physical directional classes; spacing uses `ps-`/`pe-`/`ms-`/`me-`.              |           |
| 15.2 | Student check-in form (if shipped) loads with Arabic labels. Mood slider labels read right-to-left.                                      | All strings in Arabic. No raw translation keys like `wellbeing.checkin.mood` leaking through.                             |           |
| 15.3 | Submit a check-in with Arabic freeform: `{ mood_score: 4, freeform_text: "يوم جيد" }`.                                                   | **201**. `SELECT freeform_text FROM student_checkins WHERE id = <new>` returns the Arabic string verbatim, byte-for-byte. |           |
| 15.4 | History view shows the Arabic freeform correctly rendered RTL, not mangled into LTR.                                                     | Rendering is RTL for Arabic text; date formats are Western numerals (0-9) and Gregorian — per frontend convention.        |           |
| 15.5 | Mixed-language string: `{ mood_score: 3, freeform_text: "Today was OK — اليوم كان جيد" }`. Storage and round-trip preserve both scripts. | Verbatim round-trip. Bidi rendering correct.                                                                              |           |
| 15.6 | 409 duplicate toast from §4.4 is translated in Arabic.                                                                                   | Arabic text. No "CHECKIN_ALREADY_SUBMITTED" raw code leaking.                                                             |           |
| 15.7 | Nav bar / morph bar does not suddenly reveal admin surfaces when locale changes.                                                         | Same student-tier chrome.                                                                                                 |           |
| 15.8 | Arabic 403 page renders for any §11 URL.                                                                                                 | Translated, RTL.                                                                                                          |           |

---

## 16. Mobile walkthrough (375×812)

iPhone SE emulation, portrait. This is the canonical min-width for the product.

| #    | What to Check                                                                                                                                                 | Expected                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Student dashboard at 375×812. No horizontal scrollbar.                                                                                                        | Content fits. `min-w-0` confirmed on flex containers.                                                                       |           |
| 16.2 | Morph bar collapses to hamburger; opening the overlay does **not** surface any wellbeing/admin destinations.                                                  | Overlay shows only student-appropriate nav.                                                                                 |           |
| 16.3 | Check-in form (if shipped) fits in 375px width: mood slider is tappable (≥ 44px target), freeform textarea is `w-full`, submit button is full-width at `sm:`. | All interactive elements pass the 44×44 tap target rule. Textarea does not auto-zoom on focus (`text-base` / 16px minimum). |           |
| 16.4 | Own history view (if shipped): calendar collapses to a list. Each item is a tappable row.                                                                     | List renders; rows are full width; no truncated content due to fixed pixel widths.                                          |           |
| 16.5 | Rotate to landscape (812×375). No layout breakage.                                                                                                            | Content reflows.                                                                                                            |           |
| 16.6 | Emulate slow 3G + mid-tier CPU. Submit a check-in. UX is still responsive — skeleton state while in-flight, no double-submit possible.                        | Double-submit prevention via disabled button on submit. Skeleton or spinner visible.                                        |           |
| 16.7 | Attempt direct URL navigation to `/en/wellbeing` on mobile.                                                                                                   | 403 page renders full-width. No overlapping text. No cut-off buttons.                                                       |           |
| 16.8 | Arabic at 375×812: form labels and errors still fit without overflow. Logical-property margins keep gutters correct when RTL.                                 | No `ml-`/`mr-` sightings. Flip is seamless.                                                                                 |           |

---

## 17. Backend endpoint map

A compact reference for the tester. Green rows are the only endpoints the student can reach successfully; everything under "Negatively asserted" returns 403/404.

**Positively reachable (student JWT):**

| Method | Path                               | Controller                              | Notes                                                                                                                                       |
| ------ | ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/pastoral/checkins`        | `checkins.controller.ts` → `submit`     | Auth + module-enabled guards only. Student identity resolved from JWT, not body. Dedup via `@@unique(tenant_id, student_id, checkin_date)`. |
| GET    | `/api/v1/pastoral/checkins/my`     | `checkins.controller.ts` → `myCheckins` | Pagination via `myCheckinsQuerySchema`. Returns student-safe `CheckinResponse` only (no `flag_reason`, no `auto_concern_id`).               |
| GET    | `/api/v1/pastoral/checkins/status` | `checkins.controller.ts` → `status`     | Returns `{ eligible, last_checkin_date, ... }`.                                                                                             |

**Negatively asserted (student JWT must receive 403/404) — at least 20 distinct endpoints:**

| Method | Path                                              | Notes                                                                                                |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/wellbeing/dashboard-summary`             | Admin surface.                                                                                       |
| POST   | `/api/v1/behaviour/incidents`                     | Staff-only write.                                                                                    |
| GET    | `/api/v1/behaviour/incidents`                     | List is staff-scoped.                                                                                |
| PATCH  | `/api/v1/behaviour/incidents/:id`                 | Staff mutation.                                                                                      |
| POST   | `/api/v1/behaviour/sanctions`                     | Staff-only.                                                                                          |
| POST   | `/api/v1/behaviour/sanctions/:id/serve`           | Staff-only.                                                                                          |
| POST   | `/api/v1/behaviour/exclusions`                    | Staff-only.                                                                                          |
| POST   | `/api/v1/behaviour/appeals`                       | Parent-only write. Students never submit.                                                            |
| POST   | `/api/v1/behaviour/recognition/awards`            | Staff-only.                                                                                          |
| GET    | `/api/v1/behaviour/recognition/publication-queue` | Staff-only.                                                                                          |
| POST   | `/api/v1/pastoral/concerns`                       | Staff-only.                                                                                          |
| GET    | `/api/v1/pastoral/concerns`                       | Staff-only.                                                                                          |
| POST   | `/api/v1/pastoral/cases`                          | Staff-only.                                                                                          |
| POST   | `/api/v1/pastoral/referrals`                      | Staff-only.                                                                                          |
| GET    | `/api/v1/pastoral/checkins`                       | Staff monitoring list.                                                                               |
| GET    | `/api/v1/pastoral/checkins/flagged`               | Staff-only.                                                                                          |
| POST   | `/api/v1/pastoral/checkins/:id/dismiss`           | Staff-only.                                                                                          |
| POST   | `/api/v1/pastoral/checkins/:id/escalate`          | Staff-only.                                                                                          |
| POST   | `/api/v1/safeguarding/concerns`                   | DSL-only.                                                                                            |
| GET    | `/api/v1/safeguarding/concerns`                   | DSL-only.                                                                                            |
| POST   | `/api/v1/safeguarding/break-glass`                | Dual-control, admin-only.                                                                            |
| POST   | `/api/v1/safeguarding/concerns/:id/seal`          | Dual-control, admin-only.                                                                            |
| GET    | `/api/v1/early-warnings/cohort`                   | Admin-only.                                                                                          |
| POST   | `/api/v1/staff-wellbeing/surveys`                 | Admin-only.                                                                                          |
| POST   | `/api/v1/staff-wellbeing/respond/:surveyId`       | **Staff-only by role filter** — student anonymity preservation depends on this. §10.5 is the canary. |
| GET    | `/api/v1/staff-wellbeing/results/:surveyId`       | Admin-only.                                                                                          |
| PATCH  | `/api/v1/ai-flags/:moduleKey`                     | Admin-only.                                                                                          |
| PATCH  | `/api/v1/wellbeing/notification-channels`         | Admin-only.                                                                                          |
| GET    | `/api/v1/behaviour/admin/legal-holds`             | Admin-only.                                                                                          |
| POST   | `/api/v1/pastoral/critical-incidents`             | Admin-only.                                                                                          |

---

## 18. DevTools console & network health

Across the full student walkthrough:

| #    | What to Check                                                                                                                                         | Expected                               | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 18.1 | Zero `error` or `warn` severity console entries. No `Missing key:` (i18n), no React key warnings, no uncaught promise rejections.                     | Console clean.                         |           |
| 18.2 | Every positive API response is `200`/`201`. Every negative row is `401`/`403`/`404`/`409` as stated. No `500`.                                        | Classes match expectations.            |           |
| 18.3 | No PII in URLs — no student names, no freeform text in query strings.                                                                                 | URL hygiene.                           |           |
| 18.4 | Error responses are always `{ error: { code, message } }`. No stack traces, no Prisma error dumps, no SQL fragments.                                  | Shape consistent.                      |           |
| 18.5 | `GET /status` and `GET /my` cache correctly (`Cache-Control: private, no-store` or similar). No intermediate cache is storing another student's data. | Cache headers present and restrictive. |           |
| 18.6 | No polling loop faster than 30 s. Network tab shows no runaway repeating requests.                                                                    | No polling abuse.                      |           |
| 18.7 | Localhost / dev-only headers absent in production (no `x-debug`, no `server-timing`).                                                                 | Clean production headers.              |           |

---

## 19. Data invariants — post-conditions

After running §4–§7, assert:

| #    | What to run (SQL)                                                                                                                                       | Expected                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 19.1 | `SELECT COUNT(*) FROM student_checkins WHERE tenant_id=<A> AND student_id=<S_ALPHA> AND checkin_date=CURRENT_DATE`                                      | Exactly **1** (after §4.2; stays 1 after the §4.4 duplicate attempt). |           |
| 19.2 | `SELECT mood_score, freeform_text FROM student_checkins WHERE id=<new>` after §4.4                                                                      | Still the original values from §4.2 (duplicate did not overwrite).    |           |
| 19.3 | `SELECT flagged FROM student_checkins WHERE id=<flagged_new>` after §7                                                                                  | `true`.                                                               |           |
| 19.4 | `SELECT COUNT(*) FROM student_checkins WHERE tenant_id=<A> AND student_id IN (<S_ALPHA>,<S_BETA>) AND tenant_id != <A>`                                 | **0** — no cross-tenant leakage.                                      |           |
| 19.5 | `SELECT COUNT(*) FROM student_checkins WHERE tenant_id=<A> AND student_id=<S_BETA> AND created_at > <spec_start>` after S_ALPHA's hostile §13.3 attempt | **0** — hostile body-supplied student_id was ignored.                 |           |
| 19.6 | `SELECT COUNT(*) FROM survey_responses WHERE tenant_id=<A> AND created_at > <spec_start>` after §10.5 hostile attempt                                   | **0** — student could not slip into the staff survey.                 |           |
| 19.7 | BullMQ queue `pastoral:checkin-alert` has exactly **one** new job after §7.1 (the flagged check-in). Zero new jobs after §4.2 (neutral).                | Matches.                                                              |           |
| 19.8 | `SELECT relforcerowsecurity FROM pg_class WHERE relname='student_checkins'`                                                                             | `true`.                                                               |           |

---

## 20. Observations

Log anything the tester notices that is not a hard Fail but warrants follow-up. Seed list (populate during execution):

- **S-1** — **Student check-in page not yet shipped** on the school-facing web app. The `/pastoral/checkins` page is the staff monitoring view (see `apps/web/src/app/[locale]/(school)/pastoral/checkins/page.tsx`). Confirm with product whether a student-facing tile/page should ship before GA.
- **S-2** — **Student portal for incidents/recognition/sanctions not shipped.** §8 and §9 collapse to API-only assertions. If the product intends to surface these to students, design and spec are needed.
- **S-3** — **`POST /v1/pastoral/checkins` is permission-less** (only `AuthGuard` + `ModuleEnabledGuard`, no `@RequiresPermission`). That's deliberate — any student with `pastoral` enabled can check in. Confirm the threat model: nothing is exposed because identity is JWT-derived and the unique constraint prevents spam. Worth a one-line comment in the controller so future readers don't add a permission by mistake.
- **S-4** — **Student-facing flagged state** — the student learns `was_flagged: true` in the response but never sees why. Confirm with product whether the student should see **anything** acknowledging the flag (a gentle "a trusted adult may reach out") or whether it should be fully silent. Current behaviour is silent, which matches safeguarding best practice.
- **S-5** — **Eligibility status UX** — when `eligible=false`, the UI (if shipped) may render as "You've already checked in today". Consider whether allowing students to edit today's check-in should be supported, or whether the daily-lock is intentional. As of today, locked is the design.
- **S-6** — **Body-ignored `student_id`** — the controller ignores a body-supplied `student_id` because the service passes `user.sub` twice (`submitCheckin(tenant_id, user.sub, user.sub, dto)`). That's defence-in-depth, but it's not documented on the endpoint. If someone later adds a staff override path, they must be careful not to accept body-supplied student IDs from student-role callers.
- **S-7** — **Cross-student `?student_id=` query on `/my`** — the query schema does not explicitly reject unknown fields. Zod's default is to strip unknown keys, but some code paths use `.strict()`. Confirm the schema behaviour: at minimum, a 200 response returning **only the signed-in student's rows** is sufficient; a 400 on unknown fields would be stricter.
- **S-8** — **Student recognition read endpoint** — §8 speculates about `GET /api/v1/behaviour/recognition/awards?student_id=<me>`. Today this endpoint is staff-only. If a student-facing variant is shipped, confirm it strictly ignores body/query `student_id` and reads only from JWT.

---

## 21. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |
