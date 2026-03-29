# Digital Homework & School Diary Implementation Log

**Created**: 2026-03-29
**Master Spec**: [MASTER-PLAN.md](./MASTER-PLAN.md)
**Status files**: `.status/` subfolder (one file per phase — written by agents, never edit this log)

---

## Dependency Graph

```
Phase A ──► Phase B ──► Phase D
         │          ├──► Phase E
         │          ├──► Phase F
         │          └──► Phase G
         └──► Phase C ──► Phase G
```

Phase A is the sole foundation. Phase B (API) and Phase C (Worker Jobs) can build in parallel in Wave 2.
Phases D, E, F (frontend) can build in parallel in Wave 3, all depending on Phase B.
Phase G (Hardening) requires everything to be complete.

---

## Deployment Waves

### Wave 1 — Foundation

| Subplan | Title | Deploy Order | Depends On | Spec File |
|---------|-------|--------------|------------|-----------|
| A | Foundation | d1 | None | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |

Build parallel: A — Deploy order: A (d1)

---

### Wave 2 — Backend Services

| Subplan | Title | Deploy Order | Depends On | Spec File |
|---------|-------|--------------|------------|-----------|
| B | Core API | d2 | A | [Phase-B-Core-API.md](./Phase-B-Core-API.md) |
| C | Worker Jobs | d3 | A | [Phase-C-Worker-Jobs.md](./Phase-C-Worker-Jobs.md) |

Build parallel: B, C — Deploy order: B (d2) → C (d3)

---

### Wave 3 — Frontend

| Subplan | Title | Deploy Order | Depends On | Spec File |
|---------|-------|--------------|------------|-----------|
| D | Teacher Frontend | d4 | B | [Phase-D-Teacher-Frontend.md](./Phase-D-Teacher-Frontend.md) |
| E | Parent Frontend | d5 | B | [Phase-E-Parent-Frontend.md](./Phase-E-Parent-Frontend.md) |
| F | School Diary | d6 | B | [Phase-F-Diary.md](./Phase-F-Diary.md) |

Build parallel: D, E, F — Deploy order: D (d4) → E (d5) → F (d6)

---

### Wave 4 — Hardening

| Subplan | Title | Deploy Order | Depends On | Spec File |
|---------|-------|--------------|------------|-----------|
| G | Hardening & Polish | d7 | B, C, D, E, F | [Phase-G-Hardening.md](./Phase-G-Hardening.md) |

Build: G — Deploy order: G (d7)

---

## Phase Registry

| Phase | Title | Wave | d# | Depends On | Unlocks | Spec File |
|-------|-------|------|----|------------|---------|-----------|
| A | Foundation | 1 | d1 | None | B, C | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |
| B | Core API | 2 | d2 | A | D, E, F, G | [Phase-B-Core-API.md](./Phase-B-Core-API.md) |
| C | Worker Jobs | 2 | d3 | A | G | [Phase-C-Worker-Jobs.md](./Phase-C-Worker-Jobs.md) |
| D | Teacher Frontend | 3 | d4 | B | G | [Phase-D-Teacher-Frontend.md](./Phase-D-Teacher-Frontend.md) |
| E | Parent Frontend | 3 | d5 | B | G | [Phase-E-Parent-Frontend.md](./Phase-E-Parent-Frontend.md) |
| F | School Diary | 3 | d6 | B | G | [Phase-F-Diary.md](./Phase-F-Diary.md) |
| G | Hardening & Polish | 4 | d7 | B, C, D, E, F | None | [Phase-G-Hardening.md](./Phase-G-Hardening.md) |

---

## Status File Protocol

Phase agents write status files to the `.status/` subfolder (sibling of this file).
This log is never modified after creation.

| Event | File written | Content |
|-------|-------------|---------|
| Build complete, awaiting deploy gate | `.status/Phase-A.built` | ISO timestamp |
| Deployed and CI passed | `.status/Phase-A.complete` | commit hash, ISO timestamp, optional notes |

To check if Phase A is complete: check whether `.status/Phase-A.complete` exists.
To check if Phase A has built: check whether `.status/Phase-A.built` exists.

No two agents write to the same file. Concurrent sessions are safe.
