# Wellbeing Module — End-to-End Playwright Walkthrough

**Status:** Drafted 2026-04-21 · Awaiting kick-off of Session 0
**Owner:** Claude (Opus 4.7) · Driven by: ram.m.duadu@gmail.com
**Tenant under test:** NHQS (`https://nhqs.edupod.app`, tenant ID `3ba9b02c-0339-49b8-8583-a06e05a32ac5`)
**Location:** `E2E/4_wellbeing/new-e2e-testing/`

---

## 1. Why this plan exists

The user wants a ship-gate review of the Wellbeing module — visually and functionally comprehensive, every tile clicked, every rabbit hole chased, no silent fixes. The final report is the artefact they will audit; once they sign off, the module ships without re-audit.

One session cannot produce that quality. This plan splits the work into **ten sequential sessions** (S0 → S9). Sessions run one at a time, kicked off manually by the user.

## 2. Operating principles

1. **Trust but verify.** Every claim in the log must be reproducible from a numbered walkthrough step.
2. **No silent fixes.** Every issue a session finds is logged _before_ being fixed. A session is only complete when every issue it opened is either fixed-and-verified or explicitly deferred with a reason.
3. **Visual fidelity matters.** Screenshots permitted when pixel-level checks are needed (spacing, overlap, RTL glitches, bottom-margin cut-offs). Screenshots are deleted before session close — the log is the source of truth, not the PNGs.
4. **Real data, real flows.** For every major surface, there must be seeded data and at least one UI-driven user flow that exercises it end-to-end.
5. **Reproducibility.** Every bug entry includes: URL, role logged in as, steps, expected vs actual, screenshot-at-time-of-writing (deleted after log is written), and the fix commit SHA.
6. **Blast radius awareness.** Every code fix consults `docs/architecture/module-blast-radius.md` before being applied. Architecture docs updated in the same commit per `.claude/rules/architecture-policing.md`.

## 3. Session catalogue (10 sessions)

> Note: user originally said "nine sessions"; I proposed ten (S0 seeding + S9 consolidation bracket the eight hub sessions). All ten are below; flag if you want S0 or S9 cut or merged.

| ID  | Title                                                                                                                                              | Primary focus                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0  | Seeding + scope map                                                                                                                                | Seed 50 varied behaviour records + any missing students/households/finances; snapshot full wellbeing nav tree                                                                         |
| S1  | Behaviour A — incidents + sanctions + exclusions + appeals                                                                                         | Core disciplinary surface + the "Log Incident" flow (5 UI-driven real-user incidents on top of S0 seed)                                                                               |
| S2  | Behaviour B — recognition + houses + leaderboard + documents + tasks + alerts + amendments + guardian-restrictions + interventions + parent-portal | Remaining behaviour surface except analytics/admin                                                                                                                                    |
| S3  | Behaviour C — analytics + policies + replay + admin + templates + students-index                                                                   | Reporting, configuration, admin surfaces; regression — confirm S0–S2 data surfaces correctly everywhere                                                                               |
| S4  | Pastoral Care                                                                                                                                      | critical-incidents, referrals, cases, SST, DSAR, check-ins, self-referral, import, interventions, concerns                                                                            |
| S5  | Safeguarding                                                                                                                                       | concerns, reviews, sealed, my-reports, break-glass (+ grants + new + detail), SLA                                                                                                     |
| S6  | Early Warning / At-Risk                                                                                                                            | Settings, cohort, intervene; regression — verify seeded + UI-logged data flips students into correct risk tiers                                                                       |
| S7  | Staff Wellbeing                                                                                                                                    | Dashboard, surveys (both list and self-service `survey/`), staff directory, resources, my-workload, settings, reports                                                                 |
| S8  | Cross-cutting                                                                                                                                      | Mobile 375px, RTL (Arabic), role boundaries (teacher / counsellor / admin / parent / student), tenant isolation, permission gating, visual polish sweep (bottom-margin cut-offs etc.) |
| S9  | Consolidation                                                                                                                                      | Merge all session logs into one ship-ready report with severity, reproduction steps, and the prioritised fix list                                                                     |

## 4. Standard checklist applied in every session

Every page every session visits must be checked against this list. Session files don't repeat it — they add page-specific checks on top.

### Visual

- No content touching the browser edge — bottom, right, left, or top margin cut-off
- No horizontal scroll at desktop default widths (1440, 1280)
- Typography follows the redesign spec (Figtree + JetBrains Mono)
- No hardcoded colours where theme tokens should be used (catchable by faded/wrong-mode shades in dark vs light if applicable)
- Spacing/padding consistent between comparable components

### Functional

- Every interactive element reachable by click is clicked at least once in this session
- Every form on the page is submitted at least once (happy path) and at least once with invalid input (error path)
- Every link leads somewhere that renders without error
- Pagination, sorting, filtering (if present) each exercised once
- Empty-state copy renders where expected (zero-record views)
- Loading skeletons render where expected (before data lands)
- Error boundaries — force one failure and verify the UX is humane (toast / inline error / retry)

### i18n

- Session checks English locale primarily; if something visually suspect appears, re-open in Arabic to confirm RTL handling

### Role

- Primary role for the session is the admin/owner (`owner@nhqs.test`); role-boundary testing is concentrated in S8 but if a permission smells off it's logged immediately

### Network

- No 4xx/5xx responses in Playwright's network panel during the walkthrough (excluding expected validation-error 4xx on the error-path tests)
- No unhandled console errors

## 5. Accounts used

| Role          | Email                  | Password       | Purpose                             |
| ------------- | ---------------------- | -------------- | ----------------------------------- |
| Admin / Owner | `owner@nhqs.test`      | `Password123!` | Primary walkthrough role            |
| Teacher       | `Sarah.daly@nhqs.test` | `Password123!` | Teacher-view checks (mostly S8)     |
| Parent        | `parent@nhqs.test`     | `Password123!` | Parent-portal checks (S2, S8)       |
| Student       | `adam.moore@nhqs.test` | `Password123!` | Student self-referral / survey (S7) |

Extra role accounts may be created during S0 if the walkthrough needs counsellor / DSL-specific permissions and NHQS doesn't already have them. Any new accounts are logged in `PLAYWRIGHT_LOG.md` under the S0 entry.

## 6. Issue logging convention

All issues go into `PLAYWRIGHT_LOG.md`. Format per issue:

```
### W-{SESSION}-{NUM} — {Short title}
- **Severity:** P0 (blocker) | P1 (serious) | P2 (notable) | P3 (polish)
- **Route:** /en/behaviour/xxx
- **Role:** owner@nhqs.test
- **Viewport:** 1440×900 | 375×667 | RTL
- **Steps:** 1. ... 2. ... 3. ...
- **Expected:** ...
- **Actual:** ...
- **Evidence:** (screenshot reference while present — deleted before session close)
- **Fix:** {commit SHA + one-line summary} | **Deferred:** {reason}
- **Verified:** YYYY-MM-DD — re-ran steps, now passes
```

### Severity guide

- **P0** — data loss, security leak, tenant isolation break, page crashes, unable to complete core flow
- **P1** — wrong numbers, wrong state machine transition, wrong permissions, persistent visual break
- **P2** — broken sub-flow with workaround, spelling/grammar, minor numeric mismatch, missing empty state
- **P3** — polish, copy tightening, consistent-spacing, icon choice

## 7. Exit criteria per session

A session is complete when **all** of the following are true:

1. All scoped pages have been walked through and checked against §4
2. Every issue found has a `W-{SESSION}-{NUM}` entry in `PLAYWRIGHT_LOG.md`
3. Every P0/P1/P2 entry is either:
   - Fixed, deployed to production, verified via re-walk, and marked **Verified:**, OR
   - Explicitly deferred with a written reason (rare — needs user agreement)
4. Every P3 entry is at minimum fixed in a single consolidated polish commit (or deferred with reason)
5. All screenshots created during the session are deleted
6. Session summary paragraph appended to `PLAYWRIGHT_LOG.md` under that session's heading

## 8. Execution rules

- **Sequential only.** No session is started until the previous one is marked complete per §7.
- **Server access is granted for all sessions.** DB seeding (S0) and production fixes + deploys (any session) are pre-approved.
- **Deploy via rsync + SSH.** Per `feedback_deploy_workflow.md`, never `git push` to deploy.
- **No CI changes** without flagging first.
- **Architecture docs updated when blast radius changes.** Per `.claude/rules/architecture-policing.md`.
- **Production DB protected by the operational-not-destructive rule** in CLAUDE.md — seeding new rows is fine; dropping/truncating existing tables is not.

## 9. Deliverables

At the end of S9, the working directory `E2E/4_wellbeing/new-e2e-testing/` contains:

- `PLAN.md` — this file
- `PLAYWRIGHT_LOG.md` — every issue found across all sessions, all marked Verified or Deferred
- `S0–S9_*.md` — the ten session blueprints (unchanged after drafting; they are plans, not logs)
- `FINAL_REPORT.md` — written in S9; ship-ready gap list with severity ordering

No screenshots, no temp artefacts, no half-finished notes are left behind.

## 10. What's intentionally NOT in scope

- Performance / load testing (covered elsewhere — see `E2E/4_wellbeing/perf/`)
- Worker-only flows not triggered by UI (covered by unit + integration tests, and `E2E/4_wellbeing/worker/`)
- Database migration correctness (assumed green from CI)
- Multi-tenant RLS leakage testing at scale (covered by integration tests; S8 includes a spot-check only)
- Third-party integration mocks (Resend, Hetzner) — assumed green from existing tests
