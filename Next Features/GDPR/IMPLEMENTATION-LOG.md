# GDPR Implementation Log

**Created:** 2026-03-27
**Master Plan:** [GDPR-INTEGRATION-PLAN.md](./GDPR-INTEGRATION-PLAN.md)
**Status:** NOT STARTED

---

## Phase Dependency Graph

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

### Reading the Graph

- Arrows mean "unlocks" — Phase A completing unlocks Phase D
- Phase F has THREE prerequisites: B + C + D must ALL be complete before F begins
- Phases with no incoming arrows can start immediately
- Phase L is fully independent and can be scheduled at any convenient time

---

## Parallel Execution Groups

### Wave 1 — No dependencies, can all start immediately
| Phase | Title | Est. Effort |
|---|---|---|
| A | Quick Wins (Privacy Defaults + Cron Jobs) | 1 day |
| B | GDPR Tokenisation Gateway | 5 days |
| C | Anonymisation Overhaul | 3 days |
| G | Audit Logging Enhancement | 2–3 days |
| L | Security Hardening | 4–5 days |

### Wave 2 — Unlocked by Wave 1 completions
| Phase | Title | Unlocked By | Est. Effort |
|---|---|---|---|
| D | Consent Records System | A | 3–4 days |
| E | Legal & Privacy Infrastructure | B | 4–5 days |
| K | AI Decision Audit Trail | B | 2 days |
| I | Retention Policy Engine | C | 3–4 days |
| J | Breach Detection & Management | G | 3–4 days |

### Wave 3 — Unlocked by Wave 2
| Phase | Title | Unlocked By | Est. Effort |
|---|---|---|---|
| F | DSAR Complete Overhaul | B + C + D | 4–5 days |

### Wave 4 — Unlocked by Wave 3
| Phase | Title | Unlocked By | Est. Effort |
|---|---|---|---|
| H | Data Subject Protections | F | 2 days |

---

## Phase Registry

| Phase | Title | Status | Depends On | Unlocks | Est. Effort | Spec File |
|---|---|---|---|---|---|---|
| A | Quick Wins | COMPLETE | — | D | 1 day | [Phase-A](./Phase-A-Quick-Wins.md) |
| B | Tokenisation Gateway | NOT STARTED | — | E, K, F | 5 days | [Phase-B](./Phase-B-Tokenisation-Gateway.md) |
| C | Anonymisation Overhaul | NOT STARTED | — | F, I | 3 days | [Phase-C](./Phase-C-Anonymisation-Overhaul.md) |
| D | Consent Records | NOT STARTED | A | F | 3–4 days | [Phase-D](./Phase-D-Consent-Records.md) |
| E | Legal & Privacy Infra | NOT STARTED | B | — | 4–5 days | [Phase-E](./Phase-E-Legal-Privacy-Infrastructure.md) |
| F | DSAR Overhaul | NOT STARTED | B, C, D | H | 4–5 days | [Phase-F](./Phase-F-DSAR-Overhaul.md) |
| G | Audit Logging | NOT STARTED | — | J | 2–3 days | [Phase-G](./Phase-G-Audit-Logging.md) |
| H | Data Subject Protections | NOT STARTED | F | — | 2 days | [Phase-H](./Phase-H-Data-Subject-Protections.md) |
| I | Retention Engine | NOT STARTED | C | — | 3–4 days | [Phase-I](./Phase-I-Retention-Engine.md) |
| J | Breach Detection | NOT STARTED | G | — | 3–4 days | [Phase-J](./Phase-J-Breach-Detection.md) |
| K | AI Decision Audit Trail | NOT STARTED | B | — | 2 days | [Phase-K](./Phase-K-AI-Audit-Trail.md) |
| L | Security Hardening | NOT STARTED | — | — | 4–5 days | [Phase-L](./Phase-L-Security-Hardening.md) |

---

## Critical Path

**Longest dependency chain:** B (5d) + wait for C (3d) and D (3–4d via A 1d) ... then F (4–5d) then H (2d)

**Practical critical path:** If starting A, B, C in parallel on day 1:
- A completes day 1 → D starts day 2 → D completes ~day 5
- B completes ~day 5
- C completes ~day 3
- F can start day 6 (B + C + D all done) → F completes ~day 10
- H starts day 11 → H completes ~day 12

**Minimum calendar time with full parallelism:** ~12 engineering days

---

## Execution Log

> Each phase MUST add an entry here upon completion. Subsequent phases reference this log
> to verify their prerequisites are satisfied before beginning work.

### Template

```markdown
### Phase X: [Title]
- **Status:** COMPLETE
- **Completed:** YYYY-MM-DD
- **Implemented by:** [engineer name or agent ID]
- **Commit(s):** [commit hash(es)]
- **Key decisions:** [any deviations from the phase spec, with reasoning]
- **Schema changes:** [migration name(s) if any]
- **New endpoints:** [list if any]
- **New frontend pages:** [list if any]
- **Tests added:** [count and coverage summary]
- **Architecture files updated:** [which ones]
- **Unlocks:** [phases now available to begin]
- **Notes:** [anything the next phase should know]
```

---

### Phase A: Quick Wins
- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Claude (automated)
- **Key decisions:**
  - Kept existing `ai.enabled` master toggle alongside 8 new granular toggles
  - Behaviour settings defaults (5 fields) live in `behaviourSettingsSchema`, not `tenantSettingsSchema`
  - No migration needed — schema defaults only affect new tenants
  - Added `riskDetection.enabled` to gradebook section of tenant settings
- **Schema changes:** None (application-layer defaults only)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** Defaults verification tests + AI service gating tests
- **Architecture files updated:** event-job-catalog.md (2 new cron entries)
- **Unlocks:** Phase D (Consent Records) is now available
- **Notes:** The `ai` settings block in `tenantSettingsSchema` now has 9 fields (1 existing + 8 new). Phase D should reference these when building consent UI. Each AI service checks `settings.ai.<featureName>` before processing.
