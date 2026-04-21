# Wellbeing — E2E Test Specification (Teacher perspective)

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Perspective:** Teacher tier — `school_teacher`. The teacher holds a **logical, scoped** permission set: they can **log** behaviour incidents, **view** incidents for students they teach, **report** safeguarding concerns (but not view/manage the Tier-3 sub-hub), **log** tier 1/2 pastoral concerns, acknowledge early-warning flags for their taught students, and read their own staff-wellbeing workload. They do **not** have admin/manage permissions (sanctions, exclusions, appeals, critical incidents, DSAR, retention, safeguarding seal/break-glass, AI flag toggling, or settings pages).
> **Logical permission set (what this spec tests against, regardless of whether every key is wired today):**
> `behaviour.log`, `behaviour.view` (scoped to taught students), `behaviour.view_sensitive` (same scope), `behaviour.ai_query` (flag-gated), `pastoral.log_concern`, `pastoral.view_tier1`, `pastoral.view_tier2`, `safeguarding.report`, `early_warning.view` (scoped), `early_warning.acknowledge` (scoped), `wellbeing.view_own_workload`, `wellbeing.view_dashboard`.
> **Out of permission set:** `behaviour.manage`, `behaviour.admin`, `pastoral.manage_cases`, `pastoral.manage_interventions`, `pastoral.manage_referrals`, `pastoral.critical_incidents`, `pastoral.dsar`, `safeguarding.dedicated_view`, `safeguarding.manage`, `safeguarding.seal`, `safeguarding.break_glass`, `early_warning.assign`, `early_warning.configure`, `wellbeing.view_aggregate`, `wellbeing.manage_surveys`, `wellbeing.manage_resources`, `ai_flag.manage`, `wellbeing_notifications.configure`, platform-owner scopes.
> **Pages covered (teacher visible surface):** ~18 pages — wellbeing super-hub, behaviour sub-hub + incident log/list/detail, AI analytics (flag-gated), pastoral sub-hub + concern log/list, safeguarding concern log only, early-warning list + student detail (scoped), staff-wellbeing folded page (own workload + survey participation). Plus ~30 URLs tested as **negative** (403 / hidden).
> **Base URL:** `https://nhqs.edupod.app`
> **Test fixture tenant:** Nurul Huda School (NHQS), slug `nhqs`
> **Companion specs:** `admin_view/`, `parent_view/`, `student_view/`, `integration/`, `worker/`, `perf/`, `security/` — see `RELEASE-READINESS.md`.
> **Tester note on permission drift:** the current role-permission grants for `school_teacher` may be incomplete in production (many wellbeing permissions were added late in the rebuild). **This spec encodes the logical model** — tester treats 403s that contradict the logical grid as observations to be raised with the PLAN owner, not automatic failures. Conversely, any access the teacher gets that the logical grid denies is a **real failure** (escalation risk).

---

## How to use this spec

Every row is one observable check. Mark **Pass / Fail / Blocked** in the rightmost column. A `Fail` on any row where severity is unspecified is a release blocker. Rows explicitly labelled `(info)` are diagnostic and do not block release.

Run this spec top-to-bottom in a fresh browser session per locale (once in `/en/*`, once in `/ar/*`). Keep DevTools open with the **Network** and **Console** tabs visible — both are asserted on.

**Single teacher session.** Unlike the admin spec, this pack needs only one browser session authenticated as `teacher@nhqs.test`. A second admin session is still helpful to reset seed data between negative runs.

Reference the admin spec (`../admin_view/wellbeing-e2e-spec.md`) when a flow is structurally identical — this teacher spec focuses on **scoping** and **permission-denied** rows that the admin spec skips. Where a cell says "See admin spec §N for the full walkthrough; teacher assertions differ at these rows", the tester is expected to run the admin walkthrough as a baseline and then apply the teacher deltas here.

---

## Table of contents

1. [Prerequisites & teacher fixture](#1-prerequisites--teacher-fixture)
2. [Out of scope for this spec](#2-out-of-scope-for-this-spec)
3. [Morph bar — Wellbeing pill & navigation (teacher)](#3-morph-bar--wellbeing-pill--navigation-teacher)
4. [Wellbeing super-hub `/wellbeing` — teacher scoped view](#4-wellbeing-super-hub-wellbeing--teacher-scoped-view)
5. [Behaviour sub-hub `/behaviour` — teacher scoped view](#5-behaviour-sub-hub-behaviour--teacher-scoped-view)
6. [Behaviour — incident logging (`/behaviour/incidents/new`)](#6-behaviour--incident-logging-behaviourincidentsnew)
7. [Behaviour — incident list & detail (scoped read, limited mutations)](#7-behaviour--incident-list--detail-scoped-read-limited-mutations)
8. [Behaviour — scope negative matrix](#8-behaviour--scope-negative-matrix)
9. [Behaviour — AI analytics (`/behaviour/analytics/ai`) flag-gated](#9-behaviour--ai-analytics-behaviouranalyticsai-flag-gated)
10. [Behaviour — admin-only surfaces (negative matrix)](#10-behaviour--admin-only-surfaces-negative-matrix)
11. [Pastoral sub-hub `/pastoral` — teacher scoped view](#11-pastoral-sub-hub-pastoral--teacher-scoped-view)
12. [Pastoral — concern logging (`/pastoral/concerns/new`)](#12-pastoral--concern-logging-pastoralconcernsnew)
13. [Pastoral — tier 1/2 viewing + admin-only negatives](#13-pastoral--tier-12-viewing--admin-only-negatives)
14. [Safeguarding — report-only access](#14-safeguarding--report-only-access)
15. [Safeguarding — admin-only surfaces (negative matrix)](#15-safeguarding--admin-only-surfaces-negative-matrix)
16. [Early warnings `/early-warnings` — teacher scoped view](#16-early-warnings-early-warnings--teacher-scoped-view)
17. [Staff wellbeing `/wellbeing/staff` — personal workload only](#17-staff-wellbeing-wellbeingstaff--personal-workload-only)
18. [Staff wellbeing — anonymous survey participation](#18-staff-wellbeing--anonymous-survey-participation)
19. [Settings negative matrix](#19-settings-negative-matrix)
20. [Platform admin negative](#20-platform-admin-negative)
21. [Arabic / RTL spot check](#21-arabic--rtl-spot-check)
22. [Mobile walkthrough (375×812)](#22-mobile-walkthrough-375812)
23. [Cross-tenant hostile check](#23-cross-tenant-hostile-check)
24. [Backend endpoint map (teacher-touched)](#24-backend-endpoint-map-teacher-touched)
25. [DevTools console & network health](#25-devtools-console--network-health)
26. [Data invariants — post-conditions per flow](#26-data-invariants--post-conditions-per-flow)
27. [Observations spotted during the walkthrough](#27-observations-spotted-during-the-walkthrough)
28. [Sign-off](#28-sign-off)

---

## 1. Prerequisites & teacher fixture

Re-uses the Tenant A (NHQS) fixture from the admin spec. One additional teacher user, plus seed data carefully split between the teacher's **taught** cohort and students **outside** their cohort so the negative matrix has something to test.

| #    | What to Check                                                                                                                                                                                                                                         | Expected                                                                                                                                                                                                      | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | **Tenant A — NHQS** exists with slug `nhqs`, all wellbeing modules enabled (see admin spec §1.1–§1.2).                                                                                                                                                | Modules active.                                                                                                                                                                                               |           |
| 1.2  | **Teacher user** `teacher@nhqs.test` seeded with role `school_teacher`, password `Password123!`, tenant-membership to Tenant A only.                                                                                                                  | `SELECT id FROM users WHERE email='teacher@nhqs.test'` returns one row; `tenant_memberships` links to Tenant A with role_key=`school_teacher`.                                                                |           |
| 1.3  | **Staff profile** for the teacher exists with `staff_type='teaching'`, active employment, linked to the user via `user_id`.                                                                                                                           | `SELECT id FROM staff_profiles WHERE user_id=<teacher> AND tenant_id=<A>` returns one row with `staff_type='teaching'`.                                                                                       |           |
| 1.4  | **Class-teacher assignment** — teacher is `class_teacher_of_class` for **Class 5B** (approx 25 students). Row in `class_assignments` or equivalent table (depending on schema) with `role='class_teacher'` and `class_id=<5B>`.                       | `SELECT COUNT(*) FROM class_assignments WHERE staff_id=<teacher> AND class_id=<5B> AND role='class_teacher'` = 1.                                                                                             |           |
| 1.5  | **Subject-teacher assignments** — teacher is subject-teacher of **Science** in Class 6A and Class 6B (approx 50 extra students across those two classes, distinct from 5B).                                                                           | Two rows with `role='subject_teacher'`, `subject='Science'`, `class_id` in {6A, 6B}.                                                                                                                          |           |
| 1.6  | **Students in scope** — the union of students in 5B ∪ Science-6A ∪ Science-6B ≥ 50. Record the full list of in-scope `student_id`s for later URL tests.                                                                                               | Seed list saved alongside spec answers.                                                                                                                                                                       |           |
| 1.7  | **Students out of scope** — at least **10 students** exist in Tenant A who are NOT in any class the teacher is assigned to (e.g. Year 1 / Year 10 cohorts, or other Year-5 class 5A). Record these UUIDs for negative URL tests.                      | 10 UUIDs saved.                                                                                                                                                                                               |           |
| 1.8  | **Seed incidents — in-scope** — ≥ 5 behaviour incidents exist on in-scope students (mix of teacher-reported and other-staff-reported). At least 1 incident is for 5B, at least 1 is for a Science 6A student, at least 1 is for a Science 6B student. | `SELECT COUNT(*) FROM behaviour_incidents bi JOIN behaviour_incident_students bis ON bis.incident_id=bi.id WHERE bis.student_id IN (<in-scope>)` ≥ 5. Mix of `reported_by` values (some teacher, some other). |           |
| 1.9  | **Seed incidents — out of scope** — ≥ 3 behaviour incidents exist on OUT-of-scope students (for negative URL probes in §8).                                                                                                                           | ≥ 3 such incidents, UUIDs captured.                                                                                                                                                                           |           |
| 1.10 | **Seed pastoral concerns** — ≥ 2 tier-1 concerns, ≥ 2 tier-2 concerns, ≥ 2 tier-3 concerns. At least one of each tier is on an in-scope student; at least one of each tier is on an out-of-scope student.                                             | 6 concerns minimum, well distributed.                                                                                                                                                                         |           |
| 1.11 | **Seed safeguarding concerns** — ≥ 3 safeguarding concerns exist (mix of statuses). Teacher is not the reporter on any of them at seed time (so §14 can validate teacher cannot see others' reports).                                                 | ≥ 3, all reported by non-teacher users.                                                                                                                                                                       |           |
| 1.12 | **Seed early-warning profiles** — ≥ 15 students with tier `amber` or `red`. At least 8 are in the teacher's scope; at least 7 are out of scope.                                                                                                       | `SELECT COUNT(*) FROM student_risk_profiles WHERE current_tier IN (2,3)` ≥ 15.                                                                                                                                |           |
| 1.13 | **Seed staff-wellbeing survey** — ≥ 1 active survey with the teacher eligible to respond. Teacher has NOT yet submitted a response at seed time.                                                                                                      | 1 active survey; 0 responses from teacher.                                                                                                                                                                    |           |
| 1.14 | **AI flags** — behaviour AI flag OFF initially; tester will toggle ON and OFF via admin session to exercise §9.                                                                                                                                       | `tenant_ai_flags` row for `behaviour` has `enabled=false` at seed.                                                                                                                                            |           |
| 1.15 | **RLS enabled** on every tenant-scoped table (see admin spec §1.9).                                                                                                                                                                                   | 54 tables FORCE RLS.                                                                                                                                                                                          |           |
| 1.16 | **Hostile cross-tenant pair** — record one behaviour-incident UUID, one pastoral-concern UUID, one safeguarding-concern UUID from Tenant B for §23.                                                                                                   | 3 UUIDs saved.                                                                                                                                                                                                |           |
| 1.17 | **Browser:** Chromium-based, viewport 1440×900 for desktop; repeat §22 at 375×812.                                                                                                                                                                    | Spec passes in both.                                                                                                                                                                                          |           |
| 1.18 | **Locales:** run twice — `/en/*` then `/ar/*`. RTL assertions in §21.                                                                                                                                                                                 | Both runs complete.                                                                                                                                                                                           |           |

### 1.19 Login primer

| #      | Action                                                                                                                                                | Expected                                                                                                                                     | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.19.1 | Navigate to `https://nhqs.edupod.app/en/login`. Sign in as `teacher@nhqs.test` / `Password123!`.                                                      | Redirects to `/en/dashboard`. Morph bar visible with a **reduced** hub set (no platform-admin pill; no Settings pill for teachers — see §3). |           |
| 1.19.2 | Inspect `auth.user` via DevTools: `tenant_id=<A>`, `role_key='school_teacher'`. Tokens held in memory only.                                           | JWT NOT in `localStorage` / `sessionStorage`.                                                                                                |           |
| 1.19.3 | Navigate once to `/en/wellbeing` — confirm the page loads for the teacher (no 403). This validates `wellbeing.view_dashboard` is effectively granted. | 200; super-hub renders.                                                                                                                      |           |

---

## 2. Out of scope for this spec

This spec exercises the UI-visible surface of the wellbeing umbrella as a **teacher** clicking through the school shell. It does **NOT** cover:

- **RLS and cross-tenant isolation matrix** → `../integration/wellbeing-integration-spec.md` (the integration spec fuzzes every tenant-scoped table).
- **API contract edges** → `../integration/wellbeing-integration-spec.md` (every Zod boundary, every state-machine invalid transition, every permission-denial variant per endpoint).
- **Webhook signature + idempotency** → N/A (no inbound webhooks in the wellbeing umbrella).
- **Concurrency / race conditions** → `../integration/wellbeing-integration-spec.md`.
- **BullMQ jobs, cron, dead-letter** → `../worker/wellbeing-worker-spec.md`.
- **Load / throughput / latency** → `../perf/wellbeing-perf-spec.md`.
- **Security hardening** (permission matrix × role × endpoint grid) → `../security/wellbeing-security-spec.md`.
- **Admin, parent, student perspectives** → `../admin_view/`, `../parent_view/`, `../student_view/`.
- **PDF byte-level correctness** — integration spec handles this.
- **Browser / device matrix beyond Chromium + 375px** — defer to manual QA cycle.
- **Accessibility audits** beyond structural checks (alt, keyboard focus, aria-labels).
- **Visual regression** — no pixel diffs.
- **Admin-only flows** (sanctions lifecycle, exclusions, appeals, critical incidents, DSAR, seal, break-glass, settings CRUD) — those are the admin spec's responsibility; this spec only confirms the teacher **cannot** reach those surfaces.

---

## 3. Morph bar — Wellbeing pill & navigation (teacher)

The wellbeing umbrella **does not use a sub-strip**. The Wellbeing pill drops the teacher onto `/wellbeing`; from there navigation is by hub tiles. See admin spec §3 for the full shell checklist; teacher differences below.

| #   | What to Check                                                                                                                                                                                                                            | Expected                                                                                              | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Morph bar renders on `/en/dashboard`. Teacher sees **no** "Settings" pill and **no** platform-admin pill. Other academic hubs (Students, Attendance, Academic, etc.) may render per their own permission rules — those are out of scope. | No Settings pill; no platform-admin pill. Wellbeing pill present.                                     |           |
| 3.2 | Click **Wellbeing**.                                                                                                                                                                                                                     | URL changes to `/en/wellbeing`. Morph bar does NOT remount. No sub-strip appears under the morph bar. |           |
| 3.3 | Scroll the page — morph bar stays sticky.                                                                                                                                                                                                | Morph bar pinned. No layout jank.                                                                     |           |
| 3.4 | Browser back after entering `/en/wellbeing`.                                                                                                                                                                                             | URL returns to `/en/dashboard`. Super-hub not remounted.                                              |           |
| 3.5 | Keyboard tab through the morph bar — focus ring visible on each pill.                                                                                                                                                                    | Focus ring rendered. `Enter` activates.                                                               |           |
| 3.6 | Confirm NO dead sub-strip renders beneath the bar on any `/wellbeing/*`, `/behaviour/*`, `/pastoral/*`, `/safeguarding/*`, or `/early-warnings/*` route.                                                                                 | No horizontal sub-strip. Flag any sighting as a regression.                                           |           |
| 3.7 | If command palette is configured, `/` opens it — teacher's global-search results should be scoped (no cross-tenant, no out-of-scope students surfaced in quick nav).                                                                     | Scoped results. If palette not shipped, flag as observation, do not fail.                             |           |

---

## 4. Wellbeing super-hub `/wellbeing` — teacher scoped view

**URL:** `/{locale}/wellbeing`
**Permission:** `wellbeing.view_dashboard` (logical: teacher holds)
**Primary API:** `GET /api/v1/wellbeing/dashboard-summary`

### 4.1 Page chrome

| #     | What to Check                                                                                                                                                                                                                       | Expected                                                                                                                                                | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Header reads **"Wellbeing & Safeguarding"** with subtitle.                                                                                                                                                                          | Translation keys `wellbeingHub.title`, `wellbeingHub.description` resolve.                                                                              |           |
| 4.1.2 | Single API call on mount: `GET /api/v1/wellbeing/dashboard-summary`. Response 200 within 500ms.                                                                                                                                     | One call. No per-hub fan-out.                                                                                                                           |           |
| 4.1.3 | Payload values may differ from admin's — teacher should see either (a) tenant-wide values (same as admin, if backend does not scope) OR (b) scoped values. Either is acceptable here; flag which one the backend currently returns. | Record which model the payload uses. If it returns **raw PII** for students the teacher cannot otherwise see, raise as a **Fail** (privacy regression). |           |
| 4.1.4 | Skeleton shimmers while loading; on 500 / error, in-page banner + Retry button (not a toast).                                                                                                                                       | Banner renders; `t('wellbeingHub.loadError')` key resolves.                                                                                             |           |

### 4.2 Pending-attention banner

| #     | What to Check                                                                                                                                              | Expected                                                                                                                     | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Banner renders only if the teacher has actionable items (unacknowledged early-warnings for their scope, incidents awaiting follow-up they reported, etc.). | Banner presents teacher-relevant items. If backend cannot scope, the banner may show tenant-wide items — record observation. |           |
| 4.2.2 | Clicking a card navigates to the deep link (e.g. `/behaviour/incidents/:id` if teacher is reporter; `/early-warnings/:studentId` if in scope).             | Correct route.                                                                                                               |           |
| 4.2.3 | **Declare Critical Incident** quick action is **HIDDEN** for teachers (admin-only per PLAN).                                                               | No such pill renders in the quick-action row.                                                                                |           |
| 4.2.4 | Deep-linking to a surface the teacher can't access (e.g. `/safeguarding/concerns/:id` — admin-only) returns a clean 403 page, not a console error storm.   | 403 page or graceful redirect.                                                                                               |           |

### 4.3 KPI strip (four tiles)

| #     | What to Check                                                                                                                                                                                                                             | Expected                                                             | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| 4.3.1 | **Students at Risk** tile renders with numeric value. Click → navigates to `/early-warnings` (teacher-scoped list — see §16).                                                                                                             | Click navigates; destination list is scoped to taught students.      |           |
| 4.3.2 | **Open Incidents** tile — click → navigates to `/behaviour` (teacher scoped sub-hub).                                                                                                                                                     | Click navigates.                                                     |           |
| 4.3.3 | **Open Cases** tile — click → navigates to `/pastoral`. (Pastoral cases themselves are admin-only to **manage**; the hub still renders for teachers so they can view tier 1/2.)                                                           | Click navigates.                                                     |           |
| 4.3.4 | **Overdue Actions** tile — if visible, click → navigates to `/behaviour/tasks`. If the teacher has no tasks assigned, the tile shows 0. `/behaviour/tasks` opens (teacher can view their own tasks) but they cannot mutate others' tasks. | Tile click navigates. Task list scoped to `assigned_to = <teacher>`. |           |
| 4.3.5 | KPI tooltips on hover — translation keys `wellbeingHub.kpis.tooltips.*` resolve.                                                                                                                                                          | Tooltips render.                                                     |           |

### 4.4 Quick actions

| #     | What to Check                                                                                                                                          | Expected                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------- |
| 4.4.1 | **Log Incident** pill → `/behaviour/incidents/new`. Visible.                                                                                           | Visible.                                                   |           |
| 4.4.2 | **Log Concern** pill → `/pastoral/concerns/new`. Visible.                                                                                              | Visible.                                                   |           |
| 4.4.3 | **Declare Critical Incident** pill — **HIDDEN** for teachers. (Permission `pastoral.critical_incidents` not held.)                                     | Not rendered.                                              |           |
| 4.4.4 | **Open Pastoral Case** pill — **HIDDEN** for teachers. (Permission `pastoral.manage_cases` not held.) If the pill renders, flag as Fail — it's a leak. | Not rendered.                                              |           |
| 4.4.5 | Any additional quick action added during PLAN iteration must also respect teacher permissions.                                                         | Quick-action row only contains Log Incident + Log Concern. |           |

### 4.5 Hub cards (teacher-visible set)

| #     | What to Check                                                                                                                                                                                                                                                                                                               | Expected                                                                                                                                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.5.1 | **Settings tile** — **HIDDEN** for teachers. (Admin spec §4.5.1 describes 6 cards; teacher should see ≤ 5.)                                                                                                                                                                                                                 | Only 5 cards render: Behaviour, Pastoral, Safeguarding, Early Warnings, Staff Wellbeing. No Settings tile.                                                                                 |           |
| 4.5.2 | **Safeguarding tile** — visible (teacher needs to report) but clicking it MUST NOT open the admin safeguarding sub-hub. Either (a) the tile deep-links directly to `/safeguarding/concerns/new` (report form), OR (b) clicking takes the teacher to `/safeguarding` which renders a **report-only landing page** (see §14). | Click takes teacher to the report-only entry point. If it lands on the full admin-style `/safeguarding` super-sub-hub page with tiles for Seal/Break-glass/SLA, that is a **Fail** (leak). |           |
| 4.5.3 | Hub cards with counter badges — counts match payload. If counts include items the teacher cannot see (e.g. tier-3 concerns), they must still not expose identifying info in the badge or hover tooltip.                                                                                                                     | No PII in counter tooltips.                                                                                                                                                                |           |
| 4.5.4 | Click **Behaviour** → `/behaviour`. **Pastoral** → `/pastoral`. **Early Warnings** → `/early-warnings`. **Staff Wellbeing** → `/wellbeing/staff`.                                                                                                                                                                           | 4 navigations land on a page that loads for the teacher without 403.                                                                                                                       |           |
| 4.5.5 | Hover / tap animation per redesign — no regression in appearance.                                                                                                                                                                                                                                                           | Same polish as admin view.                                                                                                                                                                 |           |
| 4.5.6 | Stagger-in animation on mount — fires once, not on tile click.                                                                                                                                                                                                                                                              | 60ms intervals; verified via Performance tab or eye.                                                                                                                                       |           |

### 4.6 Recent activity feed (teacher)

| #     | What to Check                                                                                                                                                                     | Expected                                                                                                                      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.6.1 | Feed shows recent activity. If backend scopes to the teacher, rows reference only in-scope students. If not scoped, record observation.                                           | Record observation; fail only if **student PII** for out-of-scope students is leaked in the row text (name, narrative, etc.). |           |
| 4.6.2 | Click a row → navigates to deep link. If the row references a surface the teacher can't access, navigation should resolve to a 403 page cleanly, not a half-rendered detail view. | Clean 403 or in-scope view.                                                                                                   |           |
| 4.6.3 | Relative time formatting per locale.                                                                                                                                              | Translations present.                                                                                                         |           |

### 4.7 Resource ribbon

| #     | What to Check                                                                                                                                          | Expected                       | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | --------- |
| 4.7.1 | Ribbon renders (teacher ⊂ staff). Links point to `/wellbeing/resources?category=...`.                                                                  | Visible. Navigation works.     |           |
| 4.7.2 | Resources page loads in **read** mode for teacher — no edit controls. Attempt to `PATCH /api/v1/staff-wellbeing/resources` via devtools console → 403. | Read-only UI. 403 on mutation. |           |

### 4.8 Super-hub negative / empty state

| #     | What to Check                                                                                       | Expected                            | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------- | --------- |
| 4.8.1 | Simulate 503 (block `/api/v1/wellbeing/dashboard-summary`). Retry button reappears; no toast storm. | Error banner + retry.               |           |
| 4.8.2 | Log out and hit `/en/wellbeing` directly — redirects to `/en/login?redirect=/en/wellbeing`.         | Redirect with preserved return URL. |           |

---

## 5. Behaviour sub-hub `/behaviour` — teacher scoped view

**URL:** `/{locale}/behaviour`
**Permission:** `behaviour.view`
**Primary APIs:** `GET /api/v1/behaviour/incidents/stats`, `GET /api/v1/behaviour/recognition/leaderboard?limit=5`, `GET /api/v1/wellbeing/dashboard-summary`

### 5.1 Page chrome

| #     | What to Check                                                                                                                                                                                                                                                                                                                                                                                                                                        | Expected                                                                                                                     | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Page renders for teacher (no 403).                                                                                                                                                                                                                                                                                                                                                                                                                   | 200.                                                                                                                         |           |
| 5.1.2 | Header "Behaviour" + subtitle. Breadcrumb Wellbeing → Behaviour.                                                                                                                                                                                                                                                                                                                                                                                     | Header + breadcrumb correct.                                                                                                 |           |
| 5.1.3 | KPI strip renders. Values scoped to teacher where backend supports; otherwise admin-wide values (record as observation).                                                                                                                                                                                                                                                                                                                             | Incidents Today, Positive:Negative ratio, Open Tasks (teacher's own), Overdue Sanctions (teacher-supervised subset, if any). |           |
| 5.1.4 | Quick actions: **Log Incident** → `/behaviour/incidents/new`; **Parse with AI** → `/behaviour/incidents/new?ai=1`; **Generate Document** — **HIDDEN** for teachers (admin-only); **Open Analytics** → `/behaviour/analytics` (teacher has `behaviour.view` analytics — if backend denies, record observation).                                                                                                                                       | Log Incident + Parse with AI always visible. Generate Document absent.                                                       |           |
| 5.1.5 | Hub cards — **visible to teacher:** Incidents, Recognition (read), Analytics, AI Analytics (flag-gated tile always visible; page gate enforced on click). **Hidden:** Sanctions (view-only if in scope, but card should be demoted or hidden — raise as observation if visible with full admin affordances), Exclusions, Appeals, Documents, Tasks (visible — own tasks only), Alerts (hidden), Amendments (hidden), Guardian Restrictions (hidden). | Cards restricted per logical model.                                                                                          |           |
| 5.1.6 | **Admin Console** tile — **HIDDEN** (`behaviour.admin` not held).                                                                                                                                                                                                                                                                                                                                                                                    | Not rendered.                                                                                                                |           |
| 5.1.7 | Recent activity feed at bottom — scoped to teacher activity (incidents they reported, incidents involving taught students).                                                                                                                                                                                                                                                                                                                          | Scoped. No PII for out-of-scope students.                                                                                    |           |
| 5.1.8 | Sticky Quick-Log FAB on mobile → `/behaviour/incidents/new`.                                                                                                                                                                                                                                                                                                                                                                                         | FAB visible at 375px; click navigates.                                                                                       |           |

### 5.2 Hub tile visibility matrix (teacher)

| #      | Tile                      | Expected for teacher                                                                                                                     | Pass/Fail |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1  | **Incidents**             | **Visible.** Navigates to scoped list (see §7).                                                                                          |           |
| 5.2.2  | **Sanctions**             | **Hidden OR read-only (scoped).** Teacher doesn't have `behaviour.manage`; if visible, clicking must not expose create/edit affordances. |           |
| 5.2.3  | **Exclusions**            | **Hidden.** `/behaviour/exclusions` → 403 (see §10).                                                                                     |           |
| 5.2.4  | **Appeals**               | **Hidden.** `/behaviour/appeals` → 403.                                                                                                  |           |
| 5.2.5  | **Recognition**           | **Visible (read).** Teacher can view the wall but not publish/approve.                                                                   |           |
| 5.2.6  | **Documents**             | **Hidden.** `/behaviour/documents` → 403 (no `behaviour.manage_documents`).                                                              |           |
| 5.2.7  | **Tasks**                 | **Visible** (teacher's own tasks). `/behaviour/tasks` loads scoped list.                                                                 |           |
| 5.2.8  | **Alerts**                | **Hidden.** `/behaviour/alerts` → 403.                                                                                                   |           |
| 5.2.9  | **Amendments**            | **Hidden.** `/behaviour/amendments` → 403.                                                                                               |           |
| 5.2.10 | **Guardian Restrictions** | **Hidden.** `/behaviour/guardian-restrictions` → 403.                                                                                    |           |
| 5.2.11 | **Analytics**             | **Visible.** Teacher has `behaviour.view`; analytics tiles show trends. If backend 403s, record observation.                             |           |
| 5.2.12 | **AI Analytics**          | **Visible tile; page flag-gated.** Navigating to `/behaviour/analytics/ai` without the flag → inline AI-disabled banner (see §9).        |           |
| 5.2.13 | **Admin Console**         | **Hidden.** `/behaviour/admin` → 403.                                                                                                    |           |
| 5.2.14 | **Legal Holds**           | **Hidden.** `/behaviour/admin/legal-holds` → 403.                                                                                        |           |
| 5.2.15 | **Policies Replay**       | **Hidden.** `/behaviour/policies/replay` → 403.                                                                                          |           |

### 5.3 Sub-hub negative path

| #     | What to Check                                                               | Expected                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 5.3.1 | Disable `behaviour` module on Tenant A → return to `/behaviour` as teacher. | "Module not enabled" friendly state or redirect to `/wellbeing`. No crash. |           |
| 5.3.2 | Re-enable module.                                                           | Page returns to normal.                                                    |           |

---

## 6. Behaviour — incident logging (`/behaviour/incidents/new`)

**Permission:** `behaviour.log`
**Primary API:** `POST /api/v1/behaviour/incidents` (or `ai-parse` + `POST`)

See admin spec §6.2 for the full walkthrough; teacher assertions differ at these rows.

### 6.1 Wizard + scoped student picker

| #     | What to Check                                                                                                                                                                                                                                                | Expected                                                                                                                                                               | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Navigate to `/en/behaviour/incidents/new`. Wizard renders: Step 1 participants, Step 2 details, Step 3 review. Progress indicator visible.                                                                                                                   | 3 steps.                                                                                                                                                               |           |
| 6.1.2 | Step 1 — student picker (multi-select). Type the first letter of an **in-scope** student's name (e.g. a 5B student) → dropdown lists matches. Autocomplete fires `GET /api/v1/students?search=<q>`.                                                          | In-scope matches appear.                                                                                                                                               |           |
| 6.1.3 | Type the first letter of an **out-of-scope** student's name (a student in class 5A that the teacher does not teach). Verify that student does **NOT** appear in the dropdown, OR if they do, selecting them fails at submit with 403 `STUDENT_OUT_OF_SCOPE`. | Either the dropdown already filters them out (preferred), OR the submit is blocked. If the student appears AND the submit succeeds, that is a **Fail** — scope bypass. |           |
| 6.1.4 | Multi-select up to 5 in-scope students. All shown as pills with remove buttons.                                                                                                                                                                              | Pills render.                                                                                                                                                          |           |
| 6.1.5 | Category dropdown lists all 28 default categories + tenant-custom categories (teacher can pick any).                                                                                                                                                         | Categories present.                                                                                                                                                    |           |
| 6.1.6 | Step 2 — description (textarea, min 5 chars), parent_description (optional), location, occurred_at (datetime picker defaults to now), context_type.                                                                                                          | Zod `createIncidentSchema` enforced via react-hook-form + zodResolver.                                                                                                 |           |
| 6.1.7 | Step 3 — review payload. Submit → 201. Response includes `id`, `incident_number` (`INC-YYYYMM-NNNN`).                                                                                                                                                        | 201 + incident_number.                                                                                                                                                 |           |
| 6.1.8 | Toast: "Incident logged — INC-….". Navigation to `/behaviour/incidents/:id` detail.                                                                                                                                                                          | Toast + nav.                                                                                                                                                           |           |
| 6.1.9 | Idempotency — double-click Submit. Second attempt returns same incident id (via `idempotency_key`). No duplicate in DB.                                                                                                                                      | No duplicate.                                                                                                                                                          |           |

### 6.2 AI parse (flag-gated)

| #     | What to Check                                                                                                                                                                                               | Expected                                                                                                                                                                   | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1 | Ensure behaviour AI flag OFF (admin console). Click "Parse with AI" toggle. Paste a narrative → submit parse.                                                                                               | `POST /api/v1/behaviour/incidents/ai-parse` returns 403 `AI_DISABLED`. Inline banner appears: "AI disabled, please toggle the flag in settings". See O-T2 re: link target. |           |
| 6.2.2 | The banner's "go to settings" link is **HIDDEN** for teachers (they lack `ai_flag.manage`), OR the link takes them to `/dashboard` with an info toast. Confirm the banner does NOT dangle a link that 403s. | Teacher-safe banner copy.                                                                                                                                                  |           |
| 6.2.3 | Ask an admin (second session) to toggle AI flag ON. Retry parse — form pre-fills with parsed fields (student candidates, category suggestion, description). Teacher reviews, submits.                       | Form populated; submit succeeds.                                                                                                                                           |           |
| 6.2.4 | Admin toggles flag OFF again — subsequent parse returns 403 banner.                                                                                                                                         | Flag enforcement correct.                                                                                                                                                  |           |

### 6.3 Zod validation + attachment

| #     | What to Check                                                                                                                                            | Expected                               | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 6.3.1 | Description < 5 chars → inline "Description too short" under the field. Backend returns 400 `DESCRIPTION_TOO_SHORT`.                                     | Validation path works.                 |           |
| 6.3.2 | Missing category → inline error under category dropdown.                                                                                                 | Required.                              |           |
| 6.3.3 | Submit an out-of-scope student_id via devtools (modify the POST body) — backend returns 403 `STUDENT_OUT_OF_SCOPE` or 400. UI shows toast.               | No scope bypass possible via devtools. |           |
| 6.3.4 | Attach 3 files (jpeg, png, pdf). Each creates `POST /api/v1/behaviour/incidents/:id/attachments`. Scan status flips `pending_scan` → `clean` within 30s. | Uploads work.                          |           |
| 6.3.5 | Upload `.exe` → 400 `FILE_TYPE_NOT_ALLOWED`. Inline error.                                                                                               | Rejected.                              |           |
| 6.3.6 | Upload a 100MB file → 413 `PAYLOAD_TOO_LARGE`. Inline error.                                                                                             | Rejected.                              |           |

### 6.4 Quick-log

| #     | What to Check                                                                                                                                          | Expected                                                    | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------- |
| 6.4.1 | From `/behaviour` FAB, the Quick-Log form opens (compact variant). Teacher picks one in-scope student, one category, one sentence description, submit. | `POST /api/v1/behaviour/incidents/quick` fires; 201; toast. |           |
| 6.4.2 | Quick-Log denies out-of-scope students the same way the full form does.                                                                                | Scoped.                                                     |           |

---

## 7. Behaviour — incident list & detail (scoped read, limited mutations)

### 7.1 `/behaviour/incidents` — list page (scoped)

**Permission:** `behaviour.view` (scoped)
**Primary API:** `GET /api/v1/behaviour/incidents?page=1&pageSize=20`

| #     | What to Check                                                                                                                                                                                                        | Expected                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Tabs render: **All**, **Positive**, **Negative**, **My Incidents**. **Pending Approval** and **Escalated** tabs are hidden for teacher (no `behaviour.manage`), OR visible but scoped to the teacher's reported set. | 4 tabs (or 6 tabs if backend scopes). If "Pending Approval" tab returns other admin's incidents for students out of scope, that is a **Fail**. |           |
| 7.1.2 | **All** tab rows — every row must involve at least one student in the teacher's scope OR be reported by the teacher.                                                                                                 | Spot-check 10 rows. Zero out-of-scope, non-teacher-reported rows.                                                                              |           |
| 7.1.3 | **My Incidents** tab — fires `GET /api/v1/behaviour/incidents/my`. Rows show only incidents reported by the teacher.                                                                                                 | Rows filtered by `reported_by=<teacher>`.                                                                                                      |           |
| 7.1.4 | Filter by Category → dropdown of all 28 + tenant custom. Selecting filters the scoped rows.                                                                                                                          | Filter works.                                                                                                                                  |           |
| 7.1.5 | Search by student name — only in-scope students match. Typing an out-of-scope student name returns no rows.                                                                                                          | Scope enforced at search level.                                                                                                                |           |
| 7.1.6 | Row click → `/behaviour/students/:studentId` (or `/behaviour/incidents/:id`) if the student is in scope. Clicking a row involving an out-of-scope student should not be possible (rows should not render at all).    | No out-of-scope rows.                                                                                                                          |           |
| 7.1.7 | Kebab menu on each row — options depend on teacher's relationship to the incident: **View** always; **Edit** only if reporter; **Change status / Withdraw / Add participant** only if reporter.                      | Unauthorised kebab actions hidden per-row.                                                                                                     |           |
| 7.1.8 | Pagination — `meta.total` reflects teacher-scoped count only.                                                                                                                                                        | Total matches scoped SQL count.                                                                                                                |           |

### 7.2 `/behaviour/incidents/:id` — detail (in-scope incident)

| #      | What to Check                                                                                                                                                                            | Expected                                                                                                                                                                                 | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1  | Open an incident where the teacher IS the reporter. Tabs: Overview, Participants, Attachments, Sanctions, Acknowledgements, History.                                                     | 6 tabs visible.                                                                                                                                                                          |           |
| 7.2.2  | Overview shows all fields (narrative, parent_description, etc.). Teacher can see `view_sensitive` fields for in-scope students.                                                          | Fields render.                                                                                                                                                                           |           |
| 7.2.3  | **Edit** button visible (teacher is reporter). Click → inline edit modal via `updateIncidentSchema`. Save → PATCH → 200. Fields refresh.                                                 | Edit works when reporter.                                                                                                                                                                |           |
| 7.2.4  | **Status stepper** — teacher can move the incident through statuses they own (draft → submitted). `approved` and `escalated` transitions are **admin-only** — clicking those should 403. | Teacher-allowed transitions succeed; admin-only transitions blocked with toast "Only admins can approve / escalate". If the button is visible and fires without blocking, record a Fail. |           |
| 7.2.5  | **Withdraw** — teacher-as-reporter can withdraw. POST `/withdraw` → 201. Status flips. History row added.                                                                                | Withdraw works for reporter.                                                                                                                                                             |           |
| 7.2.6  | **Record follow-up** — teacher (reporter or subject teacher) can upload follow-up attachment. 201.                                                                                       | Upload works.                                                                                                                                                                            |           |
| 7.2.7  | **Add participant** — teacher-as-reporter can add. 201. Non-reporter teacher attempting via devtools POST → 403 `FORBIDDEN`.                                                             | Reporter allowed; non-reporter 403.                                                                                                                                                      |           |
| 7.2.8  | **Remove participant** — same rule as add.                                                                                                                                               | Rule enforced.                                                                                                                                                                           |           |
| 7.2.9  | **History** tab — audit trail rows (created, updated, status_changed, withdrawn). Teacher can view.                                                                                      | Rows render.                                                                                                                                                                             |           |
| 7.2.10 | **Policy evaluation** button — teacher does not hold `behaviour.admin` — button hidden OR clicking returns 403. If button is visible but 403s on click, log observation T-1.             | Button hidden (preferred) or 403 gated.                                                                                                                                                  |           |

### 7.3 Incident detail — non-reporter teacher (in-scope student)

| #     | What to Check                                                                                                                                      | Expected                                               | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 7.3.1 | Open an incident where the teacher is NOT the reporter but the student IS in scope (e.g. reported by `admin@nhqs.test` but involves a 5B student). | Detail loads; overview shows; teacher has read access. |           |
| 7.3.2 | **Edit** button — HIDDEN or disabled.                                                                                                              | Not interactive.                                       |           |
| 7.3.3 | **Withdraw** — HIDDEN or 403 on click.                                                                                                             | Not available.                                         |           |
| 7.3.4 | **Add participant** — HIDDEN or 403.                                                                                                               | Not available.                                         |           |
| 7.3.5 | **Status change** — HIDDEN or 403.                                                                                                                 | Not available.                                         |           |
| 7.3.6 | Kebab menu on this incident shows only **View** + **Record follow-up** (if permitted per the subject relationship).                                | Minimal menu.                                          |           |
| 7.3.7 | **History** tab readable.                                                                                                                          | Readable.                                              |           |

### 7.4 Sanctions tab (read-only for teacher)

| #     | What to Check                                                                                                                              | Expected                                         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------- |
| 7.4.1 | On an in-scope incident with a sanction attached, the Sanctions tab lists the sanction read-only.                                          | Read-only view. No "Mark served" button visible. |           |
| 7.4.2 | Attempt `PATCH /api/v1/behaviour/sanctions/:id/status` via devtools — 403 `FORBIDDEN`.                                                     | Denied.                                          |           |
| 7.4.3 | Attempt `POST /api/v1/behaviour/sanctions` (create a sanction from scratch) via devtools — 403 (teacher does not hold `behaviour.manage`). | Denied.                                          |           |

---

## 8. Behaviour — scope negative matrix

This matrix documents the teacher's **out-of-scope** behaviour via direct URL access. Expect 404 (preferred — does not leak existence) or 403.

| #   | Action / URL                                                                                                                                                                                                                                                                                                                                                                                 | Expected                                                                             | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 8.1 | Direct URL to an incident whose students are ALL out of scope: `/en/behaviour/incidents/{outOfScopeIncidentId}`.                                                                                                                                                                                                                                                                             | 404 page "Incident not found" (preferred). 403 acceptable if UI surfaces it cleanly. |           |
| 8.2 | `/en/behaviour/students/{outOfScopeStudentId}` — student profile for a student the teacher does not teach.                                                                                                                                                                                                                                                                                   | 404 or 403. NO student PII (name, year, photo) visible in the response body.         |           |
| 8.3 | `GET /api/v1/behaviour/incidents/{outOfScopeIncidentId}` directly from Network console.                                                                                                                                                                                                                                                                                                      | 404.                                                                                 |           |
| 8.4 | `PATCH /api/v1/behaviour/incidents/{outOfScopeIncidentId}` with a valid partial body.                                                                                                                                                                                                                                                                                                        | 404.                                                                                 |           |
| 8.5 | Search the list page (`/behaviour/incidents`) for the out-of-scope student's name.                                                                                                                                                                                                                                                                                                           | Zero rows.                                                                           |           |
| 8.6 | Filter by `student_id=<outOfScopeId>` via URL query: `/behaviour/incidents?student_id=<oos>` → backend scopes, UI shows empty list or 403.                                                                                                                                                                                                                                                   | Scoped empty (no rows leak).                                                         |           |
| 8.7 | `POST /api/v1/behaviour/incidents` with body containing an out-of-scope `student_ids` array.                                                                                                                                                                                                                                                                                                 | 403 `STUDENT_OUT_OF_SCOPE` or 400.                                                   |           |
| 8.8 | Open an incident in scope that involves MULTIPLE students — at least one in scope, at least one out of scope. Expected behaviour: incident loads, but out-of-scope student's fields (name, year) remain visible because they're tied to the incident. Confirm that clicking the out-of-scope participant does NOT navigate to that student's profile page (or the profile page itself 404s). | Click navigation on out-of-scope participant → 404 on profile page.                  |           |

---

## 9. Behaviour — AI analytics (`/behaviour/analytics/ai`) flag-gated

**Permission:** `behaviour.ai_query` + tenant AI flag enabled.

| #   | What to Check                                                                                                                                                                                            | Expected                                                                                                          | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | AI flag OFF. Navigate to `/en/behaviour/analytics/ai`.                                                                                                                                                   | Page loads with an inline banner "AI disabled for behaviour. Contact an admin to enable." No query input enabled. |           |
| 9.2 | Banner's "contact admin" helper text does NOT deep-link to `/settings/ai-flags` for teachers (they can't access that page). Instead, a static message.                                                   | No dangling admin link.                                                                                           |           |
| 9.3 | Admin toggles AI flag ON. Refresh `/en/behaviour/analytics/ai`. Banner disappears. Query input becomes enabled.                                                                                          | Flag propagation.                                                                                                 |           |
| 9.4 | Type "Which students in Class 5B received the most incidents this month?" → fires `POST /api/v1/behaviour/analytics/ai/query`. Result returned.                                                          | 200 + natural-language response.                                                                                  |           |
| 9.5 | Ask "Which students in Class 3A received the most incidents this month?" (out of teacher's scope). Backend scopes response — either returns "No data in your scope" or returns scope-filtered data only. | No out-of-scope student names in the response.                                                                    |           |
| 9.6 | Admin toggles flag OFF mid-session. The teacher's next query returns 403 `AI_DISABLED`. Banner reappears.                                                                                                | Flag check fires every request.                                                                                   |           |

---

## 10. Behaviour — admin-only surfaces (negative matrix)

Every URL below MUST 403 or redirect to `/dashboard` for a teacher. Record the exact response.

| #     | URL                                                                        | Expected                                                                                                              | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | `/en/behaviour/sanctions`                                                  | 403 page OR scoped read-only (if teacher supervises) — scope enforced. Flag as observation if it opens full admin UI. |           |
| 10.2  | `/en/behaviour/sanctions/today`                                            | 403 (teacher has no `behaviour.manage_sanctions`).                                                                    |           |
| 10.3  | `/en/behaviour/exclusions`                                                 | 403.                                                                                                                  |           |
| 10.4  | `/en/behaviour/exclusions/new`                                             | 403.                                                                                                                  |           |
| 10.5  | `/en/behaviour/appeals`                                                    | 403.                                                                                                                  |           |
| 10.6  | `/en/behaviour/appeals/new`                                                | 403.                                                                                                                  |           |
| 10.7  | `/en/behaviour/documents`                                                  | 403.                                                                                                                  |           |
| 10.8  | `/en/behaviour/documents/generate`                                         | 403.                                                                                                                  |           |
| 10.9  | `/en/behaviour/alerts`                                                     | 403.                                                                                                                  |           |
| 10.10 | `/en/behaviour/amendments`                                                 | 403.                                                                                                                  |           |
| 10.11 | `/en/behaviour/guardian-restrictions`                                      | 403.                                                                                                                  |           |
| 10.12 | `/en/behaviour/admin`                                                      | 403.                                                                                                                  |           |
| 10.13 | `/en/behaviour/admin/legal-holds`                                          | 403.                                                                                                                  |           |
| 10.14 | `/en/behaviour/policies/replay`                                            | 403.                                                                                                                  |           |
| 10.15 | `/en/behaviour/recognition/publications`                                   | 403 on the approval/edit surface; wall and leaderboard (read) may be accessible.                                      |           |
| 10.16 | `POST /api/v1/behaviour/recognition/publications/:id/approve` via devtools | 403.                                                                                                                  |           |
| 10.17 | `POST /api/v1/behaviour/exclusion-cases`                                   | 403.                                                                                                                  |           |
| 10.18 | `POST /api/v1/behaviour/appeals`                                           | 403.                                                                                                                  |           |
| 10.19 | `POST /api/v1/behaviour/documents/generate`                                | 403.                                                                                                                  |           |
| 10.20 | `DELETE /api/v1/behaviour/guardian-restrictions/:id`                       | 403.                                                                                                                  |           |

---

## 11. Pastoral sub-hub `/pastoral` — teacher scoped view

**URL:** `/{locale}/pastoral`
**Permissions:** `pastoral.view_tier1`, `pastoral.view_tier2`, `pastoral.log_concern`

| #    | What to Check                                                                                                                                                                                                                                                                                                            | Expected                             | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------- |
| 11.1 | Navigate to `/en/pastoral`. Page renders.                                                                                                                                                                                                                                                                                | 200.                                 |           |
| 11.2 | Hub tiles visible for teacher: **Concerns** (log + view tier 1/2), **Check-ins** (read-only view of taught students), **SST** (hidden — admin-only), **Interventions** (hidden), **Referrals** (hidden), **Critical Incidents** (hidden), **Cases** (hidden), **DSAR Reviews** (hidden), **Historical Import** (hidden). | 2-3 tiles visible. Remaining hidden. |           |
| 11.3 | If hidden tiles are nevertheless rendered in UI, clicking them must produce 403 (never a half-rendered page).                                                                                                                                                                                                            | Clean 403 on click.                  |           |
| 11.4 | KPI tiles — scoped values. No out-of-scope PII in tooltips.                                                                                                                                                                                                                                                              | Scoped.                              |           |
| 11.5 | Quick actions row — **Log Concern** visible; **Declare Critical Incident** HIDDEN; **Open Case** HIDDEN.                                                                                                                                                                                                                 | Only Log Concern present.            |           |
| 11.6 | Recent activity feed — scoped to pastoral items for in-scope students the teacher has permission to see. No tier-3 items.                                                                                                                                                                                                | No tier-3 leakage.                   |           |

---

## 12. Pastoral — concern logging (`/pastoral/concerns/new`)

**Permission:** `pastoral.log_concern`
**Primary API:** `POST /api/v1/pastoral/concerns`

See admin spec §20 for the full walkthrough; teacher assertions differ at these rows.

| #     | What to Check                                                                                                                                                                                                                                         | Expected                                                                     | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 12.1  | Navigate to `/en/pastoral/concerns/new`. Form renders.                                                                                                                                                                                                | 200.                                                                         |           |
| 12.2  | Fields: student picker (multi-select), tier (1/2/3 toggle), narrative (textarea), observed_at (datetime), visible-to-parent toggle, attachments.                                                                                                      | Form fields present.                                                         |           |
| 12.3  | Student picker is scoped — dropdown only lists in-scope students. Typing an out-of-scope student's name returns no matches (same as §6.1.3).                                                                                                          | Scope enforced.                                                              |           |
| 12.4  | Tier 3 option — teacher may see the tier-3 toggle but selecting it surfaces a banner "Tier 3 concerns must be reported via the safeguarding workflow" with a link to `/safeguarding/concerns/new`. Alternatively, tier 3 is disabled in the dropdown. | Tier-3 either disabled OR redirects teacher to the safeguarding report form. |           |
| 12.5  | Submit a tier-1 concern for an in-scope student. `POST /api/v1/pastoral/concerns` → 201. Toast + navigate to concern detail.                                                                                                                          | 201 + navigation.                                                            |           |
| 12.6  | Submit a tier-2 concern for an in-scope student. 201.                                                                                                                                                                                                 | 201.                                                                         |           |
| 12.7  | Attempt to POST a tier-3 concern via devtools body override — backend must 400 or 403 `USE_SAFEGUARDING_WORKFLOW`.                                                                                                                                    | Devtools bypass prevented.                                                   |           |
| 12.8  | Attempt to POST a concern with an out-of-scope student_id — 403 `STUDENT_OUT_OF_SCOPE`.                                                                                                                                                               | Devtools bypass prevented.                                                   |           |
| 12.9  | Attachments — up to 3 files. Each `POST /api/v1/pastoral/concerns/:id/attachments` → 201. Scan status flips to clean.                                                                                                                                 | Uploads work.                                                                |           |
| 12.10 | Zod validation: narrative < 10 chars → inline error.                                                                                                                                                                                                  | Inline error.                                                                |           |

---

## 13. Pastoral — tier 1/2 viewing + admin-only negatives

### 13.1 Concerns list `/pastoral/concerns`

| #      | What to Check                                                                                                                                | Expected                               | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 13.1.1 | Default filter "My logged" — shows only concerns the teacher logged.                                                                         | Filter default.                        |           |
| 13.1.2 | Switch to "Tier 1" filter — rows render concerns tier=1 for in-scope students.                                                               | Scoped rows.                           |           |
| 13.1.3 | Switch to "Tier 2" — same pattern.                                                                                                           | Scoped rows.                           |           |
| 13.1.4 | Switch to "Tier 3" — filter is **hidden** OR selecting it returns an empty list (tier 3 requires `pastoral.view_tier3` which teacher lacks). | Tier 3 not accessible via list filter. |           |
| 13.1.5 | Row click opens detail `/pastoral/concerns/:id`. Concern must be tier 1 or tier 2 AND involve an in-scope student.                           | Detail loads.                          |           |

### 13.2 Concern detail page

| #      | What to Check                                                                                                                                                                  | Expected                                                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------- |
| 13.2.1 | Open tier-2 concern in scope — detail page renders narrative, attachments, events history.                                                                                     | Page renders.                                                   |           |
| 13.2.2 | **Escalate** button — available only if concern is authored by teacher AND the target tier is tier 2. Escalating to tier 3 should be blocked with a "Use safeguarding" banner. | Teacher-controlled escalations only; tier-3 escalation blocked. |           |
| 13.2.3 | **Share with parent** — button visible only if teacher is author. Click → POST `/api/v1/pastoral/concerns/:id/share-with-parent` → 201.                                        | Author-only.                                                    |           |
| 13.2.4 | **Amend narrative** — author-only. 201 on submit. History row added.                                                                                                           | Author-only.                                                    |           |
| 13.2.5 | Open a tier-3 concern (by guessing a UUID from seed) via direct URL → 403 `INSUFFICIENT_PERMISSION` page. No narrative leaked.                                                 | Blocked.                                                        |           |
| 13.2.6 | Open a tier-2 concern involving an out-of-scope student (by direct UUID) → 404 or 403. No narrative leaked.                                                                    | Blocked.                                                        |           |

### 13.3 Pastoral admin-only negatives

| #       | URL                                        | Expected                                                                                                  | Pass/Fail |
| ------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------- |
| 13.3.1  | `/en/pastoral/cases`                       | 403 (teacher lacks `pastoral.manage_cases`).                                                              |           |
| 13.3.2  | `/en/pastoral/cases/new`                   | 403.                                                                                                      |           |
| 13.3.3  | `/en/pastoral/interventions`               | 403.                                                                                                      |           |
| 13.3.4  | `/en/pastoral/interventions/new`           | 403.                                                                                                      |           |
| 13.3.5  | `/en/pastoral/referrals`                   | 403.                                                                                                      |           |
| 13.3.6  | `/en/pastoral/neps-visits`                 | 403.                                                                                                      |           |
| 13.3.7  | `/en/pastoral/critical-incidents`          | 403.                                                                                                      |           |
| 13.3.8  | `/en/pastoral/critical-incidents/new`      | 403.                                                                                                      |           |
| 13.3.9  | `/en/pastoral/sst`                         | 403 OR read-only if teacher is SST member (out of scope for this fixture — teacher is not an SST member). |           |
| 13.3.10 | `/en/pastoral/dsar-reviews`                | 403.                                                                                                      |           |
| 13.3.11 | `/en/pastoral/import`                      | 403.                                                                                                      |           |
| 13.3.12 | `POST /api/v1/pastoral/critical-incidents` | 403.                                                                                                      |           |

---

## 14. Safeguarding — report-only access

**URL:** `/{locale}/safeguarding/concerns/new`
**Permission:** `safeguarding.report`
**Primary API:** `POST /api/v1/safeguarding/concerns`

### 14.1 Landing page

| #    | What to Check                                                                                                                                                                                                                                                  | Expected                                                     | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| 14.1 | Navigate to `/en/safeguarding` directly. Expected: either (a) a minimal **report-only landing page** with a single CTA "Report a safeguarding concern" and no tiles for SLA / Sealed / Break-glass, OR (b) 403. The admin-style super-sub-hub MUST NOT render. | Minimal report-only OR 403. Record which model the app uses. |           |
| 14.2 | If a landing page renders, CTA click → `/safeguarding/concerns/new`.                                                                                                                                                                                           | Navigates.                                                   |           |
| 14.3 | If 403, the page renders cleanly (no console storm, no half-populated tiles).                                                                                                                                                                                  | Clean 403 page.                                              |           |

### 14.2 Report form

| #      | What to Check                                                                                                                                                                                 | Expected                                                                                          | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| 14.2.1 | `/en/safeguarding/concerns/new` — form renders.                                                                                                                                               | 200.                                                                                              |           |
| 14.2.2 | Fields: student picker, type (disclosure / observed / referral / other), severity (low/medium/high/critical), narrative, observed_at, attachments, is_anonymous toggle.                       | Form fields present.                                                                              |           |
| 14.2.3 | Student picker scoped — only in-scope students appear. (For safeguarding, a broader policy may apply — e.g. teacher can report concerns about any student they encounter. Confirm with PLAN.) | If policy is "any student", scope-filter disabled with explanatory note. Otherwise in-scope only. |           |
| 14.2.4 | Submit concern. `POST /api/v1/safeguarding/concerns` → 201. Teacher gets a confirmation toast + concern number (`SG-YYYYMM-NNNN`).                                                            | 201.                                                                                              |           |
| 14.2.5 | Teacher is navigated to `/safeguarding/my-reports` (or `/wellbeing`) — **NOT** the admin concern detail page (which is admin-only).                                                           | Teacher sees their own report confirmation; cannot see admin detail.                              |           |
| 14.2.6 | Attachment upload works. Scan status flips clean.                                                                                                                                             | Upload pipeline works.                                                                            |           |
| 14.2.7 | Zod validation — narrative < 20 chars → inline error.                                                                                                                                         | Required.                                                                                         |           |
| 14.2.8 | `is_anonymous=true` — teacher's user_id still recorded in audit log (admin can see who reported) but the concern surfaces "Anonymous" in list views.                                          | Audit preserves reporter; UI hides.                                                               |           |

### 14.3 My reports

| #      | What to Check                                                                                                                                                                      | Expected             | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 14.3.1 | `/en/safeguarding/my-reports` loads. `GET /api/v1/safeguarding/my-reports` returns concerns where `reported_by=<teacher>`.                                                         | 200.                 |           |
| 14.3.2 | List shows teacher's submitted concerns only. Clicking a row opens a **minimal** read-only summary — status, submitted_at, "Being reviewed" label. NO narrative, NO admin actions. | Minimal detail only. |           |
| 14.3.3 | Teacher cannot see status progression beyond "submitted / acknowledged / resolved" on their own reports. No TUSLA referrals, no SLA badges, no seal info.                          | Minimal UI.          |           |
| 14.3.4 | Attempting to reach a concern reported by a different teacher (by UUID) → 403 or 404.                                                                                              | Not accessible.      |           |

---

## 15. Safeguarding — admin-only surfaces (negative matrix)

Every URL below MUST 403 for teacher. Record response.

| #     | URL                                                                 | Expected                                                | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 15.1  | `/en/safeguarding/concerns`                                         | 403 (lacks `safeguarding.dedicated_view`).              |           |
| 15.2  | `/en/safeguarding/concerns/{someConcernId}`                         | 403 or 404 for anything the teacher didn't report.      |           |
| 15.3  | `/en/safeguarding/sealed`                                           | 403.                                                    |           |
| 15.4  | `/en/safeguarding/break-glass`                                      | 403.                                                    |           |
| 15.5  | `/en/safeguarding/break-glass/{id}`                                 | 403.                                                    |           |
| 15.6  | `/en/safeguarding/sla`                                              | 403.                                                    |           |
| 15.7  | `/en/safeguarding/reviews`                                          | 403.                                                    |           |
| 15.8  | `POST /api/v1/safeguarding/concerns/:id/seal/initiate` via devtools | 403.                                                    |           |
| 15.9  | `POST /api/v1/safeguarding/break-glass`                             | 403.                                                    |           |
| 15.10 | `GET /api/v1/safeguarding/dashboard`                                | 403.                                                    |           |
| 15.11 | `POST /api/v1/safeguarding/concerns/:id/tusla-referral`             | 403.                                                    |           |
| 15.12 | `PATCH /api/v1/safeguarding/concerns/:id/status`                    | 403 (teacher cannot change status on others' concerns). |           |

---

## 16. Early warnings `/early-warnings` — teacher scoped view

**URL:** `/{locale}/early-warnings`
**Permissions:** `early_warning.view` (scoped), `early_warning.acknowledge`

| #     | What to Check                                                                                                                                                                           | Expected                                                 | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 16.1  | Navigate to `/en/early-warnings`. Page renders.                                                                                                                                         | 200.                                                     |           |
| 16.2  | KPI strip — "Students at amber", "Students at red", "New flags this week", "Interventions triggered this week". Values reflect the teacher's scoped student set (expected ≥ 8 at risk). | Scoped values.                                           |           |
| 16.3  | At-risk student list — only students in teacher's scope render. Spot-check: the 7+ out-of-scope at-risk students from §1.12 DO NOT appear anywhere in the list.                         | Scope enforced.                                          |           |
| 16.4  | Sort by tier (amber/red/critical). Works.                                                                                                                                               | Sort works.                                              |           |
| 16.5  | Click student row → side panel with domain drill-down (attendance, grades, behaviour, wellbeing, engagement) for the in-scope student.                                                  | Panel renders 5 domains.                                 |           |
| 16.6  | **AI narrative** — if early-warning AI flag ON for teacher, narrative summarising scoped students renders. If flag OFF, fallback heuristic summary renders.                             | Summary is scoped. No out-of-scope student names appear. |           |
| 16.7  | **Acknowledge** button on an in-scope profile → POST `/api/v1/early-warnings/:studentId/acknowledge`. 204.                                                                              | 204. Profile's acknowledged timestamp set.               |           |
| 16.8  | **Assign** button — HIDDEN or disabled (teacher lacks `early_warning.assign`). If visible, clicking 403s.                                                                               | Not available.                                           |           |
| 16.9  | Direct URL to an out-of-scope student's early-warning detail: `/en/early-warnings/{oosStudentId}` → 404 or 403.                                                                         | Blocked.                                                 |           |
| 16.10 | `GET /api/v1/early-warnings/{oosStudentId}` via devtools → 403 or 404.                                                                                                                  | Blocked.                                                 |           |
| 16.11 | `POST /api/v1/early-warnings/{oosStudentId}/acknowledge` via devtools → 403.                                                                                                            | Blocked.                                                 |           |
| 16.12 | `POST /api/v1/early-warnings/:studentId/assign` via devtools (teacher assigning themselves to an in-scope student) → 403 (lacks `early_warning.assign`).                                | Blocked.                                                 |           |
| 16.13 | `/en/early-warnings/settings` → 403 (lacks `early_warning.configure`).                                                                                                                  | Blocked.                                                 |           |
| 16.14 | `PUT /api/v1/early-warnings/config` via devtools → 403.                                                                                                                                 | Blocked.                                                 |           |
| 16.15 | `/en/early-warnings/cohort` — if accessible, heatmap shows scoped cells only. If 403, that is acceptable (teacher may not need cohort view).                                            | Scoped heatmap OR 403.                                   |           |
| 16.16 | **ISSUE-24-02 polish verification** — `/early-warnings` does not 500 on `prisma.pastoralIntervention.findMany({status:'active'})`. Fix maps 'active' → 'pc_active'.                     | No 500.                                                  |           |

---

## 17. Staff wellbeing `/wellbeing/staff` — personal workload only

**URL:** `/{locale}/wellbeing/staff`
**Permissions:** `wellbeing.view_own_workload` only. No `view_aggregate`, `manage_surveys`, `manage_resources`.

| #     | What to Check                                                                                                                                                                                                                                             | Expected                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 17.1  | Navigate to `/en/wellbeing/staff`. Page loads.                                                                                                                                                                                                            | 200.                                                  |           |
| 17.2  | Page shows the folded sub-hub with anchored sections (admin sees 5). Teacher sees **My Workload** section visible; **Aggregate Dashboard**, **Surveys & Responses** (management), **Board Report**, **Resources** (edit UI) sections hidden or read-only. | Sections visibility per logical model.                |           |
| 17.3  | **My Workload** section renders with the teacher's teaching load (periods / week), cover count (past 30 days), substitution pressure score, upcoming review date.                                                                                         | All fields render.                                    |           |
| 17.4  | **ISSUE-24-04 verification** — for a teacher WITHOUT `staff_profile` (unlikely here, but test by temporarily detaching profile via admin), the My Workload section renders a friendly "No teaching profile" empty state, NOT 3× 404 toasts.               | Clean empty state.                                    |           |
| 17.5  | **Aggregate Dashboard** — if rendered, data is NOT teacher-identifying. Ideally hidden entirely (teacher lacks `wellbeing.view_aggregate`). Record observation if visible.                                                                                | Hidden preferred.                                     |           |
| 17.6  | **Surveys & Responses** — management UI (create / activate / close) hidden. Teacher may see a "Your participation" panel listing surveys they can respond to.                                                                                             | Management hidden; participation panel visible.       |           |
| 17.7  | **Board Report** — HIDDEN.                                                                                                                                                                                                                                | Hidden.                                               |           |
| 17.8  | **Resources** — read-only for teacher. No edit button. EAP / training links clickable.                                                                                                                                                                    | Read-only.                                            |           |
| 17.9  | Legacy route redirects `/wellbeing/dashboard` → `/wellbeing/staff#aggregate` — for teacher, if aggregate is hidden, redirect lands on an in-page anchor that is empty. Record as observation if UX is jarring.                                            | Redirect works; anchor-target visible state is clean. |           |
| 17.10 | `PATCH /api/v1/staff-wellbeing/resources` via devtools → 403.                                                                                                                                                                                             | Blocked.                                              |           |
| 17.11 | `POST /api/v1/staff-wellbeing/surveys` via devtools → 403.                                                                                                                                                                                                | Blocked.                                              |           |
| 17.12 | `POST /api/v1/staff-wellbeing/surveys/:id/activate` via devtools → 403.                                                                                                                                                                                   | Blocked.                                              |           |

---

## 18. Staff wellbeing — anonymous survey participation

**URL:** `/{locale}/wellbeing/survey`
**Permission:** `wellbeing.respond_to_survey` (implicit for all staff).

| #    | What to Check                                                                                                                                                                                 | Expected                              | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 18.1 | Navigate to `/en/wellbeing/survey`. The active survey from seed appears with "Participate" CTA.                                                                                               | Survey visible.                       |           |
| 18.2 | Click Participate. An anonymous token is issued via `GET /api/v1/staff-wellbeing/respond/active`. Form renders question list.                                                                 | Token issued; form renders.           |           |
| 18.3 | Fill responses (likert, text, multiple_choice). Submit → `POST /api/v1/staff-wellbeing/respond/:surveyId`. 201.                                                                               | 201.                                  |           |
| 18.4 | **Anonymity invariant** — the response row in `survey_responses` does NOT contain the teacher's user_id. Run `SELECT user_id FROM survey_responses WHERE id=<new>` → column is null / absent. | Anonymous.                            |           |
| 18.5 | Teacher cannot submit the same survey twice — second attempt blocked with "Already responded" inline message (token consumed).                                                                | Enforced.                             |           |
| 18.6 | Teacher cannot see aggregate results (no `view_aggregate`). If aggregate page renders, it's read-only at best; no per-response drill-down.                                                    | Aggregate either hidden OR read-only. |           |
| 18.7 | Attempt to `POST /api/v1/staff-wellbeing/surveys/:id/moderate` via devtools → 403.                                                                                                            | Blocked.                              |           |

---

## 19. Settings negative matrix

Every `/settings/*` URL MUST 403 / redirect for teacher.

| #     | URL                                                             | Expected                                                     | Pass/Fail |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| 19.1  | `/en/settings/behaviour-general`                                | 403 → redirects to `/dashboard` OR renders a clean 403 page. |           |
| 19.2  | `/en/settings/behaviour-categories`                             | 403.                                                         |           |
| 19.3  | `/en/settings/behaviour-policies`                               | 403.                                                         |           |
| 19.4  | `/en/settings/behaviour-houses`                                 | 403.                                                         |           |
| 19.5  | `/en/settings/behaviour-awards`                                 | 403.                                                         |           |
| 19.6  | `/en/settings/behaviour-documents`                              | 403.                                                         |           |
| 19.7  | `/en/settings/behaviour-admin`                                  | 403.                                                         |           |
| 19.8  | `/en/settings/safeguarding`                                     | 403.                                                         |           |
| 19.9  | `/en/settings/communications/safeguarding`                      | 403.                                                         |           |
| 19.10 | `/en/settings/ai-flags`                                         | 403.                                                         |           |
| 19.11 | `/en/settings/wellbeing-notifications`                          | 403.                                                         |           |
| 19.12 | `PATCH /api/v1/ai-flags/behaviour` via devtools                 | 403.                                                         |           |
| 19.13 | `POST /api/v1/behaviour/categories` via devtools                | 403.                                                         |           |
| 19.14 | `PUT /api/v1/tenants/:id/notification-preferences` via devtools | 403.                                                         |           |

---

## 20. Platform admin negative

| #    | URL / Action                                         | Expected                                                                                     | Pass/Fail |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 20.1 | `/en/admin/security-incidents`                       | 403 — `PlatformOwnerGuard` blocks non-platform-owner. Redirect to `/dashboard` or clean 403. |           |
| 20.2 | `/en/admin/tenants`                                  | 403.                                                                                         |           |
| 20.3 | `GET /api/v1/admin/security-incidents` via devtools  | 403.                                                                                         |           |
| 20.4 | `POST /api/v1/admin/security-incidents` via devtools | 403.                                                                                         |           |

---

## 21. Arabic / RTL spot check

Run key teacher flows at `/ar/*`. Assert:

| #     | What to Check                                                                                                                                                  | Expected                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 21.1  | `/ar/wellbeing` — `<html dir="rtl">`; morph bar mirrors.                                                                                                       | RTL active. Morph bar mirrored.               |           |
| 21.2  | `/ar/behaviour/incidents/new` — wizard renders RTL. Student picker and description textarea accept Arabic input.                                               | Arabic input round-trips correctly.           |           |
| 21.3  | Submit an incident with Arabic narrative. Detail page (`/ar/behaviour/incidents/:id`) shows the narrative as Arabic.                                           | Narrative preserved.                          |           |
| 21.4  | `/ar/pastoral/concerns/new` — concern form renders RTL. Submit Arabic concern. Read back Arabic.                                                               | Arabic round-trips.                           |           |
| 21.5  | `/ar/safeguarding/concerns/new` — report form renders RTL. Arabic narrative round-trips.                                                                       | Arabic round-trips.                           |           |
| 21.6  | `/ar/early-warnings` — at-risk list renders RTL. Arabic student names mirror correctly.                                                                        | Mirrored.                                     |           |
| 21.7  | No physical-direction classes (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`) on teacher routes — grep rendered HTML. Zero matches. | Zero.                                         |           |
| 21.8  | Western numerals (0-9) in both locales; Gregorian dates.                                                                                                       | Digits 0-9 visible; no Eastern Arabic digits. |           |
| 21.9  | Zero "MISSING_MESSAGE:" warnings in console across all teacher surfaces.                                                                                       | Zero missing messages.                        |           |
| 21.10 | LTR enforcement on email addresses, URLs, phone numbers, and incident_number (`INC-YYYYMM-NNNN`) regardless of page direction.                                 | LTR correct.                                  |           |

---

## 22. Mobile walkthrough (375×812)

Run the teacher's key flows at 375px. Assert:

| #     | What to Check                                                                                                                      | Expected                                           | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- |
| 22.1  | `/en/wellbeing` — no horizontal scroll. Hub cards stack 1-col. KPI strip becomes 2×2.                                              | `document.body.scrollWidth === window.innerWidth`. |           |
| 22.2  | Morph bar collapses to hamburger + Wellbeing label. Hamburger overlay opens.                                                       | Overlay renders.                                   |           |
| 22.3  | `/en/behaviour/incidents/new` — wizard stacks single-column. Inputs full-width. Font-size ≥ 16px on all inputs (no iOS auto-zoom). | Verified via computed style.                       |           |
| 22.4  | Student picker autocomplete dropdown renders inline (not cropped by viewport). Pills wrap.                                         | Dropdown usable.                                   |           |
| 22.5  | Date picker touch-friendly, 44×44 hit areas.                                                                                       | Verified.                                          |           |
| 22.6  | Attachment drop zone usable via tap (not drag-only).                                                                               | Tap works.                                         |           |
| 22.7  | `/en/behaviour/incidents` list — table collapses to stacked cards OR `overflow-x-auto` with sticky first column.                   | One of the two patterns.                           |           |
| 22.8  | `/en/pastoral/concerns/new` — same stacking pattern.                                                                               | Same.                                              |           |
| 22.9  | `/en/safeguarding/concerns/new` — same stacking pattern.                                                                           | Same.                                              |           |
| 22.10 | `/en/early-warnings` — table collapses to cards; tier badges visible.                                                              | Mobile-usable.                                     |           |
| 22.11 | `/en/wellbeing/staff` — anchor-nav sections stack; My Workload card visible above the fold.                                        | Usable.                                            |           |
| 22.12 | Quick-Log FAB bottom-right; 56×56 target; does not obscure submit buttons.                                                         | FAB placement correct.                             |           |
| 22.13 | Modal dialogs (confirm withdraw, confirm seal attempt blocked banner) scroll internally, dismissible via × + backdrop tap.         | Modals usable.                                     |           |

---

## 23. Cross-tenant hostile check

Teacher in Tenant A attempts to reach Tenant B resources.

| #    | What to Check                                                                                                      | Expected                                       | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | --------- |
| 23.1 | `/en/behaviour/incidents/{tenantB_incident_id}` while signed in as teacher@nhqs.test.                              | 404 page. Zero Tenant B data in response body. |           |
| 23.2 | `/en/pastoral/concerns/{tenantB_concern_id}`                                                                       | 404.                                           |           |
| 23.3 | `/en/safeguarding/my-reports` — zero rows referencing Tenant B.                                                    | Scoped.                                        |           |
| 23.4 | `/en/early-warnings/{tenantB_student_id}`                                                                          | 404.                                           |           |
| 23.5 | `GET /api/v1/behaviour/incidents/{tenantB_id}` via devtools.                                                       | 404.                                           |           |
| 23.6 | `POST /api/v1/pastoral/concerns` with body referencing Tenant B student_id → 400 or 404. No cross-tenant mutation. | Blocked.                                       |           |
| 23.7 | Global search: type a Tenant B student's name. Zero matches.                                                       | Scoped.                                        |           |
| 23.8 | `GET /api/v1/wellbeing/dashboard-summary` — payload contains Tenant A numbers only.                                | Scoped.                                        |           |

---

## 24. Backend endpoint map (teacher-touched)

This spec exercises the following endpoint groups. Full per-endpoint contract testing lives in the integration spec.

| Module                 | Endpoints exercised (teacher scope)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Wellbeing aggregate    | `GET /v1/wellbeing/dashboard-summary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §4                |
| AI flags               | Teacher cannot `PATCH /v1/ai-flags/:moduleKey` (admin-only). Teacher reads flag state implicitly via gated pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §9                |
| Behaviour incidents    | `POST /v1/behaviour/incidents` (own scope), `POST /v1/behaviour/incidents/quick`, `POST /v1/behaviour/incidents/ai-parse` (flag-gated), `GET /v1/behaviour/incidents` (scoped), `GET /v1/behaviour/incidents/my`, `GET /v1/behaviour/incidents/:id` (in scope), `PATCH /v1/behaviour/incidents/:id` (own reports only), `PATCH /v1/behaviour/incidents/:id/status` (limited transitions), `POST /v1/behaviour/incidents/:id/withdraw` (reporter only), `POST /v1/behaviour/incidents/:id/follow-up`, `POST /v1/behaviour/incidents/:id/participants` (reporter only), `DELETE /v1/behaviour/incidents/:id/participants/:pid` (reporter only), `POST /v1/behaviour/incidents/:id/attachments`, `GET /v1/behaviour/incidents/:id/attachments`, `GET /v1/behaviour/incidents/:id/attachments/:aid`, `GET /v1/behaviour/incidents/:id/history` | §6, §7            |
| Behaviour tasks        | `GET /v1/behaviour/tasks?assigned_to=<teacher>` (own tasks), `PATCH /v1/behaviour/tasks/:id` (own only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §4.3              |
| Behaviour AI analytics | `POST /v1/behaviour/analytics/ai/query` (scoped + flag-gated)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §9                |
| Pastoral concerns      | `POST /v1/pastoral/concerns` (tiers 1+2 only, in-scope students), `GET /v1/pastoral/concerns?mine=true` (own), `GET /v1/pastoral/concerns` (tier 1/2 in-scope), `GET /v1/pastoral/concerns/:id` (tier 1/2 in-scope), `PATCH /v1/pastoral/concerns/:id` (author only), `POST /v1/pastoral/concerns/:id/escalate` (author, tier 2→3 blocked), `POST /v1/pastoral/concerns/:id/share-with-parent` (author only), `PATCH /v1/pastoral/concerns/:id/narrative` (author only)                                                                                                                                                                                                                                                                                                                                                                    | §12, §13          |
| Safeguarding           | `POST /v1/safeguarding/concerns` (report-only), `GET /v1/safeguarding/my-reports` (own reports)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §14               |
| Early warning          | `GET /v1/early-warnings?page=1&pageSize=100` (scoped), `GET /v1/early-warnings/summary`, `GET /v1/early-warnings/:studentId` (in scope), `POST /v1/early-warnings/:studentId/acknowledge` (in scope)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §16               |
| Staff wellbeing        | `GET /v1/staff-wellbeing/respond/active` (own participation), `POST /v1/staff-wellbeing/respond/:surveyId` (anonymous), `GET /v1/staff-wellbeing/my-workload` (if endpoint exists)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §17, §18          |
| **Negative (403)**     | All admin-only endpoints exercised via devtools in §10, §13.3, §15, §19, §20 — each expected to return 403.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Scattered through |

---

## 25. DevTools console & network health

Across the full walkthrough:

| #    | What to Check                                                                                                                                                                   | Expected                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 25.1 | Zero `error` or `warn` severity console entries across all teacher-visible pages. No React key warnings, no uncaught promise rejections, no `MISSING_MESSAGE:` strings.         | Console clean.           |           |
| 25.2 | Every API response on happy path = 200/201/202/204. 401/403/404 expected on negative rows. 400 expected on Zod violations. NO 500 anywhere.                                     | Error classes per row.   |           |
| 25.3 | No PII in URLs. Student names, narratives never appear as query-string values.                                                                                                  | URL hygiene.             |           |
| 25.4 | Every JSON response has `{data, meta}` (list) or object shape.                                                                                                                  | Shape consistent.        |           |
| 25.5 | Error responses use `{error: {code, message}}` shape.                                                                                                                           | Shape consistent.        |           |
| 25.6 | No ad-hoc polling loops > 30s frequency. Check Network tab for repeating requests.                                                                                              | No polling abuse.        |           |
| 25.7 | No data bleeding between tenants or out-of-scope students across the full run. Dump `performance.getEntriesByType('resource')` and grep for Tenant B identifiers. Zero matches. | Zero cross-tenant leaks. |           |

---

## 26. Data invariants — post-conditions per flow

After running the teacher flows, assert:

| #     | What to run (SQL)                                                                                                                                                                                         | Expected                                                | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 26.1  | After §6.1 incident creation: `SELECT status, reported_by FROM behaviour_incidents WHERE id = <new>` — `reported_by=<teacher_user_id>`, status is `draft` or `submitted`.                                 | Teacher is on record.                                   |           |
| 26.2  | `SELECT student_id FROM behaviour_incident_students WHERE incident_id = <new>` — all returned student_ids ∈ in-scope set.                                                                                 | No out-of-scope student snuck in.                       |           |
| 26.3  | After §12 concern logging: `SELECT tier, reported_by FROM pastoral_concerns WHERE id = <new>` — tier ∈ {1,2}, reported_by=<teacher>.                                                                      | No tier 3 bypass.                                       |           |
| 26.4  | After §14.2 safeguarding report: `SELECT reported_by, status FROM safeguarding_concerns WHERE id = <new>` — reported_by=<teacher>, status in {reported, new, triaging}.                                   | Teacher on record; initial state.                       |           |
| 26.5  | After §16.7 early-warning acknowledge: `SELECT acknowledged_at, acknowledged_by FROM student_risk_profiles WHERE student_id = <in-scope>` — both populated.                                               | Ack persisted.                                          |           |
| 26.6  | After §18 survey submit: `SELECT user_id FROM survey_responses WHERE survey_id = <active>` — NO rows contain teacher's user_id (column should be null/absent).                                            | Anonymity invariant holds.                              |           |
| 26.7  | Cross-tenant: `SELECT COUNT(*) FROM behaviour_incidents WHERE tenant_id=<B> AND reported_by=<teacher@A>` = 0.                                                                                             | Zero.                                                   |           |
| 26.8  | Out-of-scope: `SELECT COUNT(*) FROM behaviour_incident_students bis JOIN behaviour_incidents bi ON bi.id=bis.incident_id WHERE bi.reported_by=<teacher> AND bis.student_id IN (<out-of-scope list>)` = 0. | No teacher-authored incidents on out-of-scope students. |           |
| 26.9  | Teacher cannot create sanctions: `SELECT COUNT(*) FROM behaviour_sanctions WHERE created_by=<teacher>` = 0 (unless seeded differently).                                                                   | Zero direct creates.                                    |           |
| 26.10 | Audit logs: `SELECT action, actor_id FROM audit_log WHERE actor_id=<teacher> AND action LIKE 'behaviour.%'` — only `create`, `view`, `update_own`, `withdraw` entries.                                    | No admin actions by teacher.                            |           |

---

## 27. Observations spotted during the walkthrough

Log anything the tester notices that is not a hard Fail but warrants follow-up. Populate during execution.

- **T-1** — Placeholder: behaviour.policy-evaluation side panel button visibility for teachers. Expected: hidden. Observed: ******\_\_\_\_******.
- **T-2** — Placeholder: AI-disabled banner link target for teachers. The banner currently deep-links to `/settings/ai-flags`, which 403s for teacher. Banner should check `ai_flag.manage` before rendering the link. Observed: ******\_\_\_\_******.
- **T-3** — Placeholder: `/wellbeing/staff` legacy redirect `/wellbeing/dashboard` → `#aggregate` for teachers. If the aggregate section is hidden for teacher, the anchor lands on an empty state. Observed: ******\_\_\_\_******.
- **T-4** — Placeholder: Teacher sees `behaviour` hub tile "Sanctions" — is it hidden, demoted to read-only, or visible with full admin affordances? Confirm with PLAN. Observed: ******\_\_\_\_******.
- **T-5** — Placeholder: Teacher's student search on `/behaviour/incidents/new` — does the dropdown filter by scope client-side, or does it rely on the backend to 403 on submit? Client-side filtering is preferred for UX. Observed: ******\_\_\_\_******.
- **T-6** — Placeholder: Recent-activity feed on super-hub — does the backend scope rows to teacher-accessible activity, or does it return tenant-wide activity and rely on per-row permission check at the deep link? Record the model. Observed: ******\_\_\_\_******.
- **T-7** — Placeholder: `/safeguarding` landing for teacher — does the app show a minimal report-only landing or 403? Both are acceptable; record which. Observed: ******\_\_\_\_******.
- **T-8** — Placeholder: Tier-3 concern filter on `/pastoral/concerns` list — is the "Tier 3" tab hidden, or visible but returning empty results? Hidden is preferred (it doesn't reveal that tier 3 exists). Observed: ******\_\_\_\_******.

---

## 28. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |

**This spec is release-ready for the teacher tier when every row above is Pass (or explicitly `(info)` or an observation in §27), zero console errors, zero `500` on happy-path, and §26 data invariants all hold. The `/safeguarding` super-sub-hub MUST be unreachable for teachers (report-only landing OR 403); the `/safeguarding/concerns/new` report form MUST work. All admin-only URLs in §10, §13.3, §15, §19, §20 MUST 403. All cross-tenant and out-of-scope URLs MUST 404 / 403. Companion specs (`admin_view`, `parent_view`, `student_view`, `integration`, `worker`, `perf`, `security`) must likewise be Pass before the full `/e2e-full` pack is signed off.**
