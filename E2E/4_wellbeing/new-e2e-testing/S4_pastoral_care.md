# S4 — Pastoral Care

**Goal:** Walk the pastoral care hub end-to-end. Every tile, every flow. Pastoral is often where cross-module data (health, attendance, behaviour, safeguarding) converges — confirm those joins work.

---

## 1. Prerequisites

- S0–S3 complete and verified
- S0 pastoral seed in place: 5 concerns, 2 critical incidents, 3 referrals, 3 cases, 2 SST cases, 1 DSAR, plus related structural data

## 2. Scope — pages to walk

### 2a. Concerns

- `/en/pastoral/concerns` — list with filters (status, severity, assignee)
- `/en/pastoral/concerns/new` — create 2 concerns with different severities, attach description, link a student, set a follow-up date
- `/en/pastoral/concerns/[id]` — open 3 concerns (one from each severity band). Walk: comment thread, status changes, linked records (incident? attendance? referral?), close the concern

### 2b. Critical incidents

- `/en/pastoral/critical-incidents` — list
- `/en/pastoral/critical-incidents/new` — create a critical incident (mock scenario: medical emergency on premises, or serious bullying escalation). Fill every required field.
- `/en/pastoral/critical-incidents/[id]` — walk the timeline, response log, notifications sent, agencies involved, closure flow

### 2c. Referrals

- `/en/pastoral/referrals` — list with filters by referral type and status
- `/en/pastoral/referrals/new` — create 2 referrals: one internal (to counsellor), one external (to CAMHS or equivalent external service if the taxonomy supports it)
- `/en/pastoral/referrals/[id]` — open and walk: accept / decline, assign, status transitions, outcome recording, close

### 2d. Cases

- `/en/pastoral/cases` — case management list
- `/en/pastoral/cases/new` — open a new case linking a student, assigning a case worker, setting goals
- `/en/pastoral/cases/[id]` — walk: notes, tasks, linked concerns / referrals / incidents, progress milestones, case plan, review dates

### 2e. SST (School Support Team)

- `/en/pastoral/sst` — SST case list and meeting calendar (if applicable)
- `/en/pastoral/sst/[id]` — walk: members, linked student, meeting log, decisions made, outcome tracking

### 2f. DSAR (Data Subject Access Request)

- `/en/pastoral/dsar` — list of in-progress / completed DSAR requests
- `/en/pastoral/dsar/[complianceRequestId]` — walk: request scope, data gathered, review status, output bundle, delivery
- Confirm audit trail is complete — DSAR is legally sensitive

### 2g. Check-ins

- `/en/pastoral/checkins` — overview of check-in rounds
- `/en/pastoral/checkins/flagged` — only the flagged responses. Verify flagging threshold logic is correct.
- Run a check-in cycle if the UX supports: open → assign → capture responses → close

### 2h. Self-referral

- `/en/pastoral/self-referral` — staff view of student self-referrals
- Log out, log in as student (`adam.moore@nhqs.test`), submit a self-referral, log back in as admin and verify it appears
- Open it, triage it, assign it, respond

### 2i. Import

- `/en/pastoral/import` — bulk import flow for pastoral data (e.g., migration from another system)
- Upload a small CSV (3–5 rows), verify parsing, preview, error handling on bad rows, dry-run vs commit modes

### 2j. Interventions

- `/en/pastoral/interventions` — list of pastoral interventions (separate from the behaviour hub's interventions — if they overlap, flag)
- `/en/pastoral/interventions/new` — create one
- `/en/pastoral/interventions/[id]` — walk sessions, attendees, progress, outcome

## 3. Cross-module checks

- Open a pastoral case and verify it links cleanly to: any behaviour incidents involving the same student, attendance patterns, safeguarding concerns, health/medical records. If any of those joins 404 or return blank despite data existing, that's a P1.
- From a concern, escalate to a case — verify the case inherits the concern's history
- From a case, create a referral — verify linkage

## 4. Standard checklist + pastoral-specific

- GDPR / confidentiality copy renders correctly
- Sensitive info is not leaked into logs or audit trails that shouldn't have them
- Role access — teachers should see limited pastoral info; counsellors see more; DSL sees everything. Quick spot-check here, deep check in S8.
- Self-referral flow is sensitive — submission confirmation UX must not expose the submitter's name to other students

## 5. Architecture touchpoints

- Pastoral ↔ Safeguarding overlap — if a pastoral concern auto-promotes to a safeguarding concern under certain triggers, verify the wiring and document in `docs/architecture/event-job-catalog.md` if not already there
- Self-referral notifications → BullMQ job checks

## 6. Exit criteria

- [ ] All routes in §2 walked
- [ ] Cross-module checks in §3 done
- [ ] Student self-referral round-trip walked end-to-end
- [ ] DSAR timeline inspected for audit completeness
- [ ] `_scope-map.md` ticked for every S4-owned route
- [ ] All S4 issues logged with `W-S4-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S4 heading in the log
