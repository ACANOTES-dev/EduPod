# Scheduling — Feature Documentation

## Solver Architecture

The scheduling solver uses a two-phase pipeline:

1. **Greedy hint** — a fast round-robin heuristic that places lessons by
   iterating (lesson, slot, teacher) tuples in a deterministic order.
   Produces a valid schedule that satisfies all hard constraints by
   construction. At tier-4 scale (~1100 lessons) the greedy consistently
   places 100% of curriculum demand.

2. **CP-SAT refinement** — Google OR-Tools CP-SAT constraint solver runs
   after the greedy hint, using it as a warm-start. When CP-SAT
   converges within budget it can improve soft-preference scores; when
   it times out, the greedy result is returned as-is. At tier-4 scale
   CP-SAT does not converge within budgets up to 600 s — the greedy is
   already complete.

The solver runs inside a Python FastAPI sidecar (`apps/solver-py`) on
`127.0.0.1:5557`, invoked by the NestJS worker via HTTP POST. A
cooperative cancellation mechanism (`DELETE /solve/{request_id}`)
ensures abandoned solves don't block subsequent requests.

## Budget Recommendations

Based on Stage 9.5.2 scale-proof measurements (tier-4 local + tier-5
server, 2026-04-16):

| Tenant class | Lesson demand | Recommended `max_solver_duration_seconds` | Max safe | Memory peak |
| :----------- | :------------ | ----------------------------------------: | -------: | ----------: |
| Very small   | < 100         |                                        30 |      120 |    < 500 MB |
| Small        | 100–500       |                                        60 |      300 |    < 1.5 GB |
| Medium       | 500–1100      |                      60 (current default) |      600 |     ~3.1 GB |
| Large        | 1100–2200     |                                       120 |      120 |     ~3.5 GB |
| Very large   | > 2200        |                                       120 |    120\* |       >4 GB |

> \* Large and very-large tenants are constrained by sidecar memory, not
> solver quality. The greedy places 100% at both tier-4 and tier-5 scale;
> higher budgets only add wall time without improving placement. Budget
> beyond 120 s for these tiers is not recommended until the sidecar's
> `max_memory_restart` is raised beyond 4 GB and a per-solve memory
> estimator is in place (Stage 9.5.1 amendment follow-up #6).

### When to raise the budget

Raise `max_solver_duration_seconds` above the recommended default only when:

1. **The solver reports unassigned lessons** (`entries_unassigned > 0`)
   AND the unassigned are not structural (i.e. the tenant has enough
   teachers and rooms to cover the demand — check the run's
   `failure_reason` for specifics).
2. **CP-SAT status is `unknown`** — meaning the solver timed out before
   finding a better arrangement. A higher budget gives CP-SAT more time
   to search.
3. **The admin has confirmed the tenant's server memory can handle it.**
   At 600 s budget the sidecar peaks at ~3.1 GB RSS. At 1800 s+ the
   peak exceeds 4 GB. The current production `max_memory_restart` is
   4 GB.

Do NOT raise the budget to improve soft-preference scores alone —
the greedy fallback already handles placement; the marginal
soft-preference gain from CP-SAT refinement is not worth the memory
and wall-time cost at scale.
