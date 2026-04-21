# S3 — Behaviour C · Analytics, Policies, Policy-Replay, Admin, Templates, Students Index

**Goal:** Walk the reporting / configuration / admin surfaces of the behaviour hub. Confirm that the data created in S0 / S1 / S2 flows correctly into all analytics views. Verify admin tooling works.

---

## 1. Prerequisites

- S0 + S1 + S2 complete and verified
- Rich behaviour dataset now exists: 50 seeded + 5 UI incidents + sanctions + exclusions + appeals + recognition + documents + tasks + interventions
- Early-warning trigger ran (or will run on demand in §3)

## 2. Scope

### 2a. Analytics hub

- `/en/behaviour/analytics` — landing / overview
- `/en/behaviour/analytics/comparisons` — cohort / class / year-group comparisons
- `/en/behaviour/analytics/subjects` — by subject (if incidents are subject-tagged)
- `/en/behaviour/analytics/ai` — AI-assisted insights view. **Flag anything hallucinated or not matching the underlying data.**
- `/en/behaviour/analytics/staff` — by reporting staff member
- `/en/behaviour/analytics/heatmap` — time-of-day / day-of-week heatmap
- `/en/behaviour/analytics/categories` — by category

For every chart on every page:

- Does the data match the underlying records? Spot-check two numbers by querying the DB or re-counting in the list view.
- Every filter / date range / drill-down exercised
- Empty / sparse date ranges handled (pick a date range before S0 seeding — should say "no data")
- Legend, axis labels, tooltips render; RTL works when toggled
- Export button (if present) exercised — CSV / PDF / image

### 2b. Policies

- `/en/behaviour/policies` — list of behaviour policies
- View a policy — verify the rules, points values, consequences it documents actually match what the incident and sanction systems do
- `/en/behaviour/policies/replay` — replay / simulate a policy against existing data
- `/en/behaviour/policy-replay` — if this is a separate route, walk it too; identify whether this duplicates `policies/replay` (flag as a P2 redundancy if so)

### 2c. Admin

- `/en/behaviour/admin` — admin dashboard for the behaviour module
- `/en/behaviour/admin/legal-holds` — legal-hold listing; if the UX supports creating a hold, create one on a test record (verify it blocks deletion / amendment; then release it)
- Any admin-only settings (category management, points thresholds, sanction taxonomy, notification templates, escalation rules) — open each and confirm it reads and writes correctly

### 2d. Templates

- `/en/behaviour/templates` — document / notification / incident-description templates
- Edit a template; verify the edit persists and is used by subsequent document generations
- Create a template; use it to generate a doc (cross-flow into S2 territory)

### 2e. Students index (behaviour-centric)

- `/en/behaviour/students` — list of students with behaviour records
- `/en/behaviour/students/[studentId]` — drill into at least 5 students: high-incident, high-recognition, mixed, no-incidents, excluded
- Verify every panel on the student detail page (timeline, summary stats, interventions history, documents, guardian restrictions)

## 3. Regression pass (critical for S3)

S3 is also the "does all the earlier data flow through?" session. Explicit regression checks:

- Open `/en/behaviour/analytics/categories` and confirm the **exact count** of each category reported matches the seed count in S0 plus the S1 UI-driven ones.
- Open the leaderboard and confirm the totals are consistent with what S2 verified.
- Open the heatmap and confirm the S0 spread across 6 weeks shows a varied pattern, not a single spike.
- Open a student detail page for a student with both positive and negative incidents — confirm the **net score sign is correct** (this is where the "negative-as-plus-points" bug from S1 would re-surface if the fix is incomplete).

## 4. Standard checklist

Apply on every page. Specific to S3:

- **Analytics math is high-risk.** Every chart needs spot-check. If a bar chart shows "Lateness: 8" and the list view shows 10, that's a P1.
- **AI view** — hallucinations are a P0/P1. Does the narrative summary only describe data that actually exists in the records?
- **Templates and policies** are text-heavy — verify RTL rendering of long Arabic paragraphs

## 5. Architecture touchpoints

- Any analytics query change → document the query source and any caching layer in `docs/architecture/danger-zones.md` if non-obvious
- Template changes → verify they flow to BullMQ `notifications:*` jobs if used for parent notifications (cross-check `docs/architecture/event-job-catalog.md`)

## 6. Exit criteria

- [ ] All routes in §2 walked
- [ ] Regression §3 complete — every spot-check passes
- [ ] `_scope-map.md` ticked for every S3-owned route; after S3 the entire `behaviour/` subtree should be ticked
- [ ] All S3 issues logged with `W-S3-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S3 heading in the log
