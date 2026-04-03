# Predictive Early Warning System Implementation Log

**Created**: 2026-03-29
**Master Spec**: [00-overview.md](./00-overview.md)
**Status files**: `.status/` subfolder (one file per phase — written by agents, never edit this log)

> **Note:** Sub-phases are numbered 01–06 (matching their spec filenames), NOT lettered A–F. The overview file uses letters for shorthand but all references here use the canonical numeric identifiers.

---

## Dependency Graph

```
01 ──┬── 02 ──┬── 04
     │        │
     └── 03 ──┼── 05 ──► 06
               │
               └────────┘
```

Phases at the same horizontal level with no arrows between them can build in parallel:

- Wave 2: 02, 03 build in parallel (both depend only on 01)
- Wave 3: 04, 05 build in parallel (both depend on 01 + 02 + 03)

---

## Deployment Waves

### Wave 1 — Foundation

| Subplan | Title                                             | Deploy Order | Depends On | Spec File                              |
| ------- | ------------------------------------------------- | ------------ | ---------- | -------------------------------------- |
| 01      | Foundation: Schema, Shared Types, Module Scaffold | d1           | None       | [01-foundation.md](./01-foundation.md) |

Build: 01 — Deploy order: 01 (d1)

### Wave 2 — Signal Collectors & Scoring Engine (parallel)

| Subplan | Title                             | Deploy Order | Depends On | Spec File                                            |
| ------- | --------------------------------- | ------------ | ---------- | ---------------------------------------------------- |
| 02      | Signal Collectors (5 domains)     | d2           | 01         | [02-signal-collectors.md](./02-signal-collectors.md) |
| 03      | Scoring Engine (pure computation) | d3           | 01         | [03-scoring-engine.md](./03-scoring-engine.md)       |

Build parallel: 02, 03 — Deploy order: 02 (d2) → 03 (d3)

### Wave 3 — Worker Jobs & API Layer (parallel)

| Subplan | Title                                       | Deploy Order | Depends On | Spec File                                                |
| ------- | ------------------------------------------- | ------------ | ---------- | -------------------------------------------------------- |
| 04      | Worker Jobs & Action Layer                  | d4           | 01, 02, 03 | [04-worker-action-layer.md](./04-worker-action-layer.md) |
| 05      | API Layer (controller, services, endpoints) | d5           | 01, 02, 03 | [05-api-layer.md](./05-api-layer.md)                     |

Build parallel: 04, 05 — Deploy order: 04 (d4) → 05 (d5)

### Wave 4 — Frontend

| Subplan | Title                                                     | Deploy Order | Depends On | Spec File                          |
| ------- | --------------------------------------------------------- | ------------ | ---------- | ---------------------------------- |
| 06      | Frontend (dashboard card, list, detail, cohort, settings) | d6           | 05         | [06-frontend.md](./06-frontend.md) |

Build: 06 — Deploy order: 06 (d6)

---

## Phase Registry

| Phase | Title                                                     | Wave | d#  | Depends On | Unlocks | Spec File                                                |
| ----- | --------------------------------------------------------- | ---- | --- | ---------- | ------- | -------------------------------------------------------- |
| 01    | Foundation: Schema, Shared Types, Module Scaffold         | 1    | d1  | None       | 02, 03  | [01-foundation.md](./01-foundation.md)                   |
| 02    | Signal Collectors (5 domains)                             | 2    | d2  | 01         | 04, 05  | [02-signal-collectors.md](./02-signal-collectors.md)     |
| 03    | Scoring Engine (pure computation)                         | 2    | d3  | 01         | 04, 05  | [03-scoring-engine.md](./03-scoring-engine.md)           |
| 04    | Worker Jobs & Action Layer                                | 3    | d4  | 01, 02, 03 | None    | [04-worker-action-layer.md](./04-worker-action-layer.md) |
| 05    | API Layer (controller, services, endpoints)               | 3    | d5  | 01, 02, 03 | 06      | [05-api-layer.md](./05-api-layer.md)                     |
| 06    | Frontend (dashboard card, list, detail, cohort, settings) | 4    | d6  | 05         | None    | [06-frontend.md](./06-frontend.md)                       |

---

## Status File Protocol

Phase agents write status files to the `.status/` subfolder (sibling of this file).
This log is never modified after creation.

| Event                                | File written                | Content                                    |
| ------------------------------------ | --------------------------- | ------------------------------------------ |
| Build complete, awaiting deploy gate | `.status/Phase-01.built`    | ISO timestamp                              |
| Deployed and CI passed               | `.status/Phase-01.complete` | commit hash, ISO timestamp, optional notes |

To check if Phase 01 is complete: check whether `.status/Phase-01.complete` exists.
To check if Phase 01 has built: check whether `.status/Phase-01.built` exists.

No two agents write to the same file. Concurrent sessions are safe.
