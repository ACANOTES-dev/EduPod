# ADR-008: Platform Onboarding Provider Boundary

**Status**: Accepted
**Date**: 2026-05-16

## Context

Session 1D adds a platform-admin tenant onboarding tracker. Tenant creation and custom-domain changes need to seed and auto-complete tracker steps, while the platform admin dashboard needs guarded onboarding endpoints and real-time updates over the existing Session 1A Redis/WebSocket bridge.

Importing the full `PlatformModule` into `TenantsModule` creates an unsafe dependency chain because `PlatformModule` also imports auth, health, alerts, and communications dependencies used by platform dashboard sessions 1A through 1C. That path can reintroduce tenant/auth/platform circular dependencies for a small tenant lifecycle hook.

## Decision

Create two provider-only platform modules:

- `PlatformRealtimeModule` exports `RedisPubSubService`.
- `PlatformOnboardingModule` imports `PlatformRealtimeModule` and exports `OnboardingService`.

`PlatformModule` imports both provider modules for platform dashboard controllers and gateways. `TenantsModule` imports only `PlatformOnboardingModule` so tenant create/domain hooks can seed and auto-complete onboarding steps without importing full platform dashboard functionality.

## Consequences

### Positive

- Session 1D reuses the Session 1A Redis/WebSocket infrastructure for onboarding updates.
- Tenant lifecycle hooks can update onboarding state through a narrow provider boundary.
- Platform dashboard controllers, health, alerts, and email dispatch remain outside the TenantsModule import chain.

### Negative

- Platform code now has two small provider modules in addition to `PlatformModule`.
- Future platform services must choose the narrow provider module deliberately instead of adding providers directly to `PlatformModule`.

### Mitigations

- `module-blast-radius.md` documents that `TenantsModule` must import only `PlatformOnboardingModule` for onboarding hooks.
- `PlatformRealtimeModule` is scoped to platform-admin real-time pub/sub and should not become a general-purpose event bus.
