# Platform Admin Dashboard -- Layer 1.5: Platform Ops Safety

**Date:** 2026-05-14
**Status:** Plan
**Sessions:** 3 (1.5A, 1.5B, 1.5C)
**Design Spec:** `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`
**Origin:** Inserted between Layer 1 and Layer 2 in response to a third-party design review (2026-05-14) that flagged dangerous Layer 2/3 actions shipping before the platform RBAC, audit ledger, and confirmation primitives were in place.

---

## 1. What Layer 1.5 Delivers

Layer 1.5 is a safety-foundation pass that blocks Layer 2 (intelligence + power tools) and Layer 4 (AI Copilot) from shipping production-grade powers without:

- A real `platform_users` + role table (today: `platform_owner_user_ids` Redis set workaround) so `platform_owner` and `platform_support` are properly distinguishable, invite-able, and revocable.
- A cross-tenant audit ledger that records every operator-side action (cache flush, user disable, MFA reset, ownership transfer, queue retry/clean, alert acknowledge, module toggle, AI-suggested action) with actor, timestamp, target, before/after state, and reason.
- A redaction + retention policy for `platform_error_log` so the AI Copilot (Layer 4) can read errors without ever seeing PII or secrets, and so error data doesn't accumulate indefinitely.
- A confirmation-modal pattern + two-person approval primitive that Layer 2/3 destructive actions reuse instead of re-inventing.
- Alert silencing/snooze + maintenance-window suppression so operators can mute false-positive storms during planned work without disabling the underlying rules.

After this layer, the dashboard has the safety scaffolding to confidently ship dangerous actions in Layer 2/3 and to host an AI assistant in Layer 4.

---

## 2. Prerequisites

Layer 1 must be complete (1A WebSocket + 1B Health + 1C Alerts + 1D Onboarding shipped). Specifically:

| Prerequisite                                                             | Status                                        | Notes                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Layer 1 sessions shipped                                                 | Done (1A, 1B); In progress (1C); Pending (1D) | Layer 1.5 starts after 1D completes                                                                              |
| Session 0 stealth subdomain                                              | Pending                                       | Layer 1.5A's auth changes integrate with Session 0's host check                                                  |
| Existing `platform_owner_user_ids` Redis set                             | Done                                          | Source of truth today; migrated to `platform_users` table by Session 1.5A                                        |
| Existing tenant-scoped `audit_logs` table                                | Done                                          | Pattern to follow for the new `platform_audit_logs` table                                                        |
| Existing alert tables (`platform_alert_rules`, `platform_alert_history`) | Done after 1C                                 | Layer 1.5C's silencing extends them                                                                              |
| Existing Resend email provider                                           | Done                                          | Used by 1.5C for "two-person approval requested" notifications                                                   |
| Existing Sentry triage runbook + guardrails                              | Done                                          | `docs/runbooks/agent-sentry-triage.md` — Layer 1.5C's confirmation primitives align with these existing patterns |

---

## 3. Session Dependency Graph

```
Layer 1 (1A->1D) complete
    |
    +---> Session 1.5A: platform_users + RBAC
              |
              +---> Session 1.5B: Cross-tenant audit ledger + error log redaction/retention
                        |
                        +---> Session 1.5C: Confirmation UX + alert silencing primitives
```

**Execution order:** Strictly sequential. 1.5A unblocks 1.5B (audit ledger references the platform_users table for `actor_user_id`). 1.5B unblocks 1.5C (silencing emits audit events). All three must land before Layer 2 starts.

**Recommended sequential order:** 1.5A -> 1.5B -> 1.5C

---

## 4. Database Migration Summary

### New Tables

All tables are **platform-level** -- no `tenant_id` column, no RLS policies.

| Table                          | Session | Purpose                                                                               |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------- |
| `platform_users`               | 1.5A    | Replaces the Redis-set workaround; canonical list of operator accounts                |
| `platform_user_roles`          | 1.5A    | Many-to-many between `platform_users` and `platform_roles`                            |
| `platform_roles`               | 1.5A    | Seeded with `platform_owner` + `platform_support`; future roles append here           |
| `platform_role_permissions`    | 1.5A    | Many-to-many between `platform_roles` and `platform_permissions`                      |
| `platform_permissions`         | 1.5A    | Seeded permission keys (e.g., `platform.tenants.suspend`, `platform.users.reset_mfa`) |
| `platform_audit_logs`          | 1.5B    | Append-only log of every cross-tenant operator action                                 |
| `platform_alert_silences`      | 1.5C    | Per-rule or per-component suppression windows                                         |
| `platform_maintenance_windows` | 1.5C    | Time-bounded periods that suppress all alerts                                         |
| `platform_two_person_requests` | 1.5C    | Pending high-blast actions awaiting a secondary approver                              |

### Modified Tables

| Table                            | Session | Change                                                                                                                                           |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform_alert_rules` (from 1C) | 1.5C    | Add `silence_id` FK column allowing a rule to be linked to an active silence                                                                     |
| `users` (existing)               | 1.5A    | NO SCHEMA CHANGE; the existing `users` table stays the platform-level identity table. `platform_users` is a join/role overlay, not a replacement |

### New Enums

| Enum                         | Session | Values                                                                              |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `PlatformRoleKey`            | 1.5A    | `platform_owner`, `platform_support` (extensible)                                   |
| `PlatformAuditAction`        | 1.5B    | `tenant.suspend`, `user.mfa_reset`, `cache.flush`, `queue.retry`, etc. (~30 values) |
| `PlatformErrorRedactionMode` | 1.5B    | `none`, `pii`, `pii_plus_secrets` (default `pii_plus_secrets`)                      |
| `PlatformAlertSilenceScope`  | 1.5C    | `single_rule`, `component`, `global`                                                |

---

## 5. New API Endpoints Summary

### Session 1.5A -- Platform Users + RBAC

| Method | Endpoint                             | Purpose                                                      |
| ------ | ------------------------------------ | ------------------------------------------------------------ |
| GET    | `/v1/admin/platform-users`           | List all platform users with their roles                     |
| POST   | `/v1/admin/platform-users/invite`    | Invite a new platform user (email link, role pre-assigned)   |
| PATCH  | `/v1/admin/platform-users/:id/roles` | Add/remove roles (platform_owner only)                       |
| DELETE | `/v1/admin/platform-users/:id`       | Revoke platform access (does NOT delete the underlying user) |
| GET    | `/v1/admin/platform-permissions`     | Read the seeded permission catalogue                         |

### Session 1.5B -- Audit Ledger + Error Redaction

| Method | Endpoint                                       | Purpose                                                           |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/v1/admin/platform-audit-logs`                | List + filter platform-side audit entries (paginated)             |
| GET    | `/v1/admin/platform-audit-logs/:id`            | Single entry detail with full payload                             |
| GET    | `/v1/admin/platform-error-log`                 | Read redacted error events (Layer 2D consumes this same endpoint) |
| POST   | `/v1/admin/platform-error-log/redaction-rules` | Manage the redaction regex rules (platform_owner only)            |

### Session 1.5C -- Confirmation UX + Alert Silencing

| Method | Endpoint                                    | Purpose                                                   |
| ------ | ------------------------------------------- | --------------------------------------------------------- |
| POST   | `/v1/admin/two-person-requests`             | Initiate a high-blast action (returns request id)         |
| POST   | `/v1/admin/two-person-requests/:id/approve` | Secondary approver approves; triggers the original action |
| POST   | `/v1/admin/two-person-requests/:id/reject`  | Secondary approver rejects; original action discarded     |
| POST   | `/v1/admin/alert-silences`                  | Create a silence (per-rule, per-component, or global)     |
| DELETE | `/v1/admin/alert-silences/:id`              | Remove a silence early                                    |
| POST   | `/v1/admin/maintenance-windows`             | Schedule a maintenance window (suppresses all alerts)     |
| DELETE | `/v1/admin/maintenance-windows/:id`         | Cancel a planned maintenance window                       |

**Total: 13 new REST endpoints across 3 sessions.**

---

## 6. New Frontend Pages/Components Summary

### Session 1.5A -- Platform Users + RBAC

- New page: `apps/web/src/app/[locale]/(platform)/admin/users/page.tsx` (platform users list + invite flow)
- New page: `apps/web/src/app/[locale]/(platform)/admin/users/[id]/page.tsx` (single user; edit roles)
- New page: `apps/web/src/app/[locale]/(platform)/admin/permissions/page.tsx` (read-only permission catalogue browser)
- Components: `PlatformUserCard`, `RoleSelector`, `InvitePlatformUserDialog`, `PermissionMatrixTable`

### Session 1.5B -- Audit Ledger + Error Redaction

- New page: `apps/web/src/app/[locale]/(platform)/admin/audit-log/platform/page.tsx` (cross-tenant operator actions)
- New page: `apps/web/src/app/[locale]/(platform)/admin/error-log/page.tsx` (redacted error feed)
- New page: `apps/web/src/app/[locale]/(platform)/admin/settings/redaction-rules/page.tsx` (redaction policy management)
- Components: `PlatformAuditTable`, `RedactedErrorCard`, `RedactionRuleEditor`

### Session 1.5C -- Confirmation UX + Alert Silencing

- Shared component: `<TwoPersonConfirmationDialog>` — wraps high-blast action triggers
- New page: `apps/web/src/app/[locale]/(platform)/admin/alerts/silences/page.tsx`
- New page: `apps/web/src/app/[locale]/(platform)/admin/maintenance/page.tsx`
- Components: `SilenceForm`, `MaintenanceWindowForm`, `ActiveSilenceBanner` (in admin layout header)

---

## 7. Testing Strategy

Mirrors the Layer 1 plan (unit, integration, e2e) plus:

- **Migration-from-Redis test**: Session 1.5A includes a one-shot test that takes a Redis-set state, runs the migration, and asserts every Redis-set entry now has a `platform_users` row + `platform_owner` role.
- **Audit completeness check**: Session 1.5B static-analysis test scans every controller method that mutates state on a cross-tenant resource and asserts the method either calls `PlatformAuditService.log()` OR carries an explicit `@SkipPlatformAudit('reason')` decorator. Missing audit = build failure (mirrors the Module Gating impl 07 static test pattern).
- **Redaction round-trip test**: Session 1.5B feeds a corpus of synthetic errors (containing fake emails, phone numbers, JWT-like strings, bank account numbers) through the redaction pipeline and asserts the post-redaction strings contain none of the originals.
- **Two-person approval e2e**: Session 1.5C Playwright test exercises the full "operator A initiates → operator B approves → action executes" flow including the email notification to operator B and the audit log entries.

### What We Mock

- Resend email provider (in invite + two-person notification tests)
- Redis set reads (in migration test)
- Cron tick (in maintenance window suppression test)

---

## 8. Definition of Done

Layer 1.5 is complete when ALL of the following are true:

- [ ] `platform_users` + role tables exist; existing `platform_owner_user_ids` Redis set is migrated and dropped
- [ ] `platform_owner` and `platform_support` roles seeded with correct permission sets per the master spec §2.1
- [ ] `PlatformRoleGuard` exists and is in use on every existing platform-side controller (replacing direct `platform_owner_user_ids` checks)
- [ ] Session 0 (stealth subdomain) auth check uses the new `platform_users` table instead of the Redis-set workaround
- [ ] Cross-tenant audit ledger receives writes from every existing platform-side mutation endpoint (verified by static-analysis test)
- [ ] Error log redaction policy is configurable; redaction round-trip test passes for the standard PII corpus
- [ ] Error log retention cron runs daily; rows older than 90 days are purged
- [ ] Two-person approval primitive exists and is used by at least one existing high-blast action (operator-side cache flush global is the natural first user, but Layer 2/3 destructive actions are the main consumers)
- [ ] Alert silencing UI lets the operator suppress a single rule or all alerts for a chosen window
- [ ] Maintenance window UI lets the operator pre-schedule a window during which no alerts fire
- [ ] All new code passes `turbo lint` and `turbo type-check`
- [ ] All new tests pass and no existing tests regress
- [ ] `docs/architecture/danger-zones.md` gains entries DZ-PA-1 (default-allow vs default-deny on missing role row), DZ-PA-2 (audit ledger append-only — never UPDATE/DELETE), DZ-PA-3 (redaction is destructive — never read raw errors after the redaction pipeline)
- [ ] `docs/architecture/pre-flight-checklist.md` gains a new §2d Platform RBAC check
