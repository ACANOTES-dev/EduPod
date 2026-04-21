# S1 — Behaviour A · Incidents + Sanctions + Exclusions + Appeals

**Goal:** Walk the disciplinary spine of the behaviour hub. Log five real-user incidents via the UI. Chase every rabbit hole from every tile under this scope.

---

## 1. Prerequisites

- S0 complete and verified — 50 seeded behaviour records, populated students/households, scope map written
- NHQS reachable; admin login working
- `PLAYWRIGHT_LOG.md` has S0 issues resolved

## 2. Scope — pages to walk

All routes below are walked with the browser; every tile clicked; every detail view opened; every form submitted at least once; every filter/sort/search exercised.

### 2a. Incidents

- `/en/behaviour/incidents` — list view, filters, sorts, pagination, search
- `/en/behaviour/incidents/new` — **5 incidents logged via this flow by "a real user"** (see §3a)
- `/en/behaviour/incidents/[id]` — open at least 6 detail pages (one from each S0 category bucket)
  - Every button on the detail page is clicked: edit, append comment, attach evidence, apply sanction, escalate, mark-resolved, share-with-parent, generate-document, add-to-pattern, …whatever exists
  - Every sub-tab is visited
  - Audit log entries are inspected — are they coherent and complete

### 2b. Sanctions

- `/en/behaviour/sanctions` — list + filters (open, served, scheduled, overdue)
- `/en/behaviour/sanctions/today` — today's detention/isolation/etc. roll-call
- `/en/behaviour/sanctions/new` — create one of each sanction type manually (detention, lunchtime detention, isolation, community service, SLT referral, parent meeting — whatever the taxonomy supports). Submit the form for each. Verify record appears in the list and in `sanctions/today` when scheduled for today.

### 2c. Exclusions

- `/en/behaviour/exclusions` — list + filters (fixed-term, permanent, pending, appealed)
- `/en/behaviour/exclusions/new` — create two exclusions: one fixed-term (3 days) and one permanent-pending. Exercise the pre-submission warning / confirmation UX if present.
- `/en/behaviour/exclusions/[id]` — open both: verify timeline, notices to parent, notification to LA (if wired), linked appeal creation

### 2d. Appeals

- `/en/behaviour/appeals` — list + filters (open, upheld, overturned, withdrawn)
- `/en/behaviour/appeals/[id]` — open at least 2: verify the appeal flow (submit response, schedule hearing, record decision, link back to exclusion / sanction)
- From an exclusion detail page, file an appeal on behalf of a parent — chase this cross-flow all the way through

## 3. User-flow prescriptions

### 3a. The five UI-driven incidents (required)

Each must be logged through `/en/behaviour/incidents/new` as if by a real user. Write real descriptions, apply real sanctions where appropriate, and fill **every** optional field at least once across the five. Distribution:

1. **Lateness** — Student A, morning line, 12 minutes late. Teacher reporter. No sanction at report time; add a detention via the incident detail page afterwards.
2. **Fighting** — Student B + Student C involved (link both to the same incident). High severity. Attach a short "evidence" note. Issue an immediate internal-exclusion sanction via the incident flow. Notify parents.
3. **Kindness (positive)** — Student D helped a classmate who had fallen in the playground. Recognition issued; record is visible on the Recognition Wall (verification happens in S2, but check S1 endpoint).
4. **Weapon-related concern** — Student E allegedly brought a pocket-knife. Report it and verify the flow correctly escalates (DSL auto-notified? safeguarding concern auto-created? exclusion pending? confirm what the spec says vs what happens).
5. **Phone / device misuse** — Student F, third offence. Verify that "repeat offence" pattern detection fires (banner, tag, linked related incidents list).

For each: capture the incident ID and drop it in the S1 log entry. After all five are logged, return to the list and confirm they are visible, sortable, filterable, and countable in the top-of-page stat cards.

### 3b. The "negative points = +points" flag

User explicitly called this out: the `/en/behaviour/incidents/new` category picker shows negative categories (fighting, weapons) as `+5 points` and positive categories (kindness, effort) also as `+X points`. **Verify visually, log as `W-S1-XXX` with P1 severity, then propose a fix:** negative categories should subtract or display as red with a minus sign; the scoring model needs to be consistent. Fix, deploy, re-verify.

### 3c. Cross-flow: incident → sanction → appeal

Pick one of the five UI incidents. From the incident detail page, issue a sanction. From the sanction, (if the UX allows) file an appeal. Chase the appeal to resolution. Confirm every list view along the way reflects the latest state.

## 4. Role spot-checks (kept light here; S8 is the dedicated role pass)

- After logging incident #2 as admin, log out, log in as teacher (`Sarah.daly@nhqs.test`), and verify the teacher's view of the same incident. Permissions correct? Edit options correct?
- After any parent-facing notifications fire from incident #2 or #4, log in as parent (`parent@nhqs.test`) and verify the parent portal shows the record.

## 5. Standard checklist

Apply §4 of `PLAN.md` on every page visited. Specifically watch for:

- **Bottom-margin cut-off** (user's called-out visual bug)
- Broken empty states once data is non-empty
- Stats-card numbers that don't match the list below them
- State machine violations (can't transition backwards, can't skip required states)

## 6. Architecture touchpoints

If fixes touch:

- `behaviour_incidents`, `behaviour_sanctions`, `behaviour_exclusions`, `behaviour_appeals` schemas → update `docs/architecture/state-machines.md`
- Any BullMQ job (notification fan-out, pattern detector, parent alert) → update `docs/architecture/event-job-catalog.md`
- Category scoring logic changes → flag in `docs/architecture/danger-zones.md` if the fix reveals hidden coupling to analytics

## 7. Exit criteria

- [ ] All listed routes walked
- [ ] 5 UI-driven incidents created and verified in list views
- [ ] Incident → sanction → appeal cross-flow walked end to end
- [ ] Role spot-checks done (teacher, parent)
- [ ] `_scope-map.md` ticked for every S1-owned route
- [ ] All S1 issues logged in `PLAYWRIGHT_LOG.md` with `W-S1-NNN` IDs
- [ ] All P0/P1/P2 issues fixed, deployed, re-verified; P3 fixed or deferred with reason
- [ ] Screenshots deleted
- [ ] Session summary written under S1 heading in the log
