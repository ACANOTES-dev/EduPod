# Predictive Early Warning System — Implementation Overview

> **Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md`

## What This Builds

A cross-module risk intelligence layer that correlates attendance, grades, behaviour, wellbeing, and parent engagement data to flag at-risk students before they fail. Three-layer architecture: signal collectors (data) -> scoring engine (computation) -> action layer (routing/notifications).

## Sub-Plans (Execute in Order)

| Phase | Plan                                                   | Description                                                                                             | Depends On           |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------- |
| A     | [01-foundation.md](01-foundation.md)                   | Schema, migration, RLS, enums, Zod schemas, shared types, queue constants, permissions, module scaffold | Nothing              |
| B     | [02-signal-collectors.md](02-signal-collectors.md)     | 5 domain signal collectors with full test coverage                                                      | Phase A              |
| C     | [03-scoring-engine.md](03-scoring-engine.md)           | Pure computation: weights, cross-domain boost, hysteresis, NL summary                                   | Phase A (types only) |
| D     | [04-worker-action-layer.md](04-worker-action-layer.md) | Worker processors, cron registration, routing, trigger service, intraday integration                    | Phases A, B, C       |
| E     | [05-api-layer.md](05-api-layer.md)                     | Controller, services, DTOs, all 8 REST endpoints with tests                                             | Phases A, B, C       |
| F     | [06-frontend.md](06-frontend.md)                       | Dashboard card, list page, student detail, cohort heatmap, settings                                     | Phase E              |

## Parallelisation

Phases B and C can be built in parallel (both depend only on Phase A types). Phases D and E both need B+C complete. Phase F needs E.

```
A ──┬── B ──┬── D
    │       │
    └── C ──┼── E ── F
            │
            └───────┘
```

## Key Architecture Reference

- **New queue:** `EARLY_WARNING` in `queue.constants.ts`
- **New module:** `apps/api/src/modules/early-warning/`
- **New worker processors:** `apps/worker/src/processors/early-warning/`
- **New shared package:** `packages/shared/src/early-warning/`
- **4 new tables:** `student_risk_profiles`, `student_risk_signals`, `early_warning_tier_transitions`, `early_warning_configs`
- **3 new enums:** `EarlyWarningRiskTier`, `EarlyWarningDomain`, `EarlyWarningSignalSeverity`
- **4 new permissions:** `early_warning.view`, `early_warning.manage`, `early_warning.acknowledge`, `early_warning.assign`
- **3 worker jobs:** `early-warning:compute-daily`, `early-warning:compute-student`, `early-warning:weekly-digest`
