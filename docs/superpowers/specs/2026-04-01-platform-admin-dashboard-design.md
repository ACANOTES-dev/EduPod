# Platform Admin Dashboard — Design Specification

**Date:** 2026-04-01
**Status:** Approved
**Scope:** Complete redesign and expansion of the EduPod platform admin dashboard

---

## 1. Context

EduPod is a multi-tenant school management SaaS with ~40 modules, ~1,048 API endpoints, 56 worker jobs, and two tenants pending onboarding. The existing platform admin dashboard was built early when the product had a fraction of its current scope. It provides basic tenant CRUD, an audit log, security incident tracking, and 4 stat cards. There is no health monitoring frontend (the backend endpoint exists but the nav link is dead), no alerting, no queue visibility, no onboarding workflow, and limited support tooling.

The platform admin dashboard must become a world-class operations centre — the single place from which the platform owner and a small ops team can monitor system health, onboard tenants, diagnose issues, manage alerts, and perform support actions without SSH access.

## 2. Requirements

### 2.1 Audience

- **Now:** Platform owner (Ram) + 1-2 support/ops staff
- **Later:** Full platform team with distinct roles
- **Implementation:** Two roles now (`platform_owner`, `platform_support`), data model supports adding more later
- `platform_support` gets read access + impersonation + support toolkit. Cannot suspend/archive tenants.

### 2.2 Philosophy

- Know about problems before the tenant does
- Maximum operational power from the browser — no SSH needed
- Aggregate tenant visibility only — no access to private data (student records, grades, behaviour, staff bank details, communication content)
- Read-only impersonation for support

### 2.3 Real-Time

- Full WebSocket via NestJS `@WebSocketGateway()` + Redis pub/sub
- Health indicators, queue depths, alerts, and activity feed update in real-time
- JWT-authenticated WebSocket handshake, platform-owner/support only

### 2.4 Alerting

- Multi-channel: email (Resend), Telegram bot, WhatsApp (Twilio), browser push notifications
- Fully configurable rules engine with condition builder, severity levels, cooldown periods
- Per-rule channel routing (e.g., critical → Telegram + email, warning → email only)

### 2.5 Tenant Visibility Boundaries

| Visible                                      | Not Visible                              |
| -------------------------------------------- | ---------------------------------------- |
| Active user count, login frequency           | Individual student/staff/parent records  |
| Feature usage stats, module adoption         | Grades, behaviour incidents, attendance  |
| Aggregate counts (students, staff, invoices) | Financial details, bank details, payroll |
| Error rates, API usage patterns              | Communication content (emails, messages) |
| Configuration state, settings values         | Tenant audit logs                        |
| System-generated metrics                     | Personal contact details                 |

### 2.6 Billing

- Simple manual status field on tenant: `active` / `past_due` / `cancelled`
- No Stripe integration, no automated billing
- Placeholder for future billing layer

### 2.7 Onboarding

- Hybrid tracker: persistent pipeline with ~15 steps grouped by phase
- Auto-completion for system-detectable steps (domain added, owner created, etc.)
- Inline actions (create owner, import data, configure settings)
- Dependencies between steps (can't send welcome email before owner exists)
- Progress visible from tenant list

### 2.8 Support Toolkit

Six platform-level support actions:

1. **Password reset** — trigger reset email (platform never sees password)
2. **MFA reset** — disable MFA so user can re-enrol
3. **Re-send welcome invite** — for expired or uncompleted invitations
4. **Unlock account** — override brute-force 30-minute lockout
5. **Transfer ownership** — reassign tenant owner role
6. **Disable/enable user** — platform-level user access toggle

All support actions are audit-logged with actor, action, target, timestamp.

## 3. Architecture

### 3.1 WebSocket Infrastructure

```
Browser (Socket.IO client)
    ↕ WSS (JWT in handshake)
NestJS WebSocket Gateway (PlatformGateway)
    ↕ Subscribe
Redis Pub/Sub channels:
    platform:health      — health check state changes
    platform:alerts      — new/resolved alerts
    platform:queues      — queue depth, failures, stuck jobs
    platform:activity    — platform-level activity feed
    platform:onboarding  — onboarding step completions
```

**Event flow:**

1. Health service runs checks on interval → publishes state change to `platform:health`
2. BullMQ event listeners detect failures/stuck → publish to `platform:queues`
3. Alert evaluation service matches conditions → publishes to `platform:alerts`
4. Gateway receives Redis messages → broadcasts to authenticated WS clients

### 3.2 Alert Rules Engine

```
platform_alert_rules
├── id (UUID)
├── name (VARCHAR) — human-readable rule name
├── metric (VARCHAR) — enum: health_status, queue_depth, error_rate, job_failure, etc.
├── condition_config (JSONB) — structured condition definition
│   {
│     "operator": "gt" | "lt" | "eq" | "gte" | "lte",
│     "threshold": number,
│     "duration_minutes": number (optional, sustained condition),
│     "queue": string (optional, for queue-specific rules),
│     "component": string (optional, for health-specific rules),
│     "tenant_id": UUID (optional, for tenant-specific rules)
│   }
├── severity (ENUM: info, warning, critical)
├── cooldown_minutes (INTEGER) — minimum time between re-fires
├── is_enabled (BOOLEAN)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

platform_alert_channels
├── id (UUID)
├── type (ENUM: email, telegram, whatsapp, push)
├── config (JSONB) — channel-specific config (encrypted where needed)
│   email: { recipients: ["ram@example.com"] }
│   telegram: { bot_token: "encrypted", chat_id: "123" }
│   whatsapp: { to_number: "+353..." }
│   push: { subscription: {...} }
├── is_enabled (BOOLEAN)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

platform_alert_rule_channels (join table)
├── rule_id (FK → platform_alert_rules)
└── channel_id (FK → platform_alert_channels)

platform_alert_history
├── id (UUID)
├── rule_id (FK → platform_alert_rules)
├── severity (ENUM)
├── message (TEXT) — generated alert message
├── metric_value (NUMERIC) — the value that triggered the alert
├── channels_notified (TEXT[]) — which channels were used
├── status (ENUM: fired, acknowledged, resolved)
├── fired_at (TIMESTAMPTZ)
├── acknowledged_at (TIMESTAMPTZ, nullable)
├── resolved_at (TIMESTAMPTZ, nullable)
└── acknowledged_by (UUID FK → users, nullable)
```

**Evaluation loop:**

- A cron job (every 30s) collects current metric values
- For each enabled rule: evaluate condition against current value
- If condition met and cooldown has elapsed: fire alert → dispatch to configured channels → publish to `platform:alerts` WebSocket channel
- If condition was previously met and is now clear: auto-resolve → publish resolution

### 3.3 Onboarding Tracker

```
tenant_onboarding_steps
├── id (UUID)
├── tenant_id (FK → tenants)
├── phase (ENUM: infrastructure, data, configuration, go_live)
├── step_key (VARCHAR) — unique key per step type
├── label (VARCHAR) — human-readable step name
├── description (TEXT)
├── status (ENUM: pending, in_progress, completed, skipped, blocked)
├── is_auto (BOOLEAN) — true if system can auto-detect completion
├── blocked_by (TEXT[]) — array of step_keys that must complete first
├── completed_at (TIMESTAMPTZ, nullable)
├── completed_by (UUID FK → users, nullable)
├── metadata (JSONB) — step-specific data (e.g., import row count)
├── sort_order (INTEGER)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

**Default steps (created when tenant is created):**

| Phase          | Step Key                | Label                           | Auto? | Blocked By              |
| -------------- | ----------------------- | ------------------------------- | ----- | ----------------------- |
| infrastructure | `domain_configured`     | Custom domain added             | Yes   | —                       |
| infrastructure | `ssl_verified`          | SSL certificate active          | Yes   | `domain_configured`     |
| infrastructure | `modules_configured`    | Modules enabled/disabled        | No    | —                       |
| infrastructure | `billing_status_set`    | Billing status confirmed        | No    | —                       |
| data           | `owner_account_created` | School owner account created    | Yes   | —                       |
| data           | `owner_welcomed`        | Welcome email sent to owner     | No    | `owner_account_created` |
| data           | `staff_imported`        | Staff data imported             | No    | `owner_account_created` |
| data           | `students_imported`     | Student data imported           | No    | `owner_account_created` |
| data           | `parents_imported`      | Parent data imported            | No    | `students_imported`     |
| configuration  | `academic_year_set`     | Academic year configured        | No    | `owner_account_created` |
| configuration  | `classes_set_up`        | Classes and year groups created | No    | `academic_year_set`     |
| configuration  | `settings_reviewed`     | Tenant settings reviewed        | No    | `modules_configured`    |
| configuration  | `roles_reviewed`        | Roles and permissions reviewed  | No    | `owner_account_created` |
| go_live        | `owner_trained`         | Owner walkthrough completed     | No    | `owner_welcomed`        |
| go_live        | `go_live_confirmed`     | Tenant marked as live           | No    | All above               |

**Auto-completion triggers:**

- `domain_configured` → fires when a domain record is created for the tenant
- `ssl_verified` → fires when domain `ssl_status` = `active`
- `owner_account_created` → fires when a user with `school_owner` role exists for the tenant

### 3.4 Health Monitoring

Extends the existing `/health` endpoint with:

- **History:** `platform_health_snapshots` table stores periodic check results (every 60s)
- **Trend data:** Last 24 hours of component latency for sparkline charts
- **State change detection:** When a component goes from healthy → degraded → unhealthy, publish to Redis and evaluate alert rules
- **Frontend:** Real-time status cards per component (Postgres, Redis, Meilisearch, BullMQ, Disk) with latency, uptime percentage, and 24h sparkline

### 3.5 Queue Management

Uses BullMQ's built-in introspection API:

- `queue.getJobCounts()` — waiting, active, completed, failed, delayed, paused
- `queue.getFailed()` — list failed jobs with error stacks
- `queue.getJob(id)` — inspect individual job payload and state
- `queue.retryJob(id)` — retry a failed job
- `queue.pause()` / `queue.resume()` — pause/resume processing
- `queue.clean(grace, status)` — clear completed/failed jobs

No new database tables needed — reads directly from Redis/BullMQ.

### 3.6 Session & Cache Management

Uses existing Redis infrastructure:

- **Sessions:** Enumerate keys matching `session:*`, group by tenant, show count and last activity
- **Force logout:** Delete session keys for a tenant or specific user, invalidate refresh tokens
- **Cache flush:** Delete keys matching `permissions:*`, `tenant_modules:*`, `domain:*` for a specific tenant or globally
- **Maintenance mode:** `tenants.maintenance_mode` boolean + `tenants.maintenance_message` text. When enabled, the tenant-facing app shows a maintenance banner and blocks mutations.

### 3.7 Tenant Aggregate Metrics

```
platform_tenant_metrics
├── id (UUID)
├── tenant_id (FK → tenants)
├── snapshot_date (DATE)
├── metrics (JSONB)
│   {
│     "students_count": number,
│     "staff_count": number,
│     "parents_count": number,
│     "active_users_24h": number,
│     "active_users_7d": number,
│     "invoices_total": number,
│     "invoices_overdue": number,
│     "attendance_rate_avg": number,
│     "api_requests_24h": number,
│     "errors_24h": number,
│     "storage_mb": number,
│     "modules_enabled": string[],
│     "last_login_at": timestamp
│   }
├── created_at (TIMESTAMPTZ)
└── UNIQUE(tenant_id, snapshot_date)
```

Collected daily by a cron job. The dashboard reads the latest snapshot for each tenant plus optional historical trend.

### 3.8 Error Diagnostics

```
platform_error_log
├── id (UUID)
├── tenant_id (FK → tenants, nullable — null for platform-level errors)
├── error_code (VARCHAR)
├── message (TEXT)
├── stack_trace (TEXT)
├── endpoint (VARCHAR) — the API route that errored
├── http_status (INTEGER)
├── user_id (UUID, nullable)
├── request_id (VARCHAR) — for correlation
├── created_at (TIMESTAMPTZ)
└── INDEX on (tenant_id, created_at DESC)
```

Populated by an **additive** NestJS global exception filter that logs 5xx errors (and optionally 4xx). This filter does not replace existing error handling — it runs alongside it, inserting a row into `platform_error_log` after the normal error response is sent. The diagnostics UI shows errors grouped by type, filterable by tenant, with stack traces expandable. A daily cleanup cron removes entries older than 30 days to prevent unbounded growth.

### 3.9 Platform Users

```
platform_users
├── id (UUID)
├── user_id (FK → users)
├── role (ENUM: platform_owner, platform_support)
├── invited_by (UUID FK → users)
├── invited_at (TIMESTAMPTZ)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

Replaces the current Redis-set approach (`platform_owner_user_ids` Redis set) with a proper table. **Migration path:** A data migration reads the existing Redis set and seed data, inserts corresponding rows into `platform_users`, then the `PlatformOwnerGuard` is updated to check this table (with Redis cache, same TTL pattern). The Redis set is deprecated but kept as fallback during rollout. `platform_support` role gets read + impersonate access, blocked from suspend/archive/delete operations.

### 3.10 Dashboard Home Layout

```
┌──────────────────────────────────────────────────────────┐
│  HEALTH STRIP                                            │
│  [Postgres ●] [Redis ●] [Meilisearch ●] [BullMQ ●] [Disk ●] │
├──────────────────────────────────────────────────────────┤
│  ACTIVE ALERTS                              (View All →) │
│  ⚠ Queue depth > 100 on notifications     2 min ago      │
│  🔴 Health: Meilisearch degraded           5 min ago      │
├──────────────────────────────────────────────────────────┤
│  TENANTS                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ School A    │ │ School B    │ │ + New       │        │
│  │ ● Active    │ │ ◐ Onboarding│ │             │        │
│  │ 340 students│ │ Step 6/15   │ │             │        │
│  │ 28 staff    │ │ 0 users     │ │             │        │
│  │ 12 online   │ │             │ │             │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
├──────────────────────────────────────────────────────────┤
│  RECENT ACTIVITY                            (View All →) │
│  Ram reset MFA for user@school-a.com       10 min ago    │
│  Tenant "School A" module SEN enabled      1 hour ago    │
│  Alert resolved: Queue depth normalised    2 hours ago   │
└──────────────────────────────────────────────────────────┘
```

## 4. New Database Tables Summary

| Table                          | Layer | Purpose                               |
| ------------------------------ | ----- | ------------------------------------- |
| `platform_health_snapshots`    | 1     | Periodic health check history         |
| `platform_alert_rules`         | 1     | Configurable alert conditions         |
| `platform_alert_history`       | 1     | Fired alert records                   |
| `tenant_onboarding_steps`      | 1     | Per-tenant onboarding pipeline        |
| `platform_alert_channels`      | 2     | Alert channel configurations          |
| `platform_alert_rule_channels` | 2     | Rule-to-channel mapping               |
| `platform_error_log`           | 2     | Aggregated API errors for diagnostics |
| `platform_tenant_metrics`      | 2     | Daily tenant aggregate snapshots      |
| `platform_users`               | 3     | Platform-level user management        |
| `platform_audit_actions`       | 3     | Support action audit trail            |
| `tenant_maintenance_windows`   | 3     | Scheduled maintenance records         |

**Modified tables:**

- `tenants` — add `billing_status` enum, `maintenance_mode` boolean, `maintenance_message` text

## 5. New API Endpoints Summary

### Layer 1

| Method | Endpoint                                   | Purpose                            |
| ------ | ------------------------------------------ | ---------------------------------- |
| GET    | `/v1/admin/health/history`                 | Health check history (24h)         |
| GET    | `/v1/admin/health/live`                    | WebSocket-compatible health stream |
| GET    | `/v1/admin/alerts/rules`                   | List alert rules                   |
| POST   | `/v1/admin/alerts/rules`                   | Create alert rule                  |
| PATCH  | `/v1/admin/alerts/rules/:id`               | Update alert rule                  |
| DELETE | `/v1/admin/alerts/rules/:id`               | Delete alert rule                  |
| GET    | `/v1/admin/alerts/history`                 | Alert history with filtering       |
| PATCH  | `/v1/admin/alerts/history/:id/acknowledge` | Acknowledge an alert               |
| GET    | `/v1/admin/tenants/:id/onboarding`         | Get onboarding tracker             |
| PATCH  | `/v1/admin/tenants/:id/onboarding/:stepId` | Update onboarding step             |
| POST   | `/v1/admin/tenants/:id/onboarding/reset`   | Reset onboarding tracker           |

### Layer 2

| Method | Endpoint                                | Purpose                                   |
| ------ | --------------------------------------- | ----------------------------------------- |
| GET    | `/v1/admin/alerts/channels`             | List alert channels                       |
| POST   | `/v1/admin/alerts/channels`             | Create channel                            |
| PATCH  | `/v1/admin/alerts/channels/:id`         | Update channel                            |
| DELETE | `/v1/admin/alerts/channels/:id`         | Delete channel                            |
| POST   | `/v1/admin/alerts/channels/:id/test`    | Send test alert                           |
| GET    | `/v1/admin/queues`                      | List all queues with stats                |
| GET    | `/v1/admin/queues/:name/jobs`           | List jobs in queue (filterable by status) |
| GET    | `/v1/admin/queues/:name/jobs/:id`       | Get job details                           |
| POST   | `/v1/admin/queues/:name/jobs/:id/retry` | Retry failed job                          |
| POST   | `/v1/admin/queues/:name/pause`          | Pause queue                               |
| POST   | `/v1/admin/queues/:name/resume`         | Resume queue                              |
| POST   | `/v1/admin/queues/:name/clean`          | Clean completed/failed jobs               |
| GET    | `/v1/admin/tenants/:id/metrics`         | Tenant aggregate metrics                  |
| GET    | `/v1/admin/tenants/:id/errors`          | Tenant error log                          |
| GET    | `/v1/admin/errors`                      | Platform-wide error log                   |

### Layer 3

| Method | Endpoint                                   | Purpose                           |
| ------ | ------------------------------------------ | --------------------------------- |
| POST   | `/v1/admin/users/:id/reset-password`       | Trigger password reset email      |
| POST   | `/v1/admin/users/:id/resend-invite`        | Re-send welcome invitation        |
| POST   | `/v1/admin/users/:id/unlock`               | Unlock brute-force locked account |
| POST   | `/v1/admin/users/:id/disable`              | Disable user at platform level    |
| POST   | `/v1/admin/users/:id/enable`               | Enable user at platform level     |
| POST   | `/v1/admin/tenants/:id/transfer-ownership` | Transfer tenant owner role        |
| GET    | `/v1/admin/sessions`                       | List active sessions              |
| DELETE | `/v1/admin/sessions/tenant/:tenantId`      | Force-logout all users in tenant  |
| DELETE | `/v1/admin/sessions/user/:userId`          | Force-logout specific user        |
| POST   | `/v1/admin/cache/flush`                    | Flush caches (scoped or global)   |
| PATCH  | `/v1/admin/tenants/:id/maintenance`        | Toggle maintenance mode           |
| GET    | `/v1/admin/platform-users`                 | List platform users               |
| POST   | `/v1/admin/platform-users`                 | Invite platform user              |
| PATCH  | `/v1/admin/platform-users/:id`             | Update platform user role/status  |
| DELETE | `/v1/admin/platform-users/:id`             | Remove platform user              |

## 6. Build Sequence

### Layer 1 — Operational Foundation (4 sessions)

1A: WebSocket infrastructure + Redis pub/sub
1B: Health dashboard with real-time updates
1C: Alert framework (rules, evaluation, email, history UI)
1D: Onboarding tracker with inline actions

### Layer 2 — Intelligence & Power Tools (4 sessions)

2A: Configurable alert rules engine UI
2B: Multi-channel alerting (Telegram, WhatsApp, push)
2C: Queue management & diagnostics
2D: Tenant analytics & error diagnostics

### Layer 3 — Polish & Operations (4 sessions)

3A: Dashboard home redesign
3B: Support toolkit (6 actions + audit trail)
3C: Session & cache management + maintenance mode
3D: Platform users & navigation redesign

**Total: 12 sessions across 3 layers.**

## 7. Navigation Structure (Final)

```
OVERVIEW
  Dashboard          — mixed home (health strip + alerts + tenants + activity)
  Health             — real-time component status with history

TENANTS
  All Tenants        — list with health/onboarding/billing indicators
  Onboarding         — cross-tenant onboarding progress view

OPERATIONS
  Alerts & Rules     — alert history + rules engine + channel config
  Queue Manager      — queue dashboard with job inspection + actions
  Sessions & Cache   — active sessions, cache control, maintenance mode

COMPLIANCE
  Audit Log          — existing platform audit log (enhanced)
  Security Incidents — existing GDPR incident tracking

SETTINGS
  Platform Users     — invite/manage ops team
  Channel Config     — alert channel setup (email, Telegram, WhatsApp, push)
```

## 8. Sequencing in Project Roadmap

Recommended order for remaining project phases:

1. Finish SEN implementation (Phases 6-7)
2. Static codebase audit
3. **Build Platform Dashboard (Layers 1-3)**
4. UX/UI revamp (tenant-facing)
5. E2E testing (with dashboard available for monitoring)
