# P2 — Depth And Convergence

> **Objective:** Attack the largest remaining uncovered-line and uncovered-branch clusters so the codebase converges into a genuinely high-coverage state.

---

## 1. Why P2 Exists

After `P1`, the coverage story should no longer be dominated by zero-coverage helpers and visibly weak modules. `P2` is where the hard, high-value recovery happens:

- large orchestration services
- analytics and reporting paths
- state-machine branches
- provider fallback chains
- scheduling and payroll decision trees

This is the heaviest phase by effort.

---

## 2. Primary Focus Areas

### API deep-recovery cohort

- `behaviour`
- `gradebook`
- `pastoral`
- `payroll`
- `reports`
- `scheduling`
- `finance`
- `imports`
- `attendance`
- `communications`
- `schedules`
- `scheduling-runs`
- `policy-engine`
- `pdf-rendering`

### Worker deep-recovery cohort

- `behaviour`
- `early-warning`
- `communications`
- `imports`
- `pastoral`
- `compliance`
- `security`
- `notifications`
- `engagement`
- `payroll`
- `gradebook`
- `wellbeing`

---

## 3. Workstreams

### Workstream A — Large Service Orchestration

- Expand tests around multi-step services with several repository calls, validations, and side effects
- Cover both happy path and all business-rule rejection branches
- Add focused tests for exception mapping, not-found handling, duplicate handling, and permission-denied handling

### Workstream B — State Machines And Decision Trees

- Add table-driven tests for valid transitions, blocked transitions, terminal states, and retry/reopen rules
- Exercise approval, payroll-run, behaviour-case, attendance, and reporting state transitions until branch coverage moves materially

### Workstream C — Analytics And Reporting

- Target analytics services with high branch count and low test depth
- Add scenario matrices for empty datasets, partial datasets, null/optional fields, threshold boundaries, and mixed-status aggregates
- Add PDF/template rendering tests for conditional sections and locale/formatting branches where coverage is still weak

### Workstream D — Time, Scheduling, And Batch Processing

- Add deterministic tests for date boundaries, schedule generation, stale-run cleanup, cron dispatch, and time-window logic
- Ensure DST-sensitive and UTC/local crossover branches are covered wherever applicable

### Workstream E — Worker Processing And Retries

- Expand processor tests around malformed payloads, missing tenant context, provider failures, backoff/retry behaviour, noop branches, and partial-success handling
- Add coverage for utility files that currently sit behind highly-covered processors but are themselves weak

---

## 4. Expected Deliverables

- The biggest uncovered-branch clusters in API and Worker are substantially reduced
- Large orchestration services have dense characterization and negative-path tests
- Analytics/reporting modules stop being branch-coverage laggards
- The repo enters a credible "high coverage" state, not just a patched baseline

---

## 5. Exit Gates

`P2` is complete only when all of the following are true:

- Every API module is at least `90%` `lines`
- Every API module is at least `85%` `branches`
- Every Worker processor group is at least `90%` `lines`
- Every Worker processor group is at least `85%` `branches`
- API global coverage is at least `90%` for `statements`, `functions`, and `lines`
- API global coverage is at least `85%` for `branches`
- Worker global coverage is at least `90%` for `statements`, `functions`, and `lines`
- Worker global coverage is at least `85%` for `branches`
- CI ratchets are still blocking and have been raised to match `P2` baselines

---

## 6. Notes On Strategy

- `P2` should be run module-by-module with a strict "finish the cluster before switching context" rule
- The biggest wins will come from high-branch orchestration files, not from chasing tiny helpers
- If a file is genuinely dead or unreachable, it should be considered for removal in a separate, explicit change rather than papered over with ignore directives
