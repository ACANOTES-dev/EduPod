# Health Governance

The canonical repo home for health-governance rules is `docs/governance/`.

Before closing health-related work, open these files as needed:

1. `docs/governance/README.md` for the control-plane index
2. `docs/governance/recovery-backlog.md` for tracked risks, owners, due dates, and retirement evidence
3. `docs/governance/governance-policy.md` for written tradeoffs, retirement rules, and critical-workflow completeness
4. `docs/governance/review-cadence.md` for the weekly health review rhythm
5. `docs/governance/scorecard-metrics.md` and `docs/governance/monthly-scorecards/` for the KPI registry and published scorecards
6. `docs/governance/re-audit-checkpoints.md` for Wave 1, Wave 3, and final independent re-audit gates

Treat `.claude/rules/health-governance.md` as the loader and `docs/governance/` as the source of truth. If the governing reality changes, update the file in `docs/governance/` that owns that rule in the same change.
