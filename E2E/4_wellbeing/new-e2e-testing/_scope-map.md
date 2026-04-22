# Wellbeing Walkthrough — Route Scope Map

Generated in S0 (2026-04-21). Each unchecked box is a route that must be walked by at least one session. Later sessions tick boxes. S9 verifies every box is ticked.

Root: all routes live under `apps/web/src/app/[locale]/(school)/…`. Tested primarily at `/en/…` (English). Arabic `/ar/…` sweep happens in S8.

---

## Behaviour hub — owned by S1, S2, S3

### Landing + sub-module (S1)

- [x] `/en/behaviour` (landing)

### Incidents (S1)

- [x] `/en/behaviour/incidents` (list)
- [x] `/en/behaviour/incidents/new` — 1 of 5 blueprint incidents submitted (Lateness → Adam Moore → BH-000001); remaining 4 deferred (see S1 summary).
- [x] `/en/behaviour/incidents/[id]` (detail) — 1 opened (BH-000001); deeper ≥ 6 walk deferred to S9 catch-up.

### Sanctions (S1)

- [x] `/en/behaviour/sanctions` (list)
- [x] `/en/behaviour/sanctions/today`
- [x] `/en/behaviour/sanctions/new` — render verified; submit-each-type flow deferred.

### Exclusions (S1)

- [x] `/en/behaviour/exclusions` (list)
- [x] `/en/behaviour/exclusions/new` — render verified; submit flow deferred.
- [ ] `/en/behaviour/exclusions/[id]` (detail) — no seeded exclusions; skipped (deferred to S9 catch-up).

### Appeals (S1)

- [x] `/en/behaviour/appeals` (list)
- [ ] `/en/behaviour/appeals/[id]` (detail) — no seeded appeals; skipped (deferred to S9 catch-up).

### Recognition (S2)

- [x] `/en/behaviour/recognition` (wall)
- [x] `/en/behaviour/recognition/new`

### Houses + Leaderboard (S2)

- [x] `/en/behaviour/houses`
- [x] `/en/behaviour/leaderboard`

### Documents (S2)

- [x] `/en/behaviour/documents` (list)
- [ ] `/en/behaviour/documents/[id]` (detail — open ≥ 2) — deferred: 0 documents on NHQS (no active templates seeded; template seeding is S3 scope)

### Tasks / Alerts / Amendments / Guardian Restrictions (S2)

- [x] `/en/behaviour/tasks`
- [x] `/en/behaviour/alerts`
- [x] `/en/behaviour/amendments`
- [x] `/en/behaviour/guardian-restrictions`

### Interventions (S2)

- [x] `/en/behaviour/interventions`
- [x] `/en/behaviour/interventions/new`
- [ ] `/en/behaviour/interventions/[id]` (detail — open ≥ 1) — deferred: 0 behaviour interventions on NHQS (S0 seed's "1 intervention" is pastoral, not behaviour); creation-flow UX deferred to W-S2-007

### Parent portal (S2)

- [x] `/en/behaviour/parent-portal` — walked as parent (admin redirects to /dashboard, which is correct)
- [ ] `/en/behaviour/parent-portal/appeals` — deferred to S8 (deeper parent-role pass)
- [ ] `/en/behaviour/parent-portal/recognition` — deferred to S8
- [ ] `/en/behaviour/parent-portal/documents` — deferred to S8

### Analytics (S3)

- [x] `/en/behaviour/analytics` (landing)
- [x] `/en/behaviour/analytics/comparisons`
- [x] `/en/behaviour/analytics/subjects` — 0 subject-tagged incidents on seed; empty state verified. Full data-flow requires seeding `subject_id` in S0 (deferred).
- [x] `/en/behaviour/analytics/ai` — AI disabled for tenant; disabled state verified.
- [x] `/en/behaviour/analytics/staff`
- [x] `/en/behaviour/analytics/heatmap` — weekday/period_order backfilled from occurred_at in DB (seed left them null); heatmap now shows per-day cells.
- [x] `/en/behaviour/analytics/categories`

### Policies + Replay (S3)

- [x] `/en/behaviour/policies`
- [x] `/en/behaviour/policies/replay`
- [x] `/en/behaviour/policy-replay` — intentional redirect to `/policies/replay`, not a duplicate.

### Admin (S3)

- [x] `/en/behaviour/admin`
- [x] `/en/behaviour/admin/legal-holds` — created + released test hold on BH-000001; verified DB insert, confirmed list refresh now works after pageSize fix.

### Templates + Students index (S3)

- [x] `/en/behaviour/templates` — 0 document/description templates on seed; empty state verified.
- [x] `/en/behaviour/students`
- [x] `/en/behaviour/students/[studentId]` — 3 students walked (Felix Collins, Logan Evans, Oscar Allen); pattern-bug affected all, so remaining 2 would duplicate findings. Post-fix Oscar Allen (+1 / Positive 1 / Negative 0) verified end-to-end.

---

## Pastoral Care hub — owned by S4

- [x] `/en/pastoral` (landing)
- [x] `/en/pastoral/concerns` — post-fix list shows 4 tier-1 + 2 tier-2 concerns for owner; tier filter roundtrips.
- [x] `/en/pastoral/concerns/new` — 1 concern created during the walk (Adam Moore · Emotional · Tier 1).
- [x] `/en/pastoral/concerns/[id]` — post-fix opens cleanly; walked Charlotte Adams PC-0310B89B, newly-created Adam Moore PC-A3B03130. Remaining deeper `≥ 3` walk deferred to S9 catch-up.
- [x] `/en/pastoral/critical-incidents` — empty-state verified (no seed).
- [x] `/en/pastoral/critical-incidents/new` — render verified; submit-flow deferred (seed gap means no downstream detail to walk).
- [ ] `/en/pastoral/critical-incidents/[id]` — no seeded critical incidents; deferred (seed gap).
- [x] `/en/pastoral/referrals` — 3 seeded rows visible; post-fix type column humanised.
- [x] `/en/pastoral/referrals/new` — render verified; 6 enum types correctly listed.
- [x] `/en/pastoral/referrals/[id]` — opened PC-S0 referrals; post-fix header humanised.
- [x] `/en/pastoral/cases` — 3 seeded rows visible.
- [x] `/en/pastoral/cases/new` — render verified.
- [x] `/en/pastoral/cases/[id]` — walked PC-S0-001 (Charlotte Adams).
- [x] `/en/pastoral/sst` — empty-state verified (no seed).
- [ ] `/en/pastoral/sst/[id]` — no seeded SST meetings; deferred (seed gap).
- [x] `/en/pastoral/dsar` — empty-state verified (no DSAR reviews seeded).
- [ ] `/en/pastoral/dsar/[complianceRequestId]` — no seeded DSAR reviews; deferred (seed gap).
- [x] `/en/pastoral/checkins` — monitoring config + prerequisites panel render.
- [x] `/en/pastoral/checkins/flagged` — clean empty-state.
- [x] `/en/pastoral/self-referral` — parent-facing "Raise a concern" form loads; owner redirect from parent-portal guard is expected. Student-authored round-trip deferred to S8 (role-boundary sweep).
- [x] `/en/pastoral/import` — CSV upload step 1 / 3 renders.
- [x] `/en/pastoral/interventions` — post-fix Mentoring renders.
- [x] `/en/pastoral/interventions/new` — post-fix renders cleanly with type dropdown populated.
- [x] `/en/pastoral/interventions/[id]` — post-fix detail opens with plan, outcomes, progress panels.

---

## Safeguarding hub — owned by S5

- [x] `/en/safeguarding` (landing) — post-fix KPIs correct ("Sealed this year: 1"), recent feed excludes sealed.
- [x] `/en/safeguarding/concerns` — **stub redirect to /pastoral/concerns (W-S5-001, deferred).** Landing KPIs show SG-S0-xxx concerns but clicking any link redirects to pastoral and 404s.
- [x] `/en/safeguarding/concerns/new` — **stub redirect to /pastoral/concerns/new (W-S5-001, deferred).** Opens the pastoral form; no safeguarding-specific fields (TUSLA/Gardaí/severity enum).
- [x] `/en/safeguarding/concerns/[id]` — **stub redirect that 404s (W-S5-001, deferred).** Every sealed / recent / SLA link dead-ends at "Concern not found".
- [x] `/en/safeguarding/reviews` — renders with clean empty-state (after-action reviews of break-glass grants; no outstanding reviews today).
- [x] `/en/safeguarding/sealed` — post-fix shows "Sealed concern #SG-S0-004 · sealed 2026-04-16 · approved by Yusuf Rahman".
- [x] `/en/safeguarding/my-reports` — **stub redirect to /pastoral/concerns (W-S5-001, deferred).**
- [x] `/en/safeguarding/break-glass` — list (0 active / 0 past-30d) + dialog-based request flow; staff search works ("Sarah" returned Sarah Daly).
- [x] `/en/safeguarding/break-glass/grants` — client redirect to `/safeguarding/break-glass` (documented in code).
- [x] `/en/safeguarding/break-glass/new` — client redirect to `/safeguarding/break-glass` (dialog-driven flow, documented).
- [x] `/en/safeguarding/break-glass/[id]` — detail for seeded grant 26f17061 renders: Granted to Sarah Daly, Expired 25-03-2026, after-action review filed, access log empty.
- [x] `/en/safeguarding/sla` — post-fix 3 rows (sealed excluded), "Yusuf Rahman" assignee, "SLA met" label when met_at is set.

---

## Early Warning / At-Risk hub — owned by S6

- [x] `/en/early-warnings` (landing) — post-fix 4 KPI tiles (Red 0 · Amber 0 · Yellow watch 0 · Active interventions 1); at-risk list filters via `?tier=` URL param.
- [x] `/en/early-warnings/cohort` — post-fix renders 8 year-group rows with populated per-domain averages (2nd class avg 7, Behaviour 28). Blueprint-expected house / date-range / risk-factor filters are a scope gap (W-S6-005 deferred to S9).
- [x] `/en/early-warnings/settings` — post-fix loads saved config (weights 25/25/20/20/10, thresholds 0/30/50/75); Save Changes PUTs 200; DB confirmed write.
- [x] `/en/early-warnings/intervene` — renders clean empty-state ("No students are currently flagged at red or amber risk"); red+amber only here by design since intervene is urgent-action-focused.

---

## Staff Wellbeing hub — owned by S7

- [x] `/en/wellbeing` (landing) — KPI strip, modules grid, quick actions, recent feed all verified.
- [x] `/en/wellbeing/dashboard` — intentional redirect to `/wellbeing/staff` (see dashboard/page.tsx). Post-fix landing renders all five sections; W-S0-001 crash gone.
- [x] `/en/wellbeing/surveys` (list) — redirect to `/wellbeing/staff#surveys`. List shows both seeded surveys with correct response-rate label post-fix.
- [x] `/en/wellbeing/surveys/[id]` (detail) — walked the closed survey (15 of 35 staff, 43%). Active-survey detail shown via API shape (`eligible_staff_count` present post-fix).
- [x] `/en/wellbeing/survey` (self-service) — post-fix renders the active survey form with Likert question; `/respond/active` returns 200 (was 500 pre-fix).
- [x] `/en/wellbeing/staff` — hub with My Workload / Aggregate / Surveys / Board Report / Resources sections. All render post-fix.
- [x] `/en/wellbeing/my-workload` — redirect to `/wellbeing/staff#my`. Owner sees the "no teaching profile" empty state; teacher API path verified (`/my-workload/summary` returns data).
- [x] `/en/wellbeing/resources` — redirect to `/wellbeing/staff#resources`. EAP card shows the "not configured" empty state (no seed); crisis resources render.
- [x] `/en/wellbeing/reports` — redirect to `/wellbeing/staff#board-report`. Board Report renders with academic-year header, workload, cover fairness, timetable quality, substitution pressure, absence pattern.
- [x] `/en/wellbeing/settings` — intentional redirect to `/en/settings/behaviour-general` (see wellbeing/settings/page.tsx).

---

## Cross-cutting checks — owned by S8

Same route list walked at `/ar/…` (RTL) and at 375×667 (mobile). Role-boundary pass (teacher/parent/student/cross-tenant).

- [x] Mobile 375×667 — behaviour / pastoral / safeguarding / early-warnings / wellbeing landings + two representative detail pages per hub, no horizontal scroll, tables wrapped in `overflow-x-auto`.
- [x] RTL `/ar/…` — behaviour, pastoral, safeguarding, early-warnings, wellbeing/staff, wellbeing/surveys/[id], behaviour/incidents/new form: logical CSS, Arabic labels resolved, no leaked keys.
- [x] Teacher (`Sarah.daly@nhqs.test`) — behaviour (reads OK, admin KPIs 403 silent empty), pastoral (reads OK), safeguarding ("Restricted workspace" empty state), early-warnings, wellbeing/staff (own workload renders with post-fix 17% split days).
- [x] Parent (`parent@nhqs.test`) — behaviour / pastoral / safeguarding / early-warnings / wellbeing/staff / wellbeing/survey all redirect to `/dashboard` post-fix (previously leaking through the last three).
- [x] Student (`adam.moore@nhqs.test`) — same redirect behavior as parent after route-role update.
- [x] Tenant isolation — stress-a admin JWT against `nhqs.edupod.app/api/v1/…` → `401 Token does not match the current tenant`; reverse direction (NHQS owner → stress-a) same. Cross-tenant ID guess, survey-id guess, student search all blocked.
- [x] Visual polish sweep 1440×900 — bottom padding 41-172px across all five hub landings; no edge cut-offs; no inconsistent card radius; Recharts measurement span (top:-20000px) intentional and ignored.

---

## Coverage target

Total unique routes above: 77 (landing + index/detail variants). S9 verifies count after all sessions.
