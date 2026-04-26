# Implementation 24 — Polish, Multi-Role Playwright Sweep, Mobile Pass, Architecture Docs

> **Wave:** 7 (serial — last impl, runs alone after Wave 6)
> **Classification:** polish
> **Depends on:** all of 10–23
> **Deploys:** API + worker + web restart (full smoke pass)

---

## Goal

Final pass before declaring the wellbeing module complete. Run an exhaustive Playwright walkthrough across all four seeded role accounts (admin/owner, principal, teacher, parent), verify mobile responsiveness on every new page, smoke-test all 245 backend endpoints, polish any visible rough edges discovered during the sweep, and update the five architecture documents that own cross-module knowledge: `feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`, `danger-zones.md`.

This impl is the user's **manual sign-off prep** — package the test report so the user can do their own walkthrough efficiently.

## Shared files this impl touches

- `docs/architecture/feature-map.md`
- `docs/architecture/module-blast-radius.md`
- `docs/architecture/event-job-catalog.md`
- `docs/architecture/state-machines.md`
- `docs/architecture/danger-zones.md`
- Possibly `apps/web/messages/en.json` + `ar.json` for any final string polish discovered during the sweep
- Possibly any page file for tiny UI fixes discovered during the mobile pass
- `IMPLEMENTATION_LOG.md` — final completion record

Hot-zone severity: **none** — Wave 7 runs after all other impls complete; no concurrent siblings.

## What to build

### 1. Multi-role Playwright walkthrough

Use the seeded accounts (per `reference_test_accounts.md` memory):

- **Owner / Principal** — `owner@nhqs.test` / `Password123!` (Yusuf Rahman, school_owner + school_principal roles)
- **Teacher** — `Sarah.daly@nhqs.test` / `Password123!`
- **Parent** — `parent@nhqs.test` / `Password123!`
- **Student** — `adam.moore@nhqs.test` / `Password123!`

For each role, walk every wellbeing surface:

1. Morph-bar Wellbeing pill → `/wellbeing` super-hub renders
2. Each visible hub tile clicks through to its destination
3. Each sub-hub renders with appropriate KPI counts, no toasts, no console errors
4. Each hidden-feature surface (AI parse modal, document generation, exclusion workflow, etc.) is invokable for roles that should access it, hidden for roles that shouldn't
5. Navigation back to `/wellbeing` works via morph bar

Capture findings in a `wellbeing_new/test-report.md` file:

- Per-role per-page status (pass / fail / cosmetic issue)
- Console errors observed
- Permission filtering observed
- Mobile viewport (375px) observations

### 2. Endpoint smoke test

Use the dashboard-summary endpoint (impl 03) as the integration anchor. Then iterate the 245+ wellbeing endpoint list (`grep -rn "@Controller\|@Get\|@Post\|@Patch\|@Delete" apps/api/src/modules/{behaviour,pastoral,safeguarding,early-warning,staff-wellbeing,wellbeing-aggregate,ai-flags,wellbeing-notifications}/`). For each endpoint, confirm:

- Returns expected HTTP status for an authenticated valid request
- Returns 401 for unauthenticated
- Returns 403 for permission-denied roles
- Returns documented error code shape on bad input

Generate a coverage matrix in `wellbeing_new/endpoint-coverage.md`. Any endpoint that returns 500 or doesn't follow the structured `{ code, message }` error pattern is a blocker — fix in this impl as a follow-up commit before signing off.

### 3. Mobile responsive pass

Open each new and rewritten page at 375px viewport width. Verify:

- No horizontal scroll
- KPI strips collapse to 2-column or 1-column appropriately
- Hub tiles stack to single column
- Forms remain usable; touch targets ≥ 44×44px
- No fixed-pixel overflows
- Tables scroll horizontally instead of overflowing

For each issue found, fix in this impl (small CSS tweaks; do not re-architect).

### 4. Architecture doc updates

#### `feature-map.md`

Add entries for every new endpoint, page, and module added in Waves 1–6. Update counts in the Quick Reference table. Update the "Last verified" date. Per `feature-map-maintenance.md` rule, this update is the final feature-map change — flag to the user that the feature map is now current.

#### `module-blast-radius.md`

Add entries for the new modules: `wellbeing-aggregate`, `ai-flags`, `wellbeing-notifications`. Document their exports and consumers. Update existing module entries (behaviour, pastoral, safeguarding, early-warning, staff-wellbeing) where this rebuild added new exports.

#### `event-job-catalog.md`

Add the new BullMQ jobs/processors introduced in Waves 3, 6: `behaviour:document-render`, `behaviour:document-send`, `behaviour:exclusion-deadline-check`, `behaviour:ack-reminders`, any new pastoral processors. Document trigger conditions, payloads, side effects.

#### `state-machines.md`

Verify the document state machine is fully documented (`generating → draft_doc → finalised → sent_doc`). The other state machines (incident, sanction, intervention, appeal, exclusion, task, safeguarding, pastoral case, etc.) are pre-existing — verify the existing entries still match the canonical source-of-truth in `packages/shared/src/behaviour/state-machine*.ts` and `packages/shared/src/pastoral/case-state-machine.ts`.

#### `danger-zones.md`

Add new entries:

- **AI flag disable suspends features tenant-wide** — describe the user-impact (e.g. mid-conversation NL queries fail with 403 if flag flipped) and mitigation (warn admins on disable; no in-flight requests get killed)
- **Sealing is irreversible** — document the safeguard
- **Break-glass access logging is the audit trail; deleting access_log rows breaks the audit chain** — document the constraint
- **Admin repair operations are dangerous** — list each (recompute-points, rebuild-awards, retention/execute, replay) with its blast radius and recovery procedure
- **Wave 4 hardening rules persist beyond this rebuild** — link to `IMPLEMENTATION_LOG.md` §2b for future frontend rebuilds

### 5. Final translation sweep

Re-grep for any `MISSING_MESSAGE` errors in the production console. For each, add the missing key to both locale files in a final translation commit.

### 6. Sign-off package

Create `wellbeing_new/SIGN_OFF.md` summarising:

- Total commits across the rebuild
- All 24 impls completed dates
- Test report excerpt (pass/fail counts)
- Endpoint coverage matrix excerpt
- Mobile pass findings + fixes
- Architecture doc updates summary
- "Ready for user manual sign-off" statement

Email-style summary the user can read in 5 minutes to decide whether to mark the rebuild complete.

## Tests

- This impl is the test sweep itself; the deliverable is the test report.
- Run `pnpm turbo run test --filter=...` across all affected packages and confirm zero failures.
- Run `pnpm turbo run type-check` and confirm zero errors.
- Run `pnpm turbo run lint` and fix any issues introduced during the rebuild.

## Watch out for

- **Mobile pass cosmetic-only** — if a page needs structural rework on mobile, file a follow-up. Don't re-architect inside the polish impl.
- **Endpoint coverage matrix must be honest** — any endpoint that's still 500-ing or returning the wrong shape is a blocker for sign-off; communicate clearly.
- **Doc updates** — keep the existing tone of each doc. Don't introduce a new format. Append-only edits where possible.
- **The user has final sign-off** — this impl prepares the package; it does NOT declare the rebuild complete on the user's behalf. Final word is theirs.

## Deployment notes

- Restart: API + worker + web (full smoke pass after restart).
- Smoke: every endpoint in the coverage matrix returns expected status. Every page in the test report renders cleanly. Console clean. Mobile views usable.
- Final commit message: `polish(wellbeing): complete wellbeing rebuild — Wave 7 sign-off`.
