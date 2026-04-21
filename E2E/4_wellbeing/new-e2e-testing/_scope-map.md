# Wellbeing Walkthrough — Route Scope Map

Generated in S0 (2026-04-21). Each unchecked box is a route that must be walked by at least one session. Later sessions tick boxes. S9 verifies every box is ticked.

Root: all routes live under `apps/web/src/app/[locale]/(school)/…`. Tested primarily at `/en/…` (English). Arabic `/ar/…` sweep happens in S8.

---

## Behaviour hub — owned by S1, S2, S3

### Landing + sub-module (S1)

- [ ] `/en/behaviour` (landing)

### Incidents (S1)

- [ ] `/en/behaviour/incidents` (list)
- [ ] `/en/behaviour/incidents/new`
- [ ] `/en/behaviour/incidents/[id]` (detail — open ≥ 6 representative records)

### Sanctions (S1)

- [ ] `/en/behaviour/sanctions` (list)
- [ ] `/en/behaviour/sanctions/today`
- [ ] `/en/behaviour/sanctions/new`

### Exclusions (S1)

- [ ] `/en/behaviour/exclusions` (list)
- [ ] `/en/behaviour/exclusions/new`
- [ ] `/en/behaviour/exclusions/[id]` (detail — open ≥ 2)

### Appeals (S1)

- [ ] `/en/behaviour/appeals` (list)
- [ ] `/en/behaviour/appeals/[id]` (detail — open ≥ 2)

### Recognition (S2)

- [ ] `/en/behaviour/recognition` (wall)
- [ ] `/en/behaviour/recognition/new`

### Houses + Leaderboard (S2)

- [ ] `/en/behaviour/houses`
- [ ] `/en/behaviour/leaderboard`

### Documents (S2)

- [ ] `/en/behaviour/documents` (list)
- [ ] `/en/behaviour/documents/[id]` (detail — open ≥ 2)

### Tasks / Alerts / Amendments / Guardian Restrictions (S2)

- [ ] `/en/behaviour/tasks`
- [ ] `/en/behaviour/alerts`
- [ ] `/en/behaviour/amendments`
- [ ] `/en/behaviour/guardian-restrictions`

### Interventions (S2)

- [ ] `/en/behaviour/interventions`
- [ ] `/en/behaviour/interventions/new`
- [ ] `/en/behaviour/interventions/[id]` (detail — open ≥ 1)

### Parent portal (admin view) (S2)

- [ ] `/en/behaviour/parent-portal`
- [ ] `/en/behaviour/parent-portal/appeals`
- [ ] `/en/behaviour/parent-portal/recognition`
- [ ] `/en/behaviour/parent-portal/documents`

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
