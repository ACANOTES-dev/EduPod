# Wellbeing Module — Live Playwright Walkthrough

Tenant: `nhqs.edupod.app` · User: Yusuf Rahman (school principal + owner)
Date: 2026-04-20

## Morph-bar entry — `Wellbeing` pill

- Pill jumps directly to `/en/behaviour` (no `/wellbeing` landing exists).
- Sub-strip rendered: **Behaviour · Incidents · Pastoral · SEN · More**.
- "More" overflow contains: Wellbeing, Early Warnings (per nav-config; to be confirmed).
- The user is right that this sub-strip is the pattern we want to retire — `/people`, `/finance`, `/operations`, `/learning` all use a hub-tile dashboard with no sub-strip.

---

## `/behaviour` — Behaviour Pulse landing

URL: `https://nhqs.edupod.app/en/behaviour`

### Critical issues

1. **`behaviour.*` translation namespace is missing in `messages/en.json`.** Every label on the page renders as the raw key:
   - `behaviour.dashboard.stats.totalIncidents`
   - `behaviour.dashboard.stats.positiveNegative`
   - `behaviour.dashboard.stats.openTasks`
   - `behaviour.dashboard.stats.overdue`
   - `behaviour.dashboard.quickActions.allIncidents`
   - `behaviour.dashboard.quickActions.students`
   - `behaviour.dashboard.quickActions.tasks`
   - `behaviour.dashboard.quickActions.escalated`
   - `behaviour.components.quickLog`
2. **`GET /api/v1/behaviour/incidents/stats` returns HTTP 400.** This is the source of the user's reported "validation failed" toast — the page silently logs `[BehaviourPage] {error: Object}` to console while showing the toast. Stats render as 0/0/0/0 because of the failure.
3. **Layout is the old style** — KPI strip + 4 quick-action pills + recent activity. Functional but doesn't match the `/people` / `/finance` dashboard standard.
4. **"Log Incident" CTA** in the header works (links to `/behaviour/incidents/new`).

### Console (selected)

- 28 errors total on first load.
- `MISSING_MESSAGE` for every behaviour key.
- `Failed to load resource: 400` on `/api/v1/behaviour/incidents/stats`.

---

## `/wellbeing` — confirmed **404**

Clicking the `More` overflow item under the wellbeing sub-strip routes to `/en/wellbeing`, which renders a bare `404 — Page not found`. There is no `page.tsx` at `apps/web/src/app/[locale]/(school)/wellbeing/`. This is the user's reported bug.

The "More" overflow contains exactly two items:

- **Wellbeing** → `/en/wellbeing` (404)
- **Early Warnings** → `/en/early-warnings`

---

## `/behaviour/incidents` — Incidents list

URL: `https://nhqs.edupod.app/en/behaviour/incidents`

- Renders. Title `Behaviour Incidents` is hard-coded English (works), but the **quick-log button caption is still a raw key** (`behaviour.components.quickLog.title`).
- Tabs render in English: All / Positive / Negative / Pending / Escalated / My.
- Table empty (no incidents seeded for tenant). 17 console errors — same MISSING_MESSAGE storm as the dashboard.
- "New Incident" CTA works.

## `/behaviour/incidents/new` — Log Incident form

URL: `https://nhqs.edupod.app/en/behaviour/incidents/new`

### Critical issues

1. **Toast: `Cannot GET /api/v1/behaviour/templates?pageSize=50`** — the backend has no `/behaviour/templates` route, but the form fetches it on mount.
2. **No behaviour categories exist for this tenant** (`/api/v1/behaviour/categories` returns 200 with empty array). Form shows `behaviour.components.categoryPicker.noCategories` — incident category picker is unusable until categories are seeded or the admin Settings → Behaviour Categories page is wired (see Settings section below).
3. **Every form label / placeholder is a raw translation key** — `behaviour.newIncident.labels.category/students/description/parentDescription/context/when/contextType/location/notes/autoSubmit/autoSubmitDescription`, etc.
4. The form structure itself is functional — has student picker (search), description, parent description, when, context type, location, notes, auto-submit toggle. Submit button enabled.
5. 53 console errors: still the missing-message storm + the 404 from templates.

## Behaviour sub-page sweep

| Route                              | h1                         | State                    | Major issues                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/behaviour/students`              | Student Behaviour Overview | Renders, empty           | Search placeholder is raw key `behaviour.students.search`                                                                                                                                                                                                                                        |
| `/behaviour/analytics`             | Analytics                  | **All charts blank**     | **8 of 8 endpoints 404** — frontend calls `/behaviour/analytics/{pulse,overview,trends,categories,subjects,heatmap,comparisons,staff}` **without `/api/v1` prefix**. Server 307s to localised path which 404s. Module is unusable. Filter dropdown `behaviour.analytics.filters.last30Days` raw. |
| `/behaviour/analytics/ai`          | AI Analytics               | Renders, query box works | Suggested-query labels are raw keys (`behaviour.aiQuery.suggestions.*`). Query history endpoint returns 404 toast.                                                                                                                                                                               |
| `/behaviour/sanctions`             | Sanctions                  | Renders, empty           | Clean — title in English, list/calendar tabs, filters. Functional shell.                                                                                                                                                                                                                         |
| `/behaviour/exclusions`            | Exclusion Cases            | Renders, empty           | Clean. Tab strip per state machine (Initiated → Notice Issued → Hearing Scheduled → Decision Made → Appeal Window → Finalised → Overturned) is wired.                                                                                                                                            |
| `/behaviour/appeals`               | Behaviour Appeals          | Renders, empty           | Clean. Status tabs (Submitted / Under Review / Hearing Scheduled / Decided / Withdrawn) wired.                                                                                                                                                                                                   |
| `/behaviour/interventions`         | Interventions              | Renders, empty           | Clean. Status tabs (Active / Overdue / Monitoring / Completed / All) wired.                                                                                                                                                                                                                      |
| `/behaviour/recognition`           | Recognition Wall           | **Broken**               | Toast: `Cannot GET /api/v1/behaviour/recognition?pageSize=50&status=published` — endpoint missing. All tab labels and filter labels raw keys (`behaviour.recognition.tabs.{wall,leaderboard,houses,pending}Short`).                                                                              |
| `/behaviour/tasks`                 | Behaviour Tasks            | **Broken**               | Toast: "Validation failed" on first load. Stat labels are raw keys (`behaviour.tasks.statsPending`, `statsOverdue`, `statsCompletedToday`).                                                                                                                                                      |
| `/behaviour/alerts`                | Behaviour Alerts           | Renders, empty           | Clean shell. Empty-state label is raw key `behaviour.alerts.noResults`.                                                                                                                                                                                                                          |
| `/behaviour/amendments`            | Amendment Notices          | Renders, empty           | Back button label raw key (`behaviour.amendments.back`). Empty-state raw key.                                                                                                                                                                                                                    |
| `/behaviour/documents`             | Documents                  | Renders, empty           | Clean. "Generate Document" CTA visible.                                                                                                                                                                                                                                                          |
| `/behaviour/guardian-restrictions` | Guardian Restrictions      | Renders, empty           | Clean. "Add Restriction" CTA visible.                                                                                                                                                                                                                                                            |
| `/behaviour/parent-portal`         | —                          | Redirects                | 302 → `/dashboard`. This is a parent-only view — correct behaviour for principal account.                                                                                                                                                                                                        |

### Cross-cutting behaviour module bugs

- **`behaviour.*` translation namespace is partially loaded.** Some pages have English titles in TSX (hard-coded), but all sub-component labels — stat tiles, tabs, filters, empty states, quick-log button, recognition wall — render as raw keys. The `messages/en.json` file is missing wide swaths of the `behaviour` namespace.
- **Behaviour analytics is completely broken** (URL prefix bug — easy fix).
- **Behaviour templates endpoint (`/api/v1/behaviour/templates`) is missing on the backend** but the new-incident form fetches it on mount, producing the toast on every form open.
- **Recognition wall list endpoint is missing** (`GET /api/v1/behaviour/recognition`).
- **Behaviour tasks "validation failed"** on first load — likely the same shape mismatch as `/api/v1/behaviour/incidents/stats` returning 400.
- **No behaviour categories seeded** for this tenant — incident form is unusable until an admin creates categories via Settings → Behaviour Categories (which we will visit next).

---

## `/pastoral` — Pastoral workspace

URL: `https://nhqs.edupod.app/en/pastoral`

This module is **dramatically more polished** than behaviour. Already implements something close to the hub-tile pattern:

- Page title `Student Wellbeing Workspace` + descriptive copy.
- Tab strip: **Overview · Concerns · Cases · Interventions · Referrals · SST · Check-ins · Critical incidents** (acts as a sub-strip but local to /pastoral).
- Header CTAs: **Log concern · Open case · Declare incident**.
- KPI counters: Recent concerns / Urgent review queue / Immediate attention (all 0).
- "Operational lanes" section with tile-style cards for Interventions, Referrals, etc.
- Translations are present and complete.
- Tier-3 access control banner up top — strong tone for a sensitive area.

This page is a **good template for what `/wellbeing` should become** — but it's currently scoped to pastoral only.

| Pastoral sub-page              | h1 / state                          | Issue                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/pastoral/concerns`           | Pastoral concerns (workspace + tab) | Renders, empty. Two raw keys: `pastoral.concerns.shared.minSearchLength`.                                                                                                                                                                                                                                          |
| `/pastoral/concerns/new`       | Log pastoral concern                | Form renders cleanly, all labels in English. Student picker, type, follow-up, case linkage. No errors.                                                                                                                                                                                                             |
| `/pastoral/cases`              | Pastoral cases                      | Renders, empty.                                                                                                                                                                                                                                                                                                    |
| `/pastoral/sst`                | SST meetings                        | Renders, empty.                                                                                                                                                                                                                                                                                                    |
| `/pastoral/critical-incidents` | Critical incidents                  | Renders, empty.                                                                                                                                                                                                                                                                                                    |
| `/pastoral/checkins`           | **CRASHES**                         | Page-level error boundary triggers — "Something went wrong". Console: `TypeError: F.map is not a function` in `pastoral/checkins/page-c16948ffe13d6257.js:1:11510`. The check-ins API returns a shape (likely `{ data: [...], meta: ... }`) but the page calls `.map` on the response root. Easy fix once located. |
| `/pastoral/referrals`          | Referrals                           | Renders, empty.                                                                                                                                                                                                                                                                                                    |
| `/pastoral/interventions`      | Interventions                       | Renders, empty.                                                                                                                                                                                                                                                                                                    |

---

## `/wellbeing/*` — Staff Wellbeing pages

| Route                    | h1                | State                          | Issue                                                                                                                                                                                                          |
| ------------------------ | ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/wellbeing`             | —                 | **404**                        | Page not found. No `page.tsx`.                                                                                                                                                                                 |
| `/wellbeing/dashboard`   | **CRASHES**       | Page-level error boundary      | `TypeError: Cannot read properties of undefined (reading 'mean')` in `dashboard/page-…js`. Aggregate workload-summary endpoint returns a shape missing `.mean`.                                                |
| `/wellbeing/my-workload` | My Workload       | "Unable to load workload data" | All three backend endpoints return **404**: `/api/v1/staff-wellbeing/my-workload/{summary,cover-history,timetable-quality}`. Staff-wellbeing module appears not deployed for this tenant (or module flag off). |
| `/wellbeing/surveys`     | Survey Management | Renders, empty                 | Clean. "Create Survey" CTA visible. Empty state copy in English.                                                                                                                                               |
| `/wellbeing/survey`      | Staff Survey      | Renders, empty                 | Clean. Shows "no active surveys" empty state.                                                                                                                                                                  |
| `/wellbeing/reports`     | **CRASHES**       | Page-level error boundary      | Termly summary endpoint missing/wrong shape.                                                                                                                                                                   |
| `/wellbeing/resources`   | **CRASHES**       | Page-level error boundary      | `TypeError: Cannot read properties of undefined (reading 'length')` in `resources/page-…js`. Resources endpoint returns shape missing the expected list.                                                       |

**Net:** 4 of 7 staff-wellbeing pages are broken, including the key Dashboard/Reports/Resources pages and the entire `my-workload` data layer.

---

## `/early-warnings/*` — Early Warning system

| Route                      | h1              | State                     | Issue                                                                                                                                                       |
| -------------------------- | --------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/early-warnings`          | Early Warning   | Renders, empty            | Clean. Header CTAs `Cohort Analysis` + `Early Warning Settings`. Empty list with filters (status / year group / class). No students flagged.                |
| `/early-warnings/cohort`   | Cohort Analysis | Renders, empty            | Clean. "Group By: Year Group" + "No students flagged".                                                                                                      |
| `/early-warnings/settings` | **CRASHES**     | Page-level error boundary | `TypeError: Cannot read properties of undefined (reading 'attendance')` while reducing — settings response is empty / missing the per-domain config object. |

---

## `/safeguarding/*` — Safeguarding routes

- `/safeguarding` → 302 to `/pastoral` (intentional alias).
- `/safeguarding/concerns` → 302 to `/pastoral/concerns`.
- `/safeguarding/my-reports` → 302 to `/pastoral/concerns`.

So safeguarding has **no standalone UI** — it's funneled into the pastoral workspace. The dedicated safeguarding pages found in code (`apps/web/src/app/[locale]/(school)/safeguarding/concerns`, `my-reports`) appear to be unreachable in production.

---

## `/settings/behaviour-*` — Behaviour configuration

| Route                            | h1                   | State          | Issue                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/behaviour-categories` | Behaviour Categories | Renders, empty | Clean. "No categories configured yet" + "Add Category". Suggests no seeded defaults — every new tenant needs an admin to manually create categories before staff can log incidents.                                                    |
| `/settings/behaviour-policies`   | Behaviour Policies   | Renders, empty | Clean. Five policy stages visible (Consequence / Approval / Notification / Support / Alerting), all "No rules configured for this stage". CTAs `behaviourSettings.policies.{testMode,export,import,addRule}` rendered as **raw keys**. |
| `/settings/behaviour-general`    | Behaviour Settings   | Renders        | Most field labels (`behaviourSettings.general.labels.*`, `descriptions.*`) render as raw keys. 52 console errors from missing translations.                                                                                            |
