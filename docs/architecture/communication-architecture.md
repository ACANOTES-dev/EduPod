# Communication Architecture — School Operating System

> **Purpose**: Authoritative reference for how the platform communicates with parents, guardians, students, applicants, and staff across the four supported channels (in-app, email, SMS, WhatsApp). Defines the existing dispatch infrastructure and the target tenant-configurable credential model.
> **Status**: Dispatch infrastructure is fully built. Per-tenant credentials are NOT YET implemented — the next implementation phase ports the existing `TenantStripeConfig` pattern to `TenantEmailConfig`, `TenantSmsConfig`, and `TenantWhatsAppConfig`.
> **Last verified**: 2026-04-25

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
- **Twilio** is the chosen SMS and WhatsApp provider. SMS and WhatsApp share `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` but use different sender numbers (`TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`). This will be reflected in the per-tenant model — SMS and WhatsApp will be separate tables but each carrying their own SID/token pair so a tenant can use distinct Twilio sub-accounts per channel if they wish.

### In-App Default Behaviour

Every notification dispatched through the platform always lands in the in-app inbox first. Email/SMS/WhatsApp are additive — they are extra channels triggered alongside the in-app delivery, not replacements. If a tenant has not configured email/SMS/WhatsApp credentials, the dispatch system silently skips those channels and the in-app delivery still succeeds.

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

Each provider exposes `isConfigured(): boolean` and reads its config from `ConfigService` (`.env` only at present).

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

| Table                   | Purpose                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| `notification`          | Per-recipient row. Status machine: `queued → sent → delivered → read                         | failed`. `chain_id` for fallback. |
| `notification_template` | `(tenant_id nullable, channel, template_key, locale)` — tenant override + platform fallback. |

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

### Module → Comms Touchpoint Map

| Module               | Trigger Files (with line refs)                                                                                                                                                                                                                                                                                                    | Recipient(s)                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Attendance**       | `attendance-parent-notification.service.ts:136`, `attendance-pattern.service.ts:202`                                                                                                                                                                                                                                              | Parents                                                                  |
| **Behaviour**        | `behaviour-amendments.service.ts:440`, `behaviour-document.service.ts:392`, `behaviour-exclusion-cases.service.ts:764`, `behaviour-award.service.ts:154,258`, `behaviour-side-effects.service.ts:56,94`, `worker/processors/behaviour/parent-notification.processor.ts`, `worker/processors/behaviour/ack-reminders.processor.ts` | Parents (severity-gated)                                                 |
| **Gradebook**        | `grading/grade-publishing.service.ts:218`, `progress/progress-report.service.ts:286`, `report-cards/report-card-teacher-requests.service.ts:689,697`                                                                                                                                                                              | Parents, teachers                                                        |
| **Homework**         | `homework-notification.service.ts:143,218,304`, `worker/processors/homework/overdue-detection.processor.ts:165`                                                                                                                                                                                                                   | Parents, teachers                                                        |
| **Pastoral**         | `pastoral-notification.service.ts:530,545`, `concern.service.ts:676`, `intervention.service.ts:899`, `checkin-alert.service.ts:172`, `worker/processors/pastoral/escalation-timeout.processor.ts`                                                                                                                                 | Tiered staff (year head → DLO → principal) by severity, parents on share |
| **Safeguarding**     | `safeguarding-concerns.service.ts:226,678,961`, `safeguarding-break-glass.service.ts:175,197,206,215`, `worker/processors/safeguarding/critical-escalation.processor.ts:172`, `worker/processors/safeguarding/notify-reviewers.processor.ts:96`                                                                                   | DLO, deputy DLO, escalation chain                                        |
| **Engagement**       | `event-participants.service.ts:423`, `worker/processors/engagement/engagement-conference-reminders.processor.ts:93`                                                                                                                                                                                                               | Parents/staff with bookings                                              |
| **Parent inquiries** | `parent-inquiries.service.ts:189,250,305`                                                                                                                                                                                                                                                                                         | School admins, parent (on reply)                                         |
| **Finance**          | `payment-reminders.service.ts:19,62,101` ⚠️ direct DB write (bypasses `NotificationsService`)                                                                                                                                                                                                                                     | Billing parent                                                           |
| **Admissions**       | `application-state-machine.service.ts:316,801,833`, `admissions-auto-promotion.service.ts:216`, `applications.service.ts:530`                                                                                                                                                                                                     | Applicant (parent)                                                       |
| **RBAC**             | `invitations.service.ts:124`                                                                                                                                                                                                                                                                                                      | Invited user (email)                                                     |
| **Approvals**        | `approval-requests.service.ts:305`                                                                                                                                                                                                                                                                                                | Domain-specific (e.g. announcement publisher)                            |
| **Communications**   | `announcements.service.ts:344,350`                                                                                                                                                                                                                                                                                                | Audience-resolved (parents/staff/students)                               |
| **Inbox**            | `inbox-outbox.service.ts:158`                                                                                                                                                                                                                                                                                                     | Message recipients (opt-in external channels)                            |
| **Daily digest**     | `worker/processors/notifications/parent-daily-digest.processor.ts`                                                                                                                                                                                                                                                                | All parents with active children                                         |

---

## 3. Target State — Per-Tenant Credential Configuration

The reference pattern is `TenantStripeConfig`, which already provides the encryption and tenant settings UX we want to replicate. Each tenant will gain three independent credential records: one for email, one for SMS, one for WhatsApp.

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

#### Relation entries on `Tenant` and `User`

```prisma
model Tenant {
  // ...existing relations...
  email_config     TenantEmailConfig?
  sms_config       TenantSmsConfig?
  whatsapp_config  TenantWhatsAppConfig?
}

model User {
  // ...existing relations...
  email_configs_created    TenantEmailConfig[]
  sms_configs_created      TenantSmsConfig[]
  whatsapp_configs_created TenantWhatsAppConfig[]
}
```

#### Why three tables instead of one unified credentials table

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

-- Repeat identical pattern for tenant_sms_configs, tenant_whatsapp_configs
```

Place these in the migration's companion `post_migrate.sql` file.

### 3.4 Migration Order and Naming

```
packages/prisma/migrations/{timestamp}_add_tenant_communication_configs/
├── migration.sql       # CREATE TABLE for all three tables, indexes
└── post_migrate.sql    # ENABLE/FORCE RLS + tenant_isolation policies
```

Migration name: `add_tenant_communication_configs_tables`.

### 3.5 API Layer

Three independent NestJS services and controllers, each mirroring the Stripe pattern exactly.

#### Service Pattern (per channel)

`apps/api/src/modules/configuration/email-config.service.ts` (and analogues for SMS, WhatsApp):

- `getConfig(tenantId)` — Returns `MaskedEmailConfig` (decrypts only enough to return last-4 mask).
- `upsertConfig(tenantId, userId, dto)` — Encrypts secrets, writes row, updates `key_last_rotated_at`. Returns masked.
- `getDecryptedConfig(tenantId)` — **Internal-only**. Returns plaintext for use by the dispatch layer. NEVER exposed via controller.
- `deleteConfig(tenantId, userId)` — Removes the row. Disables the channel for that tenant.
- `verifyConfig(tenantId)` — Sends a dry-run/test message via the provider, sets `last_verified_at` on success.

Constructor DI matches `StripeConfigService`:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly encryption: EncryptionService,
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
  @Get()
  async getConfig(@CurrentTenant() tenantContext) { ... }

  // PUT /v1/email-config
  @Put()
  @Body(new ZodValidationPipe(upsertEmailConfigSchema))
  async upsert(@CurrentTenant() tenantContext, @CurrentUser() user, @Body() dto) { ... }

  // DELETE /v1/email-config
  @Delete()
  async delete(@CurrentTenant() tenantContext, @CurrentUser() user) { ... }

  // POST /v1/email-config/test
  @Post('test')
  @Body(new ZodValidationPipe(testEmailSchema))
  async test(@CurrentTenant() tenantContext, @Body() { recipient_email }) { ... }
}
```

#### Permissions

New permission constants needed in the RBAC module:

- `configuration.communications.view`
- `configuration.communications.manage`

Mirror the existing `configuration.stripe.view` / `configuration.stripe.manage` permissions. Bind them to the same default roles (Owner, Principal — anyone who can configure Stripe should manage comms).

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
});

export const upsertWhatsAppConfigSchema = z.object({
  twilio_account_sid: z.string().min(1).startsWith('AC'),
  twilio_auth_token: z.string().min(1),
  twilio_whatsapp_from_number: z.string().regex(/^\+\d{8,16}$/, 'E.164 format required'),
  business_profile_id: z.string().optional(),
});

export const testEmailSchema = z.object({
  recipient_email: z.string().email(),
});

export const testSmsSchema = z.object({
  recipient_phone: z.string().regex(/^\+\d{8,16}$/),
});
```

### 3.6 Provider Refactor

Each of the three providers must be refactored to read tenant config first and fall back to `.env` for development/shared mode.

#### Current pattern (platform-only)

```typescript
// apps/api/src/modules/communications/providers/resend-email.provider.ts
private ensureClient(): Resend {
  if (!this.client) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) throw new Error('Resend not configured');
    this.client = new Resend(apiKey);
  }
  return this.client;
}
```

#### Target pattern (tenant-first, env-fallback)

```typescript
// Pseudocode — exact signature TBD
async dispatch(tenantId: string, payload: EmailPayload): Promise<DispatchResult> {
  const tenantConfig = await this.emailConfigService.getDecryptedConfig(tenantId);

  let apiKey: string;
  let fromEmail: string;
  let fromName: string | undefined;
  let replyTo: string | undefined;

  if (tenantConfig?.is_enabled) {
    apiKey = tenantConfig.resend_api_key;
    fromEmail = tenantConfig.from_email;
    fromName = tenantConfig.from_name;
    replyTo = tenantConfig.reply_to_email;
  } else if (this.allowEnvFallback) {
    // Dev mode: platform-shared credentials
    apiKey = this.configService.get<string>('RESEND_API_KEY');
    fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';
  } else {
    // Production: no tenant config means channel is off
    return { skipped: true, reason: 'no_tenant_config' };
  }

  // Use a lightweight per-tenant client cache so we don't reconstruct Resend for every send
  const client = this.getOrCreateClient(tenantId, apiKey);
  return client.emails.send({ from: fromName ? `${fromName} <${fromEmail}>` : fromEmail, replyTo, ... });
}
```

#### Key implementation rules

1. **Tenant config takes priority**. `.env` values are ONLY consulted when `allowEnvFallback` is true (dev mode) and no tenant config exists.
2. **Channel-off semantics**. If a tenant has no config and env-fallback is disabled (production default), the dispatch is **silently skipped** — the in-app notification still succeeds and the row is marked `status='delivered'` for the in-app channel. The channel's row in the `notification` table for email/sms/whatsapp is marked `status='failed'` with `failure_reason='channel_not_configured'` to make this observable.
3. **Per-tenant client cache**. `Resend` and `twilio()` clients are cheap to construct but we maintain a tenant-keyed cache (`Map<string, Resend>`) to avoid hot-path reconstruction. Cache invalidates when `upsertConfig` runs (publish a Redis pub/sub event or expose a `clearTenantClient(tenantId)` method).
4. **Fallback chain still applies**. If WhatsApp fails because tenant didn't configure WhatsApp, the existing chain `whatsapp → sms → email → in_app` kicks in normally — each step independently checks tenant config.
5. **Worker side**. The worker's `dispatch-notifications.processor.ts` already holds tenant context per job. It must be updated identically — same tenant-config lookup, same fallback semantics. Both API-side and worker-side providers must share identical resolution logic.

#### Where to add the env-fallback flag

Add to env validation:

```
COMMS_ALLOW_ENV_FALLBACK=false   # default in production
COMMS_ALLOW_ENV_FALLBACK=true    # local dev / staging shared mode
```

When `false`, no `.env` credential lookups happen — the only path to dispatch is a configured tenant.

### 3.7 Frontend Settings UI

Three new pages, all under `(school)/settings/communications/`. Each mirrors the existing `(school)/settings/stripe/page.tsx` pattern.

```
apps/web/src/app/[locale]/(school)/settings/communications/
├── page.tsx                     # Index — overview of three channels with status indicators
├── email/
│   └── page.tsx                 # Resend config form
├── sms/
│   └── page.tsx                 # Twilio SMS config form
├── whatsapp/
│   └── page.tsx                 # Twilio WhatsApp config form
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
- "Send test message" button next to a recipient input: POST to `/v1/email-config/test` etc. — actually attempts a send through the configured credentials, returns success or surfaces the provider error.
- "Delete configuration" destructive action: DELETE to `/v1/email-config` etc. Confirmation modal required.
- Show `key_last_rotated_at` so admins know when keys were last updated.

#### Existing UI to fix

- `(school)/settings/notifications/page.tsx` — replace `'push'` channel option with `'whatsapp'` to match what the backend actually supports. The current state shows a channel that doesn't exist.
- `packages/shared/src/types/notification-template.ts` — channel union currently lists `'email' | 'whatsapp' | 'in_app'`. Add `'sms'` so type and reality match.

#### i18n

All new pages must:

- Use `useTranslations()` for client components
- Use logical CSS properties (`ms-`, `me-`, `ps-`, `pe-`) — no `ml-`, `mr-`, etc.
- Render input values as LTR for API keys and phone numbers (see `frontend.md` LTR-enforcement rule)
- Provide both English and Arabic translations in `messages/en.json` and `messages/ar.json`

### 3.8 Health Checks

Extend `apps/api/src/modules/health/health.service.ts` to expose tenant-aware channel readiness:

- `GET /v1/health/communications/{tenantId}` returns `{ email: 'ready'|'not_configured'|'unverified', sms: ..., whatsapp: ... }`
- Drives the status indicators on the settings index page
- Existing platform-level Resend + Twilio health checks (lines 594-618) remain as the env-fallback path's check

### 3.9 Audit Logging

Use the existing `AuditLogInterceptor`. Mutations on the three new controllers must be audit-logged with:

- `entity_type`: `tenant_email_config` / `tenant_sms_config` / `tenant_whatsapp_config`
- `action`: `create` / `update` / `delete` / `verify` / `key_rotate`
- `meta`: never log the plaintext key. Log only `keyRef` and last-4 mask.

Use `SecurityAuditService` (already used by Stripe) for credential change events.

### 3.10 RBAC Defaults

Add to permission seed and `permissions.constants.ts`:

```typescript
'configuration.communications.view';
'configuration.communications.manage';
```

Granted by default to:

- Tenant Owner
- Principal
- (Optional) Operations Admin

NOT granted to teachers, parents, or students.

---

## 4. Build Order (Implementation Phases)

### Phase 1 — Schema and encryption layer

1. Add three new Prisma models (`TenantEmailConfig`, `TenantSmsConfig`, `TenantWhatsAppConfig`)
2. Add `email_config`, `sms_config`, `whatsapp_config` relations on `Tenant`
3. Add `email_configs_created`, `sms_configs_created`, `whatsapp_configs_created` relations on `User`
4. Generate migration `add_tenant_communication_configs_tables`
5. Add RLS policies in companion `post_migrate.sql`
6. Run DI verification (see CLAUDE.md regression-prevention recipe)

### Phase 2 — API services and controllers

1. Add Zod schemas to `packages/shared/src/schemas/communication-config.schema.ts`
2. Create `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` (mirror `StripeConfigService`)
3. Create matching controllers under `apps/api/src/modules/configuration/`
4. Add unit tests for each service (encryption round-trip, masking, RLS isolation)
5. Add e2e tests for each controller (auth, permission, happy-path, RLS leakage)
6. Add new permission constants to RBAC seed

### Phase 3 — Provider refactor

1. Update `ResendEmailProvider` to accept `tenantId` and look up `TenantEmailConfig` first
2. Update `TwilioSmsProvider` to accept `tenantId` and look up `TenantSmsConfig` first
3. Update `TwilioWhatsAppProvider` to accept `tenantId` and look up `TenantWhatsAppConfig` first
4. Add per-tenant client cache with invalidation on config update
5. Add `COMMS_ALLOW_ENV_FALLBACK` env var with production-default `false`
6. Update worker's `DispatchNotificationsProcessor` to use the same tenant-config lookup
7. Add unit tests covering: tenant-config priority, env fallback, channel-off skip, fallback-chain interaction

### Phase 4 — Frontend settings UI

1. Build `(school)/settings/communications/page.tsx` index
2. Build `(school)/settings/communications/email/page.tsx`
3. Build `(school)/settings/communications/sms/page.tsx`
4. Build `(school)/settings/communications/whatsapp/page.tsx`
5. Add route to morph-shell sub-strip under "Settings"
6. Wire status indicators using new health endpoint
7. Add EN + AR translations

### Phase 5 — Test/verify endpoints

1. Implement `POST /v1/email-config/test` — sends a real Resend message to the provided email
2. Implement `POST /v1/sms-config/test` — sends a real Twilio SMS
3. Implement `POST /v1/whatsapp-config/test` — sends a real Twilio WhatsApp message
4. Update `last_verified_at` on success
5. Surface provider error messages back to the UI for diagnosis

### Phase 6 — Cleanups (cherry-pick parallel work)

1. Wire password-reset emails (`auth-password-reset.service.ts:61` is currently stubbed)
2. Add "your password was changed" notification
3. Add `'sms'` to `NotificationTemplate` channel type union
4. Replace `'push'` with `'whatsapp'` in `(school)/settings/notifications/page.tsx`
5. Decide whether to migrate finance off the direct-DB-write workaround (`payment-reminders.service.ts:220`) once circular-dep is reviewed
6. Audit module gaps: trips (consent), school-closures, leave, health, sen — confirm whether comms wiring is needed and add if so

---

## 5. Open Decisions

These are explicitly NOT decided yet — the user will rule on them during the build sessions.

| Decision                                                                                       | Default Suggestion                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Should `webhook_secret` be required for Resend, or optional?                                   | Optional; only needed if tenant uses webhooks   |
| Should we support multiple sender numbers per tenant for SMS (different numbers per use case)? | Single number per tenant in V1; revisit later   |
| Should we expose a "rotate keys" UX as a dedicated action, separate from "update"?             | No — a fresh save IS a rotation                 |
| Should test sends consume the tenant's rate-limit budget?                                      | No — bypass rate limits, log separately         |
| What happens to in-flight queued notifications when a tenant disables a channel?               | Mark as `failed` with reason `channel_disabled` |
| Should we let platform admin (`platform/`) view/manage tenant configs for support?             | Yes, read-only via separate platform endpoints  |
| Do we need a "channel preview" before send (especially for WhatsApp templates)?                | Out of scope V1                                 |

---

## 6. Cross-References

- **Encryption pattern**: `apps/api/src/modules/configuration/encryption.service.ts`
- **Reference implementation**: `apps/api/src/modules/configuration/stripe-config.service.ts`, `stripe-config.controller.ts`, `(school)/settings/stripe/page.tsx`
- **RLS policy template**: `packages/prisma/rls/policies.sql`
- **Migration conventions**: `docs/architecture/schema-change-playbook.md`, `.claude/rules/prisma.md`
- **Pre-flight checklist**: `docs/architecture/pre-flight-checklist.md`
- **Module blast radius**: `docs/architecture/module-blast-radius.md` (will be updated to record `communications` ↔ `configuration` cross-module dependency once implemented)
- **Job catalog**: `docs/architecture/event-job-catalog.md` (no changes — same `notifications` queue, same processors)

---

## 7. Architecture-Update Checklist (For When This Phase Ships)

After implementation, these architecture documents must be updated per `.claude/rules/architecture-policing.md`:

- [ ] `docs/architecture/module-blast-radius.md` — `communications` module now depends on `configuration` for tenant credential resolution
- [ ] `docs/architecture/feature-map.md` — Update `Configuration` row's endpoint count (+12 endpoints), frontend page count (+4 pages)
- [ ] `docs/architecture/danger-zones.md` — Add entry: tenant credential rotation must invalidate per-tenant client cache or in-flight sends will use stale keys
- [ ] `docs/architecture/state-machines.md` — No changes (notification status machine unchanged)
- [ ] `docs/architecture/event-job-catalog.md` — No changes
