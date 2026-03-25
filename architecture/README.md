# Architecture Reference

Living documentation for navigating and safely modifying the codebase at scale. These files are NOT auto-generated — they capture non-obvious coupling, risks, and contracts that can't be derived from reading code in isolation.

## Files

| File | What it answers |
|------|----------------|
| [module-blast-radius.md](module-blast-radius.md) | "If I change module X, what else breaks?" |
| [event-job-catalog.md](event-job-catalog.md) | "What happens after this BullMQ job runs? What chain does it trigger?" |
| [state-machines.md](state-machines.md) | "What transitions are valid for this status field? What side effects do they have?" |
| [danger-zones.md](danger-zones.md) | "Where are the non-obvious risks? What looks safe but isn't?" |
| [pre-flight-checklist.md](pre-flight-checklist.md) | "What should I verify before and after making this change?" |

## Maintenance Rules

1. **These files must be updated with every code change** — they are part of the deliverable, not an afterthought
2. **Accuracy over completeness** — a wrong entry is worse than a missing entry. When in doubt, verify against the code.
3. **Append-only for danger zones** — only remove a DZ entry when the underlying risk is mitigated in code
4. **Keep entries concise** — if an entry needs more than 10 lines, it's too detailed. Link to the code instead.
