# ADR-006: Platform Health Snapshot Dependency

**Status**: Accepted
**Date**: 2026-05-15

## Context

Session 1B of the platform admin dashboard needs the platform module to persist periodic health snapshots and publish health updates over the Session 1A Redis/WebSocket bridge. The existing `HealthService` already owns the dependency checks for PostgreSQL, Redis, Meilisearch, BullMQ, and disk. Reimplementing those probes inside `PlatformModule` would create duplicated operational logic and likely drift.

## Decision

`PlatformModule` imports `HealthModule` and uses the exported `HealthService` from `HealthSnapshotService`. The snapshot service stays in `PlatformModule` because persistence to `platform_health_snapshots`, state-change detection, cleanup, and Redis publication are platform-admin dashboard concerns.

The dependency direction is one-way: `PlatformModule -> HealthModule`. `HealthModule` does not import `PlatformModule`, and `HealthService` does not depend on `RedisPubSubService`.

## Consequences

### Positive

- Health probe logic remains single-sourced in `HealthService`.
- The Session 1A real-time bridge stays platform-owned and reusable by later dashboard sessions.
- The design avoids a circular dependency between `HealthModule` and `PlatformModule`.

### Negative

- `PlatformModule` now depends on a low-level operational module, so `HealthService` signature changes can affect platform dashboard boot.

### Mitigations

- Keep `HealthService.check()` as the only consumed method for snapshots.
- Cover the snapshot orchestration with `HealthSnapshotService` unit tests.
- Document the dependency in `module-blast-radius.md` and the API interval in `event-job-catalog.md`.
