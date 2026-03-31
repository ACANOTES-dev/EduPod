# Engagement & Activity Management Implementation Log

**Created**: 2026-03-31
**Master Spec**: [ENG-MSTR.md](./ENG-MSTR.md)
**Status files**: `.status/` subfolder (one file per phase — written by agents, never edit this log)

---

## Dependency Graph

```
Phase A ──► Phase B ──► Phase F ──► Phase G ──► Phase H
       │                  ↑           ↑
       └──► Phase C ──────┘           │
                │                     │
                ├──► Phase D ─────────┘
                │
                └──► Phase E ─────────┘
```

- **A** is the sole foundation — everything traces back to it
- **B** and **C** are independent of each other (both Wave 2)
- **D**, **E**, and **F** are independent of each other (all Wave 3)
- **G** requires D + E + F (Wave 4)
- **H** requires G (Wave 5)

---

## Deployment Waves

### Wave 1 — Foundation

| Subplan | Title                              | Deploy Order | Depends On | Spec File                                        |
| ------- | ---------------------------------- | ------------ | ---------- | ------------------------------------------------ |
| A       | Foundation (Schema + Shared Types) | d1           | None       | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |

Build: A — Deploy order: A (d1)

### Wave 2 — Core API

| Subplan | Title      | Deploy Order | Depends On | Spec File                                        |
| ------- | ---------- | ------------ | ---------- | ------------------------------------------------ |
| B       | Forms API  | d2           | A          | [Phase-B-Forms-API.md](./Phase-B-Forms-API.md)   |
| C       | Events API | d3           | A          | [Phase-C-Events-API.md](./Phase-C-Events-API.md) |

Build parallel: B, C — Deploy order: B (d2) → C (d3)

### Wave 3 — Extended API + Frontend

| Subplan | Title                     | Deploy Order | Depends On | Spec File                                                              |
| ------- | ------------------------- | ------------ | ---------- | ---------------------------------------------------------------------- |
| D       | Trip Pack & Logistics API | d4           | C          | [Phase-D-Trip-Pack-API.md](./Phase-D-Trip-Pack-API.md)                 |
| E       | Conference API            | d5           | C          | [Phase-E-Conference-API.md](./Phase-E-Conference-API.md)               |
| F       | Frontend: Forms & Events  | d6           | B, C       | [Phase-F-Frontend-Forms-Events.md](./Phase-F-Frontend-Forms-Events.md) |

Build parallel: D, E, F — Deploy order: D (d4) → E (d5) → F (d6)

### Wave 4 — Remaining Frontend

| Subplan | Title                         | Deploy Order | Depends On | Spec File                                                                        |
| ------- | ----------------------------- | ------------ | ---------- | -------------------------------------------------------------------------------- |
| G       | Frontend: Trips & Conferences | d7           | D, E, F    | [Phase-G-Frontend-Trips-Conferences.md](./Phase-G-Frontend-Trips-Conferences.md) |

Build: G — Deploy order: G (d7)

### Wave 5 — Hardening

| Subplan | Title     | Deploy Order | Depends On | Spec File                                      |
| ------- | --------- | ------------ | ---------- | ---------------------------------------------- |
| H       | Hardening | d8           | G          | [Phase-H-Hardening.md](./Phase-H-Hardening.md) |

Build: H — Deploy order: H (d8)

---

## Phase Registry

| Phase | Title                              | Wave | d#  | Depends On | Unlocks | Spec File                                                                        |
| ----- | ---------------------------------- | ---- | --- | ---------- | ------- | -------------------------------------------------------------------------------- |
| A     | Foundation (Schema + Shared Types) | 1    | d1  | None       | B, C    | [Phase-A-Foundation.md](./Phase-A-Foundation.md)                                 |
| B     | Forms API                          | 2    | d2  | A          | F       | [Phase-B-Forms-API.md](./Phase-B-Forms-API.md)                                   |
| C     | Events API                         | 2    | d3  | A          | D, E, F | [Phase-C-Events-API.md](./Phase-C-Events-API.md)                                 |
| D     | Trip Pack & Logistics API          | 3    | d4  | C          | G       | [Phase-D-Trip-Pack-API.md](./Phase-D-Trip-Pack-API.md)                           |
| E     | Conference API                     | 3    | d5  | C          | G       | [Phase-E-Conference-API.md](./Phase-E-Conference-API.md)                         |
| F     | Frontend: Forms & Events           | 3    | d6  | B, C       | G       | [Phase-F-Frontend-Forms-Events.md](./Phase-F-Frontend-Forms-Events.md)           |
| G     | Frontend: Trips & Conferences      | 4    | d7  | D, E, F    | H       | [Phase-G-Frontend-Trips-Conferences.md](./Phase-G-Frontend-Trips-Conferences.md) |
| H     | Hardening                          | 5    | d8  | G          | —       | [Phase-H-Hardening.md](./Phase-H-Hardening.md)                                   |

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
