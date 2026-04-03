# Layer 2 -- Intelligence & Power Tools

**Status:** Planning
**Prerequisites:** Layer 1 (Sessions 1A-1D) must be fully complete and deployed
**Sessions:** 2A, 2B, 2C, 2D
**Estimated new files:** ~35
**Estimated modified files:** ~12

---

## 1. Overview

Layer 2 transforms the platform admin dashboard from a monitoring surface into an actionable operations centre. It adds:

- **Configurable Alert Rules Engine UI** -- upgrade the basic alert rules from Layer 1C into a full condition-builder UI with severity levels, cooldown periods, and per-rule channel routing
- **Multi-Channel Alerting** -- extend email-only alerts with Telegram bot, WhatsApp (Twilio), and browser push notifications
- **Queue Management & Diagnostics** -- full BullMQ queue visibility and control (list, inspect, retry, pause/resume, clean) from the browser
- **Tenant Analytics & Error Diagnostics** -- daily per-tenant aggregate metrics, platform-wide error log with structured diagnostics

---

## 2. Prerequisites (Layer 1 Deliverables Required)

Layer 2 depends on the following Layer 1 deliverables being complete and deployed:

| Layer 1 Session | Deliverable                                                                                                     | Why Layer 2 Needs It                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1A              | WebSocket infrastructure (`PlatformGateway`, Redis pub/sub channels)                                            | 2C publishes queue metrics to `platform:queues` channel                  |
| 1A              | JWT-authenticated WebSocket handshake                                                                           | 2C real-time queue depth updates                                         |
| 1B              | Health dashboard with real-time updates                                                                         | 2A references health component names for `health_status` metric rules    |
| 1B              | `platform_health_snapshots` table                                                                               | 2A evaluates `health_status` metrics against snapshot data               |
| 1C              | Alert framework (`platform_alert_rules` table, `platform_alert_history` table, evaluation cron, email dispatch) | 2A extends alert rules with `condition_config`, 2B adds channel dispatch |
| 1C              | Alert history UI                                                                                                | 2A integrates with existing alert history page                           |
| 1D              | Onboarding tracker                                                                                              | No direct dependency but the complete navigation structure is needed     |

---

## 3. Session Dependency Graph

```
Layer 1 (complete)
    |
    v
  [2A] Configurable Alert Rules Engine UI
    |
    v
  [2B] Multi-Channel Alerting  (needs 2A's condition_config + per-rule channel assignment)

  [2C] Queue Management & Diagnostics  (independent of 2A/2B -- can run in parallel with 2A)
  [2D] Tenant Analytics & Error Diagnostics  (independent -- can run in parallel with 2A)
```

**Execution order:**

1. 2A must complete before 2B (channels need rules with `condition_config` and the rule-channel join model)
2. 2C and 2D are independent of each other and of 2A/2B -- they can run in parallel
3. Recommended sequence: **2A -> 2B**, with **2C** and **2D** running any time after Layer 1

---

## 4. Database Migration Summary

### New Tables

| Table                          | Session | Tenant-Scoped                                                   | RLS |
| ------------------------------ | ------- | --------------------------------------------------------------- | --- |
| `platform_alert_channels`      | 2B      | No                                                              | No  |
| `platform_alert_rule_channels` | 2B      | No                                                              | No  |
| `platform_tenant_metrics`      | 2D      | No (has `tenant_id` FK for correlation, not isolation)          | No  |
| `platform_error_log`           | 2D      | No (has nullable `tenant_id` FK for correlation, not isolation) | No  |

### Modified Tables

| Table                  | Session | Change                                                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `platform_alert_rules` | 2A      | Add `condition_config JSONB`, `severity` enum, `cooldown_minutes INTEGER`, extend `metric` values |

### New Enums

| Enum                       | Session | Values                                  |
| -------------------------- | ------- | --------------------------------------- |
| `PlatformAlertSeverity`    | 2A      | `info`, `warning`, `critical`           |
| `PlatformAlertChannelType` | 2B      | `email`, `telegram`, `whatsapp`, `push` |

### Migration Files

```
packages/prisma/migrations/
  YYYYMMDDHHMMSS_extend_alert_rules_condition_config/     -- 2A
  YYYYMMDDHHMMSS_add_platform_alert_channels/             -- 2B
  YYYYMMDDHHMMSS_add_platform_tenant_metrics/             -- 2D
  YYYYMMDDHHMMSS_add_platform_error_log/                  -- 2D
```

---

## 5. New API Endpoints Summary

### Session 2A -- Alert Rules Engine

| Method | Endpoint                            | Purpose                                                              |
| ------ | ----------------------------------- | -------------------------------------------------------------------- |
| GET    | `/v1/admin/alerts/rules`            | List alert rules (already exists from 1C -- enhanced)                |
| POST   | `/v1/admin/alerts/rules`            | Create alert rule (already exists -- enhanced with condition_config) |
| PATCH  | `/v1/admin/alerts/rules/:id`        | Update alert rule (already exists -- enhanced)                       |
| DELETE | `/v1/admin/alerts/rules/:id`        | Delete alert rule (already exists from 1C)                           |
| PATCH  | `/v1/admin/alerts/rules/:id/toggle` | Enable/disable a rule                                                |

### Session 2B -- Multi-Channel Alerting

| Method | Endpoint                             | Purpose                    |
| ------ | ------------------------------------ | -------------------------- |
| GET    | `/v1/admin/alerts/channels`          | List alert channels        |
| POST   | `/v1/admin/alerts/channels`          | Create channel             |
| PATCH  | `/v1/admin/alerts/channels/:id`      | Update channel             |
| DELETE | `/v1/admin/alerts/channels/:id`      | Delete channel             |
| POST   | `/v1/admin/alerts/channels/:id/test` | Send test alert to channel |

### Session 2C -- Queue Management

| Method | Endpoint                                | Purpose                                    |
| ------ | --------------------------------------- | ------------------------------------------ |
| GET    | `/v1/admin/queues`                      | List all queues with job counts            |
| GET    | `/v1/admin/queues/:name/jobs`           | List jobs in queue (filterable by status)  |
| GET    | `/v1/admin/queues/:name/jobs/:id`       | Get job details (payload, error, attempts) |
| POST   | `/v1/admin/queues/:name/jobs/:id/retry` | Retry a failed job                         |
| POST   | `/v1/admin/queues/:name/pause`          | Pause queue processing                     |
| POST   | `/v1/admin/queues/:name/resume`         | Resume queue processing                    |
| POST   | `/v1/admin/queues/:name/clean`          | Clean completed/failed jobs                |

### Session 2D -- Tenant Analytics & Error Diagnostics

| Method | Endpoint                            | Purpose                                     |
| ------ | ----------------------------------- | ------------------------------------------- |
| GET    | `/v1/admin/tenants/:id/metrics`     | Tenant aggregate metrics (latest + history) |
| GET    | `/v1/admin/tenants/metrics/compare` | Compare metrics across selected tenants     |
| GET    | `/v1/admin/tenants/:id/errors`      | Tenant error log                            |
| GET    | `/v1/admin/errors`                  | Platform-wide error log (filterable)        |
| GET    | `/v1/admin/errors/:id`              | Single error detail with stack trace        |

---

## 6. New Frontend Pages & Components Summary

### Session 2A -- Alert Rules Engine UI

| Route                 | Component               | Purpose                                      |
| --------------------- | ----------------------- | -------------------------------------------- |
| `/admin/alerts/rules` | Alert rules DataTable   | List all rules with status, severity, metric |
| (dialog)              | Create/edit rule dialog | Condition builder form                       |

### Session 2B -- Multi-Channel Alerting

| Route                    | Component                  | Purpose                                                 |
| ------------------------ | -------------------------- | ------------------------------------------------------- |
| `/admin/alerts/channels` | Channel list page          | List configured channels with type, status, test button |
| (dialog)                 | Create/edit channel dialog | Type-specific config forms                              |

### Session 2C -- Queue Management

| Route                  | Component         | Purpose                      |
| ---------------------- | ----------------- | ---------------------------- |
| `/admin/queues`        | Queue dashboard   | Queue list with stats cards  |
| `/admin/queues/[name]` | Queue detail page | Job list DataTable + actions |

### Session 2D -- Tenant Analytics & Error Diagnostics

| Route                    | Component                                 | Purpose                                             |
| ------------------------ | ----------------------------------------- | --------------------------------------------------- |
| `/admin/tenants/[id]`    | "Analytics" tab on existing tenant detail | Stat cards + trend charts                           |
| `/admin/tenants/compare` | Tenant comparison view                    | Side-by-side metric comparison                      |
| `/admin/errors`          | Error diagnostics page                    | Grouped errors, filterable, expandable stack traces |

---

## 7. Shared Schema Additions

All Zod schemas for Layer 2 will be added to `packages/shared/src/schemas/platform-admin.schema.ts`:

- `createAlertRuleSchema` / `updateAlertRuleSchema` (extended with condition_config)
- `conditionConfigSchema` (JSONB validation for alert conditions)
- `createAlertChannelSchema` / `updateAlertChannelSchema`
- `listQueueJobsQuerySchema`
- `cleanQueueSchema`
- `tenantMetricsQuerySchema`
- `errorLogQuerySchema`

---

## 8. Testing Strategy

### Unit Tests (co-located `.spec.ts`)

Every new service and controller gets co-located unit tests:

- Alert rules service: condition validation, severity handling, cooldown logic
- Channel service: CRUD operations, type-specific config validation
- Channel dispatch service: strategy pattern dispatch, per-channel error handling
- Queue service: BullMQ introspection calls, queue name validation
- Tenant metrics service: snapshot creation, date range queries
- Error log service: insertion, cleanup cron, filtering

### Integration Concerns

- Alert dispatch end-to-end: rule fires -> evaluates condition_config -> dispatches to configured channels
- Queue management: pause/resume round-trip, retry mechanics
- Error log filter: writes a 5xx -> appears in diagnostics with correct tenant correlation

### Permission Tests

Every endpoint must verify:

- Returns 401 without authentication
- Returns 403 for non-platform-owner users
- Returns 200/201 for authenticated platform owners

### No RLS Tests Required

All Layer 2 tables are platform-level (no tenant isolation). The `platform_error_log` and `platform_tenant_metrics` tables have `tenant_id` for correlation only -- they are not tenant-scoped with RLS.

---

## 9. Architecture File Updates

After Layer 2 is complete, the following architecture files must be updated:

| File                                  | Update                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `architecture/module-blast-radius.md` | Add `platform-admin` module with its cross-module dependencies (health, redis, worker queues)                      |
| `architecture/event-job-catalog.md`   | Add `platform:collect-tenant-metrics` cron, `platform:cleanup-error-log` cron, `platform:queues` WebSocket channel |
| `architecture/danger-zones.md`        | Add note about error log filter being additive (must never replace SentryGlobalFilter)                             |
| `architecture/feature-map.md`         | Update platform admin section with new endpoints and pages (after user confirms iteration is done)                 |

---

## 10. Definition of Done -- Layer 2

- [ ] All 4 new database tables created with migrations applied
- [ ] `platform_alert_rules` extended with `condition_config`, `severity`, `cooldown_minutes`
- [ ] Alert rules CRUD endpoints enhanced with full condition builder support
- [ ] Alert channel CRUD endpoints working with all 4 channel types
- [ ] Channel dispatch service dispatches to correct channel based on rule-channel mapping
- [ ] Test alert endpoint sends to each channel type and returns success/failure
- [ ] Queue management endpoints expose all 20 BullMQ queues with full introspection
- [ ] Queue dashboard shows real-time depth updates via WebSocket
- [ ] Retry, pause/resume, and clean operations work from the UI
- [ ] Tenant metrics cron runs daily and populates `platform_tenant_metrics`
- [ ] Error log exception filter captures 5xx errors without disrupting normal error handling
- [ ] Error diagnostics page shows errors grouped by type with expandable stack traces
- [ ] All endpoints guarded by `PlatformOwnerGuard`
- [ ] All co-located unit tests passing
- [ ] `turbo lint` and `turbo type-check` pass with zero errors
- [ ] Platform admin sidebar navigation updated with new pages (Alerts & Rules, Queue Manager, Errors)
- [ ] Architecture files updated per Section 9
