# Implementation 23 — Safeguarding Hidden + Recognition Wall + Policy Engine + Admin Repair UI

> **Wave:** 6 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 09, 14, 17
> **Deploys:** Web restart only
>
> **⚠️ HIGHEST IMPACT IMPL.** Surfaces privacy-critical operations (break-glass, sealing, retention, legal holds) and dangerous mass mutations (recompute / rebuild / replay). Run with Ultrathink-grade attention.

---

## Goal

Build the UI for impl 09's surfaces: safeguarding break-glass request + grant list + access log, sealing dual-approval flow, after-action review form. Plus the recognition wall + house leaderboard (flagship per the user). Plus policy engine ops (replay preview/execute, import/export, dry-run). Plus the admin data repair console (recompute / rebuild / reindex / retention / legal-holds).

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add five new namespaces. Apply Rules H8 + H9.
- Multiple new pages under `/safeguarding/*`, `/behaviour/recognition`, `/behaviour/policies`, `/behaviour/admin/*`. Yours.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **MEDIUM-HIGH** (translations + many pages).

## What to build

### 1. Safeguarding break-glass

#### `/safeguarding/break-glass` page

List of grants. Each row: granted_to, scope (all / specific), granted_at, expires_at, after-action review status (filed / overdue / not yet due). Click → detail.

Header CTA: "Request break-glass" — opens a multi-step dialog:

- Step 1: Justification (required, min 100 chars)
- Step 2: Scope picker — radio (all_concerns | specific_concerns); if specific, multi-select from concern list
- Step 3: Duration (default 4 hours, max 24 hours)
- Step 4: Confirm — "I understand my access will be logged and I must file an after-action review within 7 days"

#### `/safeguarding/break-glass/[id]` detail

- Grant metadata
- Access log table (every safeguarding read while grant active)
- After-action review section (form if not filed; rendered review if filed)

### 2. Sealing dual approval

On a safeguarding concern detail page (existing or new), expose:

- "Request seal" button (DSL only) → opens dialog with seal reason; submits, concern transitions to `seal_pending`
- "Approve seal" / "Reject seal" buttons (visible only to a different user with seal-approve permission, while concern is in `seal_pending`)
- "Sealed" badge + audit info once sealed

### 3. Recognition wall + house leaderboard

#### `/behaviour/recognition` (rebuild on impl 02's endpoint)

Tabs: **Wall** / **Leaderboard** / **Houses** / **Pending Approvals**.

- **Wall** — feed of recent positive incidents, big celebratory cards: student photo + name + category + point value + awarded by + brief description. Filterable by year group, category, time range.
- **Leaderboard** — top students by points this term + this year. Plus per-house leaderboard.
- **Houses** — house cards with member count + total points + recent achievements. Admin can edit house membership inline.
- **Pending Approvals** — recognition awards awaiting approval (e.g. major awards requiring head-of-year sign-off). List with approve/reject actions.

Use celebratory visual treatment — confetti accent, gold/bronze podium imagery on leaderboard, distinctive typography. The user has flagged recognition as flagship; let it shine.

### 4. Policy engine ops

#### `/behaviour/policies` (existing settings page; extend)

Add header actions:

- **Test mode** — toggle that lets the admin click a recent incident and see what rules would have matched (calls dry-run endpoint)
- **Export** — button downloads JSON of all rules
- **Import** — button opens dialog with file upload + dry-run toggle + commit button

#### `/behaviour/policies/replay` page (NEW)

- Filter form: incident filter (date range, category, status), rule selector (specific rule or all rules)
- "Preview" button — calls impl 09's preview endpoint, shows would-be effect counts
- "Execute" button — confirm dialog with typed phrase ("replay-yes"), then runs

### 5. Admin data repair console

#### `/behaviour/admin` page (NEW)

Tile grid, one per repair operation. Each tile:

- Operation name + description
- "Preview" button → modal showing would-be effect
- "Execute" button → typed-confirmation modal → runs (background job), then surfaces a polling card showing job progress

Operations: Recompute points, Rebuild awards, Recompute pulse (sync), Backfill tasks, Reindex search, Retention sweep, Legal holds (separate sub-page for hold lifecycle management).

#### `/behaviour/admin/legal-holds` (NEW)

Standard list + create + release flow.

### 6. Translation additions

Five namespaces. Apply Rule H8.

## Tests

- Each page: list + actions
- Break-glass request multi-step dialog flow
- Sealing: same-user approval blocked; different-user approval succeeds
- Recognition: tab switching, leaderboard sort, house edit
- Policy replay: preview vs execute counts match
- Admin repair: typed confirmation enforced
- Legal holds: create + release flow

## Watch out for

- **Typed confirmation phrases must match exactly** — use `disabled` button until exact match. Whitespace and case matter.
- **Sealing UI must prevent same-user dual approval at the UI level too** — even though backend rejects it, don't let the user even see the approve button if they were the requester.
- **Recognition wall photo handling** — students may not have photos. Use initials avatar fallback; never show empty squares.
- **Legal hold release** — confirm dialog must include the hold's reason and date so the user knows what they're releasing.
- **Policy replay scope** — preview must clearly state "this would affect N incidents historically and create N new sanctions". Make the destructive nature unmissable.
- **Admin repair access** — gate every page behind `behaviour.admin` permission. Render permission-denied screen for users without it.

## Deployment notes

- Restart: web only.
- Smoke: each new page renders. Recognition wall shows empty state on NHQS (no positive incidents). Submit a break-glass request as principal, observe it in list. Trigger an admin recompute-pulse (the lowest-risk repair op) and observe the polling card complete.
