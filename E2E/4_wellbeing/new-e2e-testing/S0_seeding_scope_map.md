# S0 — Seeding + Scope Map

**Goal:** Leave NHQS in a state where every later session has rich, varied data to exercise. Produce a tile-map that later sessions tick off so nothing is missed.

---

## 1. Prerequisites

- NHQS reachable at `https://nhqs.edupod.app`
- Admin credentials working: `owner@nhqs.test` / `Password123!`
- Server access confirmed (SSH to `root@46.62.244.139`)
- DB access on production confirmed (via API or via `apps/api` tenant-aware scripts)
- Playwright MCP tools available

## 2. Scope

### 2a. Student / household headcount check

Log in as admin. Navigate to Students, Households, and Finance modules. Record counts:

- Students (active, by year group)
- Households
- Active finance profiles (invoices, payments seen recently)
- Staff (teachers, counsellors, DSL, admin)

If any of these are so thin that S1–S7 can't exercise realistic flows, seed more. The rule from the user: **any student seeded must have a household and finance profile**. No orphaned students.

Target minimum after S0:

- ≥ 40 active students spread across ≥ 4 year groups
- ≥ 1 student in each house (to exercise leaderboard)
- ≥ 3 counsellors / pastoral staff (distinct from admin)
- ≥ 1 DSL (Designated Safeguarding Lead)

### 2b. Behaviour seed (50 records)

Distribution (tune to what the category taxonomy actually supports — this is the target shape, not rigid):

| Type                    | Count | Notes                                                |
| ----------------------- | ----- | ---------------------------------------------------- |
| Lateness                | 8     | Spread across 6–8 students, dates in last 6 weeks    |
| Uniform                 | 6     |                                                      |
| Disruption              | 6     |                                                      |
| Fighting                | 3     | High-severity                                        |
| Weapon-related          | 1     | Triggers DSL flow if wired                           |
| Bullying                | 3     | One logged as repeat → should drive "pattern" alerts |
| Effort                  | 6     | Positive                                             |
| Helpfulness             | 4     | Positive                                             |
| Kindness                | 4     | Positive                                             |
| Community               | 3     | Positive                                             |
| Academic honesty breach | 2     |                                                      |
| Phone / device misuse   | 4     |                                                      |

All 50 are seeded via a database script (new script under `packages/prisma/scripts/` — drop a `seed-wellbeing-walkthrough.ts` here). **These 50 are separate from** the 5 UI-driven incidents that S1 will create.

Script requirements:

- Idempotent — safe to re-run without duplicating
- Tenant-scoped (writes to NHQS tenant ID only)
- Writes directly via Prisma with RLS context set (reuse `createRlsClient`)
- Records span at least a 6-week date range so analytics has a time axis
- Some incidents have sanctions attached, some appeals, some exclusions, some recognition — enough to populate every tile in S1 and S2
- Record the script path + exact rows seeded in the S0 log entry

### 2c. Pastoral + safeguarding seed

Seed enough pastoral + safeguarding data that S4 and S5 start with populated dashboards:

- 5 pastoral concerns at various stages
- 2 critical incidents (one open, one closed)
- 3 referrals across internal types
- 3 pastoral cases
- 2 SST cases
- 1 DSAR in progress
- 4 safeguarding concerns (mix of severities, at least one sealed)
- 1 break-glass grant historical record
- 2 reviews due within the next month

### 2d. Early-warning seed

Trigger the early-warning job (or wait for cron) so that the seeded incidents flip students into risk tiers. If the job can be triggered on-demand from the admin UI, do that; otherwise enqueue via the API.

### 2e. Staff-wellbeing seed

- 1 active staff wellbeing survey with at least 5 responses
- 1 closed survey with 15+ responses
- A few `resources` entries if the table supports admin-curated entries

## 3. Scope map produced by this session

Deliverable: `E2E/4_wellbeing/new-e2e-testing/_scope-map.md`

Structure:

```
## Behaviour hub
- [ ] /en/behaviour (landing)
- [ ] /en/behaviour/incidents
- [ ] /en/behaviour/incidents/new
- [ ] /en/behaviour/incidents/[id]
...
```

Every route reachable under the wellbeing umbrella is listed as an unchecked box. Later sessions tick boxes as they cover routes. S9 reviews that every box is ticked.

## 4. Visual baseline pass (quick, not deep)

With the browser at 1440×900, open each of the five hub landing pages and capture a written note of first-glance visual state:

- `/en/behaviour`
- `/en/pastoral`
- `/en/safeguarding`
- `/en/early-warnings`
- `/en/wellbeing`

For each: does it render, is there a flash/remount, are tile counts populated post-seed, any obvious visual break. This is the smoke-test baseline — deep per-tile checks happen in S1–S7.

## 5. Exit criteria

- [ ] 50 behaviour records seeded in NHQS, verified by a count query
- [ ] Student/household/staff counts meet minimum targets
- [ ] Pastoral + safeguarding + early-warning + staff-wellbeing seed in place
- [ ] `_scope-map.md` written with every wellbeing route as an unchecked checklist
- [ ] Baseline smoke-test note recorded per hub landing page
- [ ] Any issues found during smoke test logged as `W-S0-001…` in `PLAYWRIGHT_LOG.md`
- [ ] All P0/P1/P2 issues from S0 fixed, deployed, verified; P3 either fixed or deferred with reason
- [ ] All screenshots taken during S0 deleted before session close
- [ ] Seed script committed to repo (under `packages/prisma/scripts/`) so the state is reproducible

## 6. Out of scope for S0

- Deep walkthrough of any hub — that's S1–S7
- Log-incident UI flow — that's S1 (S0 seeds behaviour records via script, S1 creates 5 incidents via UI)
- Any fix that isn't for a smoke-test issue — deep fixes happen in the session that owns that surface
