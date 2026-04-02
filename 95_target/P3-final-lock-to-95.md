# P3 — Final Lock To 95

> **Objective:** Close the last gaps, especially branch-heavy edge cases in already-strong modules, then enforce `95%+` as a hard release standard.

---

## 1. Why P3 Exists

The last stretch to `95%+ everywhere` is slow because the remaining gaps are usually:

- obscure negative paths
- defensive guard clauses
- rare fallback branches
- error translation branches
- formatting or locale branches
- retry ceilings and terminal-failure paths

By `P3`, most line coverage should already be healthy. The work becomes precision branch closure and permanent gate hardening.

---

## 2. Primary Focus Areas

### API final-closure cohort

- `homework`
- `child-protection`
- `regulatory`
- `engagement`
- `early-warning`
- `staff-wellbeing`
- `sen`
- `communications`
- `scheduling-runs`
- `students`
- `pdf-rendering`
- Any remaining `behaviour`, `gradebook`, `pastoral`, `finance`, `reports`, or `scheduling` branch hotspots that survived `P2`

### Worker final-closure cohort

- `regulatory`
- `homework`
- `finance`
- `monitoring`
- `scheduling`
- `payroll`
- `gradebook`
- `wellbeing`
- `engagement`
- `attendance`
- `approvals`
- Any remaining weak branch clusters from `behaviour`, `early-warning`, `communications`, `imports`, `pastoral`, `security`, or `compliance`

---

## 3. Workstreams

### Workstream A — Branch-Only Gap Closure

- Use coverage reports to identify the exact unexecuted branch conditions
- Add highly targeted tests for each remaining branch family
- Prioritize branches with high fanout first, because one missing condition can affect many rows

### Workstream B — Rare And Defensive Paths

- Exercise bad input, optional-null input, duplicate input, impossible state, empty set, exhausted retry, and provider-fallback paths
- Cover permission and guard-denial branches that are easy to miss in line-focused suites

### Workstream C — Coverage Gate Hardening

- Raise Jest global thresholds for API and Worker to `95`
- Make module and processor-group coverage checks blocking in CI
- Make changed-file coverage regression checks blocking in CI
- Remove temporary allowances introduced earlier in the program

### Workstream D — Final Validation

- Run full `turbo lint`
- Run full `turbo type-check`
- Run full `turbo test`
- Run API integration and e2e suites
- Regenerate final coverage artifacts and verify every reported percentage is `>=95`

---

## 4. Expected Deliverables

- The final coverage dashboard shows `95%+` in every reported percentage slot
- CI rejects any change that would pull package, module, or processor-group coverage back under target
- The repo has a durable coverage operating model rather than a one-time sprint artifact

---

## 5. Exit Gates

`P3` is complete only when all of the following are true:

- API global `statements`, `branches`, `functions`, and `lines` are all `>=95%`
- Worker global `statements`, `branches`, `functions`, and `lines` are all `>=95%`
- Every API module coverage row is `>=95%` for `lines`
- Every API module coverage row is `>=95%` for `branches`
- Every Worker processor-group coverage row is `>=95%` for `lines`
- Every Worker processor-group coverage row is `>=95%` for `branches`
- No temporary coverage waivers remain
- CI blocks any regression against the `95%` standard

---

## 6. Definition Of Done

By the end of `P3`, the phrase **"95% everywhere"** must be literally true for the metrics currently used in the coverage reports. If even one reported percentage remains below `95%`, `P3` is not done.
