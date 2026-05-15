# ADR-007: Platform Alert Email Dispatch

**Status**: Accepted
**Date**: 2026-05-15

## Context

Session 1C of the platform admin dashboard adds platform-level alert rules and alert history. Fired alerts can notify platform-owner email recipients.

The current communications rebuild deliberately removed platform-shared Resend environment credentials. `ResendEmailProvider` only dispatches through configured tenant email rows, and `docs/architecture/communication-architecture.md` treats that as the live contract. Reintroducing a platform-wide Resend fallback for Session 1C would reopen a retired credential path and bypass tenant-domain verification.

## Decision

`PlatformModule` imports `CommunicationsModule` and uses the exported `ResendEmailProvider` from `AlertDispatchService`.

Platform alert email dispatch is enabled only when `PLATFORM_ALERT_EMAIL_TENANT_ID` is configured. That tenant's existing email configuration supplies the Resend credentials and sender identity. When the variable is absent, fired alerts are still persisted and published over WebSocket, but email notification is skipped with a warning.

## Consequences

### Positive

- Session 1C reuses the existing Resend provider and its circuit breaker, domain verification, metrics, and per-tenant credential cache.
- No platform-shared email secret is added to the codebase or production environment contract.
- Alert persistence and real-time alert delivery do not depend on email configuration.

### Negative

- Platform alert email depends on a configured tenant email row until Layer 2 introduces richer alert channels.
- A missing `PLATFORM_ALERT_EMAIL_TENANT_ID` means the email channel is intentionally skipped, even when alert rules list recipients.

### Mitigations

- `AlertDispatchService` logs a clear warning when the platform alert email tenant is not configured.
- Alert history records remain the source of truth for fired alerts regardless of notification outcome.
- Layer 2 alerting work can replace this bridge with a dedicated platform-channel dispatcher without changing the Session 1C rule/history data model.
