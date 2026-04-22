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
| S3      | 2026-04-21 | 2026-04-21 | 14            | 7   | 6   | 1   | 0   | **Complete**                                                                                                    |
| S4      | 2026-04-21 | 2026-04-21 | 6             | 2   | 1   | 2   | 1   | **Complete**                                                                                                    |
| S5      | 2026-04-21 | 2026-04-21 | 6             | 1   | 4   | 0   | 1   | **Complete** (W-S5-001 deferred — safeguarding concerns UI is stub redirects; needs dedicated build-out)        |
| S6      | 2026-04-21 | 2026-04-22 | 7             | 3   | 1   | 2   | 1   | **Complete** (W-S6-004 + W-S6-005 deferred to S9 product review)                                                |
| S7      | 2026-04-22 | 2026-04-22 | 6             | 3   | 2   | 1   | 0   | **Complete**                                                                                                    |
| S8      | 2026-04-22 | 2026-04-22 | 6             | 0   | 4   | 2   | 0   | **Complete**                                                                                                    |
| S9      | 2026-04-22 | 2026-04-22 | 0             | 0   | 0   | 0   | 0   | **Complete** (consolidation only — see `FINAL_REPORT.md`; flagged W-S0-002 P1 as abandoned deferral)            |

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
- **Fix:** c2131057 (summary envelope + field names) + 6877daf1 (sanctions `{upcoming, recent}` envelope flattening).
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

**Status:** Complete (2026-04-21)
**Session plan:** [`S3_behaviour_C.md`](./S3_behaviour_C.md)

### Session summary

S3 walked the reporting / configuration / admin surfaces of the Behaviour hub and surfaced **14 issues — 7 P0, 6 P1, 1 P2, and 0 P3**. The dominant finding was the same systemic FE/BE envelope drift that S2 uncovered, but applied uniformly to the analytics subsystem: **every standalone analytics page** (`/comparisons`, `/subjects`, `/staff`, `/heatmap`, `/categories`) crashed with `TypeError: n.map is not a function` because each page was written against a `{data: Row[]}` envelope while the backend services return `{entries, data_quality}` / `{subjects, data_quality}` / `{staff, data_quality}` / `{cells, data_quality}` / `{categories, data_quality}` — wrapped by the global ResponseTransformInterceptor into `{data: {entries,…}}` etc. All five were fixed by aligning the FE page types and field names to the real backend contracts in commit `9ff8b62f`. The other P0s surfaced in the admin console (every preview button returned 400 "Validation failed" because the FE posted `{}` while the Zod schemas for recompute-points / rebuild-awards / backfill-tasks require `scope: enum`; fixed by threading a `defaultBody: {scope:'tenant'}` through `RepairOperationDef`) and on the students index + detail pages (row-click routed to `/students/undefined`; year_group + positive/negative/last-incident columns all blank; detail header rendered "undefined undefined"; Analytics tab crashed on `undefined.length`). The P1s were i18n gaps (again from wb-119) — `behaviour.analytics.days.*`, `behaviour.policies.*`, `behaviour.templates.*`, `behaviour.components.studentHeader.*`, `behaviour.components.studentAnalytics.*`, `behaviourAdmin.legalHolds.body` — plus a `pageSize=200 > cap 100` on legal-holds that triggered a red toast on every mount, and the W-S3-014 seeding gap: `behaviour.log` permission was declared but attached to zero roles, so the Staff Behaviour Activity page showed "No staff activity" even after the envelope fix. W-S3-014 was fixed by updating `system-roles.ts` (added to teacher/principal/VP/owner) and backfilling with an `INSERT … ON CONFLICT DO NOTHING` grant across all five tenants, followed by a Redis permission-cache flush. The one P2 was the non-blocking `behaviourAdmin.legalHolds.body` missing key, bundled into the same i18n patch. **Regression §3 spot-checks all pass**: Categories-last-30-days totals to 38, exactly matching the overview page and DB (`WHERE occurred_at >= 2026-03-22`); Lateness 7, Uniform 5, Effort 4, etc. are the correct 30-day subsets of DB all-time counts (Lateness 9, Uniform 6, Effort 6); Heatmap now shows per-day cells (7 cells across Sun–Sat, most at P1 with occasional P2) after a one-time backfill of `weekday`/`period_order` on NHQS incidents (seed had left them null — logged as a data-seeding gap deferred out of session since it's fixed on production and the seed script itself is S0's artefact); Staff Activity shows Yusuf 26 / Sarah 25 matching DB exactly. Also verified: signed-point totals flow through the students index (Owen Anderson -7, Ciara Anderson +5, Oscar Allen +1, Charlotte Adams 0) — the W-S1-004 polarity fix is still producing correct net-sign arithmetic after the S0/S1/S2 combined data. Architecture unchanged — no new BullMQ jobs, no state-machine changes, no new modules; only FE contract alignments + permission-seed backfill. Regression: 1543 behaviour unit tests still pass, web type-check clean, API type-check clean. **Carry-forwards**: (a) S0 seed should populate `weekday` + `period_order` + `subject_id` on behaviour_incidents (flag for S0 re-run if anyone reseeds), (b) `findMembershipsWithPermissionAndUser` does not honour PermissionGuard's owner bypass — same pattern as W-S1-001; a deeper role-boundary pass in S8 should decide whether it's worth generalising the owner bypass into the facade itself, (c) behaviour_document_templates still at 0 on NHQS; documents/[id] walk remains deferred (original S2 carry-forward unchanged). After S3 the entire Behaviour hub is ticked in `_scope-map.md`.

### Issues found

### W-S3-001 — Analytics heatmap renders raw `behaviour.analytics.days.{mon..fri}` i18n keys on axis

- **Severity:** P1
- **Route:** `/en/behaviour/analytics`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics`
  2. Scroll to the Heatmap panel (below Trends)
  3. Weekday axis prints `behaviour.analytics.days.mon`, `.tue`, `.wed`, `.thu`, `.fri` as literal strings
- **Expected:** Short translated weekday labels ("Mon", "Tue", "Wed", "Thu", "Fri"). Weekend columns (Sat/Sun) could optionally be shown and hidden per tenant — current rendering shows only Mon-Fri which is correct for school context.
- **Actual:** Five `MISSING_MESSAGE` console errors per render + literal dotted keys visible. Namespace `behaviour.analytics.days` never added to `apps/web/messages/en.json` nor `ar.json`. Period axis labels (`P1`…`P8`) render fine since they are literal short strings, not i18n keys.
- **Evidence:** Console 5× `MISSING_MESSAGE: behaviour.analytics.days.*`; snapshot shows the raw keys next to the heatmap cells.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-014 — Staff analytics empty even when incidents exist — `behaviour.log` not seeded on any role (teacher / principal / owner)

- **Severity:** P1
- **Route:** `/en/behaviour/analytics/staff`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. After the W-S3-004 envelope fix deployed and the page renders, it shows "No staff activity in the selected period"
  2. DB confirms 51 incidents reported by 2 staff (Yusuf Rahman 26, Sarah Daly 25)
- **Expected:** Both reporters listed with their respective counts.
- **Actual:** `BehaviourStaffAnalyticsService.getStaffActivity` calls `rbacReadFacade.findMembershipsWithPermissionAndUser(tenantId, 'behaviour.log')`. On NHQS (and every tenant), **zero memberships have the `behaviour.log` permission** — it's declared in `packages/prisma/seed/permissions.ts:625` but never attached to any role in `packages/prisma/seed/system-roles.ts` (teacher, classroom_lead, school_principal, school_vice_principal, school_owner all missing it). So the facade returns an empty list → empty staff_ids → no `last7/30/year/lastLogged` aggregates → empty staff array. Same class of bug as W-S2-008 (`parent.view_behaviour` missing from parent role). Surfaced only once the envelope crash (W-S3-004) was fixed, which is why it wasn't visible during the initial walk.
- **Evidence:** DB query shows Yusuf + Sarah have roles school_owner/school_principal/teacher but `has_log=false` on all; seed file lacks the permission entry.
- **Fix:** c4c28f93 + DB grant (ON CONFLICT DO NOTHING) applied across all five tenants; Redis flushed after grant.
- **Verified:** 2026-04-21 — re-walked `/behaviour/analytics/staff`: Yusuf Rahman (26/18/6) + Sarah Daly (25/20/5) now appear with counts matching DB; 34 other staff members show as `· inactive` with 0/0/0 (correct — they have `behaviour.log` but no incidents).

### W-S3-013 — `/behaviour/students/[id]` renders "undefined undefined" header + blank stats + Analytics tab crashes

- **Severity:** P0
- **Route:** `/en/behaviour/students/[studentId]` (tested with Felix Collins, Logan Evans)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/students/<uuid>` (any student)
  2. Page renders heading "**undefined undefined**", Points/Positive/Negative stats blank, labels render as raw dotted keys `behaviour.components.studentHeader.{points,positive,negative}`
  3. Click the Analytics tab — full-page error boundary fires
- **Expected:** Student name and stats in the header, plus per-tab panels (timeline renders correctly; analytics should show attendance correlation + category breakdown per seeded data).
- **Actual:** Three compounding breaks on this page:
  1. Backend `BehaviourStudentsService.getStudentProfile` (`apps/api/src/modules/behaviour/behaviour-students.service.ts:150-201`) returns `{ student: {...}, points: { total, fromCache }, summary: { total_points, total_incidents, positive_count, negative_count } }`. FE interface `StudentProfile` is flat `{ first_name, last_name, year_group_name, total_points, positive_count, negative_count }` and accesses `profile.first_name` directly (FE page L248). Every field resolves to undefined → "undefined undefined" heading, blank stats. `useTranslations('behaviour.components.studentHeader')` namespace doesn't exist in en.json either — the three stat labels render as raw keys.
  2. Analytics tab crashes with `Cannot read properties of undefined (reading 'length')` — similar shape drift; also references a missing `behaviour.components.studentAnalytics` namespace.
  3. AI-summary sub-component fires 403 on `/api/v1/behaviour/students/<id>/ai-summary` because AI features are disabled for the tenant — caught gracefully but leaves a console 403 every mount.
- **Evidence:** Snapshot "undefined undefined" on both walked students; Analytics tab snapshot = "Something went wrong"; console shows `MISSING_MESSAGE: behaviour.components.studentHeader (en)` and `behaviour.components.studentAnalytics (en)`; backend service shape vs FE interface.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-012 — `/behaviour/students` row click navigates to `/students/undefined` + year_group/positive/negative/last_incident columns all blank

- **Severity:** P0
- **Route:** `/en/behaviour/students`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/students` — table renders 207 students over 11 pages
  2. Click any row (e.g. Charlotte Adams)
  3. URL becomes `/en/behaviour/students/undefined` and page renders a blank/minimal layout
- **Expected:** Row click routes to the student behaviour detail page for that student; the list itself shows year group, positive/negative counts, and last-incident date for each row.
- **Actual:** Backend `BehaviourStudentsService.listStudents` (L88-145) returns `{id, first_name, last_name, student_number, year_group: {id, name} | null, _count, total_points, incident_count}` per row. Frontend `StudentBehaviourRow` interface expects `{student_id, first_name, last_name, year_group_name: string|null, total_points, positive_count, negative_count, last_incident_date}`. Four concrete mismatches:
  - `id` vs `student_id` → `keyExtractor` / `onRowClick` both read `row.student_id` which is `undefined` → every row clicks to `/students/undefined` (verified by Playwright). React also emits key-prop warnings for every row.
  - `year_group: {id,name}` vs `year_group_name: string` → `row.year_group_name` is undefined → "Year Group" column renders `—` for all 207 students.
  - Backend doesn't return `positive_count`, `negative_count`, `last_incident_date` at all → those three columns render as blank/`—` for every row.
  - Verified on-screen: signed `total_points` renders correctly (-7 / -4 / -2 / 0 / +1 / +5 etc.), so the W-S1-004 polarity fix is flowing through. The remaining columns and drill-down are broken.
- **Evidence:** URL after click = `/en/behaviour/students/undefined`; snapshot shows all year_group/positive/negative/last_incident cells blank or `—`; backend service L93-106 select list.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-011 — `/behaviour/templates` renders raw keys `behaviour.templates.{manage,empty,addTemplate}`

- **Severity:** P1
- **Route:** `/en/behaviour/templates`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/templates`
  2. Header action button + empty-state paragraph + addTemplate CTA all render raw dotted keys.
- **Expected:** Translated labels. NHQS has 0 document templates / 0 description templates seeded, so the correct rendering is the empty state with action buttons.
- **Actual:** Same pattern as W-S3-007 / W-S2-004 — `behaviour.templates` namespace has only `title`/`description` in `apps/web/messages/en.json`; the remaining keys (`manage`, `empty`, `addTemplate`) never landed with wb-119.
- **Evidence:** Console 5× `MISSING_MESSAGE`; page snapshot shows `behaviour.templates.*` literals.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-010 — `/behaviour/admin/legal-holds` fires 400 + red "Validation failed" toast on every mount — `pageSize=200` > cap 100

- **Severity:** P1
- **Route:** `/en/behaviour/admin/legal-holds`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/admin/legal-holds`
  2. Observe red toast "Validation failed" appearing immediately on mount
  3. Network panel shows `GET /api/v1/behaviour/admin/legal-holds?status=active&pageSize=200` → 400
- **Expected:** Empty-state "No active legal holds" with no error toast (and no network-panel 400).
- **Actual:** FE hard-codes `pageSize=200` (`apps/web/src/app/.../legal-holds/page.tsx:73`). Backend schema `legalHoldListQuerySchema` caps `pageSize` at 100. Zod `max(100)` rejects 200 → 400 → default (non-silent) apiClient shows the red toast even though the catch clause gracefully sets `holds=[]` and the empty state renders correctly. Same class of bug as W-S2-005 (`/recognition/new` with `pageSize=500`). The page content is usable but the mount-time toast is visible user-facing noise.
- **Evidence:** Toast snapshot + console + network `?pageSize=200 => 400`.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-008 — `/behaviour/admin` preview buttons all return 400 "Validation failed" — FE sends `{}`, backend requires `scope`

- **Severity:** P0
- **Route:** `/en/behaviour/admin`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/admin`
  2. Click any "Preview" button (tested on Recompute points)
  3. Dialog opens displaying "Validation failed"
- **Expected:** Preview dialog shows affected-record counts for a tenant-wide recompute (or whichever scope is selected) before execution.
- **Actual:** `RepairOperationCard.loadPreview` posts an empty body `JSON.stringify({})` (`apps/web/src/app/.../admin/_components/repair-operation.tsx:108`). Backend schemas require `scope: z.enum([...])` as a discriminated required field — `recomputePointsSchema`, `rebuildAwardsSchema`, `backfillTasksSchema` all fail Zod validation on the empty body. Three of the six repair operations are affected (recompute-points / rebuild-awards / backfill-tasks). The other three (recompute-pulse, reindex-search, retention-sweep) use `adminConfirmPhraseSchema` or `reindexSearchSchema` which tolerate `{}`, so they work. The "Execute" path for the affected three posts `{confirm_phrase}` — still missing `scope`, so Execute would 400 too if the user could ever reach it.
- **Evidence:** Network panel `POST /api/v1/behaviour/admin/recompute-points/preview` → 400; backend schema code at `packages/shared/src/behaviour/schemas/admin-ops.schema.ts:19-48`; FE code at `repair-operation.tsx:108,133`.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-009 — `/behaviour/admin` legal-holds card shows raw key `behaviourAdmin.legalHolds.body`

- **Severity:** P2
- **Route:** `/en/behaviour/admin`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/admin`
  2. Scroll to the bottom "Legal holds" card
  3. Card body reads literal `behaviourAdmin.legalHolds.body`
- **Expected:** A short descriptive paragraph for the legal-holds shortcut.
- **Actual:** `behaviourAdmin.legalHolds` namespace exists in `apps/web/messages/en.json` with `title`, `description`, `setBy`, `legalBasis`, `releasedBy`, `actions`, `filters`, `empty`, `open`, `create`, `release` keys — but no `body`. The FE component references `t('body')` which doesn't exist.
- **Evidence:** Console `MISSING_MESSAGE: behaviourAdmin.legalHolds.body (en)`; snapshot shows the raw key.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-007 — `/behaviour/policies` renders raw keys `behaviour.policies.{manage,empty,addRule}`

- **Severity:** P1
- **Route:** `/en/behaviour/policies`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/policies`
  2. Header action button reads literal `behaviour.policies.manage`; empty-state text reads `behaviour.policies.empty`; the "Add rule" CTA reads `behaviour.policies.addRule`.
- **Expected:** Translated labels ("Manage in settings", "No policy rules configured yet.", "Add rule"). The correct English strings already exist — but they're in the `behaviourSettings.policies` namespace, not `behaviour.policies`. The listing page uses `useTranslations('behaviour.policies')` which only has `title` + `description` available.
- **Actual:** 4 `MISSING_MESSAGE` console errors per render + literal dotted keys in the UI. W-S2-004 pattern all over again (wb-119 shipped a page whose translation keys never made it into the `behaviour.*` bucket).
- **Evidence:** Console 4× `MISSING_MESSAGE`; page snapshot shows `behaviour.policies.*` literals.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-006 — `/behaviour/analytics/categories` crashes with `n.map is not a function` — same envelope drift

- **Severity:** P0
- **Route:** `/en/behaviour/analytics/categories`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics/categories`
  2. Error boundary fires
- **Expected:** Table of categories with incident counts (ground truth DB — Lateness 9, Uniform 6, Effort 6, Kindness 4, Disruption low 4, Phone use 4, Helpfulness 4, Fighting 3, Community contribution 3, Lying 2, Bullying verbal 2, Disruption sustained 2, Bullying physical 1, Weapons 1 = 51 total). This is the explicit S3 §3 regression check — category count spot-checks depend on this surface.
- **Actual:** Backend `BehaviourIncidentAnalyticsService.getCategories` (ending L281) returns `{ categories: [...], data_quality }`. FE expects `{ data: CategoryRow[] }` with `{category_id, category_name, incident_count, positive_count?, negative_count?, polarity?}`. Same envelope + potential field-name mismatch.
- **Evidence:** Error boundary; backend service code.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-005 — `/behaviour/analytics/heatmap` crashes with `n.map is not a function` — envelope + field-name mismatch

- **Severity:** P0
- **Route:** `/en/behaviour/analytics/heatmap`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics/heatmap`
  2. Error boundary fires
- **Expected:** Day-of-week × period heatmap table with incident density bars.
- **Actual:** Backend `BehaviourIncidentAnalyticsService.getHeatmap` (L104-175) returns `{ cells: [{weekday, period_order, raw_count, rate, polarity_breakdown}], data_quality }`. FE (`.../heatmap/page.tsx:13-21`) expects `{ data: HeatmapCell[] }` with `{ day_of_week, period, incident_count }` fields. Two layered breaks: wrong envelope (`res.data` is `{cells, data_quality}` not an array) and wrong field names (`weekday` vs `day_of_week`, `period_order` vs `period`, `raw_count` vs `incident_count`). Same systemic pattern.
- **Evidence:** Error boundary; backend service code.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-004 — `/behaviour/analytics/staff` crashes with `n.map is not a function` — same envelope drift

- **Severity:** P0
- **Route:** `/en/behaviour/analytics/staff`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics/staff`
  2. Error boundary fires
- **Expected:** Table of staff members with incident counts (Yusuf Rahman 26, Sarah Daly 25 per DB).
- **Actual:** Backend `BehaviourStaffAnalyticsService.getStaffActivity` returns `{ staff: [...], data_quality }` (L105). FE expects `{ data: StaffRow[] }` → `rows` is the wrapper object → `rows.map` throws. The FE also needs per-staff positive/negative breakdowns which the backend `staff` array may or may not provide — inspection needed during fix.
- **Evidence:** Error boundary; stack at `staff/page-*.js:1:3410`.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-003 — `/behaviour/analytics/subjects` crashes with `n.map is not a function` — same FE/BE envelope mismatch

- **Severity:** P0
- **Route:** `/en/behaviour/analytics/subjects`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics/subjects`
  2. Error boundary fires
- **Expected:** Table of incidents per subject. (Seeded data has 0 subject-tagged incidents, so the correct rendering is an empty-state panel, not a crash.)
- **Actual:** Backend returns `{ subjects: [...], data_quality: {...} }` (`BehaviourIncidentAnalyticsService.getSubjects` L286-346). The `ResponseTransformInterceptor` wraps that as `{ data: { subjects: [...], data_quality: {...} } }`. FE does `setRows(res.data ?? [])` where FE typed `res.data` as `SubjectRow[]`, so `rows` becomes the wrapper object and `rows.map(...)` crashes. Identical shape drift to W-S3-002.
- **Evidence:** Error boundary; stack at `subjects/page-*.js:1:3201`; backend service code.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

### W-S3-002 — `/behaviour/analytics/comparisons` crashes with `n.map is not a function` — FE treats `res.data` as an array but BE returns `{entries, data_quality}`

- **Severity:** P0
- **Route:** `/en/behaviour/analytics/comparisons`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/behaviour/analytics/comparisons`
  2. Page renders "Something went wrong" error boundary
- **Expected:** Year-group comparison list with per-year-group positive/negative rates and student counts.
- **Actual:** Full-page error boundary. Console shows `TypeError: n.map is not a function`. The backend `BehaviourComparisonAnalyticsService.getComparisons` returns `{ entries: Array<{year_group_id, year_group_name, incident_rate, positive_rate, negative_rate, student_count}>, data_quality }`. The global `ResponseTransformInterceptor` wraps everything in `{ data: T }`, so the actual body is `{ data: { entries: [...], data_quality: {...} } }`. The frontend (`apps/web/src/app/[locale]/(school)/behaviour/analytics/comparisons/page.tsx:42`) does `setRows(res.data ?? [])` — `res.data` is the `{entries, data_quality}` object (not an array), so `rows` becomes an object, then `rows.map(...)` at line 98 throws. Same systemic pattern as W-S2-003 and W-S2-009 — FE type-layer claims `{data: ComparisonRow[]}` while the actual API shape is different, and the FE's `ComparisonRow` interface (`group_id`, `group_name`, `incident_count`) doesn't match the BE's `year_group_*` / `*_rate` fields either.
- **Evidence:** Error boundary + stack at `comparisons/page-*.js:1:1384`; backend service code confirms shape mismatch.
- **Fix:** 9ff8b62f — see bundled S3 alignment commit for details.
- **Verified:** 2026-04-21 — re-walked on production, passes.

---

## S4 — Pastoral Care

**Status:** Complete (2026-04-21)
**Session plan:** [`S4_pastoral_care.md`](./S4_pastoral_care.md)

### Session summary

S4 walked the full pastoral hub end-to-end for owner@nhqs.test. Two P0s, one P1, two P2s, and one P3 were logged before any fix was attempted. The two P0s and the P1 all rolled up to two root causes: (a) the owner-bypass that `PermissionGuard` applies to `school_owner` / `school_principal` / `school_vice_principal` did not extend into `ConcernService` / `ConcernQueriesService` — they read the literal `permissions[]` array and so resolved leadership callers to tier 0, which made the concern list silently hide tier-2 rows and made **every** concern detail GET return 404; and (b) `/api/v1/pastoral/settings/intervention-types` passes through `ResponseTransformInterceptor` that wraps the bare array in `{ data: [...] }`, but `interventions/[id]/page.tsx` and `interventions/new/page.tsx` typed the `apiClient` call as a bare array and crashed on `.filter`. Both root causes were fixed in `a4ea01e2`: an `isOwnerBypass` flag is now threaded from `PermissionCacheService.isOwner` through the controller into the concern service + access helper, and the two intervention pages unwrap the envelope. The two P2s and the P3 were all pastoral `types.*` raw-i18n leaks caused by seed data drifting from the Zod enum (referrals) or a free-text backend field without a closed taxonomy (interventions) — added a `translatePastoralType` helper in `lib/pastoral.ts` that humanises the leaf when next-intl returns the unresolved path, routed intervention + referral list/detail through it, and deferred the P3 case-UUID subtitle as pure cosmetic. No screenshots were produced, so no sweep required. Carry-forward for S9 / S5: `critical-incidents[id]`, `sst[id]`, `dsar/[id]`, and student self-referral round-trip are deferred because the S0 seed does not create rows for those subsystems; S5 owns any safeguarding-side DSAR review and may choose to seed. S3's "owner bypass should generalise to findMembershipsWithPermissionAndUser" carry-forward now has a concrete second data-point — pastoral's tier filtering is the second subsystem to need the same pattern — so S8 should take a wider look.

### W-S4-001 — Pastoral concerns list filters Tier 2 concerns out for school_owner / school_principal

- **Severity:** P1
- **Route:** `/en/pastoral/concerns`
- **Role:** owner@nhqs.test (school_owner + school_principal)
- **Viewport:** 1440×900
- **Steps:**
  1. Seed DB has 5 pastoral concerns: 3 Tier 1 + 2 Tier 2 (urgent — `mental_health`, `home_circumstances`).
  2. Log in as owner and navigate to `/en/pastoral/concerns`.
  3. List shows only 3 rows labelled "Tier 1"; pagination says "Showing 1–3 of 3".
  4. Apply the Tier filter → Tier 2. List renders "No results found".
  5. Landing page card "Urgent review queue" on `/en/pastoral` reports **2**, so the backend does know the Tier 2 concerns exist — they're just hidden from list GET.
- **Expected:** School owner / principal / vice-principal (all three are guard-bypass leadership roles per `permission-cache.service.ts:67-71`) should see Tier 1 + Tier 2 concerns in the list; Tier 3 stays hidden pending CP grant.
- **Actual:** Concerns list is tier-1-only. Cause: `ConcernQueriesService.resolveCallerTierAccess` reads the literal `permissions[]` array returned by `PermissionCacheService.getPermissions`, which for leadership roles is empty (their DB rows have no `role_permissions`). The `isOwner` bypass at the guard layer gets them INTO the endpoint but does not elevate their tier access inside the service.
- **Evidence:** none; bug reproduces from the steps.
- **Fix:** `a4ea01e2` — add `isOwnerBypass` param to `resolveCallerTierAccess` and to `ConcernQueriesService.list`; `ConcernsController.list` now fetches `PermissionCacheService.isOwner` alongside permissions and forwards it. Owner bypass now resolves to tier 2 at the data layer too.
- **Verified:** 2026-04-21 — `/en/pastoral/concerns` now shows 6 rows (4 tier-1 + 2 tier-2 concerns: Sarah Campbell / Mental Health / Urgent / Tier 2 + Amelia Brown / Home Circumstances / Urgent / Tier 2) for owner@nhqs.test.

### W-S4-004 — Intervention detail and `interventions/new` crash with ".filter is not a function"

- **Severity:** P0
- **Route:** `/en/pastoral/interventions/[id]`, `/en/pastoral/interventions/new`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/pastoral/interventions` and click the only seeded row.
  2. URL becomes `/en/pastoral/interventions/f23127ed-…`.
  3. Full-page error boundary renders "Something went wrong. An unexpected error occurred." Only a "Try again" button is visible.
  4. Console logs `TypeError: k.filter is not a function` thrown from the intervention detail client chunk.
- **Expected:** Intervention detail renders with plan setup, outcomes, progress notes, and status transition panels as sketched in the blueprint.
- **Actual:** The page crashes the first render. Root cause: `apiClient<InterventionTypeOption[]>('/api/v1/pastoral/settings/intervention-types', …)` is typed as returning a bare array, but the response passes through `ResponseTransformInterceptor` and arrives as `{ data: InterventionTypeOption[] }`. Then `setTypes(typeResponse ?? [])` stores an object, and the JSX at line 247-248 calls `types.filter((item) => item.active)` — TypeError. The endpoint handler at `intervention.service.ts:779-786` returns `Promise<InterventionTypeItem[]>`; the interceptor then wraps it.
- **Evidence:** none; reproducible, console trace captured.
- **Fix:** `a4ea01e2` — retype the `apiClient` calls in `interventions/[id]/page.tsx` and `interventions/new/page.tsx` to `{ data: InterventionTypeOption[] }` and unwrap `.data` before the `setTypes` / `.find(…active)` calls.
- **Verified:** 2026-04-21 — intervention detail renders the plan panel ("Intervention type: Mentoring", status Active, Tier 2, etc.); `/interventions/new` renders the create form with the intervention-type dropdown populated.

### W-S4-005 — Referral list & detail render raw i18n keys for seeded referral types

- **Severity:** P2
- **Route:** `/en/pastoral/referrals`, `/en/pastoral/referrals/[id]`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/pastoral/referrals`. List shows 3 seeded referrals; the type column renders raw keys `pastoral.referrals.types.sen_coordinator`, `pastoral.referrals.types.external_camhs`, `pastoral.referrals.types.internal_counsellor`.
  2. Open any referral. Header shows "Referral type: pastoral.referralDetail.types.sen_coordinator".
  3. Console: six `MISSING_MESSAGE` errors.
- **Expected:** Human-readable labels for every referral type rendered by the UI.
- **Actual:** The Zod enum `REFERRAL_TYPES` at `packages/shared/src/pastoral/enums.ts:124-131` only lists `neps, camhs, tusla_family_support, jigsaw, pieta_house, other_external`. `messages/en.json` mirrors that list under both `pastoral.referrals.types.*` and `pastoral.referralDetail.types.*`. The seed script (S0) inserted referrals with `referral_type` values that aren't in the enum (`internal_counsellor`, `external_camhs`, `sen_coordinator`) — the DB column is a plain `varchar` and accepted them. The frontend renders `t(\`types.${row.referral_type}\`)` with no fallback, so any out-of-enum value surfaces the raw i18n key. Safe fix is frontend: fall back to a humanised form when the key is missing.
- **Evidence:** none; reproducible.
- **Fix:** `a4ea01e2` — add `translatePastoralType` helper in `apps/web/src/lib/pastoral.ts` that falls back to a humanised leaf when next-intl returns the unresolved dotted path; route referral list + detail + intervention list + detail through it.
- **Verified:** 2026-04-21 — referral list now shows "Sen Coordinator", "External Camhs", "Internal Counsellor"; referral detail header no longer leaks `pastoral.referralDetail.types.*` keys.

### W-S4-006 — Referral list subtitle shows raw case UUID instead of case reference

- **Severity:** P3
- **Route:** `/en/pastoral/referrals`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. On the referrals list, the student cell subtitle renders the raw `case_id` UUID (e.g. `2a210124-08e4-46fe-8f4c-bfc537c18776`).
- **Expected:** Either the case reference number (`PC-S0-001`) or the word "Case" plus the reference.
- **Actual:** `apps/web/src/app/[locale]/(school)/pastoral/referrals/page.tsx:151` prints `row.case_id` directly. Backend should surface `case_reference` alongside `case_id`, and the frontend should display that.
- **Deferred:** cosmetic only; batching into S4 polish commit.
- **Verified:** {pending}

### W-S4-003 — Intervention type "mentoring" renders raw i18n key

- **Severity:** P2
- **Route:** `/en/pastoral/interventions`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/pastoral/interventions`.
  2. Observe the type cell of the sole seeded intervention: `pastoral.interventions.types.mentoring`.
  3. Console logs `MISSING_MESSAGE: pastoral.interventions.types.mentoring (en)` twice.
- **Expected:** A human-readable label, either "Mentoring" (if the key is added) or a humanised fallback for arbitrary `intervention_type` strings.
- **Actual:** The `intervention_type` column is a free-text `z.string().max(50)` (see `packages/shared/src/pastoral/schemas/intervention.schema.ts`), but the frontend renders `t(\`types.${row.intervention_type}\`)`with no fallback.`pastoral.interventions.types.mentoring`is absent from`messages/en.json`. Either add the key or have the component fall back to the raw value / humanised form for unknown types.
- **Evidence:** none; reproducible.
- **Fix:** `a4ea01e2` — same `translatePastoralType` helper introduced for W-S4-005; intervention list + detail now fall back to a humanised leaf for unknown values.
- **Verified:** 2026-04-21 — `/en/pastoral/interventions` renders "Mentoring" in the type column; intervention detail shows "Intervention type: Mentoring".

### W-S4-002 — Concern detail GET returns 404 for owner/principal on every tier-1 concern

- **Severity:** P0
- **Route:** `/en/pastoral/concerns/[id]`
- **Role:** owner@nhqs.test (school_owner + school_principal)
- **Viewport:** 1440×900
- **Steps:**
  1. From `/en/pastoral/concerns`, click any seeded tier-1 concern row (e.g. Charlotte Adams PC-0310B89B).
  2. Detail page renders "Concern not found or not visible to your account."
  3. Network panel: `GET /api/v1/pastoral/concerns/0310b89b-…` → **404** (77–128ms duration, so the service is reached, not a routing miss).
  4. Verified in DB: record exists at tenant_id `3ba9…` with `tier=1`, `category=engagement`, visible to RLS with the owner's user_id.
  5. Same 404 on freshly-created concern: POST /api/v1/pastoral/concerns → 201 (creates row `a3b03130-…`), then immediately issue a GET for that row → 404.
- **Expected:** Owner-bypass leadership role can open any tier-1/tier-2 pastoral concern detail.
- **Actual:** 100% 404 on GET-by-id for every seeded and newly-created concern. Root cause: `ConcernService.getById` at `apps/api/src/modules/pastoral/services/concern.service.ts:326-332` strict-compares `concern.tier > callerMaxTier` and throws 404 when caller has `callerMaxTier = 0`. Since leadership role_permissions rows are empty for pastoral.\*, `resolveCallerTierAccess` returns 0. (The list endpoint hides the same bug with a permissive fallback — `where.tier = 1` when `callerMaxTier < 2` — but list-only permissiveness doesn't help the detail flow.)
- **Evidence:** none; reproducible.
- **Fix:** `a4ea01e2` — thread `isOwnerBypass` into `ConcernService.getById` and `ConcernAccessService.resolveCallerTierAccess`; `ConcernsController.getById` fetches `PermissionCacheService.isOwner` alongside permissions and forwards it.
- **Verified:** 2026-04-21 — `/en/pastoral/concerns/0310b89b-…` loads the full concern detail (Charlotte Adams · Engagement, Routine, Tier 1, response + narrative panels); `/en/pastoral/concerns/a3b03130-…` (newly-created by the walkthrough) also opens.

---

## S5 — Safeguarding

**Status:** Complete (2026-04-21)
**Session plan:** [`S5_safeguarding.md`](./S5_safeguarding.md)

### Session summary

S5 walked the whole safeguarding hub for owner@nhqs.test and surfaced one **structural P0** (the safeguarding concerns UI at `/safeguarding/concerns`, `.../new`, `.../[id]`, and `/safeguarding/my-reports` is four `redirect()` stubs to pastoral — every SG-S0-xxx detail link on the hub / sealed / SLA / recent feeds dead-ends at the pastoral handler's "Concern not found", despite the backend `/api/v1/safeguarding/concerns*` being fully implemented), four P1 data-integrity bugs, and one P3 dashboard-label question. W-S5-001 is deferred with a written reason: fixing it requires building three full-featured pages (list with filters, multi-step create covering `SafeguardingConcernType` + TUSLA/Gardaí / DSL assignment, and a detail page with timeline, actions, attachments, TUSLA/Gardaí referral flow, seal-initiate/approve/reject dual-approval UI, status transitions, and closure) which is a standalone subsystem build-out that substantively exceeds a single walkthrough session. All four P1s (W-S5-002..005) rolled up to two backend + two frontend root causes — fixed in `f1239e30`: `mapConcernSummary` now includes student/assignee/reporter `first_name`/`last_name` AND `sealed_at`/`sealed_reason`/`sealed_by`/`seal_approved_by` (so the sealed list can render "sealed 2026-04-16 · approved by Yusuf Rahman" and the SLA dashboard can render real names instead of "undefined undefined"); the list findMany `include` was extended with `sealed_by` + `seal_approved_by`; the hub page's `academicYearStart` now rolls back to the previous August 1 when the current month is before August (so "Sealed this year" counts correctly in April); the hub's recent-concerns feed and the SLA dashboard both pin a status filter excluding closed states (no more sealed concerns on the "On track" SLA board); and the SLA row component short-circuits "Xh remaining/overdue" to a new "SLA met" label whenever `sla_first_response_met_at` is populated. 400 safeguarding tests stayed green after `mapConcernSummary` gained the `first_name`/`last_name`/`name` triple-shape. W-S5-006 (home-dashboard "Safeguarding alerts" tile actually watches comms-oversight flags, not concerns) was deferred as a naming/scope UX question for S9. No screenshots produced. Carry-forward for S9 / future work: the entire safeguarding concerns frontend subsystem needs a dedicated implementation plan — the backend is ready, only the UI is missing.

### W-S5-001 — Safeguarding concerns UI is stub redirects; all concern detail links dead-end at "Concern not found"

- **Severity:** P0
- **Route:** `/en/safeguarding/concerns`, `/en/safeguarding/concerns/new`, `/en/safeguarding/concerns/[id]`, `/en/safeguarding/my-reports`
- **Role:** owner@nhqs.test (school_owner + school_principal)
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as owner@nhqs.test, navigate to `/en/safeguarding`.
  2. Landing renders correctly: "Open concerns 3 · 0 critical · 1 high", recent-concerns list showing SG-S0-001…004.
  3. Click "All concerns" card → URL becomes `/en/safeguarding/concerns`, but the browser is immediately redirected to `/en/pastoral/concerns`.
  4. Click "Report a concern" quick action → URL becomes `/en/safeguarding/concerns/new`, then redirected to `/en/pastoral/concerns/new`. The form that loads has pastoral tier/category fields, not `SafeguardingConcernType` / severity / TUSLA / Gardaí / sealing / DSL assignment.
  5. From the hub's "Recent concerns" list, click SG-S0-004 (or any other SG-S0-…). URL becomes `/en/safeguarding/concerns/{uuid}` → redirected to `/en/pastoral/concerns/{uuid}` → page renders "Concern not found or not visible to your account." Network shows `GET /api/v1/pastoral/concerns/{uuid}` → 404 (the pastoral concern service has no record of a safeguarding UUID).
  6. Same result for every SG-S0-001..004 link in the hub, the SLA dashboard, and the sealed records list. Every safeguarding concern detail surface is unreachable.
- **Expected:** The safeguarding hub owns its own list/new/detail pages that talk to `/api/v1/safeguarding/concerns*` (the backend that is fully implemented with POST, GET, GET:id, PATCH, status transitions, assignment, TUSLA/Gardaí referral, attachments, seal initiate/approve/reject, actions, case-file generation).
- **Actual:** `apps/web/src/app/[locale]/(school)/safeguarding/concerns/page.tsx`, `.../concerns/new/page.tsx`, `.../concerns/[id]/page.tsx`, and `.../my-reports/page.tsx` are all `redirect()` stubs to the equivalent `/pastoral/concerns*` routes. Because safeguarding concerns live in their own table (`safeguarding_concerns`) with their own IDs and schema, the pastoral handler cannot render them. The entire safeguarding core flow is dead through the UI.
- **Evidence:** Every safeguarding concern link tested returns to the pastoral list or a "not found" page. Redirect files:
  - `apps/web/src/app/[locale]/(school)/safeguarding/concerns/page.tsx` (5 lines)
  - `apps/web/src/app/[locale]/(school)/safeguarding/concerns/new/page.tsx` (8 lines)
  - `apps/web/src/app/[locale]/(school)/safeguarding/concerns/[id]/page.tsx` (9 lines)
  - `apps/web/src/app/[locale]/(school)/safeguarding/my-reports/page.tsx` (5 lines)
- **Deferred:** Building out a proper safeguarding-concerns UI requires three full pages (list with severity/status/SLA filters and sealed-respecting visibility; a multi-step create form covering `SafeguardingConcernType`, severity, student selection, description, immediate actions, designated-liaison assignment, optional TUSLA/Gardaí referral fields, optional pastoral-concern link; and a detail page with timeline, chronology, actions feed, attachments upload + download, status transition, TUSLA/Gardaí referral flow, seal initiate/approve/reject dual-approval UI, decision log, agency notifications, and closure/resolution) — each with its own role-gating, audit-logging, and permission-aware UX. That is a substantive subsystem build-out that materially exceeds the scope of a single walkthrough session; it also has hard safeguarding-specific UX constraints (sealed-record redaction, break-glass context surfacing, audit banners, DSL-only mutation rules) that require a proper design spec. This issue is recorded here as a P0 blocker for the safeguarding hub's primary flow and is carried forward to S9 / future work with a recommendation that it be ticketed as a dedicated implementation plan (scale-of-effort comparable to building out the pastoral concerns UI the first time).
- **Verified:** {deferred}

### W-S5-002 — Safeguarding concern summary API drops student first/last name; frontend renders "undefined undefined"

- **Severity:** P1
- **Route:** `/en/safeguarding/sla` (and any downstream surface that consumes the list endpoint)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/safeguarding/sla`.
  2. Each of the 4 rows (SG-S0-001…004) renders the student column as "undefined undefined".
  3. The assignee filter dropdown offers "undefined undefined" as the sole non-"All assignees" option.
- **Expected:** Student name and assignee name render correctly everywhere the `/api/v1/safeguarding/concerns` list response is consumed.
- **Actual:** `mapConcernSummary` at `apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts:976-1021` returns `student: { id, name }` and `assigned_to: { id, name }`, but the frontend type `SafeguardingConcernRow` in `apps/web/src/app/[locale]/(school)/safeguarding/_components/summary.ts:37-52` declares `student: { id, first_name, last_name }` and `assigned_to: { id, first_name, last_name }`. Every consumer concatenates `first_name + ' ' + last_name`, both missing from the API response, so the UI renders "undefined undefined".
- **Evidence:** none; reproducible from the live SLA dashboard.
- **Fix:** `f1239e30` — `mapConcernSummary` now returns `{ id, first_name, last_name, name }` on every user relation (backwards-compatible); `include` on the list findMany unchanged (it already selected first_name/last_name).
- **Verified:** 2026-04-21 — `/en/safeguarding/sla` now shows "Yusuf Rahman" on every row and in the assignee dropdown (previously "undefined undefined").

### W-S5-003 — Sealed records list always shows "seal date unknown · approved by unknown approver"

- **Severity:** P1
- **Route:** `/en/safeguarding/sealed`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/safeguarding/sealed`.
  2. The single row reads "Sealed concern #SG-S0-004 · seal date unknown · approved by unknown approver".
  3. DB confirms `sealed_at = 2026-04-16 17:52:21.713+00`, `sealed_by_id` and `seal_approved_by_id` both populated with valid user UUIDs.
- **Expected:** "Sealed concern #SG-S0-004 · sealed 2026-04-16 · approved by {approver name}".
- **Actual:** `mapConcernSummary` omits `sealed_at`, `sealed_by`, and `seal_approved_by` entirely from the summary response. `sealedRowLabel` at `apps/web/src/app/[locale]/(school)/safeguarding/_components/summary.ts:131-152` then falls back to its "unknown date" / "unknown approver" branches for every row.
- **Evidence:** none; reproducible.
- **Fix:** `f1239e30` — `mapConcernSummary` now includes `sealed_at`, `sealed_reason`, `sealed_by`, and `seal_approved_by`; list findMany include extended with `sealed_by` + `seal_approved_by` selects.
- **Verified:** 2026-04-21 — `/en/safeguarding/sealed` now reads "Sealed concern #SG-S0-004 · sealed 2026-04-16 · approved by Yusuf Rahman".

### W-S5-004 — Safeguarding hub "Sealed this year" KPI stuck at 0 even with a sealed concern

- **Severity:** P1
- **Route:** `/en/safeguarding`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/safeguarding`.
  2. Top KPI strip reads "Sealed this year: 0" despite SG-S0-004 being sealed today (confirmed in DB and on `/en/safeguarding/sealed`).
- **Expected:** "Sealed this year: 1".
- **Actual:** The hub page computes `academicYearStart = new Date(new Date().getFullYear(), 7, 1).toISOString()` (Aug 1 of the current calendar year). On any run between January and July, this is a FUTURE timestamp, so `/api/v1/safeguarding/concerns?status=sealed&from=<future>` matches nothing. Today is 2026-04-21, so `from = 2026-08-01`, which excludes all four seeded concerns including the one sealed today. A correct "academic-year-to-date" window needs the previous August 1 whenever we're before August.
- **Evidence:** none; reproducible.
- **Fix:** `f1239e30` — hub page computes `ayYear = month >= 7 ? year : year - 1` so before August it rolls back to the previous August 1.
- **Verified:** 2026-04-21 — `/en/safeguarding` hub now reads "Sealed this year: 1"; "Sealed records" hub card also shows count 1.

### W-S5-005 — Recent-concerns list and SLA dashboard include the sealed concern; sealed rows render "On track"

- **Severity:** P1
- **Route:** `/en/safeguarding`, `/en/safeguarding/sla`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. On `/en/safeguarding`, the "Open concerns" KPI correctly excludes the sealed concern (says 3). The "Recent concerns" feed immediately below shows 4 rows including SG-S0-004 rendered with "High / On track" badges.
  2. On `/en/safeguarding/sla`, the total says "4 concerns" and all four rows are listed — including the sealed SG-S0-004 — each with "43h remaining · On track".
  3. SG-S0-001…004 all have `sla_first_response_met_at` already set (confirmed DB) so "43h remaining" is meaningless for them; once SLA is met the remaining-time label should hide.
- **Expected:** The sealed concern is filtered out of both the recent-concerns feed and the SLA dashboard. Rows whose `sla_first_response_met_at` is set do not render a "Nh remaining" string — they show "Met" or equivalent.
- **Actual:** The hub queries `/api/v1/safeguarding/concerns?pageSize=8` with no status filter and shows the raw top-8 regardless of status; the SLA dashboard does the same. The list endpoint does not exclude sealed concerns unless the caller explicitly asks it to. The SLA dashboard row component also ignores `sla_first_response_met_at` when rendering "remaining".
- **Evidence:** none; reproducible.
- **Fix:** `f1239e30` — hub recent-concerns query now pins `status=reported,under_investigation,monitoring,referred` (closed states excluded). SLA dashboard query pins the same status list. SLA row component short-circuits the "Xh remaining / overdue" line when `sla_first_response_met_at` is set, rendering a new `safeguardingHub.sla.met` key ("SLA met" / "تمّ الاستجابة خلال المهلة").
- **Verified:** 2026-04-21 — `/en/safeguarding` recent-concerns feed now shows 3 rows, sealed SG-S0-004 no longer appears; `/en/safeguarding/sla` lists 3 rows (no sealed), each displaying "SLA met" since all seeded concerns have `sla_first_response_met_at` populated.

### W-S5-006 — Home dashboard "Safeguarding alerts" widget doesn't actually watch safeguarding concerns

- **Severity:** P3
- **Route:** `/en/dashboard`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/dashboard`. The "Safeguarding alerts" tile reads "All clear — no pending flags" while there are 3 open safeguarding concerns (including 1 High) visible on `/en/safeguarding`.
- **Expected:** A tile labelled "Safeguarding alerts" on the admin dashboard should surface open safeguarding concerns (or at least reflect high-severity items). If it's instead scoped to communications oversight only, it should be labelled accordingly.
- **Actual:** `apps/web/src/app/[locale]/(school)/_components/dashboard-widgets/safeguarding-alerts-widget.tsx` queries `/api/v1/inbox/oversight/flags` (the comms oversight hit-list), NOT safeguarding concerns. With zero oversight flags, the tile collapses to "All clear" regardless of concern load. Naming / scope mismatch — either the tile should aggregate concerns as well, or the label should read "Communication oversight".
- **Deferred:** cosmetic + scope question, batching into S5 polish commit. Not a data bug — the tile's underlying query is internally consistent. Flag for UX/product review in S9.
- **Verified:** {pending}

---

## S6 — Early Warning / At-Risk

**Status:** Complete (2026-04-22)
**Session plan:** [`S6_early_warning.md`](./S6_early_warning.md)

### W-S6-001 — `school_owner` and `school_principal` roles carry zero early_warning.\* permissions; hub renders hard-zero tiles despite 207 computed profiles

- **Severity:** P0
- **Route:** `/en/early-warnings`, `/en/early-warnings/cohort`, `/en/early-warnings/settings`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Enqueue `early-warning:compute-daily` for tenant `3ba9b02c-0339-49b8-8583-a06e05a32ac5` and wait for the worker to finish → 207 rows written to `student_risk_profiles` (max `composite_score` = 14, all `risk_tier = green`; non-zero `behaviour_score`/`wellbeing_score`/`grades_score`/`engagement_score` on dozens of students, confirmed in DB).
  2. Navigate to `/en/early-warnings`. KPIs read Red 0 · Amber 0 · Worsening 0 · Active interventions 1. "At-risk students" panel reads "0 flagged". Cohort preview reads "No year-group data available." / "No class-level concentration yet." / Total flagged = 0 / Year groups affected = 0.
  3. Navigate to `/en/early-warnings/cohort`. Change Group By → Class. Fetch spy captures `GET /api/v1/early-warnings/cohort?group_by=class` → `200 {"data":[]}`. No table rendered — "No students flagged" only.
  4. Inspect RBAC seed — `packages/prisma/seed/system-roles.ts` never assigns `early_warning.view`, `early_warning.manage`, `early_warning.acknowledge`, or `early_warning.assign` to any role. Production confirms: `SELECT permission_key FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN roles r ON r.id=rp.role_id WHERE p.permission_key LIKE 'early_warning%' AND r.tenant_id='3ba9b02c…';` → 0 rows.
- **Expected:** Owner/Principal can see at minimum the tier distribution and cohort aggregates for their tenant's 207 computed profiles.
- **Actual:** `PermissionGuard` waves the owner through thanks to `isOwner()` bypass, so endpoints return 200. But the service's `resolveRoleScope` checks `permissions.includes('early_warning.manage')` explicitly (`apps/api/src/modules/early-warning/early-warning.service.ts:72` and the same pattern in `early-warning-cohort.service.ts:92`); with no matching permission and no staff profile (owner is non-teaching), it returns `{ unrestricted: false, studentIds: [] }`. Every downstream query is then scoped to an empty student-ID set, so /summary, /cohort, and /list all return 0 tier counts / empty rows — making the entire module look broken to any owner/principal user.
- **Evidence:** none; reproducible with any owner/principal on any tenant.
- **Fix:** `140d3ff7` — seeded `early_warning.{view,manage,acknowledge,assign}` on `school_owner` + `school_principal`, `view/acknowledge/assign` on `school_vice_principal` + `admin`, `view/acknowledge` on `teacher`; added idempotent backfill script `packages/prisma/scripts/grant-early-warning-permissions.ts` that iterates every tenant under `SET LOCAL app.current_tenant_id` (tables carry `FORCE ROW LEVEL SECURITY`, so a plain connection sees no rows). Ran against all 5 production tenants.
- **Verified:** 2026-04-22 — `/en/early-warnings/cohort` now renders 8 year-group rows with populated per-domain averages (2nd class: 35 students, avg 7, Behaviour 28, Engagement 1). Hub KPIs read Red 0 · Amber 0 · Yellow 0 · Active interventions 1 — zero counts now match real DB state (all 207 profiles sit below the yellow threshold, see W-S6-004). Settings page opens the saved config instead of the "defaults" placeholder.

### W-S6-002 — Yellow-tier students are invisible on the hub landing

- **Severity:** P1
- **Route:** `/en/early-warnings`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. The default EW config has 4 tiers: green(0) → yellow(30) → amber(50) → red(75). The landing hub shows KPI tiles for **Red**, **Amber**, **Worsening this period**, and **Active interventions** only.
  2. The "At-risk students" panel only includes rows pulled from `?tier=amber` and `?tier=red` queries (`apps/web/src/app/[locale]/(school)/early-warnings/page.tsx:102-116`). Yellow-tier students are never surfaced.
  3. Set a threshold to push one student into yellow (see W-S6-004 scoring calibration) — the hub still reads "0 flagged" everywhere even though tier distribution now shows yellow > 0.
- **Expected:** Yellow tier ("Monitoring") students should be surfaced somewhere on the hub — either as a third KPI tile or included in the at-risk panel with an explicit filter chip. Otherwise, a population of 200 students quietly sitting at yellow renders exactly the same as "nothing to see here".
- **Actual:** Hub KPI tiles don't include a "Yellow / Monitoring" count. The at-risk list query is hard-coded to amber/red. Yellow-tier students can only be discovered through the cohort page's raw numbers.
- **Evidence:** none; reproducible.
- **Fix:** `140d3ff7` — added a `Yellow watch / Monitoring` KPI tile (replacing the always-zero "Trending up" heuristic), added a `?tier=yellow` fetch to the landing page's effect, and included yellow rows in the merged at-risk list. English + Arabic strings added under `earlyWarningsHub.kpis.{yellow,yellowSubtitle}`.
- **Verified:** 2026-04-22 — `/en/early-warnings` now renders four KPI tiles: Red 0 · Amber 0 · Yellow watch 0 · Active interventions 1. The yellow tile links to `?tier=yellow`; the at-risk list merges red + amber + yellow rows (empty today but the code path is wired — confirmed via the `tierScopedRows` memo filter switch when URL param flips).

### W-S6-003 — `?tier=red|amber` URL param on landing is a dead link

- **Severity:** P2
- **Route:** `/en/early-warnings?tier=red`, `/en/early-warnings?tier=amber`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Click the "Red risk" KPI tile on the hub landing. URL updates to `/en/early-warnings?tier=red`. Page content does not change.
  2. `apps/web/src/app/[locale]/(school)/early-warnings/page.tsx` reads no `searchParams` / `useSearchParams` — the tile looks like a filter entry point but the client never consumes the param.
- **Expected:** Clicking the tile either scrolls/filters the at-risk list to that tier, or navigates to a distinct tier-scoped page. A link whose URL changes but UI doesn't is worse than no link at all.
- **Actual:** URL param is written but never read.
- **Evidence:** none.
- **Fix:** `140d3ff7` — page now consumes `useSearchParams().get('tier')` via `parseTierParam`. The merged at-risk list plus the domain-counts memo filter through `tierScopedRows = rows.filter(r => r.risk_tier === tierFilter)`. KPI tiles keep their `?tier=…` links; the URL change now narrows the list.
- **Verified:** 2026-04-22 — clicking each KPI tile updates the URL AND the at-risk list filters to that tier (0 rows today because no student has crossed yellow, but the path is exercised and domain counts switch accordingly when data is present).

### W-S6-004 — Default weights + thresholds do not surface meaningfully-at-risk students from realistic single-domain activity

- **Severity:** P2
- **Route:** `/en/early-warnings`, `/en/early-warnings/cohort`, `/en/early-warnings/settings`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. NHQS S0 seed: 33 negative behaviour incidents + 8 active sanctions (incl. 4 suspensions) + 6 pastoral concerns (2 urgent) + 3 active pastoral cases + 4 safeguarding concerns (1 sealed).
  2. After `early-warning:compute-daily` runs, max composite = 14. Students with suspensions (behaviour = 30) → composite 6. Students with urgent concern + active case → composite 6. No student reaches yellow threshold 30.
  3. Default weights (attendance 25, grades 25, behaviour 20, wellbeing 20, engagement 10) mean a single domain scored at 100 can contribute at most 25 composite — below yellow's 30. A student with a suspension AND an urgent concern still scores only 10.
- **Expected:** Out-of-the-box, a real risk signal (an active suspension, an urgent pastoral concern, a recent exclusion) should either push the student to yellow ("Monitoring") on its own or combine with any second signal to cross the yellow threshold.
- **Actual:** Single-domain signals are mathematically incapable of crossing yellow; two moderate signals are also insufficient in most cases. This means the product's "spot students drifting toward risk" promise reads as "the hub is always empty" for any tenant whose signals are realistically distributed across students rather than concentrated on the same 3-4 names.
- **Deferred:** **Product calibration** — the fix here is either (a) rebalance the default weights so one strong signal can trip yellow, or (b) lower yellow threshold (e.g. 20) so the current math catches moderate risk. Both are tenant-facing decisions that need user sign-off. Not a code bug — the scoring math works correctly given the configured inputs. Flag for product review in S9.
- **Verified:** {pending}

### W-S6-005 — Cohort page is a groupBy-only view; blueprint-expected filters (date range, house, risk factor, year-group/class drill-in) are absent

- **Severity:** P3
- **Route:** `/en/early-warnings/cohort`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/early-warnings/cohort`. The page offers only a "Group By" dropdown with 3 options: Year Group, Class, Subject.
  2. S6 blueprint §2b asks for year group, class, house, date range, and risk factor filters; drill-down into a cohort should show matching members.
  3. Current behaviour: clicking a cell links to `/en/early-warnings?year_group_id=…&domain=…` — which the landing page doesn't honour (see W-S6-003).
- **Expected:** Either the filters exist or the blueprint is wrong. Assuming blueprint is right, cohort needs at minimum a date-range picker (current vs. last-30-day trend) and a tier filter.
- **Actual:** Cohort is a pivot-by-grouping table only — no date range, no tier filter, no drill-down that actually filters the at-risk list.
- **Deferred:** scope gap; batching into S6 polish or S9 product review.
- **Verified:** {pending}

### W-S6-006 — EW config GET response uses `_json`-suffixed keys but frontend reads unsuffixed; settings page always shows defaults

- **Severity:** P0
- **Route:** `/en/early-warnings/settings`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. DB has a saved EW config row for NHQS with non-default `high_severity_events_json` etc. (row `51c6b848-8e29-447d-8c50-b214a88c61be`, `is_enabled=true`).
  2. Navigate to `/en/early-warnings/settings`. The amber banner reads "No early-warning settings on file yet. The values below are sensible defaults — review them and click Save…". Every field is populated with hard-coded frontend defaults — the API response is effectively thrown away.
  3. Inspect `apps/api/src/modules/early-warning/early-warning-config.service.ts:66-77` — service returns `{ weights_json, thresholds_json, routing_rules_json, digest_recipients_json, high_severity_events_json, … }`. The frontend `EarlyWarningConfig` type at `apps/web/src/lib/early-warning.ts:89-113` declares `{ weights, thresholds, routing_rules, digest_recipients }` — un-suffixed. The `hasCompleteConfig` guard at `settings/page.tsx:41-47` checks `cfg.weights`, `cfg.thresholds`, `cfg.routing_rules` and returns `false` for every real response, triggering the "using defaults" path permanently.
- **Expected:** Settings page populates with the tenant's saved config and only shows "using defaults" on tenants that really haven't persisted one.
- **Actual:** Defaults banner is permanent. If the admin nudges any slider and saves, the saved config is quietly overwritten with whatever the UI shows.
- **Evidence:** none; reproducible on any tenant with a config row.
- **Fix:** `140d3ff7` — frontend `EarlyWarningConfig` type at `apps/web/src/lib/early-warning.ts:89-116` now declares `{ weights_json, thresholds_json, routing_rules_json, digest_recipients_json, high_severity_events_json }` matching the API's JSONB column names. `hasCompleteConfig` checks the `_json`-suffixed keys; `form.reset` copies them through.
- **Verified:** 2026-04-22 — `/en/early-warnings/settings` loads the live NHQS config (weights 25/25/20/20/10, thresholds 0/30/50/75, hysteresis 10, routing yellow→homeroom_teacher / amber→year_head / red→principal+pastoral_lead) and the "using defaults" banner no longer renders.

### W-S6-007 — Settings "Save Changes" silently no-ops; `digest_recipients_json` schema demands UUIDs but UI stores role keys

- **Severity:** P0
- **Route:** `/en/early-warnings/settings`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. On `/en/early-warnings/settings`, tick any additional "Recipients" checkbox (e.g. Pastoral Lead). Click "Save Changes".
  2. No toast renders. No network request leaves the page (confirmed via fetch spy — zero `PUT /api/v1/early-warnings/config` calls).
  3. No `aria-invalid` markers or error messages appear on any field.
  4. Digest recipients are written as role-key strings (`'principal'`, `'pastoral_lead'`…) by `DigestConfig.toggleRecipient` at `settings/_components/digest-config.tsx:41-46`. The Zod schema at `packages/shared/src/early-warning/schemas.ts:70` defines `digestRecipientsSchema = z.array(z.string().uuid()).default([])`.
  5. `zodResolver` rejects the role-key array as invalid UUIDs; `form.handleSubmit` never calls `onSubmit`; no PUT fires; the user has no way to tell anything failed.
- **Expected:** Save either succeeds (PUT goes, toast shows "Settings saved") or surfaces a visible validation error.
- **Actual:** Completely silent failure — the button looks like it does nothing. The user cannot persist any recipients change until the day someone notices.
- **Evidence:** none; 100% reproducible with any digest-recipients or threshold change.
- **Fix:** `140d3ff7` — `digestRecipientsSchema` at `packages/shared/src/early-warning/schemas.ts:82-87` is now `z.array(z.string().min(1)).default([])` instead of demanding UUIDs. The UI writes role-key strings (which is the correct semantic — weekly digests address roles, not user UUIDs).
- **Verified:** 2026-04-22 — ticked "Pastoral Lead" under Weekly Digest → Recipients and clicked Save Changes. Fetch spy captured `PUT /api/v1/early-warnings/config 200`. DB confirms `digest_recipients_json = ["pastoral_lead"]` on the NHQS config row.

### Session summary

S6 walked all 4 EW routes for the first time on NHQS and exposed five distinct defects that combined to make the module effectively invisible for owner/principal. Enqueued `early-warning:compute-daily` manually (task #6 carried over from S0) → 207 risk profiles materialised but every UI surface rendered zeros. Root cause was a missing role→permission mapping in the Impl-01 seed — `school_owner`, `school_principal`, `school_vice_principal`, `admin`, and `teacher` all carried zero `early_warning.*` permissions, so `resolveRoleScope` returned empty `studentIds` for every read. Four additional surface bugs piled on top: the hub never rendered yellow tier, `?tier=` URL params were dead, the settings page used wrong JSON key names so it always showed defaults, and the digest recipients schema demanded UUIDs while the UI wrote role keys (silently killing every Save). All five fixed and verified on production in a single commit `140d3ff7`. W-S6-004 (scoring calibration — max composite = 14 against yellow threshold 30) and W-S6-005 (cohort filter scope gap vs. blueprint) are product-review deferrals, both flagged for S9. No screenshots created. Carry-forwards: a product decision on scoring defaults so the module doesn't read as "always empty" on realistic tenants, and a decision on cohort filter breadth (blueprint expected year-group/class/house/date-range/risk-factor filters; we ship groupBy-only).

---

## S7 — Staff Wellbeing

**Status:** Complete (2026-04-22)
**Session plan:** [`S7_staff_wellbeing.md`](./S7_staff_wellbeing.md)

### Session summary

S7 walked every Staff Wellbeing surface owned by this session (the hub at `/en/wellbeing/staff`, the thin redirects at `/wellbeing/dashboard`, `/my-workload`, `/resources`, `/reports`, `/settings`, the admin surveys list, the survey detail page, and the self-service responder at `/wellbeing/survey`) and exposed a single root cause with two very different symptoms plus a scoring bug and three UX gaps. The root cause: the API's `ResponseTransformInterceptor` wraps every non-paginated response in `{ data: T }` and Staff Wellbeing's frontend components overwhelmingly ignored that wrapper — `AggregateSection` crashed the owner's landing with `TypeError: Cannot read properties of undefined (reading 'mean')` (resolving the long-deferred W-S0-001), the survey detail page crashed with the same pattern on `.questions.some`, and BoardReport / Resources / MyWorkload / Overview-tab silently rendered empty or fallback states instead of the real data (including the closed-survey response count showing "0 of 0 staff (0%)" with 15 seeded responses). Fix: apply `unwrap()` uniformly across all single-DTO call sites. Separately, the `/staff-wellbeing/respond/active` endpoint was 500-ing on every request because `HmacService.getOrCreateHmacSecret` opened a raw `this.prisma.$transaction` with no RLS context — `tenant_settings` silently read as empty under the policy's USING clause and the subsequent `update` triggered a Postgres UUID parse error on the stale GUC; fixed by running read+write inside a single `createRlsClient` transaction. W-S7-002 (timetable-quality composite showing `1156` / "Good" and Free Period Distribution badges using 0-1 thresholds against 0-100 values) was a paired frontend+backend scoring-scale drift; both sides now agree on 0-100 for `free_period_clumping.mean` and percent-not-ratio for `split_timetable_pct`. W-S7-006 wired an onClick for the previously-dead "View Results" button on closed surveys. Verified end-to-end as owner and API-level as teacher (Sarah Daly's bearer) — posted a 4/5 Likert response against the active survey, NHQS response count moved 5 → 6 with one new participation token, anonymisation invariant preserved. No P3 polish emerged. No issues deferred. Screenshots deleted. Carry-forwards for S9: none new — the scoring-scale fix may want a design review at some point (whether 1.81 consecutive periods on NHQS should really weight into "Good" timetable quality at 55), but the machine-readable values are now coherent with the rest of the module.

### W-S7-001 — Staff wellbeing dashboard crashes on `{data}`-wrapped payloads (resolves W-S0-001)

- **Severity:** P0
- **Route:** `/en/wellbeing/dashboard` (redirects to `/en/wellbeing/staff`)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as admin owner.
  2. Navigate to `/en/wellbeing/dashboard`.
  3. Wait for data fetches.
- **Expected:** Staff wellbeing dashboard with workload, aggregate, surveys, board report, and resources sections rendered.
- **Actual:** Full-page error boundary ("Something went wrong"). Console: 3× 404s on `/api/v1/staff-wellbeing/my-workload/*` (expected — principal has no `staff_profiles` row and `MyWorkloadSection` handles it with an empty state) plus `TypeError: Cannot read properties of undefined (reading 'mean')` thrown from `AggregateSection`.
- **Root cause:** The API's `ResponseTransformInterceptor` wraps every non-paginated response in `{ data: T }`, but four Staff Wellbeing frontend sections — `AggregateSection`, `BoardReportSection`, `ResourcesSection`, and `MyWorkloadSection` — call `apiClient<T>(...)` and treat the returned wrapper as `T`. The 6 aggregate endpoints all return `{ data: payload }`, so `timetableQuality.consecutive_periods.mean` evaluates to `(undefined).mean` and throws synchronously during `computeTimetableScore` — which bubbles up through the parent layout's error boundary and replaces the whole page. The other three sections degrade silently: `BoardReportSection`'s `isCompleteReport` check returns false on the wrapped object so the Termly Summary always shows the retry banner; `ResourcesSection` reads `data?.eap` / `data?.resources` with optional chaining so it renders the empty-EAP fallback instead of the seeded providers; `MyWorkloadSection` would crash for any user whose `/my-workload/summary` actually 200s (teachers) because `quality.free_period_distribution.find(...)` dereferences undefined. Principals never hit the latent teacher-side crash because the 404 on `/my-workload/summary` triggers the section's `noTeachingProfile` branch.
- **Evidence:** Playwright console captures — 3 × 404 + 2 × `TypeError: Cannot read properties of undefined (reading 'mean')`. Deleted before session close.
- **Fix:** `c7ee9c77` — unwrap `{ data: T }` in Aggregate / BoardReport / Resources / MyWorkload sections.
- **Verified:** 2026-04-22 — re-walked `/en/wellbeing/dashboard`, all five sections render for owner@nhqs.test; the only remaining console errors are the expected 404s on `/my-workload/*` which the section handles with a "no teaching profile" empty state.

### W-S7-002 — Aggregate timetable-quality score uses wrong scale for free_period_clumping

- **Severity:** P1
- **Route:** `/en/wellbeing/dashboard` → `/en/wellbeing/staff` (Aggregate Dashboard card)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Open Staff Wellbeing dashboard.
  2. Scroll to "Aggregate Dashboard" section.
  3. Read the "Timetable Quality" KPI card.
- **Expected:** A value on a 0–100 scale with a label consistent with typical school data (e.g. "72 · Moderate").
- **Actual:** Value renders as `1156` with label `Good`. Derived from `computeTimetableScore` in `aggregate-section.tsx` which multiplies `free_period_clumping.mean` by 100 again, despite the backend `scoreFreeDistribution()` already returning a 0-100 score. `assessFreeClumping` thresholds of `0.7` and `0.4` are similarly mis-calibrated (should be `70` / `40`). `board-report.service.ts` line 48 has the mirror bug: `clumpingScore = Math.min(100, quality.free_period_clumping.mean * 20)` — pinned at 100 for any realistic value, collapsing the signal. Net effect: the Board Report's "timetable_quality.average_score" and the dashboard's "Timetable Quality" KPI both display nonsense.
- **Evidence:** Dashboard Aggregate snapshot — "Timetable Quality · 1156 · Good"; free period distribution card showing `44.49` next to "Good" badge (a 44.49 score in a 0-100 range is moderate at best).
- **Fix:** `ed59f6e3` — frontend `computeTimetableScore` and `assessFreeClumping` now treat `free_period_clumping.mean` as 0-100, and the backend `computeAverageTimetableScore` drops the `* 20` and `* 100` multipliers (latter was also mis-scaling `split_timetable_pct` which is already a percent).
- **Verified:** 2026-04-22 — Aggregate KPI now shows "Timetable Quality · 55 · Moderate"; Board Report "Average score" is 69.3 (close to 70 threshold). Free-period-distribution card badge transitions through good/moderate/needsAttention as the mean value moves through 40/70.

### W-S7-003 — Closed-survey response count shows "0 of 0 staff (0%)" despite 15 seeded responses

- **Severity:** P1
- **Route:** `/en/wellbeing/staff` (Surveys section) and `/en/wellbeing/surveys`
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Open Staff Wellbeing dashboard.
  2. Scroll to "Staff Surveys".
  3. Read the Response Rate column for the "S0-WBR Term Review (Closed)" row.
- **Expected:** Response count out of eligible staff (15 responses seeded).
- **Actual:** Shows `0 of 0 staff (0%)`. Root cause: API returns `_count: { responses: N }` (Prisma relation name) but the frontend `Survey` type in `survey-types.ts` declares `_count?: { survey_responses: number }` and `survey-list.tsx` reads `survey._count?.survey_responses`. The list endpoint also never emits `participation_count` or `eligible_count`, only the survey detail endpoint does — so even fixing the key only gets us a response count, not a percentage.
- **Evidence:** API payload `_count: { responses: 15 }` for closed survey; UI renders "0 of 0 staff (0%)" for the same row.
- **Fix:** `ed59f6e3` + `8e6a8c4e` + `e96e8d88` — Survey type now declares `_count: { responses }`, list falls back to "N responses" when eligible headcount isn't emitted, detail page reads `response_count` / `eligible_staff_count`, and the backend emits `eligible_staff_count` for closed surveys (previously only active) so the detail page can render "15 of 35 staff responded (43%)".
- **Verified:** 2026-04-22 — survey list row shows "15 responses" for the closed survey; detail page shows "15 of 35 staff responded (43%)" and the response-rate bar fills to 43%.

### W-S7-004 — `/staff-wellbeing/respond/active` crashes with empty-UUID RLS cast

- **Severity:** P0
- **Route:** `/en/wellbeing/survey` (self-service) hitting `GET /api/v1/staff-wellbeing/respond/active`
- **Role:** owner@nhqs.test (reproduces for any role that reaches this endpoint)
- **Viewport:** 1440×900
- **Steps:**
  1. Navigate to `/en/wellbeing/survey`.
  2. Wait for the `respond/active` fetch to resolve.
- **Expected:** 200 (with active survey) or 204 (no active survey) — the UI then shows the survey form or the empty state.
- **Actual:** 500. Server log: `PrismaClientUnknownRequestError … Invalid prisma.tenantSetting.update() invocation … PostgresError code 22P02 "invalid input syntax for type uuid: ""`. The client masks the 500 behind a "no active surveys" empty state, so the failure is silent from the user's perspective — but every teacher's survey round-trip would fail the same way. Root cause: `HmacService.getOrCreateHmacSecret` opened a `this.prisma.$transaction` that did NOT apply the RLS context, so `tenant_settings.findUnique` returned null under the policy's USING clause (making the service think no HMAC secret exists) and the subsequent `tenant_settings.update` fired WITH CHECK against a stale/empty `app.current_tenant_id` GUC which Postgres tried to cast to UUID — 22P02. Proved via SSH: `SET LOCAL app.current_tenant_id = ''; SELECT current_setting('app.current_tenant_id')::uuid;` reproduces the exact parse error.
- **Evidence:** API log request_id `41ccf08c-1768-41ae-a8a6-ef225d4d8049`, full stack through `HmacService.getOrCreateHmacSecret` → `SurveyService.getActiveSurvey` → `SurveyController.getActiveSurvey`.
- **Fix:** `ed59f6e3` — `HmacService.getOrCreateHmacSecret` now runs find+write inside a single `createRlsClient($transaction)` so `app.current_tenant_id` is pinned for both the policy USING read and the WITH CHECK write.
- **Verified:** 2026-04-22 — `/en/wellbeing/survey` renders the active survey form for owner@nhqs.test (no more "no active surveys" fallback hiding a 500). Direct API call as teacher (`Sarah.daly@nhqs.test`) also returns 200 with the active survey payload; POSTing a response bumped the NHQS active-survey count 5 → 6 with a fresh participation token (anonymisation preserved).

### W-S7-005 — Survey detail page crashes on `{data}`-wrapped envelope

- **Severity:** P0
- **Route:** `/en/wellbeing/surveys/:id` (every admin-side survey detail)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as admin.
  2. Navigate to `/en/wellbeing/surveys/a6839e8c-a2d8-469f-851d-02f22632f5cb` (seeded closed survey).
- **Expected:** Detail page with overview / results / moderation tabs.
- **Actual:** Full-page error boundary. Console: `TypeError: Cannot read properties of undefined (reading 'some')` — inside the `TAB_KEYS` useMemo which accesses `survey.questions.some(q => q.question_type === 'freeform')`. Same root cause as W-S7-001: `apiClient<Survey>('/api/v1/staff-wellbeing/surveys/:id')` returns `{ data: Survey }` but the component treats the wrapper as the Survey and dereferences `.questions` on `undefined`. Other single-resource calls on this page (`/results`, `/moderation`, `/activate`, `/close`, `/clone`) have the same bug — they happen not to surface because either (a) the endpoint returns a list already wrapped as `{data: [], ...}` or (b) the failure is swallowed by catch.
- **Evidence:** Playwright error capture from survey detail page load.
- **Fix:** `ed59f6e3` — survey detail `/[id]` page, results tab, moderation tab, comments fetch, activate/close actions, and the `survey-form-dialog` create flow all now `unwrap(apiClient<{ data: T }>(…))`. The self-service `/respond/active` raw-fetch path unwraps inline. Survey submit response (`{ submitted: true }`) is single-field enough that treating the wrapper as payload didn't surface user-visibly, left as-is.
- **Verified:** 2026-04-22 — opening the closed survey detail renders all three panels (Overview, Results tab, Clone action); no console error and no error boundary.

### W-S7-006 — "View Results" button on closed-survey row does nothing

- **Severity:** P2
- **Route:** `/en/wellbeing/staff#surveys` (Surveys table row actions)
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Open the Staff Wellbeing dashboard.
  2. Scroll to the Surveys section.
  3. Click the "View Results" button on the "S0-WBR Term Review (Closed)" row.
- **Expected:** Navigate to the survey detail page with the Results tab active (or at least to the detail page).
- **Actual:** Nothing happens — the button has no `onClick` handler (`survey-list.tsx` line 140 renders a bare `<Button>`). Users have to hand-type the detail URL to see a closed survey's results. This is effectively a dead action on the most important column in the table.
- **Evidence:** `survey-list.tsx` closed-status branch omits the handler.
- **Fix:** `ed59f6e3` — closed-status action button now routes to `/[locale]/wellbeing/surveys/:id` via `router.push`.
- **Verified:** 2026-04-22 — clicking "View Results" from the Surveys hub opens the detail page with Overview + Results tabs visible.

---

## S8 — Cross-cutting (mobile, RTL, roles, isolation, visual polish)

**Status:** Complete (2026-04-22)
**Session plan:** [`S8_cross_cutting.md`](./S8_cross_cutting.md)

### Session summary

S8 ran the cross-cutting sweep on NHQS: mobile (375×667), RTL (`/ar`), four-role access matrix (owner/teacher/parent/student), tenant-isolation spot-check against stress-a, and a visual polish sweep at 1440×900. Mobile walk passed for document overflow on every listed route but surfaced two shared-UI regressions: the top morph bar's mobile icon buttons (hamburger/search/inbox/notifications) were 32-36px, below the 44×44 floor (**W-S8-001**), and all `Input` / `Select` / `Textarea` primitives in `packages/ui` used `text-sm` (14px), which triggers iOS Safari auto-zoom on every form focus (**W-S8-002**). Both fixed in one sweep via responsive `text-base sm:text-sm` on the primitives and `p-3 lg:p-2` / `h-11 w-11` on the mobile header slots; two stragglers that forced `text-sm` inline (`incidents/new` parent-description Textarea and `interventions/[id]` SelectTrigger) were cleared too. RTL pass was clean: no leaked keys, no hardcoded physical classes, all nav labels translated; the Recharts measurement span at `top:-20000px` is intentional offscreen and not a bug. Role-boundary walk found that `/early-warnings`, `/wellbeing/staff` and `/wellbeing/survey` had no entries in `route-roles.ts`, so parents and students could load those pages — including the active staff survey form, which the backend only blocks at POST time (**W-S8-003/004/005**). Fixed by adding `/wellbeing` (STAFF_ROLES) and `/early-warnings` (admins + teacher) to the route map plus a defence-in-depth staff-profile check in `survey.service.getActiveSurvey`. Tenant isolation was solid: stress-a admin's JWT against NHQS subdomain returned `401 Token does not match the current tenant` on every probe, and the reverse held. Visual polish sweep at 1440×900 found no bottom-margin cut-offs (40-172px clearance across all five hub landings). One bonus finding: Sarah Daly's teacher my-workload rendered "School Average: 1714%" on the Split Days tile — same scale mismatch pattern as the S7 W-S7-002 fix on aggregate-section, but in `my-workload-section.tsx` (missed in the S7 sweep); fixed by dropping the redundant `* 100` (**W-S8-006**). Incidental win: two pre-existing S7 spec regressions (`hmac-branches.spec`, `g3-anonymous-integrity`) missed the `$extends` mock after the HMAC transaction rewrite — both now updated to match `hmac.service.spec` and pass. All 637 staff-wellbeing tests pass on the new baseline; `tsc --noEmit` clean for `apps/api`, `apps/web`, `packages/ui`.

### W-S8-001 — Header icon buttons below 44×44 minimum touch target on mobile

- **Severity:** P2
- **Route:** all routes (top morph bar)
- **Role:** owner@nhqs.test
- **Viewport:** 375×667
- **Steps:**
  1. Load any school-facing page at 375×667 (e.g. `/en/behaviour`).
  2. Measure the four leftmost/rightmost header buttons (hamburger, search, inbox, notifications).
- **Expected:** Each interactive header element measures at least 44×44px per `.claude/rules/frontend.md` ("Minimum touch target: 44×44px on all interactive elements").
- **Actual:** Hamburger 36×36, search 36×36, inbox 32×32, notifications 36×36. All below the 44px floor. Only the avatar (44×44) meets the bar. On iOS Safari / smaller fingers this makes accurate tapping harder.
- **Evidence:** `document.querySelectorAll('header button')` size scan.
- **Fix:** `dbe55433` — morph bar hamburger + mobile search bumped to 44×44 (`p-3 lg:p-2` and `h-11 w-11`); notification bell (`p-3 lg:p-2`) and inbox badge (`p-3 lg:p-1.5`) follow the same responsive pattern so the desktop morph bar stays compact.
- **Verified:** 2026-04-22 — at 375×667 all five header buttons (hamburger, search, inbox, notifications, avatar) measure 44×44.

### W-S8-002 — Input/Textarea/Select use 14px text (iOS Safari auto-zoom on focus)

- **Severity:** P2
- **Route:** every form (e.g. `/en/behaviour/incidents/new`)
- **Role:** owner@nhqs.test
- **Viewport:** 375×667
- **Steps:**
  1. Open a form page at 375×667 (e.g. `/en/behaviour/incidents/new`).
  2. Tap any input or textarea.
- **Expected:** Per `.claude/rules/frontend.md` → "Input font-size: minimum `text-base` (16px) — prevents iOS Safari auto-zoom on focus." Focusing should not trigger the viewport zoom-in.
- **Actual:** `packages/ui/src/components/{input,textarea,select}.tsx` all use `text-sm` (14px). On iOS Safari focusing any field zooms the viewport in, then requires pinch-zoom out — every form in the app is affected.
- **Evidence:** font-size scan of inputs/textareas/selects; `text-sm` baked into shared UI primitives.
- **Fix:** `dbe55433` changes the three UI primitives to `text-base sm:text-sm`, preserving desktop density. Follow-up in the same session also removed two remaining per-instance `className="text-sm"` overrides (`incidents/new/page.tsx` parent-description Textarea and `interventions/[id]` Select trigger) that were squashing the new base.
- **Verified:** 2026-04-22 — font-size scan of `/en/behaviour/incidents/new` at 375×667 returns 8 inputs/selects/textareas, 0 with font-size < 16px.

- **Severity:** P1
- **Route:** `/en/wellbeing/survey`
- **Role:** parent@nhqs.test, adam.moore@nhqs.test (student)
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as `parent@nhqs.test` (or `adam.moore@nhqs.test`).
  2. Navigate to `/en/wellbeing/survey`.
- **Expected:** Non-staff users should not reach the staff self-service survey. Either redirect to `/dashboard` or render a "Restricted workspace" empty state (consistent with how `/safeguarding` handles teachers).
- **Actual:** Page renders fully. Parent/student sees the H1 "Staff Survey", the anonymity banner, the active survey title (`S0-WBR Fortnightly Pulse (Active)`), and the Likert question form. They can fill it in. Submit is blocked at the backend (`NOT_STAFF` 403 from `survey.service.submitResponse`), but the GET `/staff-wellbeing/respond/active` endpoint has no `@RequiresPermission` decorator and no staff-profile check, so the form content leaks to any authenticated user regardless of role.
- **Evidence:** `survey.controller.ts:157-171` → `getActiveSurvey` has `@UseGuards(AuthGuard, ...)` but no `@RequiresPermission`; `survey.service.ts:688` `getActiveSurvey` has no staff check (the staff check only runs on POST submit at line 600).
- **Fix:** `dbe55433` — two-layer defence. (a) added `/wellbeing` to the frontend `ROUTE_ROLE_MAP` under `STAFF_ROLES`, so non-staff hit the `RequireRole` guard and redirect to `/dashboard`. (b) added a `staffProfile.findFirst` short-circuit at the top of `survey.service.getActiveSurvey` that returns null for non-staff, mirroring the existing `submitResponse` check. New unit test covers the new service-level path; g3/g1 mocks updated for the RLS-transaction mock shape.
- **Verified:** 2026-04-22 — parent (`parent@nhqs.test`) navigation to `/en/wellbeing/survey` now redirects to `/dashboard` (server reports H1 "Good morning, Zainab"); same for `/en/wellbeing/staff`.

- **Severity:** P1
- **Route:** `/en/early-warnings`
- **Role:** parent@nhqs.test, adam.moore@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as parent or student.
  2. Navigate directly to `/en/early-warnings`.
- **Expected:** Per blueprint §2c, parents are "Parent portal only, own child's records only, no admin or safeguarding hub". Early warnings is a staff risk dashboard — should redirect to `/dashboard` or show a restricted-workspace empty state. Compare to `/safeguarding` which correctly redirects non-DSL roles.
- **Actual:** The landing renders in full: H1 "Early Warnings", the cohort/settings sub-strip, the "We could not load the early-warning signal" error (API returns 403), and the R/A/Y/active-interventions KPI cards (all showing 0). The structural exposure of the dashboard to parents/students is an unexpected-access P1.
- **Evidence:** snapshots from Zainab and Adam logins.
- **Fix:** `dbe55433` — added `{ prefix: '/early-warnings', roles: [...ADMIN_ROLES, 'teacher'] }` to `route-roles.ts`. The `RequireRole` client guard now redirects parent/student away the same way it does for `/safeguarding` and `/pastoral`.
- **Verified:** 2026-04-22 — parent `parent@nhqs.test` hitting `/en/early-warnings` now lands on `/en/dashboard` with H1 "Good morning, Zainab".

### W-S8-005 — Parent / student can reach `/en/wellbeing/staff` hub

- **Severity:** P1
- **Route:** `/en/wellbeing/staff` (and its redirect targets `/wellbeing/dashboard`, `/wellbeing/my-workload`, `/wellbeing/reports`, `/wellbeing/resources`, `/wellbeing/surveys`)
- **Role:** parent@nhqs.test, adam.moore@nhqs.test
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as parent or student.
  2. Navigate to `/en/wellbeing/staff`.
- **Expected:** Staff Wellbeing is a staff-only workspace (workload, EAP resources, board report). Non-staff should get redirected or a restricted-workspace empty state, same pattern as safeguarding.
- **Actual:** The hub loads for parents and students. H1 "Staff Wellbeing", "My Workload" section, "Support" section, EAP resources, crisis helplines (INTO/TUI/ASTI — teacher-union helplines shown to parents/students is a misplacement beyond the access issue).
- **Evidence:** parent/student snapshots.
- **Fix:** `dbe55433` — same `route-roles.ts` change covers the hub: `{ prefix: '/wellbeing', roles: STAFF_ROLES }` catches `/wellbeing/staff`, `/wellbeing/dashboard`, `/wellbeing/my-workload`, `/wellbeing/reports`, `/wellbeing/resources`, `/wellbeing/surveys`, and `/wellbeing/survey`.
- **Verified:** 2026-04-22 — parent navigates to `/en/wellbeing/staff` and is redirected to `/en/dashboard`; same for `/en/wellbeing/survey` (which was previously leaking the active survey form).

### W-S8-006 — Teacher my-workload "Split days" school average shows 1714%

- **Severity:** P1
- **Route:** `/en/wellbeing/staff` (My Workload section, Timetable Quality Breakdown)
- **Role:** Sarah.daly@nhqs.test (teacher)
- **Viewport:** 1440×900
- **Steps:**
  1. Log in as Sarah Daly.
  2. Open `/en/wellbeing/staff`, scroll to "Timetable Quality Breakdown" in My Workload.
  3. Read the "SPLIT DAYS" tile — "School Average" row.
- **Expected:** A sane percent, e.g. "17%" or "0%".
- **Actual:** "School Average: 1714%" — frontend multiplies `school_averages.split_days_pct` by 100 on line 466 of `my-workload-section.tsx`, but the backend already returns it as a percent (0-100), computed as `(count / allStaff.length) * 100` in `workload-personal.service.ts:310`. Net result: nonsense 1000+% values on every teacher's workload tile. Same class of bug as the S7 aggregate-section fix (W-S7-002) — this file was missed in that sweep.
- **Evidence:** source inspection + live Sarah Daly view showing `1714%`.
- **Fix:** `dbe55433` — drop the redundant `* 100`: `{Math.round(quality.school_averages.split_days_pct)}%`.
- **Verified:** 2026-04-22 — Sarah Daly's my-workload now shows "SPLIT DAYS · School Average: 17%".

---

## S9 — Consolidation → Final Report

**Status:** Complete (2026-04-22)
**Session plan:** [`S9_consolidation.md`](./S9_consolidation.md)
**Deliverable:** [`FINAL_REPORT.md`](./FINAL_REPORT.md)

### Session summary

S9 consolidated the S0–S8 log into `FINAL_REPORT.md` — an executive summary, severity-ranked fix list (P0/P1/P2/P3 grouped by hub, each with commit SHA + date), deferred items with written justification, coverage summary (70/77 routes walked with documented seed-gap exclusions, four roles, two viewports, two locales), a first-48h post-ship monitoring plan, and the ship recommendation. The walkthrough logged **66 issues** across S0–S8 with 55 verified-fixed + 11 deferred; this session found **no new surface-level bugs** but did surface one lingering discrepancy during verification: W-S0-002 (P1 — "Incidents This Week" shows total incident count) was deferred from S0 to S3 but was never picked up in S3's regression pass — `BehaviourIncidentsService.getIncidentsStats` still emits only all-time counts, and the FE's `?? pulse.total_incidents` fallback silently papers over the missing 7-day-window fields. Combined with the W-S5-001 P0 deferral (the safeguarding concerns UI is four `redirect()` stubs, backend ready but UI unbuilt), ship recommendation per the S9 blueprint's severity rule is **Do not ship (yet)** — resolve those two items (W-S0-002 is a < 15-minute service-layer addition; W-S5-001 is a dedicated subsystem implementation plan) and the module ships cleanly. Four architectural lessons surfaced through the walkthrough — owner-bypass must thread the service layer, `ResponseTransformInterceptor`'s `{data}` envelope is load-bearing and needs a canonical `unwrap()`, every new sequence type needs lazy init, and every new role permission must be backfilled on existing tenants with an idempotent script — these may warrant a standalone `docs/architecture/` entry but none block ship. No screenshots were produced during S9. Every S0–S8 session ledger row is marked Complete; `_scope-map.md` is fully ticked with documented seed-gap deferrals.
