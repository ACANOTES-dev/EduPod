# S6 — Early Warning / At-Risk

**Goal:** Walk the early-warning hub. Verify that the seeded and UI-logged data from S0–S5 flips students into the correct risk tiers. The user explicitly noted "everything says zero" here at session start — S6 must prove the tiers now reflect reality.

---

## 1. Prerequisites

- S0–S5 complete and verified
- Rich dataset exists: 50 seeded behaviour + 5 UI behaviour + pastoral concerns + safeguarding concerns + attendance and health data (pre-existing in NHQS)
- Early-warning trigger job has run at least once (S0 should have ensured this — otherwise trigger it at the start of S6)

## 2. Scope — pages to walk

### 2a. Landing

- `/en/early-warnings` — hub landing
- Every tile on the landing (At Risk, Monitoring, Worsening, In Progress — and whatever else appears) clicked and walked through
- Tile counts should be non-zero now — if they are zero, that's a P0 regression

### 2b. Cohort analysis

- `/en/early-warnings/cohort` — cohort-level view
- Every filter exercised: year group, class, house, date range, risk factor
- Drill-down into a cohort — verify member list matches the count displayed

### 2c. Settings

- `/en/early-warnings/settings` — thresholds and rules
- Read every rule; verify the thresholds are sensible
- Change one threshold (e.g., lower the trigger for "at risk") temporarily, re-run the trigger, verify more students show up; revert
- Test the full save round-trip for every editable setting

### 2d. Intervene

- `/en/early-warnings/intervene` — intervention hub for at-risk students
- From an at-risk student's detail, start an intervention plan. Verify it creates the intervention record and links back to the early-warning flag.
- Chase the intervention all the way through to outcome recording

## 3. Regression checks (critical for S6)

S6 is where the system's _integrated_ behaviour is validated. Explicit checks:

- The student who had the weapon-related incident (S1 incident #4) — is flagged?
- The student with repeat phone misuse (S1 incident #5) — surfaces in "pattern detected" list?
- The student with a safeguarding concern from S5 — surfaces as at-risk?
- A student with no activity — does NOT appear in any risk tier (no false positives)
- Recognition / positive incidents — do NOT falsely push students toward at-risk (spot-check the kindness-student from S1 #3)

## 4. Standard checklist

Apply on every page. Specific to S6:

- **Number accuracy** — tile counts must match underlying lists. One mismatch = P1.
- **Empty states** are most likely to appear here if data is sparse in a category — confirm they render
- **Click-through consistency** — clicking a tile on the hub landing should take you directly to the filtered list for that tier

## 5. Architecture touchpoints

- Early-warning BullMQ trigger → document in `docs/architecture/event-job-catalog.md` if not already
- Threshold settings → document in `docs/architecture/state-machines.md` if risk tiers are modelled as a state machine

## 6. Exit criteria

- [ ] All routes in §2 walked
- [ ] Regression checks in §3 all pass
- [ ] Tile counts non-zero where expected, zero where expected
- [ ] Intervention round-trip walked
- [ ] `_scope-map.md` ticked for every S6-owned route
- [ ] All S6 issues logged with `W-S6-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S6 heading in the log
