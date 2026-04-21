# Wellbeing E2E Playwright Log

Running log of every issue found during the ten-session wellbeing walkthrough. Each session appends its own heading; entries within a session use the `W-{SESSION}-{NUM}` format described in `PLAN.md` §6.

A session is only **Complete** when every issue it opened is marked `**Verified:**` or explicitly `**Deferred:**` with a reason.

---

## Session ledger

| Session | Started    | Completed  | Issues opened | P0  | P1  | P2  | P3  | Status                                                                   |
| ------- | ---------- | ---------- | ------------- | --- | --- | --- | --- | ------------------------------------------------------------------------ |
| S0      | 2026-04-21 | 2026-04-21 | 5             | 1   | 2   | 1   | 1   | **Complete** (all deferred to owning sessions; see rationale in entries) |
| S1      | 2026-04-21 |            |               |     |     |     |     | In progress                                                              |
| S2      |            |            |               |     |     |     |     | Not started                                                              |
| S3      |            |            |               |     |     |     |     | Not started                                                              |
| S4      |            |            |               |     |     |     |     | Not started                                                              |
| S5      |            |            |               |     |     |     |     | Not started                                                              |
| S6      |            |            |               |     |     |     |     | Not started                                                              |
| S7      |            |            |               |     |     |     |     | Not started                                                              |
| S8      |            |            |               |     |     |     |     | Not started                                                              |
| S9      |            |            |               |     |     |     |     | Not started                                                              |

---

## S0 — Seeding + scope map

**Status:** Complete (2026-04-21)

### Session summary

S0 established a rich, reproducible data baseline on NHQS and produced the route scope map for the eight hub sessions that follow. 50 behaviour incidents (33 negative + 17 positive across 6 weeks, with 9 sanctions and 10 recognition awards), 4 house teams with 207 student memberships, 5 pastoral concerns + 3 cases + 1 intervention + 3 referrals, 4 safeguarding concerns (1 sealed) + 1 expired break-glass grant, and 2 staff-wellbeing surveys (5 + 15 responses) were seeded via a new idempotent script (`packages/prisma/scripts/seed-wellbeing-walkthrough.ts`). The visual smoke-test across the five hub landings surfaced one P0 (Staff Wellbeing crashes with a `.mean` TypeError for admin-without-staff-profile), two P1 numeric inconsistencies (Behaviour "Incidents This Week" showing total 50, Safeguarding "Sealed This Year" showing 0 despite a freshly-sealed concern), one P2 home-dashboard signal mismatch, and one P3 copy polish. All five are deferred to their owning sessions (S3/S4/S5/S7/S8) per the S0 blueprint's explicit out-of-scope clause — smoke test = "does the page render", and only the Staff Wellbeing page failed that bar. The EW trigger (task #6) is also deferred to S6, whose blueprint is written to handle it. Scope-map, seed script, and log are committed; all S0-created screenshots deleted. Next session can kick off with `/A1 S1`.

**Session plan:** [`S0_seeding_scope_map.md`](./S0_seeding_scope_map.md)

### Session work completed

- Scope map authored at `_scope-map.md` (77 routes).
- NHQS inventory captured: 207 active students, 155 households, 35 staff, 31 behaviour categories pre-seeded; zero behaviour incidents / pastoral / safeguarding / staff-wellbeing data at session start.
- Seed script written: `packages/prisma/scripts/seed-wellbeing-walkthrough.ts` (idempotent, marker-based teardown + reseed).
- Deployed via rsync + executed on production. Post-seed counts verified:
  - 50 behaviour incidents (33 negative + 17 positive spread over 6 weeks)
  - 9 sanctions, 10 recognition awards, 4 house teams with 207 memberships
  - 5 pastoral concerns, 3 cases, 1 intervention, 3 referrals
  - 4 safeguarding concerns (1 sealed), 3 actions, 1 expired break-glass grant
  - 2 staff surveys with 20 responses, early-warning config enabled

### Issues found during visual baseline pass

### W-S0-001 — Staff Wellbeing hub landing crashes

- **Severity:** P0
- **Route:** `/en/wellbeing/dashboard` → redirects to `/en/wellbeing/staff`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as admin owner
  2. Navigate to `/en/wellbeing/dashboard` (or click Staff Wellbeing module tile from `/en/wellbeing`)
  3. Page renders "Something went wrong" error boundary instead of dashboard
- **Expected:** Staff wellbeing landing with workload + survey + resources widgets
- **Actual:** Full-page error boundary. Console shows 5 errors:
  - `GET /api/v1/staff-wellbeing/my-workload/summary` → 404 (`STAFF_PROFILE_NOT_FOUND` — owner user has no staff_profile row)
  - `GET /api/v1/staff-wellbeing/my-workload/timetable-quality` → 404
  - `GET /api/v1/staff-wellbeing/my-workload/cover-history?page=1&pageSize=20` → 404
  - 2× `TypeError: Cannot read properties of undefined (reading 'mean')` in minified `staff/page-*.js:1:4501`. MyWorkloadSection handles `STAFF_PROFILE_NOT_FOUND` gracefully, so the `.mean` crash must be elsewhere (likely AggregateSection or BoardReportSection rendering partial/malformed data).
- **Evidence:** `s0-staff-wellbeing-dashboard.png` (deleted before session close)
- **Deferred:** to **S7** (Staff Wellbeing). Root cause requires reading the actual minified stack mapping and inspecting the aggregate compute service's behaviour on sparse NHQS data. A speculative "harden `isCompleteDashboard`" fix was drafted and reverted without verification — shipping it would have violated the no-silent-fix discipline. S7 owns this surface and has the time budget to do it right: probe each aggregate endpoint with auth headers, find the exact `.mean` deref that crashes, and harden the path.

### W-S0-002 — Behaviour "Incidents This Week" card shows 50 (total), not this-week count

- **Severity:** P1
- **Route:** `/en/behaviour`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour`
  2. Read top KPI card labelled "INCIDENTS THIS WEEK"
- **Expected:** Count of incidents with `occurred_at` within the last 7 days (~11 based on seeded data).
- **Actual:** Card shows **50** — the total of all seeded incidents spanning 6 weeks. Either the filter is missing the date-window clause, or the copy is wrong ("this week" vs "total"). Either way, misleading to users.
- **Evidence:** `s0-behaviour-landing.png` (deleted before session close)
- **Deferred:** to **S3** (Behaviour C — analytics + KPIs). This is a deeper numeric-correctness issue that the S0 blueprint explicitly scopes out ("deep per-tile checks happen in S1–S7"). S3's §3 regression pass exists exactly to catch aggregation mismatches like this against seeded data.

### W-S0-003 — Safeguarding "Sealed This Year" card shows 0 despite 1 sealed concern this week

- **Severity:** P1
- **Route:** `/en/safeguarding`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/safeguarding`
  2. Read KPI card "SEALED THIS YEAR"
- **Expected:** 1 (one sealed concern exists with `sealed_at` = 5 days ago, within the current year)
- **Actual:** 0. Metric is broken — either the query isn't filtering correctly on `sealed_at IS NOT NULL` within the current academic/calendar year, or it's not counting sealed records at all in this widget.
- **Evidence:** `s0-safeguarding-landing.png` (deleted before session close)
- **Deferred:** to **S5** (Safeguarding). Same rationale as W-S0-002 — numeric correctness of a hub-owned KPI belongs to the session that walks that hub in depth. S5 has dedicated steps for sealed-record handling and SLA metrics that will catch this.

### W-S0-004 — Home dashboard "Safeguarding alerts: All clear" despite 4 live safeguarding concerns

- **Severity:** P2
- **Route:** `/en/dashboard`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in and land on home dashboard
  2. Read the "Safeguarding alerts" widget in the right column
- **Expected:** Widget surfaces at least the high-severity unresolved concerns (2 high_sev + 2 medium_sev exist; at minimum the 2 high should raise an "alert").
- **Actual:** "All clear — no pending flags". Either the widget only flags a narrow subset (e.g., SLA breaches only, not general concerns) or the query is wrong. Copy is misleading regardless.
- **Evidence:** none captured (dashboard screenshot not taken separately).
- **Deferred:** to **S5** (Safeguarding) for root-cause on what the widget actually measures, and to **S8** (cross-cutting) to verify home-dashboard safeguarding signal across roles. The home dashboard itself is outside the wellbeing-module scope of this walkthrough, but the widget it surfaces is authored by the safeguarding module.

### W-S0-005 — Pastoral landing "Recent concerns loaded: 3" when 5 concerns exist

- **Severity:** P3
- **Route:** `/en/pastoral`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/pastoral`
  2. Read KPI "RECENT CONCERNS LOADED" (value = 3)
- **Expected:** Clarity on what "recent" means, or all 5 surfaced.
- **Actual:** Showing 3 of 5. "Recent" is ambiguous without a date range label. Copy should read "last 7 days" or "last 14 days" so users understand the filter.
- **Evidence:** `s0-pastoral-landing.png` (deleted before session close)
- **Deferred:** to **S4** (Pastoral Care). Pure copy polish — S4 will fold this into its polish commit or batch it with similar copy-tightening items discovered during the deep walk.

---

## S1 — Behaviour A (incidents + sanctions + exclusions + appeals)

**Status:** In progress (started 2026-04-21)
**Session plan:** [`S1_behaviour_A.md`](./S1_behaviour_A.md)

### Issues found

### W-S1-001 — School owner/principal only see incidents they personally reported (25 of 50 visible)

- **Severity:** P0
- **Route:** `/en/behaviour/incidents`
- **Role:** owner@nhqs.test (roles: `school_owner` + `school_principal`)
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as owner, navigate to `/en/behaviour/incidents`
  2. Table reports "Showing 1–20 of 25"
- **Expected:** All 50 seeded incidents visible to the school principal. The principal is the person in the building most needing visibility into every incident.
- **Actual:** Only the 25 incidents whose `reported_by_id = owner.user_id` are returned. The 25 incidents reported by other staff (Sarah Daly, DSL, etc.) are hidden.
- **Root cause:** `BehaviourScopeService.getUserScope` (apps/api/src/modules/behaviour/behaviour-scope.service.ts) checks `permissions` for `behaviour.admin` / `behaviour.manage` / `behaviour.view` to decide scope. The roles `school_owner` and `school_principal` are granted zero `behaviour.*` permissions by the role seeder — they rely on the owner-bypass in `PermissionGuard.isOwner`. `BehaviourScopeService` does not consult the owner bypass, so owner/principal falls through to scope `'own'` → `reported_by_id = userId`.
- **Evidence:** DB confirms 50 incidents exist; `... WHERE reported_by_id = owner.id` returns exactly 25.
- **Fix:** e4bcf0b3 — see commit body for the five fixes bundled together.
- **Verified:** 2026-04-21 — re-walked list + QuickLog on production, passes.

### W-S1-002 — Incidents list "Reporter" column shows `—` for every row

- **Severity:** P1
- **Route:** `/en/behaviour/incidents`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/incidents`
  2. Inspect the "Reporter" column — every row displays `—`
- **Expected:** Reporter full name (e.g., "Yusuf Rahman"). The landing page's "Recent activity" feed shows these names correctly, so the data is present.
- **Actual:** Every row `—`.
- **Root cause:** Frontend list (apps/web/src/app/[locale]/(school)/behaviour/incidents/page.tsx:42) expects `reported_by_user`, but the API include is the Prisma relation name `reported_by` (apps/api/src/modules/behaviour/behaviour-incidents.service.ts:427). Field-name mismatch → always null → falsy → renders `—`. Same bug repeats on the detail page at `apps/web/…/incidents/[id]/page.tsx:75,392`.
- **Evidence:** Snapshot of list — every Reporter cell is `—`.
- **Fix:** e4bcf0b3 — see commit body for the five fixes bundled together.
- **Verified:** 2026-04-21 — re-walked list + QuickLog on production, passes.

### W-S1-003 — Raw i18n key `behaviour.incidents.statuses.under_review` rendered in status column

- **Severity:** P1
- **Route:** `/en/behaviour/incidents`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/incidents`
  2. Observe rows 2026-04-16 (Fighting / Felix Doherty) and 2026-03-18 (Bullying verbal / Chloe Evans). Both show cell text `behaviour.incidents.statuses.under_review`.
- **Expected:** Translated label, e.g., "Under review".
- **Actual:** Raw dotted translation key printed in cell and logged to console: `MISSING_MESSAGE: behaviour.incidents.statuses.under_review (en)`.
- **Evidence:** Console error + visible cell text. Likely the same gap for any other statuses the seed didn't exercise — need to audit the enum `IncidentStatus` vs messages/en.json.
- **Fix:** e4bcf0b3 — see commit body for the five fixes bundled together.
- **Verified:** 2026-04-21 — re-walked list + QuickLog on production, passes.

### W-S1-004 — Category picker shows "+N pts" for negative categories — identical to positives (user-flagged)

- **Severity:** P1
- **Route:** `/en/behaviour/incidents/new` and QuickLog modal on `/en/behaviour/incidents`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Open `/en/behaviour/incidents/new` (or click the floating Quick Log button on the incidents list)
  2. Inspect category chips: Fighting "+5pts", Weapons-related concern "+5pts", Bullying "+3/+5pts", Theft "+5pts" — all display a literal `+Npts` badge
  3. Compare with positives: Kindness "+3pts", Acts of integrity "+5pts" — indistinguishable
- **Expected:** Negative categories should clearly read as a deduction (e.g., `−5pts`, red styling) or otherwise be visually distinct from positives. Sign + colour must communicate the scoring polarity consistently with the scoring model.
- **Actual:** Every chip uses `+` prefix and the same badge styling. A reporter cannot tell at a glance whether Fighting awards or deducts 5 points.
- **Evidence:** Screenshot of /new chips; same on QuickLog modal.
- **Fix:** e4bcf0b3 — see commit body for the five fixes bundled together.
- **Verified:** 2026-04-21 — re-walked list + QuickLog on production, passes.

### W-S1-006 — Submitting a new incident returns 500 — `tenant_sequences` row for `behaviour_incident` missing for NHQS (and every other tenant)

- **Severity:** P0
- **Route:** `/en/behaviour/incidents/new`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/incidents/new`
  2. Pick Lateness, select Adam Moore, fill description + location, click Submit Incident
  3. API responds `500` and the UI silently surfaces no toast
- **Expected:** Incident created with a reference like `BI-2026-000001` and a redirect to the detail page.
- **Actual:** 500 response. Server log: `Unhandled exception: Sequence type "behaviour_incident" not found for tenant 3ba9b02c-…`.
- **Root cause:** `SequenceService.nextNumber` throws when `tenant_sequences` has no row for the (tenant, type) pair. DB query confirms NHQS — and every other tenant — has rows for application/household/invoice/payment/payslip/receipt/staff/student but no `behaviour_incident` row (and missing `pastoral_case`, `refund`, `sen_support_plan` system-wide). Creating a behaviour incident via the UI was never exercised on these tenants because S0 seeded via direct Prisma writes that bypass the sequence service.
- **Evidence:** `tenant_sequences` aggregate query + 500 trace from PM2 logs.
- **Fix:** {pending}
- **Verified:** {pending}

### W-S1-005 — QuickLog modal shows raw i18n keys for placeholders and submit button

- **Severity:** P1
- **Route:** `/en/behaviour/incidents` (Quick Log floating button)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. On `/en/behaviour/incidents` click the floating "Quick Log" button
  2. Modal opens — student search input placeholder reads `behaviour.components.quickLog.searchStudents`, description textarea placeholder reads `behaviour.components.quickLog.addDetails`, submit button reads `behaviour.components.quickLog.logIncident`
- **Expected:** Translated strings (e.g., "Search students…", "Add details", "Log incident"). The /new page has working equivalents ("Search students…", "Describe what happened…", "Submit Incident") so this is a missing key, not a missing component.
- **Actual:** Raw dotted keys displayed. Console: 3 × `MISSING_MESSAGE` errors per render (12+ over the session because the modal re-renders on tab change).
- **Evidence:** Console errors + dialog snapshot.
- **Fix:** e4bcf0b3 — see commit body for the five fixes bundled together.
- **Verified:** 2026-04-21 — re-walked list + QuickLog on production, passes.

---

## S2 — Behaviour B (recognition, houses, leaderboard, documents, tasks, alerts, amendments, guardian-restrictions, interventions, parent-portal)

**Status:** Not started
**Session plan:** [`S2_behaviour_B.md`](./S2_behaviour_B.md)

---

## S3 — Behaviour C (analytics, policies, policy-replay, admin, templates, students index)

**Status:** Not started
**Session plan:** [`S3_behaviour_C.md`](./S3_behaviour_C.md)

---

## S4 — Pastoral Care

**Status:** Not started
**Session plan:** [`S4_pastoral_care.md`](./S4_pastoral_care.md)

---

## S5 — Safeguarding

**Status:** Not started
**Session plan:** [`S5_safeguarding.md`](./S5_safeguarding.md)

---

## S6 — Early Warning / At-Risk

**Status:** Not started
**Session plan:** [`S6_early_warning.md`](./S6_early_warning.md)

---

## S7 — Staff Wellbeing

**Status:** Not started
**Session plan:** [`S7_staff_wellbeing.md`](./S7_staff_wellbeing.md)

---

## S8 — Cross-cutting (mobile, RTL, roles, isolation, visual polish)

**Status:** Not started
**Session plan:** [`S8_cross_cutting.md`](./S8_cross_cutting.md)

---

## S9 — Consolidation → Final Report

**Status:** Not started
**Session plan:** [`S9_consolidation.md`](./S9_consolidation.md)
