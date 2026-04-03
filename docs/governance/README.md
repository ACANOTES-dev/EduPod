# Governance

> Last updated: 2026-04-01

This directory is the visible, version-controlled home for the operating rules that keep codebase health visible and enforceable between audits.

## Primary documents

- [recovery-backlog.md](./recovery-backlog.md)
  - tracked backlog converted from the 2026-04-01 audit risk ledger
  - owners, due dates, retirement plans, and evidence rules live here
- [governance-policy.md](./governance-policy.md)
  - written-tradeoff rule
  - risk-retirement standard
  - critical-workflow completeness rule
- [review-cadence.md](./review-cadence.md)
  - weekly health review agenda, outputs, and exit condition
- [scorecard-metrics.md](./scorecard-metrics.md)
  - KPI definitions, evidence sources, and current baselines or evidence gaps
- [re-audit-checkpoints.md](./re-audit-checkpoints.md)
  - Wave 1, Wave 3, and final re-audit triggers plus required outputs
- [monthly-scorecards/2026-04.md](./monthly-scorecards/2026-04.md)
  - first monthly scorecard update grounded in audit evidence and local baseline verification

## Adjacent repo sources of truth

- [docs/plans/HEALTH-RECOVERY-MASTERPLAN.md](../plans/HEALTH-RECOVERY-MASTERPLAN.md)
  - wave model, scorecard dimensions, and target posture
- [docs/roadmap/README.md](../roadmap/README.md)
  - roadmap gating and reserved delivery-capacity rule
- [docs/architecture/](../architecture/)
  - blast radius, event/job catalog, state machines, danger zones, and pre-flight checklist
- [docs/runbooks/](../runbooks/)
  - operational procedures that must stay aligned with health fixes

## Rule of use

- update these docs in the same change that changes the governing reality
- do not mark a health risk retired unless the backlog and any affected adjacent docs agree
- treat this folder as the human-readable control plane for audit follow-through
