# Session 5B: Alert Routing + Escalation

**Depends on:** Layer 1C (alert framework + history) + Layer 2B (multi-channel alert dispatch + channel CRUD) + Layer 1.5A (RBAC) + Layer 1.5B (audit ledger) + Layer 1.5C (maintenance windows + owner confirmation primitive). Can run in parallel with 5A; 5A failure events feed 5B's escalation policies.
**Unlocks:** 5D (route-health pipeline becomes a freshness pipeline) + 5F (alert-route-health is a readiness dimension).

---

## Objective

Turn Layer 2B's "send an email when an alert fires" into a **wake-up system that survives a single channel failing**. Specifically, this session ships:

1. **Alert routes** (`platform_alert_routes`) — per-channel routing config with urgency tier (`info`, `urgent`, `critical_only`), active hours (quiet hours), and a critical-override flag.
2. **Escalation policies** (`platform_alert_escalation_policies`) — ordered list of routes per severity + per-step acknowledgement window. If the alert is not acknowledged within the window, the next route fires.
3. **Acknowledgement workflow** — operator clicks Acknowledge in the dashboard OR uses a magic link in the alert message. Acknowledgement halts escalation. State machine recorded on `platform_alert_history` (modified columns).
4. **Test alert button** per route AND for "all routes at once".
5. **Quiet hours policy** — operator-defined per-route in the operator's timezone (default `Europe/Dublin`; IANA timezone DB resolves DST automatically). E.g., "don't SMS me 22:00–07:00 Dublin local time unless severity is critical". Critical alerts bypass quiet hours by default; operator can opt out per-route.
6. **Alert-route dead-man check** — a cron sends a test event to each route every 15 minutes (configurable) **to a sink destination separate from the operator's real destination** (e.g., a sink Telegram chat, a sink Twilio number, a sink Resend inbox). The operator NEVER sees the dead-man pings. If a route fails the dead-man check (no provider acknowledgement / no inbound bounce-back at the sink), alerts go through every _other_ route with severity `critical`. Real operator destinations are exercised only by the operator-clicked "Test alert" button (audit-logged, rate-limited).
7. **Operator emergency contact profile** (`platform_alert_emergency_contacts`) — per `platform_user`: phone, WhatsApp, Telegram chat id, browser-push subscription endpoint, preferred order, **operator timezone (default `Europe/Dublin`)**. Self-managed at `/admin/profile/emergency-contact`.

After this session, a critical alert at 03:00 UTC that the operator does not see in email triggers an SMS within `escalation_window_minutes` (default 10). If SMS also fails to ack within the next window, fall through to WhatsApp / Telegram / browser push in the operator's configured order. If the SMS provider itself is down, the dead-man check has already fired a `critical` alert through the surviving channels warning the operator that SMS is broken.

---

## Critical Safety Constraints

- **No-AI guard.** No file in this module imports `AnthropicClientService`, `PlatformAiCopilotService`, or any Layer 4 generation service. The escalation engine is a deterministic state machine.
- **Dead-man check via surviving routes only.** When route X fails the dead-man check, alerts about route X going down route through every route EXCEPT X. There is no "alert about X via X" failure mode. The router enforces this with an exclude-set parameter.
- **Dead-man pings target SINK destinations, not operator destinations.** Every `platform_alert_routes` row has TWO destinations: `operator_destination` (the real address — operator's SMS, WhatsApp, etc.) and `health_check_destination` (a sink address controlled by the operator but separate — e.g., a sink Telegram chat the operator never reads, a sink Twilio number that auto-discards, a sink Resend inbox). The dead-man cron uses `health_check_destination` ONLY. The operator's real destination is exercised exclusively by the operator-clicked Test Alert button. This eliminates the "the watchdog spams me every 15 minutes" failure mode.
- **Maintenance-window aware for normal alerts; non-suppressible for route-health and signature-failure events.** Operators can silence noisy alerts during planned work but cannot silence the watchdog that tells them their watchdog is broken. Enforced by `nonSuppressibleAlertKeys: Set<string>` in the maintenance-window evaluator.
- **Quiet hours use IANA timezone, not UTC.** Each operator's profile carries an IANA timezone (default `Europe/Dublin`). Quiet-hours start/end times in `platform_alert_routes` are stored as wall-clock times in that timezone, evaluated through `Intl.DateTimeFormat` / `date-fns-tz` so DST flips are handled automatically. This is intentional: a 22:00–07:00 quiet window must mean "10 PM Dublin" year-round, not shift by an hour twice a year.
- **Escalation does not modify the underlying alert.** Each escalation step is a separate dispatch (separate row in dispatch log); the original alert stays intact in `platform_alert_history`. The state machine moves on `platform_alert_history.escalation_state` only.
- **Acknowledgement requires operator identity.** Magic-link acks are signed with a short-lived token (10-minute TTL, single-use, includes `alert_history_id` + `platform_user_id`). The signed-in dashboard ack uses the JWT identity. Both record `acknowledged_via_route_id` for telemetry.
- **No auto-resolve from escalation.** An alert reaching the end of an escalation policy without ack stays `expired` (operator missed it entirely) — it does NOT auto-resolve. Operator sees expired alerts in a dedicated tab so they can debrief.
- **Test alerts are clearly marked.** Every `Test alert` payload has a `[SYNTHETIC TEST]` prefix in the subject/body and a structured `is_test: true` field for downstream parsers. Test alerts never enter `platform_alert_history`; they go to `platform_alert_route_health_checks`.
- **Per-day test-blast cap.** "Test all routes" is rate-limited to 5 per day per operator to prevent accidental spam. Hard cap, audited.
- **Twilio / Resend / Telegram credentials are env-only.** Never written into the route table. The route stores a credential key reference, not the secret.
- **Operator self-service is bounded.** An operator can edit their own emergency contact profile but cannot edit another operator's. `platform_owner` can edit any operator's profile (audit-logged).

---

## Database

```prisma
model PlatformAlertRoute {
  id                              String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  channel_id                      String                     @db.Uuid                        // FK to platform_alert_channels (2B)
  display_name                    String                     @db.VarChar(160)
  urgency_tier                    AlertChannelUrgencyTier
  enabled                         Boolean                    @default(true)
  operator_destination            Json                       @db.JsonB                       // channel-specific: { email } | { phone_e164 } | { telegram_chat_id } | { push_subscription }
  health_check_destination        Json                       @db.JsonB                       // SINK address — separate from operator_destination; same shape per channel kind
  quiet_hours_start               String?                    @db.VarChar(5)                  // 'HH:MM' wall-clock in quiet_hours_timezone
  quiet_hours_end                 String?                    @db.VarChar(5)
  quiet_hours_timezone            String                     @default("Europe/Dublin") @db.VarChar(60)  // IANA timezone
  critical_override_quiet         Boolean                    @default(true)                  // critical alerts bypass quiet hours
  dead_man_interval_minutes       Int                        @default(15)
  last_health_check_at            DateTime?                  @db.Timestamptz()
  last_health_check_status        String?                    @db.VarChar(20)                 // 'ok' | 'failed' | 'unknown'
  created_at                      DateTime                   @default(now()) @db.Timestamptz()
  updated_at                      DateTime                   @updatedAt @db.Timestamptz()

  channel                         PlatformAlertChannel       @relation(fields: [channel_id], references: [id], onDelete: Restrict)

  @@map("platform_alert_routes")
  @@index([enabled, urgency_tier])
}

// CHECK constraint (added in companion post_migrate.sql):
//   ALTER TABLE platform_alert_routes
//     ADD CONSTRAINT chk_route_destinations_distinct
//     CHECK (operator_destination::text <> health_check_destination::text);
// Prevents accidental "same destination for both" misconfiguration that would re-introduce the noise problem.

enum AlertChannelUrgencyTier {
  info
  urgent
  critical_only
}

model PlatformAlertEscalationPolicy {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  display_name             String                            @db.VarChar(160)
  applies_to_severity      String                            @db.VarChar(20)         // 'critical' | 'warning'
  applies_to_alert_keys    String[]                          @default([])            // empty = all alert keys at this severity
  steps                    Json                              @db.JsonB               // [{ route_id, ack_window_minutes }, ...]
  enabled                  Boolean                           @default(true)
  created_by_user_id       String                            @db.Uuid
  created_at               DateTime                          @default(now()) @db.Timestamptz()
  updated_at               DateTime                          @updatedAt @db.Timestamptz()

  @@map("platform_alert_escalation_policies")
  @@index([applies_to_severity])
}

model PlatformAlertRouteHealthCheck {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  route_id                 String                            @db.Uuid
  ran_at                   DateTime                          @default(now()) @db.Timestamptz()
  success                  Boolean
  latency_ms               Int?
  failure_detail           Json?                             @db.JsonB
  triggered_by             String                            @default("schedule") @db.VarChar(40)  // 'schedule' | 'manual'
  triggered_by_user_id     String?                           @db.Uuid

  route                    PlatformAlertRoute                @relation(fields: [route_id], references: [id], onDelete: Cascade)

  @@map("platform_alert_route_health_checks")
  @@index([route_id, ran_at(sort: Desc)])
  @@index([success, ran_at(sort: Desc)])
}

model PlatformAlertAcknowledgement {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  alert_history_id         String                            @db.Uuid
  acknowledged_by_user_id  String                            @db.Uuid
  acknowledged_at          DateTime                          @default(now()) @db.Timestamptz()
  acknowledged_via_route_id String?                          @db.Uuid                        // null = dashboard click
  comment                  String?                           @db.Text

  @@map("platform_alert_acknowledgements")
  @@unique([alert_history_id])                                                                // one ack per alert
  @@index([acknowledged_by_user_id, acknowledged_at(sort: Desc)])
}

model PlatformAlertEmergencyContact {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platform_user_id         String                            @unique @db.Uuid
  email                    String?                           @db.VarChar(255)
  sms_phone                String?                           @db.VarChar(40)
  whatsapp_phone           String?                           @db.VarChar(40)
  telegram_chat_id         String?                           @db.VarChar(40)
  push_subscription        Json?                             @db.JsonB                      // VAPID push subscription object
  preferred_order          String[]                          @default([])                   // ['email', 'sms', 'whatsapp', 'telegram', 'push']
  timezone                 String                            @default("Europe/Dublin") @db.VarChar(60)  // IANA timezone for quiet-hours evaluation + UI rendering
  updated_at               DateTime                          @updatedAt @db.Timestamptz()

  @@map("platform_alert_emergency_contacts")
}
```

### Modified existing tables

```prisma
model PlatformAlertHistory {
  // ... existing 1C columns
  escalation_state         AlertEscalationState              @default(idle)
  next_escalation_at       DateTime?                         @db.Timestamptz()
  current_escalation_step  Int                               @default(0)
  acknowledged_via_route_id String?                          @db.Uuid
}

model PlatformAlertChannel {
  // ... existing 2B columns
  urgency_tier             AlertChannelUrgencyTier           @default(info)
  last_health_check_at     DateTime?                         @db.Timestamptz()
}

model PlatformUser {
  // ... existing 1.5A columns
  emergency_contact_id     String?                           @unique @db.Uuid
  emergency_contact        PlatformAlertEmergencyContact?    @relation(...)
}

enum AlertEscalationState {
  idle
  dispatched
  awaiting_ack
  escalating
  acknowledged
  auto_resolved   // condition resolved before ack window expired (no escalation needed)
  expired         // escalation policy exhausted with no ack
}
```

---

## API + Service Layer

### `AlertRoutingService`

Replaces the 2B "dispatch to all enabled channels" path. Reads alert severity, evaluates the escalation policy, and dispatches to the first step's routes.

```ts
@Injectable()
export class AlertRoutingService {
  async dispatchInitial(alertHistoryId: string): Promise<void>;
  async escalateNext(alertHistoryId: string): Promise<void>;
  async acknowledge(input: {
    alert_history_id: string;
    user_id: string;
    route_id?: string;
    comment?: string;
  }): Promise<void>;
  async resolveSilently(
    alertHistoryId: string,
    reason: 'condition_resolved' | 'manual',
  ): Promise<void>;
}
```

### `AlertEscalationCron`

Runs every 30 seconds. SELECTs `platform_alert_history WHERE escalation_state IN ('awaiting_ack', 'escalating') AND next_escalation_at <= now()`. For each:

1. Compute next step from policy.
2. If step exists → call `dispatchStep()` → set `current_escalation_step += 1`, `next_escalation_at = now() + step.ack_window_minutes`.
3. If no more steps → transition to `expired`, emit `info`-level audit event "escalation expired without ack".

### `AlertRouteDeadManCron`

Runs every minute. For each enabled route whose `last_health_check_at < now() - dead_man_interval_minutes`:

1. Resolve `route.health_check_destination` (NEVER `route.operator_destination`). Refuse to send if `health_check_destination` equals `operator_destination` (DB CHECK enforces this; the cron also guards in code).
2. Send a sink-marked test payload (channel-specific) with structured `is_test: true`, `is_dead_man_check: true`, `health_check_id`. Subject/body explicitly says "Synthetic monitoring ping — discard".
3. Wait for confirmation (provider-specific):
   - **Resend:** webhook delivery confirmation by `health_check_id` (table-driven correlation).
   - **Twilio SMS / WhatsApp:** delivery status callback by `MessageSid`.
   - **Telegram:** synchronous response — bot API returns `ok: true` immediately; record success on response.
   - **Browser push:** synchronous response from VAPID endpoint.
4. Insert `platform_alert_route_health_checks` row with success/failure.
5. On failure → emit `critical` alert with key `alerts.route.dead_man_failed:{route_id}`, dispatched via every OTHER route (exclude-set parameter to `AlertRoutingService.dispatchInitial`). The "other routes" use their `operator_destination` because this is a real wake-up event.

### Acknowledgement endpoints

- **Dashboard ack:** `POST /v1/admin/alerts/history/:id/acknowledge` with JWT auth.
- **Magic-link ack:** `GET /v1/admin/alerts/ack/:token` (no JWT). Token is HMAC-signed JWE containing `{ alert_history_id, platform_user_id, exp }`. Single-use (second use returns 410 GONE). Verifies signature + expiry, then calls `AlertRoutingService.acknowledge()`. Renders a confirmation HTML page.

### Test alert endpoint

- **Per-route:** `POST /v1/admin/alerts/routes/:id/test` — sends one test payload through one route. Audit-logged.
- **All routes:** `POST /v1/admin/alerts/test-all` — concurrently dispatches to every enabled route. Rate-limited to 5/day per operator (Redis counter). Audit-logged.

### Endpoints (full list)

```
GET    /v1/admin/alerts/routes                       @RequiresPlatformPermission('platform.alerts.view')
POST   /v1/admin/alerts/routes                       @RequiresPlatformPermission('platform.alerts.manage')
PATCH  /v1/admin/alerts/routes/:id                   @RequiresPlatformPermission('platform.alerts.manage')
DELETE /v1/admin/alerts/routes/:id                   @RequiresPlatformPermission('platform.alerts.manage')
POST   /v1/admin/alerts/routes/:id/test              @RequiresPlatformPermission('platform.alerts.manage')
POST   /v1/admin/alerts/test-all                     @RequiresPlatformPermission('platform.alerts.manage')
GET    /v1/admin/alerts/escalation-policies          @RequiresPlatformPermission('platform.alerts.view')
POST   /v1/admin/alerts/escalation-policies          @RequiresPlatformPermission('platform.alerts.manage')
PATCH  /v1/admin/alerts/escalation-policies/:id      @RequiresPlatformPermission('platform.alerts.manage')
DELETE /v1/admin/alerts/escalation-policies/:id      @RequiresPlatformPermission('platform.alerts.manage')
POST   /v1/admin/alerts/history/:id/acknowledge      @RequiresPlatformPermission('platform.alerts.acknowledge')
GET    /v1/admin/alerts/ack/:token                   (no JWT — magic link)
GET    /v1/admin/alerts/route-health                 @RequiresPlatformPermission('platform.alerts.view')
GET    /v1/admin/emergency-contacts/me               @RequiresPlatformPermission('platform.profile.view')
PATCH  /v1/admin/emergency-contacts/me               @RequiresPlatformPermission('platform.profile.manage')
```

---

## Frontend

### `/admin/alerts/routes`

List page. Each route row: channel name, urgency tier, quiet-hours window, last dead-man status pill, test button, edit/delete. "New route" opens the route form.

### `/admin/alerts/escalation`

Visual editor for policies. Each policy renders as an ordered timeline: step 1 (route, ack window) → step 2 (route, ack window) → ... + an "expires after total minutes" footer. Drag-and-drop reorder. Per-policy enable/disable.

### `/admin/alerts/route-health`

Dead-man check history. Latest result per route at the top with success/failure pill + latency. Drill-down → per-route history table.

### `/admin/profile/emergency-contact`

Self-service form for the signed-in operator. Fields: email (required), SMS phone (E.164), WhatsApp phone, Telegram chat id, browser push subscription (auto-detected from current browser via Notification permission flow). Preferred-order drag-list. Save → audit-logged.

### Components

- `AlertRouteCard` — per route summary with dead-man pill.
- `EscalationPolicyEditor` — drag-drop step list with per-step ack-window number input.
- `RouteHealthBadge` — small pill for the admin layout header that turns red when ANY route's last dead-man failed.
- `TestAlertButton` — confirmation modal explaining "this will send a real test message to the route".
- `EmergencyContactForm` — react-hook-form + Zod, browser-push subscription helper.
- `QuietHoursToggle` — time-range picker with critical-override checkbox.
- `MagicAckLandingPage` — server-rendered confirmation HTML at `/v1/admin/alerts/ack/:token`.

---

## Alerting Behaviour

| Event                                                               | Severity   | Routed Through                                      |
| ------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| Layer 1C/2B alert fires                                             | (per rule) | `AlertRoutingService.dispatchInitial`               |
| Acknowledgement window expires without ack                          | (same)     | `AlertRoutingService.escalateNext`                  |
| Escalation policy steps exhausted                                   | `info`     | Default route (debrief)                             |
| Route dead-man check fails                                          | `critical` | All OTHER routes (exclude-set)                      |
| Test alert sent (per-route or test-all)                             | n/a        | The targeted route(s) only; `is_test: true` payload |
| Magic-link token reuse attempt                                      | `warning`  | Default route                                       |
| Quiet-hours skip (alert was suppressed because severity allowed it) | `info`     | Logged only — no alert (intentional)                |

---

## Tests

### Unit

- `alert-routing.service.spec.ts` — initial dispatch picks correct routes by severity + tier; quiet-hours suppression; critical-override behaviour.
- `alert-escalation-cron.spec.ts` — alerts in `awaiting_ack` past `next_escalation_at` advance one step; acks halt escalation; expired alerts transition to `expired`.
- `alert-route-dead-man-cron.spec.ts` — generates dead-man test, awaits confirmation, records result, fires alert via OTHER routes on failure.
- `magic-link-ack.spec.ts` — token signing/verifying, single-use enforcement, expiry enforcement, signature mismatch rejection.
- `quiet-hours-evaluator.spec.ts` — within window suppresses; critical-override bypasses; correctly handles `Europe/Dublin` IST/GMT transitions (DST roll forward + roll back at 01:00 UTC last Sunday of March / October); pure unit test using fixture instants.
- `test-alert-rate-limit.spec.ts` — 6th test-all in 24h returns 429.
- `dead-man-uses-sink-destination.spec.ts` — `AlertRouteDeadManCron` reads `route.health_check_destination` and refuses to send if it equals `route.operator_destination` (returns false + records `failure_detail: 'sink_destination_equals_operator'`).
- `route-destination-distinct.spec.ts` — POST/PATCH on a route that submits identical operator + health-check destinations returns 422 BEFORE the DB CHECK fires; the CHECK is the second line of defence.

### Integration

- `escalation-end-to-end.spec.ts` — fire critical alert → email sent → wait 10 min → SMS sent (mock provider) → operator clicks magic link → escalation halts → audit chain present.
- `dead-man-via-surviving-routes.spec.ts` — disable email channel → dead-man check fails → critical alert fires through SMS/Telegram only (assert email NOT in dispatch log).
- `magic-link-roundtrip.spec.ts` — generate ack token from a real alert → call the GET endpoint → assert ack recorded → second call returns 410.

### Static analysis

- `routing-no-anthropic.spec.ts` — no LLM imports under `apps/api/src/modules/platform-resilience/alert-routing/**`.
- `dead-man-exclude-set.spec.ts` — assert `AlertRouteDeadManCron` always passes the failed route's id in the exclude-set when calling dispatch (statically scan source).

---

## Acceptance

- [ ] All five new tables exist; the three existing-table modifications applied; migration runs cleanly.
- [ ] `platform_alert_routes` has `operator_destination` AND `health_check_destination` columns; DB CHECK constraint prevents identical values.
- [ ] `AlertRoutingService` replaces 2B's dispatch path; existing 2B alerts continue to fire correctly.
- [ ] At least one urgent path (SMS / WhatsApp / Telegram / push) configured in production alongside email.
- [ ] Each enabled route in production has a distinct `health_check_destination` sink — verified by smoke check on first deploy.
- [ ] At least one escalation policy seeded covering `critical` severity with email → SMS → WhatsApp ordering.
- [ ] "Test alert" button per route works (uses `operator_destination`); "Test all routes" works and is rate-limited to 5/day.
- [ ] Quiet hours suppress non-critical alerts in `Europe/Dublin` time (DST flips covered by tests); critical-override bypass works.
- [ ] Dead-man cron runs every minute per route, sending ONLY to `health_check_destination`; failures emit critical alerts via surviving routes' `operator_destination`.
- [ ] Magic-link acks work end-to-end; tokens are single-use and TTL-bounded.
- [ ] Dashboard ack button works; both ack paths record `acknowledged_via_route_id`.
- [ ] Operator emergency contact profile editable at `/admin/profile/emergency-contact`; updates audit-log.
- [ ] Layer 1.5C maintenance windows suppress normal alerts but DO NOT suppress route-health or dead-man alerts.
- [ ] No-AI guard test passes; no Layer 4 service imported under the alert-routing module.
- [ ] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Notes / Risks

- **Sink destinations are operator-configured at deploy time.** The recommended sinks: a separate Telegram chat the operator never reads (free), a Resend "monitoring-sink-prod@edupod.app" inbox (cheap), and a Twilio test number (paid; can defer until SMS is configured). The route form requires both `operator_destination` and `health_check_destination` and refuses identical values. If an operator only has one channel address (say their personal phone), Telegram or browser push is the second urgent route — never share a single number for both operator + sink.
- **Magic-link ack is the most operator-friendly path during a real incident.** Make the link prominent in every alert message, especially SMS (where typing into a dashboard is awkward).
- **Twilio delivery callbacks are async.** The dead-man check should mark the route `pending_confirmation` between send and callback; only `failed` after a configurable timeout (default 60s) without callback. Avoid false negatives.
- **Browser push is the least reliable urgent path.** It requires the operator's browser to be open. Recommended only as a tertiary route, never the primary critical path.
- **Telegram is the highest-reliability urgent path for solo operators** who don't want their personal SMS used. Recommend in the deployment runbook.
- **Risk: alert fatigue from over-aggressive escalation.** Default ack window starts at 10 minutes for SMS step, 20 for WhatsApp, 40 for Telegram. Operator tunes after a week of real usage.
- **Risk: test-all spam.** The 5/day cap is a hard cap. If the operator legitimately needs more (e.g., onboarding a new urgent path), they bypass via the per-route test endpoint, which has no daily cap (because each fires only one route).
- **Connection to Layer 4:** None within escalation logic itself. The alert detail page (existing 1C UI) gains a Layer-4 `<ExplainButton>` that pre-loads the alert evidence. Hidden if Layer 4 isn't deployed. The button is operator-clicked; escalation never auto-invokes the Copilot.
- **Quiet hours are evaluated in `Europe/Dublin` by default.** The operator's timezone lives on `platform_alert_emergency_contacts.timezone`; per-route quiet windows live on `platform_alert_routes.quiet_hours_timezone` (defaults to the operator's timezone but can be overridden per route). DST flips are handled by the IANA timezone DB (`date-fns-tz` or `Intl.DateTimeFormat` with the explicit zone). The UI shows times in the operator's timezone and never displays raw UTC.
