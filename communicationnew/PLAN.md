# Communications Overhaul — Master Plan

> **Status:** Plan locked. Implementation split into **14 tasks across 5 waves**. See `IMPLEMENTATION_LOG.md` for execution rules, wave ordering, and completion records.
> **Worktree:** This entire rebuild runs in a dedicated git worktree (`communications-overhaul` branch). No CI deployment; local dev server testing only. The user manually rebases & merges to `main` after Impl 14 completes.

---

## 1. Why we're building this

The platform has fully built dispatch infrastructure for four channels (in-app, email, SMS, WhatsApp) with provider classes, retry logic, fallback chains, rate limits, consent gating, idempotency, and PgBouncer-safe two-phase dispatch. The audit confirmed **the dispatch engine is production-quality**. What's missing is everything around it:

1. **Per-tenant credentials.** Today every tenant shares the same Resend / Twilio keys read from the platform `.env`. We cannot onboard real schools without isolated, encrypted, per-tenant credentials.
2. **Webhooks.** Resend and Twilio send delivery / bounce / complaint callbacks. Today nothing receives them. `notification.status` ends at `'sent'` for every email even when it bounced.
3. **Email deliverability.** Without SPF/DKIM/DMARC verification per tenant sender domain, our emails will land in spam folders. There's no domain verification flow.
4. **WhatsApp Business compliance.** Twilio's WhatsApp policy requires pre-approved templates outside a 24-hour service window. The current code ignores both.
5. **Suppression list.** Hard bounces and spam complaints are not tracked. We will keep emailing addresses that bounced, get our sender reputation tanked, and harm every tenant on the platform.
6. **Operational observability.** Per-tenant Sentry tags, structured logging with `tenant_id`, per-tenant Prometheus metrics, runbooks — none of this exists. When NHQS reports "emails aren't arriving" we have no way to debug per-tenant.
7. **Module gap closure.** Several modules dispatch comms via the right service (`NotificationsService`); finance writes directly to the `notification` table bypassing rate limits, audit logs, and consent. Trips, school-closures, leave, health, and SEN don't dispatch comms at all when they should. The `'push'` channel option in the settings UI references a channel that doesn't exist in the backend.

This rebuild promotes the dispatch infrastructure into a **complete, world-class communication module**: tenant-isolated credentials, webhook-driven delivery tracking, deliverability hygiene, WhatsApp compliance, suppression management, full observability, and clean module boundaries.

The reference architecture is `TenantStripeConfig` — a proven encryption + tenant-scoped credentials pattern already in production. We replicate it three times (email, SMS, WhatsApp), then build the operational stack on top.

---

## 2. Scope

### In scope

- **Three new credential tables** (`tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`) with AES-256-GCM encrypted secrets, key rotation via `keyRef`, last-4 masking on read, and `is_enabled` flag.
- **Five new operational tables** (`notification_suppression_list`, `tenant_email_domains`, `whatsapp_templates`, `whatsapp_service_windows`, `notification_webhook_events`).
- **Three new services + controllers** mirroring `StripeConfigService` exactly — `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService`. CRUD + `getDecryptedConfig` (internal-only) + `verifyConfig` (test send).
- **Provider refactor** — `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider` all read tenant config first. **No `.env` fallback exists post-rebuild.** Tenant config is the only path.
- **Per-tenant client cache** with Redis pub/sub invalidation on channel `comms:config-changed`. Both API and worker subscribe; both invalidate on every config mutation.
- **Mid-flight enforcement** — worker re-reads `is_enabled` per notification, not once per batch. Disabling a channel mid-flight stops the next pending row.
- **Webhook receivers** — `POST /v1/webhooks/communications/{email,sms,whatsapp}/:tenant_id` with per-tenant signature verification. Resend bounce / delivery / complaint events drive `notification.status`. Hard bounces and complaints add to suppression list. Twilio status callbacks drive SMS / WhatsApp status. Every event is logged in `notification_webhook_events`.
- **Suppression list** — `notification_suppression_list` table; outbound dispatch checks before send, skips with `failure_reason='suppressed:{reason}'`. Soft bounces expire after 30 days; hard bounces / complaints / unsubscribes are permanent until manually cleared.
- **Email deliverability** — domain registration via Resend API, SPF/DKIM/DMARC record display, periodic verification refresh (`comms:domain-verification-refresh` cron, every 30 min). Outbound from unverified domain → `failure_reason='sender_domain_unverified'`.
- **WhatsApp template lifecycle** — `whatsapp_templates` table, submission to Twilio, approval status sync (`comms:whatsapp-template-sync` cron, every 15 min). Approved templates carry `twilio_template_sid`. Outside 24-hour service window: only approved templates allowed.
- **WhatsApp service window** — `whatsapp_service_windows` table tracks `last_inbound_at` per recipient. Inbound webhook updates it; outbound check enforces 24-hour rule.
- **Verification endpoints** — `POST /v1/{email,sms,whatsapp}-config/test` sends a real provider message to a supplied recipient using a fixed sentinel template. Rate-limited 3/hr/tenant on a separate Redis bucket. Surfaces verbatim provider errors. Sets `last_verified_at` on success.
- **Operational layer** — Sentry tagging (`tenant_id`, `channel`, `template_key`, `notification_id`) on every comms exception; structured `CommsLoggerService` that forces these fields on every log line; Prometheus counters (`notifications_dispatched_total`, `notifications_dispatch_duration_seconds`, `notifications_suppressed_total`, `notifications_webhook_received_total`, `notifications_template_renders_total`); Grafana dashboard (`docs/operations/dashboards/communications.json`); three new runbooks.
- **Frontend Settings UI** — `(school)/settings/communications/` with index + email + sms + whatsapp pages. `react-hook-form` + `zodResolver`. Status indicators wired to live health checks. Test send UI with recipient input and verbatim error display. Domain verification card on email page (DNS records table + refresh button). Template list + submission form on WhatsApp page. EN + AR translations. Mobile responsive at 375px. RTL-safe (logical CSS only).
- **Module gap closure** — wire `auth-password-reset.service.ts` (currently stubbed), add password-changed notification, wire trips / school-closures / leave / health / SEN modules to `NotificationsService`. Migrate `payment-reminders.service.ts` off direct DB writes. Replace `'push'` with `'whatsapp'` in `(school)/settings/notifications/page.tsx`. Add `'sms'` to `NotificationTemplate` channel type union.
- **Test tenant backfill** — provision NHQS + stress-a/b/c/d × 3 channels (15 config rows total) with channel-specific dev credentials. Verify each via test send. Generate the production cutover script (run by user when merging to main).
- **Architecture docs update** — `module-blast-radius.md`, `feature-map.md`, `danger-zones.md`, `event-job-catalog.md`, `state-machines.md`, `communication-architecture.md` all reflect post-rebuild reality.
- **Comprehensive E2E verification** — Playwright walkthrough on local dev server: 5 tenants × 3 channels × full flow (config → test send → webhook receive → status update → suppression check). Cap at ~20 minutes per memory; spot-check then move on.

### Out of scope for this rebuild

- **Platform admin tenant config UI.** Decided: yes, eventually, read-only. Not in V1; tracked as follow-up.
- **Engagement tracking.** Resend `email.opened` events arrive but we ignore them. The `notification_engagement_event` table is V2.
- **Per-tenant rate limit overrides.** Today rate limits are platform-wide constants. V1 keeps it that way.
- **Channel preview for WhatsApp.** Out of scope.
- **Imports from external comms providers.** SendGrid / Mailgun / Vonage are not supported; provider lock-in is intentional.
- **In-app push notifications.** The `'push'` option in the settings UI is removed (replaced with `'whatsapp'`). True web push is V2.
- **AI-generated message content.** Out of scope; the architecture leaves `notification_template` as the only template source.
- **Any change to the existing dispatch infrastructure** beyond the provider refactor — `notification-dispatch.service.ts`, `notifications.service.ts`, `notification-rate-limit.service.ts`, audience resolution, fallback chain, retry logic, idempotency, two-phase dispatch all remain as-is.
- **Production deployment.** This entire rebuild ships in a worktree. The user manually merges to `main` after Impl 14. CI will run when the merge happens.

---

## 3. The credential model — three independent tables, one pattern

The single most consequential design call is that **email, SMS, and WhatsApp are three separate first-class credential records**, not one unified credentials table.

### 3.1 Why separate

| Dimension              | Email                                | SMS                                  | WhatsApp                                     |
| ---------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------------- |
| **Provider**           | Resend                               | Twilio                               | Twilio                                       |
| **Sender format**      | Email + display name + reply-to      | E.164 phone number                   | E.164 phone number + business profile ID     |
| **Compliance layer**   | SPF/DKIM/DMARC domain verification   | Phone number verification by Twilio  | Template approval + 24h service window       |
| **Webhook event set**  | `delivered`, `bounced`, `complained` | `delivered`, `failed`, `undelivered` | Same as SMS plus inbound for window tracking |
| **Independent enable** | Yes — tenant may run email-only      | Yes                                  | Yes                                          |
| **Cache invalidation** | Per channel                          | Per channel                          | Per channel                                  |

Forcing these into one entity would couple their lifecycles, complicate enable/disable, and prevent a future swap of one provider without affecting the others. Three tables, three services, three controllers, three settings pages. One shared `EncryptionService`. One shared `CommsCacheBus`. One shared webhook signature verification utility.

### 3.2 What they share

- **Encryption** — single `EncryptionService` (already in production for Stripe).
- **RLS** — identical `<table>_tenant_isolation` policy.
- **Audit logging** — identical `AuditLogInterceptor` + `SecurityAuditService` integration.
- **Permission gating** — `configuration.communications.view` + `configuration.communications.manage` cover all three.
- **Cache invalidation channel** — single `comms:config-changed` Redis pub/sub channel; payload `{ tenant_id, channel }`.
- **Webhook signature verifier** — shared utility; takes the channel-specific algorithm and the tenant's webhook_secret.

---

## 4. Operational stack

The credential layer is necessary but not sufficient. A world-class comms module also needs:

### 4.1 Suppression list

Every channel respects `notification_suppression_list`. Hard bounces, spam complaints, manual blocks, and unsubscribes get a row. Outbound dispatch consults the list (Redis-cached, 5-min TTL) before sending. Suppressed sends are skipped with `failure_reason='suppressed:{reason}'`; the fallback chain still tries the next channel.

Cron `comms:suppression-list-cleanup` runs daily, expires soft-bounce rows older than 30 days. Hard bounces, complaints, and manual blocks are permanent until cleared via a future admin UI (V2).

### 4.2 Email deliverability

`tenant_email_domains` stores the SPF/DKIM/DMARC verification status per domain. Resend's domain API returns the canonical record set; the UI displays it for the tenant to add to their DNS provider. Cron `comms:domain-verification-refresh` (every 30 min) polls Resend, updates per-record status, sets `verified_at` on all-three-green. Outbound dispatch enforces verified-domain status — sends from unverified domains skip with `failure_reason='sender_domain_unverified'`.

### 4.3 WhatsApp templates + 24-hour window

`whatsapp_templates` per tenant per template_key per language. Lifecycle: `pending → submitted → approved | rejected | paused`. Cron `comms:whatsapp-template-sync` (every 15 min) iterates `submitted` templates, polls Twilio's content API, updates status and `twilio_template_sid`.

`whatsapp_service_windows` per tenant per recipient phone tracks `last_inbound_at`. Inbound webhook updates it. Outbound check: if `expires_at > now()` free-form allowed; otherwise the dispatch payload must carry a `template_key` resolving to an approved row. Free-form sends outside the window are skipped with `failure_reason='outside_service_window_no_template'`.

### 4.4 Webhook ingestion

Three new endpoints: `POST /v1/webhooks/communications/{email,sms,whatsapp}/:tenant_id`. Each:

1. Looks up the tenant's webhook_secret.
2. Verifies the signature (Svix-Signature for Resend, X-Twilio-Signature for Twilio).
3. On signature failure: writes `notification_webhook_events` row with `signature_verified=false`, returns 401.
4. On success: writes the event row, resolves the matching `notification` (via `provider_message_id` or `MessageSid`), updates status, may add to suppression list.

Every event — verified or not — is logged for audit and replay.

### 4.5 Verification & test sends

`POST /v1/{email,sms,whatsapp}-config/test` sends a real provider message using a fixed sentinel template. Rate-limited 3/hr/tenant on a separate Redis bucket from notification rate limits. Surfaces verbatim provider errors. Sets `last_verified_at` on success. The settings UI exposes this with a recipient input and result display.

### 4.6 Observability

Per-tenant Sentry tagging (`tenant_id`, `channel`, `template_key`, `notification_id`). Structured `CommsLoggerService` enforcing the same fields on every log line. Prometheus metrics with per-tenant labels. Grafana dashboard. Three runbooks (tenant dispatch failures / credential rotation / webhook debugging).

### 4.7 Module hygiene

Finance's direct-DB-write pattern in `payment-reminders.service.ts:220` migrates to `NotificationsService.dispatch()`. Trips, school-closures, staff-leave, health, and SEN modules wire to `NotificationsService` for the comms touchpoints they currently lack. Auth's stubbed password-reset email is wired; a new password-changed notification is added. The `'push'` option in `(school)/settings/notifications/page.tsx` is replaced with `'whatsapp'`. `'sms'` is added to the `NotificationTemplate` channel type union so types match reality.

---

## 5. Component map

### 5.1 Backend — new files

```
apps/api/src/modules/configuration/
├── email-config.service.ts                          [NEW]
├── email-config.controller.ts                       [NEW]
├── email-config.service.spec.ts                     [NEW]
├── sms-config.service.ts                            [NEW]
├── sms-config.controller.ts                         [NEW]
├── sms-config.service.spec.ts                       [NEW]
├── whatsapp-config.service.ts                       [NEW]
├── whatsapp-config.controller.ts                    [NEW]
└── whatsapp-config.service.spec.ts                  [NEW]

apps/api/src/modules/communications/
├── webhooks/
│   ├── communications-webhooks.controller.ts        [NEW]
│   ├── webhook-signature-verifier.service.ts        [NEW]
│   ├── resend-webhook-handler.service.ts            [NEW]
│   ├── twilio-webhook-handler.service.ts            [NEW]
│   └── *.spec.ts                                    [NEW]
├── suppression/
│   ├── suppression-list.service.ts                  [NEW]
│   └── suppression-list.service.spec.ts             [NEW]
├── deliverability/
│   ├── email-domain.service.ts                      [NEW]
│   ├── email-domain.controller.ts                   [NEW]
│   └── email-domain.service.spec.ts                 [NEW]
├── whatsapp-templates/
│   ├── whatsapp-template.service.ts                 [NEW]
│   ├── whatsapp-template.controller.ts              [NEW]
│   ├── whatsapp-service-window.service.ts           [NEW]
│   └── *.spec.ts                                    [NEW]
├── comms-cache-bus.service.ts                       [NEW: Redis pub/sub coordinator]
├── comms-logger.service.ts                          [NEW: structured logger]
├── comms-metrics.service.ts                         [NEW: Prometheus counters/histograms]
└── providers/
    ├── resend-email.provider.ts                     [REFACTOR: tenant-first dispatch]
    ├── twilio-sms.provider.ts                       [REFACTOR: tenant-first dispatch]
    ├── twilio-whatsapp.provider.ts                  [REFACTOR: tenant-first + service window]
    └── per-tenant-client-cache.ts                   [NEW: shared LRU cache abstraction]

apps/worker/src/processors/communications/
├── dispatch-notifications.processor.ts              [REFACTOR: tenant-first + mid-flight check]
├── domain-verification-refresh.processor.ts         [NEW]
├── whatsapp-template-sync.processor.ts              [NEW]
└── suppression-list-cleanup.processor.ts            [NEW]

apps/worker/src/base/
└── cron-scheduler.service.ts                        [updated: register 3 new cron jobs]
```

### 5.2 Shared types — new

```
packages/shared/src/schemas/
└── communication-config.schema.ts                   [NEW: all credential + verify Zod schemas]

packages/shared/src/constants/
├── notification-types.ts                            [updated: +9 new types]
└── communications.ts                                [NEW: cache bus channel name, suppression reasons enum, etc.]

packages/shared/src/types/
└── notification-template.ts                         [updated: +'sms' to channel union]
```

### 5.3 Frontend — new files

```
apps/web/src/app/[locale]/(school)/settings/communications/
├── page.tsx                                         [NEW: index w/ status indicators]
├── email/
│   ├── page.tsx                                     [NEW]
│   └── _components/
│       ├── domain-verification-card.tsx             [NEW]
│       └── dns-records-table.tsx                    [NEW]
├── sms/
│   └── page.tsx                                     [NEW]
└── whatsapp/
    ├── page.tsx                                     [NEW]
    └── _components/
        ├── template-list.tsx                        [NEW]
        └── template-submit-form.tsx                 [NEW]

apps/web/src/app/[locale]/(school)/settings/notifications/
└── page.tsx                                         [updated: 'push' → 'whatsapp']
```

### 5.4 Schema — new tables

- `tenant_email_configs` — NEW (Impl 01).
- `tenant_sms_configs` — NEW (Impl 01).
- `tenant_whatsapp_configs` — NEW (Impl 01).
- `notification_suppression_list` — NEW (Impl 01, used by Impl 06).
- `tenant_email_domains` — NEW (Impl 01, used by Impl 07).
- `whatsapp_templates` — NEW (Impl 01, used by Impl 08).
- `whatsapp_service_windows` — NEW (Impl 01, used by Impl 08).
- `notification_webhook_events` — NEW (Impl 01, used by Impl 06).

All tenant-scoped. All with `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy.

### 5.5 Permissions — new

| Permission                            | Default roles    |
| ------------------------------------- | ---------------- |
| `configuration.communications.view`   | Owner, Principal |
| `configuration.communications.manage` | Owner, Principal |

Backfilled to existing role mappings on all 5 test tenants by Impl 02.

### 5.6 BullMQ — new jobs

| Queue           | Job name                            | Schedule         | Payload                                           |
| --------------- | ----------------------------------- | ---------------- | ------------------------------------------------- |
| `notifications` | `comms:domain-verification-refresh` | cron 30 min      | `{}` (cross-tenant, iterates pending domains)     |
| `notifications` | `comms:whatsapp-template-sync`      | cron 15 min      | `{}` (cross-tenant, iterates submitted templates) |
| `notifications` | `comms:suppression-list-cleanup`    | cron 03:00 daily | `{}` (cross-tenant, expires soft bounces)         |

### 5.7 Cross-module touchpoints

The communications module **consumes** from `configuration` for credential lookups and is **consumed by** every module that dispatches notifications. The full dependency map is updated in `module-blast-radius.md` by Impl 14.

The single direct DB write into another module's tables — `payment-reminders.service.ts` writing to `notification` — is removed by Impl 12. Post-rebuild, every comms touchpoint flows through `NotificationsService.dispatch()`.

---

## 6. Phase breakdown

| Wave  | #   | Title                                                                  |
| ----- | --- | ---------------------------------------------------------------------- |
| **1** | 01  | Schema + migration + RLS (8 new tables)                                |
| **1** | 02  | Permissions + RBAC + role backfill on test tenants                     |
| **2** | 03  | Zod schemas + 3 services + 3 controllers + comprehensive tests         |
| **3** | 04  | Provider refactor + per-tenant client cache + Redis pub/sub            |
| **3** | 05  | Worker parity + `.env` removal + mid-flight enforcement                |
| **3** | 06  | Webhooks + signature verification + suppression list                   |
| **3** | 07  | Email deliverability — domain verification + DNS                       |
| **3** | 08  | WhatsApp templates + approval sync + 24-hour window                    |
| **3** | 09  | `verifyConfig` + test endpoints with full semantics                    |
| **3** | 10  | Operational layer — Sentry + logging + metrics + runbooks              |
| **4** | 11  | Frontend Settings UI                                                   |
| **4** | 12  | Module gap closure + cleanups (finance, push→whatsapp, password reset) |
| **5** | 13  | Tenant backfill (5 test tenants × 3 channels) in dev DB                |
| **5** | 14  | Architecture docs + comprehensive E2E verification on local dev        |

See `implementations/NN-*.md` for each phase's spec.
See `IMPLEMENTATION_LOG.md` for execution rules and completion records.
