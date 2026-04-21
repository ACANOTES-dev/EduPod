# S7 — Staff Wellbeing

**Goal:** Walk the staff-wellbeing hub (the `/en/wellbeing` routes — confusingly named the same as the parent module, but actually the staff-focused hub). Survey admin, staff directory, resources, workload, dashboard, reports.

---

## 1. Prerequisites

- S0–S6 complete and verified
- Staff-wellbeing seed in place: 1 active survey with ≥5 responses, 1 closed survey with ≥15 responses, resource entries

## 2. Scope — pages to walk

### 2a. Dashboard

- `/en/wellbeing/dashboard` — staff wellbeing dashboard: aggregate response rates, sentiment, risk indicators
- Every chart spot-checked against underlying survey responses
- Every filter exercised
- Drill-downs into specific metrics

### 2b. Surveys (admin list)

- `/en/wellbeing/surveys` — list of surveys
- `/en/wellbeing/surveys/[id]` — open the active survey: question bank, response rate, anonymisation rules, close flow
- Open the closed survey: results, aggregate charts, export options
- Create a new survey (if admin UX supports it) — template, questions, target audience, launch
- If no admin create UI exists, verify via the seed / DB that survey creation flows through a different admin surface (if so, flag as a P2 — UX gap)

### 2c. Survey (self-service)

- `/en/wellbeing/survey` — the staff member's own survey response entry point
- Log out, log in as teacher (`Sarah.daly@nhqs.test`), submit a response to the active survey
- Verify anonymisation: the admin cannot see who responded (unless the survey is explicitly non-anonymous)
- Verify the response is counted in the dashboard

### 2d. Staff directory

- `/en/wellbeing/staff` — list of staff with wellbeing-relevant info (workload, absence patterns, support flags)
- Drill into a staff detail — verify the joined info (HR + attendance + wellbeing history) renders correctly
- Privacy check: only authorised roles should see individual staff wellbeing data

### 2e. My workload

- `/en/wellbeing/my-workload` — the current user's own workload view (timetable load, meetings, marking backlog, etc.)
- Log in as teacher → see their workload
- Log in as admin → see their workload (or empty state if not applicable)
- Verify the data joins cleanly from timetabling / HR / assignments

### 2f. Resources

- `/en/wellbeing/resources` — curated resource library (articles, videos, contact info for support services)
- Click through to at least 3 resources; verify links resolve and aren't broken
- If admin can curate: create a resource, edit one, archive one

### 2g. Reports

- `/en/wellbeing/reports` — reporting outputs
- Generate a report (if the UX supports); verify download / inline view
- Every report template exercised

### 2h. Settings

- `/en/wellbeing/settings` — module settings
- Every setting read; edit and save one; revert

## 3. Cross-role checks

This hub is most informative across roles — do each briefly:

| Role    | Expected access                                                   |
| ------- | ----------------------------------------------------------------- |
| Admin   | Full — all staff data, all surveys, all settings                  |
| Teacher | Own workload, own survey responses, resources, limited staff data |
| Parent  | Should not see this hub at all                                    |
| Student | Should not see this hub at all                                    |

Spot-check each role; log violations as P0 or P1 depending on severity.

## 4. Standard checklist + staff-wellbeing-specific

- **Anonymisation** is the top thing to verify here. If a "anonymous" survey leaks respondent identity anywhere (admin detail, export, audit log), that's P0.
- **Sensitive copy** — wording around staff support services must be warm and accurate; double-check translations
- **Empty states** — new hires with no historical data; surveys with zero responses yet

## 5. Architecture touchpoints

- Anonymisation transform → document its exact boundary in `docs/architecture/danger-zones.md` (this is a classic leakage spot)
- Survey response workflow → verify the BullMQ job flow matches `docs/architecture/event-job-catalog.md`

## 6. Exit criteria

- [ ] All routes in §2 walked
- [ ] Anonymisation integrity verified
- [ ] Cross-role checks in §3 done
- [ ] Survey response round-trip (as teacher) walked
- [ ] `_scope-map.md` ticked for every S7-owned route
- [ ] All S7 issues logged with `W-S7-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S7 heading in the log
