# Staff Wellbeing — Implementation Progress

**Master Spec:** `staff-wellbeing-spec-v1-master.md`
**Scope:** V1 — Trust Before Breadth (7 phases, A-G)

---

## Dependency Graph

```
A ──→ B ──→ C ───────────┐
                          ├──→ F ──→ G
A ──→ D ──────→ E ────────┘
       (parallel with B+C)
```

- B and D are fully parallel after A
- C and D are also parallel
- E requires B + D
- F requires C + D + E
- G requires all

---

## Phase Status

| Phase | Name | Spec | Status | Started | Completed |
|-------|------|------|--------|---------|-----------|
| A | Foundation & Shared Infrastructure | `phase-a-foundation.md` | NOT STARTED | — | — |
| B | Anonymous Survey Engine | `phase-b-survey-engine.md` | NOT STARTED | — | — |
| C | Survey Results & Trust Layer | `phase-c-trust-layer.md` | NOT STARTED | — | — |
| D | Workload Intelligence | `phase-d-workload-intelligence.md` | NOT STARTED | — | — |
| E | Frontend — Staff Experience | `phase-e-frontend-staff.md` | NOT STARTED | — | — |
| F | Frontend — Principal/Board + Reports | `phase-f-frontend-admin.md` | NOT STARTED | — | — |
| G | Security Verification & Hardening | `phase-g-hardening.md` | NOT STARTED | — | — |

---

## Session Log

<!-- Each session adds an entry here:
### Session N — [Date]
**Phase(s):** X
**Work done:** Brief summary
**Issues:** Any problems encountered
**Next:** What to pick up next
-->
