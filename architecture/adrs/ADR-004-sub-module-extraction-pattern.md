# ADR-004: Module Sub-Module Extraction Pattern

**Status**: Accepted
**Date**: 2026-04-01

## Context

NestJS modules grow naturally as features are added. Two modules reached sizes that made them difficult to reason about and test:

- `BehaviourModule`: 43 providers across incident management, interventions, behaviour points, PBIS frameworks, notifications, and reporting
- `PastoralModule`: 26 providers across pastoral care records, wellbeing notes, referrals, and case management

At this size, a single module file becomes a registry of DI tokens rather than a coherent description of a bounded context. Test isolation is harder because the full module graph must be bootstrapped even for a unit test that only touches one concern. Circular dependency risk increases because all providers in the module can reference each other freely.

The alternative — splitting into fully independent NestJS modules with their own controllers and separate API routing — was considered but rejected. These sub-concerns are closely related, share entity types, and would need to cross-import heavily. Separating them into fully independent modules would produce more circular dependency problems than it solves, and would require versioning multiple closely-related module interfaces simultaneously.

## Decision

Large modules are refactored into **sub-module constellations**:

- The root module (`BehaviourModule`, `PastoralModule`) becomes a **thin aggregator** that imports and re-exports sub-modules.
- Each sub-module owns a coherent sub-concern: its own providers, its own exports, its own test surface.
- The root module does not duplicate providers — it imports sub-modules and re-exports only what consumers outside the feature need.
- Controllers remain in the root module or are distributed to sub-modules by sub-concern; the routing prefix (`/v1/behaviour/...`) is preserved regardless.

Example structure after extraction:

```
modules/behaviour/
├── behaviour.module.ts              # Thin aggregator
├── incidents/
│   ├── behaviour-incidents.module.ts
│   ├── behaviour-incidents.service.ts
│   └── behaviour-incidents.service.spec.ts
├── interventions/
│   ├── behaviour-interventions.module.ts
│   └── ...
└── ...
```

The root module's `exports` array shrinks to re-exporting sub-module exports rather than listing every individual service.

## Consequences

### Positive

- Each sub-module has a small, focused provider list — easier to read, test, and reason about.
- Unit tests for a sub-concern bootstrap only that sub-module, not the entire feature graph.
- Circular dependency risk is reduced within each sub-module because the scope is narrower.
- New sub-concerns can be added without touching the root module's internal wiring.

### Negative

- Providers are now distributed across multiple files; finding "where is `BehaviourPointsService` registered?" requires knowing the sub-module structure.
- The root module's re-export pattern can be confusing if a developer expects to import directly from a sub-module but consumers are wired to the root.
- Over-extraction risk: if sub-modules are made too granular (one provider each), the aggregation overhead outweighs the benefit. Sub-modules should group by business concern, not by provider count.

### Mitigations

- `architecture/module-blast-radius.md` lists the sub-module structure for each affected root module so the provider-to-sub-module mapping is documented.
- Convention: sub-module files are named `{root}-{concern}.module.ts` to make the hierarchy scannable.
- The root module is always the public import boundary — external modules import `BehaviourModule`, never a sub-module directly.
