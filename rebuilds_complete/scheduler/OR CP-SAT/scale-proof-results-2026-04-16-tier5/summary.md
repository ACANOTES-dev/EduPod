# Stage 9.5.2 tier-5 partial matrix — 2026-04-16

- Sidecar: production at `http://127.0.0.1:5557` (server pid 31654 → OOM'd → 32215)
- Fixture: tier-5-multi-campus-large.seed7.json (95 classes, 160 teachers, 2185 curriculum demand)
- max_memory_restart: 4 GB (raised from 2 GB in commit abca2e44)

## Completed runs

| Budget (s) | Run | Placed / Demand |  Ratio | Wall (s) | CP-SAT  | Early-stop    |
| ---------: | --: | :-------------: | -----: | -------: | :------ | :------------ |
|        120 |   0 |    2186/2185    | 100.0% |    150.5 | unknown | not_triggered |
|        120 |   1 |    2186/2185    | 100.0% |    148.7 | unknown | not_triggered |
|        120 |   2 |    2186/2185    | 100.0% |    149.2 | unknown | not_triggered |

> Note: placed > demand because `entries` includes pinned entries (5% of demand)
> which are not counted in the curriculum-only demand number.

## OOM event

- **Budget 300 s, run 1**: started 01:02:26 UTC. Solver-py RSS exceeded the
  4 GB `max_memory_restart` cap during the CP-SAT search phase. pm2 killed
  the process (restart count 0 → 1), sidecar recovered as pid 32215. The
  benchmark client received `RemoteDisconnected` and exited. No data was
  written for this run.

## Remaining matrix (not run)

| Budget (s) |          Runs | Reason skipped                         |
| ---------: | ------------: | :------------------------------------- |
|        300 | 2/3 remaining | OOM killed run 1; matrix script exited |
|        600 |           3/3 | not started                            |
|       1800 |           3/3 | not started                            |

## Memory trajectory

| Context               |        RSS peak |
| :-------------------- | --------------: |
| Tier-4 local @ 60 s   |         ~2.1 GB |
| Tier-4 local @ 300 s  |         ~2.5 GB |
| Tier-4 local @ 600 s  |         ~3.1 GB |
| Tier-5 server @ 120 s |         ~3.5 GB |
| Tier-5 server @ 300 s | **>4 GB (OOM)** |

## Finding

The Stage 9.5.1 budget ceiling raise to 3600 s is only safe for
small-to-medium tenants (tier-4 scale, ~1100 lessons). A tier-5-scale
tenant (95 classes, ~2200 lessons) configuring `max_solver_duration_seconds
= 300` or above would OOM the sidecar on the current server. The 4 GB cap
holds for tier-5 at 120 s budget but not beyond.

Recommended guardrails:

- Tenants with ≤ 1100 lessons: budget up to 600 s safe (3.1 GB peak).
- Tenants with 1100–2200 lessons: budget ≤ 120 s safe (3.5 GB peak).
- Tenants with > 2200 lessons: needs per-solve memory estimator or a
  raised cap (8 GB+) before configuring budgets > 120 s.
