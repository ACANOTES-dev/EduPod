# Session 5D: Evidence Completeness Monitoring

**Depends on:** 5A (synthetic results pipeline), 5B (alert route health pipeline), 5C (Sentry webhook intake), Layer 1B (health snapshots), Layer 2C (queue snapshots), Layer 2D (`platform_error_log`), Layer 4A (deploy events, runbook index, topology, severity policies, correlation events). Hard prerequisite for 5F (evidence freshness is a readiness dimension).
**Unlocks:** 5F (readiness score consumes the freshness state).

---

## Objective

Monitor the **monitoring pipeline itself**. The hardest failure mode in any observability stack is silent: a cron stops running, a webhook handler crashes, a Redis connection drops, and the operator has no idea anything is broken until they need the evidence and find an empty table. This session ships:

1. **`platform_evidence_pipelines`** — operator-managed catalogue of pipelines whose freshness is monitored. Each row defines: pipeline key, expected interval (e.g., "health snapshot every 60s"), threshold for `lagging` / `stale` / `silent`, query (a `SELECT MAX(occurred_at)` against the appropriate table), threshold-breach action (alert severity).
2. **`platform_evidence_pipeline_status`** — latest freshness state per pipeline (last_seen_at, lag_seconds, status, breach_count).
3. **`EvidenceFreshnessService`** — runs every 60 seconds; queries each enabled pipeline; computes `fresh | lagging | stale | silent` based on lag thresholds; updates status + emits alerts on transitions.
4. **`platform_uptime_reconciliations`** — a parallel pipeline that compares external monitor state (UptimeRobot) against internal health checks; disagreements lasting ≥ 2 cycles raise a warning.
5. **A consolidated UI** at `/admin/evidence-completeness` that shows every pipeline, its current state, and a banner in the admin shell header when ANY pipeline is `silent`.
6. **A "Copilot can answer" indicator** — when an operator opens the Copilot, the backend exposes the freshness state so the frontend can render: "The Copilot is operating with FRESH evidence" vs "Some evidence pipelines are STALE: deploy events (5h old). Answers may be incomplete." This is the missing-versus-quiet distinction the user explicitly called out.

After this session, the operator never confuses "the platform is healthy and quiet" with "the monitoring system stopped sending data". A `silent` pipeline is treated as a critical signal.

---

## Critical Safety Constraints

- **No-AI guard.** No LLM imports in this module. Pipeline checks are pure SQL + threshold math.
- **Maintenance-window aware for warning-level transitions; non-suppressible for `silent` transitions.** When the operator schedules maintenance for `bullmq` and the queue-snapshot pipeline goes `lagging` for 30 minutes, that's expected — the warning is suppressed. But a pipeline going `silent` (no data for >> threshold) is always alerted, because "the maintenance window forgot to end" is itself an incident.
- **Pipeline definitions are operator-edited but seed-driven.** A migration seeds the canonical 9+ pipelines (listed below). Operators can add custom pipelines but cannot delete the seeded ones (database constraint: `is_seeded = true` rows reject DELETE).
- **`SELECT MAX(occurred_at)` queries are pinned per pipeline.** The query is parameterised (table name + column name + optional WHERE clause), but never freeform SQL. The pipeline definition has a `query_kind` enum; each kind has a hard-coded query template. No `query_string` text column. This prevents accidental data leak via SQL injection through pipeline definitions.
- **The freshness service must not depend on the pipelines it monitors.** If `bullmq` is down, the freshness check itself must still run (it runs on a NestJS scheduled task, not BullMQ — see notes). Otherwise, "the monitoring is monitoring the monitoring" becomes circular.
- **The "Copilot can answer" indicator is read-only.** It does not call the Copilot to ask "can you answer with this evidence". It just exposes pipeline state and lets the frontend render a status badge. No model call.
- **Uptime reconciliation never overrides either source.** If UptimeRobot says down and internal says up (or vice versa), the table records the disagreement; neither source is auto-trusted. The operator decides.

---

## Database

```prisma
model PlatformEvidencePipeline {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key                      String                            @unique @db.VarChar(120)
  display_name             String                            @db.VarChar(160)
  description              String?                            @db.Text
  query_kind               EvidencePipelineQueryKind                                  // enum maps to a hard-coded SQL template
  query_params             Json                              @db.JsonB                // parameters for the template (table, column, optional filter)
  expected_interval_seconds Int                                                       // when fresh, max gap between samples
  lagging_threshold_seconds Int                                                       // gap above which we go 'lagging'
  stale_threshold_seconds  Int                                                        // gap above which we go 'stale'
  silent_threshold_seconds Int                                                        // gap above which we go 'silent'
  alert_severity_lagging   String                            @default("warning") @db.VarChar(20)
  alert_severity_silent    String                            @default("critical") @db.VarChar(20)
  related_component        String?                            @db.VarChar(60)         // for maintenance-window suppression
  is_seeded                Boolean                           @default(false)          // seeded pipelines cannot be deleted
  enabled                  Boolean                           @default(true)
  created_at               DateTime                          @default(now()) @db.Timestamptz()
  updated_at               DateTime                          @updatedAt @db.Timestamptz()

  status                   PlatformEvidencePipelineStatus?

  @@map("platform_evidence_pipelines")
  @@index([enabled])
  @@index([related_component])
}

enum EvidencePipelineQueryKind {
  max_occurred_at_table              // SELECT MAX(<column>) FROM <table>
  max_completed_at_health_snapshot
  max_seen_redis_queue_heartbeat     // Redis key updated by 5D's QueueSnapshotHeartbeatTask (Layer 2C has no DB table)
  max_deployed_at_deploy_event
  max_received_at_sentry_webhook
  max_indexed_at_runbook_index
  max_updated_at_topology
  max_updated_at_severity_policy
  max_logged_at_error_log
  max_seen_redis_pubsub              // health key in Redis indicating last pub/sub event
  max_ran_at_synthetic_result        // 5A
  max_ran_at_route_health_check      // 5B
  max_received_at_backup_capture     // 5E backup-events internal endpoint (separate from backup runs themselves)
  max_computed_at_backup_readiness   // 5E BackupReadinessService.checkAndAlert tick
  max_snapshot_at_readiness_score    // 5F daily snapshot
}

model PlatformEvidencePipelineStatus {
  pipeline_id              String                            @id @db.Uuid
  last_seen_at             DateTime?                         @db.Timestamptz()
  lag_seconds              Int?
  status                   EvidencePipelineStatus            @default(unknown)
  breach_count             Int                               @default(0)         // consecutive non-fresh checks
  last_status_change_at    DateTime?                         @db.Timestamptz()
  last_check_at            DateTime?                         @db.Timestamptz()

  pipeline                 PlatformEvidencePipeline          @relation(fields: [pipeline_id], references: [id], onDelete: Cascade)

  @@map("platform_evidence_pipeline_status")
  @@index([status])
}

enum EvidencePipelineStatus {
  fresh
  lagging
  stale
  silent
  unknown
}

model PlatformUptimeReconciliation {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  external_monitor_name    String                            @db.VarChar(80)         // 'uptimerobot' | other future external monitor
  external_target          String                            @db.VarChar(255)        // URL / hostname
  external_status          String                            @db.VarChar(40)         // 'up' | 'down' | 'paused' | 'unknown'
  external_observed_at     DateTime                          @db.Timestamptz()
  internal_check_key       String                            @db.VarChar(120)        // matched synthetic check key OR health component
  internal_status          String                            @db.VarChar(40)
  internal_observed_at     DateTime                          @db.Timestamptz()
  in_disagreement          Boolean
  disagreement_streak      Int                               @default(0)             // consecutive cycles in disagreement
  acknowledged_by_user_id  String?                            @db.Uuid
  acknowledged_at          DateTime?                          @db.Timestamptz()
  detected_at              DateTime                          @default(now()) @db.Timestamptz()

  @@map("platform_uptime_reconciliations")
  @@index([in_disagreement, detected_at(sort: Desc)])
  @@index([disagreement_streak])
}
```

### Seeded pipelines

```sql
-- 14 seeded pipelines (covering Layer 1-4 inputs + Layer 5's own pipelines)
INSERT INTO platform_evidence_pipelines (key, display_name, query_kind, expected_interval_seconds, lagging_threshold_seconds, stale_threshold_seconds, silent_threshold_seconds, related_component, is_seeded, query_params)
VALUES
  -- Layer 1-4 sources
  ('health.snapshots',           'Health snapshot pipeline',         'max_completed_at_health_snapshot',  60,    180,    600,    1800,    'monitoring', true, '{}'),
  ('bullmq.snapshots',           'BullMQ queue snapshot heartbeat',  'max_seen_redis_queue_heartbeat',    60,    180,    600,    1800,    'bullmq',     true, '{"redis_key": "platform:resilience:bullmq:last_seen_at"}'),
  ('deploy.events',              'CI deploy event pipeline',         'max_deployed_at_deploy_event',      0,     86400,  172800, 604800,  'deploys',    true, '{"empty_table_status": "unknown"}'),
  ('sentry.webhook',             'Sentry webhook intake',            'max_received_at_sentry_webhook',    3600,  7200,   21600,  86400,   'sentry',     true, '{}'),
  ('runbook.index',              'Runbook index cron',               'max_indexed_at_runbook_index',      86400, 90000,  172800, 432000,  'runbooks',   true, '{}'),
  ('topology.updates',           'Service topology updates',         'max_updated_at_topology',           0,     1209600,2592000,5184000, 'topology',   true, '{"empty_table_status": "unknown"}'),
  ('severity.policy.refresh',    'Severity policy updates',          'max_updated_at_severity_policy',    0,     2592000,5184000,7776000, 'severity',   true, '{"empty_table_status": "unknown"}'),
  ('error.log.writes',           'Error log writer pipeline',        'max_logged_at_error_log',           1800,  3600,   10800,  43200,   'error_log',  true, '{}'),
  ('redis.pubsub',               'Redis pub/sub heartbeat',          'max_seen_redis_pubsub',             10,    60,     180,    600,     'redis',      true, '{"redis_key": "platform:resilience:pubsub:last_seen_at"}'),
  -- Layer 5's own pipelines (the monitoring system monitoring itself)
  ('synthetic.results',          'Synthetic check results pipeline', 'max_ran_at_synthetic_result',       60,    300,    900,    3600,    'monitoring', true, '{}'),
  ('alert.route_health',         'Alert route health check pipeline','max_ran_at_route_health_check',     60,    300,    900,    3600,    'alerts',     true, '{}'),
  ('backup.capture',             'Backup capture endpoint intake',   'max_received_at_backup_capture',    0,     90000,  172800, 604800,  'backups',    true, '{"empty_table_status": "unknown"}'),
  ('backup.readiness.computed',  'Backup readiness check',           'max_computed_at_backup_readiness',  900,   1800,   3600,   14400,   'backups',    true, '{}'),
  ('readiness.score.snapshots',  'Readiness score snapshot pipeline','max_snapshot_at_readiness_score',   86400, 90000,  172800, 432000,  'readiness',  true, '{}');
```

**Empty-table semantics.** Pipelines marked with `query_params.empty_table_status = "unknown"` are event-triggered rather than periodic. Their thresholds are large (a deploy a week without an update is suspicious, but a deploy a day without is normal). The status check for these uses a different rule: `silent` only fires if there is at least one row in the table AND the last-seen timestamp exceeds `silent_threshold_seconds`. An empty table for these pipelines is `unknown`, not `silent`.

**Redis-key sources.** Three pipelines (`bullmq.snapshots`, `redis.pubsub`) read from Redis keys instead of Postgres MAX queries because their underlying systems do not write to a persistent table:

- **`redis.pubsub`** — a small heartbeat publisher is added in 5D — it publishes a `{ ts: Date.now() }` message on the existing `platform:health` channel every 10 seconds; a separate subscriber updates `platform:resilience:pubsub:last_seen_at`. If Redis is down, the freshness check correctly flags `silent`.
- **`bullmq.snapshots`** — Layer 2C uses Redis introspection only and does NOT persist queue snapshots to a table. 5D adds a small **`QueueSnapshotHeartbeatTask`** (NestJS `@Cron('*/60 * * * * *')`) that calls the existing 2C `QueueSnapshotService.captureAll()` (in-memory introspection) and on success writes `Date.now()` into Redis key `platform:resilience:bullmq:last_seen_at`. The pipeline freshness check reads that key. If BullMQ is broken (introspection throws), the heartbeat catch block does NOT update the key — the freshness check then correctly flags `lagging` → `stale` → `silent` over time. This avoids requiring a DB table for queue snapshots while still giving us a freshness signal.

**Layer 5's own pipelines.** The five new pipelines (`synthetic.results`, `alert.route_health`, `backup.capture`, `backup.readiness.computed`, `readiness.score.snapshots`) close the "the monitoring system monitoring itself" loop. If 5A's synthetic runner stops producing rows, 5D notices. If 5B's dead-man cron stops producing rows, 5D notices. If 5E stops receiving backup-events, 5D notices. If 5F's daily snapshot doesn't run, 5D notices. Layer 5 does not get a free pass on the freshness check.

---

## API + Service Layer

### `EvidenceFreshnessService`

```ts
@Injectable()
export class EvidenceFreshnessService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly redis: RedisService,
    private readonly maintenanceWindows: PlatformMaintenanceWindowsService, // 1.5C
    private readonly alerts: PlatformAlertEmitterService, // 1C
    private readonly audit: PlatformAuditService, // 1.5B
  ) {}

  /** Runs every 60s. */
  async checkAll(): Promise<void>;

  /** Run a single pipeline check (for /run-check-now). */
  async checkOne(
    pipelineKey: string,
    opts?: { triggered_by_user_id?: string },
  ): Promise<PlatformEvidencePipelineStatus>;

  /** Read-only — for the Copilot freshness indicator. */
  async getCurrentStatusMap(): Promise<Map<string, EvidencePipelineStatus>>;
}
```

`checkAll()`:

1. Load enabled pipelines.
2. For each, dispatch to the appropriate query handler (`MaxOccurredAtTableHandler`, `MaxSeenRedisPubsubHandler`, etc.) per `query_kind`.
3. Compute `lag_seconds = now() - last_seen_at`.
4. Map to status:
   - `fresh` if `lag_seconds <= lagging_threshold_seconds`.
   - `lagging` if `lag_seconds <= stale_threshold_seconds`.
   - `stale` if `lag_seconds <= silent_threshold_seconds`.
   - `silent` otherwise.
   - `unknown` if `last_seen_at` is null AND pipeline is event-triggered (intervals == 0).
5. Update `platform_evidence_pipeline_status` (upsert).
6. On status transition: increment `breach_count` (reset on transition to `fresh`); emit alert per the pipeline's severity config; respect maintenance-window suppression for warning-level only.

### `QueueSnapshotHeartbeatTask`

A NestJS `@Cron('*/60 * * * * *')` task on the API process that calls Layer 2C's existing `QueueSnapshotService.captureAll()` (in-memory queue introspection) and, on success, writes `{ ts: Date.now(), queue_count, healthy_count }` to Redis key `platform:resilience:bullmq:last_seen_at`. On failure (BullMQ unreachable / Redis unreachable), the catch block logs and does NOT update the key — the `bullmq.snapshots` pipeline then correctly transitions through `lagging` → `stale` → `silent`.

This is the bridge between 2C's "Redis introspection only" model and 5D's freshness pipeline. It avoids requiring 2C to add a queue-snapshots table (which would carry its own scaling concerns).

### `EvidenceFreshnessScheduledTask`

Critical: this task runs as a **NestJS `@Cron` scheduled task on the API process**, NOT a BullMQ job. Reason: if BullMQ itself is the failing pipeline, a BullMQ-driven freshness check would also stop. The API process is the most-reliable place to host the freshness check.

The 5D scheduled task:

```ts
@Injectable()
export class EvidenceFreshnessScheduledTask {
  @Cron('*/60 * * * * *') // every 60 seconds (NestJS scheduler, not BullMQ)
  async tick(): Promise<void> {
    await this.freshnessService.checkAll();
  }
}
```

If the API process is down, the freshness check is also down — but in that case the operator has bigger problems (the dashboard itself is down) and Layer 5B's external alert routes detect the API outage via 5A's synthetic checks (which run from the worker, not the API).

### `UptimeReconciliationService`

```ts
@Injectable()
export class UptimeReconciliationService {
  /** Runs every 5 minutes. Queries UptimeRobot API + reads internal synthetic check results, computes disagreements. */
  async reconcile(): Promise<void>;

  async listDisagreements(opts: { active_only: boolean }): Promise<PlatformUptimeReconciliation[]>;
  async acknowledge(input: { id: string; user_id: string }): Promise<void>;
}
```

Configuration: an env var `UPTIMEROBOT_API_KEY` (read-only key) and a mapping table from external monitor name → internal check key (lives in Layer 4A's `platform_service_topology` as a related field, or in a small new mapping JSON in 5D's seed). When in disagreement for `disagreement_streak >= 2`, emit a `warning` alert.

### Endpoints

```
GET    /v1/admin/evidence-pipelines                   @RequiresPlatformPermission('platform.evidence.view')
GET    /v1/admin/evidence-pipelines/:key              @RequiresPlatformPermission('platform.evidence.view')
POST   /v1/admin/evidence-pipelines                   @RequiresPlatformPermission('platform.evidence.manage')
PATCH  /v1/admin/evidence-pipelines/:id               @RequiresPlatformPermission('platform.evidence.manage')
DELETE /v1/admin/evidence-pipelines/:id               @RequiresPlatformPermission('platform.evidence.manage')
POST   /v1/admin/evidence-pipelines/:key/run-check-now  @RequiresPlatformPermission('platform.evidence.run')
GET    /v1/admin/uptime-reconciliations               @RequiresPlatformPermission('platform.evidence.view')
POST   /v1/admin/uptime-reconciliations/:id/acknowledge @RequiresPlatformPermission('platform.evidence.manage')
```

DELETE on a pipeline with `is_seeded = true` returns 409 CONFLICT with code `SEEDED_PIPELINE_UNDELETABLE`.

New permission keys (seeded in 1.5A's catalogue update):

- `platform.evidence.view`
- `platform.evidence.manage`
- `platform.evidence.run`

`platform_owner` gets all three; `platform_support` gets `view` + `run`.

### Copilot freshness indicator endpoint (Layer 4 read-side)

`GET /v1/admin/copilot/freshness-summary` — returns `{ overall_status: 'all_fresh' | 'some_lagging' | 'some_stale' | 'some_silent', pipelines: [{ key, status, lag_seconds }] }`. The Copilot frontend (Layer 4B) reads this on conversation open and renders a banner. **No model call.**

---

## Frontend

### `/admin/evidence-completeness`

Top: aggregate banner — "All evidence pipelines are fresh." (green) / "1 pipeline is stale: deploy events (3h old)." (amber) / "2 pipelines are silent: bullmq snapshots, sentry webhook." (red).

Body: pipeline grid. Each row: pipeline key, status pill, lag (humanized: "13s", "7m", "2h"), expected interval, last-checked timestamp, breach count, "Run check now" button. Clickable → drilldown.

Drilldown: last 100 freshness samples in a sparkline, transition history (when did it go from fresh → lagging?), the underlying query/template, current `query_params`, and an Edit button (for unseeded pipelines).

### `/admin/uptime-reconciliations`

Active disagreements table. Columns: external monitor + status, internal check + status, streak, detected_at, acknowledge button. Resolved (acknowledged or no-longer-disagreeing) rows in a "history" tab.

### Admin shell header banner

`<EvidenceCompletenessBanner>` is rendered in the platform admin layout header. When ANY enabled pipeline is `silent`, the banner is red and links to `/admin/evidence-completeness`. When some are `lagging`/`stale` (none `silent`), amber. Otherwise hidden.

### Components

- `EvidencePipelineCard`, `FreshnessBadge` (green/amber/red/grey), `EvidenceCompletenessBanner` (header), `UptimeDisagreementCard`, `RunCheckNowButton`, `PipelineSparkline`.

---

## Alerting Behaviour

| Event                                                        | Severity   | Routed Through                                                                |
| ------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------- |
| Pipeline transitions `fresh` → `lagging`                     | `warning`  | Default route (5B); maintenance-suppressible                                  |
| Pipeline transitions `lagging` → `stale`                     | `warning`  | Default route                                                                 |
| Pipeline transitions `stale` → `silent`                      | `critical` | Escalation policy; **NOT** maintenance-suppressible                           |
| Pipeline transitions to `fresh` from non-fresh               | `info`     | Default route                                                                 |
| Uptime disagreement detected (streak ≥ 2)                    | `warning`  | Default route                                                                 |
| Freshness scheduled task itself fails (try/catch in `@Cron`) | `critical` | Direct write to `platform_alert_history` via Redis pub/sub bypass — see notes |

The last row is the meta-monitoring case: if the freshness check throws, the catch block writes a row directly to `platform_alert_history` AND publishes a Redis message AND attempts to fire an out-of-band alert via at least the email channel. This is a defense-in-depth path for the case where "the monitor of the monitors broke".

---

## Tests

### Unit

- `evidence-freshness.service.spec.ts` — given fixture rows in target tables, assert the right status transitions; transitions emit alerts; maintenance-window suppression for `lagging` but not for `silent`.
- `query-handler-per-kind.spec.ts` — each `EvidencePipelineQueryKind` maps to the correct SQL template; `query_params` properly substituted.
- `redis-pubsub-heartbeat.spec.ts` — heartbeat publisher writes to Redis key on schedule; reading the key returns the last write timestamp.
- `uptime-reconciliation.service.spec.ts` — fixture UptimeRobot response + fixture internal status; disagreement only counted when streak ≥ 2.
- `seeded-pipeline-undeletable.spec.ts` — DELETE on `is_seeded = true` row returns 409.
- `freshness-no-anthropic.spec.ts` — static analysis: no LLM imports.

### Integration

- `freshness-end-to-end.e2e.ts` — turn off the `health.snapshots` cron; freshness check transitions `fresh → lagging → stale → silent` over time; `critical` alert fires when transitioning to `silent`.
- `freshness-maintenance-suppression.e2e.ts` — schedule a maintenance window for `bullmq`; the bullmq.snapshots pipeline going `lagging` does NOT alert; transitioning to `silent` STILL alerts.
- `freshness-task-error-fallback.e2e.ts` — force `EvidenceFreshnessService.checkAll()` to throw; the catch block writes the meta-alert row directly.
- `copilot-freshness-banner.e2e.ts` — open Copilot when one pipeline is `stale`; the response payload includes the freshness-summary; frontend renders the warning.

---

## Acceptance

- [ ] All three new tables exist; **14 seeded pipelines** inserted by migration (9 covering Layer 1-4 sources + 5 covering Layer 5's own pipelines).
- [ ] `EvidenceFreshnessService` runs every 60s via NestJS `@Cron` (NOT BullMQ).
- [ ] `QueueSnapshotHeartbeatTask` runs every 60s, calls 2C's `QueueSnapshotService.captureAll()`, updates Redis key on success.
- [ ] Status transitions detected and alerted; severity mapping respected.
- [ ] Maintenance-window suppression respected for `warning`; `critical` (silent) NOT suppressible.
- [ ] Redis pub/sub heartbeat publisher + subscriber wired in; the `redis.pubsub` pipeline detects when Redis is unreachable.
- [ ] Layer 5's own pipelines (synthetic.results, alert.route_health, backup.capture, backup.readiness.computed, readiness.score.snapshots) seeded and verified — turning off any of them transitions the corresponding pipeline through `lagging` → `silent`.
- [ ] Uptime reconciliation cron runs every 5 min; UptimeRobot disagreements ≥ 2 cycles raise warnings.
- [ ] `/admin/evidence-completeness` page renders with real data.
- [ ] Header banner appears when any pipeline is `silent`.
- [ ] Copilot freshness-summary endpoint exists and returns correct shape; Layer 4B's UI consumes it.
- [ ] Seeded pipelines cannot be deleted (409 returned).
- [ ] No-AI guard test passes.
- [ ] Meta-monitoring fallback (catch block writes alert directly when freshness service throws) covered by test.
- [ ] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Notes / Risks

- **The freshness check must NOT use BullMQ.** Using BullMQ would introduce a circular dependency: if BullMQ snapshots stop because BullMQ is broken, a BullMQ-driven freshness check would also stop. Hosting the check on the API process via NestJS scheduler decouples them. Document this in DZ-RES (danger zones).
- **The Redis heartbeat is the load-bearing trick for catching Redis pub/sub failures.** If we relied on health snapshots (which use Redis but write to Postgres), we'd see the _symptom_ (snapshots stop) but not the _cause_ (Redis pub/sub broken). The heartbeat-on-Redis-key pattern is operator-explicit.
- **The "Copilot can answer with this evidence" indicator is the difference between "I don't know" and "I don't know because I'm flying blind".** Make sure the Layer 4B UI surfaces this prominently. If three pipelines are silent, the operator should see "AI Copilot may not have current data" before they ask the question, not in the AI's eventual response.
- **UptimeRobot API has rate limits.** Default plan: 10 req/min. With 5-minute polling and ~10 monitors, this is fine. If the operator adds many monitors, batch into a single `getMonitors` call (UptimeRobot's API supports this).
- **Pipeline thresholds are operator-tunable.** Defaults are conservative (e.g., health.snapshots `silent` at 30 minutes, even though ideal cadence is 60 seconds). Operators can tighten; the seeded defaults err on "don't page Ram for a 30-second blip".
- **Connection to Layer 4 (allowed):** Layer 4B reads `GET /v1/admin/copilot/freshness-summary` and renders a banner. No model call. The pipeline definitions themselves can be cited as evidence in Layer 4B answers ("the deploy-event pipeline is silent, which is why I can't correlate this error with a recent deploy"). All operator-initiated.
- **Connection to Layer 4 (forbidden):** No background AI invocation when a pipeline transitions to `silent`. The Copilot is not "asked" to investigate. The operator clicks Explain when they want analysis.
- **Risk: noisy `lagging` alerts.** The default thresholds may be too tight for some pipelines (especially `error.log.writes` if the platform is genuinely quiet). Mitigation: the `expected_interval_seconds: 0` event-triggered semantics let operators flag pipelines where "nothing happening for a day is fine".
