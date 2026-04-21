# S2 — Behaviour B · Recognition, Houses, Leaderboard, Documents, Tasks, Alerts, Amendments, Guardian-Restrictions, Interventions, Parent-Portal

**Goal:** Walk the positive-behaviour, document-generation, task-routing, and parent-facing surfaces. Every tile, every detail view, every form.

---

## 1. Prerequisites

- S0 + S1 complete and verified
- Seeded data from S0 and five UI-driven incidents from S1 exist in NHQS
- Kind-behaviour incident from S1 (#3) should appear on the Recognition Wall

## 2. Scope

### 2a. Recognition

- `/en/behaviour/recognition` — wall view: does it render the seeded positive incidents + S1 recognition?
- `/en/behaviour/recognition/new` — manual recognition flow: create at least 3 (one per category supported). Verify card layout, RTL rendering if toggled.
- Verify that recognitions show up on the relevant student profiles (student detail view) and feed the leaderboard.

### 2b. Houses

- `/en/behaviour/houses` — list, points totals, members per house
- Drill into each house — verify member list, points breakdown, recent activity feed
- Verify that S0-seeded house-affecting records are all counted (points are not under-/over-attributed)

### 2c. Leaderboard

- `/en/behaviour/leaderboard` — default view
- Every tab / filter (week / month / term / year, by house / by year group / by class) exercised
- Top-3 rendering, tie-break rendering, empty-state (if filter produces zero)
- Numbers must match the sum of the underlying records — spot-check two entries by hand

### 2d. Documents

- `/en/behaviour/documents` — list of generated documents (letters, reports)
- `/en/behaviour/documents/[id]` — open at least 2: PDF / inline rendering, download, resend, archive
- **Generate a document** from one of the S1 incidents (the "Generate document" button mentioned by user). Verify the generated document appears in the list and is downloadable. Check both English and Arabic rendering if the document template supports it.

### 2e. Tasks

- `/en/behaviour/tasks` — task list: assigned-to-me, assigned-by-me, all
- Filters (status, due date, assignee, priority)
- From a detail view of an S1 incident, create a task with a due date and assignee → verify it appears here and on the assignee's view
- Complete a task — verify state machine (open → in-progress → completed)

### 2f. Alerts

- `/en/behaviour/alerts` — list of alerts triggered by pattern detection / escalation rules
- Verify the weapon-related incident from S1 triggered a safeguarding-related alert (if that's the wired behaviour)
- Verify the phone/device-misuse repeat offence triggered a pattern alert
- Dismiss an alert; assign an alert; snooze an alert (whichever actions exist)

### 2g. Amendments

- `/en/behaviour/amendments` — list of requested or applied amendments to prior incidents
- Submit an amendment on an S1 incident (change description, change severity, add evidence). Verify audit trail shows both the original and the amendment.
- Verify only authorised roles can approve amendments (light check — full role pass is S8)

### 2h. Guardian restrictions

- `/en/behaviour/guardian-restrictions` — list of restrictions (one parent restricted from collecting student, etc.)
- Create one restriction (pick an S0 student), set an expiry, attach justification text
- Verify the restriction surfaces on the student detail view and on the parent portal as appropriate

### 2i. Interventions

- `/en/behaviour/interventions` — programme list (restorative conversations, anger-management sessions, etc.)
- `/en/behaviour/interventions/new` — create an intervention linked to one of the S1 high-severity incidents (fighting)
- `/en/behaviour/interventions/[id]` — open: sessions, attendees, progress notes, outcome rating, linked incidents

### 2j. Parent portal (school-staff view)

- `/en/behaviour/parent-portal` — the admin view of what parents see
- `/en/behaviour/parent-portal/appeals` — admin view of appeals the parent can raise
- `/en/behaviour/parent-portal/recognition` — admin view of recognition visible to parents
- `/en/behaviour/parent-portal/documents` — admin view of documents shared to parents

Then log out, log in as `parent@nhqs.test`, and walk the actual parent-facing views. Verify consistency between what admin sees and what the parent actually sees. Anything the admin expected to be visible-to-parent should be visible; anything the admin considered internal should not be visible.

## 3. Standard checklist (from PLAN.md §4)

Apply on every page. Specific things to watch for in S2:

- **Arithmetic correctness** — leaderboard totals, house points, recognition counts. A +/- sign mismatch here (see W-S1 from the category picker) would double-contribute or cancel records.
- **Empty states before/after data** — toggle filters that yield zero rows and confirm the empty state is humane
- **Document templates** — placeholder substitution works, no "{{student_name}}" leaks into the output, date formats are locale-correct
- **Mobile 375px** — parent-portal pages are the most likely to be accessed on mobile; spot-check the parent view at 375px
- **RTL** — parent portal is highly translated; open a key page in Arabic and confirm layout

## 4. Architecture touchpoints

- If any intervention or amendment flow is fixed, update `docs/architecture/state-machines.md`
- If document generation routes via a new BullMQ job or changes an existing one, update `docs/architecture/event-job-catalog.md`
- Guardian restrictions may couple to attendance/dismissal flows — flag any non-obvious coupling in `docs/architecture/danger-zones.md`

## 5. Exit criteria

- [ ] All routes in §2 walked
- [ ] Cross-flow: incident → document generated → parent sees it — exercised end-to-end
- [ ] Parent-portal walked in both admin view and actual parent view
- [ ] `_scope-map.md` ticked for every S2-owned route
- [ ] All S2 issues logged with `W-S2-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S2 heading in the log
