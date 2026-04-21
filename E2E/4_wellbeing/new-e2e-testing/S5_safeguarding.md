# S5 — Safeguarding

**Goal:** Walk the safeguarding hub. Safeguarding has the highest legal and privacy stakes of the entire wellbeing module — RLS leakage, role mis-permission, audit gaps, or exposed sealed content are all P0.

---

## 1. Prerequisites

- S0–S4 complete and verified
- S0 safeguarding seed in place: 4 concerns (mix of severities, at least one sealed), 1 break-glass grant record, 2 reviews due
- At least one DSL role exists in NHQS (seeded in S0 if it didn't already)

## 2. Scope — pages to walk

### 2a. Concerns

- `/en/safeguarding/concerns` — list view
- `/en/safeguarding/concerns/new` — create 3 safeguarding concerns spanning: low-risk observation, medium-severity, high-severity with chronic indicators. For one, link it to a pastoral case from S4 to exercise the join.
- `/en/safeguarding/concerns/[id]` — open each: timeline, chronology narrative, linked students, linked pastoral records, linked behaviour incidents, attached documents / evidence, decision log, agency notifications, closure flow

### 2b. Reviews

- `/en/safeguarding/reviews` — list of upcoming / overdue / completed reviews
- Open a due review, walk the review form, add attendees, capture outcomes, schedule next review, close
- Verify closed reviews are read-only

### 2c. Sealed

- `/en/safeguarding/sealed` — sealed-record listing
- **Critical**: as a regular admin, can I see sealed content I shouldn't? Log as admin (non-DSL) and try. Expected: listing visible, content not visible. Actual?
- Seal an existing concern (the high-severity one from §2a) — verify it moves to sealed and is redacted from non-DSL views
- Unseal (if the action exists for DSL) — verify content returns

### 2d. My reports

- `/en/safeguarding/my-reports` — reports authored by the current user
- Submit a new concern as admin, check that it shows here. Log as a different user and verify it does NOT show in their my-reports list.

### 2e. Break-glass

- `/en/safeguarding/break-glass` — list of grants
- `/en/safeguarding/break-glass/new` — request a break-glass grant (emergency access). Fill in justification, target record, expiry.
- `/en/safeguarding/break-glass/grants` — pending approvals (if a separate approval step exists)
- `/en/safeguarding/break-glass/[id]` — walk grant detail: approve, revoke, audit trail
- **Critical**: grants must expire. Confirm the expiry logic works (either wait — no — or inspect the underlying job scheduling / DB column to confirm the expiry will fire)

### 2f. SLA

- `/en/safeguarding/sla` — SLA dashboard for safeguarding response times
- Verify the metrics match the seeded concern timestamps (spot-check one)
- Verify overdue / at-risk highlighting
- Every drill-down exercised

## 3. Cross-module checks

- From a safeguarding concern, link to a pastoral case → verify the pastoral case also shows the safeguarding link (no one-way visibility)
- Behaviour incident with safeguarding flag (the weapon-related incident from S1) — verify it shows up here
- Attendance patterns of chronic absence — does the safeguarding concern detail surface them?

## 4. Standard checklist + safeguarding-specific

- **Audit log completeness** — every view of a safeguarding record should be logged. Open a concern as admin, then query the audit log; verify a "view" entry exists.
- **Seal integrity** — non-DSL admin cannot see content of sealed records under any path (list, search, analytics, export). Spot-check search behaviour — sealed content must not leak into global search previews.
- **Break-glass audit** — every grant usage is logged with actor, target, timestamp, justification
- **Notification routing** — when a safeguarding concern is raised, the DSL is notified. Verify this fires.
- **RLS leakage** — spot-check: log in as a stress-a tenant user. Do we see any NHQS safeguarding records? Expected: absolutely not.

## 5. Architecture touchpoints

- Sealing / break-glass involves ACL overrides → must be documented in `docs/architecture/danger-zones.md` if any non-obvious mechanic is discovered
- DSL notification path → confirmed in `docs/architecture/event-job-catalog.md`

## 6. Exit criteria

- [ ] All routes in §2 walked
- [ ] Sealed-record access check passed (non-DSL cannot see content)
- [ ] Break-glass round-trip (request → approve → use → audit) walked
- [ ] SLA metrics spot-checked against underlying data
- [ ] Cross-module joins in §3 verified
- [ ] RLS leakage spot-check done
- [ ] `_scope-map.md` ticked for every S5-owned route
- [ ] All S5 issues logged with `W-S5-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S5 heading in the log
