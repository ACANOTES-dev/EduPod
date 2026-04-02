# Pre-Flight Checklist

> **Purpose**: Run through this BEFORE making any code change. It takes 30 seconds and prevents 90% of cross-module breakage.
> **Rule**: This is not optional. Every change, no matter how small, gets a pre-flight.

---

## Before ANY Change

### 1. Scope Check

- [ ] What module(s) does this change touch?
- [ ] Open `architecture/module-blast-radius.md` and check: what other modules depend on the ones I'm touching?
- [ ] If changing a Tier 1 or Tier 2 service interface: full regression required

### 1b. Governance Check

- [ ] Am I taking an architecture, testing, or ops shortcut? -> Write the tradeoff down in `Governance/governance-policy.md` before treating it as accepted
- [ ] Does this touch a critical workflow? -> Confirm code + tests + ops/runbook + docs + rollback/containment are all covered before calling it complete

### 2. Schema Check (if touching Prisma schema or DB)

- [ ] Is this a tenant-scoped table? -> Must have `tenant_id` + RLS policy
- [ ] Am I changing a column that other modules query directly? -> Check the "Cross-Module Prisma Query Map" in blast-radius.md
- [ ] Am I changing a JSONB field? -> Check if it has a Zod schema in shared/ and update both
- [ ] Am I adding a new settings field to `tenant_settings`? -> Must have `.default()` value (DZ-05)
- [ ] Am I changing an enum? -> Check state-machines.md for transition rules that reference it

### 3. State Machine Check (if touching status/lifecycle)

- [ ] Open `architecture/state-machines.md` and verify the transition I'm adding/modifying is documented
- [ ] Does this transition have side effects? (job dispatch, notification, cascade)
- [ ] Is the transition guarded by an explicit map or implicit per-method? If implicit, extra caution.

### 4. Event/Job Check (if touching BullMQ or async flows)

- [ ] Open `architecture/event-job-catalog.md` and verify the job flow I'm modifying
- [ ] Does this job trigger downstream jobs? Trace the full chain.
- [ ] Am I changing a job payload? -> Update ALL consumers (API enqueuer + Worker processor)
- [ ] Am I adding a new approval type? -> Must update `MODE_A_CALLBACKS` + create worker processor

### 5. Danger Zone Check

- [ ] Open `architecture/danger-zones.md` and scan for entries related to my change area
- [ ] If my change area is listed: read the full entry and follow the mitigation

### 5a. Hotspot Review Check (if touching a hotspot module)

- [ ] Am I adding lines to a file tracked in `scripts/hotspot-budgets.json`? -> Check the budget headroom before proceeding
- [ ] Am I adding a new public method to a class that is already at its max-public-methods limit?
- [ ] If touching behaviour/pastoral: is the change in the correct sub-module? -> See `architecture/pr-review-checklist.md` for sub-module boundaries
- [ ] If touching scheduling: am I adding lines to `scheduling-orchestration.service.ts` (964 lines)? -> Check budget
- [ ] If touching finance: does my change respect the invoice/payment/payroll state machines?

---

## After ANY Change

### 6. Architecture Update

- [ ] Did I add a new cross-module dependency? -> Update `module-blast-radius.md`
- [ ] Did I add/modify a BullMQ job? -> Update `event-job-catalog.md`
- [ ] Did I add/modify a status transition? -> Update `state-machines.md`
- [ ] Did I discover a non-obvious coupling? -> Add to `danger-zones.md`
- [ ] Did I add a new module? -> Add to `module-blast-radius.md` with its exports and consumers

### 6a. ADR Required? (see ADR-005)

- [ ] Did I add a new `APP_GUARD` or `APP_INTERCEPTOR`?
- [ ] Did I add a new export to a Tier 1 or Tier 2 module?
- [ ] Did I introduce a first-time import between two modules (A imports B for the first time)?
- [ ] Did I add a `forwardRef()` to resolve a circular dependency?
- [ ] Did I add a table that will be read by 3+ modules?

If YES to any of the above: **write an ADR in `architecture/adrs/` and add it to `architecture/adrs/README.md`** before the PR is merged.

### 7. Regression Test

- [ ] Run `turbo test` for affected packages
- [ ] All pre-existing tests pass
- [ ] If I changed a state machine: transitions and blocked transitions are tested
- [ ] If I changed an RLS-scoped table: RLS leakage test exists

### 8. Risk Closure Check

- [ ] If I am closing a tracked health risk: did I attach regression proof before marking it retired?
- [ ] If I changed a critical workflow: did I document the rollback or containment path in the same change?
