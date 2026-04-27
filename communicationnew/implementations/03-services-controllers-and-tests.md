# Implementation 03 — Zod schemas + 3 services + 3 controllers + comprehensive tests

> **Wave:** 2
> **Depends on:** 01 (schema + RLS), 02 (permission constants + RBAC backfill)
> **Restart target:** API only (no migration in this impl, no worker job changes)
> **Deployment:** Worktree commit only — NO CI, NO PRODUCTION (per IMPLEMENTATION_LOG Rule 5)

---

## Goal

Build the API surface for the three new tenant credential tables that Impl 01 created (`tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`). This is the single load-bearing impl of Wave 2: every Wave 3 piece (provider refactor, worker parity, webhooks, deliverability, WhatsApp templates, verify endpoints, observability) consumes the services this impl ships.

The three services mirror `StripeConfigService` exactly. They expose CRUD + an internal-only `getDecryptedConfig` (for the dispatch layer to consume in Impl 04) + a `verifyConfig` STUB that Impl 09 fills in. Three thin controllers expose `GET / PUT / DELETE / POST :test` routes, all guarded by `configuration.communications.manage`. Every mutation runs inside `createRlsClient(...).$transaction()` so RLS is enforced at the DB layer, and every mutation publishes a placeholder cache-bus event that Impl 04 wires to real Redis pub/sub.

Plaintext credentials never leave the service — they are encrypted before persistence, decrypted only inside `getDecryptedConfig` (which has no controller path), and only ever returned masked to clients. Comprehensive tests cover the encryption round-trip, the masking contract, the RLS leakage barrier, the permission-denial behaviour for every endpoint, the validation surface, the audit-logging hook, and the architectural invariant that no controller exposes the decrypted reader.

The three credential services share enough mock plumbing that splitting them across implementations would create more friction than parallelism saves — per PLAN.md §6, Wave 2 is a single-impl wave for this reason.

---

## What to change

### 1. Zod schemas — `packages/shared/src/schemas/communication-config.schema.ts`

This is the single source of truth for the upsert and test-send DTOs. Per `.claude/rules/code-quality.md`, every backend DTO is inferred from a Zod schema in `@school/shared`. The three upsert schemas mirror `upsertStripeConfigSchema` in shape (string secrets with prefix-validation `.refine`, plus a webhook secret — which is **required** per the "Resolved Decisions" matrix in `docs/architecture/communication-architecture.md` §5).

```typescript
// packages/shared/src/schemas/communication-config.schema.ts
import { z } from 'zod';

// ─── Email (Resend) ──────────────────────────────────────────────────────────

export const upsertEmailConfigSchema = z.object({
  resend_api_key: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('re_'), {
      message: 'Resend API key must start with "re_"',
    }),
  from_email: z.string().email('A valid sender email address is required'),
  from_name: z.string().max(255).optional(),
  reply_to_email: z.string().email().optional(),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertEmailConfigDto = z.infer<typeof upsertEmailConfigSchema>;

// ─── SMS (Twilio) ────────────────────────────────────────────────────────────

const E164_REGEX = /^\+\d{8,16}$/;

export const upsertSmsConfigSchema = z.object({
  twilio_account_sid: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('AC'), {
      message: 'Twilio Account SID must start with "AC"',
    }),
  twilio_auth_token: z.string().min(1, 'Twilio auth token is required'),
  twilio_from_number: z
    .string()
    .regex(E164_REGEX, 'Sender number must be E.164 format (e.g. +14155551234)'),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertSmsConfigDto = z.infer<typeof upsertSmsConfigSchema>;

// ─── WhatsApp (Twilio Business) ──────────────────────────────────────────────

export const upsertWhatsAppConfigSchema = z.object({
  twilio_account_sid: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('AC'), {
      message: 'Twilio Account SID must start with "AC"',
    }),
  twilio_auth_token: z.string().min(1, 'Twilio auth token is required'),
  twilio_whatsapp_from_number: z
    .string()
    .regex(E164_REGEX, 'WhatsApp sender must be E.164 format (e.g. +14155551234)'),
  business_profile_id: z.string().max(255).optional(),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertWhatsAppConfigDto = z.infer<typeof upsertWhatsAppConfigSchema>;

// ─── Verification / test-send DTOs (used by Impl 09 wiring) ───────────────────

export const testEmailSchema = z.object({
  recipient_email: z.string().email(),
});
export type TestEmailDto = z.infer<typeof testEmailSchema>;

export const testSmsSchema = z.object({
  recipient_phone: z.string().regex(E164_REGEX, 'E.164 phone number required'),
});
export type TestSmsDto = z.infer<typeof testSmsSchema>;

export const testWhatsAppSchema = z.object({
  recipient_phone: z.string().regex(E164_REGEX, 'E.164 phone number required'),
  // Required because outside a 24h service window only approved templates are allowed.
  template_key: z.string().min(1, 'template_key is required for WhatsApp test sends'),
});
export type TestWhatsAppDto = z.infer<typeof testWhatsAppSchema>;
```

**Barrel export.** Add `export * from './schemas/communication-config.schema';` to `packages/shared/src/index.ts` (immediately below the existing `stripe-config.schema` line — these schemas live in the root barrel, not a subpath module, because they are kernel-level credential primitives consumed by API + worker + frontend; other configuration schemas live there too).

### 2. Masked-config types — `packages/shared/src/types/communication-config.ts`

The three `MaskedXConfig` shapes are what every controller returns. They never carry plaintext — only the last-4 mask for sensitive fields, plus the non-sensitive metadata.

```typescript
// packages/shared/src/types/communication-config.ts

export interface MaskedEmailConfig {
  id: string;
  tenant_id: string;
  // Sensitive — masked
  resend_api_key_mask: string; // '••••' + last4
  webhook_secret_mask: string;
  // Non-sensitive — returned in full
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MaskedSmsConfig {
  id: string;
  tenant_id: string;
  // Sensitive — masked
  twilio_account_sid_mask: string;
  twilio_auth_token_mask: string;
  webhook_secret_mask: string;
  // Non-sensitive
  twilio_from_number: string;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MaskedWhatsAppConfig {
  id: string;
  tenant_id: string;
  // Sensitive
  twilio_account_sid_mask: string;
  twilio_auth_token_mask: string;
  webhook_secret_mask: string;
  // Non-sensitive
  twilio_whatsapp_from_number: string;
  business_profile_id: string | null;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// Internal-only — never surfaced via controller.
// Consumed by NotificationDispatchService in Impl 04.
export interface DecryptedEmailConfig {
  id: string;
  tenant_id: string;
  resend_api_key: string;
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}

export interface DecryptedSmsConfig {
  id: string;
  tenant_id: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_number: string;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}

export interface DecryptedWhatsAppConfig {
  id: string;
  tenant_id: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_whatsapp_from_number: string;
  business_profile_id: string | null;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}
```

**Barrel export.** Add `export * from './types/communication-config';` to `packages/shared/src/index.ts` (in the Types block, alphabetically below `tenant-config`).

### 3. Cache-bus stub — `apps/api/src/modules/configuration/comms-cache-bus.stub.ts`

Impl 04 replaces this with the real Redis pub/sub implementation. The stub provides the same method shape so the three services can DI it now and Impl 04 can swap the provider without touching service code.

```typescript
// apps/api/src/modules/configuration/comms-cache-bus.stub.ts
import { Injectable, Logger } from '@nestjs/common';

/**
 * STUB — Impl 04 wires this to Redis pub/sub on channel `comms:config-changed`.
 *
 * The contract is: every credential mutation (insert/update/delete) MUST publish
 * via this service so the per-tenant client cache (Impl 04) is invalidated across
 * API and worker processes.
 *
 * Today this is a no-op logger. After Impl 04 replaces the implementation, the
 * service interface stays identical — callers do not change.
 */
export type CommsChannel = 'email' | 'sms' | 'whatsapp';

export interface CommsCacheBus {
  publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void>;
}

export const COMMS_CACHE_BUS = Symbol('COMMS_CACHE_BUS');

@Injectable()
export class CommsCacheBusStub implements CommsCacheBus {
  private readonly logger = new Logger(CommsCacheBusStub.name);

  async publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void> {
    // Impl 04 will replace this with a real Redis publish.
    // Logging here is deliberate — gives visibility while the stub is in place.
    this.logger.debug(
      `[stub] would publish comms:config-changed { tenant_id: ${tenantId}, channel: ${channel} }`,
    );
  }
}
```

The `COMMS_CACHE_BUS` symbol is the DI token. Services inject it as `@Inject(COMMS_CACHE_BUS) private readonly cacheBus: CommsCacheBus`. When Impl 04 ships its real `CommsCacheBusService`, the module provider list flips the `useClass` value and the symbol stays — zero changes in consumers.

### 4. Service — `apps/api/src/modules/configuration/email-config.service.ts`

```typescript
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { DecryptedEmailConfig, MaskedEmailConfig, UpsertEmailConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';

@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger(EmailConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(COMMS_CACHE_BUS) private readonly cacheBus: CommsCacheBus,
  ) {}

  // ─── Public read ─────────────────────────────────────────────────────────
  async getConfig(tenantId: string): Promise<MaskedEmailConfig> {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'EMAIL_CONFIG_NOT_FOUND',
        message: 'Email configuration not found for this tenant',
      });
    }
    return this.toMasked(config);
  }

  // ─── Public write — wraps in RLS transaction + publishes invalidation ────
  async upsertConfig(
    tenantId: string,
    userId: string,
    dto: UpsertEmailConfigDto,
  ): Promise<MaskedEmailConfig> {
    const { encrypted: apiKeyEncrypted, keyRef } = this.encryption.encrypt(dto.resend_api_key);
    const { encrypted: webhookSecretEncrypted } = this.encryption.encrypt(dto.webhook_secret);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const persisted = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantEmailConfig.upsert({
        where: { tenant_id: tenantId },
        update: {
          resend_api_key_encrypted: apiKeyEncrypted,
          from_email: dto.from_email,
          from_name: dto.from_name ?? null,
          reply_to_email: dto.reply_to_email ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          key_last_rotated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          resend_api_key_encrypted: apiKeyEncrypted,
          from_email: dto.from_email,
          from_name: dto.from_name ?? null,
          reply_to_email: dto.reply_to_email ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          is_enabled: true,
          created_by_user_id: userId,
        },
      });
    });

    // Cache invalidation — every mutation publishes. Impl 04 wires this to Redis.
    await this.cacheBus.publishConfigChanged(tenantId, 'email');

    // Return masked using the freshly-known plaintext (avoids extra decrypt round-trip)
    return this.composeMaskedFromDto(persisted, dto);
  }

  // ─── Public delete ───────────────────────────────────────────────────────
  async deleteConfig(tenantId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EMAIL_CONFIG_NOT_FOUND',
        message: 'Email configuration not found for this tenant',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantEmailConfig.delete({ where: { id: existing.id } });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'email');
    return { id: existing.id };
  }

  // ─── INTERNAL ONLY — consumed by NotificationDispatchService (Impl 04) ───
  // Never exposed via controller. Never logged. Never returned in errors.
  async getDecryptedConfig(tenantId: string): Promise<DecryptedEmailConfig | null> {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) return null;

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      resend_api_key: this.encryption.decrypt(
        config.resend_api_key_encrypted,
        config.encryption_key_ref,
      ),
      from_email: config.from_email,
      from_name: config.from_name,
      reply_to_email: config.reply_to_email,
      webhook_secret: this.encryption.decrypt(
        config.webhook_secret_encrypted,
        config.encryption_key_ref,
      ),
      is_enabled: config.is_enabled,
      encryption_key_ref: config.encryption_key_ref,
    };
  }

  // ─── STUB — Impl 09 wires real provider verification ─────────────────────
  async verifyConfig(_tenantId: string, _recipient: string): Promise<never> {
    // Implemented in Impl 09 — sends a real Resend message, sets last_verified_at.
    throw new NotFoundException({
      code: 'EMAIL_VERIFY_NOT_IMPLEMENTED',
      message: 'Email verify endpoint is implemented in Implementation 09',
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────
  private toMasked(row: {
    id: string;
    tenant_id: string;
    resend_api_key_encrypted: string;
    from_email: string;
    from_name: string | null;
    reply_to_email: string | null;
    webhook_secret_encrypted: string;
    encryption_key_ref: string;
    key_last_rotated_at: Date | null;
    is_enabled: boolean;
    last_verified_at: Date | null;
    created_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): MaskedEmailConfig {
    const apiKey = this.encryption.decrypt(row.resend_api_key_encrypted, row.encryption_key_ref);
    const webhookSecret = this.encryption.decrypt(
      row.webhook_secret_encrypted,
      row.encryption_key_ref,
    );
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      resend_api_key_mask: this.encryption.mask(apiKey),
      webhook_secret_mask: this.encryption.mask(webhookSecret),
      from_email: row.from_email,
      from_name: row.from_name,
      reply_to_email: row.reply_to_email,
      encryption_key_ref: row.encryption_key_ref,
      key_last_rotated_at: row.key_last_rotated_at,
      is_enabled: row.is_enabled,
      last_verified_at: row.last_verified_at,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private composeMaskedFromDto(
    row: {
      id: string;
      tenant_id: string;
      encryption_key_ref: string;
      key_last_rotated_at: Date | null;
      is_enabled: boolean;
      last_verified_at: Date | null;
      created_by_user_id: string | null;
      created_at: Date;
      updated_at: Date;
    },
    dto: UpsertEmailConfigDto,
  ): MaskedEmailConfig {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      resend_api_key_mask: this.encryption.mask(dto.resend_api_key),
      webhook_secret_mask: this.encryption.mask(dto.webhook_secret),
      from_email: dto.from_email,
      from_name: dto.from_name ?? null,
      reply_to_email: dto.reply_to_email ?? null,
      encryption_key_ref: row.encryption_key_ref,
      key_last_rotated_at: row.key_last_rotated_at,
      is_enabled: row.is_enabled,
      last_verified_at: row.last_verified_at,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
```

### 5. Services — `sms-config.service.ts` and `whatsapp-config.service.ts`

Identical structure to `EmailConfigService`. Differences are mechanical:

**SMS** — encrypts both `twilio_account_sid` and `twilio_auth_token` (two encrypted fields versus email's one), plus `webhook_secret`. The masked output exposes `twilio_account_sid_mask`, `twilio_auth_token_mask`, `webhook_secret_mask`, and the plaintext `twilio_from_number`. `getDecryptedConfig` returns `DecryptedSmsConfig`. The cache-bus channel arg is `'sms'`. Error code prefix: `SMS_CONFIG_NOT_FOUND`, `SMS_VERIFY_NOT_IMPLEMENTED`.

**WhatsApp** — same as SMS plus the optional `business_profile_id` (not encrypted, returned plaintext) and a different sender-number column (`twilio_whatsapp_from_number`). Error code prefix: `WHATSAPP_CONFIG_NOT_FOUND`, `WHATSAPP_VERIFY_NOT_IMPLEMENTED`. Cache-bus channel: `'whatsapp'`.

The Prisma model name for the SMS row is `tenantSmsConfig`; for WhatsApp it is `tenantWhatsappConfig` (note: lowercase `pp` per Prisma's casing of `whatsapp` — the executing session must verify the exact accessor that Prisma generates from Impl 01's `@@map("tenant_whatsapp_configs")` model and use that). Always `findUnique({ where: { tenant_id } })` — every credential table has `tenant_id @unique`.

### 6. Controllers — three of them

All three follow the same pattern: thin wrapper over the service, guard stack `[AuthGuard, PermissionGuard]`, single `@RequiresPermission('configuration.communications.manage')` decorator at class level (since every method requires the same permission). Test-send routes return **501 Not Implemented** in this impl — Impl 09 wires real provider sends.

```typescript
// apps/api/src/modules/configuration/email-config.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { testEmailSchema, upsertEmailConfigSchema } from '@school/shared';
import type { JwtPayload, TenantContext, TestEmailDto, UpsertEmailConfigDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { EmailConfigService } from './email-config.service';

@Controller('v1/email-config')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('configuration.communications.manage')
export class EmailConfigController {
  constructor(private readonly emailConfigService: EmailConfigService) {}

  // GET /v1/email-config
  @Get()
  async getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.emailConfigService.getConfig(tenant.tenant_id);
  }

  // PUT /v1/email-config
  @Put()
  async upsertConfig(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(upsertEmailConfigSchema)) dto: UpsertEmailConfigDto,
  ) {
    return this.emailConfigService.upsertConfig(tenant.tenant_id, user.sub, dto);
  }

  // DELETE /v1/email-config
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteConfig(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.emailConfigService.deleteConfig(tenant.tenant_id, user.sub);
  }

  // POST /v1/email-config/test
  // STUB — Impl 09 wires real provider verification.
  @Post('test')
  async test(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(testEmailSchema)) _dto: TestEmailDto,
  ): Promise<never> {
    throw new NotImplementedException({
      code: 'EMAIL_TEST_NOT_IMPLEMENTED',
      message:
        'Email test send is implemented in Implementation 09. The schema validates today; the provider call lands in Impl 09.',
    });
  }
}
```

The SMS controller is identical except routes mount under `v1/sms-config`, body schema is `upsertSmsConfigSchema`, test schema is `testSmsSchema`. Same for WhatsApp under `v1/whatsapp-config` with `upsertWhatsAppConfigSchema` and `testWhatsAppSchema`. The class-level `@RequiresPermission` is identical across all three controllers — the same permission gates all three resources.

**Why class-level permission instead of per-method.** All four routes (GET/PUT/DELETE/POST :test) require `configuration.communications.manage`. There is no `configuration.communications.view`-only path here — the `view` permission exists in Impl 02's seed for forward compatibility, but every route in this controller mutates or exposes mask-sensitive metadata, so the higher permission gates everything. (If Wave 4 introduces a read-only platform admin view, it routes through a separate controller.)

### 7. Module wiring — `apps/api/src/modules/configuration/configuration.module.ts`

This file is on the shared-file claim list (Rule 17). Before editing, append the Wave-2 ownership claim to `IMPLEMENTATION_LOG.md` §5. The file already provides `EncryptionService` (used by Stripe). This impl adds the three new services + three new controllers + the cache-bus stub provider, and exports the three credential services so the dispatch layer (Impl 04) can DI them.

```typescript
import { Module } from '@nestjs/common';

import { S3Module } from '../s3/s3.module';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { CommsCacheBusStub, COMMS_CACHE_BUS } from './comms-cache-bus.stub';
import { ConfigurationReadFacade } from './configuration-read.facade';
import { EmailConfigController } from './email-config.controller';
import { EmailConfigService } from './email-config.service';
import { EncryptionService } from './encryption.service';
import { KeyRotationService } from './key-rotation.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SmsConfigController } from './sms-config.controller';
import { SmsConfigService } from './sms-config.service';
import { StripeConfigController } from './stripe-config.controller';
import { StripeConfigService } from './stripe-config.service';
import { WhatsAppConfigController } from './whatsapp-config.controller';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Module({
  imports: [S3Module],
  controllers: [
    BrandingController,
    SettingsController,
    StripeConfigController,
    NotificationSettingsController,
    EmailConfigController,
    SmsConfigController,
    WhatsAppConfigController,
  ],
  providers: [
    BrandingService,
    SettingsService,
    StripeConfigService,
    NotificationSettingsService,
    EncryptionService,
    ConfigurationReadFacade,
    KeyRotationService,
    EmailConfigService,
    SmsConfigService,
    WhatsAppConfigService,
    // Cache-bus stub — Impl 04 swaps `useClass` for a Redis-backed implementation.
    { provide: COMMS_CACHE_BUS, useClass: CommsCacheBusStub },
  ],
  exports: [
    EncryptionService,
    SettingsService,
    ConfigurationReadFacade,
    EmailConfigService,
    SmsConfigService,
    WhatsAppConfigService,
    // Export the cache-bus token so Impl 04's per-tenant client cache can subscribe.
    COMMS_CACHE_BUS,
  ],
})
export class ConfigurationModule {}
```

`ConfigurationModule` is already in `AppModule.imports` (Stripe lives there today) — no change to `app.module.ts` is needed. **Verify** with the AppModule DI smoke (Rule 6) before committing.

---

## Tests

Per `.claude/rules/testing.md`, every API endpoint needs at least one happy-path test and one permission-denied test, every tenant-scoped table needs an RLS leakage test, and every calculation/state needs unit tests. Co-located `.spec.ts` files for unit/service tests; the integration tests live under `apps/api/test/` next to the existing `stripe-config.e2e-spec.ts` reference.

### Test file inventory

```
apps/api/src/modules/configuration/
├── email-config.service.spec.ts        [NEW]
├── sms-config.service.spec.ts          [NEW]
├── whatsapp-config.service.spec.ts     [NEW]
├── email-config.controller.spec.ts     [NEW]
├── sms-config.controller.spec.ts       [NEW]
├── whatsapp-config.controller.spec.ts  [NEW]
└── comms-cache-bus.stub.spec.ts        [NEW]

apps/api/test/
├── email-config.e2e-spec.ts            [NEW]
├── sms-config.e2e-spec.ts              [NEW]
├── whatsapp-config.e2e-spec.ts         [NEW]
└── communication-config-rls.e2e-spec.ts [NEW — single file covers all 3 tables]
```

### Test 1 — Encryption round-trip (per service)

```typescript
// email-config.service.spec.ts (excerpt)
describe('EmailConfigService — encryption round-trip', () => {
  it('encrypts plaintext on upsert and returns it intact via getDecryptedConfig', async () => {
    const plaintextApiKey = 're_test_abc123XYZ';
    const plaintextWebhook = 'whsec_super_secret_123';

    // The real EncryptionService is used (not mocked) so we exercise actual AES-256-GCM.
    // ENCRYPTION_KEY_V1 is set in the jest setup-env.ts to a 64-hex test key.
    const encryption = new EncryptionService(testConfigService);
    const cacheBus = { publishConfigChanged: jest.fn().mockResolvedValue(undefined) };
    const persistedRow = {
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      resend_api_key_encrypted: '', // populated by upsert mock
      from_email: 'from@example.com',
      from_name: null,
      reply_to_email: null,
      webhook_secret_encrypted: '',
      encryption_key_ref: 'v1',
      key_last_rotated_at: new Date(),
      is_enabled: true,
      last_verified_at: null,
      created_by_user_id: USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Capture what gets persisted
    let captured: {
      resend_api_key_encrypted: string;
      webhook_secret_encrypted: string;
      encryption_key_ref: string;
    } | null = null;
    const mockPrisma = buildMockPrisma();
    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest.fn(async (fn) =>
        fn({
          tenantEmailConfig: {
            upsert: jest.fn(async ({ create }: { create: typeof persistedRow }) => {
              captured = {
                resend_api_key_encrypted: create.resend_api_key_encrypted,
                webhook_secret_encrypted: create.webhook_secret_encrypted,
                encryption_key_ref: create.encryption_key_ref,
              };
              return { ...persistedRow, ...captured };
            }),
          },
        }),
      ),
    });

    const service = new EmailConfigService(
      mockPrisma as unknown as PrismaService,
      encryption,
      cacheBus,
    );
    await service.upsertConfig(TENANT_ID, USER_ID, {
      resend_api_key: plaintextApiKey,
      from_email: 'from@example.com',
      webhook_secret: plaintextWebhook,
    });

    expect(captured).not.toBeNull();
    // Captured ciphertext must NOT contain the plaintext anywhere
    expect(captured!.resend_api_key_encrypted).not.toContain(plaintextApiKey);
    expect(captured!.webhook_secret_encrypted).not.toContain(plaintextWebhook);

    // Now wire the read path: getDecryptedConfig must return the original plaintext
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue({
      ...persistedRow,
      resend_api_key_encrypted: captured!.resend_api_key_encrypted,
      webhook_secret_encrypted: captured!.webhook_secret_encrypted,
    });
    const decrypted = await service.getDecryptedConfig(TENANT_ID);
    expect(decrypted!.resend_api_key).toBe(plaintextApiKey);
    expect(decrypted!.webhook_secret).toBe(plaintextWebhook);
  });
});
```

The same shape applies to the SMS and WhatsApp services — encrypt both `twilio_account_sid` and `twilio_auth_token` (plus `webhook_secret`) and verify all three round-trip.

### Test 2 — Masking contract

For each service, prove that `getConfig` returns the `_mask` fields and never the raw plaintext:

```typescript
it('getConfig returns masked sensitive fields and never raw plaintext', async () => {
  // Mock prisma to return a row with known ciphertext.
  // Mock encryption.decrypt to return KNOWN plaintext for assertion.
  mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
  mockEncryption.decrypt.mockImplementation((ciphertext: string) => {
    if (ciphertext === mockDbRow.resend_api_key_encrypted)
      return 're_test_known_plaintext_lastABCD';
    if (ciphertext === mockDbRow.webhook_secret_encrypted) return 'whsec_known_plaintext_lastEFGH';
    throw new Error('unexpected ciphertext');
  });
  mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);

  const result = await service.getConfig(TENANT_ID);

  // Mask field is present and contains only last-4
  expect(result.resend_api_key_mask).toBe('••••ABCD');
  expect(result.webhook_secret_mask).toBe('••••EFGH');

  // No field in the response carries the plaintext
  const serialised = JSON.stringify(result);
  expect(serialised).not.toContain('re_test_known_plaintext_lastABCD');
  expect(serialised).not.toContain('whsec_known_plaintext_lastEFGH');

  // No field named `*_encrypted` leaks through either
  expect(serialised).not.toContain('_encrypted');
});
```

### Test 3 — RLS leakage (the most important guarantee)

This lives in `apps/api/test/communication-config-rls.e2e-spec.ts`. It uses two real tenants with real RLS-enforcing transactions (the tests run against a real Postgres that has the policies from Impl 01 applied). Per `.claude/rules/testing.md`, the structure is: write as Tenant A → switch to Tenant B → assert no read, no overwrite.

```typescript
import { PrismaClient } from '@prisma/client';

import { runWithRlsContext } from '../src/common/middleware/rls.middleware';

import { createTenantFixture, deleteTenantFixture } from './tenant-fixture.builder';

describe('Communication config RLS isolation (e2e)', () => {
  let prisma: PrismaClient;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    tenantA = await createTenantFixture(prisma);
    tenantB = await createTenantFixture(prisma);
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, tenantA);
    await deleteTenantFixture(prisma, tenantB);
    await prisma.$disconnect();
  });

  describe('tenant_email_configs', () => {
    it('cannot read another tenant rows; cannot overwrite another tenant rows', async () => {
      // 1. Authenticate as Tenant A and write a row
      const aId = await runWithRlsContext(
        prisma,
        { tenant_id: tenantA.tenant_id, user_id: tenantA.ownerUserId },
        async (tx) => {
          const row = await tx.tenantEmailConfig.create({
            data: {
              tenant_id: tenantA.tenant_id,
              resend_api_key_encrypted: 'iv:tag:cipher',
              from_email: 'a@a.test',
              webhook_secret_encrypted: 'iv:tag:cipher',
              encryption_key_ref: 'v1',
              created_by_user_id: tenantA.ownerUserId,
            },
          });
          return row.id;
        },
      );
      expect(aId).toBeDefined();

      // 2. Switch to Tenant B and try to read — must return empty
      const sawRow = await runWithRlsContext(
        prisma,
        { tenant_id: tenantB.tenant_id, user_id: tenantB.ownerUserId },
        async (tx) => tx.tenantEmailConfig.findUnique({ where: { id: aId } }),
      );
      expect(sawRow).toBeNull();

      // 3. Tenant B findMany — should be empty (B has no rows; A's row must not leak)
      const bRows = await runWithRlsContext(
        prisma,
        { tenant_id: tenantB.tenant_id, user_id: tenantB.ownerUserId },
        async (tx) => tx.tenantEmailConfig.findMany(),
      );
      expect(bRows).toEqual([]);

      // 4. Tenant B tries to update Tenant A's row by id — RLS WITH CHECK clause must block
      const update = runWithRlsContext(
        prisma,
        { tenant_id: tenantB.tenant_id, user_id: tenantB.ownerUserId },
        async (tx) =>
          tx.tenantEmailConfig.update({
            where: { id: aId },
            data: { from_email: 'hijacked@b.test' },
          }),
      );
      // Prisma raises P2025 ("Record not found") because RLS hides the row.
      // EITHER P2025 is acceptable, OR a generic Postgres permission error.
      await expect(update).rejects.toBeDefined();

      // 5. Confirm the row is unchanged when Tenant A reads it back
      const reread = await runWithRlsContext(
        prisma,
        { tenant_id: tenantA.tenant_id, user_id: tenantA.ownerUserId },
        async (tx) => tx.tenantEmailConfig.findUnique({ where: { id: aId } }),
      );
      expect(reread!.from_email).toBe('a@a.test');
    });
  });

  describe('tenant_sms_configs', () => {
    it('cannot read or overwrite across tenants', async () => {
      // ... same shape, against tenantSmsConfig
    });
  });

  describe('tenant_whatsapp_configs', () => {
    it('cannot read or overwrite across tenants', async () => {
      // ... same shape, against tenantWhatsappConfig
    });
  });
});
```

The RLS test must be a **real-database integration test**, not a mock-based unit test. Mock-based tests cannot prove RLS works — only the live Postgres can. The CI integration job in `.github/workflows/ci.yml` (Postgres on 5553) already has this surface; locally the dev DB serves the same role.

### Test 4 — Permission denial (one per controller endpoint)

For each of the three controllers, every endpoint (GET, PUT, DELETE, POST :test) must reject a user lacking `configuration.communications.manage`. The reference is `stripe-config.e2e-spec.ts:87-95`. Pattern:

```typescript
describe('Email config — permission gating', () => {
  it('GET /v1/email-config rejects user without configuration.communications.manage', async () => {
    await authGet(app, '/api/v1/email-config', teacherToken, fixture.domainName).expect(403);
  });

  it('PUT /v1/email-config rejects user without permission', async () => {
    await authPut(
      app,
      '/api/v1/email-config',
      teacherToken,
      VALID_EMAIL_BODY,
      fixture.domainName,
    ).expect(403);
  });

  it('DELETE /v1/email-config rejects user without permission', async () => {
    await authDelete(app, '/api/v1/email-config', teacherToken, fixture.domainName).expect(403);
  });

  it('POST /v1/email-config/test rejects user without permission', async () => {
    await authPost(
      app,
      '/api/v1/email-config/test',
      teacherToken,
      { recipient_email: 'x@y.test' },
      fixture.domainName,
    ).expect(403);
  });
});
```

`teacherToken` is the helper-shipped fixture for a user without admin permissions. Repeat across the three controllers — that's 12 permission-denial tests in total.

### Test 5 — Validation surface

For each PUT endpoint, post invalid payloads and assert 400 with Zod error details. Sample payloads to drop:

- Email: `{ resend_api_key: 'wrong_prefix_123', from_email: 'not-an-email', webhook_secret: 'short' }` → 400 with errors on `resend_api_key`, `from_email`, `webhook_secret`.
- SMS: `{ twilio_account_sid: 'wrong', twilio_auth_token: '', twilio_from_number: '12345' }` → 400.
- WhatsApp: same as SMS plus invalid `twilio_whatsapp_from_number`.
- Each test endpoint: missing `recipient_email` / `recipient_phone` → 400.
- WhatsApp test endpoint: missing `template_key` → 400 with the exact "template_key is required" message (this is the architecturally enforced 24h-window requirement).

### Test 6 — Internal isolation invariant

A `grep`-based test that the `getDecryptedConfig` method name does NOT appear in any of the three controller files. This is a guard against a future PR accidentally exposing the decrypted reader. Lives in `comms-cache-bus.stub.spec.ts` or a dedicated `architecture-invariants.spec.ts`:

```typescript
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('Architecture invariants — communication credentials', () => {
  const controllerFiles = [
    'email-config.controller.ts',
    'sms-config.controller.ts',
    'whatsapp-config.controller.ts',
  ];

  it.each(controllerFiles)(
    '%s never references getDecryptedConfig (must stay service-internal)',
    async (file) => {
      const path = resolve(__dirname, file);
      const contents = await fs.readFile(path, 'utf8');
      expect(contents).not.toMatch(/getDecryptedConfig/);
    },
  );

  it.each(controllerFiles)('%s never references "Decrypted" type names', async (file) => {
    const path = resolve(__dirname, file);
    const contents = await fs.readFile(path, 'utf8');
    expect(contents).not.toMatch(/Decrypted(Email|Sms|WhatsApp)Config/);
  });
});
```

This test enforces the invariant that future contributors cannot accidentally expose the decrypted reader through a controller.

### Test 7 — Audit logging hook

The existing `AuditLogInterceptor` (registered globally in `AppModule`) wraps every mutation in `audit_log`. The unit test verifies the controllers do NOT bypass it — they use `@Put` / `@Delete` / `@Post` decorators (which the interceptor scans), they don't write `audit_log` directly, and the service does not call `auditLogService.write()` from inside its body (per `.claude/rules/backend.md`: "Do NOT manually write audit logs — the AuditLogInterceptor handles this on mutations"). The test confirms by mocking the audit-log service and asserting the service-under-test never calls it directly — interceptor coverage is verified separately in the existing audit-log e2e suite.

```typescript
it('upsertConfig does not call AuditLogService directly (interceptor handles it)', async () => {
  const auditMock = { write: jest.fn() };
  // Construct the service; pass through normal upsert
  await service.upsertConfig(TENANT_ID, USER_ID, validDto);
  expect(auditMock.write).not.toHaveBeenCalled();
});
```

The actual end-to-end check that audit rows are written lives in the existing `audit-log.e2e-spec.ts` — Impl 14's E2E walkthrough re-validates that mutating the email config writes an `audit_log` row.

### Test 8 — Stub cache-bus invocation

Each service's mutation tests assert `cacheBus.publishConfigChanged` is called with the right channel:

```typescript
it('upsertConfig publishes cache-bus event with correct channel', async () => {
  await service.upsertConfig(TENANT_ID, USER_ID, validDto);
  expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'email');
});

it('deleteConfig publishes cache-bus event with correct channel', async () => {
  mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
  await service.deleteConfig(TENANT_ID, USER_ID);
  expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'email');
});
```

This is the contract Impl 04 relies on: the bus is called on every mutation. If a future change breaks this, the test fails before Impl 04's behaviour silently regresses.

### Test 9 — STUB endpoints behave consistently

```typescript
it('POST /v1/email-config/test returns 501 with EMAIL_TEST_NOT_IMPLEMENTED', async () => {
  const res = await authPost(
    app,
    '/api/v1/email-config/test',
    ownerToken,
    { recipient_email: 'x@y.test' },
    fixture.domainName,
  ).expect(501);
  expect(res.body.error?.code ?? res.body.code).toBe('EMAIL_TEST_NOT_IMPLEMENTED');
});

it('POST /v1/email-config/test still validates the body with Zod (400 before 501)', async () => {
  // Missing recipient_email
  await authPost(app, '/api/v1/email-config/test', ownerToken, {}, fixture.domainName).expect(400);
});
```

The validation pipe runs before the controller body, so an invalid payload gets a 400 even though the route returns 501 for valid payloads. This is correct behaviour — Impl 09 inherits the validated input and only needs to add the provider call.

### Test 10 — Inline mock helper

If `buildMockPrisma()` does not yet exist in this module's test scope, define it inline at the top of each spec file. The shape:

```typescript
function buildMockPrisma() {
  return {
    tenantEmailConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    tenantSmsConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    tenantWhatsappConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
  };
}
```

The `createRlsClient` mock returns `{ $transaction: (fn) => fn(mockPrisma) }` — the same pattern `settings.service.spec.ts:85-87` uses today.

---

## Verification (local dev server)

Per IMPLEMENTATION_LOG Rule 27a, every implementation that produces a runnable surface must be exercised end-to-end on a local dev server before flipping to `completed`. This is a backend-only impl (no UI yet — that's Impl 11), so verification is via `curl` against `http://localhost:3001/api/v1/...` as a seeded user.

### Pre-flight

```bash
pnpm --filter @school/api type-check
pnpm --filter @school/api lint
pnpm --filter @school/shared test --runTestsByPath schemas/communication-config.schema.spec.ts
pnpm --filter @school/api test --runInBand --testPathPattern '(email|sms|whatsapp)-config'

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

### Live dev server

```bash
# Start API
pnpm --filter @school/api dev

# In another shell — login as owner@nhqs.test
TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!","domain":"nhqs.local"}' \
  | jq -r '.data.accessToken')
```

Curl smoke for each channel (email shown; repeat for sms / whatsapp):

```bash
# 1. GET before any config exists — expect 404 with EMAIL_CONFIG_NOT_FOUND
curl -i -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/email-config

# 2. PUT a valid config — expect 200 with masked response
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "resend_api_key": "re_test_smoke_lastABCD",
    "from_email": "smoke@nhqs.local",
    "from_name": "NHQS Smoke",
    "webhook_secret": "whsec_smoke_lastEFGH"
  }' \
  http://localhost:3001/api/v1/email-config

# Expected: response.data.resend_api_key_mask is "••••ABCD"
# Expected: response.data.webhook_secret_mask is "••••EFGH"
# Expected: response.data does NOT contain "re_test_smoke_lastABCD" anywhere

# 3. GET — expect 200 with same mask, no plaintext anywhere
curl -i -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/email-config

# 4. PUT invalid — expect 400 with Zod errors
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"resend_api_key":"sk_wrong_prefix","from_email":"not-email","webhook_secret":"x"}' \
  http://localhost:3001/api/v1/email-config

# 5. POST :test — expect 501 with EMAIL_TEST_NOT_IMPLEMENTED
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_email":"x@y.test"}' \
  http://localhost:3001/api/v1/email-config/test

# 6. DELETE — expect 200 with { id: ... }
curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/email-config

# 7. GET after delete — expect 404 again
curl -i -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/email-config
```

Permission denial smoke — login as a teacher (no `configuration.communications.manage`) and confirm 403 on every route:

```bash
TEACHER_TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher@nhqs.test","password":"Password123!","domain":"nhqs.local"}' \
  | jq -r '.data.accessToken')

# All four routes return 403
curl -o /dev/null -s -w "%{http_code}\n" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  http://localhost:3001/api/v1/email-config                # 403
curl -o /dev/null -s -w "%{http_code}\n" -X PUT \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H 'Content-Type: application/json' \
  -d '{}' http://localhost:3001/api/v1/email-config        # 403
curl -o /dev/null -s -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  http://localhost:3001/api/v1/email-config                # 403
curl -o /dev/null -s -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $TEACHER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"recipient_email":"x@y.test"}' \
  http://localhost:3001/api/v1/email-config/test           # 403
```

Repeat all of the above for `sms-config` (with E.164 number bodies) and `whatsapp-config` (with the `template_key` field on test). Spot-check the cache-bus stub log line in the API stdout — every PUT and DELETE should emit `[stub] would publish comms:config-changed { tenant_id: ..., channel: email/sms/whatsapp }`.

### Database spot-check

```sql
-- After PUT, the row should exist and ciphertext should NOT contain the plaintext
SELECT id, tenant_id, encryption_key_ref, key_last_rotated_at, is_enabled,
       LEFT(resend_api_key_encrypted, 32) AS api_key_cipher_head,
       LEFT(webhook_secret_encrypted, 32) AS webhook_cipher_head
FROM tenant_email_configs
WHERE tenant_id = '<nhqs-tenant-id>';

-- The cipher heads must be hex/colons only, no `re_` prefix visible.
-- encryption_key_ref should be 'v1' (or whatever the local ENCRYPTION_CURRENT_VERSION is).

-- Same for sms and whatsapp:
SELECT id, encryption_key_ref FROM tenant_sms_configs WHERE tenant_id = '<nhqs-tenant-id>';
SELECT id, encryption_key_ref FROM tenant_whatsapp_configs WHERE tenant_id = '<nhqs-tenant-id>';
```

After verification, **clean up the smoke-test rows** so the local dev DB isn't polluted with bogus ciphertext that Impl 13's backfill will later re-create with proper test credentials.

### Local verification block to record in §5 of IMPLEMENTATION_LOG

```
- **Local verification:**
  - Endpoints covered: GET/PUT/DELETE /v1/email-config; GET/PUT/DELETE /v1/sms-config;
    GET/PUT/DELETE /v1/whatsapp-config; POST :test on all three (501 stub);
    permission denial confirmed on 12 routes (3 controllers × 4 methods).
  - Encryption verified: SQL spot-check on all three tables shows ciphertext (no plaintext leak).
  - Cache-bus stub logged on every mutation (one log line per PUT/DELETE).
  - DI smoke: AppModule.compile() returned OK.
  - Test suites passing: email-config.service.spec.ts (X tests),
    sms-config.service.spec.ts (X tests), whatsapp-config.service.spec.ts (X tests),
    communication-config-rls.e2e-spec.ts (3 RLS isolation suites, all green).
  - Console errors observed: none.
  - Run timestamp: <ISO>.
```

---

## Files touched

### New files

```
packages/shared/src/schemas/communication-config.schema.ts            [NEW]
packages/shared/src/types/communication-config.ts                      [NEW]

apps/api/src/modules/configuration/comms-cache-bus.stub.ts             [NEW]
apps/api/src/modules/configuration/comms-cache-bus.stub.spec.ts        [NEW]

apps/api/src/modules/configuration/email-config.service.ts             [NEW]
apps/api/src/modules/configuration/email-config.service.spec.ts        [NEW]
apps/api/src/modules/configuration/email-config.controller.ts          [NEW]
apps/api/src/modules/configuration/email-config.controller.spec.ts     [NEW]

apps/api/src/modules/configuration/sms-config.service.ts               [NEW]
apps/api/src/modules/configuration/sms-config.service.spec.ts          [NEW]
apps/api/src/modules/configuration/sms-config.controller.ts            [NEW]
apps/api/src/modules/configuration/sms-config.controller.spec.ts       [NEW]

apps/api/src/modules/configuration/whatsapp-config.service.ts          [NEW]
apps/api/src/modules/configuration/whatsapp-config.service.spec.ts     [NEW]
apps/api/src/modules/configuration/whatsapp-config.controller.ts       [NEW]
apps/api/src/modules/configuration/whatsapp-config.controller.spec.ts  [NEW]

apps/api/test/email-config.e2e-spec.ts                                 [NEW]
apps/api/test/sms-config.e2e-spec.ts                                   [NEW]
apps/api/test/whatsapp-config.e2e-spec.ts                              [NEW]
apps/api/test/communication-config-rls.e2e-spec.ts                     [NEW]
```

### Modified files (claim under Rule 17)

```
packages/shared/src/index.ts                                           [+2 export lines]
apps/api/src/modules/configuration/configuration.module.ts             [+3 controllers, +4 providers, +4 exports]
```

Both files are on the shared-file claim list. Add the Wave-2 ownership claim to `IMPLEMENTATION_LOG.md` §5 before opening either file. Keep the diff to these files surgical — do not reorder or restructure unrelated entries.

### Files NOT touched (deliberate)

- `packages/prisma/schema.prisma` — Impl 01 owns this. The three credential tables already exist on this branch.
- `packages/prisma/rls/policies.sql` — Impl 01 owns the RLS policies.
- `apps/api/src/app.module.ts` — `ConfigurationModule` is already imported. No change.
- `apps/worker/src/worker.module.ts` — worker doesn't consume the credential services until Impl 04/05.
- `docs/architecture/*.md` — Impl 14 owns architecture doc updates per Rule 14.

---

## Rollback

Worktree-only commits. Recovery is a single git revert.

```bash
# Revert the impl commit(s) on the worktree branch
git -C <worktree-path> log --oneline -10
git -C <worktree-path> revert <impl-03-commit-sha>
git -C <worktree-path> push origin communications-overhaul   # NOT triggered today (no CI)
```

If multiple commits were made (likely — schemas commit, services commit, tests commit, module-wiring commit):

```bash
git -C <worktree-path> revert --no-commit <sha-1> <sha-2> <sha-3> <sha-4>
git -C <worktree-path> commit -m "revert(comms): roll back Impl 03 — services + controllers + tests"
```

No DB changes in this impl. The schema lives on Wave 1's commit; reverting Impl 03 leaves the tables empty but intact. No env changes. No worker job changes. The cache-bus stub is a no-op so reverting it has zero side effect.

If the smoke-test data remained in the local dev DB (PUT through verification step 2), it stays after rollback — clean it up manually:

```sql
DELETE FROM tenant_email_configs WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%test%');
DELETE FROM tenant_sms_configs   WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%test%');
DELETE FROM tenant_whatsapp_configs WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%test%');
```

---

## Follow-ups (notes for downstream waves)

- **Impl 04 (provider refactor)** — replaces `CommsCacheBusStub` with the real Redis pub/sub `CommsCacheBusService`. The DI token (`COMMS_CACHE_BUS`) and the `publishConfigChanged(tenantId, channel)` signature stay identical — Impl 04 only swaps `useClass`. Impl 04 also adds the per-tenant client cache that consumes `getDecryptedConfig`. The contract this impl ships — that `getDecryptedConfig` returns `null` when no config exists, not a thrown exception — is the assumption Impl 04's dispatch path relies on (it skips with `failure_reason='channel_not_configured'` in the null case rather than crashing).
- **Impl 05 (worker parity)** — the worker process needs the same module wiring. Impl 05 imports `ConfigurationModule` into the worker so the same three services are available there. The worker also subscribes to the cache-bus channel. The export list in `configuration.module.ts` already includes the three services, so Impl 05's import is a one-line change.
- **Impl 06 (webhooks)** — webhook receivers consume `getDecryptedConfig` to look up the tenant's `webhook_secret` for signature verification. The decrypted reader returning `null` for unconfigured tenants is correct here too — Impl 06 returns 404 on unknown-tenant webhook hits without falling back to a platform secret.
- **Impl 09 (verify endpoints)** — fills in the `verifyConfig` STUB and the `POST :test` controller route. Replaces the 501 with a real provider call (Resend `client.emails.send` / Twilio `client.messages.create`) and the rate-limit bucket. The Zod schema for `testWhatsAppSchema` already requires `template_key` because outside-window sends require an approved template — Impl 09 enforces this. The 4 lint/type-check tests for the controller files already cover the route shape; Impl 09 only swaps the body of the test method.
- **Impl 11 (frontend)** — three settings pages consume the `MaskedXConfig` shapes returned by these endpoints. The `_mask` field naming (rather than `_masked` like Stripe uses) is a minor inconsistency with Stripe — call this out in the Impl 11 spec so the frontend knows to read `resend_api_key_mask` not `resend_api_key_masked`. (The newer naming is more consistent with the rest of `MaskedEmailConfig`; the Stripe shape stays as-is to avoid touching that surface.)
- **Impl 13 (tenant backfill)** — seeds 5 tenants × 3 channels via direct service calls (using `EmailConfigService.upsertConfig` etc.) so the encryption + cache-bus + audit-log path is exercised exactly as in production. Impl 13 does NOT bypass the service layer with raw Prisma writes.
- **Impl 14 (docs)** — updates `docs/architecture/feature-map.md` to add the three new endpoints (×3 channels × 4 verbs = 12 routes), `module-blast-radius.md` to record that `configuration` now exports three new services consumed by `communications`, and `danger-zones.md` to add an entry: "tenant credential mutation must publish to `comms:config-changed` — forgetting this means cached clients keep using stale credentials."

---

## Key invariants this impl establishes

1. **`getDecryptedConfig` is service-only.** No controller route exposes it. The architectural-invariant test (Test 6) enforces this. If a future PR adds a controller method that returns plaintext credentials, the test fails.
2. **Plaintext never appears in responses.** Every controller return shape is a `MaskedXConfig`. The masking test (Test 2) asserts no plaintext leaks via JSON serialisation.
3. **Plaintext never appears in logs or errors.** Service methods never `console.log` / `Logger.log` the plaintext or the dto fields. Error messages reference field names only — never values.
4. **Every mutation publishes to the cache bus.** Even though the bus is a stub today, the contract (Test 8) is enforced. Impl 04 inherits a working invariant.
5. **Every write goes through `createRlsClient(...).$transaction()`.** Reads can use raw `prisma.X.findUnique({ where: { tenant_id } })` because the `tenant_id` filter is sufficient when paired with Postgres RLS at the table level. Writes MUST use the RLS transaction so the `WITH CHECK` clause runs.
6. **Test sends are stubs that still validate.** The Zod pipe runs first; an invalid body returns 400. A valid body returns 501 with a stable error code that Impl 09 replaces with real behaviour. This means Impl 11's frontend can already wire the test-send button against the validation surface — it just gets 501 until Impl 09 ships.
7. **Permission gating uses the same constant across all three resources.** `configuration.communications.manage` covers email + SMS + WhatsApp. There is no per-channel permission. (This is intentional — a tenant admin who can configure email can also configure SMS and WhatsApp; splitting them creates onboarding friction with no security gain.)
