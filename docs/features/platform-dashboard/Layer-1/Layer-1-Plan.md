# Platform Admin Dashboard -- Layer 1: Operational Foundation

**Date:** 2026-04-01 (revised 2026-05-13: Session 0 stealth subdomain prerequisite added; revised 2026-05-14: shipped status updated, Layer 1.5 follow-on noted)
**Status:** In progress (1A + 1B shipped; 1C in progress; Session 0 + 1D pending)
**Sessions:** 5 (Session 0, 1A, 1B, 1C, 1D)
**Followed by:** Layer 1.5 — Platform Ops Safety (`docs/features/platform-dashboard/Layer-1.5/Layer-1.5-Plan.md`) — 3 sessions that ship before Layer 2 starts
**Design Spec:** `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`

---

## 1. What Layer 1 Delivers

Layer 1 transforms the platform admin dashboard from a static CRUD panel into a live operations centre. After this layer, the platform owner can:

- **See real-time system health** -- live status cards for PostgreSQL, Redis, Meilisearch, BullMQ, and Disk with latency metrics, uptime, and 24h sparkline trends
- **Receive and manage alerts** -- configurable alert rules that fire when health degrades, with email notifications via Resend, a full alert history, and acknowledge/resolve workflow
- **Track tenant onboarding** -- a persistent step-by-step pipeline per tenant with auto-completion for system-detectable events, inline actions, and progress visibility from the tenant list

The foundation is a **WebSocket infrastructure** that powers all real-time updates across the dashboard.

---

## 2. Prerequisites

Before starting any Layer 1 session:

| Prerequisite                   | Status     | Notes                                                                                                      |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Design spec approved           | Done       | `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`                                     |
| Existing platform admin area   | Done       | `apps/web/src/app/[locale]/(platform)/admin/` with dashboard, tenants, audit-log, security-incidents pages |
| Existing health module         | Done       | `apps/api/src/modules/health/` with HealthService, HealthController                                        |
| Existing PlatformOwnerGuard    | Done       | `apps/api/src/modules/tenants/guards/platform-owner.guard.ts`                                              |
| Existing Resend email provider | Done       | `apps/api/src/modules/communications/providers/resend-email.provider.ts`                                   |
| Existing RedisService          | Done       | `apps/api/src/modules/redis/redis.service.ts` (global module)                                              |
| NPM packages to install        | **Needed** | `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (API); `socket.io-client` (Web)            |

---

## 3. Session Dependency Graph

```
Session 0: Stealth Subdomain (dua.edupod.app)        [PREREQUISITE — runs first]
    |
    +---> Session 1A: WebSocket Infrastructure + Redis Pub/Sub
              |
              +---> Session 1B: Health Dashboard (depends on 1A for real-time updates)
              |         |
              |         +---> Session 1C: Alert Framework (depends on 1B for health state change events)
              |
              +---> Session 1D: Onboarding Tracker (depends on 1A for real-time onboarding step updates)
```

**Execution order:** Session 0 (stealth subdomain) lands first — every subsequent dashboard URL lives at `dua.edupod.app` and depends on that routing/cookie infrastructure. Then 1A. Then 1B and 1D can run in parallel. 1C follows 1B. After 1D ships, **Layer 1.5 — Platform Ops Safety** runs as a prerequisite for Layer 2 + Layer 4 (RBAC + audit ledger + confirmation primitives must land before any dangerous action surface or AI Copilot reads the system).

**Recommended sequential order:** 0 -> 1A -> 1B -> 1C -> 1D -> 1.5A -> 1.5B -> 1.5C -> Layer 2

**Current shipped status (2026-05-14):**

- ✅ Session 1A: WebSocket infrastructure + Redis pub/sub
- ✅ Session 1B: Health dashboard with real-time updates
- 🚧 Session 1C: Alert framework — in progress
- ⏳ Session 0: Stealth subdomain — pending (DNS step requires operator coordination)
- ⏳ Session 1D: Onboarding tracker — pending

---

## 4. Database Migration Summary

### New Tables

All tables are **platform-level** -- no `tenant_id` column, no RLS policies.

| Table                       | Session | Purpose                                                  |
| --------------------------- | ------- | -------------------------------------------------------- |
| `platform_health_snapshots` | 1B      | Periodic health check results (every 60s) for trend data |
| `platform_alert_rules`      | 1C      | Configurable alert conditions                            |
| `platform_alert_history`    | 1C      | Fired alert records with acknowledge/resolve workflow    |
| `tenant_onboarding_steps`   | 1D      | Per-tenant onboarding pipeline steps                     |

### Modified Tables

| Table     | Session | Change                                                               |
| --------- | ------- | -------------------------------------------------------------------- |
| `tenants` | 1D      | Add `billing_status` enum column (`active`, `past_due`, `cancelled`) |

### New Enums

| Enum                   | Session | Values                                                      |
| ---------------------- | ------- | ----------------------------------------------------------- |
| `OnboardingPhase`      | 1D      | `infrastructure`, `data`, `configuration`, `go_live`        |
| `OnboardingStepStatus` | 1D      | `pending`, `in_progress`, `completed`, `skipped`, `blocked` |
| `AlertSeverity`        | 1C      | `info`, `warning`, `critical`                               |
| `AlertStatus`          | 1C      | `fired`, `acknowledged`, `resolved`                         |
| `BillingStatus`        | 1D      | `active`, `past_due`, `cancelled`                           |

### Single Migration

All tables and enums will be created in a single migration: `YYYYMMDDHHMMSS_add_platform_dashboard_layer_1_tables`. This avoids migration ordering issues across sessions.

---

## 5. New API Endpoints Summary

### Session 0 -- Stealth Subdomain

No new REST endpoints. Modifies the existing `POST /v1/auth/login` to honour the `Host` header for platform-credential / tenant-credential isolation. See `Session-0-stealth-subdomain.md` for full details (DNS, nginx, Next.js host-routing middleware, JWT cookie domain scoping, 404-by-default behaviour).

### Session 1A -- WebSocket

No REST endpoints. WebSocket gateway at `ws://dua.edupod.app/platform` (Socket.IO namespace; bound to the stealth subdomain per Session 0).

### Session 1B -- Health Dashboard

| Method | Endpoint                   | Purpose                                       |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/v1/admin/health/history` | Health snapshot history (last 24h, paginated) |

### Session 1C -- Alert Framework

| Method | Endpoint                                   | Purpose                      |
| ------ | ------------------------------------------ | ---------------------------- |
| GET    | `/v1/admin/alerts/rules`                   | List alert rules             |
| POST   | `/v1/admin/alerts/rules`                   | Create alert rule            |
| PATCH  | `/v1/admin/alerts/rules/:id`               | Update alert rule            |
| DELETE | `/v1/admin/alerts/rules/:id`               | Delete alert rule            |
| GET    | `/v1/admin/alerts/history`                 | Alert history with filtering |
| PATCH  | `/v1/admin/alerts/history/:id/acknowledge` | Acknowledge an alert         |

### Session 1D -- Onboarding Tracker

| Method | Endpoint                                   | Purpose                             |
| ------ | ------------------------------------------ | ----------------------------------- |
| GET    | `/v1/admin/tenants/:id/onboarding`         | Get onboarding tracker for a tenant |
| PATCH  | `/v1/admin/tenants/:id/onboarding/:stepId` | Update an onboarding step           |
| POST   | `/v1/admin/tenants/:id/onboarding/reset`   | Reset onboarding tracker            |

**Total: 10 new REST endpoints + 1 WebSocket gateway**

---

## 6. New Frontend Pages/Components Summary

### Session 1A -- WebSocket (no pages)

- `PlatformSocketProvider` context provider (wraps platform layout)
- `usePlatformSocket()` hook for components to subscribe to channels

### Session 1B -- Health Dashboard

- New page: `apps/web/src/app/[locale]/(platform)/admin/health/page.tsx`
- Components: `HealthStatusCard`, `LatencySparkline`, `OverallStatusBanner`

### Session 1C -- Alert Framework

- New page: `apps/web/src/app/[locale]/(platform)/admin/alerts/page.tsx`
- Components: `AlertHistoryTable`, `AlertRuleList`, `AlertRuleForm`, `AlertBadge` (in layout)

### Session 1D -- Onboarding Tracker

- Component: `OnboardingTracker` (embedded in tenant detail page)
- Component: `OnboardingProgress` (progress bar on tenant list cards)
- Modified page: tenant detail page gains onboarding tab

---

## 7. Testing Strategy

### Unit Tests (co-located with source)

- **1A:** WebSocket gateway auth handshake (accept/reject), Redis pub/sub message routing
- **1B:** Health snapshot cron logic, state change detection, history query
- **1C:** Alert rule evaluation logic (all operators), cooldown enforcement, email dispatch (mocked), CRUD operations
- **1D:** Onboarding step auto-completion triggers, dependency checking (`blocked_by`), step status transitions

### Integration Tests

- **1B:** Health history endpoint returns correct time-range data
- **1C:** Full alert lifecycle: create rule -> metric breaches threshold -> alert fires -> acknowledge -> resolve
- **1D:** Tenant creation seeds default onboarding steps

### What We Mock

- Redis pub/sub (in unit tests)
- Resend email provider (in alert dispatch tests)
- WebSocket client connections (in gateway tests)
- `HealthService.check()` (in snapshot cron tests -- return deterministic results)

---

## 8. Definition of Done

Layer 1 is complete when ALL of the following are true:

- [ ] WebSocket gateway authenticates platform owners and rejects all others
- [ ] Redis pub/sub channels (`platform:health`, `platform:alerts`, `platform:onboarding`) are operational
- [ ] Health page shows real-time status for all 5 components with latency and 24h sparklines
- [ ] Health state changes (healthy -> degraded -> unhealthy) are detected and published in real-time
- [ ] Alert rules can be created, updated, enabled/disabled, and deleted via the UI
- [ ] Alert evaluation cron fires alerts when conditions are met, respects cooldown periods
- [ ] Alert email notifications are sent via Resend when alerts fire
- [ ] Alert history shows all fired alerts with acknowledge button that records actor and timestamp
- [ ] Tenant creation automatically seeds 15 default onboarding steps
- [ ] Auto-completion triggers fire for `domain_configured`, `ssl_verified`, `owner_account_created`
- [ ] Onboarding tracker displays on tenant detail page with step cards grouped by phase
- [ ] Tenant list shows onboarding progress indicator per tenant
- [ ] `billing_status` column exists on `tenants` table
- [ ] All new code passes `turbo lint` and `turbo type-check`
- [ ] All new tests pass and no existing tests regress
- [ ] Platform layout sidebar includes Health and Alerts nav items
