# S9 — Consolidation → Final Report

**Goal:** Produce a single ship-ready report merging all findings from S0–S8. This is the document the user will read to decide the module is ready to ship. After this, no further walkthrough is expected.

---

## 1. Prerequisites

- S0–S8 all marked Complete in `PLAYWRIGHT_LOG.md`
- Every issue in the log is either `**Verified:**` or `**Deferred:**` with a reason
- `_scope-map.md` is fully ticked

## 2. Deliverable

`E2E/4_wellbeing/new-e2e-testing/FINAL_REPORT.md` with the following sections:

### 2a. Executive summary (≤ 1 page)

- Scope walked (hubs, counts of pages, counts of flows)
- Total issues found: X (P0: a, P1: b, P2: c, P3: d)
- Total issues fixed: all except N deferred
- Ship recommendation: Ship / Ship with caveats / Do not ship

### 2b. Severity-ranked fix list (what was fixed, during which session, commit SHA)

Every P0/P1/P2/P3 entry from the log, grouped by severity then by hub, each one line:

```
- [P1 · S1 · behaviour/incidents/new] Negative categories showed +points instead of -points — fixed in 9a3b2c1 (2026-04-21)
```

### 2c. Deferred items with justification

Every `**Deferred:**` entry surfaced here with its written reason. These are the things the user needs to consciously accept as not-fixed before shipping.

### 2d. Coverage summary

- Routes walked: X of Y (from `_scope-map.md`)
- UI-driven flows exercised: enumerate (5 incidents, document generation, appeal filing, self-referral, break-glass, survey response, intervention, amendment, guardian restriction, …)
- Roles exercised: admin, teacher, parent, student, stress-a cross-tenant
- Viewports exercised: 1440, 1280, 375
- Locales exercised: en, ar

### 2e. Known-good post-ship monitoring plan

Short list of what to watch in production for the first 48 hours after ship:

- Specific metrics (Sentry error rate, safeguarding concern dispatch queue depth, document generation queue latency)
- Specific manual checks (DSL notifications, leaderboard totals)

### 2f. Architecture docs updated during the walkthrough

List of changes to `docs/architecture/*` made across S0–S8. This is the paper trail for reviewers who want to understand what the walkthrough discovered that wasn't previously documented.

## 3. Process

1. Open each session's entries in `PLAYWRIGHT_LOG.md`
2. Extract into the final report
3. Sort by severity then by hub
4. Write the executive summary and ship recommendation
5. Delete any remaining screenshots (should be zero)
6. Commit the final report + the updated log

## 4. What "ship recommendation" means

- **Ship** — every P0 and P1 verified fixed; any deferred items are explicitly P3 polish
- **Ship with caveats** — every P0/P1 verified fixed but at least one P2 deferred with a known-acceptable workaround
- **Do not ship** — any unresolved P0 or P1

## 5. Exit criteria

- [ ] `FINAL_REPORT.md` written
- [ ] Executive summary clearly states ship recommendation
- [ ] All 6 sections populated
- [ ] All residual screenshots deleted across the folder (`find E2E/4_wellbeing/new-e2e-testing -name '*.png' -o -name '*.jpg'` returns nothing)
- [ ] Log session ledger fully completed, every session marked Complete
- [ ] Final commit: `docs(wellbeing): ship-ready walkthrough report`

## 6. Post-S9

The user reads `FINAL_REPORT.md`. If they agree with the ship recommendation, they ship. No further walkthrough sessions are planned — this pack is self-contained.
