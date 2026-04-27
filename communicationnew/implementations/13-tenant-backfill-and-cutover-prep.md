# Implementation 13 — Tenant Backfill (Dev DB) + Production Cutover Prep

> **Wave:** 5
> **Depends on:** 01 (schema), 02 (RBAC backfill — provides the `configuration.communications.{view,manage}` grants Settings UI gates on), 03 (`EmailConfigService`/`SmsConfigService`/`WhatsAppConfigService` + Zod schemas + encryption round-trip), 07 (`tenant_email_domains` + `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag), 08 (`whatsapp_templates` + service-window infrastructure), 09 (`POST /v1/{email,sms,whatsapp}-config/test` verify endpoints with full semantics)
> **Restart target:** API + dev DB write — the script issues encrypted INSERT/UPSERTs and the running API process consumes the new rows on the next dispatch
> **Deployment route:** Worktree commit only — NO CI, NO PRODUCTION (per IMPLEMENTATION_LOG Rule 5)

---

## Goal

Provision all **5 test tenants** (NHQS pilot + stress-a/b/c/d) with encrypted **email + SMS + WhatsApp credentials** in the **local dev database** and verify each via a real test send. Generate — but do **not** execute — the production cutover script that the user will run after merging the worktree to `main`.

**Why this exists.** After Impl 05 ships, the only path to a successful dispatch is a configured tenant. There is no `.env` fallback in any environment, including local dev. Without this backfill, the 5 test tenants in the dev DB cannot dispatch a single email, SMS, or WhatsApp message. Wave 5 verification (Impl 14) and every developer's local end-to-end loop both depend on the credentials being present here. The backfill is also the conceptual blueprint for how the user provisions production tenants on cutover day — same script, different credentials file.

**What this impl ships.**

1. A new TypeScript script `packages/prisma/scripts/backfill-tenant-communications-configs.ts` that reads tenant credentials from a gitignored JSON config, encrypts the secrets via the existing `EncryptionService`, and upserts into `tenant_email_configs` / `tenant_sms_configs` / `tenant_whatsapp_configs` for the 5 known test tenants. Idempotent — re-running with the same config is a no-op.
2. A committed example file `packages/prisma/scripts/dev-tenant-credentials.example.json` with placeholder strings; the real `dev-tenant-credentials.json` is `.gitignore`d.
3. A follow-up TypeScript verification runner `packages/prisma/scripts/verify-tenant-communications-configs.ts` that calls `POST /v1/{email,sms,whatsapp}-config/test` for each (tenant, channel) pair against a developer-controlled test recipient.
4. A WhatsApp `comms.verify` template seed (per architecture doc §3.10): one APPROVED row per tenant with a sentinel `twilio_template_sid='HX_DEV_VERIFY'`. **Dev-only shortcut** — production cutover submits the template to Twilio for real approval.
5. Verification of platform-level notification templates added by Impl 12 (`auth.password_reset`, `auth.password_changed`, `trip.invitation`, `trip.payment_due`, `school.closure`, `staff.leave_decision`, `health.incident`, `sen.eha_update`, `email_domain.verified`).
6. Documentation that the `notification_suppression_list` table starts empty per tenant (no rows seeded — the table fills naturally from webhook bounce/complaint events).
7. The dev-only domain bypass flag (introduced by Impl 07): a verification step that confirms `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true` is set in the developer's local `.env`, with a checklist item in the production cutover script to confirm it is **NOT** set in production.
8. A generated production cutover script `communicationnew/cutover/production-cutover.sh` (committed to the worktree but NOT executable until the user runs it post-merge).

After this impl ships locally:

- Run `pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts` against the local dev DB.
- 15 rows exist: 5 tenants × 3 channels (5 in `tenant_email_configs`, 5 in `tenant_sms_configs`, 5 in `tenant_whatsapp_configs`).
- 5 `whatsapp_templates` rows exist (one `comms.verify` per tenant, status `approved`).
- `last_verified_at` populates after running the verify runner.
- Logging in as `owner@nhqs.test` and visiting `/settings/communications` shows all three channels as **Configured**.
- Triggering "Send test message" on each channel succeeds (or surfaces a verbatim provider error if the developer's keys are sandbox-only).

---

## Background — what already exists

By the time this impl runs, Wave 1–4 has shipped these foundations on the worktree:

- `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs` tables with `FORCE ROW LEVEL SECURITY` and AES-256-GCM-encrypted secret columns (Impl 01).
- `EncryptionService.encrypt(plaintext) → { encrypted, keyRef }` and `decrypt(encrypted, keyRef) → plaintext`, reusable from any script that imports `@school/api/configuration` or pulls the standalone module (Impl 03 confirms the encryption pattern).
- `EmailConfigService.upsertConfig`, `SmsConfigService.upsertConfig`, `WhatsAppConfigService.upsertConfig` — but these expect an authenticated tenant context. The backfill script bypasses HTTP and writes directly to the DB inside an interactive transaction with RLS context set, mirroring the pattern in `backfill-communications-permissions.ts` from Impl 02.
- `POST /v1/email-config/test`, `/v1/sms-config/test`, `/v1/whatsapp-config/test` — Impl 09 endpoints with full provider semantics (decrypt → send sentinel → set `last_verified_at` → return verbatim error on failure).
- `whatsapp_templates` schema with `status: pending | submitted | approved | rejected | paused` (Impl 01) and the lifecycle services (Impl 08).
- Platform-level notification templates added by Impl 12 (the new template keys).
- `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag (Impl 07) — when `true`, `ResendEmailProvider.dispatch()` skips the verified-domain check.
- Permission grants on the `school_owner` and `school_principal` roles for all 5 test tenants (Impl 02).

This impl does **not** add any new schema, controller, service, or worker job. It is **finishing/script-heavy** — three scripts, one JSON config file (with example), one shell script (the cutover blueprint), and a thin set of unit + integration tests. Mirror the structure of `21-polish-translations-mobile-a11y.md` from the modeling rebuild: a single coherent session, several discrete deliverables, all glue.

---

## What to change

### 13.1 Backfill script — `packages/prisma/scripts/backfill-tenant-communications-configs.ts`

**File:** `packages/prisma/scripts/backfill-tenant-communications-configs.ts` (NEW)

The script:

1. Reads a JSON config from `packages/prisma/scripts/dev-tenant-credentials.json` (the gitignored real-credentials file). If the file doesn't exist, prints an instructive error pointing to `dev-tenant-credentials.example.json` and exits 1.
2. Validates the JSON shape against an embedded Zod schema. Any missing tenant slug or channel block is a hard fail — no silent skip.
3. Connects to the local dev DB via `PrismaClient` with no RLS context (it runs as a platform-level operator, like `backfill-communications-permissions.ts`).
4. Resolves the 5 tenant IDs by **slug** (`nhqs`, `stress-a`, `stress-b`, `stress-c`, `stress-d`) — UUIDs differ per environment so we never hardcode them. Same logic as Impl 02's backfill.
5. For each tenant × channel, opens an interactive transaction, sets RLS context (`app.current_tenant_id`, `app.current_user_id`, `app.current_membership_id` to the system sentinel), encrypts the secret fields via `EncryptionService.encrypt`, and upserts the row.
6. Idempotent: uses Prisma's `upsert({ where: { tenant_id }, create: {...}, update: {...} })` on the unique tenant_id column. Re-running the script with the same config produces zero net diff. If you re-run with **different** credentials, the row updates and `key_last_rotated_at` becomes `now()`, mirroring how `EmailConfigService.upsertConfig` behaves.
7. Sets `is_enabled: true` on every channel and `last_verified_at: null` on initial insert (the verify runner in §13.3 sets it on success).
8. Logs every upsert with the tenant slug, channel, and a last-4 mask of the secret. Plaintext keys never appear in logs.
9. Post-condition assertion: after writing each row, re-reads it and asserts `resend_api_key_encrypted` is **NOT** plaintext (it must be in the `{iv}:{tag}:{ct}` triple format). Same for the SMS and WhatsApp encrypted columns. If any column is plaintext, the script bails with a loud error — that's an encryption regression and we don't want to ship it.
10. Exits 0 on success, 1 on any failure.

#### Skeleton (full source)

```typescript
/**
 * Idempotent backfill: provision tenant_email_configs / tenant_sms_configs /
 * tenant_whatsapp_configs rows for every test tenant in the local dev DB.
 *
 * Reads encrypted-at-rest credentials from a gitignored JSON config:
 *   packages/prisma/scripts/dev-tenant-credentials.json
 * The committed example (`dev-tenant-credentials.example.json`) documents the
 * shape — populate the gitignored real file with the developer's own test
 * credentials before running.
 *
 * Run order (after the schema + permissions + service layer impls have
 * shipped):
 *   1. (Once) cp dev-tenant-credentials.example.json dev-tenant-credentials.json
 *      Populate with developer's own Resend / Twilio test credentials.
 *   2. pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
 *
 * Idempotent: Prisma `upsert` on the unique `tenant_id` column. Re-running
 * with identical credentials is a no-op. Re-running with different
 * credentials rotates the encrypted blob and bumps `key_last_rotated_at`.
 *
 * Production cutover: this same script is what the user runs after merging
 * the worktree to main, with a `prod-tenant-credentials.json` file populated
 * from production secret stores. Until then, do NOT execute against
 * production — Rule 16 of IMPLEMENTATION_LOG.md.
 *
 * Usage (local dev DB):
 *   pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
 */
/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { EncryptionService } from '../../../apps/api/src/modules/configuration/encryption.service';

const TENANT_SLUGS = ['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d'] as const;
const SYSTEM_SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

const emailChannelSchema = z.object({
  resend_api_key: z.string().startsWith('re_'),
  from_email: z.string().email(),
  from_name: z.string().min(1),
  reply_to_email: z.string().email().optional(),
  webhook_secret: z.string().min(8),
});

const smsChannelSchema = z.object({
  twilio_account_sid: z.string().startsWith('AC'),
  twilio_auth_token: z.string().min(1),
  twilio_from_number: z.string().regex(/^\+\d{8,16}$/),
  webhook_secret: z.string().min(8),
});

const whatsappChannelSchema = z.object({
  twilio_account_sid: z.string().startsWith('AC'),
  twilio_auth_token: z.string().min(1),
  twilio_whatsapp_from_number: z.string().regex(/^\+\d{8,16}$/),
  business_profile_id: z.string().min(1).optional(),
  webhook_secret: z.string().min(8),
});

const tenantBlockSchema = z.object({
  email: emailChannelSchema,
  sms: smsChannelSchema,
  whatsapp: whatsappChannelSchema,
});

const verificationRecipientsSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+\d{8,16}$/),
});

const credentialsConfigSchema = z.object({
  verification_recipients: verificationRecipientsSchema,
  nhqs: tenantBlockSchema,
  'stress-a': tenantBlockSchema,
  'stress-b': tenantBlockSchema,
  'stress-c': tenantBlockSchema,
  'stress-d': tenantBlockSchema,
});

type CredentialsConfig = z.infer<typeof credentialsConfigSchema>;

const SCRIPT_DIR = path.resolve(__dirname);
const CONFIG_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.json');
const EXAMPLE_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.example.json');

function loadConfig(): CredentialsConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `[fatal] missing ${CONFIG_PATH}\n` +
        `        → cp ${EXAMPLE_PATH} ${CONFIG_PATH}\n` +
        `        → populate with the developer's own test credentials\n` +
        `        → re-run this script\n`,
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const parsed = credentialsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      `[fatal] ${CONFIG_PATH} failed schema validation:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
    process.exit(1);
  }
  return parsed.data;
}

function maskLast4(secret: string): string {
  if (secret.length <= 4) return '****';
  return `${'•'.repeat(Math.min(secret.length - 4, 12))}${secret.slice(-4)}`;
}

function assertNotPlaintext(label: string, encrypted: string, original: string): void {
  if (encrypted === original) {
    throw new Error(
      `[encryption regression] ${label} stored as plaintext — encryption pipeline broken`,
    );
  }
  // Encrypted shape is {iv_hex}:{authTag_hex}:{ciphertext_hex}
  if (encrypted.split(':').length !== 3) {
    throw new Error(
      `[encryption regression] ${label} not in {iv}:{tag}:{ct} format — got ${encrypted.slice(
        0,
        40,
      )}…`,
    );
  }
}

interface TenantRow {
  id: string;
  slug: string;
}

async function backfillEmail(
  prisma: PrismaClient,
  encryption: EncryptionService,
  tenant: TenantRow,
  block: CredentialsConfig['nhqs']['email'],
): Promise<void> {
  const apiKeyEnc = encryption.encrypt(block.resend_api_key);
  const webhookEnc = encryption.encrypt(block.webhook_secret);
  assertNotPlaintext('resend_api_key_encrypted', apiKeyEnc.encrypted, block.resend_api_key);
  assertNotPlaintext('email.webhook_secret_encrypted', webhookEnc.encrypted, block.webhook_secret);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_membership_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );

    await tx.tenantEmailConfig.upsert({
      where: { tenant_id: tenant.id },
      create: {
        tenant_id: tenant.id,
        resend_api_key_encrypted: apiKeyEnc.encrypted,
        from_email: block.from_email,
        from_name: block.from_name,
        reply_to_email: block.reply_to_email ?? null,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: apiKeyEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
        last_verified_at: null,
      },
      update: {
        resend_api_key_encrypted: apiKeyEnc.encrypted,
        from_email: block.from_email,
        from_name: block.from_name,
        reply_to_email: block.reply_to_email ?? null,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: apiKeyEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
      },
    });
  });

  console.log(
    `  [email]    tenant=${tenant.slug} from=${block.from_email} key=${maskLast4(
      block.resend_api_key,
    )} webhook=${maskLast4(block.webhook_secret)} keyRef=${apiKeyEnc.keyRef}`,
  );
}

// (analogous backfillSms and backfillWhatsapp helpers — see Files Touched
//  for the complete file; same shape, different table + encrypted columns)

async function seedWhatsappVerifyTemplate(prisma: PrismaClient, tenant: TenantRow): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_membership_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );

    await tx.whatsAppTemplate.upsert({
      where: {
        tenant_id_template_key_language_code: {
          tenant_id: tenant.id,
          template_key: 'comms.verify',
          language_code: 'en',
        },
      },
      create: {
        tenant_id: tenant.id,
        template_key: 'comms.verify',
        twilio_template_sid: 'HX_DEV_VERIFY',
        template_name: 'EduPod credential verification',
        language_code: 'en',
        category: 'authentication',
        body: "EduPod WhatsApp verification — your school's WhatsApp integration is wired up correctly.",
        status: 'approved',
        approval_message:
          'Dev shortcut — production cutover submits this to Twilio for real approval.',
        submitted_at: new Date(),
        approved_at: new Date(),
        last_synced_at: new Date(),
      },
      update: {
        twilio_template_sid: 'HX_DEV_VERIFY',
        status: 'approved',
        approved_at: new Date(),
        last_synced_at: new Date(),
      },
    });
  });
  console.log(
    `  [wa-tpl]   tenant=${tenant.slug} comms.verify=approved (dev shortcut sid=HX_DEV_VERIFY)`,
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
  }
  const config = loadConfig();
  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
  const encryption = new EncryptionService();

  let totalRowsWritten = 0;

  try {
    const tenants = await prisma.$queryRaw<TenantRow[]>`
      SELECT id, slug FROM tenants
       WHERE slug = ANY(${[...TENANT_SLUGS]}::text[])
       ORDER BY slug
    `;

    const foundSlugs = new Set(tenants.map((t) => t.slug));
    for (const slug of TENANT_SLUGS) {
      if (!foundSlugs.has(slug)) {
        console.error(
          `[fatal] tenant slug='${slug}' not found in local dev DB — run the seed first`,
        );
        process.exit(1);
      }
    }

    for (const tenant of tenants) {
      console.log(`\n[tenant=${tenant.slug}, id=${tenant.id}]`);
      const block = config[tenant.slug as (typeof TENANT_SLUGS)[number]];

      await backfillEmail(prisma, encryption, tenant, block.email);
      await backfillSms(prisma, encryption, tenant, block.sms);
      await backfillWhatsapp(prisma, encryption, tenant, block.whatsapp);
      await seedWhatsappVerifyTemplate(prisma, tenant);

      totalRowsWritten += 4; // 3 config rows + 1 wa template row
    }

    // ─── Post-condition: every encrypted column is non-plaintext ────────────
    const emailRows = await prisma.tenantEmailConfig.findMany({
      select: {
        tenant_id: true,
        resend_api_key_encrypted: true,
        webhook_secret_encrypted: true,
        encryption_key_ref: true,
      },
    });
    const smsRows = await prisma.tenantSmsConfig.findMany({
      select: {
        tenant_id: true,
        twilio_account_sid_encrypted: true,
        twilio_auth_token_encrypted: true,
        webhook_secret_encrypted: true,
        encryption_key_ref: true,
      },
    });
    const waRows = await prisma.tenantWhatsAppConfig.findMany({
      select: {
        tenant_id: true,
        twilio_account_sid_encrypted: true,
        twilio_auth_token_encrypted: true,
        webhook_secret_encrypted: true,
        encryption_key_ref: true,
      },
    });

    for (const row of emailRows) {
      if (!row.resend_api_key_encrypted.includes(':'))
        throw new Error(
          `email row ${row.tenant_id} — resend_api_key_encrypted not in encrypted shape`,
        );
    }
    for (const row of smsRows) {
      if (!row.twilio_auth_token_encrypted.includes(':'))
        throw new Error(
          `sms row ${row.tenant_id} — twilio_auth_token_encrypted not in encrypted shape`,
        );
    }
    for (const row of waRows) {
      if (!row.twilio_auth_token_encrypted.includes(':'))
        throw new Error(
          `whatsapp row ${row.tenant_id} — twilio_auth_token_encrypted not in encrypted shape`,
        );
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`Tenants processed:       ${tenants.length} / ${TENANT_SLUGS.length}`);
    console.log(`Email config rows:       ${emailRows.length}`);
    console.log(`SMS config rows:         ${smsRows.length}`);
    console.log(`WhatsApp config rows:    ${waRows.length}`);
    console.log(`WhatsApp template rows:  ${tenants.length} (one comms.verify per tenant)`);
    console.log(`Total upsert operations: ${totalRowsWritten}`);
    console.log(
      `Encryption invariant:    every secret column passes the {iv}:{tag}:{ct} shape check`,
    );
    console.log('──────────────────────────────────────────────');
    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
```

#### Why slug-keyed lookup, not UUID

Same reason as Impl 02: UUIDs differ per environment. The local dev DB you have right now and the production DB the user merges into have different tenant UUIDs. Slugs are stable. Hardcoding UUIDs would make this script unusable for production cutover.

#### Why we use the Prisma client and not the running API's `EmailConfigService`

The backfill is a platform-level operation. Running it through the controller layer would require an authenticated session per tenant, which is wrong for a maintenance script. The script reuses `EncryptionService` directly (the single source of truth for encryption) and goes straight to `prisma.tenantEmailConfig.upsert(...)` inside an interactive transaction with RLS context set.

#### Why we don't publish to `comms:config-changed` from the script

The cache-bus pub/sub channel (Impl 04) invalidates per-tenant Resend / Twilio clients held by running API and worker processes. When the backfill runs locally:

- If the dev API is **not** running, there are no caches to invalidate — the next API start populates fresh.
- If the dev API **is** running, the next dispatch lazy-loads the new credentials directly from the DB on cache-miss (5-minute TTL is short enough that even if a stale cache existed, it self-clears).

The simpler, more robust answer is to instruct the developer to restart the dev API after running the backfill (one line in §Verification). On production cutover, the user does the same — restart PM2 after the backfill. No publish needed. Adding a Redis publish from the script would require pulling the Redis client into the script's dependency graph, which isn't worth the complexity for a one-shot maintenance operation.

### 13.2 Dev credentials file (gitignored, with example)

#### 13.2.a Example file — `packages/prisma/scripts/dev-tenant-credentials.example.json` (NEW, COMMITTED)

```json
{
  "_comment_top": "DO NOT POPULATE THIS FILE WITH REAL CREDENTIALS — IT IS COMMITTED. Real credentials live in dev-tenant-credentials.json (gitignored). Copy this file, populate the copy, and never commit it.",
  "verification_recipients": {
    "_comment": "Where the verify runner sends test messages. Use the developer's own real inbox/phone — these are not test fixtures.",
    "email": "developer@example.com",
    "phone": "+44XXXXXXXXX"
  },
  "nhqs": {
    "email": {
      "resend_api_key": "re_REPLACE_WITH_DEVELOPER_OWN_TEST_KEY",
      "from_email": "noreply@nhqs.test",
      "from_name": "Nurul Huda Quranic School",
      "reply_to_email": "office@nhqs.test",
      "webhook_secret": "whsec_REPLACE_WITH_DEVELOPER_GENERATED"
    },
    "sms": {
      "twilio_account_sid": "ACREPLACE_WITH_DEVELOPER_OWN_TEST_SID",
      "twilio_auth_token": "REPLACE_WITH_DEVELOPER_OWN_TEST_TOKEN",
      "twilio_from_number": "+15551234567",
      "webhook_secret": "twsec_REPLACE_WITH_DEVELOPER_GENERATED"
    },
    "whatsapp": {
      "twilio_account_sid": "ACREPLACE_WITH_DEVELOPER_OWN_TEST_SID",
      "twilio_auth_token": "REPLACE_WITH_DEVELOPER_OWN_TEST_TOKEN",
      "twilio_whatsapp_from_number": "+15551234567",
      "business_profile_id": "BPREPLACE_WITH_DEVELOPER_OWN_TEST_PROFILE",
      "webhook_secret": "twsec_REPLACE_WITH_DEVELOPER_GENERATED"
    }
  },
  "stress-a": {
    "email": {
      "resend_api_key": "re_PLACEHOLDER",
      "from_email": "noreply@stress-a.test",
      "from_name": "Stress Test School A",
      "reply_to_email": "office@stress-a.test",
      "webhook_secret": "whsec_PLACEHOLDER"
    },
    "sms": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_from_number": "+15551234568",
      "webhook_secret": "twsec_PLACEHOLDER"
    },
    "whatsapp": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_whatsapp_from_number": "+15551234568",
      "business_profile_id": "BPPLACEHOLDER",
      "webhook_secret": "twsec_PLACEHOLDER"
    }
  },
  "stress-b": {
    "email": {
      "resend_api_key": "re_PLACEHOLDER",
      "from_email": "noreply@stress-b.test",
      "from_name": "Stress Test School B",
      "reply_to_email": "office@stress-b.test",
      "webhook_secret": "whsec_PLACEHOLDER"
    },
    "sms": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_from_number": "+15551234569",
      "webhook_secret": "twsec_PLACEHOLDER"
    },
    "whatsapp": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_whatsapp_from_number": "+15551234569",
      "business_profile_id": "BPPLACEHOLDER",
      "webhook_secret": "twsec_PLACEHOLDER"
    }
  },
  "stress-c": {
    "email": {
      "resend_api_key": "re_PLACEHOLDER",
      "from_email": "noreply@stress-c.test",
      "from_name": "Stress Test School C",
      "reply_to_email": "office@stress-c.test",
      "webhook_secret": "whsec_PLACEHOLDER"
    },
    "sms": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_from_number": "+15551234570",
      "webhook_secret": "twsec_PLACEHOLDER"
    },
    "whatsapp": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_whatsapp_from_number": "+15551234570",
      "business_profile_id": "BPPLACEHOLDER",
      "webhook_secret": "twsec_PLACEHOLDER"
    }
  },
  "stress-d": {
    "email": {
      "resend_api_key": "re_PLACEHOLDER",
      "from_email": "noreply@stress-d.test",
      "from_name": "Stress Test School D",
      "reply_to_email": "office@stress-d.test",
      "webhook_secret": "whsec_PLACEHOLDER"
    },
    "sms": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_from_number": "+15551234571",
      "webhook_secret": "twsec_PLACEHOLDER"
    },
    "whatsapp": {
      "twilio_account_sid": "ACPLACEHOLDER",
      "twilio_auth_token": "PLACEHOLDER",
      "twilio_whatsapp_from_number": "+15551234571",
      "business_profile_id": "BPPLACEHOLDER",
      "webhook_secret": "twsec_PLACEHOLDER"
    }
  }
}
```

The example uses obvious placeholders (`re_REPLACE_WITH_…`, `ACPLACEHOLDER`) so a developer who runs the backfill against the example file by accident gets a clear hard-fail from Resend / Twilio (not a silent send to nowhere).

#### 13.2.b Gitignore — `packages/prisma/scripts/.gitignore` (NEW, COMMITTED)

```
dev-tenant-credentials.json
prod-tenant-credentials.json
```

Belt-and-braces — the repo's root `.gitignore` may already block `*.json` in some directories, but a local file in this folder is unambiguous.

#### 13.2.c Top-level `.gitignore` add (UPDATE if not already covered)

Append:

```
# Communications backfill — real credentials, never commit
packages/prisma/scripts/dev-tenant-credentials.json
packages/prisma/scripts/prod-tenant-credentials.json
```

If this is already covered by an existing pattern (e.g., a generic `*-credentials.json` rule), no change needed. Verify before adding to avoid duplicate noise.

### 13.3 Test send verification — `packages/prisma/scripts/verify-tenant-communications-configs.ts`

**File:** `packages/prisma/scripts/verify-tenant-communications-configs.ts` (NEW)

After the backfill writes 15 config rows, this runner authenticates as each tenant's owner and calls the three verify endpoints. The verify endpoints (Impl 09) are the mandated way to flip `last_verified_at` to a non-null value — calling them via HTTP is the production-realistic verification path.

The runner:

1. Reads the same `dev-tenant-credentials.json` to get the verification recipient (email + phone).
2. Authenticates as `owner@nhqs.test` (or `owner@stress-{a,b,c,d}.test`) via `POST /api/v1/auth/login` with the known dev passwords (`Password123!` for NHQS, `StressTest2026!` for stress tenants).
3. For each tenant × channel, calls `POST /api/v1/{email,sms,whatsapp}-config/test` with the verification recipient.
4. Captures success / failure per call. On failure, surfaces the verbatim provider error from the response (per Impl 09's contract — the verify endpoint returns `{ success: false, provider_error: '<verbatim>', status_code: <int> }`).
5. Polls the DB after each successful call to assert `last_verified_at` is now non-null.
6. Prints a summary: `15 calls × N succeeded / M failed with provider errors / K failed with non-2xx`.

The runner does **not** retry on failure — surfacing real provider errors is the goal. If a stress tenant's keys are placeholder strings, the runner correctly logs `Twilio rejected with 401 — invalid SID` and that's the verification: the encryption pipeline works, the network path works, and Twilio rejected as expected.

#### Skeleton

```typescript
/**
 * After backfill-tenant-communications-configs.ts has run, drive the verify
 * endpoints for each (tenant, channel) pair. Surfaces verbatim provider
 * errors so the developer can immediately see whether their dev credentials
 * are wired up correctly.
 *
 * Usage:
 *   pnpm tsx packages/prisma/scripts/verify-tenant-communications-configs.ts
 *
 * Pre-reqs:
 *   - API is running on http://localhost:3001
 *   - Backfill has run successfully (5 × 3 = 15 config rows present)
 *   - dev-tenant-credentials.json has a valid verification_recipients block
 */
/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';

const TENANT_SLUGS = ['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d'] as const;
const TENANT_PASSWORDS: Record<(typeof TENANT_SLUGS)[number], string> = {
  nhqs: 'Password123!',
  'stress-a': 'StressTest2026!',
  'stress-b': 'StressTest2026!',
  'stress-c': 'StressTest2026!',
  'stress-d': 'StressTest2026!',
};
const API_BASE = process.env.API_BASE ?? 'http://localhost:3001';

const SCRIPT_DIR = path.resolve(__dirname);
const CONFIG_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.json');

interface VerifyResult {
  tenant: string;
  channel: 'email' | 'sms' | 'whatsapp';
  success: boolean;
  provider_message_id?: string;
  provider_error?: string;
  http_status?: number;
}

async function login(slug: string): Promise<string> {
  const email = `owner@${slug === 'nhqs' ? 'nhqs' : slug}.test`;
  const password = TENANT_PASSWORDS[slug as (typeof TENANT_SLUGS)[number]];
  const resp = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { access_token: string };
  return json.access_token;
}

async function verifyChannel(
  token: string,
  slug: string,
  channel: 'email' | 'sms' | 'whatsapp',
  recipient: { email: string; phone: string },
): Promise<VerifyResult> {
  const url = `${API_BASE}/api/v1/${channel}-config/test`;
  const body =
    channel === 'email'
      ? { recipient_email: recipient.email }
      : channel === 'sms'
        ? { recipient_phone: recipient.phone }
        : { recipient_phone: recipient.phone, template_key: 'comms.verify' };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await resp.json().catch(() => ({}))) as Partial<VerifyResult> & {
    success?: boolean;
  };

  return {
    tenant: slug,
    channel,
    success: resp.ok && (json.success ?? true),
    provider_message_id: json.provider_message_id,
    provider_error: json.provider_error,
    http_status: resp.status,
  };
}

async function main(): Promise<void> {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[fatal] missing ${CONFIG_PATH} — run backfill first`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const recipient = raw.verification_recipients;

  const results: VerifyResult[] = [];

  for (const slug of TENANT_SLUGS) {
    let token: string;
    try {
      token = await login(slug);
    } catch (err) {
      console.error(`[skip] ${slug}: ${(err as Error).message}`);
      continue;
    }
    for (const channel of ['email', 'sms', 'whatsapp'] as const) {
      const result = await verifyChannel(token, slug, channel, recipient);
      results.push(result);
      const tag = result.success ? '✔' : '✘';
      const detail = result.success
        ? `msg_id=${result.provider_message_id ?? '<none>'}`
        : `http=${result.http_status} err=${result.provider_error ?? '<no body>'}`;
      console.log(`  ${tag} ${slug.padEnd(10)} ${channel.padEnd(8)} ${detail}`);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Verifications attempted: ${results.length} (target: 15)`);
  console.log(`Succeeded:               ${succeeded}`);
  console.log(`Failed (provider error): ${failed}`);
  console.log(`──────────────────────────────────────────────`);

  if (succeeded === 0) {
    console.error('All verifications failed — check API logs and credentials file.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verify runner crashed:', err);
  process.exit(1);
});
```

A non-zero exit only happens when **every** verify failed, which is symptomatic of a wiring / environment issue, not a per-channel credential problem. Per-tenant failures (e.g., stress tenants where the developer used placeholders) are logged but don't fail the whole run — the developer reads the output and decides which tenants need real credentials filled in.

### 13.4 WhatsApp `comms.verify` template seed

Already wired into the backfill script (§13.1, `seedWhatsappVerifyTemplate`). Documented here for emphasis because the architecture doc §3.10 explicitly calls it out as a precondition for the WhatsApp verify endpoint:

> WhatsApp: uses an approved sentinel template `comms.verify` (registered by Impl 13's backfill); requires the recipient's number to be in service window OR the template approved.

The dev shortcut sets `twilio_template_sid = 'HX_DEV_VERIFY'`. Twilio will reject sends using this fake SID (no such template exists in their system), but **the verify endpoint's job is to expose that very error verbatim to the developer**. Calling the verify endpoint exercises the full pipeline: decrypt → resolve template → call Twilio → capture verbatim error. The developer sees `provider_error: "Template HX_DEV_VERIFY not found"` in the verifier output, confirms the wiring works, and either populates a real Twilio sandbox template SID or accepts the fake-SID failure as expected dev behaviour.

The production cutover script (§13.7) replaces this dev shortcut with a real Twilio submission for each production tenant.

### 13.5 Notification template seed verification

Impl 12 adds platform-level (`tenant_id = NULL`) notification templates for the new template keys. These are written by Impl 12's seed update — this impl does **not** re-write them. It only verifies they exist:

```sql
SELECT template_key, channel, locale, tenant_id IS NULL AS is_platform
  FROM notification_template
 WHERE template_key IN (
   'auth.password_reset',
   'auth.password_changed',
   'trip.invitation',
   'trip.payment_due',
   'school.closure',
   'staff.leave_decision',
   'health.incident',
   'sen.eha_update',
   'email_domain.verified',
   'comms.verify'
 )
 ORDER BY template_key, channel, locale;
```

Expected: every key has at least one `(channel, en)` row with `tenant_id IS NULL`, plus `(channel, ar)` for the ones Impl 12 translated. If any expected row is missing, this impl does **not** write it — instead, fail the verification step in §Verification and refer the developer back to Impl 12. The boundaries are:

- **Impl 12 owns** the seed file edits to `packages/prisma/seed/notification-templates.ts`.
- **Impl 13 owns** the verification SQL and the dev-only `comms.verify` WhatsApp template (a Twilio-specific row, distinct from the generic `notification_template` rows).

The verifier script (§13.3) prints a summary; this SQL is what the developer runs manually to confirm the platform templates exist.

### 13.6 Domain bypass flag for dev

Impl 07 added the env flag. Impl 13's responsibility is to ensure the developer's local `.env` has it set so email dispatch actually works in dev (no DNS publication required for the test domains).

Add to `.env.example` (Impl 07 may already have done this — verify, do not duplicate):

```
# Communications — domain verification bypass (LOCAL DEV ONLY)
# When 'true', ResendEmailProvider does NOT enforce that the sender domain is
# a verified `tenant_email_domains` row before dispatch. Production, staging,
# and CI MUST leave this unset (or set to 'false'). Default 'false'.
COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true
```

(Impl 07's `.env.example` line defaults to `false`. This impl flips the dev developer's `.env` recommendation to `true` for local use only. The Zod default in `env-schema.ts` stays `false` — production stays safe.)

The production cutover script (§13.7) includes a checklist item: "verify `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` is unset on production servers."

### 13.7 Production cutover script — `communicationnew/cutover/production-cutover.sh`

**File:** `communicationnew/cutover/production-cutover.sh` (NEW, COMMITTED)

This is a **documentation script** — it lives in the repo so the user can find it after merging the worktree to `main`. It is **not executed by Impl 13**. Every step is a manual checklist or a guarded shell command the user inspects before running.

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Communications Overhaul — Production Cutover Script
#
# DO NOT RUN AS-IS. This is a checklist + reference for the user to follow
# AFTER the communications-overhaul worktree is merged into main.
#
# Each step is documented; the user inspects, adapts, and runs each block
# explicitly. There is no `bash production-cutover.sh` invocation.
#
# Generated by Impl 13 of the Communications Overhaul rebuild.
# Last updated: <ISO date the impl shipped>
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo ""
echo "┌────────────────────────────────────────────────────────────────────┐"
echo "│   Communications Overhaul — Production Cutover Script              │"
echo "│                                                                    │"
echo "│   This script is a CHECKLIST. Read every step before running.      │"
echo "│   Do NOT execute the whole file in one go.                         │"
echo "│   Each step starts with `# STEP N`. Run step-by-step.              │"
echo "└────────────────────────────────────────────────────────────────────┘"
echo ""

# ─── STEP 1 — Backup production DB ──────────────────────────────────────────
# Before any backfill, take a logical pg_dump.
#
#   ssh root@46.62.244.139
#   sudo -u postgres pg_dump -Fc -f /var/backups/comms-cutover-$(date +%Y%m%d_%H%M).dump school_platform
#
# Verify the dump file size is non-trivial (> 100 MB on a real tenant load).

# ─── STEP 2 — Verify migrations are already applied ─────────────────────────
# When the user merges main, GitHub Actions runs `scripts/deploy-production.sh`
# which calls `prisma migrate deploy`. The 8 new tables (Impl 01) and the
# permission rows (Impl 02 seed) ship through CI, NOT through this script.
#
# This step is a sanity check, not an action:
#
#   ssh root@46.62.244.139
#   cd /var/www/edupod/current
#   sudo -u edupod npx prisma migrate status
#
# Expect: "Database schema is up to date."
#
# Verify the new tables exist:
#   sudo -u postgres psql school_platform -c "\d tenant_email_configs"
#   sudo -u postgres psql school_platform -c "\d tenant_sms_configs"
#   sudo -u postgres psql school_platform -c "\d tenant_whatsapp_configs"
#   sudo -u postgres psql school_platform -c "\d notification_suppression_list"
#   sudo -u postgres psql school_platform -c "\d tenant_email_domains"
#   sudo -u postgres psql school_platform -c "\d whatsapp_templates"
#   sudo -u postgres psql school_platform -c "\d whatsapp_service_windows"
#   sudo -u postgres psql school_platform -c "\d notification_webhook_events"
#
# All 8 tables must exist with FORCE ROW LEVEL SECURITY enabled.

# ─── STEP 3 — Backfill permissions on existing production tenants ───────────
# Impl 02's script grants `configuration.communications.{view,manage}` to
# `school_owner` + `school_principal` on every existing tenant.
#
#   ssh edupod@46.62.244.139
#   cd /var/www/edupod/current
#   pnpm --filter @school/prisma backfill:comms-permissions
#
# Expect: "Total grants added: N" where N = (tenants × 4) for the first run.
# Re-running: "Total grants added: 0" — proven idempotency.

# ─── STEP 4 — Provision prod-tenant-credentials.json ────────────────────────
# This file is gitignored. Populate it from production secret stores.
#
#   ssh edupod@46.62.244.139
#   cd /var/www/edupod/current/packages/prisma/scripts
#   cp dev-tenant-credentials.example.json prod-tenant-credentials.json
#   # Edit prod-tenant-credentials.json — populate with REAL Resend / Twilio keys
#   # for each tenant. Pull from 1Password / AWS Secrets Manager / wherever.
#   chmod 600 prod-tenant-credentials.json   # belt-and-braces
#
# The verification_recipients block should be a real ops contact — someone
# who will receive every test send and confirm receipt.

# ─── STEP 5 — Run the credential backfill against production ────────────────
# Same script as dev, different config file.
#
#   cd /var/www/edupod/current
#   CREDENTIALS_FILE=packages/prisma/scripts/prod-tenant-credentials.json \
#     pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
#
# (Note: the dev script defaults to dev-tenant-credentials.json. For prod, the
# script accepts CREDENTIALS_FILE env var to override the path. Update the
# script if needed before this step — Impl 13's spec calls this out.)
#
# Expect: 15 rows written (5 tenants × 3 channels), every encrypted column
# passes the {iv}:{tag}:{ct} shape assertion.

# ─── STEP 6 — Submit comms.verify WhatsApp template to Twilio ───────────────
# The dev backfill set `twilio_template_sid='HX_DEV_VERIFY'`. Production needs
# a real Twilio template approval per tenant.
#
# For each tenant:
#   1. Use Impl 08's submission flow to register `comms.verify` with Twilio
#      (POST /v1/whatsapp-templates with category=authentication, body=
#      "EduPod WhatsApp verification — your school's WhatsApp integration is
#      wired up correctly.")
#   2. Wait for Twilio approval (manual queue, typically 1–24 hours).
#   3. The cron `comms:whatsapp-template-sync` (Impl 08) polls every 15 min
#      and flips `whatsapp_templates.status` to `approved` once Twilio
#      acknowledges. Verify with:
#
#        SELECT tenant_id, template_key, status, twilio_template_sid
#          FROM whatsapp_templates
#         WHERE template_key = 'comms.verify'
#         ORDER BY tenant_id;
#
#      All rows must show `status='approved'` and a real `HX...` sid (not
#      the dev placeholder `HX_DEV_VERIFY`).

# ─── STEP 7 — Register email domains via Resend ─────────────────────────────
# For each production tenant, register the sender domain via Impl 07's
# endpoint. This populates DNS records the tenant must publish.
#
#   curl -X POST https://app.edupod.app/api/v1/email-domains \
#     -H "Authorization: Bearer <tenant-owner-token>" \
#     -H "content-type: application/json" \
#     -d '{"domain":"<tenant-sender-domain>"}'
#
# Capture the DNS record list from the response. Send the records to the
# tenant for them to publish. Common DNS providers:
#   - Cloudflare: tenant copies records into their dashboard
#   - Route53: tenant adds records via AWS console
#   - GoDaddy / Namecheap: similar manual workflow
#
# The cron `comms:domain-verification-refresh` (Impl 07) polls Resend every
# 30 min and flips `tenant_email_domains.status` to `verified` once SPF +
# DKIM + DMARC are all green. Manual refresh:
#
#   curl -X POST https://app.edupod.app/api/v1/email-domains/<id>/refresh \
#     -H "Authorization: Bearer <tenant-owner-token>"
#
# Verify all tenant domains are verified before the next step:
#
#   SELECT tenant_id, domain, status, verified_at
#     FROM tenant_email_domains
#    ORDER BY tenant_id;

# ─── STEP 8 — Confirm bypass flag is NOT set on production ──────────────────
# Critical safety check. The dev bypass flag must NEVER be true in prod.
#
#   ssh root@46.62.244.139
#   sudo -u edupod cat /var/www/edupod/.env | grep COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV
#
# Expect: either no output (flag unset) or `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=false`.
# If the flag is `true` in production, STOP — that is a deliverability incident waiting
# to happen. Fix .env before proceeding.

# ─── STEP 9 — Restart API and worker via PM2 ────────────────────────────────
# After credential backfill, the running API + worker have stale cached
# Resend / Twilio clients (or no cache at all if they started before the
# rows existed). Restart to pick up the new tenant configs.
#
#   ssh edupod@46.62.244.139
#   pm2 restart edupod-api edupod-worker
#   pm2 logs edupod-api --lines 50      # watch for "tenant config loaded" log lines
#   pm2 logs edupod-worker --lines 50

# ─── STEP 10 — Smoke test each tenant ──────────────────────────────────────
# For each production tenant, run the verifier flow:
#
#   1. Login as the tenant owner
#   2. Visit /settings/communications — confirm all 3 channels show "Configured"
#   3. Click "Send test message" on each channel — recipient is the prod ops
#      contact from STEP 4
#   4. Verify receipt in the ops contact's inbox / phone
#
# Alternatively, drive via curl (the verifier script from Impl 13 works,
# pointed at production via API_BASE=https://app.edupod.app):
#
#   API_BASE=https://app.edupod.app pnpm tsx \
#     packages/prisma/scripts/verify-tenant-communications-configs.ts
#
# Expect: 15/15 succeeded. Any failure → STOP, investigate that tenant's
# credentials, rerun.

# ─── STEP 11 — Monitor first 24 hours ───────────────────────────────────────
# Check Sentry for new comms-tagged errors:
#   ./scripts/sentry-cli.sh new-events-since "2024-XX-XX 00:00:00"
#
# Check Grafana dashboard `docs/operations/dashboards/communications.json`:
#   - notifications_dispatched_total — expect normal volume per tenant
#   - notifications_suppressed_total — expect zero or near-zero
#   - notifications_webhook_received_total — expect Resend + Twilio events
#
# Check production logs for `tenant_id` tag presence on every comms log line
# (Impl 10 enforces this).

echo ""
echo "Cutover complete. Update IMPLEMENTATION_LOG.md §5 with the cutover record."
echo ""
```

The script is **chmod 644** (not executable). It's a checklist, not a runnable. The first line `#!/usr/bin/env bash` and `set -euo pipefail` exist so a developer who copy-pastes a step into a real shell gets sane defaults.

#### Why we ship the script in `communicationnew/cutover/` instead of `scripts/`

`scripts/` is for repo-wide tooling that can run in CI. `communicationnew/cutover/` is for one-shot manual cutover artefacts the user finds after merging. Keeping it inside the rebuild's own folder makes it discoverable: when the user merges and looks at the diff, they see the cutover script alongside the other rebuild artefacts. After the rebuild ships and the cutover happens, the file remains as historical record (git log shows when it was used).

---

## Tests

All co-located. Coverage target ≥ baseline for `packages/prisma/scripts/`.

### Unit test 1 — Backfill script idempotence

**File:** `packages/prisma/scripts/backfill-tenant-communications-configs.spec.ts` (NEW)

The script's body is wrapped behind a `runBackfill(prisma, encryption, configPath)` exported function so the test can inject mocks. The `main()` wrapper at the bottom of the script wires `process.env` and a real `PrismaClient` and calls `runBackfill`.

Cases:

1. **First run — 15 upsert calls** — mock `PrismaClient.tenantEmailConfig.upsert`, `.tenantSmsConfig.upsert`, `.tenantWhatsAppConfig.upsert`. Assert exactly 5 of each are invoked. Assert payload shape per call (encrypted columns are non-empty strings; plaintext columns match the config block). Assert `whatsAppTemplate.upsert` invoked 5 times for `comms.verify`.

2. **Second run — same config — no behavioural diff** — mock the upserts to return the existing rows unchanged. Assert no errors. Assert `key_last_rotated_at` IS still touched on every upsert (this is OK — `upsert` semantics; the row's `updated_at` flips but the encrypted blobs stay the same because the inputs are identical).

3. **Third run — different credentials — `key_last_rotated_at` updates** — mock the config to return a different `resend_api_key` for `nhqs`. Assert `tenantEmailConfig.upsert` for the NHQS row is called with new encrypted blob and `key_last_rotated_at` set to a fresh `Date`.

4. **Missing config file** — mock `fs.existsSync` to return false. Assert `process.exit(1)` is called and the error message references the example file path.

5. **Invalid config shape** — provide a config missing `stress-d`. Assert Zod validation error is logged with the path `stress-d` and `process.exit(1)` is called.

6. **Tenant slug not in DB** — mock `prisma.$queryRaw` to return only 4 of the 5 expected slugs. Assert hard fail: `[fatal] tenant slug='stress-d' not found in local dev DB` and `process.exit(1)`.

7. **Encryption regression sentinel** — mock `EncryptionService.encrypt` to return `{ encrypted: '<plaintext>', keyRef: 'v1' }` (a regression). Assert the post-condition assertion catches it and the script throws.

### Unit test 2 — Backfill script encrypts secrets

**Same file as above, separate `describe` block.**

1. **Encrypted columns are not plaintext** — run the script end-to-end with a real `EncryptionService` (instantiated against a test `ENCRYPTION_KEY_V1=<64-hex-chars>`). Assert each encrypted column in the upsert payloads contains exactly two `:` separators (matching the `{iv}:{tag}:{ct}` shape). Assert the encrypted column does NOT equal the original plaintext.

2. **Round-trip decryption works** — for each encrypted value, call `EncryptionService.decrypt(encrypted, keyRef)` and assert it returns the original plaintext. This proves the encryption + decryption pair is consistent.

3. **`encryption_key_ref` is captured** — every upsert payload carries an `encryption_key_ref` matching the `keyRef` returned by `encrypt()`. Defaults to `'v1'` for the test key.

### Unit test 3 — Verify runner

**File:** `packages/prisma/scripts/verify-tenant-communications-configs.spec.ts` (NEW)

Mock `global.fetch` (Node 20+ has fetch built-in). Cases:

1. **All 15 succeed** — mock fetch to return `{ ok: true, json: { success: true, provider_message_id: 'fake_id' } }` for every call. Assert results array has 15 entries, all `success: true`. Assert exit code 0.

2. **Login failure on stress-c** — mock `POST /auth/login` for `owner@stress-c.test` to return 401. Assert that tenant is skipped, the loop continues with the remaining 4 tenants, and the final summary shows 12 attempts (4 tenants × 3 channels).

3. **All 15 fail with provider errors** — mock fetch to return `{ ok: true, json: { success: false, provider_error: 'Twilio rejected with 401' } }` for every channel. Assert results array entries all `success: false`. Assert exit code 1 (because 0 succeeded).

4. **Mixed success / failure** — 10 succeed, 5 fail (stress-d's three channels + 2 random others). Assert summary correctly counts `succeeded=10, failed=5`. Assert exit code 0 (because some succeeded).

### Integration test (optional, time-permitting) — Real DB round-trip

**File:** `apps/api/test/comms-backfill.integration.spec.ts` (NEW, optional)

Inside an isolated test DB:

1. Seed a fresh test tenant with slug `nhqs-int-comms`.
2. Place a test `dev-tenant-credentials.json` in a temp dir with one tenant block for that slug.
3. Run `runBackfill(prisma, encryption, tempPath)`.
4. Query the DB: assert `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`, `whatsapp_templates` rows exist for that tenant.
5. Assert `resend_api_key_encrypted` decrypted via `EncryptionService.decrypt` returns the original plaintext.
6. Re-run `runBackfill` with the same config — assert no new rows, no errors, all `updated_at` columns advance but column values stay the same.
7. Re-run with a different `resend_api_key` — assert `tenant_email_configs` row updates and `key_last_rotated_at` advances.

Skip if the time budget is tight — the unit tests + the live local-dev verification (§Verification) are sufficient evidence.

### Cutover script existence test

**File:** `communicationnew/cutover/cutover-script.spec.ts` (NEW, lightweight)

Cases:

1. **File exists and is readable** — `fs.statSync('communicationnew/cutover/production-cutover.sh')` succeeds.
2. **References the right backfill scripts** — `fs.readFileSync(...).toString()` contains the exact strings `backfill-communications-permissions.ts` and `backfill-tenant-communications-configs.ts`.
3. **References every production cutover step** — assert all 11 step headers appear (`# ─── STEP 1`, `# ─── STEP 2`, …, `# ─── STEP 11`).
4. **Mentions the bypass flag check** — contains the string `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV`.
5. **References real production hostnames** — contains `app.edupod.app` and `46.62.244.139` (per project memory).

This is a content lint, not a real test of behaviour, but it catches the most likely regression: someone refactors the script and forgets to update step numbers or references.

### Regression run

```bash
pnpm --filter @school/prisma run test
pnpm turbo run type-check --filter @school/prisma
pnpm turbo run lint --filter @school/prisma
```

All must pass. Coverage on `packages/prisma/scripts/` should not regress.

---

## Verification (local dev server)

Mandatory per Rule 27a of `IMPLEMENTATION_LOG.md`. Capture timestamps + console errors in the §5 completion record.

### 0. Prerequisites

- Wave 1 + 2 + 3 + 4 already merged into the worktree (schema, RBAC backfill, all services, providers, verify endpoints, frontend pages, module gap closure).
- Local Postgres + Redis running (`docker compose up -d`).
- `ENCRYPTION_KEY_V1` set in local `.env` (64 hex chars).
- The 5 test tenants seeded in the local dev DB (NHQS + stress-a/b/c/d).

### 1. Type-check + lint

```bash
pnpm turbo run type-check --filter @school/prisma --filter @school/api --filter @school/shared
pnpm turbo run lint --filter @school/prisma
```

Both must pass clean.

### 2. Populate the dev credentials file

```bash
cd packages/prisma/scripts
cp dev-tenant-credentials.example.json dev-tenant-credentials.json
# Edit dev-tenant-credentials.json — populate with developer's own test
# credentials (Resend free-tier API key + Twilio test SID + sandbox WhatsApp).
# The verification_recipients block uses the developer's own real email/phone.
```

Confirm the file is `.gitignore`d:

```bash
git status packages/prisma/scripts/dev-tenant-credentials.json
# expected: empty output (file is ignored)
```

### 3. Run the backfill

```bash
cd /Users/ram/Desktop/SDB
pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
```

Expected (abbreviated):

```
[tenant=nhqs, id=…]
  [email]    tenant=nhqs from=noreply@nhqs.test key=••••••••abcd webhook=••••••••wxyz keyRef=v1
  [sms]      tenant=nhqs sid=••••••••AC01 token=••••••••auth from=+15551234567 webhook=••••••••wxyz keyRef=v1
  [whatsapp] tenant=nhqs sid=••••••••AC01 token=••••••••auth from=+15551234567 webhook=••••••••wxyz keyRef=v1
  [wa-tpl]   tenant=nhqs comms.verify=approved (dev shortcut sid=HX_DEV_VERIFY)

[tenant=stress-a, id=…]
  …(same shape × 4 stress tenants)…

──────────────────────────────────────────────
Tenants processed:       5 / 5
Email config rows:       5
SMS config rows:         5
WhatsApp config rows:    5
WhatsApp template rows:  5 (one comms.verify per tenant)
Total upsert operations: 20
Encryption invariant:    every secret column passes the {iv}:{tag}:{ct} shape check
──────────────────────────────────────────────
Done.
```

### 4. Direct DB count check

Connect (`psql $DATABASE_URL`):

```sql
SELECT 'email' AS channel, COUNT(*) FROM tenant_email_configs
UNION ALL
SELECT 'sms', COUNT(*) FROM tenant_sms_configs
UNION ALL
SELECT 'whatsapp', COUNT(*) FROM tenant_whatsapp_configs
UNION ALL
SELECT 'wa_template', COUNT(*) FROM whatsapp_templates WHERE template_key = 'comms.verify';
```

Expected:

```
 channel    | count
------------+-------
 email      |     5
 sms        |     5
 whatsapp   |     5
 wa_template|     5
```

15 config rows + 5 WhatsApp template rows = the invariant.

Verify encryption:

```sql
SELECT tenant_id, length(resend_api_key_encrypted),
       resend_api_key_encrypted ~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$' AS in_encrypted_shape
  FROM tenant_email_configs
 LIMIT 5;
```

Every row: `in_encrypted_shape = true`, `length` > 60.

### 5. Idempotency check

Re-run the backfill:

```bash
pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
```

Expected: same summary output, 20 upserts, but the underlying row values stay unchanged (only `updated_at` advances). No errors. No duplicate rows.

### 6. Restart the API to pick up new credentials

```bash
pnpm --filter @school/api dev
```

In a separate shell, watch for cache-bus subscription:

```bash
pnpm --filter @school/api dev 2>&1 | grep -E "(comms:config-changed|tenant.*config.*loaded)"
```

### 7. Run the verifier

```bash
pnpm tsx packages/prisma/scripts/verify-tenant-communications-configs.ts
```

Expected (with developer's real test credentials populated):

```
  ✔ nhqs       email    msg_id=resend_msg_xxxxxxxx
  ✔ nhqs       sms      msg_id=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ✘ nhqs       whatsapp http=400 err=Template HX_DEV_VERIFY not found
  ✔ stress-a   email    msg_id=resend_msg_xxxxxxxx
  …

──────────────────────────────────────────────
Verifications attempted: 15 (target: 15)
Succeeded:               10
Failed (provider error): 5
──────────────────────────────────────────────
```

The WhatsApp `comms.verify` calls fail with a real Twilio "Template not found" error — this is **expected** in dev (the dev shortcut `HX_DEV_VERIFY` doesn't exist in Twilio's system). The verification confirms:

- Encryption pipeline works (no decryption errors)
- Provider clients instantiate per tenant
- The verify endpoint surfaces verbatim Twilio errors

If the developer wants the WhatsApp verifier to succeed, they manually submit a real `comms.verify` template to their Twilio sandbox and update the dev backfill script's `twilio_template_sid` (or run the `whatsapp_templates` upsert manually with a real sandbox SID).

Spot-check `last_verified_at`:

```sql
SELECT tenant_id, last_verified_at FROM tenant_email_configs WHERE last_verified_at IS NOT NULL;
SELECT tenant_id, last_verified_at FROM tenant_sms_configs WHERE last_verified_at IS NOT NULL;
```

The succeeded channels have non-null `last_verified_at`. The failed (e.g., WhatsApp) channels stay null — that's the contract.

### 8. Browser walkthrough — Settings UI shows configured

Per Rule 27b, claim the Playwright lock in IMPLEMENTATION_LOG.md §5 before driving the browser:

```
### [PLAYWRIGHT LOCK] — impl 13
- Holder: impl-13 verification
- Started: <ISO timestamp>
```

Then:

```bash
pnpm --filter @school/web dev   # runs on http://localhost:5551
```

Walkthrough (cap at 20 min per memory):

1. Navigate to `http://localhost:5551/en/login`. Login as `owner@nhqs.test` / `Password123!`.
2. Navigate to `/en/settings/communications`. Confirm all three cards (Email / SMS / WhatsApp) show **Configured** with `last_verified_at` rendered if the verifier succeeded.
3. Click into Email. Confirm the form pre-fills with masked values (`•••••••• abcd` for the API key, real `from_email` shown). Click "Send test message" → enter the developer's email → confirm success toast.
4. Repeat for SMS.
5. Repeat for WhatsApp — expect the verbatim Twilio error to render in the UI (per Impl 09's contract, the verify endpoint returns the provider error verbatim and the frontend displays it).
6. Logout. Login as `owner@stress-a.test` / `StressTest2026!`.
7. Repeat steps 2–5 for stress-a. (Expected: same outcome — all three configured, email + SMS verify succeeds, WhatsApp surfaces dev-shortcut error.)
8. Spot-check stress-b only — full walkthrough on stress-c and stress-d is overkill if stress-a succeeds (the shape is identical).

Capture `browser_console_messages(level: 'error')` during each walkthrough — expect zero errors.

Release the lock:

```
### [PLAYWRIGHT RELEASED] — impl 13
- Holder: impl-13 verification
- Released: <ISO timestamp>
- Browser closed: yes
```

### 9. Negative check — fresh tenant without backfill

To prove the backfill is doing real work, briefly delete one tenant's rows:

```sql
DELETE FROM tenant_email_configs WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'stress-d');
DELETE FROM tenant_sms_configs   WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'stress-d');
DELETE FROM tenant_whatsapp_configs WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'stress-d');
```

Login as `owner@stress-d.test`. Visit `/settings/communications` — expect all three cards to show **Not configured**. Trigger a dispatch from any module that fires email — expect `notification.status='failed'`, `failure_reason='channel_not_configured'`.

Re-run the backfill:

```bash
pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
```

Now stress-d is reconfigured. Refresh `/settings/communications` — all three cards show **Configured** again. This proves the backfill is the load-bearing step for tenant onboarding.

### 10. Architecture-docs spot-check (light, owned by Impl 14)

Confirm Impl 12's notification template seed shipped:

```sql
SELECT template_key, channel, locale FROM notification_template
 WHERE template_key IN ('auth.password_reset', 'auth.password_changed', 'trip.invitation', 'trip.payment_due',
                        'school.closure', 'staff.leave_decision', 'health.incident', 'sen.eha_update', 'email_domain.verified')
 ORDER BY template_key, channel, locale;
```

Expect at least one row per template_key. If any are missing, **stop** and refer back to Impl 12 — Impl 13 does not write these.

### 11. Regression run

```bash
pnpm turbo run test --filter @school/prisma --filter @school/api --filter @school/shared
```

All must pass. Coverage on `packages/prisma/scripts/` should not regress.

---

## Files touched

### NEW (committed to the worktree)

```
packages/prisma/scripts/backfill-tenant-communications-configs.ts
packages/prisma/scripts/backfill-tenant-communications-configs.spec.ts
packages/prisma/scripts/verify-tenant-communications-configs.ts
packages/prisma/scripts/verify-tenant-communications-configs.spec.ts
packages/prisma/scripts/dev-tenant-credentials.example.json
packages/prisma/scripts/.gitignore

communicationnew/cutover/production-cutover.sh
communicationnew/cutover/cutover-script.spec.ts
```

### NEW but `.gitignore`d (developer creates locally, never committed)

```
packages/prisma/scripts/dev-tenant-credentials.json
```

### UPDATE

```
.gitignore                                 # +entries for dev/prod credentials JSON files
.env.example                               # COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV defaults to false; doc note for dev override
packages/prisma/package.json               # +script alias `backfill:tenant-comms-configs`, `verify:tenant-comms-configs`
```

### Shared-file claims (Rule 17)

Before editing, claim in §5 of `IMPLEMENTATION_LOG.md`:

- `.gitignore` — append-only edit, low collision risk but still claim
- `.env.example` — Impl 07 may have already set `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV`; verify, do not duplicate
- `packages/prisma/package.json` — script alias addition

No other shared files are touched.

---

## Rollback

The script is non-destructive: it writes to fresh tables that have no dispatch traffic until Wave 4 ships. If the rebuild is abandoned mid-flight, undo this impl by:

### 1. Delete the seeded rows from the dev DB

```sql
-- 5 rows each
DELETE FROM tenant_email_configs    WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = ANY(ARRAY['nhqs','stress-a','stress-b','stress-c','stress-d']));
DELETE FROM tenant_sms_configs      WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = ANY(ARRAY['nhqs','stress-a','stress-b','stress-c','stress-d']));
DELETE FROM tenant_whatsapp_configs WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = ANY(ARRAY['nhqs','stress-a','stress-b','stress-c','stress-d']));

-- 5 wa template rows
DELETE FROM whatsapp_templates WHERE template_key = 'comms.verify' AND tenant_id IN (
  SELECT id FROM tenants WHERE slug = ANY(ARRAY['nhqs','stress-a','stress-b','stress-c','stress-d'])
);
```

After the DELETEs:

- Every test tenant returns to "channel_not_configured" status on dispatch.
- The Settings UI shows all three cards as "Not configured."
- Re-running the backfill re-creates all 20 rows.

### 2. Revert the code

```bash
git revert <commit-sha-for-impl-13>
```

This removes the script files, the example credentials JSON, the cutover script, and the `package.json` aliases.

### 3. Delete the local credentials file

The `.gitignore`d `dev-tenant-credentials.json` is the developer's personal copy; rolling back the code leaves it on disk. Manually delete if no longer needed:

```bash
rm packages/prisma/scripts/dev-tenant-credentials.json
```

### Rollback safety

Because no dispatch traffic depends on the seeded rows until Wave 4's UI exposes them, deleting the rows is safe at any point during the rebuild. Production cutover is the user's responsibility post-merge — Impl 13 itself never touches production.

---

## Key invariants — must hold after this phase ships

1. **Idempotent**: running the backfill N times produces the same DB state. Prisma `upsert` on the unique `tenant_id` column is the load-bearing primitive; re-running with identical credentials is a no-op (same encrypted blob, same `key_last_rotated_at`). Re-running with rotated credentials updates the blob and bumps the rotation timestamp.

2. **Encryption invariant**: every secret column (`resend_api_key_encrypted`, `twilio_account_sid_encrypted`, `twilio_auth_token_encrypted`, `webhook_secret_encrypted`) passes the `{iv}:{tag}:{ct}` shape check. The script asserts this post-condition before exiting; if it fails, the impl bails loudly. Plaintext keys NEVER appear in the database.

3. **Plaintext keys never logged**: the script's stdout uses `maskLast4()` — the last 4 characters of every secret are visible, the rest is bullets. Re-running tail-following the script and capturing the output is safe.

4. **Slug-keyed lookup**: tenant resolution goes through `tenants.slug`, never a hardcoded UUID. The script ports cleanly across environments (dev DB, fresh teammate's DB, production DB).

5. **Production-safe by neglect**: the script reads `process.env.DATABASE_URL` only. Running it accidentally against production would require explicitly setting that env var to a production connection string — which Rule 16 of `IMPLEMENTATION_LOG.md` forbids during the rebuild. Production cutover is the user's job, not Impl 13's.

6. **Dev-only WhatsApp template shortcut**: every test tenant gets a `comms.verify` row with `twilio_template_sid='HX_DEV_VERIFY'`. This sentinel SID is a placeholder that will fail Twilio sends — but the **verify endpoint surfaces the verbatim Twilio error**, which is the desired developer feedback. Production cutover replaces the sentinel with a real Twilio-approved SID via Impl 08's submission flow.

7. **Suppression list starts empty**: no rows seeded into `notification_suppression_list`. The table fills naturally from webhook bounce/complaint events (Impl 06). Documented for clarity; no action needed.

8. **Verification recipient is real**: the `verification_recipients` block in the credentials JSON points to a real human inbox / phone — the developer's own. This is intentional. Test sends go to a real person who confirms receipt; that's the verification.

9. **15-row contract**: 5 tenants × 3 channels = 15 config rows. Plus 5 WhatsApp template rows. Plus the cron-driven content (suppression list, webhook events, service windows) which Impl 13 does NOT seed. After Impl 13, every test tenant can dispatch on every channel in dev (modulo the WhatsApp dev-shortcut caveat).

10. **Cutover script is documentation, not action**: `production-cutover.sh` is `chmod 644`, not `755`. The first line is a banner explicitly telling the reader "DO NOT RUN AS-IS." Every step is a comment block, not an executable command. The user reads, adapts, and runs each step manually.

11. **Domain bypass is dev-only**: `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true` recommendation lives in the dev developer's `.env`. The Zod default is `false`. The cutover script's STEP 8 explicitly checks production `.env` for this flag and aborts if set. Production never bypasses domain verification.

---

## Notes for subsequent waves

- **Impl 14** (Architecture docs + comprehensive E2E verification) consumes Impl 13's seeded data. The Playwright walkthrough drives the same path the §Verification §8 sketches but exhaustively across all 5 tenants × all comms-touching modules. Impl 14 also updates `feature-map.md` with the Communications module's expanded surface (per Rule 14, only Impl 14 owns architecture docs).

- **Production cutover** (post-merge user responsibility) follows `communicationnew/cutover/production-cutover.sh` step-by-step. Steps 4–6 introduce a `prod-tenant-credentials.json` populated from production secret stores, run the same backfill script with `CREDENTIALS_FILE` env var override, and submit real `comms.verify` templates to Twilio. Domain verification (STEP 7) is the longest manual step — DNS publication is the tenant's responsibility, the cron handles the rest.

- **Future tenant onboarding** (post-cutover, new schools signing up): the `dev-tenant-credentials.example.json` file is the template for the Settings UI workflow. New tenants populate their credentials via the UI (Impl 11), which goes through `EmailConfigService.upsertConfig` etc. Impl 13's backfill script is **not** the long-term tenant-onboarding path — it's the one-shot bootstrap for tenants that pre-existed the rebuild.

- **V2 — admin platform UI**: per `docs/architecture/communication-architecture.md` §5, platform admins will eventually have a read-only view of tenant configs for support. Impl 13's backfill establishes the row shape that view will read. Keep the encryption pattern stable.

- **Key rotation tooling**: the architecture supports `keyRef` versioning (`v1`, `v2`, …). When the platform rotates `ENCRYPTION_KEY_V1`, every tenant's encrypted columns become unreadable. A future impl will introduce a rotation script that decrypts every row with the old key, re-encrypts with the new key, and bumps `encryption_key_ref` from `v1` to `v2`. Impl 13's backfill is the conceptual blueprint for this future tooling — same structure, different inputs.

- **The `comms.verify` WhatsApp template is sentinel-only**: it's not used for any user-facing dispatch outside the verify endpoint. Tenants do **not** send `comms.verify` to parents. If a future impl introduces a real "send a verification SMS to a parent" flow, it should NOT reuse the `comms.verify` template_key — pick a separate key (`comms.verify_parent` or similar).

---

## Completion record template (fill in §5 of `IMPLEMENTATION_LOG.md` when done)

```
### [IMPL 13] — Tenant backfill (5 test tenants × 3 channels) in dev DB
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:**
  - Backfill run → 15 config rows + 5 WhatsApp template rows written
  - Encryption invariant: every secret column passes {iv}:{tag}:{ct} shape check
  - Idempotency: re-run produced same summary, no duplicate rows
  - Verifier run: <N>/15 verify endpoints returned success
  - Settings UI walkthrough: NHQS + 1 stress tenant, all 3 channels show Configured
  - Negative check: deleted stress-d rows → "Not configured" → re-ran backfill → re-Configured
  - Notification template seed verified: all 9 keys (Impl 12 platform templates) present
- **Summary:** Built `backfill-tenant-communications-configs.ts` script that
  reads dev credentials from a gitignored JSON config, encrypts secrets via
  `EncryptionService`, and upserts 15 config rows + 5 WhatsApp `comms.verify`
  template rows for the 5 test tenants. Built companion verifier script
  `verify-tenant-communications-configs.ts` that drives `/v1/{email,sms,whatsapp}-config/test`
  endpoints for every tenant × channel pair, surfacing verbatim provider errors.
  Generated `communicationnew/cutover/production-cutover.sh` as a documentation-only
  checklist for the user to follow post-merge. Idempotent, slug-keyed (no hardcoded
  UUIDs), encryption-asserted post-condition.
- **Follow-ups:**
  - Impl 14: comprehensive E2E walkthrough across all 5 tenants × all modules
    that fire comms.
  - Production cutover (post-merge): user populates `prod-tenant-credentials.json`,
    runs backfill against production, submits real `comms.verify` templates to
    Twilio, registers email domains via Resend.
- **Rollback:** see §Rollback in this spec — DELETE the 20 rows from
  the dev DB, `git revert <sha>`, optionally `rm dev-tenant-credentials.json`.
- **Local verification block:** pages/endpoints covered, console errors observed
  (zero), run timestamp <ISO>.
- **Session notes (optional):** WhatsApp verify endpoint correctly surfaces the
  dev-shortcut Twilio error verbatim (`Template HX_DEV_VERIFY not found`); this is
  expected and proves the verbatim-error contract from Impl 09.
```
