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

- [ ] `/en/behaviour/analytics` (landing)
- [ ] `/en/behaviour/analytics/comparisons`
- [ ] `/en/behaviour/analytics/subjects`
- [ ] `/en/behaviour/analytics/ai`
- [ ] `/en/behaviour/analytics/staff`
- [ ] `/en/behaviour/analytics/heatmap`
- [ ] `/en/behaviour/analytics/categories`

### Policies + Replay (S3)

- [ ] `/en/behaviour/policies`
- [ ] `/en/behaviour/policies/replay`
- [ ] `/en/behaviour/policy-replay`

### Admin (S3)

- [ ] `/en/behaviour/admin`
- [ ] `/en/behaviour/admin/legal-holds`

### Templates + Students index (S3)

- [ ] `/en/behaviour/templates`
- [ ] `/en/behaviour/students`
- [ ] `/en/behaviour/students/[studentId]` (detail — open ≥ 5)

---

## Pastoral Care hub — owned by S4

- [ ] `/en/pastoral` (landing)
- [ ] `/en/pastoral/concerns`
- [ ] `/en/pastoral/concerns/new`
- [ ] `/en/pastoral/concerns/[id]` (detail — open ≥ 3)
- [ ] `/en/pastoral/critical-incidents`
- [ ] `/en/pastoral/critical-incidents/new`
- [ ] `/en/pastoral/critical-incidents/[id]`
- [ ] `/en/pastoral/referrals`
- [ ] `/en/pastoral/referrals/new`
- [ ] `/en/pastoral/referrals/[id]`
- [ ] `/en/pastoral/cases`
- [ ] `/en/pastoral/cases/new`
- [ ] `/en/pastoral/cases/[id]`
- [ ] `/en/pastoral/sst`
- [ ] `/en/pastoral/sst/[id]`
- [ ] `/en/pastoral/dsar`
- [ ] `/en/pastoral/dsar/[complianceRequestId]`
- [ ] `/en/pastoral/checkins`
- [ ] `/en/pastoral/checkins/flagged`
- [ ] `/en/pastoral/self-referral`
- [ ] `/en/pastoral/import`
- [ ] `/en/pastoral/interventions`
- [ ] `/en/pastoral/interventions/new`
- [ ] `/en/pastoral/interventions/[id]`

---

## Safeguarding hub — owned by S5

- [ ] `/en/safeguarding` (landing)
- [ ] `/en/safeguarding/concerns`
- [ ] `/en/safeguarding/concerns/new`
- [ ] `/en/safeguarding/concerns/[id]`
- [ ] `/en/safeguarding/reviews`
- [ ] `/en/safeguarding/sealed`
- [ ] `/en/safeguarding/my-reports`
- [ ] `/en/safeguarding/break-glass`
- [ ] `/en/safeguarding/break-glass/grants`
- [ ] `/en/safeguarding/break-glass/new`
- [ ] `/en/safeguarding/break-glass/[id]`
- [ ] `/en/safeguarding/sla`

---

## Early Warning / At-Risk hub — owned by S6

- [ ] `/en/early-warnings` (landing)
- [ ] `/en/early-warnings/cohort`
- [ ] `/en/early-warnings/settings`
- [ ] `/en/early-warnings/intervene`

---

## Staff Wellbeing hub — owned by S7

- [ ] `/en/wellbeing` (landing)
- [ ] `/en/wellbeing/dashboard`
- [ ] `/en/wellbeing/surveys` (list)
- [ ] `/en/wellbeing/surveys/[id]` (detail — open ≥ 1 active + 1 closed)
- [ ] `/en/wellbeing/survey` (self-service single-question or response entry point)
- [ ] `/en/wellbeing/staff`
- [ ] `/en/wellbeing/my-workload`
- [ ] `/en/wellbeing/resources`
- [ ] `/en/wellbeing/reports`
- [ ] `/en/wellbeing/settings`

---

## Cross-cutting checks — owned by S8

Same route list walked at `/ar/…` (RTL) and at 375×667 (mobile). Role-boundary pass (teacher/parent/student/cross-tenant).

---

## Coverage target

Total unique routes above: 77 (landing + index/detail variants). S9 verifies count after all sessions.
