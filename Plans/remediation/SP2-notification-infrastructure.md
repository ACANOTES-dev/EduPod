# Sub-Plan 2: Notification Infrastructure Remediation

**Status**: Spec complete, awaiting implementation
**Date**: 2026-03-27
**Estimated effort**: 2-3 days
**Risk**: HIGH -- parents cannot receive any external notifications until this is done

---

## 1. Current State Summary

### What exists (working)
- `NotificationDispatchService` at `apps/api/src/modules/communications/notification-dispatch.service.ts` -- orchestrates dispatch with fallback chain
- `WebhookController` at `apps/api/src/modules/communications/webhook.controller.ts` -- Resend + Twilio webhook endpoints with signature verification (Svix for Resend, HMAC-SHA1 for Twilio)
- `WebhookService` at `apps/api/src/modules/communications/webhook.service.ts` -- processes delivery status updates
- `NotificationTemplatesService` at `apps/api/src/modules/communications/notification-templates.service.ts` -- CRUD + tenant-then-platform resolution
- `BehaviourParentNotificationProcessor` at `apps/worker/src/processors/behaviour/parent-notification.processor.ts` -- creates in_app notifications only
- `DigestNotificationsProcessor` at `apps/worker/src/processors/behaviour/digest-notifications.processor.ts` -- batches per-parent digests, creates notifications per preferred channel
- Admin resend endpoint at `POST v1/behaviour/admin/resend-notification` -- exists and queues jobs
- Prisma models: `Notification`, `NotificationTemplate`, `TenantNotificationSetting` -- all in place
- Enums: `NotificationChannel` (email, whatsapp, in_app, sms), `NotificationStatus` (queued, sent, delivered, failed, read)
- Environment config: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` -- all defined in env.validation.ts (optional)
- 13 notification templates seeded in `packages/prisma/seed.ts` (behaviour_sanction_parent, behaviour_appeal_outcome, behaviour_exclusion_notice_parent, behaviour_exclusion_decision_parent, behaviour_correction_parent, behaviour_reacknowledgement_request -- each in email+in_app x en+ar)
- Existing unit tests for dispatch service and webhook service/controller

### What is broken / missing (10 gaps)
1. **Email dispatch is a placeholder** -- `dispatchEmail()` logs a warning and increments attempt_count but never calls Resend
2. **WhatsApp dispatch is a placeholder** -- `dispatchWhatsApp()` same -- logs warning, never calls Twilio
3. **SMS dispatch missing** -- enum value `sms` exists in `NotificationChannel` but no dispatch path, no provider integration
4. **Template variable injection missing** -- templates use `{{parent_name}}`, `{{student_name}}` etc. but nothing renders them; raw template text would be sent
5. **Missing notification templates** -- spec requires 13 templates but the following template_keys are not seeded: `behaviour_positive_parent`, `behaviour_negative_parent`, `behaviour_award_parent`, `behaviour_acknowledgement_request`, `behaviour_task_reminder`, `behaviour_task_overdue`, `safeguarding_concern_reported`, `safeguarding_critical_escalation`, `safeguarding_reporter_ack`, `safeguarding_sla_breach`, `safeguarding_break_glass_review`
6. **Fallback chain incomplete** -- current chain: whatsapp->email->in_app. Missing: sms->email->in_app. No sms dispatch path at all.
7. **No unsubscribe link in email templates** -- GDPR/CAN-SPAM requirement
8. **No notification rate limiting per parent** -- a burst of incidents could spam parents
9. **No Resend/Twilio SDK dependencies** -- neither `resend` nor `twilio` packages are in any package.json
10. **Worker processors only create in_app notifications** -- parent-notification processor and check-awards processor hardcode `channel: 'in_app'` instead of dispatching via preferred channels

---

## 2. Architecture Overview

### Provider Selection

| Channel | Provider | SDK | Reason |
|---------|----------|-----|--------|
| Email | Resend | `resend` npm package | Already chosen (env vars defined, webhook controller built) |
| WhatsApp | Twilio | `twilio` npm package | Already chosen (env vars defined, webhook controller built) |
| SMS | Twilio | `twilio` npm package (same SDK) | Same Twilio account, single SDK |
| In-app | Database | N/A | Already working -- stored in DB, read via API |

### Dispatch Flow

```
Notification created (status=queued, channel=X)
    |
    v
NotificationDispatchService.dispatchWithFallback(notificationId)
    |
    +--> resolveTemplate(tenant_id, template_key, channel, locale)
    |       |
    |       v
    |    TemplateRenderer.render(template, payload_json)  <-- NEW
    |       |  - Merges {{variable}} placeholders with payload_json
    |       |  - Handles {{#if}}/{{#each}} conditionals (Handlebars)
    |       |  - Injects unsubscribe URL for email channel
    |       |
    |       v
    +--> Channel-specific dispatch:
    |    email    --> ResendEmailProvider.send(to, subject, html)
    |    whatsapp --> TwilioWhatsAppProvider.send(to, body)
    |    sms      --> TwilioSmsProvider.send(to, body)
    |    in_app   --> mark as delivered (existing)
    |       |
    |       v
    |    Update notification: status=sent, provider_message_id=X, sent_at=now
    |       |
    |       v
    +--> On failure: handleFailure() (existing exponential backoff + fallback chain)

Webhook callback (Resend/Twilio):
    |
    v
WebhookController receives delivery status
    |
    v
WebhookService updates notification: status=delivered/failed
    |
    v
If failed via webhook --> createFallbackNotification (existing)
```

### Fallback Chain (complete)

```
whatsapp --> sms --> email --> in_app
sms      --> email --> in_app
email    --> in_app
in_app   --> (terminal, always succeeds)
```

Each level attempts max_attempts (default 3) with exponential backoff before falling to the next channel.

---

## 3. Detailed Task List

### Task 3.1: Install Provider SDKs

**File**: `apps/api/package.json`

Add dependencies:
- `resend` (latest stable, currently ~4.x)
- `twilio` (latest stable, currently ~5.x)
- `handlebars` (latest stable, currently ~4.x) -- for template rendering

**Acceptance criteria**:
- `pnpm install` succeeds
- `turbo type-check` passes
- No version conflicts in lockfile

---

### Task 3.2: Create Template Renderer Service

**New file**: `apps/api/src/modules/communications/template-renderer.service.ts`

This service handles Handlebars-based template variable injection.

**Design**:
```
@Injectable()
export class TemplateRendererService {
  // Pre-compile and cache templates by content hash
  private cache = new Map<string, HandlebarsTemplateDelegate>();

  render(templateBody: string, variables: Record<string, unknown>): string
  renderSubject(subjectTemplate: string | null, variables: Record<string, unknown>): string | null
}
```

**Variable sources** (resolved from payload_json + DB lookups):
| Variable | Source | Used in |
|----------|--------|---------|
| `{{parent_name}}` | Parent.first_name + Parent.last_name | All parent-facing templates |
| `{{student_name}}` | Student.first_name + Student.last_name | All behaviour templates |
| `{{student_year_group}}` | Student -> year group name | Sanction, exclusion templates |
| `{{school_name}}` | Tenant.name | All templates |
| `{{incident_number}}` | BehaviourIncident.incident_number | Incident notification |
| `{{category_name}}` | BehaviourCategory.name | Incident notification |
| `{{parent_description}}` | BehaviourIncident.parent_description | Negative incident |
| `{{sanction_type}}` | BehaviourSanction.sanction_type | Sanction template |
| `{{sanction_date}}` | BehaviourSanction date fields | Sanction template |
| `{{appeal_number}}` | BehaviourAppeal.appeal_number | Appeal outcome |
| `{{appeal_decision}}` | BehaviourAppeal.decision | Appeal outcome |
| `{{unsubscribe_url}}` | Generated per notification | All email templates |

**Implementation notes**:
- Use Handlebars (already used in document template seeds -- `{{#if}}`, `{{#each}}` syntax is consistent)
- Cache compiled templates by string hash to avoid recompilation
- Strip HTML tags for WhatsApp/SMS bodies (text-only channels)
- Sanitize all injected values to prevent XSS in email HTML
- If a variable is missing from payload_json, render as empty string (not `{{undefined}}`)

**Acceptance criteria**:
- `render('Hello {{parent_name}}', { parent_name: 'John' })` returns `'Hello John'`
- `render('{{#if foo}}yes{{/if}}', { foo: true })` returns `'yes'`
- Missing variables render as empty string
- HTML tags stripped for non-email channels
- Unit tests cover all variable types, conditionals, and edge cases

---

### Task 3.3: Create Email Provider Service (Resend)

**New file**: `apps/api/src/modules/communications/providers/resend-email.provider.ts`

**Design**:
```
@Injectable()
export class ResendEmailProvider {
  constructor(private configService: ConfigService) {}

  async send(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;    // defaults to RESEND_FROM_EMAIL
    replyTo?: string;
    tags?: { name: string; value: string }[];
  }): Promise<{ messageId: string }>

  isConfigured(): boolean  // returns true if RESEND_API_KEY is set
}
```

**Implementation notes**:
- Initialize Resend client lazily (only when first used) -- avoids startup errors if key not configured
- Return provider_message_id from Resend response for webhook correlation
- Include `X-Entity-Ref-ID` header with notification ID for idempotency
- Tags: `{ name: 'tenant_id', value: tenantId }`, `{ name: 'template_key', value: templateKey }`
- If not configured (no API key), throw a clear error that falls through to the failure handler

**Acceptance criteria**:
- Sends email via Resend API when key is configured
- Returns messageId for webhook correlation
- Throws descriptive error when RESEND_API_KEY missing
- `isConfigured()` returns false when key missing
- Unit test with mocked Resend client

---

### Task 3.4: Create WhatsApp Provider Service (Twilio)

**New file**: `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts`

**Design**:
```
@Injectable()
export class TwilioWhatsAppProvider {
  constructor(private configService: ConfigService) {}

  async send(params: {
    to: string;        // whatsapp:+1234567890 format
    body: string;      // plain text (no HTML)
  }): Promise<{ messageSid: string }>

  isConfigured(): boolean
}
```

**Implementation notes**:
- Initialize Twilio client lazily
- Prefix `to` with `whatsapp:` if not already prefixed
- Use `from` = `TWILIO_WHATSAPP_FROM` env var
- Return `messageSid` for webhook correlation
- WhatsApp messages are plain text -- TemplateRenderer strips HTML before passing to this provider

**Acceptance criteria**:
- Sends WhatsApp message via Twilio API
- Returns messageSid
- Throws when Twilio credentials missing
- Unit test with mocked Twilio client

---

### Task 3.5: Create SMS Provider Service (Twilio)

**New file**: `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`

**Design**:
```
@Injectable()
export class TwilioSmsProvider {
  constructor(private configService: ConfigService) {}

  async send(params: {
    to: string;        // +1234567890 format
    body: string;      // plain text, max 1600 chars (Twilio limit)
  }): Promise<{ messageSid: string }>

  isConfigured(): boolean
}
```

**Implementation notes**:
- Uses same Twilio client as WhatsApp (shared module)
- `from` = env var `TWILIO_SMS_FROM` (new env var needed)
- Truncate body to 1600 chars with `...` suffix if exceeded
- Return `messageSid` for webhook correlation (same webhook handles both SMS and WhatsApp)

**Acceptance criteria**:
- Sends SMS via Twilio API
- Truncates long messages safely
- Returns messageSid
- Unit test with mocked Twilio client

---

### Task 3.6: Update Environment Configuration

**File**: `apps/api/src/modules/config/env.validation.ts`

Add new optional env vars:
```typescript
TWILIO_SMS_FROM: z.string().optional(),
```

**File**: `.env.example`

Add:
```
TWILIO_SMS_FROM=+14155238886
```

**Acceptance criteria**:
- Env validation accepts new variable
- Existing validation still passes without the variable

---

### Task 3.7: Wire Providers into NotificationDispatchService

**File**: `apps/api/src/modules/communications/notification-dispatch.service.ts`

Major refactor of this file. Replace placeholder implementations with real provider calls.

**Changes**:
1. Inject `TemplateRendererService`, `ResendEmailProvider`, `TwilioWhatsAppProvider`, `TwilioSmsProvider`
2. Replace `dispatchEmail()` placeholder:
   - Resolve template via `templateService.resolveTemplate()`
   - Render body and subject via `TemplateRendererService.render()` with `notification.payload_json`
   - Inject `unsubscribe_url` into variables
   - Look up recipient email from `notification.recipient.email`
   - Call `ResendEmailProvider.send()`
   - Update notification: `status: 'sent'`, `provider_message_id`, `sent_at`
3. Replace `dispatchWhatsApp()` placeholder:
   - Resolve template
   - Render body (strip HTML)
   - Look up recipient WhatsApp phone from Parent record (join through `recipient_user_id` -> `User` -> `Parent.whatsapp_phone`)
   - Call `TwilioWhatsAppProvider.send()`
   - Update notification: `status: 'sent'`, `provider_message_id`, `sent_at`
4. Add `dispatchSms()`:
   - Resolve template
   - Render body (strip HTML)
   - Look up recipient phone from Parent record (`Parent.phone`)
   - Call `TwilioSmsProvider.send()`
   - Update notification: `status: 'sent'`, `provider_message_id`, `sent_at`
5. Update fallback chain in `handleFailure()`:
   - whatsapp -> sms -> email -> in_app
   - sms -> email -> in_app
   - email -> in_app
6. Remove all `@typescript-eslint/no-explicit-any` suppressions -- type the notification parameter properly using Prisma generated types
7. Add recipient contact lookup method:
   - `resolveRecipientContact(userId, channel)`: looks up email/phone/whatsapp_phone from User+Parent records

**Recipient contact resolution logic**:
```
For email:  User.email (from notification.recipient)
For whatsapp: Parent.whatsapp_phone (via User -> Parent where user_id = User.id)
For sms: Parent.phone (via User -> Parent where user_id = User.id)
```
If contact detail is missing for the channel, skip directly to fallback (do not attempt send).

**Acceptance criteria**:
- Email sends via Resend when configured
- WhatsApp sends via Twilio when configured
- SMS sends via Twilio when configured
- Fallback chain: whatsapp -> sms -> email -> in_app
- Notifications stuck in 'queued' status are now dispatched
- `provider_message_id` saved for webhook correlation
- All `any` types removed
- Existing unit tests updated to cover real dispatch paths
- New unit tests for SMS dispatch path

---

### Task 3.8: Update CommunicationsModule Providers

**File**: `apps/api/src/modules/communications/communications.module.ts`

Add to `providers` array:
- `TemplateRendererService`
- `ResendEmailProvider`
- `TwilioWhatsAppProvider`
- `TwilioSmsProvider`

Add to `exports` array:
- `TemplateRendererService` (used by worker processors)

Import `ConfigModule` if not already available.

**Acceptance criteria**:
- Module compiles and all providers are injectable
- `turbo type-check` passes

---

### Task 3.9: Seed Missing Notification Templates

**File**: `packages/prisma/seed.ts`

Add the following template_keys (each in email+in_app x en+ar = 4 rows per key):

| template_key | Trigger | Channels |
|-------------|---------|----------|
| `behaviour_positive_parent` | Positive incident (if configured) | email, in_app |
| `behaviour_negative_parent` | Negative >= severity threshold | email, in_app |
| `behaviour_award_parent` | Award earned | email, in_app |
| `behaviour_acknowledgement_request` | Severity >= ack threshold | email, in_app |
| `behaviour_task_reminder` | Task due today | in_app only |
| `behaviour_task_overdue` | Task overdue | email, in_app |
| `safeguarding_concern_reported` | New concern | in_app only (DLP internal) |
| `safeguarding_critical_escalation` | Critical, DLP no response 30min | email, in_app |
| `safeguarding_reporter_ack` | DLP acknowledges | in_app only |
| `safeguarding_sla_breach` | SLA passed | email, in_app |
| `safeguarding_break_glass_review` | Break-glass window expired | email, in_app |

**Template content examples**:

`behaviour_negative_parent` email en:
```
Subject: Behaviour Notice: {{category_name}} for {{student_name}}
Body: Dear {{parent_name}},

This is to inform you about a behaviour incident involving {{student_name}} ({{student_year_group}}).

**Category:** {{category_name}}
**Date:** {{incident_date}}
**Details:** {{parent_description}}

If you have any questions, please contact the school.

{{unsubscribe_link}}

Regards,
{{school_name}}
```

`safeguarding_sla_breach` email en:
```
Subject: URGENT: Safeguarding SLA Breach - {{concern_number}}
Body: Dear {{recipient_name}},

The SLA for safeguarding concern {{concern_number}} has been breached. First response was due at {{sla_due_time}} and no acknowledgement has been recorded.

Immediate action is required.

Regards,
{{school_name}}
```

**Acceptance criteria**:
- All 13 template_keys from the spec are seeded
- Each template has appropriate en+ar versions
- Each template uses correct variable placeholders matching the payload_json structure used by the processors
- `npx prisma db seed` runs without error (idempotent via upsert)

---

### Task 3.10: Update Worker Processors to Use Multi-Channel Dispatch

**Files**:
- `apps/worker/src/processors/behaviour/parent-notification.processor.ts`
- `apps/worker/src/processors/behaviour/check-awards.processor.ts`
- `apps/worker/src/processors/behaviour/task-reminders.processor.ts`
- `apps/worker/src/processors/behaviour/sla-check.processor.ts`
- `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`
- `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`

**Current problem**: These processors hardcode `channel: 'in_app'` when creating notifications. The digest processor is the only one that respects `parent.preferred_contact_channels`.

**Change**: For each processor that creates notifications for parents, follow the digest processor pattern:
1. Look up parent's `preferred_contact_channels`
2. Create one notification per channel (in_app is always included)
3. Non-in_app notifications are created with `status: 'queued'` for later dispatch

For staff-facing notifications (task reminders, SLA breach, critical escalation, break-glass review), create both in_app (immediate) and email (queued) notifications.

**Acceptance criteria**:
- Parent-facing notifications created per parent's preferred channels
- Staff-facing notifications created as in_app + email
- All queued notifications will be picked up by the dispatch service
- No hardcoded `channel: 'in_app'` for parent-facing notifications

---

### Task 3.11: Add Notification Rate Limiting

**New file**: `apps/api/src/modules/communications/notification-rate-limit.service.ts`

Follows the same pattern as `AdmissionsRateLimitService` at `apps/api/src/modules/admissions/admissions-rate-limit.service.ts`.

**Design**:
```
@Injectable()
export class NotificationRateLimitService {
  constructor(private readonly redis: RedisService) {}

  // Limit: 10 notifications per parent per hour, 30 per day
  async checkAndIncrement(
    tenantId: string,
    parentUserId: string,
    channel: string,
  ): Promise<{ allowed: boolean; reason?: string }>
}
```

**Rate limits**:
| Window | Limit | Redis Key |
|--------|-------|-----------|
| Per hour | 10 per parent per channel | `ratelimit:notif:${tenantId}:${parentUserId}:${channel}:hourly` |
| Per day | 30 per parent across all channels | `ratelimit:notif:${tenantId}:${parentUserId}:daily` |

**Integration point**: Called in `NotificationDispatchService.dispatchWithFallback()` before attempting any external send. If rate limit exceeded:
- Log a warning
- Mark notification as `failed` with `failure_reason: 'Rate limit exceeded (10/hour)'`
- Do NOT create fallback -- rate limiting should halt the chain to prevent spam
- Do NOT count in_app notifications against the limit (they are silent)

**Acceptance criteria**:
- 11th notification in an hour for same parent+channel is blocked
- 31st notification in a day for same parent is blocked
- in_app notifications are exempt
- Rate limit resets after TTL expires
- Unit tests with Redis mock

---

### Task 3.12: Add Unsubscribe URL Generation and Link Injection

**New file**: `apps/api/src/modules/communications/unsubscribe.service.ts`

**Design**:
```
@Injectable()
export class UnsubscribeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Generate a signed, time-limited unsubscribe URL
  generateUrl(notificationId: string, userId: string): string

  // Process an unsubscribe click
  async processUnsubscribe(token: string): Promise<void>
}
```

**URL format**: `{APP_URL}/api/v1/notifications/unsubscribe?token={signed_jwt}`

The JWT contains: `{ notification_id, user_id, exp: 90 days }`

**New endpoint**: `GET v1/notifications/unsubscribe` -- public (no auth guard), validates JWT, sets `TenantNotificationSetting.is_enabled = false` for the notification_type.

**Integration**: `TemplateRendererService` injects `{{unsubscribe_url}}` and `{{unsubscribe_link}}` (HTML anchor) into every email template's variables.

**Template footer** (appended to all email bodies):
```html
<p style="font-size:12px;color:#666;margin-top:24px;">
  If you no longer wish to receive these notifications,
  <a href="{{unsubscribe_url}}">unsubscribe here</a>.
</p>
```

**Acceptance criteria**:
- Every email sent includes an unsubscribe link in the footer
- Clicking the link disables that notification type for the user
- Token is cryptographically signed (HMAC-SHA256 with JWT_SECRET)
- Token expires after 90 days
- Invalid/expired tokens return 400
- Unit tests for URL generation and processing

---

### Task 3.13: Add Dispatch Worker/Cron for Queued Notifications

There needs to be a mechanism to pick up `status: 'queued'` notifications and dispatch them. Currently the digest processor creates queued notifications but nothing processes them.

**Option A (recommended)**: Add a repeatable BullMQ job that polls for queued notifications.

**New file**: `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`

**Design**:
```
Job name: 'notifications:dispatch-queued'
Queue: NOTIFICATIONS
Schedule: Every 30 seconds (repeatable)

Process:
1. Find notifications where status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= NOW())
2. Limit to 50 per batch (prevent long-running jobs)
3. For each, call NotificationDispatchService.dispatchWithFallback()
4. Log summary
```

**Alternatively**: Dispatch could be triggered synchronously when the notification is created. But the cron approach is safer because:
- Retries are automatic
- Failed notifications with `next_retry_at` in the future are naturally skipped
- Decouples creation from dispatch (important for burst scenarios)

**Acceptance criteria**:
- Queued notifications are dispatched within 30 seconds
- Failed notifications with future `next_retry_at` are skipped
- Batch size prevents memory issues
- Rate limiting is checked per notification

---

### Task 3.14: Update Existing Tests

**Files to update**:
- `apps/api/src/modules/communications/notification-dispatch.service.spec.ts` -- update all tests to account for real provider calls (mocked), template rendering, rate limiting
- `apps/api/src/modules/communications/webhook.service.spec.ts` -- verify no changes needed (already tests delivery status updates)
- `apps/api/src/modules/communications/webhook.controller.spec.ts` -- verify no changes needed

**New test files**:
- `apps/api/src/modules/communications/template-renderer.service.spec.ts`
- `apps/api/src/modules/communications/providers/resend-email.provider.spec.ts`
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.spec.ts`
- `apps/api/src/modules/communications/providers/twilio-sms.provider.spec.ts`
- `apps/api/src/modules/communications/notification-rate-limit.service.spec.ts`
- `apps/api/src/modules/communications/unsubscribe.service.spec.ts`

**Acceptance criteria**:
- All existing tests pass
- New services have >90% test coverage
- Tests mock external SDKs (Resend, Twilio) -- never make real API calls in tests

---

## 4. Template Variable System Design

### Architecture

```
payload_json (stored on Notification)
    |
    + static variables (set at notification creation time by the processor)
    |   e.g., { incident_number: 'BH-202603-0042', category_name: 'Detention', ... }
    |
    + dynamic variables (resolved at render time by TemplateRendererService)
        e.g., parent_name, school_name, unsubscribe_url
```

### Variable Resolution Order

1. `payload_json` -- set by the processor that creates the notification (highest priority)
2. Recipient lookup -- `parent_name` from the notification's recipient user + parent record
3. Tenant lookup -- `school_name` from tenant settings
4. System variables -- `unsubscribe_url`, `current_date`, `app_url`

If a variable exists in multiple sources, `payload_json` wins (processor knows best).

### Handlebars Helpers

Register these custom helpers:
- `{{formatDate date locale}}` -- formats a date for the notification's locale
- `{{#if var}}...{{/if}}` -- conditional (built-in)
- `{{#each list}}...{{/each}}` -- iteration for digest entries (built-in)
- `{{stripHtml text}}` -- removes HTML tags (for SMS/WhatsApp bodies)

### Example: Full Variable Map for `behaviour_negative_parent`

```json
{
  "parent_name": "Sarah O'Brien",
  "student_name": "James O'Brien",
  "student_year_group": "Year 5",
  "school_name": "St. Patrick's National School",
  "incident_number": "BH-202603-0042",
  "category_name": "Detention",
  "incident_date": "2026-03-27",
  "parent_description": "Accumulated behaviour warnings",
  "severity": 5,
  "polarity": "negative",
  "unsubscribe_url": "https://app.edupod.app/api/v1/notifications/unsubscribe?token=eyJ...",
  "app_url": "https://app.edupod.app"
}
```

---

## 5. Webhook Endpoint Design

### Current State (already implemented)

Both webhook endpoints exist and are functional at the handler level:

**Resend**: `POST /api/v1/webhooks/resend`
- Svix signature verification (HMAC-SHA256)
- Timestamp replay protection (5-minute window)
- Handles: `email.delivered`, `email.bounced`, `email.complained`
- Falls back to no-verify in dev mode

**Twilio**: `POST /api/v1/webhooks/twilio`
- HMAC-SHA1 signature verification
- Handles: `delivered`, `failed`, `undelivered`
- Creates email fallback on failure

### What Needs to Change

1. **Twilio webhook must handle both SMS and WhatsApp** -- currently it does, since Twilio uses the same callback format for both. Verify that SMS status callbacks work with the existing handler (they should -- same `MessageSid` + `MessageStatus` fields).

2. **Add SMS fallback creation** -- when SMS fails via webhook, create email fallback (currently only creates email fallback for WhatsApp failures). Update `WebhookService.handleTwilioEvent()`:
   - Check `notification.channel` -- if 'whatsapp', fallback to 'sms'; if 'sms', fallback to 'email'
   - This aligns with the full fallback chain

3. **Add `email.opened` event handling** -- Resend sends open tracking events. Consider updating notification metadata but NOT changing status (delivered -> read should only happen via user action in-app).

---

## 6. Rate Limiting Approach

### Per-Parent Rate Limits

| Scope | Limit | Window | Redis Key Pattern |
|-------|-------|--------|-------------------|
| Per channel per hour | 10 | 1 hour | `ratelimit:notif:{tenantId}:{userId}:{channel}:h:{hourBucket}` |
| All channels per day | 30 | 24 hours | `ratelimit:notif:{tenantId}:{userId}:d:{dayBucket}` |

### Exemptions

- `in_app` notifications are never rate-limited (silent, no user fatigue)
- Safeguarding notifications (`safeguarding_*` template keys) bypass rate limits (safety-critical)
- Admin-initiated resends bypass rate limits (explicit human action)

### Implementation Pattern

```typescript
async checkAndIncrement(tenantId: string, userId: string, channel: string): Promise<{ allowed: boolean; reason?: string }> {
  // Skip for in_app
  if (channel === 'in_app') return { allowed: true };

  const client = this.redis.getClient();
  const hourKey = `ratelimit:notif:${tenantId}:${userId}:${channel}:h:${Math.floor(Date.now() / 3600000)}`;
  const dayKey = `ratelimit:notif:${tenantId}:${userId}:d:${Math.floor(Date.now() / 86400000)}`;

  // Check hourly limit
  const hourCount = await client.incr(hourKey);
  if (hourCount === 1) await client.expire(hourKey, 3600);
  if (hourCount > 10) return { allowed: false, reason: 'Hourly limit exceeded (10/hour/channel)' };

  // Check daily limit
  const dayCount = await client.incr(dayKey);
  if (dayCount === 1) await client.expire(dayKey, 86400);
  if (dayCount > 30) return { allowed: false, reason: 'Daily limit exceeded (30/day)' };

  return { allowed: true };
}
```

---

## 7. Fallback Chain Logic

### Decision Table

| Original Channel | Attempt Result | Next Action |
|-----------------|---------------|-------------|
| whatsapp | Template missing | Fallback to sms |
| whatsapp | Send failed, retries remaining | Retry whatsapp (exponential backoff) |
| whatsapp | Send failed, retries exhausted | Fallback to sms |
| sms | Template missing | Fallback to email |
| sms | Send failed, retries remaining | Retry sms |
| sms | Send failed, retries exhausted | Fallback to email |
| email | Template missing | Fallback to in_app |
| email | Send failed, retries remaining | Retry email |
| email | Send failed, retries exhausted | Fallback to in_app |
| in_app | Always succeeds | Mark delivered |

### Fallback Map (code)

```typescript
const FALLBACK_CHAIN: Record<string, string | null> = {
  whatsapp: 'sms',
  sms: 'email',
  email: 'in_app',
  in_app: null,  // terminal
};
```

### Contact Missing Handling

If the recipient lacks a contact detail for the channel (e.g., no `whatsapp_phone`), skip directly to the next fallback without creating a send attempt. This is NOT a failure -- it is a capability gap.

---

## 8. Unsubscribe System

### Flow

1. Email template includes unsubscribe link in footer
2. Parent clicks link -> `GET /api/v1/notifications/unsubscribe?token=X`
3. Server validates JWT, extracts `{ user_id, notification_type }`
4. Server upserts `TenantNotificationSetting`: `is_enabled = false` for that `notification_type`
5. Response: redirect to a simple "You have been unsubscribed" page at `{APP_URL}/unsubscribed`
6. Future notifications of that type check `TenantNotificationSetting` before creating

### Check Point

In `NotificationDispatchService.dispatchWithFallback()`, before sending:
1. Look up `TenantNotificationSetting` for `(tenant_id, notification_type = template_key)`
2. If `is_enabled === false`, skip external dispatch but still create in_app (in_app cannot be unsubscribed)

### Resubscribe

Parents can re-enable notifications from the parent portal settings page (future work, not in this sub-plan scope).

---

## 9. Integration Test Plan

### 9.1 Email Dispatch Integration Test

```
Scenario: Email notification dispatched via Resend
Given: A notification exists with channel=email, status=queued, template_key=behaviour_negative_parent
And: RESEND_API_KEY is configured (mocked)
When: dispatchWithFallback is called
Then: Resend.emails.send is called with rendered HTML body
And: notification.status = 'sent'
And: notification.provider_message_id is set
And: notification.sent_at is set
```

### 9.2 WhatsApp Dispatch Integration Test

```
Scenario: WhatsApp notification dispatched via Twilio
Given: A notification exists with channel=whatsapp, status=queued
And: Parent has whatsapp_phone set
When: dispatchWithFallback is called
Then: Twilio messages.create is called with stripped-HTML body
And: notification.status = 'sent'
And: notification.provider_message_id = messageSid
```

### 9.3 SMS Dispatch Integration Test

```
Scenario: SMS notification dispatched via Twilio
Given: A notification exists with channel=sms, status=queued
And: Parent has phone set
When: dispatchWithFallback is called
Then: Twilio messages.create is called
And: Body is truncated to 1600 chars if needed
```

### 9.4 Fallback Chain Test

```
Scenario: WhatsApp fails -> SMS fails -> email fails -> in_app
Given: A notification with channel=whatsapp
When: WhatsApp send fails (max retries exhausted)
Then: A new notification with channel=sms is created (status=queued)
When: SMS send fails (max retries exhausted)
Then: A new notification with channel=email is created (status=queued)
When: Email send fails (max retries exhausted)
Then: A new notification with channel=in_app is created (status=delivered)
```

### 9.5 Template Rendering Test

```
Scenario: Template variables are rendered in email body
Given: Template body = 'Dear {{parent_name}}, your child {{student_name}} received a {{category_name}}'
And: payload_json = { parent_name: 'Sarah', student_name: 'James', category_name: 'Merit' }
When: Template is rendered
Then: Result = 'Dear Sarah, your child James received a Merit'
```

### 9.6 Rate Limiting Test

```
Scenario: Parent rate limited after 10 emails in one hour
Given: 10 email notifications dispatched to parent A in the last 30 minutes
When: 11th email notification is dispatched
Then: Notification marked as failed with reason 'Hourly limit exceeded'
And: No fallback notification created
```

### 9.7 Webhook Delivery Status Test

```
Scenario: Resend delivery webhook updates notification status
Given: A notification with status=sent, provider_message_id='msg_123'
When: Resend webhook fires with type=email.delivered, data.message_id='msg_123'
Then: notification.status = 'delivered'
And: notification.delivered_at is set
```

### 9.8 Unsubscribe Test

```
Scenario: Parent unsubscribes from behaviour notifications
Given: A valid unsubscribe token for user_id=X, notification_type=behaviour_negative_parent
When: GET /api/v1/notifications/unsubscribe?token=TOKEN
Then: TenantNotificationSetting created/updated with is_enabled=false
And: Future behaviour_negative_parent notifications for this user skip external dispatch
And: in_app notifications still created
```

### 9.9 Missing Contact Detail Test

```
Scenario: WhatsApp notification for parent without whatsapp_phone
Given: A notification with channel=whatsapp
And: Parent has no whatsapp_phone set
When: dispatchWithFallback is called
Then: Skip directly to SMS fallback (no WhatsApp attempt)
```

### 9.10 Digest Multi-Channel Test

```
Scenario: Digest creates notifications per parent preferred channels
Given: Parent with preferred_contact_channels = ['email', 'whatsapp']
And: 3 pending incidents for their child
When: Digest job runs
Then: 3 notifications created: in_app (delivered), email (queued), whatsapp (queued)
And: All share the same payload_json with digest entries
```

---

## 10. File Change Summary

### New Files (8)

| File | Purpose |
|------|---------|
| `apps/api/src/modules/communications/template-renderer.service.ts` | Handlebars template rendering |
| `apps/api/src/modules/communications/template-renderer.service.spec.ts` | Tests |
| `apps/api/src/modules/communications/providers/resend-email.provider.ts` | Resend SDK wrapper |
| `apps/api/src/modules/communications/providers/resend-email.provider.spec.ts` | Tests |
| `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` | Twilio WhatsApp wrapper |
| `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.spec.ts` | Tests |
| `apps/api/src/modules/communications/providers/twilio-sms.provider.ts` | Twilio SMS wrapper |
| `apps/api/src/modules/communications/providers/twilio-sms.provider.spec.ts` | Tests |
| `apps/api/src/modules/communications/notification-rate-limit.service.ts` | Redis-based rate limiting |
| `apps/api/src/modules/communications/notification-rate-limit.service.spec.ts` | Tests |
| `apps/api/src/modules/communications/unsubscribe.service.ts` | Unsubscribe URL generation + processing |
| `apps/api/src/modules/communications/unsubscribe.service.spec.ts` | Tests |
| `apps/worker/src/processors/notifications/dispatch-queued.processor.ts` | Cron to dispatch queued notifications |

### Modified Files (9)

| File | Change |
|------|--------|
| `apps/api/package.json` | Add resend, twilio, handlebars dependencies |
| `apps/api/src/modules/communications/notification-dispatch.service.ts` | Replace placeholders with real provider calls |
| `apps/api/src/modules/communications/notification-dispatch.service.spec.ts` | Update tests for real dispatch |
| `apps/api/src/modules/communications/communications.module.ts` | Register new providers |
| `apps/api/src/modules/communications/webhook.service.ts` | Add SMS fallback, align with full chain |
| `apps/api/src/modules/config/env.validation.ts` | Add TWILIO_SMS_FROM |
| `apps/worker/src/processors/behaviour/parent-notification.processor.ts` | Multi-channel dispatch |
| `apps/worker/src/processors/behaviour/check-awards.processor.ts` | Multi-channel dispatch |
| `apps/worker/src/processors/behaviour/task-reminders.processor.ts` | Add email channel for overdue tasks |
| `packages/prisma/seed.ts` | Add missing notification templates |
| `.env.example` | Add TWILIO_SMS_FROM |

---

## 11. Implementation Order

Execute tasks in this order to minimize broken intermediate states:

1. **Task 3.1**: Install SDKs (unblocks everything)
2. **Task 3.2**: Template renderer (no external deps, pure logic)
3. **Task 3.3 + 3.4 + 3.5**: Provider services (parallel, independent)
4. **Task 3.6**: Env config updates
5. **Task 3.8**: Wire into module
6. **Task 3.7**: Replace dispatch placeholders (depends on 2-5)
7. **Task 3.11**: Rate limiting (independent, but integrates into 3.7)
8. **Task 3.12**: Unsubscribe (independent, but integrates into 3.7)
9. **Task 3.9**: Seed templates (independent, can run anytime)
10. **Task 3.10**: Update worker processors (depends on multi-channel being available)
11. **Task 3.13**: Dispatch cron job (depends on dispatch service being real)
12. **Task 3.14**: Update and add tests (throughout, but final pass at end)

---

## 12. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Resend/Twilio API keys not configured in production | Dispatch service checks `isConfigured()` and logs clear error. Falls back to in_app. Never crashes. |
| Email sending fails silently | Provider returns messageId. Webhook confirms delivery. Failed notifications surface in admin/failed endpoint. |
| Rate limiting too aggressive | Safeguarding templates exempt. Configurable limits via tenant settings (future). |
| Template rendering XSS | Handlebars auto-escapes by default. Use `{{{triple}}}` only for pre-sanitized HTML. |
| Notification storm on seed run | Seed only creates templates, not notifications. No dispatch triggered. |
| WhatsApp/SMS to wrong number | Phone validation at Parent record creation (existing). Twilio validates format. |
| Unsubscribe token forgery | JWT signed with JWT_SECRET (same as auth). 90-day expiry. |
