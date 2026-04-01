# Layer 3 Plan -- Polish & Operations

**Layer:** 3 of 3
**Sessions:** 3A, 3B, 3C, 3D
**Status:** Planned
**Prerequisites:** Layer 1 (Operational Foundation) and Layer 2 (Intelligence & Power Tools) must be complete

---

## 1. Overview

Layer 3 transforms the platform admin dashboard from a monitoring/intelligence tool into a full operational command centre. It delivers:

- **Dashboard Home Redesign (3A)** -- Replace the 4-stat-card dashboard with a mixed layout (health strip, active alerts panel, tenant cards with live metrics, real-time activity feed, quick actions).
- **Support Toolkit (3B)** -- Six platform support actions (password reset, MFA reset, resend invite, unlock account, transfer ownership, disable/enable user) with a full audit trail.
- **Session & Cache Management + Maintenance Mode (3C)** -- Active session visibility, force-logout, cache flushing, and per-tenant maintenance mode with scheduled windows.
- **Platform Users & Navigation Redesign (3D)** -- Replace the Redis-set approach with a `platform_users` table, implement two roles (`platform_owner`, `platform_support`), global search (Cmd+K), and a grouped sidebar navigation.

After Layer 3, the platform admin dashboard is feature-complete per the design spec.

---

## 2. Session Dependency Graph

```
3A: Dashboard Home Redesign
  Depends on: Layer 1 (WebSocket, health, alerts, onboarding APIs)
              Layer 2 (tenant metrics, queues, error diagnostics APIs)
  Reason: Consumes all existing endpoints. No new backend work.
  Can start: First (no Layer 3 internal dependencies)

3B: Support Toolkit
  Depends on: Layer 1 + Layer 2 complete
  Can start: In parallel with 3A
  No dependency on 3A, 3C, or 3D

3C: Session & Cache Management + Maintenance Mode
  Depends on: Layer 1 + Layer 2 complete
  Can start: In parallel with 3A and 3B
  No dependency on 3A, 3B, or 3D

3D: Platform Users & Navigation Redesign
  Depends on: 3B (support actions exist and are accessible from the sidebar)
              3C (sessions/cache page exists and needs a sidebar entry)
  Reason: Sidebar redesign must include all pages from 3B and 3C
  Must be: Last
```

**Recommended execution order:** 3A -> 3B -> 3C -> 3D (sequential) or 3A | 3B | 3C (parallel) -> 3D (last).

---

## 3. Database Migration Summary

### New Tables

| Table                        | Session | RLS | Purpose                                                                                               |
| ---------------------------- | ------- | --- | ----------------------------------------------------------------------------------------------------- |
| `platform_audit_actions`     | 3B      | NO  | Audit trail for all platform support actions                                                          |
| `tenant_maintenance_windows` | 3C      | NO  | Scheduled maintenance windows per tenant (has `tenant_id` FK but no RLS -- platform admins manage it) |
| `platform_users`             | 3D      | NO  | Platform-level user management with roles                                                             |

### Modified Tables

| Table     | Session | Change                                                                        |
| --------- | ------- | ----------------------------------------------------------------------------- |
| `tenants` | 3C      | Add `maintenance_mode BOOLEAN DEFAULT false`, `maintenance_message TEXT NULL` |

### New Enums

| Enum                      | Session | Values                                                                                                                |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `PlatformAuditActionType` | 3B      | `password_reset`, `mfa_reset`, `resend_invite`, `unlock_account`, `transfer_ownership`, `disable_user`, `enable_user` |
| `PlatformUserRole`        | 3D      | `platform_owner`, `platform_support`                                                                                  |

### Migration Files

All in `packages/prisma/migrations/`:

| Migration Name                                        | Session |
| ----------------------------------------------------- | ------- |
| `YYYYMMDDHHMMSS_add_platform_audit_actions_table`     | 3B      |
| `YYYYMMDDHHMMSS_add_tenant_maintenance_fields`        | 3C      |
| `YYYYMMDDHHMMSS_add_tenant_maintenance_windows_table` | 3C      |
| `YYYYMMDDHHMMSS_add_platform_users_table`             | 3D      |

---

## 4. New API Endpoints Summary

### Session 3B -- Support Toolkit

| Method | Endpoint                                   | Purpose                                 |
| ------ | ------------------------------------------ | --------------------------------------- |
| POST   | `/v1/admin/users/:id/reset-password`       | Trigger password reset email            |
| POST   | `/v1/admin/users/:id/resend-invite`        | Re-send welcome invitation              |
| POST   | `/v1/admin/users/:id/unlock`               | Unlock brute-force locked account       |
| POST   | `/v1/admin/users/:id/disable`              | Disable user at platform level          |
| POST   | `/v1/admin/users/:id/enable`               | Enable user at platform level           |
| POST   | `/v1/admin/tenants/:id/transfer-ownership` | Transfer tenant owner role              |
| GET    | `/v1/admin/audit-actions`                  | List platform audit actions (paginated) |

### Session 3C -- Session & Cache Management + Maintenance Mode

| Method | Endpoint                              | Purpose                                |
| ------ | ------------------------------------- | -------------------------------------- |
| GET    | `/v1/admin/sessions`                  | List active sessions grouped by tenant |
| DELETE | `/v1/admin/sessions/tenant/:tenantId` | Force-logout all users in a tenant     |
| DELETE | `/v1/admin/sessions/user/:userId`     | Force-logout a specific user           |
| POST   | `/v1/admin/cache/flush`               | Flush caches (scoped or global)        |
| PATCH  | `/v1/admin/tenants/:id/maintenance`   | Toggle maintenance mode + set message  |
| GET    | `/v1/admin/maintenance-windows`       | List all maintenance windows           |
| POST   | `/v1/admin/maintenance-windows`       | Create scheduled maintenance window    |
| DELETE | `/v1/admin/maintenance-windows/:id`   | Cancel a scheduled maintenance window  |

### Session 3D -- Platform Users & Navigation

| Method | Endpoint                       | Purpose                                           |
| ------ | ------------------------------ | ------------------------------------------------- |
| GET    | `/v1/admin/platform-users`     | List platform users                               |
| POST   | `/v1/admin/platform-users`     | Invite a platform user                            |
| PATCH  | `/v1/admin/platform-users/:id` | Update platform user role/status                  |
| DELETE | `/v1/admin/platform-users/:id` | Remove platform user                              |
| GET    | `/v1/admin/search`             | Global search across tenants, users, alerts, jobs |

---

## 5. New Frontend Pages/Components Summary

### Session 3A -- Dashboard Home Redesign

| Type         | Path                                                                             | Description                        |
| ------------ | -------------------------------------------------------------------------------- | ---------------------------------- |
| Page rewrite | `apps/web/src/app/[locale]/(platform)/admin/page.tsx`                            | Complete rewrite of dashboard home |
| Component    | `apps/web/src/app/[locale]/(platform)/admin/_components/health-strip.tsx`        | Horizontal health status bar       |
| Component    | `apps/web/src/app/[locale]/(platform)/admin/_components/active-alerts-panel.tsx` | Unacknowledged alerts panel        |
| Component    | `apps/web/src/app/[locale]/(platform)/admin/_components/tenant-cards.tsx`        | Tenant summary cards with metrics  |
| Component    | `apps/web/src/app/[locale]/(platform)/admin/_components/activity-feed.tsx`       | Real-time platform activity feed   |
| Component    | `apps/web/src/app/[locale]/(platform)/admin/_components/quick-actions.tsx`       | Quick action button bar            |

### Session 3B -- Support Toolkit

| Type      | Path                                                                               | Description                                    |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| Component | `apps/web/src/app/[locale]/(platform)/admin/_components/support-action-dialog.tsx` | Shared confirmation dialog for support actions |
| Component | `apps/web/src/app/[locale]/(platform)/admin/_components/support-actions-panel.tsx` | Support actions section for tenant/user detail |
| Component | `apps/web/src/app/[locale]/(platform)/admin/_components/audit-actions-table.tsx`   | Audit trail table for support actions          |
| Page      | `apps/web/src/app/[locale]/(platform)/admin/users/page.tsx`                        | Platform user search page                      |
| Page      | `apps/web/src/app/[locale]/(platform)/admin/users/[id]/page.tsx`                   | User detail page with support actions          |

### Session 3C -- Session & Cache Management + Maintenance Mode

| Type      | Path                                                                                      | Description                           |
| --------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Page      | `apps/web/src/app/[locale]/(platform)/admin/sessions/page.tsx`                            | Sessions, cache, and maintenance page |
| Component | `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/active-sessions-tab.tsx` | Active sessions table                 |
| Component | `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/cache-control-tab.tsx`   | Cache management cards                |
| Component | `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/maintenance-tab.tsx`     | Maintenance mode controls             |

### Session 3D -- Platform Users & Navigation Redesign

| Type           | Path                                                                                      | Description                    |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| Page           | `apps/web/src/app/[locale]/(platform)/admin/platform-users/page.tsx`                      | Platform users management page |
| Component      | `apps/web/src/app/[locale]/(platform)/admin/platform-users/_components/invite-dialog.tsx` | Invite platform user dialog    |
| Component      | `apps/web/src/app/[locale]/(platform)/admin/_components/global-search.tsx`                | Command palette (Cmd+K) search |
| Layout rewrite | `apps/web/src/app/[locale]/(platform)/layout.tsx`                                         | Grouped sidebar navigation     |

---

## 6. Testing Strategy

### Per-Session Testing

Each session must include:

1. **Unit tests** for all new service methods (co-located `.spec.ts` files)
2. **Controller tests** for all new endpoints (happy path + permission denied)
3. **Guard tests** for any new/modified guards

### Cross-Session Testing

After all sessions are complete:

1. **Regression test suite** -- `turbo test` must pass with zero failures
2. **Manual verification** on production after deploy:
   - Dashboard home loads with live data from all panels
   - Each of the 6 support actions works and shows in audit trail
   - Session listing reflects real active sessions; force-logout works
   - Cache flush + maintenance mode toggle works
   - Platform user invite flow works end-to-end
   - Navigation sidebar groups are correct, active states work
   - Global search returns results across all categories

### RLS Considerations

All new tables in Layer 3 are platform-level (no RLS). However:

- `tenant_maintenance_windows` has a `tenant_id` FK. It must NOT have an RLS policy -- platform admins manage it, not tenants. Verify this explicitly.
- Support actions that touch tenant-scoped data (e.g., transfer ownership modifies `membership_roles`) must use RLS-aware transactions for the tenant-scoped writes.

---

## 7. Definition of Done

Layer 3 is complete when:

- [ ] All 4 sessions (3A, 3B, 3C, 3D) are implemented and deployed
- [ ] All new API endpoints respond correctly with proper auth guards
- [ ] All new database tables exist with correct constraints and no RLS
- [ ] `tenants` table has `maintenance_mode` and `maintenance_message` columns
- [ ] `PlatformOwnerGuard` reads from `platform_users` table (with Redis cache fallback)
- [ ] `PlatformRoleGuard` enforces minimum role level where needed
- [ ] Dashboard home shows live health, alerts, tenant cards, and activity feed
- [ ] All 6 support actions work and are audit-logged
- [ ] Session management page shows real sessions with force-logout capability
- [ ] Cache flush works for all cache types (permissions, domains, modules)
- [ ] Maintenance mode blocks mutations for target tenant, allows reads
- [ ] Platform users can be invited, edited, and deactivated
- [ ] Sidebar uses grouped navigation matching the design spec
- [ ] Global search (Cmd+K) finds tenants, users, alerts, and jobs
- [ ] `turbo test` passes with zero regressions
- [ ] `turbo lint` and `turbo type-check` pass cleanly
- [ ] All production verification steps pass
