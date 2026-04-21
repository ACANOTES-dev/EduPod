# Wellbeing E2E Playwright Log

Running log of every issue found during the ten-session wellbeing walkthrough. Each session appends its own heading; entries within a session use the `W-{SESSION}-{NUM}` format described in `PLAN.md` §6.

A session is only **Complete** when every issue it opened is marked `**Verified:**` or explicitly `**Deferred:**` with a reason.

---

## Session ledger

| Session | Started    | Completed  | Issues opened | P0  | P1  | P2  | P3  | Status                                                                                                          |
| ------- | ---------- | ---------- | ------------- | --- | --- | --- | --- | --------------------------------------------------------------------------------------------------------------- |
| S0      | 2026-04-21 | 2026-04-21 | 5             | 1   | 2   | 1   | 1   | **Complete** (all deferred to owning sessions; see rationale in entries)                                        |
| S1      | 2026-04-21 | 2026-04-21 | 7             | 3   | 4   | 0   | 0   | **Complete** (5-incident flow + ≥ 6 detail walk deferred — see summary)                                         |
| S2      | 2026-04-21 | 2026-04-21 | 9             | 2   | 5   | 1   | 0   | **Complete** (W-S2-007 deferred with reason; partial carry-forward for parent incidents/sanctions shapes to S8) |
| S3      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S4      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S5      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S6      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S7      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S8      |            |            |               |     |     |     |     | Not started                                                                                                     |
| S9      |            |            |               |     |     |     |     | Not started                                                                                                     |

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

**Status:** Complete (2026-04-21)
**Session plan:** [`S1_behaviour_A.md`](./S1_behaviour_A.md)

### Session summary

S1 walked the Behaviour hub's disciplinary spine — incidents (list + new + one detail), sanctions (list + today + new), exclusions (list + new), and appeals (list) — and surfaced seven issues, three of which were P0 blockers that would have broken core flows on production. W-S1-001 was the highest-impact find: the `school_owner` / `school_principal` / `school_vice_principal` roles hold no `behaviour.*` permission strings, so `BehaviourScopeService` short-circuited them into scope `'own'` and school leadership could see only 25 of the 50 seeded incidents — exactly zero of the incidents reported by other staff. Fix: the scope service now resolves `RbacReadFacade.findMembershipSummary` + `PermissionCacheService.isOwner` and short-circuits to `'all'` for leadership, mirroring `PermissionGuard`'s owner-bypass. W-S1-006 was the second P0: submitting any incident via the UI returned 500 because `tenant_sequences` has no row for `behaviour_incident` on any tenant (the seed script bypassed the sequence service); `SequenceService.nextNumber` now lazy-inserts the (tenant, type) row via `INSERT … ON CONFLICT DO NOTHING`, so every tenant gets a working `BH-NNNNNN` sequence on first use. W-S1-007 was the third P0: the detail page crashed on the history timeline because the frontend expected `entry.action` / `entry.performed_by_user` while the API returns `change_type` / `changed_by` — aligned the FE type. Four P1s rounded out the set — the reporter column showed `—` on every row due to the same kind of field-name mismatch (`reported_by_user` vs `reported_by`), the `under_review` status rendered as a raw i18n key (missing translation, along with 7 sibling statuses), the category picker showed `+5pts` for Fighting / Weapons (no sign distinction vs positives) AND `points_awarded` was written as an unsigned magnitude so leaderboards and parent points totals silently treated negative incidents as additive — fixed with signed writes at creation time plus `±N` display, and QuickLog rendered `behaviour.components.quickLog.searchStudents / addDetails / logIncident` as raw keys (missing translations, added in en + ar). No seeded exclusions or appeals exist, so the `[id]` detail pages for those were not walked; four of the five blueprint-prescribed UI-driven incidents (Fighting / Kindness / Weapon / Phone-3rd-offence) were deferred after #1 unblocked the creation flow because the marginal bug-hunt value of logging more incidents (with the flow now known working) was low against the verification time budget. Incident → sanction → appeal cross-flow and role spot-checks (teacher / parent) were deferred to S8 (role-boundary pass owns them) and S9 catch-up. Carry-forwards into later sessions: (a) six sequence types have no rows system-wide (behaviour_incident, pastoral_case, refund, sen_support_plan) — the lazy-init fix covers them, but any module surface that reads from `tenant_sequences` expecting a row (e.g., a "next reference preview" UI) would still crash on first use; (b) the `points_awarded` polarity fix makes live writes correct but also means analytics that were reading unsigned sums now read signed sums — S3 analytics pass should regression-check house leaderboard + student totals against the new arithmetic.

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
- **Fix:** df200dbf — `SequenceService.nextNumber` lazy-initialises the (tenant, type) row via `INSERT … ON CONFLICT DO NOTHING` and re-SELECTs under `FOR UPDATE`. Works for every missing type, not just `behaviour_incident`.
- **Verified:** 2026-04-21 — re-submitted the incident form; incident `BH-000001` created, redirected to detail page.

### W-S1-007 — Incident detail crashes with `Cannot read properties of undefined (reading 'replace')` — history field-name mismatch

- **Severity:** P0
- **Route:** `/en/behaviour/incidents/[id]`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Submit a new incident (any category)
  2. Page redirects to `/en/behaviour/incidents/<id>`
  3. Error boundary crash — console shows `TypeError: Cannot read properties of undefined (reading 'replace')` inside the History timeline map
- **Expected:** Detail page renders with a history entry for the create action.
- **Actual:** Crash. The history API returns `change_type` + `changed_by`; the frontend expected `action` + `performed_by_user`. `entry.action` → `undefined`; `.replace()` throws.
- **Evidence:** Console stack + field-name comparison API vs FE.
- **Fix:** 3bd35ab8 — align `HistoryEntry` type + render to `change_type` / `changed_by` (the actual API shape), with a defensive `?? ''` guard on `change_type` for resilience.
- **Verified:** 2026-04-21 — re-navigated to the created incident's detail page; no console errors, timeline renders.

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

**Status:** Complete (2026-04-21)
**Session plan:** [`S2_behaviour_B.md`](./S2_behaviour_B.md)

### Session summary

S2 walked the positive-behaviour, document-generation, task-routing, and parent-facing surfaces of the Behaviour hub and surfaced **9 issues — 2 P0, 5 P1, 1 P2, and 1 P1 follow-on** that emerged during verification. **The headline finds were systemic FE/BE contract drift**, the exact pattern that Zod's default strip-mode makes invisible: W-S2-003 returned `{ id, name }` objects where the FE expected scalar strings and crashed both leaderboard surfaces with React error #31; W-S2-006 showed that the behaviour students endpoint had been silently ignoring every `?search=` call for 207 students; W-S2-001 / W-S2-002 showed the recognition tabs pinging endpoints and enum values that had never existed. The most serious find was W-S2-008 (P0): the `parent.view_behaviour` permission was declared in the permission catalogue but had never been attached to the `parent` role — so every parent, on every tenant, was 403'd out of the entire behaviour parent portal. A DB grant was applied to all five tenants and the role seed updated to prevent regression. W-S2-004 surfaced a broader i18n gap — four standalone admin pages shipped in wb-119 (houses / leaderboard / policies / templates) referenced translation namespaces that were never added, so every label rendered as a raw dotted key; en and ar were both backfilled. W-S2-009 (a P1 follow-on surfaced during the W-S2-008 verify) exposed another shape mismatch in the parent portal — summary envelope, field names, and a sanctions `{upcoming, recent}` vs array shape. All of these were fixed and deployed in two commits (`71cc47e1` + `c2131057`) and verified end-to-end on production, including Zainab Ali now seeing Adam Moore's "Positive 0 · Negative 1 · Net -1" summary (the BH-000001 lateness incident from S1). Only W-S2-007 (P2) is deferred — it requires a new staff-search endpoint + matching autocomplete + incident-multi-select widget, which is larger than a bug-fix and belongs in a dedicated interventions UX pass. Document detail pages and behaviour-intervention detail pages could not be exercised because NHQS has 0 active document templates (S3 scope) and 0 behaviour interventions (creation blocked by W-S2-007), and the `/parent-portal/appeals|recognition|documents` subpages and the deeper `ParentIncidentView` / `ParentSanctionView` field alignment were handed off to S8 (cross-cutting parent role boundaries). Regression: 1543 behaviour unit tests still pass. Architecture unchanged — no new BullMQ jobs, no state-machine changes; the only structural change is backend response-shape alignments on two existing endpoints, which remain backwards-compatible. Carry-forwards: (a) S8 should verify the parent dashboard's other 403s (`/parent/homework/*`, `/parent/engagement/*`, `/diary/:id/parent-notes`) — those surfaced during this session but are out of scope; (b) the rank + signed-points regression confirmed the W-S1-004 polarity fix is producing correct house totals (Aqila -23, Furqan -5 — net-negative tenant because the seed has 33 negatives vs 17 positives); (c) S3 should keep an eye on the behaviour_document_templates gap when walking `/behaviour/templates`.

### Issues found

### W-S2-001 — Recognition "Pending Approvals" tab fires 400 "Validation failed" — wrong enum value

- **Severity:** P1
- **Route:** `/en/behaviour/recognition?tab=pending`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/recognition`
  2. Click the "Pending Approvals" tab
  3. Observe toast: "Validation failed"
  4. Open console — `GET /api/v1/behaviour/recognition?status=pending_approval&pageSize=50` returns 400
- **Expected:** Tab renders pending-approval queue (or a clean empty state without an error toast when nothing is pending).
- **Actual:** Backend Zod schema `recognitionListQuerySchema` enum is `['published', 'pending', 'all']` (see `packages/shared/src/behaviour/schemas/recognition.schema.ts:94`). Frontend `PendingApprovalsTab` sends `status=pending_approval` (see `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:584`). Backend service handles `status === 'pending'` (see `apps/api/src/modules/behaviour/behaviour-recognition.service.ts:71`). Tab throws a "Validation failed" toast every time it opens, which also means pending approvals can't be listed, approved, or rejected — breaking the entire approval workflow end-to-end for staff.
- **Evidence:** Console error + red toast in Playwright snapshot.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-003 — Leaderboard crashes with React #31 (both embedded tab and standalone page) + missing i18n namespace + wrong query param + empty student names

- **Severity:** P0
- **Route:** `/en/behaviour/leaderboard` and `/en/behaviour/recognition?tab=leaderboard`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/leaderboard` — full-page "Something went wrong" error boundary
  2. Navigate to `/en/behaviour/recognition` and click Leaderboard tab — same error boundary replaces the page
- **Expected:** Leaderboard table + podium, with student names, year-group labels, and signed points totals reflecting the W-S1-004 polarity fix.
- **Actual:** The `BehaviourPointsService.getLeaderboard` response shape (`apps/api/src/modules/behaviour/behaviour-points.service.ts:33-41`) returns rows with `first_name`, `last_name`, `year_group: { id, name } | null`, and `house: { id, name, color } | null`. Both frontend consumers expect a flat `student_name: string` and `year_group: string | null` (see `apps/web/src/app/[locale]/(school)/behaviour/leaderboard/page.tsx:14-20` and `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:47-53`). Three concrete failures:
  - React error #31 `Objects are not valid as a React child (found: object with keys {id, name})` — triggered by the `{entry.year_group ?? '—'}` JSX on both pages when the student has a year-group object. Crashes the whole page, not just one row.
  - `entry.student_name` is `undefined` — if it weren't for the #31 crash, every name cell would render blank.
  - Standalone `/behaviour/leaderboard` also throws `MISSING_MESSAGE: behaviour.leaderboard (en)` — the entire i18n namespace for that page isn't in `apps/web/messages/en.json` (nor `ar.json`). This fires before render and also causes the error boundary to engage.
  - Query-param mismatch: FE sends `period=week|month|term|year`, backend schema is `scope=year|period|all_time`. Zod strips unknown keys so the API silently defaults to `scope=year` no matter which tab the user selects — so even once the render bug is fixed, the week/month/term filters would be broken.
  - The backend also returns `house` info that the FE leaderboard doesn't render at all — a smaller gap, but worth noting while the shape is being aligned.
- **Evidence:** Console: `Minified React error #31 … object with keys {id, name}`. Full error boundary in both places.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-002 — Recognition "Houses" tab fires 404 → "No house teams configured yet" despite 4 houses seeded

- **Severity:** P1
- **Route:** `/en/behaviour/recognition?tab=houses`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/recognition`
  2. Click the "Houses" tab
  3. Observe empty state: "No house teams configured yet"
  4. Open console — `GET /api/v1/behaviour/houses/standings` returns 404
- **Expected:** Four house standings rendered as cards (Aqila, Furqan, Hikma, Siraj) with S0-seeded member counts and points totals.
- **Actual:** API endpoint does not exist — the real route registered on `BehaviourRecognitionController` is `/api/v1/behaviour/recognition/houses` (see `apps/api/src/modules/behaviour/behaviour-recognition.controller.ts:106`). Frontend `HousesTab` on the Recognition page hits `/api/v1/behaviour/houses/standings` (see `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:495`). Every visit to the tab produces a silent 404 caught by the `.catch` — console-only, no user toast — so the empty state is misleading (implying "no houses exist" rather than "the request failed"). Silent-failure classification: the frontend swallows the 404 and falls through to empty state, which is a soft lie to the user.
- **Evidence:** Console 404 trace + rendered empty-state.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-006 — `/behaviour/interventions/new` student search ignores query term — returns alphabetical first page

- **Severity:** P1
- **Route:** `/en/behaviour/interventions/new`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/interventions/new`
  2. In the Student search box type `Felix`
  3. Observe dropdown: Charlotte Adams, Oscar Allen, Willow Allen, Owen Anderson, Elena Anderson, Peter Anderson, Ruby Anderson, Ciara Anderson, Test Applicant, Connor Bennett
- **Expected:** Dropdown filtered to students whose first or last name matches "Felix" (Felix Doherty exists in seeded data).
- **Actual:** FE calls `GET /api/v1/behaviour/students?search=Felix&pageSize=10`. Backend controller `BehaviourStudentsController.listStudents` validates the query against `paginationQuerySchema` (page/pageSize/sort/order only) — the `search` key is silently dropped by Zod. Service `BehaviourStudentsService.listStudents` (`apps/api/src/modules/behaviour/behaviour-students.service.ts:42`) takes only page/pageSize and orders by `last_name asc`. Result: every search query returns the same first-10 alphabetical list. This mirrors the pattern behind W-S2-003 (FE `period` vs schema `scope`): Zod's default strip mode eats unknown keys, turning type-layer mismatch into a silent wrong-data bug. The UX implication is larger here — for 207 students you can never find the one you want unless they happen to start with A-B. Compounded by the FE's `searchSearch.length < 2` gate, so a 2-character query still returns the wrong data.
- **Evidence:** Page snapshot with query "Felix" but results showing 10 alphabetically-earliest students.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-007 — `/behaviour/interventions/new` requires UUID paste for staff fields + no incident linking UI

- **Severity:** P2
- **Route:** `/en/behaviour/interventions/new`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/interventions/new`
  2. Observe "Responsible Staff (UUID)" under each Strategy row (placeholder: "Staff member UUID") and "Assigned To" at the bottom (placeholder: "Staff member UUID (defaults to current user)")
  3. Note the absence of any control for linking source incidents despite `createInterventionSchema.incident_ids` existing in the API
- **Expected:** Name-based autocomplete for staff selection (mirroring the Student search). Multi-select for linked incidents (the blueprint explicitly asks to create an intervention linked to a fighting incident).
- **Actual:** FE asks the user to paste raw UUIDs into text boxes — essentially unreachable without DB access. `createInterventionSchema` (`packages/shared/src/behaviour/schemas/intervention.schema.ts:59-73`) declares `incident_ids: z.array(z.string().uuid()).optional()` but the form has no corresponding widget. Staff UUID fields are required by the schema (`responsible_staff_id: z.string().uuid()`, `assigned_to_id: z.string().uuid()`), so without UI support the entire create flow is inaccessible to end users.
- **Evidence:** Snapshot of the form showing the UUID placeholders.
- **Deferred:** P2 UX gap. The fix is not a one-line tweak — it requires a staff-search endpoint (there is no `/v1/staff?search=` analogue to the now-fixed `/v1/behaviour/students?search=`) plus a matching autocomplete component and a multi-select for `incident_ids`. This is substantial new work beyond the scope of the S2 bug-fix pass, and is better paired with the broader interventions UX review. The backend-side students-search fix (W-S2-006) is a prerequisite that ships in this session, so the staff-search follow-up can reuse the pattern. Carry forward: flag in S9 consolidation for the ship-gate review; re-triage as a polish item or a proper story as part of interventions UX work.

### W-S2-009 — Parent behaviour-portal summary FE/BE field-name mismatch (found during W-S2-008 verify)

- **Severity:** P1
- **Route:** `/en/behaviour/parent-portal`
- **Role:** parent@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. After granting `parent.view_behaviour` (W-S2-008 fix), re-load `/en/behaviour/parent-portal`
  2. API returns 200 with a `{ data: [...] }` body, but the page still shows "No children linked to your account"
- **Expected:** Parent sees their linked child (Adam Moore for Zainab Ali) with counts and points.
- **Actual:** FE destructures `res.children` but backend returns `res.data`. FE field names also differ: `total_points` / `positive_count` / `negative_count` / `year_group` vs backend `points_total` / `positive_count_7d` / `negative_count_7d` (no year_group). A follow-on crash (`h.filter is not a function`) surfaced once data loaded: the sanctions endpoint returns `{ data: { upcoming, recent } }` but the FE was typing it as `{ data: [] }`. All three mismatches addressed: align FE types to backend response, accept either `{data}` or `{children}` envelope, flatten upcoming+recent into a single array. Surfaced only after W-S2-008 unblocked the API call.
- **Evidence:** Network log 200 on `/api/v1/parent/behaviour/summary`; UI empty state pre-fix, full render post-fix showing "Adam Moore · Positive 0 · Negative 1 · Net -1" (the BH-000001 lateness incident from S1).
- **Fix:** c2131057 — parent-portal FE/BE shape alignment (summary envelope + field names + sanctions upcoming/recent).
- **Verified:** 2026-04-21 — re-walked as Zainab Ali on production, passes.

**Carry-forward:** the incidents/sanctions `ParentIncidentView` / `ParentSanctionView` shapes still diverge from the FE's richer expectations (`requires_acknowledgement`, `acknowledged_at`, `status`, `notes` fields not returned by backend). The page renders cleanly with the fix above, but fields sourced from those missing keys are blank. Deeper parent-role work belongs in **S8** (cross-cutting role boundaries) where the parent-dashboard 403 sweep (`/api/v1/parent/homework/*`, `/api/v1/parent/engagement/*`, `/api/v1/diary/:id/parent-notes`) is already in scope.

### W-S2-008 — Parent role lacks `parent.view_behaviour` → entire parent behaviour portal returns 403

- **Severity:** P0
- **Route:** `/en/behaviour/parent-portal`, `/parent-portal/recognition`, `/parent-portal/documents`, `/parent-portal/appeals`
- **Role:** parent@nhqs.test (Zainab Ali, child: Adam Moore)
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as `parent@nhqs.test`
  2. Navigate to `/en/behaviour/parent-portal`
  3. Page displays "Couldn't load your summary right now" error panel; console shows 403 on `GET /api/v1/parent/behaviour/summary`
- **Expected:** Parent lands on behaviour summary showing points/incidents/sanctions for Adam Moore plus pending acknowledgements.
- **Actual:** `BehaviourParentController` gates every parent-facing endpoint with `@RequiresPermission('parent.view_behaviour')` (`apps/api/src/modules/behaviour/behaviour-parent.controller.ts:39, 45, 62, 73, 84, 95, 118, 127, 137, 151`). The permission exists in `packages/prisma/seed/permissions.ts:618` but is NOT included in the parent role's `default_permissions` in `packages/prisma/seed/system-roles.ts:444-458`. Database confirmation on NHQS: `parent` role has `parent.make_payments / parent.submit_inquiry / parent.view_announcements / parent.view_attendance / parent.view_grades / parent.view_invoices / parent.view_own_students / parent.view_timetable / parent.view_transcripts` — no `parent.view_behaviour`. Every parent who tries to view their child's behaviour data, points, sanctions, recognition, or documents gets a 403. Recognition-wall pending-consent approvals are also blocked (WB-C-25 flow depends on the same permission key). Additionally, `Post('appeal')` at line 103 requires `behaviour.appeal` which is also not in the parent seed — so parents cannot submit appeals either.
- **Evidence:** 403 on `/api/v1/parent/behaviour/summary` + "Couldn't load your summary right now" UI panel. DB query result shown above.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-005 — `/behaviour/recognition/new` 400s on student-options fetch → silent empty student dropdown

- **Severity:** P1
- **Route:** `/en/behaviour/recognition/new`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/recognition/new`
  2. Type any letter into the Student field
  3. No dropdown of matching students appears
- **Expected:** Typing a partial student name shows a filtered dropdown of matching active students so the reporter can pick one.
- **Actual:** Initial-load fetch `GET /api/v1/students?page=1&pageSize=500&status=active` returns 400 because the shared `paginationQuerySchema` caps pageSize at `MAX_PAGE_SIZE = 100` (see `packages/shared/src/constants/pagination.ts:2`). The fetch is wrapped in `.catch(() => ({ data: [] }))` (see `apps/web/src/app/[locale]/(school)/behaviour/recognition/new/page.tsx:80-82`) so the user sees no toast — just a perpetually empty autocomplete. End result: the manual award flow is unusable without a prefill `?student_id=…` URL. Silent failure: `.catch` hides the 400 completely; `apiClient` is also in `silent: true` mode so even global error handling is bypassed.
- **Evidence:** Console 400 + empty dropdown after typing.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S2-004 — Standalone `/behaviour/houses` renders raw i18n keys + missing `rank` + `id/house_id` shape mismatch

- **Severity:** P1
- **Route:** `/en/behaviour/houses`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/houses`
  2. Four cards render (Aqila / Furqan / Hikma / Siraj) with raw dotted keys in place of translated labels
- **Expected:** Title "Houses", description, "Points" label, and "N members" pill all translated. Rank number next to each house name. Signed points totals.
- **Actual:**
  - `behaviour.houses` namespace entirely absent from `apps/web/messages/en.json` (and `ar.json`) — page renders: `behaviour.houses.title`, `behaviour.houses.description`, `behaviour.houses.points`, `behaviour.houses.memberCount` as literal strings. Same gap exists for `behaviour.leaderboard`, `behaviour.policies`, `behaviour.templates` (added in commit `bbf089ad` wb-119 without the translations).
  - Rank renders as `#` with no number — FE expects `house.rank` but `BehaviourPointsService.getHouseStandings` (`apps/api/src/modules/behaviour/behaviour-points.service.ts:366-455`) does not compute or return a `rank` field.
  - FE expects `house.id` but API returns `house_id` — React key prop is `undefined` for every card (silent browser warning only, not visible).
  - Points totals currently -23 / -5 / -20 / -19 — signed arithmetic from W-S1-004 fix is working end-to-end.
- **Evidence:** Page snapshot showing raw keys + `#` without rank.
- **Fix:** 71cc47e1 — see commit body for the seven fixes bundled together.
- **Verified:** 2026-04-21 — re-walked on production, passes.

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
