# Communication Architecture — School Operating System

> **Purpose**: Authoritative reference for how the platform communicates with parents, guardians, students, applicants, and staff across the four supported channels (in-app, email, SMS, WhatsApp). Defines the existing dispatch infrastructure, the target tenant-configurable credential model, and the full operational stack (webhooks, deliverability, templates, observability) required for a world-class communication module.
> **Status**: Dispatch infrastructure is fully built. Per-tenant credentials, webhooks, deliverability, WhatsApp templates, and the operational layer are NOT YET implemented. The 14-implementation overhaul tracked in `communicationnew/PLAN.md` ports the existing `TenantStripeConfig` pattern to `TenantEmailConfig`, `TenantSmsConfig`, `TenantWhatsAppConfig`, adds the `NotificationSuppressionList`, `TenantEmailDomain`, `WhatsAppTemplate`, and `NotificationWebhookEvent` tables, and removes platform `.env` credential paths entirely.
> **Last verified**: 2026-04-27

---

## 1. Channel Model

The platform supports exactly four communication channels. **In-app is mandatory and always-on**; the other three are tenant-configured optional channels.

| Channel      | Provider                   | Mandatory                   | Tenant-Configurable    | Credential Storage Today | Credential Storage (Target)        |
| ------------ | -------------------------- | --------------------------- | ---------------------- | ------------------------ | ---------------------------------- |
| **In-app**   | Internal DB + inbox bridge | Yes (default for ALL comms) | No (platform-internal) | N/A                      | N/A                                |
| **Email**    | Resend                     | No                          | Yes                    | Platform `.env` only     | `TenantEmailConfig` (encrypted)    |
| **SMS**      | Twilio                     | No                          | Yes                    | Platform `.env` only     | `TenantSmsConfig` (encrypted)      |
| **WhatsApp** | Twilio                     | No                          | Yes                    | Platform `.env` only     | `TenantWhatsAppConfig` (encrypted) |

### Provider Lock-In (Confirmed)

- **Resend** is the chosen email provider. No SendGrid, SES, Mailgun, SMTP, or other email backends will be supported in the tenant config UI.
- **Twilio** is the chosen SMS and WhatsApp provider. SMS and WhatsApp share `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` patterns but use different sender numbers (`twilio_from_number` for SMS, `twilio_whatsapp_from_number` for WhatsApp). The per-tenant model treats them as separate tables each carrying their own SID/token pair so a tenant can use distinct Twilio sub-accounts per channel if they wish.

### `.env` Credentials are Removed

`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` are deleted from env validation in Implementation 05. After cutover, **the only path to dispatch is a configured tenant**. No platform-shared fallback exists in any environment, including local dev. Local dev uses test tenant configs seeded by Implementation 13.

### In-App Default Behaviour

Every notification dispatched through the platform always lands in the in-app inbox first. Email/SMS/WhatsApp are additive — they are extra channels triggered alongside the in-app delivery, not replacements. If a tenant has not configured email/SMS/WhatsApp credentials, the dispatch system marks those channel rows `failed` with `failure_reason='channel_not_configured'` and the in-app delivery still succeeds.

---

## 2. Current Dispatch Infrastructure (Built)

All file paths are relative to repo root.

### Provider Classes (lazy-init, circuit-breaker-wrapped)

| File                                                                        | Responsibility                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/api/src/modules/communications/providers/resend-email.provider.ts`    | Resend SDK v4.1.0. `client.emails.send()` with idempotency-key header.                  |
| `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`      | Twilio SDK v5.4.0. SMS via `client.messages.create()`. 1600-char truncation with `...`. |
| `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` | Twilio. Auto-prefixes `whatsapp:` on phone numbers. Consent-gated.                      |
| `apps/api/src/modules/communications/providers/inbox-channel.provider.ts`   | No-op provider. In-app delivery is synchronous DB write upstream of dispatch.           |

Each provider exposes `isConfigured(): boolean` and reads its config from `ConfigService` today (`.env` only). Implementation 04 refactors all three to read from per-tenant config tables.

### Dispatch Services

| File                                                                     | Responsibility                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/api/src/modules/communications/notification-dispatch.service.ts`   | Routes a `notification` row to its channel provider. Implements fallback chain.  |
| `apps/api/src/modules/communications/notifications.service.ts`           | CRUD on `notification` rows. Unread counts (Redis-cached). Mark-as-read.         |
| `apps/api/src/modules/communications/notification-templates.service.ts`  | Per-channel, per-locale, tenant + platform template resolution.                  |
| `apps/api/src/modules/communications/template-renderer.service.ts`       | Handlebars renderer with EN/AR helpers. SHA256-keyed compiled-template cache.    |
| `apps/api/src/modules/communications/notification-rate-limit.service.ts` | Redis sliding window: 10/hr/channel, 30/day/total. In-app + safeguarding exempt. |
| `apps/api/src/modules/communications/audience-resolution.service.ts`     | Resolves recipients by scope: school, year_group, class, household, custom.      |
| `apps/api/src/modules/communications/announcements.service.ts`           | Broadcast publishing. Pushes to inbox bridge + queues notification dispatch.     |
| `apps/api/src/modules/communications/inbox-bridge.service.ts`            | Mirrors announcements into inbox conversations.                                  |
| `apps/api/src/modules/communications/unsubscribe.service.ts`             | Per-user opt-out checks before dispatch.                                         |

### Worker Processors

| File                                                                            | Responsibility                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`         | Cron every 30s. Scans `status='queued'`, batches per tenant, enqueues dispatch.              |
| `apps/worker/src/processors/notifications/notifications-queue.processor.ts`     | Main job-name router for the `notifications` queue.                                          |
| `apps/worker/src/processors/notifications/parent-daily-digest.processor.ts`     | Hourly cron at tenant `send_hour_utc`. Aggregates attendance/grades/behaviour/homework/fees. |
| `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` | Two-phase dispatch: RLS read (transactional) → external HTTP (non-transactional).            |
| `apps/worker/src/processors/communications/retry-failed.processor.ts`           | Reschedules `status='failed'` rows. Exponential backoff `60_000 × 2^attempt`.                |

### Database Tables (Existing)

| Table                   | Purpose                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notification`          | Per-recipient row. Status machine extended in Impl 06: `queued → sent → delivered → read \| bounced \| complained \| failed`. `chain_id` for fallback. |
| `notification_template` | `(tenant_id nullable, channel, template_key, locale)` — tenant override + platform fallback.                                                           |

### Resilience Patterns

- **Retry**: Per-row `max_attempts` (default 3), exponential backoff, `next_retry_at` updated on failure.
- **Fallback chain**: `whatsapp → sms → email → in_app`. Tracked via `chain_id` UUID linking all fallback rows.
- **Rate limit**: 10 per hour per channel per user; 30 per day total per user. `in_app` always exempt; `safeguarding_*` templates exempt for safety.
- **Consent gating**: WhatsApp dispatch checks `CONSENT_TYPES.WHATSAPP_CHANNEL` via `ConsentService` before sending.
- **Idempotency**: Resend `X-Entity-Ref-ID` header + per-job idempotency keys for jobs that may re-fire.
- **PgBouncer-safe**: Worker dispatch splits DB reads (inside RLS transaction) from HTTP sends (outside transaction) so external API latency never blocks pooled Postgres connections.

### Notification Type Constants

Defined in `packages/shared/src/constants/notification-types.ts`:

```
invoice.issued, payment.received, payment.failed, report_card.published,
attendance.exception, attendance.absent, attendance.late, attendance.left_early,
attendance.pattern_detected, admission.status_change, announcement.published,
approval.requested, approval.decided, inquiry.new_message,
payroll.finalised, payslip.generated, parent.daily_digest
```

Implementation 12 adds: `auth.password_reset`, `auth.password_changed`, `trip.invitation`, `trip.payment_due`, `school.closure`, `staff.leave_decision`, `health.incident`, `sen.eha_update`.

### Module → Comms Touchpoint Map

| Module                    | Trigger Files (with line refs)                                                                                                                                                                                                                                                                                                    | Recipient(s)                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Attendance**            | `attendance-parent-notification.service.ts:136`, `attendance-pattern.service.ts:202`                                                                                                                                                                                                                                              | Parents                                                                  |
| **Behaviour**             | `behaviour-amendments.service.ts:440`, `behaviour-document.service.ts:392`, `behaviour-exclusion-cases.service.ts:764`, `behaviour-award.service.ts:154,258`, `behaviour-side-effects.service.ts:56,94`, `worker/processors/behaviour/parent-notification.processor.ts`, `worker/processors/behaviour/ack-reminders.processor.ts` | Parents (severity-gated)                                                 |
| **Gradebook**             | `grading/grade-publishing.service.ts:218`, `progress/progress-report.service.ts:286`, `report-cards/report-card-teacher-requests.service.ts:689,697`                                                                                                                                                                              | Parents, teachers                                                        |
| **Homework**              | `homework-notification.service.ts:143,218,304`, `worker/processors/homework/overdue-detection.processor.ts:165`                                                                                                                                                                                                                   | Parents, teachers                                                        |
| **Pastoral**              | `pastoral-notification.service.ts:530,545`, `concern.service.ts:676`, `intervention.service.ts:899`, `checkin-alert.service.ts:172`, `worker/processors/pastoral/escalation-timeout.processor.ts`                                                                                                                                 | Tiered staff (year head → DLO → principal) by severity, parents on share |
| **Safeguarding**          | `safeguarding-concerns.service.ts:226,678,961`, `safeguarding-break-glass.service.ts:175,197,206,215`, `worker/processors/safeguarding/critical-escalation.processor.ts:172`, `worker/processors/safeguarding/notify-reviewers.processor.ts:96`                                                                                   | DLO, deputy DLO, escalation chain                                        |
| **Engagement**            | `event-participants.service.ts:423`, `worker/processors/engagement/engagement-conference-reminders.processor.ts:93`                                                                                                                                                                                                               | Parents/staff with bookings                                              |
| **Parent inquiries**      | `parent-inquiries.service.ts:189,250,305`                                                                                                                                                                                                                                                                                         | School admins, parent (on reply)                                         |
| **Finance**               | `payment-reminders.service.ts:19,62,101,220` ⚠️ direct DB write — **fixed in Impl 12** (migrates to `NotificationsService`)                                                                                                                                                                                                       | Billing parent                                                           |
| **Admissions**            | `application-state-machine.service.ts:316,801,833`, `admissions-auto-promotion.service.ts:216`, `applications.service.ts:530`                                                                                                                                                                                                     | Applicant (parent)                                                       |
| **RBAC**                  | `invitations.service.ts:124`                                                                                                                                                                                                                                                                                                      | Invited user (email)                                                     |
| **Approvals**             | `approval-requests.service.ts:305`                                                                                                                                                                                                                                                                                                | Domain-specific (e.g. announcement publisher)                            |
| **Communications**        | `announcements.service.ts:344,350`                                                                                                                                                                                                                                                                                                | Audience-resolved (parents/staff/students)                               |
| **Inbox**                 | `inbox-outbox.service.ts:158`                                                                                                                                                                                                                                                                                                     | Message recipients (opt-in external channels)                            |
| **Daily digest**          | `worker/processors/notifications/parent-daily-digest.processor.ts`                                                                                                                                                                                                                                                                | All parents with active children                                         |
| **Auth (NEW)**            | `auth-password-reset.service.ts:61`, `auth-password-changed.service.ts` (Impl 12 wires the existing stub + adds the new service)                                                                                                                                                                                                  | User                                                                     |
| **Trips (NEW)**           | `trips/trip-invitations.service.ts`, `trips/trip-payment-reminders.service.ts` (wired by Impl 12)                                                                                                                                                                                                                                 | Parents                                                                  |
| **School Closures (NEW)** | `school-closures/closure-notifications.service.ts` (wired by Impl 12)                                                                                                                                                                                                                                                             | Parents + staff                                                          |
| **Leave (NEW)**           | `staff-leave/leave-decision-notifier.service.ts` (wired by Impl 12)                                                                                                                                                                                                                                                               | Staff                                                                    |
| **Health (NEW)**          | `health/health-incident-notifier.service.ts` (wired by Impl 12)                                                                                                                                                                                                                                                                   | Parents                                                                  |
| **SEN (NEW)**             | `sen/eha-update-notifier.service.ts` (wired by Impl 12)                                                                                                                                                                                                                                                                           | Parents + SEN coordinator                                                |

---

## 3. Target State — Per-Tenant Credential Configuration + Operational Stack

The reference pattern is `TenantStripeConfig`, which already provides the encryption and tenant settings UX we want to replicate. Each tenant gains three independent credential records (email, SMS, WhatsApp) plus operational tables for suppression, domain verification, WhatsApp template approval, and webhook event logging.

### 3.1 Encryption Foundation (Reused, Not Rebuilt)

`apps/api/src/modules/configuration/encryption.service.ts` already provides:

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key format**: 32-byte secret stored as 64 hex chars in `ENCRYPTION_KEY_V{n}` env vars
- **Key rotation**: Versioned via `keyRef` ("v1", "v2", ...). Rows store the `keyRef` used to encrypt, allowing live key rotation without reading-time failures.
- **Ciphertext format**: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
- **API**: `encrypt(plaintext) → { encrypted, keyRef }`, `decrypt(encrypted, keyRef) → plaintext`, `mask(value) → "•••• last4"`

No new crypto code. All three new credential services reuse this single `EncryptionService` instance.

### 3.2 Database Schema (New Tables)

#### `TenantEmailConfig`

```prisma
model TenantEmailConfig {
  id                       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String    @unique @db.Uuid
  resend_api_key_encrypted String    @db.Text
  from_email               String    @db.VarChar(255)
  from_name                String?   @db.VarChar(255)
  reply_to_email           String?   @db.VarChar(255)
  webhook_secret_encrypted String?   @db.Text
  encryption_key_ref       String    @db.VarChar(255)
  key_last_rotated_at      DateTime? @db.Timestamptz()
  is_enabled               Boolean   @default(true)
  last_verified_at         DateTime? @db.Timestamptz()
  created_by_user_id       String?   @db.Uuid
  created_at               DateTime  @default(now()) @db.Timestamptz()
  updated_at               DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation(fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_email_configs")
}
```

#### `TenantSmsConfig`

```prisma
model TenantSmsConfig {
  id                          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                   String    @unique @db.Uuid
  twilio_account_sid_encrypted String   @db.Text
  twilio_auth_token_encrypted  String   @db.Text
  twilio_from_number          String    @db.VarChar(50)
  webhook_secret_encrypted    String?   @db.Text
  encryption_key_ref          String    @db.VarChar(255)
  key_last_rotated_at         DateTime? @db.Timestamptz()
  is_enabled                  Boolean   @default(true)
  last_verified_at            DateTime? @db.Timestamptz()
  created_by_user_id          String?   @db.Uuid
  created_at                  DateTime  @default(now()) @db.Timestamptz()
  updated_at                  DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation(fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_sms_configs")
}
```

#### `TenantWhatsAppConfig`

```prisma
model TenantWhatsAppConfig {
  id                            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                     String    @unique @db.Uuid
  twilio_account_sid_encrypted  String    @db.Text
  twilio_auth_token_encrypted   String    @db.Text
  twilio_whatsapp_from_number   String    @db.VarChar(50)
  business_profile_id           String?   @db.VarChar(255)
  webhook_secret_encrypted      String?   @db.Text
  encryption_key_ref            String    @db.VarChar(255)
  key_last_rotated_at           DateTime? @db.Timestamptz()
  is_enabled                    Boolean   @default(true)
  last_verified_at              DateTime? @db.Timestamptz()
  created_by_user_id            String?   @db.Uuid
  created_at                    DateTime  @default(now()) @db.Timestamptz()
  updated_at                    DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant     Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by User?  @relation(fields: [created_by_user_id], references: [id], onDelete: SetNull)

  @@map("tenant_whatsapp_configs")
}
```

#### `NotificationSuppressionList` (NEW — Impl 06)

```prisma
model NotificationSuppressionList {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String    @db.Uuid
  channel           NotificationChannel
  recipient_address String    @db.VarChar(320)   // email, phone, or whatsapp number
  reason            SuppressionReason             // hard_bounce | soft_bounce_threshold | complaint | manual | unsubscribe
  source            String?   @db.VarChar(64)    // 'webhook:resend.bounce', 'webhook:twilio.failed', 'manual'
  notification_id   String?   @db.Uuid           // FK to triggering notification, if any
  expires_at        DateTime? @db.Timestamptz()  // null = permanent; soft bounces expire after 30d
  created_at        DateTime  @default(now()) @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, channel, recipient_address], map: "uq_suppression_tenant_channel_recipient")
  @@index([tenant_id, channel, expires_at], map: "idx_suppression_tenant_channel_expiry")
  @@map("notification_suppression_list")
}

enum SuppressionReason {
  hard_bounce
  soft_bounce_threshold
  complaint
  manual
  unsubscribe
}
```

#### `TenantEmailDomain` (NEW — Impl 07)

```prisma
model TenantEmailDomain {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String    @db.Uuid
  domain              String    @db.VarChar(255)              // e.g. "school.example.org"
  resend_domain_id    String?   @db.VarChar(255)              // ID Resend gives back on register
  status              EmailDomainStatus                       // pending | verified | failed
  spf_status          DnsRecordStatus
  dkim_status         DnsRecordStatus
  dmarc_status        DnsRecordStatus
  dns_records_json    Json                                    // canonical record list returned by Resend
  last_checked_at     DateTime? @db.Timestamptz()
  verified_at         DateTime? @db.Timestamptz()
  failure_reason      String?   @db.Text
  created_by_user_id  String?   @db.Uuid
  created_at          DateTime  @default(now()) @db.Timestamptz()
  updated_at          DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, domain], map: "uq_email_domain_tenant_domain")
  @@index([status, last_checked_at], map: "idx_email_domain_status_check")
  @@map("tenant_email_domains")
}

enum EmailDomainStatus { pending verified failed }
enum DnsRecordStatus { pending verified failed }
```

#### `WhatsAppTemplate` (NEW — Impl 08)

```prisma
model WhatsAppTemplate {
  id                      String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id               String    @db.Uuid
  template_key            String    @db.VarChar(128)   // local key — joins to notification_template.template_key
  twilio_template_sid     String?   @db.VarChar(64)    // Twilio's HXxxxxx SID once registered
  template_name           String    @db.VarChar(128)   // Twilio-side name
  language_code           String    @db.VarChar(16)    // 'en', 'ar' etc.
  category                WhatsAppTemplateCategory     // utility | marketing | authentication
  body                    String    @db.Text
  status                  WhatsAppTemplateStatus       // pending | submitted | approved | rejected | paused
  approval_message        String?   @db.Text
  submitted_at            DateTime? @db.Timestamptz()
  approved_at             DateTime? @db.Timestamptz()
  last_synced_at          DateTime? @db.Timestamptz()
  created_at              DateTime  @default(now()) @db.Timestamptz()
  updated_at              DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, template_key, language_code], map: "uq_whatsapp_template_tenant_key_lang")
  @@index([status, last_synced_at], map: "idx_whatsapp_template_status_sync")
  @@map("whatsapp_templates")
}

enum WhatsAppTemplateCategory { utility marketing authentication }
enum WhatsAppTemplateStatus { pending submitted approved rejected paused }
```

#### `WhatsAppServiceWindow` (NEW — Impl 08)

```prisma
model WhatsAppServiceWindow {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String    @db.Uuid
  recipient_phone     String    @db.VarChar(50)            // E.164
  last_inbound_at     DateTime  @db.Timestamptz()         // when recipient last messaged us
  expires_at          DateTime  @db.Timestamptz()         // last_inbound_at + 24h
  created_at          DateTime  @default(now()) @db.Timestamptz()
  updated_at          DateTime  @default(now()) @updatedAt @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, recipient_phone], map: "uq_whatsapp_window_tenant_recipient")
  @@index([expires_at], map: "idx_whatsapp_window_expiry")
  @@map("whatsapp_service_windows")
}
```

#### `NotificationWebhookEvent` (NEW — Impl 06)

Append-only audit log for every inbound webhook event from Resend/Twilio. Used for debugging and re-replay.

```prisma
model NotificationWebhookEvent {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String    @db.Uuid
  channel             NotificationChannel
  provider_event_id   String    @db.VarChar(255)          // 'resend:msg_xxx' or 'twilio:SMxxx'
  event_type          String    @db.VarChar(64)           // 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
  notification_id     String?   @db.Uuid                  // resolved from idempotency-key header / Twilio MessageSid
  payload_json        Json
  signature_verified  Boolean
  processed_at        DateTime? @db.Timestamptz()
  processing_error    String?   @db.Text
  received_at         DateTime  @default(now()) @db.Timestamptz()

  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, provider_event_id], map: "uq_webhook_tenant_provider_event")
  @@index([tenant_id, channel, received_at(sort: Desc)], map: "idx_webhook_tenant_channel_received")
  @@index([processed_at], map: "idx_webhook_processed_at")
  @@map("notification_webhook_events")
}
```

#### Relation entries on `Tenant` and `User`

```prisma
model Tenant {
  // ...existing relations...
  email_config              TenantEmailConfig?
  sms_config                TenantSmsConfig?
  whatsapp_config           TenantWhatsAppConfig?
  email_domains             TenantEmailDomain[]
  whatsapp_templates        WhatsAppTemplate[]
  whatsapp_service_windows  WhatsAppServiceWindow[]
  suppression_list          NotificationSuppressionList[]
  webhook_events            NotificationWebhookEvent[]
}

model User {
  // ...existing relations...
  email_configs_created    TenantEmailConfig[]
  sms_configs_created      TenantSmsConfig[]
  whatsapp_configs_created TenantWhatsAppConfig[]
}
```

#### Why per-channel tables instead of one unified credentials table

A single `TenantCommunicationCredentials` table would couple the three channels' lifecycle. Splitting them mirrors `TenantStripeConfig` (single-purpose, single-channel) and gives:

- Independent enable/disable per channel
- Independent rotation/verification timestamps
- Tenants can configure email-only, or email+SMS but not WhatsApp, etc.
- A future swap to a non-Twilio SMS provider doesn't require migrating WhatsApp data
- RLS policies remain trivially simple (one policy per table)

### 3.3 RLS Policies

Each new table needs the standard tenant-isolation policy. Boilerplate from `packages/prisma/rls/policies.sql`:

```sql
ALTER TABLE tenant_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_email_configs_tenant_isolation ON tenant_email_configs;
CREATE POLICY tenant_email_configs_tenant_isolation ON tenant_email_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Repeat identical pattern for: tenant_sms_configs, tenant_whatsapp_configs,
-- notification_suppression_list, tenant_email_domains, whatsapp_templates,
-- whatsapp_service_windows, notification_webhook_events.
```

Place these in the migration's companion `post_migrate.sql` file.

### 3.4 Migration Order and Naming

```
packages/prisma/migrations/{timestamp}_add_tenant_communication_configs/
├── migration.sql       # CREATE TABLE for all new tables, indexes, enums
└── post_migrate.sql    # ENABLE/FORCE RLS + tenant_isolation policies
```

Migration name: `add_tenant_communication_configs_and_operational_tables`.

### 3.5 API Layer

Three independent NestJS services and controllers for the credential tables, plus dedicated services for suppression, domains, templates, service windows, webhooks, and verification. Each credential service mirrors the Stripe pattern exactly.

#### Service Pattern (per channel)

`apps/api/src/modules/configuration/email-config.service.ts` (and analogues for SMS, WhatsApp):

- `getConfig(tenantId)` — Returns `MaskedEmailConfig` (decrypts only enough to return last-4 mask).
- `upsertConfig(tenantId, userId, dto)` — Encrypts secrets, writes row, updates `key_last_rotated_at`. Returns masked. **Publishes `comms:config-changed` Redis pub/sub event** to invalidate per-tenant client caches across processes.
- `getDecryptedConfig(tenantId)` — **Internal-only**. Returns plaintext for use by the dispatch layer. NEVER exposed via controller.
- `deleteConfig(tenantId, userId)` — Removes the row. Disables the channel for that tenant. Publishes `comms:config-changed`.
- `verifyConfig(tenantId, recipient)` — Sends a real test message via the provider, sets `last_verified_at` on success. Rate-limited 3/hr/tenant in a separate Redis bucket from notification rate limits. Surfaces provider error verbatim.

Constructor DI matches `StripeConfigService`:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly encryption: EncryptionService,
  private readonly cacheBus: CommsCacheBusService, // Redis pub/sub publisher
) {}
```

#### Controller Pattern (per channel)

`apps/api/src/modules/configuration/email-config.controller.ts` (and analogues):

```typescript
@Controller('v1/email-config')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('configuration.communications.manage')
export class EmailConfigController {
  // GET /v1/email-config
  @Get() async getConfig(@CurrentTenant() tenantContext) { ... }

  // PUT /v1/email-config
  @Put() async upsert(@CurrentTenant() tenantContext, @CurrentUser() user, @Body(new ZodValidationPipe(upsertEmailConfigSchema)) dto) { ... }

  // DELETE /v1/email-config
  @Delete() async delete(@CurrentTenant() tenantContext, @CurrentUser() user) { ... }

  // POST /v1/email-config/test
  @Post('test') async test(@CurrentTenant() tenantContext, @Body(new ZodValidationPipe(testEmailSchema)) { recipient_email }) { ... }
}
```

#### Webhook Receiver Endpoints (Impl 06)

```typescript
@Controller('v1/webhooks/communications')
export class CommunicationsWebhooksController {
  // POST /v1/webhooks/communications/email/:tenantId  (Resend)
  // POST /v1/webhooks/communications/sms/:tenantId    (Twilio status callback)
  // POST /v1/webhooks/communications/whatsapp/:tenantId (Twilio status callback)
}
```

Each receiver:

1. Looks up tenant config by path param `:tenantId`.
2. Verifies the signature using the tenant's `webhook_secret` (per-tenant secret, not platform-shared).
3. On signature failure: writes `NotificationWebhookEvent` row with `signature_verified: false` and returns 401.
4. On success: writes the event row, updates the matched `notification.status` (`delivered` / `bounced` / `complained` / `failed`), adds to suppression list if hard bounce or complaint.

#### Permissions

New permission constants needed in the RBAC module:

- `configuration.communications.view`
- `configuration.communications.manage`

Mirror the existing `configuration.stripe.view` / `configuration.stripe.manage` permissions. Bind them to the same default roles (Owner, Principal — anyone who can configure Stripe should manage comms).

**Implementation 02 backfills these permissions onto every existing role mapping for all five test tenants** (NHQS + stress-a/b/c/d) via a one-shot script. The seed handles fresh tenants; the backfill handles current ones.

#### Zod Schemas

`packages/shared/src/schemas/communication-config.schema.ts`:

```typescript
export const upsertEmailConfigSchema = z.object({
  resend_api_key: z.string().min(1).startsWith('re_'),
  from_email: z.string().email(),
  from_name: z.string().max(255).optional(),
  reply_to_email: z.string().email().optional(),
  webhook_secret: z.string().optional(),
});

export const upsertSmsConfigSchema = z.object({
  twilio_account_sid: z.string().min(1).startsWith('AC'),
  twilio_auth_token: z.string().min(1),
  twilio_from_number: z.string().regex(/^\+\d{8,16}$/, 'E.164 format required'),
  webhook_secret: z.string().optional(),
});

export const upsertWhatsAppConfigSchema = z.object({
  twilio_account_sid: z.string().min(1).startsWith('AC'),
  twilio_auth_token: z.string().min(1),
  twilio_whatsapp_from_number: z.string().regex(/^\+\d{8,16}$/, 'E.164 format required'),
  business_profile_id: z.string().optional(),
  webhook_secret: z.string().optional(),
});

export const testEmailSchema = z.object({
  recipient_email: z.string().email(),
});

export const testSmsSchema = z.object({
  recipient_phone: z.string().regex(/^\+\d{8,16}$/),
});

export const testWhatsAppSchema = z.object({
  recipient_phone: z.string().regex(/^\+\d{8,16}$/),
  template_key: z.string().min(1), // outside service window: must be approved template
});

export const registerEmailDomainSchema = z.object({
  domain: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i),
});

export const submitWhatsAppTemplateSchema = z.object({
  template_key: z.string().min(1),
  language_code: z.string().min(2).max(16),
  category: z.enum(['utility', 'marketing', 'authentication']),
  body: z.string().min(1).max(1024),
});
```

### 3.6 Provider Refactor (Impl 04)

Each of the three providers is refactored to read tenant config first. **No `.env` fallback exists post-Impl 05.** If a tenant has no config, the dispatch is marked `failed` with `failure_reason='channel_not_configured'`.

#### Target pattern (tenant-only)

```typescript
async dispatch(tenantId: string, payload: EmailPayload): Promise<DispatchResult> {
  // 0. Suppression check
  if (await this.suppressionService.isSuppressed(tenantId, 'email', payload.to)) {
    return { skipped: true, reason: 'suppressed' };
  }

  // 1. Resolve credentials
  const tenantConfig = await this.emailConfigService.getDecryptedConfig(tenantId);
  if (!tenantConfig?.is_enabled) {
    return { skipped: true, reason: 'channel_not_configured' };
  }

  // 2. Domain verification check (Impl 07)
  const fromDomain = tenantConfig.from_email.split('@')[1];
  const domain = await this.domainService.getVerified(tenantId, fromDomain);
  if (!domain) {
    return { skipped: true, reason: 'sender_domain_unverified' };
  }

  // 3. Per-tenant client cache lookup
  const client = this.clientCache.getOrCreate(tenantId, tenantConfig.resend_api_key);

  // 4. Send
  return client.emails.send({
    from: tenantConfig.from_name ? `${tenantConfig.from_name} <${tenantConfig.from_email}>` : tenantConfig.from_email,
    replyTo: tenantConfig.reply_to_email,
    ...payload,
  });
}
```

#### Per-tenant client cache + Redis pub/sub invalidation (Impl 04)

A `Map<tenant_id, ProviderClient>` cache lives inside each provider class. To stay coherent across the API and worker processes:

- A new shared service `apps/api/src/modules/communications/comms-cache-bus.service.ts` (also imported by the worker) wraps a Redis pub/sub publisher and subscriber on channel `comms:config-changed`.
- When `EmailConfigService.upsertConfig`, `deleteConfig`, or any of the SMS/WhatsApp equivalents mutate, they publish `{ tenant_id, channel }`.
- Both the API process and each worker process subscribe; on receipt they call `provider.clientCache.invalidate(tenant_id)`.
- Cache misses repopulate lazily on the next dispatch.

Eviction policy: LRU with max 1000 clients per process, 30-minute idle TTL, plus the explicit pub/sub eviction.

#### Mid-flight config change (Impl 05)

The dispatch worker re-reads `is_enabled` per notification — not once per batch. If a tenant disables a channel mid-batch, the next pending row is marked `failed` with `failure_reason='channel_disabled'` and the batch continues with the remaining rows. Avoids the worst-case where one stale read sends 500 messages with revoked credentials.

### 3.7 Webhooks + Suppression List (Impl 06)

#### Resend webhook events handled

| Event              | Action                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `email.sent`       | Update `notification.status = 'sent'`, set `provider_message_id`                                  |
| `email.delivered`  | Update `notification.status = 'delivered'`, set `delivered_at`                                    |
| `email.bounced`    | Update status `'bounced'`. If `bounce_type='hard'`, add to `notification_suppression_list`        |
| `email.complained` | Update status `'complained'`, add to suppression list with reason `complaint`                     |
| `email.opened`     | Optional engagement tracking — write to `notification_engagement_event` (out of scope V1, ignore) |

#### Twilio status callback events

| `MessageStatus` | Action                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `queued`        | (no-op, expected initial state)                                            |
| `sent`          | Update `notification.status = 'sent'`                                      |
| `delivered`     | Update `notification.status = 'delivered'`                                 |
| `failed`        | Update `notification.status = 'failed'`, capture `ErrorCode` mapping       |
| `undelivered`   | Same as `failed`. If `ErrorCode` indicates bad number, add to suppression. |

#### Per-tenant signature verification

Resend uses `Svix-Signature` header with HMAC-SHA256 of `{svix_id}.{svix_timestamp}.{body}` against the tenant's `webhook_secret`. Twilio uses its own `X-Twilio-Signature` HMAC-SHA1 of the URL + sorted form params, validated against the tenant's `twilio_auth_token`. Both verifications happen in `WebhookSignatureVerifier` shared utility.

#### Suppression check on outbound

Every dispatch consults `notification_suppression_list` (cached in Redis with 5-minute TTL keyed by `(tenant_id, channel, recipient_address)`). Suppressed recipients are skipped silently with `notification.status='failed'`, `failure_reason='suppressed:{reason}'`. The fallback chain still tries the next channel.

### 3.8 Email Deliverability — Domain Verification (Impl 07)

#### Flow

1. User in settings UI enters `school.example.org` as their sender domain.
2. Backend calls Resend's `domains.create` endpoint, receives back the canonical SPF / DKIM / DMARC record list.
3. Records are stored in `tenant_email_domains.dns_records_json` and surfaced on the UI for the user to copy into their DNS provider.
4. A cron worker (`comms:domain-verification-refresh`, every 30 min) polls Resend for pending domains and updates SPF/DKIM/DMARC status.
5. On all-three-verified, sets `status='verified'`, `verified_at=now()`. Sends in-app notification to the configuring user.
6. **Outbound dispatch enforces domain verification.** Sends from an unverified domain are skipped with `failure_reason='sender_domain_unverified'`.
7. UI shows live status with a "Refresh now" button that enqueues an immediate check.

### 3.9 WhatsApp Templates + 24-hour Service Window (Impl 08)

#### Free-form vs template send

Twilio's WhatsApp Business policy: outside a 24-hour service window (defined as time since the recipient last messaged the business), only **pre-approved templates** can be sent. Inside the window, free-form messages are allowed.

#### Service window tracking

Twilio inbound webhook for WhatsApp updates `whatsapp_service_windows.last_inbound_at = now()` and `expires_at = now() + 24h` for that recipient. On outbound:

- Look up `(tenant_id, recipient_phone)` in `whatsapp_service_windows`.
- If `expires_at > now()`: free-form allowed.
- Else: require `template_key` on the dispatch payload that resolves to an approved `whatsapp_templates` row.

#### Template lifecycle

| Status      | Meaning                                          | Send allowed? |
| ----------- | ------------------------------------------------ | ------------- |
| `pending`   | Locally drafted, not submitted yet               | No            |
| `submitted` | Sent to Twilio for approval                      | No            |
| `approved`  | Twilio accepted; `twilio_template_sid` populated | Yes, anywhere |
| `rejected`  | Twilio refused; `approval_message` has reason    | No            |
| `paused`    | Approved but temporarily disabled                | No            |

#### Template approval sync

Cron `comms:whatsapp-template-sync` (every 15 min) iterates `submitted` templates per tenant, calls Twilio's content API, updates status and `twilio_template_sid`. Sends in-app notification on approval/rejection.

### 3.10 Verify / Test Send (Impl 09)

#### `verifyConfig` semantics

For each channel, `verifyConfig(tenantId, recipient)`:

1. Decrypts the tenant's credentials.
2. Sends a real provider message to the supplied recipient using a fixed sentinel template:
   - Email: subject "EduPod credential verification", body "If you can read this, your school's email integration is working."
   - SMS: "EduPod SMS verification — your school's SMS is wired up correctly."
   - WhatsApp: uses an approved sentinel template `comms.verify` (registered by Impl 13's backfill); requires the recipient's number to be in service window OR the template approved.
3. If provider returns success, sets `last_verified_at = now()`. Returns `{ success: true, provider_message_id }`.
4. If provider returns failure, returns `{ success: false, provider_error: <verbatim message>, status_code }`. Does NOT set `last_verified_at`. The UI surfaces the verbatim error.

#### Rate limiting

A separate Redis bucket: `verify:{tenantId}:{channel}` with a 3-per-hour sliding window. This is independent of the user-facing notification rate limits so verifying doesn't burn a parent's daily allowance. Verification dispatches DO count against the tenant's provider account quotas (Resend, Twilio bill these).

### 3.11 Frontend Settings UI (Impl 11)

Three new pages, all under `(school)/settings/communications/`. Each mirrors the existing `(school)/settings/stripe/page.tsx` pattern.

```
apps/web/src/app/[locale]/(school)/settings/communications/
├── page.tsx                     # Index — overview of three channels with status indicators
├── email/
│   ├── page.tsx                 # Resend config form + domain verification section
│   └── _components/
│       ├── domain-verification-card.tsx
│       └── dns-records-table.tsx
├── sms/
│   └── page.tsx                 # Twilio SMS config form
├── whatsapp/
│   ├── page.tsx                 # Twilio WhatsApp config form + template list
│   └── _components/
│       ├── template-list.tsx
│       └── template-submit-form.tsx
└── fallback/                    # Already exists
    └── page.tsx
```

#### Index page (`/settings/communications`)

Three cards, one per channel. Each shows:

- Channel name + provider badge (Resend / Twilio)
- Status: **Configured** (green), **Not configured** (gray), **Verification failed** (amber)
- Last verified timestamp
- "Configure" or "Update" CTA → navigates to per-channel page

Pulls from `GET /v1/email-config`, `/v1/sms-config`, `/v1/whatsapp-config` in parallel. 404 = not configured.

#### Per-channel pages

Match `/settings/stripe/page.tsx` structurally:

- Form built with `react-hook-form` + `zodResolver(upsertXConfigSchema)`
- Sensitive fields rendered as `type="password"` with a "Show" toggle
- Already-saved values are returned **masked** (`••••••••last4`); user must re-enter to update
- "Save" button: PUT to `/v1/email-config` (etc.). Success toast.
- "Send test message" button next to a recipient input: POST to `/v1/email-config/test` etc. Returns success or surfaces verbatim provider error.
- "Delete configuration" destructive action: DELETE to `/v1/email-config` etc. Confirmation modal required.
- Show `key_last_rotated_at` so admins know when keys were last updated.
- Email page also shows the domain verification card with DNS records and live verification status.
- WhatsApp page also shows template list with approval status badges and a "Submit new template" form.

#### Existing UI to fix (Impl 12)

- `(school)/settings/notifications/page.tsx` — replace `'push'` channel option with `'whatsapp'` to match what the backend actually supports.
- `packages/shared/src/types/notification-template.ts` — channel union currently lists `'email' | 'whatsapp' | 'in_app'`. Add `'sms'` so type and reality match.

#### i18n

All new pages must:

- Use `useTranslations()` for client components
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) — no `ml-`, `mr-`, etc.
- Render input values as LTR for API keys and phone numbers (see `frontend.md` LTR-enforcement rule)
- Provide both English and Arabic translations in `messages/en.json` and `messages/ar.json`

### 3.12 Operational Layer (Impl 10)

#### Sentry tagging

Every Sentry capture inside the comms code path adds:

```typescript
Sentry.setTag('tenant_id', tenantId);
Sentry.setTag('channel', channel);
Sentry.setTag('template_key', templateKey);
Sentry.setTag('notification_id', notification.id);
```

This is wrapped in a `withCommsContext()` helper so every `try/catch` doesn't have to repeat the boilerplate.

#### Structured logging

A new logger module `apps/api/src/modules/communications/comms-logger.service.ts` wraps NestJS `Logger` and forces every log line to include `tenant_id`, `channel`, `template_key`, `notification_id`, `correlation_id`. The logger is the only path comms code uses for logging — direct `console.log` / `Logger.log` from inside comms is forbidden after this impl.

#### Per-tenant metrics

Prometheus counters and histograms:

- `notifications_dispatched_total{tenant_id, channel, status}` — increment per dispatch outcome
- `notifications_dispatch_duration_seconds{tenant_id, channel}` — histogram, p50/p95/p99
- `notifications_suppressed_total{tenant_id, channel, reason}` — increment per skip
- `notifications_webhook_received_total{tenant_id, channel, event_type, signature_valid}` — webhook ingress
- `notifications_template_renders_total{tenant_id, channel, template_key, locale}` — template usage

Exposed at `/metrics` (existing endpoint, gated to internal scrapers).

#### Grafana dashboard

Versioned in `docs/operations/dashboards/communications.json` — per-tenant breakdown with these panels:

- Dispatch rate (last 24h) per channel per tenant
- Failure rate % per channel (rolling 1h)
- Webhook ingest rate + signature failure rate
- Template render heatmap
- Per-tenant dispatch latency (p95)

#### Runbooks

Three new runbooks in `docs/runbooks/`:

- `comms-tenant-dispatch-failures.md` — what to do when a tenant reports comms not arriving
- `comms-credential-rotation.md` — how to rotate a tenant's Resend / Twilio credentials safely
- `comms-webhook-debugging.md` — how to read `notification_webhook_events` rows and replay events

### 3.13 Audit Logging

Use the existing `AuditLogInterceptor`. Mutations on the three new credential controllers must be audit-logged with:

- `entity_type`: `tenant_email_config` / `tenant_sms_config` / `tenant_whatsapp_config` / `tenant_email_domain` / `whatsapp_template`
- `action`: `create` / `update` / `delete` / `verify` / `key_rotate` / `domain_register` / `template_submit`
- `meta`: never log the plaintext key. Log only `keyRef` and last-4 mask. Webhook signature failures audit-log with full headers.

Use `SecurityAuditService` (already used by Stripe) for credential change events.

### 3.14 RBAC Defaults

Add to permission seed and `permissions.constants.ts`:

```typescript
'configuration.communications.view';
'configuration.communications.manage';
```

Granted by default (and backfilled by Impl 02) to:

- Tenant Owner
- Principal
- (Optional) Operations Admin

NOT granted to teachers, parents, or students.

---

## 4. Build Order — 14 Implementations

Tracked in `communicationnew/PLAN.md` and `communicationnew/IMPLEMENTATION_LOG.md`. Each implementation runs in the dedicated `communications-overhaul` worktree. **No CI deployment** — local dev server testing only. The user merges the worktree to `main` after Impl 14 completes.

| #   | Title                                                                  | Wave |
| --- | ---------------------------------------------------------------------- | ---- |
| 01  | Schema + migration + RLS (8 new tables)                                | 1    |
| 02  | Permissions + RBAC + role backfill on test tenants                     | 1    |
| 03  | Zod schemas + 3 services + 3 controllers + comprehensive tests         | 2    |
| 04  | Provider refactor + per-tenant client cache + Redis pub/sub            | 3    |
| 05  | Worker parity + `.env` removal + mid-flight enforcement                | 3    |
| 06  | Webhooks + signature verification + suppression list                   | 3    |
| 07  | Email deliverability — domain verification + DNS                       | 3    |
| 08  | WhatsApp templates + approval sync + 24-hour window                    | 3    |
| 09  | `verifyConfig` + test endpoints with full semantics                    | 3    |
| 10  | Operational layer — Sentry + logging + metrics + runbooks              | 3    |
| 11  | Frontend Settings UI                                                   | 4    |
| 12  | Module gap closure + cleanups (finance, push→whatsapp, password reset) | 4    |
| 13  | Tenant backfill (5 test tenants × 3 channels) in dev DB                | 5    |
| 14  | Architecture docs + comprehensive E2E verification on local dev        | 5    |

---

## 5. Resolved Decisions (Previously Open)

| Decision                                                                           | Resolution                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Should `webhook_secret` be required for Resend, or optional?                       | **Required** — every config gets a webhook_secret; receivers always verify.                                                                     |
| Should we support multiple sender numbers per tenant for SMS?                      | Single number per tenant in V1; revisit later                                                                                                   |
| Should we expose a "rotate keys" UX as a dedicated action, separate from "update"? | No — a fresh save IS a rotation                                                                                                                 |
| Should test sends consume the tenant's rate-limit budget?                          | No — separate Redis bucket, 3/hr/tenant, bypasses notification limits                                                                           |
| What happens to in-flight queued notifications when a tenant disables a channel?   | Worker re-checks `is_enabled` per notification; remaining rows mark `failed:channel_disabled`                                                   |
| Should we let platform admin (`platform/`) view/manage tenant configs for support? | Yes, read-only via separate platform endpoints (out of scope V1; tracked as follow-up)                                                          |
| Do we need a "channel preview" before send (especially for WhatsApp templates)?    | Out of scope V1                                                                                                                                 |
| Should the platform `.env` credentials remain as a fallback?                       | **No.** Removed entirely in Impl 05. Tenant config is the only path.                                                                            |
| How are existing tenants migrated from `.env` to per-tenant config?                | Impl 13 backfills all 5 test tenants with channel-specific dev credentials.                                                                     |
| How are new permissions granted to existing role mappings?                         | Impl 02 runs a one-shot backfill that adds `configuration.communications.{view,manage}` to Owner + Principal mappings on every existing tenant. |
| Where does cache invalidation propagate across API + worker?                       | Redis pub/sub channel `comms:config-changed` with `{ tenant_id, channel }` payload; both processes subscribe.                                   |

---

## 6. Cross-References

- **Encryption pattern**: `apps/api/src/modules/configuration/encryption.service.ts`
- **Reference implementation**: `apps/api/src/modules/configuration/stripe-config.service.ts`, `stripe-config.controller.ts`, `(school)/settings/stripe/page.tsx`
- **RLS policy template**: `packages/prisma/rls/policies.sql`
- **Migration conventions**: `docs/architecture/schema-change-playbook.md`, `.claude/rules/prisma.md`
- **Pre-flight checklist**: `docs/architecture/pre-flight-checklist.md`
- **Module blast radius**: `docs/architecture/module-blast-radius.md` (updated by Impl 14)
- **Job catalog**: `docs/architecture/event-job-catalog.md` (updated by Impl 14 with webhook flows + cron jobs)
- **State machines**: `docs/architecture/state-machines.md` (updated by Impl 14 with extended `notification.status`, `whatsapp_template.status`, `tenant_email_domain.status`)
- **Master plan**: `communicationnew/PLAN.md`
- **Implementation log**: `communicationnew/IMPLEMENTATION_LOG.md`

---

## 7. Architecture-Update Checklist (Impl 14 owns)

After Impl 14, these architecture documents must reflect reality per `.claude/rules/architecture-policing.md`:

- [ ] `docs/architecture/module-blast-radius.md` — `communications` module now depends on `configuration` for tenant credential resolution; `auth`, `trips`, `school-closures`, `staff-leave`, `health`, `sen` now depend on `communications`.
- [ ] `docs/architecture/feature-map.md` — Update Configuration row's endpoint count (+~25 endpoints), frontend page count (+4 pages); add Communications operational tables.
- [ ] `docs/architecture/danger-zones.md` — Add entries: tenant credential rotation must invalidate per-tenant client cache; mid-flight `is_enabled` flip drops in-batch sends; webhook signature trust depends on tenant `webhook_secret` being set.
- [ ] `docs/architecture/state-machines.md` — Document extended `notification.status` machine including webhook-driven `bounced` / `complained`; add `whatsapp_template.status` and `tenant_email_domain.status` machines.
- [ ] `docs/architecture/event-job-catalog.md` — Add `comms:domain-verification-refresh` (cron 30 min), `comms:whatsapp-template-sync` (cron 15 min), `comms:suppression-list-cleanup` (cron daily); document inbound webhook flows.
