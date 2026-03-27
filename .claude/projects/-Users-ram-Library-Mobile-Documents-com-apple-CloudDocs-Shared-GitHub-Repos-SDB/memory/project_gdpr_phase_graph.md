---
name: GDPR Phase Dependency Graph
description: Complete dependency graph for GDPR implementation — 12 phases (A–L) with parallelism, wave grouping, critical path, and mandatory implementation log rule
type: project
---

## Phase Graph

```
                     ┌───► D (Consent) ─────────────────┐
A (Quick Wins) ──────┘                                   │
                                                         ▼
B (Tokenisation) ───┬───► E (Legal Infra)            F (DSAR) ───► H (Data Subject)
                    ├───► K (AI Audit Trail)             ▲
                    └────────────────────────────────────┘│
                                                         │
C (Anonymisation) ──┬────────────────────────────────────┘
                    └───► I (Retention)

G (Audit Logging) ──────► J (Breach Detection)

L (Security Hardening) ──── [Independent — schedule anytime]
```

## Phase Registry

| Phase | Title | Depends On | Unlocks | Effort |
|---|---|---|---|---|
| A | Quick Wins (Privacy Defaults + Cron Jobs) | — | D | 1 day |
| B | Tokenisation Gateway | — | E, K, F | 5 days |
| C | Anonymisation Overhaul | — | F, I | 3 days |
| D | Consent Records | A | F | 3–4 days |
| E | Legal & Privacy Infrastructure | B | — | 4–5 days |
| F | DSAR Overhaul | B + C + D | H | 4–5 days |
| G | Audit Logging Enhancement | — | J | 2–3 days |
| H | Data Subject Protections | F | — | 2 days |
| I | Retention Engine | C | — | 3–4 days |
| J | Breach Detection | G | — | 3–4 days |
| K | AI Decision Audit Trail | B | — | 2 days |
| L | Security Hardening | — | — | 4–5 days |

## Parallel Execution Waves

**Wave 1 (start immediately):** A, B, C, G, L
**Wave 2 (after deps):** D (after A), E (after B), K (after B), I (after C), J (after G)
**Wave 3:** F (after B + C + D all complete)
**Wave 4:** H (after F)

## Critical Path

B (5d) → wait for C+D → F (4–5d) → H (2d) = ~12 days minimum with full parallelism

## "Phase X is done — what's next?" Quick Reference

- **A done** → D is unlocked
- **B done** → E and K are unlocked; check if C and D are also done → if yes, F is unlocked
- **C done** → I is unlocked; check if B and D are also done → if yes, F is unlocked
- **D done** → check if B and C are also done → if yes, F is unlocked
- **E done** → nothing new unlocked (terminal for its branch)
- **F done** → H is unlocked
- **G done** → J is unlocked
- **H done** → nothing (terminal — all Phase 2 items complete)
- **I done** → nothing (terminal)
- **J done** → nothing (terminal)
- **K done** → nothing (terminal)
- **L done** → nothing (terminal, independent)

## Mandatory Rule: Implementation Log

**Every phase MUST write to `Next Features/GDPR/IMPLEMENTATION-LOG.md` before it is considered complete.** This is non-negotiable. All subsequent phases check the implementation log to verify their prerequisites are satisfied. The log is at `Next Features/GDPR/IMPLEMENTATION-LOG.md`. Phase specs are in the same directory.

**Why:** At 300k+ LOC, the codebase is too large to hold in context. The implementation log is the single source of truth for what has been built, what decisions were made, and what the next phase needs to know. Without it, phases will make incorrect assumptions about prior work.

**How to apply:** Before starting any GDPR phase, read the implementation log. Before marking any GDPR phase complete, write to the implementation log using the template in the phase spec's "Implementation Log Entry" section.
