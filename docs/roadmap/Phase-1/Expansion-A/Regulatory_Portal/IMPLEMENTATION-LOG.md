# Regulatory Portal Implementation Log

**Created**: 2026-03-28
**Master Spec**: [REG-Plan.md](./REG-Plan.md)
**Status files**: `.status/` subfolder (one file per phase — written by agents, never edit this log)

---

## Dependency Graph

```
Phase A ──► Phase B ──┐
       ├──► Phase C ──┤──► Phase E ──► Phase F ──► Phase G
       └──► Phase D ──┘                       └──► Phase H
```

Phases at the same horizontal level with no arrows between them can build in parallel:

- Wave 2: B, C, D build in parallel (all depend only on A)
- Wave 5: G, H build in parallel (both depend on F, plus their respective API phases)

---

## Deployment Waves

### Wave 1 — Foundation

| Subplan | Title                                       | Deploy Order | Depends On | Spec File                                        |
| ------- | ------------------------------------------- | ------------ | ---------- | ------------------------------------------------ |
| A       | Foundation: Schema, Shared Types, Core CRUD | d1           | None       | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |

Build: A — Deploy order: A (d1)

### Wave 2 — Domain Services (parallel)

| Subplan | Title                                  | Deploy Order | Depends On | Spec File                                                    |
| ------- | -------------------------------------- | ------------ | ---------- | ------------------------------------------------------------ |
| B       | Tusla Compliance Services              | d2           | A          | [Phase-B-Tusla-Compliance.md](./Phase-B-Tusla-Compliance.md) |
| C       | DES Returns & October Returns Pipeline | d3           | A          | [Phase-C-DES-Pipeline.md](./Phase-C-DES-Pipeline.md)         |
| D       | P-POD/POD Sync, CBA, Transfers         | d4           | A          | [Phase-D-PPOD-Sync.md](./Phase-D-PPOD-Sync.md)               |

Build parallel: B, C, D — Deploy order: B (d2) → C (d3) → D (d4)

### Wave 3 — Worker Jobs & Dashboard

| Subplan | Title                   | Deploy Order | Depends On | Spec File                                                    |
| ------- | ----------------------- | ------------ | ---------- | ------------------------------------------------------------ |
| E       | Worker Jobs & Dashboard | d5           | B, C, D    | [Phase-E-Worker-Dashboard.md](./Phase-E-Worker-Dashboard.md) |

Build: E — Deploy order: E (d5)

### Wave 4 — Frontend Shell

| Subplan | Title               | Deploy Order | Depends On | Spec File                                                |
| ------- | ------------------- | ------------ | ---------- | -------------------------------------------------------- |
| F       | Frontend Core Shell | d6           | A, E       | [Phase-F-Frontend-Shell.md](./Phase-F-Frontend-Shell.md) |

Build: F — Deploy order: F (d6)

### Wave 5 — Frontend Domain Pages (parallel)

| Subplan | Title                                                | Deploy Order | Depends On | Spec File                                                        |
| ------- | ---------------------------------------------------- | ------------ | ---------- | ---------------------------------------------------------------- |
| G       | Frontend: Tusla, DES, October Returns, Anti-Bullying | d7           | F, B, C    | [Phase-G-Frontend-Tusla-DES.md](./Phase-G-Frontend-Tusla-DES.md) |
| H       | Frontend: P-POD/POD, CBA, Transfers                  | d8           | F, D       | [Phase-H-Frontend-PPOD.md](./Phase-H-Frontend-PPOD.md)           |

Build parallel: G, H — Deploy order: G (d7) → H (d8)

---

## Phase Registry

| Phase | Title                                                | Wave | d#  | Depends On | Unlocks    | Spec File                                                        |
| ----- | ---------------------------------------------------- | ---- | --- | ---------- | ---------- | ---------------------------------------------------------------- |
| A     | Foundation: Schema, Shared Types, Core CRUD          | 1    | d1  | None       | B, C, D, F | [Phase-A-Foundation.md](./Phase-A-Foundation.md)                 |
| B     | Tusla Compliance Services                            | 2    | d2  | A          | E, G       | [Phase-B-Tusla-Compliance.md](./Phase-B-Tusla-Compliance.md)     |
| C     | DES Returns & October Returns Pipeline               | 2    | d3  | A          | E, G       | [Phase-C-DES-Pipeline.md](./Phase-C-DES-Pipeline.md)             |
| D     | P-POD/POD Sync, CBA, Transfers                       | 2    | d4  | A          | E, H       | [Phase-D-PPOD-Sync.md](./Phase-D-PPOD-Sync.md)                   |
| E     | Worker Jobs & Dashboard                              | 3    | d5  | B, C, D    | F          | [Phase-E-Worker-Dashboard.md](./Phase-E-Worker-Dashboard.md)     |
| F     | Frontend Core Shell                                  | 4    | d6  | A, E       | G, H       | [Phase-F-Frontend-Shell.md](./Phase-F-Frontend-Shell.md)         |
| G     | Frontend: Tusla, DES, October Returns, Anti-Bullying | 5    | d7  | F, B, C    | None       | [Phase-G-Frontend-Tusla-DES.md](./Phase-G-Frontend-Tusla-DES.md) |
| H     | Frontend: P-POD/POD, CBA, Transfers                  | 5    | d8  | F, D       | None       | [Phase-H-Frontend-PPOD.md](./Phase-H-Frontend-PPOD.md)           |

---

## Status File Protocol

Phase agents write status files to the `.status/` subfolder (sibling of this file).
This log is never modified after creation.

| Event                                | File written               | Content                                    |
| ------------------------------------ | -------------------------- | ------------------------------------------ |
| Build complete, awaiting deploy gate | `.status/Phase-A.built`    | ISO timestamp                              |
| Deployed and CI passed               | `.status/Phase-A.complete` | commit hash, ISO timestamp, optional notes |

To check if Phase A is complete: check whether `.status/Phase-A.complete` exists.
To check if Phase A has built: check whether `.status/Phase-A.built` exists.

No two agents write to the same file. Concurrent sessions are safe.
