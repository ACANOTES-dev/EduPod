# Roadmap Execution Policy

> Last updated: 2026-04-01
> Governing inputs: [Plans/HEALTH-RECOVERY-MASTERPLAN.md](../Plans/HEALTH-RECOVERY-MASTERPLAN.md), [Plans/health-governance/recovery-backlog.md](../Plans/health-governance/recovery-backlog.md), [Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md](../Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md)

The roadmap remains the sequencing plan for feature work, but it is now subordinate to the health recovery backlog until the platform exits the current high-risk band.

## Ordering rule

- Health recovery work outranks roadmap expansion work while any `NOW` item remains open in the tracked recovery backlog.
- `NEXT` health work outranks net-new roadmap implementation once all `NOW` items are closed, unless a live-site incident or a founder-approved contractual obligation requires a detour.
- Roadmap discovery, clarification, and documentation are allowed while the health backlog is active, but implementation work must respect the execution gate below.

## Delivery-capacity reservation

Reserve a fixed minimum of `40%` of delivery capacity for health work until both conditions are true:

1. the health backlog has no open `NOW` or `NEXT` items
2. the final independent re-audit has confirmed the target band

Practical default for a solo-founder week:

- first two build sessions each week go to health work
- feature work can use the remaining sessions only after the health allocation is protected

## Expansion execution gate

Major roadmap expansion work is blocked until the combined health recovery plan has cleared Phases `A` and `B`.

Blocked implementation work includes:

- Phase 1 expansion delivery work
- Phase 2 UI revamp execution
- Phase 3 mobile-app implementation

Allowed while the gate is active:

- health backlog work
- critical production bug fixes
- compliance or contractual fixes that cannot wait
- roadmap planning, specs, and architecture notes that do not create new runtime surface

## Current release order

1. Close combined health recovery plan Phase `A`
2. Close combined health recovery plan Phase `B`
3. Reconfirm baseline gates and publish a health scorecard update
4. Resume roadmap implementation in the existing order:
   - Phase 1 / Expansion A
   - Phase 1 / Expansion B
   - Phase 1 / Expansion C
   - Phase 1 / Expansion D
   - Phase 1 / Expansion E
   - Phase 2
   - Phase 3

## Decision record rule

If roadmap work is allowed ahead of the health backlog, the decision must record:

- why the work could not wait
- which backlog items were displaced
- how the lost health capacity will be repaid
