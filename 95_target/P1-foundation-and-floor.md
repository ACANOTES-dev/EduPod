# P1 — Foundation And Floor

> **Objective:** Install the measurement and enforcement foundation, cover untested infrastructure, and lift every measured area out of the weak zone.

---

## 1. Why P1 Exists

Without `P1`, any later push toward `95%` will be fragile. The program first needs:

- consistent reporting
- a ratchet that stops backsliding
- shared test harnesses for recurring patterns
- coverage on core infrastructure and low-floor modules that are currently dragging the baseline down

---

## 2. Primary Focus Areas

### API floor-raising cohort

- `school-closures`
- `sequence`
- `tenants`
- `registration`
- `payroll`
- `imports`
- `behaviour`
- `attendance`
- `search`
- `reports`
- `policy-engine`
- `scheduling`
- `finance`
- `apps/api/src/common/*` low-coverage guards, filters, pipes, helpers, and middleware

### Worker floor-raising cohort

- `security`
- `imports`
- `communications`
- `compliance`
- `early-warning`
- `cron`
- `health`
- `base`
- `_bootstrap`

---

## 3. Workstreams

### Workstream A — Reporting And Ratchet

- Create a single repeatable reporting command for API modules and Worker processor groups
- Store phase baselines so each phase has explicit numeric gates
- Add a changed-file coverage ratchet so touched files must not regress
- Upgrade the current warning-only coverage gate into a blocking gate by the end of `P1`
- Publish CI artifacts for package-global, module, and processor-group coverage

### Workstream B — Shared Test Harnesses

- Build reusable helpers for Nest testing modules, Prisma mocks, RLS transaction setup, BullMQ job execution, and external-provider fakes
- Standardize factories for tenant-scoped fixtures and error-path fixtures
- Add table-driven helpers for state transitions, rejected transitions, and provider fallback scenarios

### Workstream C — API Infrastructure Coverage

- Cover `auth.guard`, `module-enabled.guard`, low-coverage decorators, exception filters, logger service, pipes, and request-context helpers
- Add direct tests for guard rejection paths, missing metadata, malformed request context, and fallback behaviours
- Ensure common infrastructure branches are exercised, because these branches distort global coverage when left untested

### Workstream D — Weak API Modules

- Raise the weakest modules first: `school-closures`, `sequence`, `tenants`, `registration`, `payroll`, `imports`
- Add characterization tests for service orchestration before deeper refactoring
- Cover negative paths, missing-record paths, invalid transition paths, duplicate detection, optional-field paths, and side-effect fanout
- For `behaviour`, start with the largest low-coverage services and helper files rather than trying to close the whole module in one pass

### Workstream E — Weak Worker Groups

- Add tests for `cron-scheduler.service`, `worker-health.service`, `worker-health.controller`, and untested base/bootstrap helpers
- Raise `security`, `imports`, `communications`, `compliance`, and `early-warning` to a stable floor
- Exercise retry paths, guard clauses, empty payloads, invalid payloads, noop branches, and provider failures

---

## 4. Expected Deliverables

- Coverage reporting for API modules and Worker processor groups is deterministic and easy to run locally
- Shared test harnesses exist for the common RLS, BullMQ, provider, and time-control patterns
- No untested core infra remains in the API common layer or Worker bootstrap/health/cron layer
- All weak modules and groups are moved into a stable middle band

---

## 5. Exit Gates

`P1` is complete only when all of the following are true:

- Every API module is at least `80%` `lines`
- Every API module is at least `70%` `branches`
- Every Worker processor group is at least `80%` `lines`
- Every Worker processor group is at least `70%` `branches`
- API global coverage is at least `85%` for `statements`, `functions`, and `lines`
- API global coverage is at least `70%` for `branches`
- Worker global coverage is at least `85%` for `statements`, `functions`, and `lines`
- Worker global coverage is at least `70%` for `branches`
- Coverage regression checks are blocking in CI for touched files and package-global baselines

---

## 6. What P1 Deliberately Does Not Require

- It does not require `95%` yet
- It does not require every high-line module to close all branch debt
- It does not require deep polish in already-healthy modules unless they are touched by shared harness work

The point of `P1` is to build traction and remove the worst drag on the program.
