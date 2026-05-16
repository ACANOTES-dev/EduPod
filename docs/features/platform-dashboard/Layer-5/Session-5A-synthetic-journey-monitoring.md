# Session 5A: Synthetic Journey Monitoring

**Depends on:** Layer 1 (1A WebSocket, 1B health, 1C alerts) + Layer 1.5 (RBAC, audit) + Layer 2 (2C queue diagnostics for the canary). Hard prerequisite for 5D (freshness checks reference these definitions) and 5F (uptime input).
**Unlocks:** 5B (failure events drive escalation policies); 5D (the freshness pipeline includes synthetic-result writes); 5F (synthetic uptime is a readiness dimension).

---

## Objective

Run the EduPod platform through itself on a schedule, even when no real users are active, so the operator finds out something is broken from a check rather than from a tenant phone call. Specifically, this session ships:

1. **A check definition catalogue** (`platform_synthetic_check_definitions`) the operator manages from the UI.
2. **A check runner** (`SyntheticCheckRunnerService`) executed by a parameterised BullMQ cron per check; supports `http_get`, `http_post`, `websocket_handshake`, `queue_canary`, `notification_self_test`, `dns_lookup`, `tls_check`, `external_dependency_status`.
3. **Per-execution result storage** (`platform_synthetic_check_results`) with response payload digest (NOT raw response — passed through Layer 1.5B's redactor) + failure detail.
4. **External dependency status polling** (`platform_external_dependency_status`) for Resend, Twilio, Stripe, Sentry, AWS S3, Meilisearch, registrar/DNS — read provider status pages or hit lightweight ping endpoints.
5. **TLS certificate inventory + expiry checks** (`platform_certificate_checks`) per tenant domain + the apex.
6. **Alerting** through Layer 1C/2B: single failure → `warning`; N consecutive failures → `critical`. Configurable per check.
7. **Frontend pages** to define, list, inspect, and manually run checks; provider status board; certificate inventory.

After this session the operator has a "platform health pulse" that runs every minute (configurable per check) and produces an alert when something silently breaks between real-user requests.

---

## Critical Safety Constraints

- **No-AI guard.** This session must not import `AnthropicClientService`, `PlatformAiCopilotService`, or any Layer 4 generation service. The runner is deterministic. The static-analysis spec in Layer-5-Plan §9 enforces this.
- **Maintenance-window aware.** When a Layer 1.5C maintenance window covers a check's target component, the runner records `skipped_maintenance` instead of `failed`. This applies to every check kind **except** alert-route checks (5B owns those and they must remain unskippable).
- **No credentials in repo.** Synthetic check credentials (test platform admin password, tenant test user credentials, Sentry sink address, Twilio sink number, Resend sink address) live in env vars, never in `platform_synthetic_check_definitions`. Definitions reference credential keys by name; the runner resolves them at execution.
- **Notification self-tests are sink-bound.** The notification self-test sends to a dedicated sink (e.g., `monitoring+sink@edupod.app`, a sink Telegram chat, a sink Twilio number). Never sends to a real operator; that's 5B's `Test alert` button.
- **Queue canary is namespaced.** The canary uses a dedicated `synthetic-canary` queue + processor; never shares a queue with real domain work, so a stuck canary cannot block real jobs.
- **Response payload storage is digest + redact.** Raw response bodies are never stored. The runner stores SHA256(body) plus a redacted snippet (≤ 500 chars, passed through the 1.5B redactor). Failure detail (status code, headers minus auth, error message redacted) is stored verbatim.
- **No autonomous remediation.** The runner records results and emits alert events. It does not retry failures with exponential backoff beyond the per-check `retry_attempts` (default 1 — enough to suppress single-packet drops but not enough to mask sustained failure).
- **Synthetic accounts only — no impersonation, no real owner credentials.** The synthetic platform-admin login uses a **dedicated synthetic platform user** (`synthetic-monitor@platform.edupod.app`) with the `platform_support` role and the **minimum permission set** needed to confirm a successful login (effectively `platform.synthetic.view` only — no destructive perms, no read access to tenant data, no `platform.audit_log.view`). Credentials live in production env vars `SYNTHETIC_PLATFORM_USER_EMAIL` + `SYNTHETIC_PLATFORM_USER_PASSWORD`, NEVER in any operator's personal secret file. The real owner credentials at `/Users/ram/.codex/secrets/edupod-platform-admin.env` are explicitly forbidden as a synthetic-check source — the runner refuses to load credentials from `~/.codex/` paths. Tenant logins use a synthetic `synthetic-monitor@<tenant>.local` test account per pilot tenant with no real-person permissions. No real student/parent/staff impersonation.

---

## Database

```prisma
model PlatformSyntheticCheckDefinition {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key                      String                            @unique @db.VarChar(120)  // e.g., 'platform.admin.login'
  display_name             String                            @db.VarChar(160)
  description              String?                           @db.Text
  kind                     SyntheticCheckKind
  target                   Json                              @db.JsonB                 // shape varies by kind; Zod-validated
  schedule_cron            String                            @db.VarChar(80)           // e.g., '* * * * *' (every minute)
  timeout_ms               Int                               @default(15000)
  expected                 Json                              @db.JsonB                 // shape varies by kind: status, latency thresholds, headers, etc.
  consecutive_failure_threshold_critical Int                 @default(3)
  retry_attempts           Int                               @default(1)
  related_component        String?                           @db.VarChar(60)            // health component this check covers; used for maintenance-window suppression
  related_tenant_id        String?                           @db.Uuid                   // nullable; populated for tenant-scoped checks
  enabled                  Boolean                           @default(true)
  created_by_user_id       String                            @db.Uuid
  created_at               DateTime                          @default(now()) @db.Timestamptz()
  updated_at               DateTime                          @updatedAt @db.Timestamptz()

  results                  PlatformSyntheticCheckResult[]

  @@map("platform_synthetic_check_definitions")
  @@index([kind])
  @@index([enabled, kind])
  @@index([related_tenant_id])
}

model PlatformSyntheticCheckResult {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  definition_id            String                            @db.Uuid
  ran_at                   DateTime                          @default(now()) @db.Timestamptz()
  status                   SyntheticCheckResultStatus
  latency_ms               Int?
  response_status_code     Int?
  response_body_sha256     String?                           @db.VarChar(64)
  response_body_snippet    String?                           @db.Text                  // ≤ 500 chars, redacted
  failure_detail           Json?                             @db.JsonB                 // structured error info
  attempt_number           Int                               @default(1)
  triggered_by             String                            @default("schedule") @db.VarChar(40)  // 'schedule' | 'run_now' | 'retry'
  triggered_by_user_id     String?                           @db.Uuid                  // populated for run_now
  correlation_id           String?                           @db.VarChar(64)           // emitted to 4A correlation events

  definition               PlatformSyntheticCheckDefinition  @relation(fields: [definition_id], references: [id], onDelete: Cascade)

  @@map("platform_synthetic_check_results")
  @@index([definition_id, ran_at(sort: Desc)])
  @@index([status, ran_at(sort: Desc)])
}

enum SyntheticCheckKind {
  http_get
  http_post
  websocket_handshake
  queue_canary
  notification_self_test
  dns_lookup
  tls_check
  external_dependency_status
}

enum SyntheticCheckResultStatus {
  passed
  degraded
  failed
  error
  skipped_maintenance
}

model PlatformExternalDependencyStatus {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  provider_key             String                            @db.VarChar(60)            // 'resend' | 'twilio' | 'stripe' | 'sentry' | 's3' | 'meilisearch' | 'registrar'
  display_name             String                            @db.VarChar(160)
  source                   String                            @db.VarChar(40)            // 'status_page' | 'health_endpoint'
  status                   String                            @db.VarChar(40)            // 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown'
  status_detail            String?                           @db.Text
  last_checked_at          DateTime                          @default(now()) @db.Timestamptz()
  last_status_changed_at   DateTime?                         @db.Timestamptz()
  upstream_url             String?                           @db.VarChar(500)

  @@map("platform_external_dependency_status")
  @@unique([provider_key])
  @@index([status])
}

model PlatformCertificateCheck {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  hostname                 String                            @db.VarChar(255)
  issuer                   String?                           @db.VarChar(255)
  subject                  String?                           @db.VarChar(255)
  not_before               DateTime?                         @db.Timestamptz()
  not_after                DateTime?                         @db.Timestamptz()
  days_until_expiry        Int?
  last_checked_at          DateTime                          @default(now()) @db.Timestamptz()
  check_status             String                            @db.VarChar(40)            // 'ok' | 'expiring_soon' | 'expired' | 'invalid_chain' | 'fetch_error'
  check_error              String?                           @db.Text

  @@map("platform_certificate_checks")
  @@unique([hostname])
  @@index([days_until_expiry])
  @@index([check_status])
}
```

All four tables are platform-scoped. No `tenant_id`, no RLS.

---

## API + Service Layer

### `SyntheticCheckRunnerService`

```ts
@Injectable()
export class SyntheticCheckRunnerService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly maintenanceWindows: PlatformMaintenanceWindowsService, // 1.5C
    private readonly redactor: PlatformErrorRedactionService, // 1.5B
    private readonly alerts: PlatformAlertEmitterService, // 1C
    private readonly correlation: CorrelationContextService, // 4A
  ) {}

  /**
   * Execute one check. Called from the cron processor and from POST /run-now.
   * Always writes exactly one result row per attempt.
   * Emits a single alert event per consecutive_failure_threshold_critical.
   */
  async run(
    definitionId: string,
    opts?: { triggered_by?: string; user_id?: string },
  ): Promise<PlatformSyntheticCheckResult>;
}
```

### Check kind handlers

One handler per `SyntheticCheckKind`. All implement:

```ts
interface SyntheticCheckHandler<TTarget, TExpected> {
  readonly kind: SyntheticCheckKind;
  validateTarget(target: unknown): TTarget;
  validateExpected(expected: unknown): TExpected;
  execute(input: {
    target: TTarget;
    expected: TExpected;
    timeout_ms: number;
  }): Promise<HandlerResult>;
}

type HandlerResult = {
  status: SyntheticCheckResultStatus;
  latency_ms?: number;
  response_status_code?: number;
  response_body_snippet?: string;
  response_body_sha256?: string;
  failure_detail?: Record<string, unknown>;
};
```

**`HttpGetCheckHandler`** — fetches the target URL with `Accept: */*`, follows ≤ 3 redirects, asserts status code in `expected.status_codes` (default `[200]`), latency ≤ `expected.max_latency_ms` (default 3000), optional body regex.

**`HttpPostCheckHandler`** — same but POSTs `expected.body` as JSON. Used for the platform admin login check: POST `/v1/auth/login` with credentials from env, assert 200 + `data.access_token` present (regex match against the snippet, no token storage).

**`WebsocketHandshakeCheckHandler`** — opens a WS connection to the target URL with credentials from env, awaits the welcome event, closes cleanly. Asserts handshake duration ≤ threshold.

**`QueueCanaryCheckHandler`** — supports TWO canary modes, configurable per check definition via `target.queue_kind`:

1. **Dedicated canary** (`queue_kind: 'synthetic_canary'`) — enqueues a no-op job onto the dedicated `synthetic-canary` queue. Safe; never touches real domain processors. Proves BullMQ + Redis + the worker process are alive but does NOT prove the real critical queues are draining.
2. **Per-critical-queue canary** (`queue_kind: 'critical_queue_canary'`, `target.queue_name: 'notifications' | 'behaviour' | 'finance' | 'payroll' | 'pastoral'`) — enqueues a sentinel-marked job onto the **real** critical queue with payload `{ tenant_id: '00000000-0000-0000-0000-000000000000', _synthetic: true, canary_id }`. The existing processor for that queue gets a one-line guard at the top of its `process()` method: `if (job.data._synthetic === true && job.data.tenant_id === SYNTHETIC_TENANT_SENTINEL) { return { ok: true, canary_id: job.data.canary_id }; }` — short-circuits without doing any real work. The handler awaits completion + records latency. Proves the actual critical queue's processor is registered, BullMQ is processing it, and worker capacity exists.

The 5A acceptance requires per-critical-queue canaries for the 5 critical queues from `docs/runbooks/monitoring.md`: `notifications`, `behaviour`, `finance`, `payroll`, `pastoral`. The dedicated `synthetic-canary` remains as the lowest-blast smoke check.

**Prerequisite gap:** the 5 critical-queue processors must each gain the synthetic-sentinel short-circuit guard. This is a separate, small patch (one new line per processor + one shared `SYNTHETIC_TENANT_SENTINEL` constant + one unit test asserting the guard returns early without DB or external calls). Document as a session prerequisite alongside the synthetic-account seeder.

**`NotificationSelfTestCheckHandler`** — picks the channel (`resend` or `twilio_sms` or `twilio_whatsapp` or `telegram`) from `target.channel`, sends a templated "synthetic monitoring ping" message to the configured sink. Asserts provider returns success; provider delivery confirmation is not required (delivery is checked separately in 5B's dead-man check).

**`DnsLookupCheckHandler`** — resolves `target.hostname` and asserts a record set is returned + matches `expected.record_count_min`.

**`TlsCheckCheckHandler`** — opens a TLS socket to `target.hostname:port`, parses the cert, returns issuer/subject/notBefore/notAfter; computes `days_until_expiry`. Writes to `platform_certificate_checks` (upsert) in addition to the result row.

**`ExternalDependencyStatusCheckHandler`** — fetches the provider's status page or status JSON endpoint (configurable), normalises into `operational | degraded | partial_outage | major_outage | unknown`. Writes to `platform_external_dependency_status` (upsert) in addition to the result row.

### Alert emission

After each `run()`, the service queries the last `consecutive_failure_threshold_critical` results for the same definition. Behaviour:

- Last result `failed` AND fewer than threshold consecutive failures → emit `warning` alert via `PlatformAlertEmitterService` with key `synthetic.check.failed:{definition.key}` (deduped per Layer 1C cooldown).
- Last result `failed` AND threshold consecutive failures → emit `critical` alert with key `synthetic.check.failed_critical:{definition.key}` (escalation policy via 5B kicks in).
- Last result `passed` AND prior result was `failed`/`degraded` → emit `info` alert key `synthetic.check.recovered:{definition.key}`.
- Last result `skipped_maintenance` → no alert.

### Cron registration

`CronSchedulerService.OnModuleInit()` reads enabled definitions and registers a BullMQ repeatable job per definition with `jobId = 'cron:synthetic:' + definition.key`. On definition update/delete, the cron is re-registered. Toggling `enabled = false` removes the cron without deleting the definition.

### Endpoints

```
GET    /v1/admin/synthetic-checks                      @RequiresPlatformPermission('platform.synthetic.view')
POST   /v1/admin/synthetic-checks                      @RequiresPlatformPermission('platform.synthetic.manage')
PATCH  /v1/admin/synthetic-checks/:id                  @RequiresPlatformPermission('platform.synthetic.manage')
DELETE /v1/admin/synthetic-checks/:id                  @RequiresPlatformPermission('platform.synthetic.manage')
POST   /v1/admin/synthetic-checks/:id/run-now          @RequiresPlatformPermission('platform.synthetic.run')
GET    /v1/admin/synthetic-checks/:id/results          @RequiresPlatformPermission('platform.synthetic.view')
GET    /v1/admin/synthetic-checks/results/:resultId    @RequiresPlatformPermission('platform.synthetic.view')
GET    /v1/admin/external-dependencies                 @RequiresPlatformPermission('platform.synthetic.view')
GET    /v1/admin/certificates                          @RequiresPlatformPermission('platform.synthetic.view')
```

New permission keys (seeded in 1.5A's catalogue update):

- `platform.synthetic.view`
- `platform.synthetic.manage`
- `platform.synthetic.run`

`platform_owner` gets all three; `platform_support` gets `view` + `run` only.

---

## Frontend

### `/admin/synthetic-checks` (list)

Status grid: each row is one check definition with last-status pill (passed/degraded/failed/skipped), 24h uptime %, latency p95 sparkline, last-run timestamp, and a "Run now" button. Filters: kind, status, related component. "New check" button opens a kind-aware definition form (Zod-resolved).

### `/admin/synthetic-checks/[id]` (detail)

Header: definition + edit + delete. Body: result history table (paginated), latency-over-time chart, failure inspector showing the most recent failure's redacted snippet + structured `failure_detail`. Side rail: related Copilot Explain button (Layer 4) — hidden if 4 isn't deployed; pre-loads the failed result + correlated health snapshot when clicked.

### `/admin/external-dependencies`

Provider status board — each provider card shows status pill, last-checked timestamp, status detail, and a link to the provider's public status page.

### `/admin/certificates`

Inventory table. Columns: hostname, days-until-expiry (red < 14, amber < 30), issuer, last-checked. Sorted by `days_until_expiry` ascending.

### Components

- `SyntheticCheckCard`, `CheckResultTimeline`, `LatencySparklineMini` — reusable in dashboard home (5F surfaces aggregate uptime).
- `ExternalDependencyStatusCard`, `CertificateExpiryRow`.
- `RunNowButton` (with optimistic UI + audit-logged action).
- `KindAwareCheckForm` — react-hook-form + zodResolver, dynamic field rendering per `SyntheticCheckKind`.

---

## Alerting Behaviour

| Event                                            | Severity   | Routed Through         |
| ------------------------------------------------ | ---------- | ---------------------- |
| Check fails (single failure, below threshold)    | `warning`  | Default route (5B)     |
| Check fails (consecutive failures ≥ threshold)   | `critical` | Escalation policy (5B) |
| Check recovers from prior failure                | `info`     | Default route (5B)     |
| External dependency drops below `operational`    | `warning`  | Default route          |
| External dependency drops to `major_outage`      | `critical` | Escalation policy      |
| Certificate days-until-expiry ≤ 14               | `warning`  | Default route          |
| Certificate days-until-expiry ≤ 3                | `critical` | Escalation policy      |
| Certificate fetch error for ≥ 3 consecutive runs | `critical` | Escalation policy      |

All alerts respect Layer 1.5C maintenance windows when the window's affected component matches the check's `related_component`.

---

## Tests

### Unit

- `synthetic-check-runner.service.spec.ts` — runs each handler kind with happy/sad fixtures; threshold breach emits the right alert; recovery emits info; maintenance suppression returns `skipped_maintenance`.
- `http-get-check-handler.spec.ts` — status-code matching, latency threshold, redirect cap, body-regex matching.
- `http-post-check-handler.spec.ts` — JSON body posting, secret resolution from env, snippet redaction (assert no token in snippet).
- `websocket-handshake-check-handler.spec.ts` — handshake success/failure, timeout enforcement.
- `queue-canary-check-handler.spec.ts` — sentinel tenant_id is allowed by the canary processor; non-sentinel rejected.
- `notification-self-test-check-handler.spec.ts` — provider mock returns success; sink address comes from env.
- `dns-lookup-check-handler.spec.ts` — record count assertion; NXDOMAIN handling.
- `tls-check-check-handler.spec.ts` — expiry math; invalid chain handling.
- `external-dependency-status-check-handler.spec.ts` — Statuspage JSON parse; non-operational status mapping.
- `synthetic-alert-emission.spec.ts` — given a sequence of results, assert exactly the expected alert events fire (no duplicates, no missed transitions).

### Integration

- `synthetic-admin-login.e2e.ts` — define an http_post check against `POST /v1/auth/login` with the env credentials; run the check; assert `passed`. Then break the login (e.g., wrong password env override) and assert `failed` + `warning` alert.
- `synthetic-canary-roundtrip.e2e.ts` — enqueue canary, await processor, assert latency recorded.
- `external-dependency-poll.e2e.ts` — fetch a stub status page returning `degraded`; assert `platform_external_dependency_status` row updated and `warning` alert emitted.

### Static analysis

- `synthetic-no-anthropic-import.spec.ts` — assert no file under `apps/api/src/modules/platform-resilience/synthetic/**` imports any LLM service.
- `synthetic-no-credential-in-target.spec.ts` — assert the Zod target schema rejects payloads that look like raw secrets (long-lived JWT, AWS access key, Stripe sk\_, Twilio account SID).

---

## Acceptance

- [ ] All four new tables exist; migration applies cleanly.
- [ ] `SyntheticCheckRunnerService` exists with one handler per `SyntheticCheckKind`.
- [ ] At least 13 default check definitions seeded: platform admin login (using dedicated synthetic platform user), tenant login (per pilot tenant), tenant API readiness `/api/health/ready`, tenant page render `/en/login`, worker liveness, **6 queue canaries (dedicated `synthetic-canary` + per-critical-queue: notifications, behaviour, finance, payroll, pastoral)**, notification self-test (Resend), DNS lookup for the apex.
- [ ] Each of the 5 critical-queue processors carries the synthetic-sentinel short-circuit guard; unit test per processor asserts the guard returns early without side effects.
- [ ] No synthetic check resolves credentials from `~/.codex/` or any operator-personal path; runner refuses such paths.
- [ ] At least one TLS certificate per active tenant domain monitored.
- [ ] At least 7 external dependencies polled: Resend, Twilio, Stripe, Sentry, S3, Meilisearch, registrar/DNS.
- [ ] Cron registers per-definition; toggling `enabled` re-registers cleanly.
- [ ] "Run now" button works and audit-logs.
- [ ] Maintenance-window suppression respected; route-health checks (5B) are NOT suppressible.
- [ ] Alerts emitted via Layer 1C/2B; consecutive-failure threshold escalates to `critical`.
- [ ] All four frontend pages render with real data.
- [ ] No-AI guard test passes; no Layer 4 service imported.
- [ ] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Notes / Risks

- **Synthetic admin login is a recurring write to Redis** (creates a session each time). Mitigation: the handler invokes `POST /v1/auth/login` then `POST /v1/auth/logout` so the session is cleaned up. Test that logout also runs on failure paths.
- **Dedicated synthetic platform user (NOT the operator's owner account).** A new `synthetic-monitor@platform.edupod.app` platform user is created with the `platform_support` role pruned to the minimum permission set needed for a successful login round-trip. Its credentials live in production env vars (`SYNTHETIC_PLATFORM_USER_EMAIL`, `SYNTHETIC_PLATFORM_USER_PASSWORD`). If the user is missing or its password is wrong, the check fails with status `error` (alert `warning`) — same fail-open behaviour as missing tenant test accounts. Document creation in the deployment runbook; rotation is straightforward (update env + reset password via 1.5A's invite/reset flow).
- **Tenant test accounts must be seeded.** A `seed-synthetic-test-accounts.ts` script creates a `synthetic-monitor@<tenant>.local` user per pilot tenant with a known password (env-bound). The script runs in a separate, manually-triggered seeder; the synthetic checks fail open if the test account is missing (status `error`, alert `warning`).
- **Per-critical-queue canaries require processor cooperation.** Each of the 5 critical-queue processors (notifications, behaviour, finance, payroll, pastoral) needs a one-line guard at the top of its `process()` method that short-circuits on the synthetic sentinel. This ships as a separate small patch (one shared constant + one new line per processor + 5 unit tests). Without it, the synthetic canary would actually attempt real domain work with a fake tenant id — RLS would reject it but the failure mode would be confusing.
- **Notification self-test sink address** must be visibly distinct from real operator addresses. Recommend `monitoring-sink-{env}@edupod.app` (Resend) and a dedicated Telegram chat. Document in the runbook update.
- **Provider status page formats vary.** The handler delegates parsing to a per-provider parser. Adding a new provider = one new parser. Out-of-scope: scraping HTML (only JSON status APIs are supported).
- **Connection to Layer 4:** The check detail page renders an `<ExplainButton evidenceKey="synthetic_check_result" evidenceId={result.id} />` from Layer 4B's component library. The button is conditionally rendered behind `useFeature('layer-4-copilot')`. If Layer 4 is not deployed, the button is hidden. The check itself does not call Layer 4.
- **Risk: scope creep into chaos engineering.** This session intentionally only _observes_ the platform. It does not inject failures. Adding chaos belongs to a future layer with its own confirmation primitives.
