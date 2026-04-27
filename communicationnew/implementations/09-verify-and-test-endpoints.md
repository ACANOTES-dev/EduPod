# Implementation 09 — `verifyConfig` + test endpoints with full semantics

> **Wave:** 3
> **Depends on:** 01 (schema for `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs` plus `whatsapp_templates`), 03 (`EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` with the `verifyConfig` STUB and the controller `POST :test` 501 endpoints), 04 (per-tenant client cache + cache bus — provider clients are now keyed by `tenant_id` so verification calls reuse the same cached `Resend` / `twilio` instance the regular dispatch path uses)
> **Restart target:** API only (no migration in this impl, no worker job changes, no schema change)
> **Deployment:** Worktree commit only — NO CI, NO PRODUCTION (per IMPLEMENTATION_LOG Rule 5)

---

## Goal

Replace the three 501-Not-Implemented stubs that Impl 03 shipped (`POST /v1/email-config/test`, `POST /v1/sms-config/test`, `POST /v1/whatsapp-config/test`) with fully functional verification endpoints that send a real provider message to a supplied recipient and surface the verbatim provider response. After this impl, a tenant admin clicking "Send test message" in the (Impl 11) Settings UI gets either a real message in their inbox / on their phone with the success path stamping `last_verified_at`, or a verbatim provider error message they can act on without contacting support.

The implementation must:

1. Replace the `verifyConfig` STUB in each of the three credential services with a real provider call. The stub today throws `*_VERIFY_NOT_IMPLEMENTED`; the new implementation decrypts via `getDecryptedConfig`, uses the per-tenant cached provider client from Impl 04, and sends a fixed sentinel sentence using locale-resolved code constants (NOT a `notification_template` row).
2. Add a separate Redis sliding-window rate limit (3 sends per hour per tenant per channel) on a bucket key (`verify:{tenantId}:{channel}`) that is **independent** of the existing `notification-rate-limit.service.ts` so a tenant verifying their setup does not consume any parent's daily allowance and a parent inundated with notifications does not block a tenant from running a verification.
3. Map a small set of well-known provider errors (Resend 401 / 403 domain unverified, Twilio 21211 / 21408 / 21610 / 63016) to user-facing troubleshooting hints. Unknown errors surface verbatim with their status code — no swallowing, no synthetic friendly fallback.
4. Stamp `last_verified_at = now()` on success only. A successful provider response is the only signal that proves the credentials work; provisional / speculative timestamps are forbidden.
5. Audit-log every test send (the existing global `AuditLogInterceptor` covers the `POST :test` mutation; the audit metadata records the masked recipient, the success boolean, the provider message id, and the verbatim error if any).
6. Make WhatsApp verification conditional on the `comms.verify` template being approved per tenant (Option B from PLAN.md §3.10 / `communication-architecture.md` §3.10). If not approved, return a structured `VERIFICATION_TEMPLATE_NOT_APPROVED` error with guidance — no Twilio-only bypass, no fall-through to free-form, no swallowing.
7. For email verification specifically, **bypass the domain-verified gate** that Impl 07 enforces on the regular dispatch path. The whole point of running a verify is to test whether the credentials and sender are wired up; refusing to verify because the domain is not yet verified would prevent the tenant from ever getting actionable feedback. Document this carefully.

This impl is API-only — no migration, no worker job, no frontend code (Impl 11 wires the buttons against the real endpoints). The Zod schemas (`testEmailSchema`, `testSmsSchema`, `testWhatsAppSchema`) and the controller routes already exist from Impl 03; this impl swaps the body of the controller method and the body of `verifyConfig` in each service.

---

## What to change

### 1. `verifyConfig` implementations on the three credential services

#### 1.1 `EmailConfigService.verifyConfig`

Replace the throwing stub introduced by Impl 03 with a real Resend send. The path is:

1. Pull the decrypted config via the existing internal `getDecryptedConfig(tenantId)`. If `null`, throw `NotFoundException({ code: 'EMAIL_CONFIG_NOT_FOUND' })` — the controller’s 501 stub today already short-circuits on missing config, but the new path must reproduce that contract because the rate-limit check must NOT consume a slot for a tenant that has no config at all.
2. Resolve the tenant default locale via `SettingsService.getDefaultLocale(tenantId)`. Fall back to `'en'` if the lookup throws or returns null. The locale picks which sentinel string set to send (`VERIFICATION_EMAIL_TEMPLATES['en' | 'ar']`).
3. Acquire the cached `Resend` client from Impl 04's `PerTenantEmailClient` cache (`emailClient.getClient(tenantId)`). If Impl 04's cache miss falls back to a new `new Resend(decrypted.resend_api_key)` constructor, that's already wired — this impl does not touch the cache.
4. Call `client.emails.send({ from, to, subject, html })` with `from = decrypted.from_email`. The Resend response shape is `{ data, error }`. Treat `error != null` as failure even if HTTP 2xx. Treat a thrown exception (network / unhandled SDK error) as failure with `status_code = 0`.
5. **Bypass the domain-verified gate.** The dispatch path (Impl 07's `EmailDomainGuardService`) refuses sends from unverified domains. The verify path SKIPS that guard — the goal of verification is precisely to detect whether the credentials work; refusing because the domain is unverified would block the tenant's ability to test the keys. Resend itself returns a 403 if the domain hasn't completed DKIM, and that's the verbatim error we want to surface — that's how the tenant learns they need to add DNS records. Add a code comment naming this and naming the alternative we considered ("require domain verified before allowing test send" — rejected because it creates a chicken-and-egg loop).
6. On success: open an RLS-scoped `$transaction` via `createRlsClient(this.prisma, { tenant_id })`, update `tenant_email_configs.last_verified_at = now()` for that row. Return `{ success: true, provider_message_id: data.id, message: 'Sent via Resend', recipient_mask: maskRecipient(dto.recipient_email) }`.
7. On failure: do NOT touch `last_verified_at`. Map known provider errors to a hint via `getProviderErrorHint('email', statusCode, errMessage)`. Return `{ success: false, provider_error: errMessage, status_code: statusCode, troubleshooting_hint: hint ?? null, recipient_mask: maskRecipient(dto.recipient_email) }`.

```typescript
// apps/api/src/modules/configuration/email-config.service.ts (excerpt — replaces the Impl 03 stub)

import { getProviderErrorHint } from './provider-error-hints';
import { VERIFICATION_EMAIL_TEMPLATES } from './constants/verification-templates';

export interface VerifyResult {
  success: boolean;
  provider_message_id?: string;
  provider_error?: string;
  status_code?: number;
  troubleshooting_hint?: string | null;
  message?: string;
  recipient_mask: string;
}

async verifyConfig(tenantId: string, recipientEmail: string): Promise<VerifyResult> {
  const decrypted = await this.getDecryptedConfig(tenantId);
  if (!decrypted) {
    throw new NotFoundException({
      code: 'EMAIL_CONFIG_NOT_FOUND',
      message: 'Email configuration not found for this tenant',
    });
  }

  const locale = await this.settings.getDefaultLocale(tenantId).catch(() => 'en');
  const tpl = VERIFICATION_EMAIL_TEMPLATES[locale === 'ar' ? 'ar' : 'en'];
  const client = await this.emailClient.getClient(tenantId);

  let providerMessageId: string | undefined;
  let providerError: string | undefined;
  let statusCode = 0;

  try {
    const { data, error } = await client.emails.send({
      from: this.composeFromHeader(decrypted),
      to: [recipientEmail],
      subject: tpl.subject,
      html: tpl.html,
      // Tag for downstream debugging — comms-logger picks this up via webhook.
      tags: [{ name: 'kind', value: 'verify' }],
      // No idempotency key — verifies are deliberately repeatable.
    });

    if (error) {
      providerError = error.message;
      statusCode = (error as { statusCode?: number }).statusCode ?? 0;
    } else {
      providerMessageId = data?.id;
    }
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err);
    statusCode = 0;
  }

  if (providerError || !providerMessageId) {
    return {
      success: false,
      provider_error: providerError ?? 'Unknown Resend error',
      status_code: statusCode,
      troubleshooting_hint: getProviderErrorHint('email', statusCode, providerError ?? ''),
      recipient_mask: maskEmailRecipient(recipientEmail),
    };
  }

  // Stamp last_verified_at — success only.
  const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
  await rls.$transaction(async (tx) => {
    const txdb = tx as unknown as PrismaService;
    await txdb.tenantEmailConfig.update({
      where: { id: decrypted.id },
      data: { last_verified_at: new Date() },
    });
  });

  return {
    success: true,
    provider_message_id: providerMessageId,
    message: 'Sent via Resend',
    recipient_mask: maskEmailRecipient(recipientEmail),
  };
}

private composeFromHeader(d: DecryptedEmailConfig): string {
  return d.from_name ? `${d.from_name} <${d.from_email}>` : d.from_email;
}
```

`maskEmailRecipient(email)` keeps the local part’s last 2 characters and the entire domain: `j***p@school.test`. This lives in a small helper at `apps/api/src/modules/configuration/recipient-mask.ts` (new file — see §1.4 below).

#### 1.2 `SmsConfigService.verifyConfig`

Same shape as email. Differences:

- The cached client is a `twilio.Twilio` instance (`smsClient.getClient(tenantId)`).
- The send is `client.messages.create({ from: decrypted.twilio_from_number, to: dto.recipient_phone, body: tpl.body })` where `tpl.body` is the locale-resolved string from `VERIFICATION_SMS_TEMPLATES`.
- Twilio throws on failure; there is no `{ data, error }` envelope. Wrap the call in `try/catch`. The Twilio error object exposes `code` (numeric, e.g. 21211) and `message`. Capture both.
- `statusCode` is the Twilio `code` field (or 0 if no code is present).
- The error hint mapper key is `'sms'`.

```typescript
async verifyConfig(tenantId: string, recipientPhone: string): Promise<VerifyResult> {
  const decrypted = await this.getDecryptedConfig(tenantId);
  if (!decrypted) {
    throw new NotFoundException({
      code: 'SMS_CONFIG_NOT_FOUND',
      message: 'SMS configuration not found for this tenant',
    });
  }

  const locale = await this.settings.getDefaultLocale(tenantId).catch(() => 'en');
  const tpl = VERIFICATION_SMS_TEMPLATES[locale === 'ar' ? 'ar' : 'en'];
  const client = await this.smsClient.getClient(tenantId);

  let providerMessageId: string | undefined;
  let providerError: string | undefined;
  let statusCode = 0;

  try {
    const message = await client.messages.create({
      from: decrypted.twilio_from_number,
      to: recipientPhone,
      body: tpl.body,
    });
    providerMessageId = message.sid;
  } catch (err) {
    if (err instanceof Error) {
      providerError = err.message;
      const twilioCode = (err as { code?: number }).code;
      statusCode = typeof twilioCode === 'number' ? twilioCode : 0;
    } else {
      providerError = String(err);
    }
  }

  if (providerError || !providerMessageId) {
    return {
      success: false,
      provider_error: providerError ?? 'Unknown Twilio error',
      status_code: statusCode,
      troubleshooting_hint: getProviderErrorHint('sms', statusCode, providerError ?? ''),
      recipient_mask: maskPhoneRecipient(recipientPhone),
    };
  }

  const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
  await rls.$transaction(async (tx) => {
    const txdb = tx as unknown as PrismaService;
    await txdb.tenantSmsConfig.update({
      where: { id: decrypted.id },
      data: { last_verified_at: new Date() },
    });
  });

  return {
    success: true,
    provider_message_id: providerMessageId,
    message: 'Sent via Twilio SMS',
    recipient_mask: maskPhoneRecipient(recipientPhone),
  };
}
```

#### 1.3 `WhatsAppConfigService.verifyConfig`

WhatsApp differs in one critical way: outside the 24-hour service window, free-form sends are forbidden by Twilio's Business Policy. There is no way to reliably know whether the recipient is in service window for a verify call (the tenant typed in a recipient phone — they may never have inbound-messaged the tenant, in which case `whatsapp_service_windows` has no row). Therefore verification ALWAYS goes through an approved template, never free-form.

Per PLAN.md §3.10 and the spec:

1. Look up the tenant’s `whatsapp_templates` row keyed by `tenant_id + template_key='comms.verify' + language='en'` (or `'ar'` if the tenant default is Arabic). Impl 13’s backfill creates this row per tenant; the template literally says "EduPod WhatsApp verification — your school's number is wired up correctly." in both languages.
2. If no row exists, or `status != 'approved'`, return `{ success: false, provider_error: 'verification_template_not_approved', status_code: 0, troubleshooting_hint: 'Submit and approve the comms.verify template in the WhatsApp settings page first.', recipient_mask }`. Do NOT attempt the send. Do NOT consume a rate-limit slot — but DO write the audit-log entry (the controller's interceptor handles this regardless).
3. If approved, send via Twilio's `client.messages.create({ from: 'whatsapp:' + decrypted.twilio_whatsapp_from_number, to: 'whatsapp:' + recipientPhone, contentSid: row.twilio_template_sid })`. No variables — the verify template has zero placeholders by design.
4. Same try/catch / error capture / `last_verified_at` stamping pattern as SMS.

```typescript
async verifyConfig(tenantId: string, recipientPhone: string): Promise<VerifyResult> {
  const decrypted = await this.getDecryptedConfig(tenantId);
  if (!decrypted) {
    throw new NotFoundException({
      code: 'WHATSAPP_CONFIG_NOT_FOUND',
      message: 'WhatsApp configuration not found for this tenant',
    });
  }

  const locale = await this.settings.getDefaultLocale(tenantId).catch(() => 'en');
  const lang = locale === 'ar' ? 'ar' : 'en';

  const template = await this.prisma.whatsappTemplate.findFirst({
    where: {
      tenant_id: tenantId,
      template_key: 'comms.verify',
      language: lang,
    },
  });

  if (!template || template.status !== 'approved' || !template.twilio_template_sid) {
    return {
      success: false,
      provider_error: 'verification_template_not_approved',
      status_code: 0,
      troubleshooting_hint:
        'Submit and approve the comms.verify WhatsApp template before running a verification.',
      recipient_mask: maskPhoneRecipient(recipientPhone),
    };
  }

  const client = await this.whatsappClient.getClient(tenantId);

  let providerMessageId: string | undefined;
  let providerError: string | undefined;
  let statusCode = 0;

  try {
    const message = await client.messages.create({
      from: `whatsapp:${decrypted.twilio_whatsapp_from_number}`,
      to: `whatsapp:${recipientPhone}`,
      contentSid: template.twilio_template_sid,
      // No contentVariables — comms.verify has zero placeholders.
    });
    providerMessageId = message.sid;
  } catch (err) {
    if (err instanceof Error) {
      providerError = err.message;
      const twilioCode = (err as { code?: number }).code;
      statusCode = typeof twilioCode === 'number' ? twilioCode : 0;
    } else {
      providerError = String(err);
    }
  }

  if (providerError || !providerMessageId) {
    return {
      success: false,
      provider_error: providerError ?? 'Unknown Twilio WhatsApp error',
      status_code: statusCode,
      troubleshooting_hint: getProviderErrorHint('whatsapp', statusCode, providerError ?? ''),
      recipient_mask: maskPhoneRecipient(recipientPhone),
    };
  }

  const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
  await rls.$transaction(async (tx) => {
    const txdb = tx as unknown as PrismaService;
    await txdb.tenantWhatsappConfig.update({
      where: { id: decrypted.id },
      data: { last_verified_at: new Date() },
    });
  });

  return {
    success: true,
    provider_message_id: providerMessageId,
    message: 'Sent via Twilio WhatsApp',
    recipient_mask: maskPhoneRecipient(recipientPhone),
  };
}
```

If Impl 08 is not yet on the worktree at the time you execute this impl, the Prisma `whatsappTemplate` accessor still exists (Impl 01 created the table). The `comms.verify` row will not exist until Impl 13's backfill — meaning every WhatsApp verification will return the structured "template not approved" error until both 08 and 13 have shipped. Document this clearly in the §5 completion record so the user knows that WhatsApp verification cannot be smoke-tested end-to-end until the dependency chain is complete.

#### 1.4 Recipient-masking helper — `recipient-mask.ts` (new)

```typescript
// apps/api/src/modules/configuration/recipient-mask.ts

/**
 * Mask an email recipient for audit / response logging.
 * `john.smith@school.test` → `j***h@school.test`.
 * Preserves the entire domain (admins need to recognise it). Hides the local
 * part except first and last char.
 */
export function maskEmailRecipient(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? '*'}*${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.slice(-1)}${domain}`;
}

/**
 * Mask a phone recipient for audit / response logging.
 * `+447912345678` → `+44791****5678` (keeps country prefix + last 4).
 */
export function maskPhoneRecipient(phone: string): string {
  if (phone.length <= 5) return '***';
  return `${phone.slice(0, 5)}${'*'.repeat(Math.max(1, phone.length - 9))}${phone.slice(-4)}`;
}
```

Both helpers are unit-tested in `recipient-mask.spec.ts` next to the file. Coverage: empty input, missing `@`, very short input, normal cases (English / Arabic local parts).

---

### 2. Verification rate-limit service — `VerifyRateLimitService` (new)

A separate service from `NotificationRateLimitService` so the buckets cannot collide. Implements a sliding-window counter scoped per tenant per channel.

```typescript
// apps/api/src/modules/configuration/verify-rate-limit.service.ts

import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

export type VerifyChannel = 'email' | 'sms' | 'whatsapp';

export interface VerifyRateLimitResult {
  allowed: boolean;
  retry_after_seconds?: number;
  current_count?: number;
  limit?: number;
}

/**
 * Rate limit for the test-send endpoints. Independent of
 * `NotificationRateLimitService` — verifying a tenant's credentials must not
 * consume any parent's allowance, and a parent who has hit the daily cap
 * must not block a tenant from running a verification.
 *
 * Sliding window via fixed 1-hour bucket key + INCR + EXPIRE. Limit: 3 per
 * channel per hour per tenant.
 *
 * Bucket key: `verify:{tenantId}:{channel}:{YYYYMMDDHH}` (UTC hour).
 */
@Injectable()
export class VerifyRateLimitService {
  private readonly logger = new Logger(VerifyRateLimitService.name);

  /** Verifies allowed per channel per hour per tenant. */
  static readonly LIMIT = 3;

  /** TTL for the bucket key (1 hour + 60s buffer). */
  private readonly BUCKET_TTL_SECONDS = 3660;

  constructor(private readonly redisService: RedisService) {}

  async checkAndIncrement(
    tenantId: string,
    channel: VerifyChannel,
  ): Promise<VerifyRateLimitResult> {
    const client = this.redisService.getClient();
    const bucket = this.getHourBucket();
    const key = `verify:${tenantId}:${channel}:${bucket}`;

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.BUCKET_TTL_SECONDS);
    }

    if (count > VerifyRateLimitService.LIMIT) {
      // Compute retry_after relative to the start of the next UTC hour.
      const now = new Date();
      const nextHour = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours() + 1,
          0,
          0,
          0,
        ),
      );
      const retryAfter = Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 1000));

      this.logger.warn(
        `Verify rate limit exceeded for tenant=${tenantId} channel=${channel} count=${count}`,
      );

      return {
        allowed: false,
        retry_after_seconds: retryAfter,
        current_count: count,
        limit: VerifyRateLimitService.LIMIT,
      };
    }

    return { allowed: true, current_count: count, limit: VerifyRateLimitService.LIMIT };
  }

  private getHourBucket(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    return `${y}${m}${d}${h}`;
  }
}
```

Register in `ConfigurationModule.providers` and `exports`. The three controllers consume it.

**Why a fresh sliding-window service rather than parameterising `NotificationRateLimitService`.** The notification limiter has different semantics (per-recipient-user, multiple buckets, safeguarding bypass). Trying to share the implementation would force conditional branches and a more complex shape. A purpose-built ~50-line service is clearer, easier to test in isolation, and trivially auditable for the "is this counter in the verify space?" question. Document this rationale in the file's class comment.

---

### 3. Controller stub replacement

Each of the three controllers currently throws `NotImplementedException` with a stable error code. This impl swaps the body for a real call. The route, the guard stack, the Zod pipe, and the permission decorator all stay.

```typescript
// apps/api/src/modules/configuration/email-config.controller.ts (excerpt — replaces the Impl 03 stub)

import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';
import { VerifyRateLimitService } from './verify-rate-limit.service';

constructor(
  private readonly emailConfigService: EmailConfigService,
  private readonly verifyLimit: VerifyRateLimitService,
) {}

// POST /v1/email-config/test
@Post('test')
async test(
  @CurrentTenant() tenant: TenantContext,
  @Body(new ZodValidationPipe(testEmailSchema)) dto: TestEmailDto,
): Promise<VerifyResult> {
  const limit = await this.verifyLimit.checkAndIncrement(tenant.tenant_id, 'email');
  if (!limit.allowed) {
    throw new TooManyRequestsException({
      code: 'VERIFY_RATE_LIMIT_EXCEEDED',
      message: `Verification limit reached (${limit.limit ?? 3} per hour). Try again later.`,
      retry_after_seconds: limit.retry_after_seconds,
    });
  }
  return this.emailConfigService.verifyConfig(tenant.tenant_id, dto.recipient_email);
}
```

The SMS controller is identical except calls `verifyLimit.checkAndIncrement(tenant.tenant_id, 'sms')` and `smsConfigService.verifyConfig(tenant.tenant_id, dto.recipient_phone)`. WhatsApp ditto with channel `'whatsapp'`.

**`TooManyRequestsException`.** NestJS does not ship a built-in 429 exception class but the project carries one at `apps/api/src/common/exceptions/too-many-requests.exception.ts` (used by `notification-rate-limit.service.ts` consumers). Verify it exists; if not, the implementing session adds a tiny class extending `HttpException(message, HttpStatus.TOO_MANY_REQUESTS)` in the same commit and re-uses it from each controller.

**Order of operations.** The rate-limit check runs FIRST, before any provider call. This means a tenant with no config row hits 404 from `verifyConfig`, but the rate-limit counter has already incremented. That's deliberate and aligns with the parent rate-limiter (`NotificationRateLimitService.checkAndIncrement` increments before the dispatch attempt too). The 4th call within the hour returns 429 even if the previous 3 returned 404 — this prevents a misconfigured tenant from probing the limiter for free. Document this.

**Why no new permission gate.** The class-level `@RequiresPermission('configuration.communications.manage')` from Impl 03 already gates POST `:test`. There is no `verify`-specific permission — anyone who can configure the channel can verify it.

---

### 4. Sentinel templates — `constants/verification-templates.ts` (new)

The verification messages are immutable per-deploy code constants, not `notification_template` rows. They are channel-specific, never edited, never localised by the tenant, and never variable-interpolated. Putting them in the DB would be ceremony with no benefit. Use bilingual literals for English and Arabic.

```typescript
// apps/api/src/modules/configuration/constants/verification-templates.ts

export interface EmailVerificationTemplate {
  subject: string;
  /** HTML body. Plain prose only — no images, no tracking pixels, no variables. */
  html: string;
}

export interface SmsVerificationTemplate {
  body: string;
}

export const VERIFICATION_EMAIL_TEMPLATES: Record<'en' | 'ar', EmailVerificationTemplate> = {
  en: {
    subject: 'EduPod credential verification',
    html:
      '<p>If you can read this, your school&rsquo;s email integration is working.</p>' +
      '<p>&mdash; EduPod</p>',
  },
  ar: {
    subject: 'التحقق من بيانات الاعتماد - EduPod',
    html:
      '<p>إذا كنت تقرأ هذه الرسالة، فإن تكامل البريد الإلكتروني لمدرستك يعمل بشكل صحيح.</p>' +
      '<p>&mdash; EduPod</p>',
  },
};

export const VERIFICATION_SMS_TEMPLATES: Record<'en' | 'ar', SmsVerificationTemplate> = {
  en: {
    body: "EduPod SMS verification — your school's SMS is wired up correctly. Reply STOP to opt out.",
  },
  ar: {
    body: 'التحقق من الرسائل النصية - EduPod. إعداد الرسائل النصية لمدرستك صحيح. أرسل STOP لإلغاء الاشتراك.',
  },
};

/**
 * The WhatsApp verification text lives in `whatsapp_templates.body_en` /
 * `body_ar` (per Impl 01 schema) and is registered with Twilio by Impl 13's
 * backfill. The runtime never inlines a WhatsApp string here — the only
 * legal way to send WhatsApp outside the 24h service window is via an
 * approved template SID.
 */
```

Both English and Arabic strings live as code constants because they're verification-specific and immutable per-deploy. If the messaging ever changes, it changes by editing this file and re-deploying — which is the correct change-management cadence for "is the integration working" copy.

The `Record<'en' | 'ar', ...>` shape is intentional: the locale resolution upstream (`locale === 'ar' ? 'ar' : 'en'`) collapses every other locale to English, which matches the platform's "English fallback" convention from `frontend.md`.

---

### 5. Provider error hints — `provider-error-hints.ts` (new)

A simple lookup map from `(channel, status_code, message)` to a single user-facing English hint string. Covers the well-known cases the verify path hits during onboarding. Unknown errors return `null` and the controller surfaces just the verbatim provider message + status code.

```typescript
// apps/api/src/modules/configuration/provider-error-hints.ts

type Channel = 'email' | 'sms' | 'whatsapp';

interface HintRule {
  /** Exact HTTP status (Resend) or Twilio numeric error code. */
  code?: number;
  /** Optional substring match against the provider's error message. */
  match?: RegExp;
  hint: string;
}

const RULES: Record<Channel, HintRule[]> = {
  email: [
    {
      code: 401,
      hint: 'API key is invalid. Double-check the key from your Resend dashboard.',
    },
    {
      code: 403,
      match: /(domain|verified|not verified|unverified|verification)/i,
      hint: 'The sender domain is not verified yet. Complete domain verification in the Email settings page first.',
    },
    {
      match: /invalid.*(from|sender|email)/i,
      hint: 'The "from" email address looks invalid. Use an address whose domain you have added and verified in Resend.',
    },
  ],
  sms: [
    {
      code: 21211,
      hint: 'Recipient phone number is not valid E.164 format. Use the +<countrycode><number> form.',
    },
    {
      code: 21408,
      hint: "Twilio account doesn't have permission to send to this region. Enable the destination country in your Twilio Geo Permissions.",
    },
    {
      code: 21610,
      hint: 'Recipient has unsubscribed from your Twilio number. They must reply START to opt back in.',
    },
    {
      code: 20003,
      hint: 'Twilio authentication failed. Verify the Account SID and Auth Token in your settings.',
    },
  ],
  whatsapp: [
    {
      code: 63016,
      hint: 'Free-form messages are only allowed inside the 24h service window. The verification path uses an approved template — make sure `comms.verify` is in `approved` state.',
    },
    {
      code: 63017,
      hint: 'The recipient WhatsApp number is not registered with WhatsApp. Confirm the number with the user.',
    },
    {
      code: 63015,
      hint: 'Twilio rejected the WhatsApp message. Check that your sender number is enabled for WhatsApp Business and the template is approved.',
    },
    {
      code: 21408,
      hint: "Twilio account doesn't have permission to send WhatsApp to this region.",
    },
  ],
};

export function getProviderErrorHint(
  channel: Channel,
  statusCode: number,
  message: string,
): string | null {
  for (const rule of RULES[channel]) {
    if (rule.code !== undefined && rule.code === statusCode) {
      if (!rule.match || rule.match.test(message)) {
        return rule.hint;
      }
    } else if (rule.match && rule.match.test(message)) {
      return rule.hint;
    }
  }
  return null;
}
```

**Why a simple in-process map instead of a config table.** The set is tiny (≤10 rules per channel) and changes only when we expand the verify experience. A DB table buys us tenant overrides we don't want — every tenant gets the same hint copy in English. If a provider deprecates a code or introduces a new one, that's a code edit.

---

### 6. Audit logging

The existing global `AuditLogInterceptor` already runs on every `POST /v1/{email|sms|whatsapp}-config/test` call (the route uses `@Post`, the interceptor wraps every `POST/PUT/PATCH/DELETE`). No service-level audit-write is added — per `.claude/rules/backend.md`: "Do NOT manually write audit logs — the AuditLogInterceptor handles this on mutations".

What the interceptor records out of the box:

- `entity_type` derived from the route (`/v1/email-config/test` → entity_type `tenant_email_config`; same logic for sms, whatsapp).
- `action` derived from method + path; the existing rule maps `POST .../test` to action `test`. If the existing route → action map does not produce `verify` for this route shape, **add `verify`** as the action via a small extension to the route-to-action helper. Concrete approach: in the interceptor, special-case the `:test` suffix on credential controllers to emit `action='verify'` so the audit log surface stays semantically meaningful (the interceptor already supports per-controller overrides via an `@AuditAction('verify')` decorator — apply it to the three controller `test` methods).

```typescript
@Post('test')
@AuditAction('verify')
async test(...) { ... }
```

- `meta` defaults to the request body (with `SENSITIVE_FIELDS` stripped — `recipient_email` and `recipient_phone` are NOT in that set, so they would land in audit metadata in clear). Override: each controller method extends the audit metadata via the `auditMetaTransform` callback (or a custom decorator like `@AuditMeta((req, res) => ({ recipient: maskRecipient(req.body.recipient_email), success: res.success, provider_message_id: res.provider_message_id, error: res.provider_error }))`). Implementation choice: ship a small `audit-meta` decorator if it doesn't already exist; if the project pattern is to expose a service helper, use that. The implementing session must pick whichever pattern the codebase already uses (Impl 03 specs reference an existing `AuditLogInterceptor` with sensitivity decorators — reuse that mechanism rather than inventing new).

The result: every test send writes an audit log entry with a masked recipient, the success boolean, the provider message id (or null), and the verbatim error (or null). Test-coverage requirement: a single unit test that mocks the audit-log service and asserts a row was scheduled with the masked recipient + success boolean.

---

### 7. Module wiring — `configuration.module.ts`

`configuration.module.ts` is on the shared-file claim list (Rule 17). Before editing, append the Wave-3 ownership claim to `IMPLEMENTATION_LOG.md` §5. Add the new providers + exports surgically — do not re-order existing entries.

Add to `providers`:

```typescript
VerifyRateLimitService,
```

Add to `exports`:

```typescript
VerifyRateLimitService,
```

(`VerifyRateLimitService` is exported because Impl 11's UI tests will spy on the limiter via E2E; not strictly required for the API runtime path.)

The three credential services already DI `EncryptionService`, `PrismaService`, `COMMS_CACHE_BUS`, and (post Impl 04) the per-tenant client cache. This impl additionally injects `SettingsService` (for default-locale resolution) into each credential service constructor. Verify `SettingsService` is already in the module's `providers` (it is — Impl 03's wiring includes it). No `imports` change.

Run the AppModule DI smoke (Rule 6) before committing.

---

## Tests

Per `.claude/rules/testing.md`, every endpoint needs at least a happy-path and a permission-denied test, every calculation path (the rate limiter; the error-hint mapper) needs unit tests, every state mutation (`last_verified_at`) needs proof-of-write tests. RLS isolation for the credential rows is covered by Impl 03's RLS suite — this impl does not duplicate that.

### Test file inventory

```
apps/api/src/modules/configuration/
├── verify-rate-limit.service.spec.ts                        [NEW]
├── provider-error-hints.spec.ts                              [NEW]
├── recipient-mask.spec.ts                                    [NEW]
├── email-config.service.verify.spec.ts                       [NEW]      ← supplements the Impl 03 spec
├── sms-config.service.verify.spec.ts                         [NEW]
├── whatsapp-config.service.verify.spec.ts                    [NEW]
├── email-config.controller.verify.spec.ts                    [NEW]
├── sms-config.controller.verify.spec.ts                      [NEW]
└── whatsapp-config.controller.verify.spec.ts                 [NEW]

apps/api/test/
└── verify-endpoints.e2e-spec.ts                              [NEW — single e2e covers all 3 channels]
```

The Impl 03 service / controller specs are NOT modified. Verify-specific tests live in dedicated `*.verify.spec.ts` files so the Impl 03 file stays focused on CRUD/encryption/masking.

### Test 1 — Email verify happy path

```typescript
describe('EmailConfigService.verifyConfig — happy path', () => {
  it('sends a Resend message and stamps last_verified_at on success', async () => {
    const sendMock = jest.fn().mockResolvedValue({
      data: { id: 'resend_msg_abc123' },
      error: null,
    });
    mockEmailClient.getClient.mockResolvedValue({
      emails: { send: sendMock },
    });
    mockEncryption.decrypt.mockReturnValue('re_test_key');
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
    mockSettings.getDefaultLocale.mockResolvedValue('en');

    const captured: { data: { last_verified_at: Date } }[] = [];
    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          tenantEmailConfig: {
            update: jest.fn(async (args: { data: { last_verified_at: Date } }) => {
              captured.push(args);
              return { ...mockDbRow, last_verified_at: args.data.last_verified_at };
            }),
          },
        }),
    });

    const result = await service.verifyConfig(TENANT_ID, 'real-test@example.com');

    // Assert provider was called with the correct shape
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(String),
        to: ['real-test@example.com'],
        subject: 'EduPod credential verification',
        html: expect.stringContaining('integration is working'),
        tags: expect.arrayContaining([{ name: 'kind', value: 'verify' }]),
      }),
    );

    // Assert last_verified_at was stamped (single update call inside the RLS tx)
    expect(captured).toHaveLength(1);
    expect(captured[0]?.data.last_verified_at).toBeInstanceOf(Date);

    // Assert returned shape
    expect(result).toEqual({
      success: true,
      provider_message_id: 'resend_msg_abc123',
      message: 'Sent via Resend',
      recipient_mask: expect.stringContaining('@example.com'),
    });
  });
});
```

### Test 2 — Email verify failure

```typescript
it('returns success=false and does NOT stamp last_verified_at on Resend error', async () => {
  const sendMock = jest.fn().mockResolvedValue({
    data: null,
    error: { message: 'API key is invalid', name: 'validation_error', statusCode: 401 },
  });
  mockEmailClient.getClient.mockResolvedValue({ emails: { send: sendMock } });
  // ... rest of setup

  const updateSpy = jest.fn();
  (createRlsClient as jest.Mock).mockReturnValue({
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ tenantEmailConfig: { update: updateSpy } }),
  });

  const result = await service.verifyConfig(TENANT_ID, 'real-test@example.com');

  expect(result.success).toBe(false);
  expect(result.provider_error).toBe('API key is invalid');
  expect(result.status_code).toBe(401);
  expect(result.troubleshooting_hint).toContain('API key is invalid');

  // The RLS transaction must NOT have run — last_verified_at is unchanged
  expect(updateSpy).not.toHaveBeenCalled();
});

it('returns success=false on thrown SDK exception', async () => {
  const sendMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  // ...
  const result = await service.verifyConfig(TENANT_ID, 'real-test@example.com');
  expect(result.success).toBe(false);
  expect(result.provider_error).toBe('ECONNREFUSED');
  expect(result.status_code).toBe(0);
});
```

### Test 3 — SMS verify happy + failure

Same shape as Test 1/2 but against `SmsConfigService` and `client.messages.create()`. Failure case mocks Twilio throwing an error with `code: 21211, message: 'The "To" number is not a valid phone number.'` — assert the hint is "Recipient phone number is not valid E.164 format. Use the +<countrycode><number> form." and `last_verified_at` is unchanged.

### Test 4 — WhatsApp verify with approved template

```typescript
it('sends via approved template and stamps last_verified_at', async () => {
  mockPrisma.whatsappTemplate.findFirst.mockResolvedValue({
    tenant_id: TENANT_ID,
    template_key: 'comms.verify',
    language: 'en',
    status: 'approved',
    twilio_template_sid: 'HX_test_template_sid',
  });
  const createMock = jest.fn().mockResolvedValue({ sid: 'SM_test_message_sid' });
  mockWhatsappClient.getClient.mockResolvedValue({ messages: { create: createMock } });
  // ... rest

  const result = await service.verifyConfig(TENANT_ID, '+447912345678');

  expect(createMock).toHaveBeenCalledWith({
    from: 'whatsapp:+15555550100', // tenant's whatsapp_from_number
    to: 'whatsapp:+447912345678',
    contentSid: 'HX_test_template_sid',
  });
  expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty('contentVariables');
  expect(result.success).toBe(true);
  expect(result.provider_message_id).toBe('SM_test_message_sid');
});
```

### Test 5 — WhatsApp verify without approved template

```typescript
it.each([
  ['no row', null],
  ['pending status', { status: 'pending', twilio_template_sid: null }],
  ['rejected status', { status: 'rejected', twilio_template_sid: null }],
  ['approved but no SID', { status: 'approved', twilio_template_sid: null }],
])('returns verification_template_not_approved when template is %s', async (_, row) => {
  mockPrisma.whatsappTemplate.findFirst.mockResolvedValue(row);
  const createMock = jest.fn();
  mockWhatsappClient.getClient.mockResolvedValue({ messages: { create: createMock } });

  const result = await service.verifyConfig(TENANT_ID, '+447912345678');

  expect(result.success).toBe(false);
  expect(result.provider_error).toBe('verification_template_not_approved');
  expect(result.troubleshooting_hint).toContain('Submit and approve the comms.verify');

  // Critical: the provider was NEVER called
  expect(createMock).not.toHaveBeenCalled();
});
```

### Test 6 — Rate limit (3-per-hour, 4th returns 429)

Lives in the controller spec because the limiter is enforced at the controller boundary.

```typescript
describe('EmailConfigController.test — rate limiting', () => {
  it('rejects the 4th call within the hour with 429 + retry-after', async () => {
    // 3 successful checks
    for (let i = 1; i <= 3; i++) {
      mockVerifyLimit.checkAndIncrement.mockResolvedValueOnce({
        allowed: true,
        current_count: i,
        limit: 3,
      });
      await controller.test(tenantCtx, { recipient_email: 'a@b.test' });
    }

    // 4th call returns disallowed
    mockVerifyLimit.checkAndIncrement.mockResolvedValueOnce({
      allowed: false,
      retry_after_seconds: 1234,
      current_count: 4,
      limit: 3,
    });

    let caught: TooManyRequestsException | null = null;
    try {
      await controller.test(tenantCtx, { recipient_email: 'a@b.test' });
    } catch (e) {
      caught = e as TooManyRequestsException;
    }

    expect(caught).toBeInstanceOf(TooManyRequestsException);
    const body = caught!.getResponse() as { code: string; retry_after_seconds: number };
    expect(body.code).toBe('VERIFY_RATE_LIMIT_EXCEEDED');
    expect(body.retry_after_seconds).toBe(1234);
  });
});
```

A second test in `verify-rate-limit.service.spec.ts` exercises the actual Redis math against a mock Redis client:

```typescript
describe('VerifyRateLimitService', () => {
  it('first 3 calls allowed, 4th disallowed with retry_after computed to next UTC hour', async () => {
    const incrSpy = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    const expireSpy = jest.fn();
    mockRedis.getClient.mockReturnValue({ incr: incrSpy, expire: expireSpy });

    const r1 = await service.checkAndIncrement(TENANT_ID, 'email');
    const r2 = await service.checkAndIncrement(TENANT_ID, 'email');
    const r3 = await service.checkAndIncrement(TENANT_ID, 'email');
    const r4 = await service.checkAndIncrement(TENANT_ID, 'email');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.retry_after_seconds).toBeGreaterThan(0);
    expect(r4.retry_after_seconds).toBeLessThanOrEqual(3600);

    // Only the first INCR set the TTL
    expect(expireSpy).toHaveBeenCalledTimes(1);
  });
});
```

### Test 7 — Rate limit per tenant

```typescript
it('Tenant A and Tenant B have independent counters', async () => {
  const incrSpy = jest.fn();
  // 4 calls all return 1 because the keys are different
  incrSpy.mockResolvedValue(1);
  mockRedis.getClient.mockReturnValue({ incr: incrSpy, expire: jest.fn() });

  await service.checkAndIncrement('tenant-A', 'email');
  await service.checkAndIncrement('tenant-A', 'email');
  await service.checkAndIncrement('tenant-A', 'email');
  await service.checkAndIncrement('tenant-A', 'email');
  await service.checkAndIncrement('tenant-B', 'email');

  const keys = incrSpy.mock.calls.map(([k]) => k as string);
  // 4 of the 5 keys are tenant-A; 1 is tenant-B; both prefixes seen
  expect(keys.filter((k) => k.includes('tenant-A')).length).toBe(4);
  expect(keys.filter((k) => k.includes('tenant-B')).length).toBe(1);
});
```

### Test 8 — Rate limit per channel

```typescript
it('email and sms have separate counters', async () => {
  // ... similar, asserting the bucket key contains ':email:' vs ':sms:'
});
```

### Test 9 — Provider error hint mapping

```typescript
describe('getProviderErrorHint', () => {
  it.each([
    ['email', 401, 'Invalid API key', /API key is invalid/],
    ['email', 403, 'Domain not verified', /domain is not verified/],
    ['sms', 21211, '"To" number is not valid', /E.164/],
    ['sms', 21408, 'Permission denied for region', /Geo Permissions/],
    ['sms', 21610, 'Recipient unsubscribed', /unsubscribed/],
    ['whatsapp', 63016, 'Outside service window', /24h service window/],
  ])('maps (%s, %d) → hint matches %j', (channel, code, msg, expected) => {
    const hint = getProviderErrorHint(channel as any, code, msg);
    expect(hint).toMatch(expected);
  });

  it('returns null for unknown codes', () => {
    expect(getProviderErrorHint('email', 999, 'unknown')).toBeNull();
  });
});
```

### Test 10 — Permission denial

For each of the three controllers, a non-admin user (no `configuration.communications.manage`) gets 403 from `POST :test`. Reuse the helper / fixture from Impl 03's permission-denial test (the helper is already token-aware and tenant-aware).

```typescript
it('POST /v1/email-config/test rejects user without configuration.communications.manage', async () => {
  await authPost(
    app,
    '/api/v1/email-config/test',
    teacherToken,
    { recipient_email: 'x@y.test' },
    fixture.domainName,
  ).expect(403);
});
```

12 permission-denial tests in total (3 controllers × 1 method × 4 token shapes is overkill; one shape per controller is sufficient since the guard chain doesn't change).

### Test 11 — Audit log entry

```typescript
it('writes an audit log row with masked recipient and success boolean', async () => {
  const auditSpy = jest.spyOn(auditLogService, 'write');
  // Mock the rest of the verify path to succeed
  // ... call the endpoint
  // Assert one audit row was queued
  await flushPromises();
  expect(auditSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      entity_type: 'tenant_email_config',
      action: 'verify',
      meta: expect.objectContaining({
        recipient: expect.stringContaining('***'),
        success: true,
        provider_message_id: 'resend_msg_abc123',
      }),
    }),
  );
});
```

The audit-log e2e suite (Impl 14's E2E walkthrough) re-validates a row actually lands in the `audit_logs` table.

### Test 12 — Unverified domain bypass for email verify

```typescript
it('email verify still attempts the send when domain is unverified', async () => {
  // The domain guard would refuse a regular dispatch — but verify must call Resend regardless.
  const domainGuardSpy = jest
    .spyOn(emailDomainGuardService, 'assertVerified')
    .mockImplementation(() => {
      throw new Error('domain not verified');
    });
  const sendSpy = jest.fn().mockResolvedValue({
    data: null,
    error: { message: 'The from domain is not verified', statusCode: 403 },
  });
  mockEmailClient.getClient.mockResolvedValue({ emails: { send: sendSpy } });

  const result = await service.verifyConfig(TENANT_ID, 'real-test@example.com');

  // Critical: the domain guard must NOT have been consulted on the verify path
  expect(domainGuardSpy).not.toHaveBeenCalled();
  // The Resend call IS made; we surface its 403 verbatim with the hint
  expect(sendSpy).toHaveBeenCalled();
  expect(result.success).toBe(false);
  expect(result.troubleshooting_hint).toContain('domain is not verified');
});
```

This test **proves the architectural invariant** that domain verification is not a precondition for the verify path. If a future refactor accidentally makes it so, this test fails.

### Test 13 — Recipient masking in logs

A unit test on the helper functions (`recipient-mask.spec.ts`):

```typescript
describe('maskEmailRecipient', () => {
  it.each([
    ['john.smith@school.test', /^j[*]+h@school\.test$/],
    ['jp@school.test', /^j\*@school\.test$/],
    ['a@b.test', /^a\*@b\.test$/],
    ['', '***'],
  ])('masks %s correctly', (input, pattern) => {
    if (typeof pattern === 'string') {
      expect(maskEmailRecipient(input)).toBe(pattern);
    } else {
      expect(maskEmailRecipient(input)).toMatch(pattern);
    }
  });
});

describe('maskPhoneRecipient', () => {
  it.each([
    ['+447912345678', /^\+4479[*]+5678$/],
    ['+15555550100', /^\+1555[*]+0100$/],
    ['short', '***'],
  ])('masks %s correctly', (input, pattern) => {
    /* ... */
  });
});
```

A second integration assertion: in the `verifyConfig` happy-path service test, assert that `result.recipient_mask` does not contain the full input email's local part:

```typescript
expect(result.recipient_mask).not.toContain('john.smith');
expect(result.recipient_mask).toContain('@example.com');
```

### Test 14 — Sentinel template content

```typescript
it.each([
  ['en', 'EduPod credential verification'],
  ['ar', 'التحقق من بيانات الاعتماد'],
])('email subject for locale %s contains the expected phrase', (locale, expected) => {
  expect(VERIFICATION_EMAIL_TEMPLATES[locale as 'en' | 'ar'].subject).toContain(expected);
});

it('SMS body contains a STOP keyword for opt-out compliance', () => {
  expect(VERIFICATION_SMS_TEMPLATES.en.body).toContain('STOP');
});
```

The STOP keyword is non-negotiable for Twilio US/UK regulatory compliance on transactional SMS.

---

## Verification (local dev server)

Per Rule 27a, this impl is verified end-to-end on a local dev server before flipping the row to `completed`. This is a backend-only impl — no UI involvement (Impl 11 wires the buttons) — so verification is via `curl` and a real provider account.

### Pre-flight

```bash
pnpm --filter @school/api type-check
pnpm --filter @school/api lint
pnpm --filter @school/api test --runInBand --testPathPattern '(verify|provider-error-hints|recipient-mask)'
pnpm --filter @school/shared test --runInBand

# AppModule DI smoke (Rule 6)
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

### Live dev server — Email verify

Start API:

```bash
pnpm --filter @school/api dev
```

In another shell, configure email for the NHQS tenant. **Use a real Resend test API key** (signing up for a Resend free account takes ~1 minute and gives a sandbox key). Use a real recipient email you own.

```bash
TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!","domain":"nhqs.local"}' \
  | jq -r '.data.accessToken')

# Step 1 — configure email (PUT) with the real Resend key
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "resend_api_key": "re_REAL_KEY_HERE",
    "from_email": "verify-test@onboarding.resend.dev",
    "from_name": "NHQS Verify Test",
    "webhook_secret": "whsec_smoke_test_at_least_8_chars"
  }' \
  http://localhost:3001/api/v1/email-config

# Step 2 — fire a verification (POST :test) to a real address
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_email":"YOUR_REAL_EMAIL@example.com"}' \
  http://localhost:3001/api/v1/email-config/test
# Expected: 200 with { success: true, provider_message_id: "...", message: "Sent via Resend" }
# Verify: an email lands in YOUR_REAL_EMAIL inbox with subject "EduPod credential verification"
```

```sql
-- Step 3 — verify last_verified_at was stamped
SELECT id, tenant_id, last_verified_at FROM tenant_email_configs
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'nhqs');
-- Expected: last_verified_at is within the last 60 seconds
```

### Rate limit smoke

```bash
# Step 4 — fire 4 verifications back to back; the 4th must return 429
for i in 1 2 3 4; do
  curl -o /dev/null -s -w "Call $i: HTTP %{http_code}\n" -X POST \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"recipient_email":"YOUR_REAL_EMAIL@example.com"}' \
    http://localhost:3001/api/v1/email-config/test
done
# Expected: Call 1: 200, Call 2: 200, Call 3: 200, Call 4: 429
```

```bash
# Step 5 — read the body of the 429 to confirm the retry_after
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_email":"YOUR_REAL_EMAIL@example.com"}' \
  http://localhost:3001/api/v1/email-config/test \
  | jq .
# Expected: { error: { code: "VERIFY_RATE_LIMIT_EXCEEDED", retry_after_seconds: <int>, message: "..." } }
```

### Wrong-key path

```bash
# Step 6 — push a deliberately wrong API key and re-verify
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "resend_api_key": "re_intentionally_wrong_key",
    "from_email": "verify-test@onboarding.resend.dev",
    "from_name": "NHQS Verify Test",
    "webhook_secret": "whsec_smoke_test_at_least_8_chars"
  }' \
  http://localhost:3001/api/v1/email-config

# Wait for the cache bus to invalidate (Impl 04 — should be < 1 second)
sleep 2

# Step 7 — verify; expect 200 with success: false and the error hint
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_email":"YOUR_REAL_EMAIL@example.com"}' \
  http://localhost:3001/api/v1/email-config/test \
  | jq .
# Expected: { success: false, provider_error: "...", status_code: 401,
#            troubleshooting_hint: "API key is invalid. Double-check..." }
# Verify: SELECT last_verified_at — value is UNCHANGED from the earlier success
```

### Live dev server — SMS verify

```bash
# Repeat with Twilio test credentials. Twilio's "magic" test SID + token never
# actually deliver but they do return realistic 21211 / 21408 / etc errors,
# which exercises the hint-mapping path. For a real-delivery happy path use
# a paid Twilio sandbox number against your own phone.
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "twilio_account_sid": "ACtest_real_sid",
    "twilio_auth_token": "test_real_token",
    "twilio_from_number": "+15555550100",
    "webhook_secret": "whsec_smoke_test_at_least_8_chars"
  }' \
  http://localhost:3001/api/v1/sms-config

curl -i -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_phone":"+447912345678"}' \
  http://localhost:3001/api/v1/sms-config/test
# Expected (real key + real number): 200 + text received on phone +447...
# Expected (test key): 200 with success: false + hint
```

### WhatsApp verify

If Impl 08 has shipped on the worktree AND Impl 13 has run the backfill, the `comms.verify` template should be approved and the verify path should work end-to-end.

If either is missing (likely while Wave 3 is in flight), the WhatsApp verify will return:

```json
{
  "success": false,
  "provider_error": "verification_template_not_approved",
  "troubleshooting_hint": "Submit and approve the comms.verify WhatsApp template before running a verification."
}
```

This is correct behaviour. Document in the §5 completion record:

> WhatsApp verification cannot be smoke-tested against a real recipient until Impl 08 (template lifecycle) and Impl 13 (backfill — which seeds the `comms.verify` template per tenant) have both completed. The WhatsApp service spec covers the unhappy-path "template not approved" branch and the happy-path branch with a mocked approved template; the live happy-path smoke is deferred to Impl 14's E2E walkthrough.

### Audit-log spot check

```sql
-- After running the verifications, confirm 4+ rows exist
SELECT entity_type, action, created_at, meta
FROM audit_logs
WHERE entity_type = 'tenant_email_config'
  AND action = 'verify'
ORDER BY created_at DESC
LIMIT 5;
-- Expected: each row has meta.recipient masked (e.g. "y***l@example.com"),
--           meta.success boolean, and meta.provider_message_id (or meta.error)
```

### Local verification block to record in §5

```
- **Local verification:**
  - Endpoints covered: POST /v1/email-config/test (success + wrong-key + rate
    limit + permission denial), POST /v1/sms-config/test (mocked happy path,
    real-error path on Twilio test creds), POST /v1/whatsapp-config/test
    (deferred — see WhatsApp note below).
  - Real email landed in inbox with the expected subject + body.
  - last_verified_at observed to update on success and stay unchanged on failure.
  - Rate limit smoke: 3 successful calls + 4th returned 429 with retry_after.
  - Audit-log smoke: 4 rows landed in audit_logs with masked recipient + success
    flag + (where applicable) provider_message_id.
  - DI smoke: AppModule.compile() returned OK after wiring VerifyRateLimitService.
  - Test suites passing: verify-rate-limit.service.spec.ts, provider-error-hints.spec.ts,
    recipient-mask.spec.ts, *.verify.spec.ts × 6 (3 service + 3 controller),
    verify-endpoints.e2e-spec.ts.
  - WhatsApp note: real-delivery smoke deferred to Impl 14's E2E walkthrough
    (depends on Impl 08 + Impl 13). The mocked-template service test covers
    the happy path; the not-approved branch is exercised against the live API.
  - Console errors observed: none.
  - Run timestamp: <ISO>.
```

---

## Files touched

### New files

```
apps/api/src/modules/configuration/verify-rate-limit.service.ts                    [NEW]
apps/api/src/modules/configuration/verify-rate-limit.service.spec.ts               [NEW]
apps/api/src/modules/configuration/provider-error-hints.ts                         [NEW]
apps/api/src/modules/configuration/provider-error-hints.spec.ts                    [NEW]
apps/api/src/modules/configuration/recipient-mask.ts                               [NEW]
apps/api/src/modules/configuration/recipient-mask.spec.ts                          [NEW]
apps/api/src/modules/configuration/constants/verification-templates.ts             [NEW]

apps/api/src/modules/configuration/email-config.service.verify.spec.ts             [NEW]
apps/api/src/modules/configuration/sms-config.service.verify.spec.ts               [NEW]
apps/api/src/modules/configuration/whatsapp-config.service.verify.spec.ts          [NEW]
apps/api/src/modules/configuration/email-config.controller.verify.spec.ts          [NEW]
apps/api/src/modules/configuration/sms-config.controller.verify.spec.ts            [NEW]
apps/api/src/modules/configuration/whatsapp-config.controller.verify.spec.ts       [NEW]

apps/api/test/verify-endpoints.e2e-spec.ts                                          [NEW]
```

### Modified files (claim under Rule 17 if listed)

```
apps/api/src/modules/configuration/email-config.service.ts                  [replace verifyConfig stub body, +injection]
apps/api/src/modules/configuration/sms-config.service.ts                    [replace verifyConfig stub body, +injection]
apps/api/src/modules/configuration/whatsapp-config.service.ts               [replace verifyConfig stub body, +injection]
apps/api/src/modules/configuration/email-config.controller.ts               [replace test() body, +inject VerifyRateLimitService]
apps/api/src/modules/configuration/sms-config.controller.ts                 [same]
apps/api/src/modules/configuration/whatsapp-config.controller.ts            [same]
apps/api/src/modules/configuration/configuration.module.ts                   [Rule 17 — claim before edit; +VerifyRateLimitService provider/export]
```

`apps/api/src/common/exceptions/too-many-requests.exception.ts` is added if it does not already exist (verify before opening — likely already there from earlier rate-limit work).

### Files NOT touched (deliberate)

- `packages/prisma/schema.prisma` — no schema change, no migration.
- `packages/prisma/rls/policies.sql` — no new tables.
- `apps/worker/src/**` — verification is API-only, no worker job, no cron.
- `packages/shared/src/**` — DTO shapes (`testEmailSchema` etc.) already exist from Impl 03. No new shared exports.
- `apps/api/src/modules/communications/notification-rate-limit.service.ts` — DO NOT touch the parent rate limiter. The verify limiter is a sibling, not a parameterisation.
- `apps/api/src/modules/communications/providers/*.ts` — the providers are refactored by Impl 04. The verify path consumes the cached client through Impl 04's `PerTenantEmailClient` etc. — no provider-level change here.
- `docs/architecture/*.md` — Impl 14 owns architecture doc updates per Rule 14. (One small update to `event-job-catalog.md` may land here if the existing audit-log catalog is keyed by `(entity_type, action)` and the new `(tenant_email_config, verify)` row needs adding — defer that to Impl 14 to keep the doc surface coherent.)

---

## Rollback

Worktree-only commits. Recovery is a single git revert.

```bash
# Revert the impl commit(s) on the worktree branch
git -C <worktree-path> log --oneline -10
git -C <worktree-path> revert <impl-09-commit-sha>
```

If multiple commits were made (likely — services commit, controllers commit, rate-limit + helper files commit, tests commit):

```bash
git -C <worktree-path> revert --no-commit <sha-1> <sha-2> <sha-3> <sha-4>
git -C <worktree-path> commit -m "revert(comms): roll back Impl 09 — verify endpoints"
```

After revert, the controller `POST :test` routes return 501 again (Impl 03's stub behaviour). The Impl 03 tests still pass because the stub contract (501 + stable error code) is preserved.

**No DB changes.** The rollback does not need to undo any DB writes — `last_verified_at` columns existed since Impl 01 and the rollback simply stops the verify path from updating them. Any rows already updated stay updated; that is fine because (a) the value is informational only and (b) Impl 09 will re-deploy soon.

**No env changes.** Verification credentials live in the tenant config tables that Impl 13 backfills. There is no `.env` value to remove.

**Redis state.** The verify rate-limit buckets (`verify:{tenantId}:{channel}:{YYYYMMDDHH}`) are short-lived (1 hour TTL) and will expire on their own. No cleanup needed.

If the smoke-test rows in the local dev DB are unwanted post-rollback, clean them as in Impl 03's rollback section — `DELETE FROM tenant_email_configs WHERE tenant_id IN (...)`. The verify call did not write any row to a non-credential table, so no other table needs cleaning.

---

## Follow-ups (notes for downstream waves)

- **Impl 11 (frontend Settings UI)** — wires the "Send test message" button on each per-channel page against the now-real endpoints. The button is enabled regardless of `last_verified_at` state; the result panel renders `provider_error` + `troubleshooting_hint` verbatim with no extra translation layer. The 429 case shows a countdown driven by `retry_after_seconds`. The WhatsApp page shows an inline warning when the response is `verification_template_not_approved` and links to the template-list section of the same page.
- **Impl 13 (tenant backfill)** — must seed the `comms.verify` row for each tenant in `whatsapp_templates` AND submit it to Twilio so it lands in `approved` state. If Impl 13 stops short of submission (e.g. Twilio sandbox doesn't auto-approve), the WhatsApp verify will continue returning `verification_template_not_approved` until manual approval. Document this in the Impl 13 spec.
- **Impl 14 (architecture docs)** — adds the three verify routes to `feature-map.md` (under `configuration/communications`), adds an entry to `danger-zones.md` ("verification dispatches DO count against provider quotas — Resend / Twilio bill these"), and adds the `(tenant_email_config|tenant_sms_config|tenant_whatsapp_config, verify)` triple to the audit-log action catalog if one exists.
- **Impl 10 (operational layer)** — the verify path benefits from the `withCommsContext()` Sentry tagging helper. After Impl 10 ships, wrap the provider-call section of each `verifyConfig` body in `withCommsContext({ tenant_id, channel: 'email', template_key: 'comms.verify' }, async () => { ... })`. Today the call paths still log via the regular NestJS `Logger` (which gets tenant_id from the request scope automatically through the existing tenant context middleware).
- **Provider-error-hint registry growth** — over time the rules map will grow as we see new error codes from real tenants. Keep the rule shape simple (no nesting, no per-tenant overrides) and add a comment naming the source code / Twilio docs for each new rule so future maintainers can verify the mapping is still accurate.
- **Internationalisation** — the troubleshooting hints today are English-only. Once the platform's i18n strategy for backend-emitted strings stabilises, move them to translation files. Until then, the frontend (Impl 11) renders the English hint directly with no further translation.
- **Sentinel string changes** — if the verification copy ever needs to change ("EduPod" rebrand, additional regulatory disclaimer for SMS), update `verification-templates.ts` and re-deploy. Do NOT migrate to a DB-driven model unless the platform actually needs per-tenant verification copy (we do not).

---

## Key invariants this impl establishes

1. **Verification dispatches NEVER consume the user-facing notification rate limit.** They use a separate `verify:{tenantId}:{channel}:{YYYYMMDDHH}` bucket. Test 6 + 7 enforce the per-tenant / per-channel separation.
2. **Verification dispatches DO count against provider quotas.** Resend and Twilio bill every send including verifies. The architecture accepts this as an unavoidable cost of validating credentials. The 3-per-hour limit caps the bill.
3. **`last_verified_at` is set ONLY on success.** Test 1 + 2 enforce this. Speculative or "we tried" timestamps are forbidden.
4. **Recipient addresses in audit logs and response bodies are masked.** Test 13 + the audit-log assertion enforce this. The original input is in memory only for the duration of the request.
5. **Provider errors surface verbatim.** The hint mapper layers ON TOP of the verbatim error — it does not replace it. Test 9 enforces unknown errors return `null` hints rather than synthesised friendly fallbacks.
6. **Rate-limit response includes `retry_after_seconds` for client-side backoff.** Test 6 enforces. Impl 11's frontend countdown depends on this.
7. **WhatsApp verification requires the `comms.verify` template approved.** Test 5 enforces — there is no Twilio-only bypass. Free-form WhatsApp verifies are forbidden.
8. **Domain verification is NOT a precondition for email verify.** Test 12 enforces. Verification is precisely how a tenant learns their domain isn't yet verified.
9. **The Zod pipe runs before the rate-limit check, which runs before the provider call.** This ordering means malformed payloads return 400 (cheap), rate-limited tenants return 429 (Redis-cheap), and only valid + within-quota requests pay the provider-call cost. The controller code makes this explicit by ordering: Zod pipe (decorator) → rate-limit check → service call.
10. **The audit-log entry is written by the global interceptor, not the service.** Test 11 + the architecture invariants test from Impl 03 enforce this — the service must NEVER call `AuditLogService.write()` directly per `.claude/rules/backend.md`.
