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
 * Run order (after the schema + permissions + service layer impls have shipped):
 *   1. (Once) cp dev-tenant-credentials.example.json dev-tenant-credentials.json
 *      Populate with developer's own Resend / Twilio test credentials.
 *   2. pnpm tsx packages/prisma/scripts/backfill-tenant-communications-configs.ts
 *
 * Idempotent: Prisma `upsert` on the unique `tenant_id` column. Re-running with
 * identical credentials produces a no-op rotation (encrypted blobs change
 * because the IV is fresh per encrypt, but the underlying plaintext is the
 * same — `key_last_rotated_at` advances on every run by design).
 *
 * Production cutover: this same script runs against production after the user
 * merges the worktree to main and populates `prod-tenant-credentials.json`
 * via the CREDENTIALS_FILE env var. See
 * `communicationnew/cutover/production-cutover.sh` STEP 5.
 */
/* eslint-disable no-console */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const TENANT_SLUGS = ['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d'] as const;
type TenantSlug = (typeof TENANT_SLUGS)[number];
const SYSTEM_SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

// ─── Standalone encryption helper ────────────────────────────────────────────
// Mirrors apps/api/src/modules/configuration/encryption.service.ts
// (AES-256-GCM, {iv}:{tag}:{ct} hex format). Pulled out here so the script
// has no NestJS DI requirement and can run standalone via `pnpm tsx`.

interface EncryptionResult {
  encrypted: string;
  keyRef: string;
}

export class StandaloneEncryptor {
  private readonly key: Buffer;
  private readonly version: number;

  constructor(keyHex: string, version = 1) {
    const buf = Buffer.from(keyHex, 'hex');
    if (buf.length !== 32) {
      throw new Error(`Encryption key must be 32 bytes (64 hex characters), got ${buf.length}.`);
    }
    this.key = buf;
    this.version = version;
  }

  encrypt(plaintext: string): EncryptionResult {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`,
      keyRef: `v${this.version}`,
    };
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');
    const [ivHex, tagHex, ctHex] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }
}

function loadEncryptor(): StandaloneEncryptor {
  const v1 = process.env.ENCRYPTION_KEY_V1;
  const legacy = process.env.ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY_LOCAL;
  const keyHex = v1 ?? legacy;
  if (!keyHex) {
    throw new Error(
      'No encryption key configured. Set ENCRYPTION_KEY_V1 (or ENCRYPTION_KEY/ENCRYPTION_KEY_LOCAL) in your environment.',
    );
  }
  return new StandaloneEncryptor(keyHex, 1);
}

// ─── Config schema ───────────────────────────────────────────────────────────

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

export type CredentialsConfig = z.infer<typeof credentialsConfigSchema>;
export type TenantCredentialsBlock = z.infer<typeof tenantBlockSchema>;

const SCRIPT_DIR = path.resolve(__dirname);
const DEFAULT_CONFIG_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.json');
const EXAMPLE_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.example.json');

export function resolveConfigPath(): string {
  const override = process.env.CREDENTIALS_FILE;
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
  }
  return DEFAULT_CONFIG_PATH;
}

export function loadConfig(configPath: string = resolveConfigPath()): CredentialsConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing credentials file: ${configPath}\n` +
        `  → cp ${EXAMPLE_PATH} ${configPath}\n` +
        `  → populate with the developer's own test credentials\n` +
        `  → re-run this script`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const parsed = credentialsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`${configPath} failed schema validation:\n${issues}`);
  }
  return parsed.data;
}

export function maskLast4(secret: string): string {
  if (secret.length <= 4) return '****';
  return `${'•'.repeat(Math.min(secret.length - 4, 12))}${secret.slice(-4)}`;
}

export function assertEncryptedShape(label: string, encrypted: string, original: string): void {
  if (encrypted === original) {
    throw new Error(
      `[encryption regression] ${label} stored as plaintext — encryption pipeline broken`,
    );
  }
  if (encrypted.split(':').length !== 3) {
    throw new Error(
      `[encryption regression] ${label} not in {iv}:{tag}:{ct} format — got ${encrypted.slice(0, 40)}…`,
    );
  }
}

interface TenantRow {
  id: string;
  slug: string;
}

export interface BackfillResult {
  tenantsProcessed: number;
  emailRowsWritten: number;
  smsRowsWritten: number;
  whatsappRowsWritten: number;
  whatsappTemplateRowsWritten: number;
}

// ─── Per-channel upsert helpers ──────────────────────────────────────────────

async function backfillEmail(
  prisma: PrismaClient,
  encryptor: StandaloneEncryptor,
  tenant: TenantRow,
  block: TenantCredentialsBlock['email'],
): Promise<void> {
  const apiKeyEnc = encryptor.encrypt(block.resend_api_key);
  const webhookEnc = encryptor.encrypt(block.webhook_secret);
  assertEncryptedShape('email.resend_api_key', apiKeyEnc.encrypted, block.resend_api_key);
  assertEncryptedShape('email.webhook_secret', webhookEnc.encrypted, block.webhook_secret);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);

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
    `  [email]    tenant=${tenant.slug} from=${block.from_email} key=${maskLast4(block.resend_api_key)} webhook=${maskLast4(block.webhook_secret)} keyRef=${apiKeyEnc.keyRef}`,
  );
}

async function backfillSms(
  prisma: PrismaClient,
  encryptor: StandaloneEncryptor,
  tenant: TenantRow,
  block: TenantCredentialsBlock['sms'],
): Promise<void> {
  const sidEnc = encryptor.encrypt(block.twilio_account_sid);
  const tokenEnc = encryptor.encrypt(block.twilio_auth_token);
  const webhookEnc = encryptor.encrypt(block.webhook_secret);
  assertEncryptedShape('sms.account_sid', sidEnc.encrypted, block.twilio_account_sid);
  assertEncryptedShape('sms.auth_token', tokenEnc.encrypted, block.twilio_auth_token);
  assertEncryptedShape('sms.webhook_secret', webhookEnc.encrypted, block.webhook_secret);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);

    await tx.tenantSmsConfig.upsert({
      where: { tenant_id: tenant.id },
      create: {
        tenant_id: tenant.id,
        twilio_account_sid_encrypted: sidEnc.encrypted,
        twilio_auth_token_encrypted: tokenEnc.encrypted,
        twilio_from_number: block.twilio_from_number,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: sidEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
        last_verified_at: null,
      },
      update: {
        twilio_account_sid_encrypted: sidEnc.encrypted,
        twilio_auth_token_encrypted: tokenEnc.encrypted,
        twilio_from_number: block.twilio_from_number,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: sidEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
      },
    });
  });

  console.log(
    `  [sms]      tenant=${tenant.slug} sid=${maskLast4(block.twilio_account_sid)} token=${maskLast4(block.twilio_auth_token)} from=${block.twilio_from_number} webhook=${maskLast4(block.webhook_secret)} keyRef=${sidEnc.keyRef}`,
  );
}

async function backfillWhatsapp(
  prisma: PrismaClient,
  encryptor: StandaloneEncryptor,
  tenant: TenantRow,
  block: TenantCredentialsBlock['whatsapp'],
): Promise<void> {
  const sidEnc = encryptor.encrypt(block.twilio_account_sid);
  const tokenEnc = encryptor.encrypt(block.twilio_auth_token);
  const webhookEnc = encryptor.encrypt(block.webhook_secret);
  assertEncryptedShape('whatsapp.account_sid', sidEnc.encrypted, block.twilio_account_sid);
  assertEncryptedShape('whatsapp.auth_token', tokenEnc.encrypted, block.twilio_auth_token);
  assertEncryptedShape('whatsapp.webhook_secret', webhookEnc.encrypted, block.webhook_secret);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
    );
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);

    await tx.tenantWhatsAppConfig.upsert({
      where: { tenant_id: tenant.id },
      create: {
        tenant_id: tenant.id,
        twilio_account_sid_encrypted: sidEnc.encrypted,
        twilio_auth_token_encrypted: tokenEnc.encrypted,
        twilio_whatsapp_from_number: block.twilio_whatsapp_from_number,
        business_profile_id: block.business_profile_id ?? null,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: sidEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
        last_verified_at: null,
      },
      update: {
        twilio_account_sid_encrypted: sidEnc.encrypted,
        twilio_auth_token_encrypted: tokenEnc.encrypted,
        twilio_whatsapp_from_number: block.twilio_whatsapp_from_number,
        business_profile_id: block.business_profile_id ?? null,
        webhook_secret_encrypted: webhookEnc.encrypted,
        encryption_key_ref: sidEnc.keyRef,
        key_last_rotated_at: new Date(),
        is_enabled: true,
      },
    });
  });

  console.log(
    `  [whatsapp] tenant=${tenant.slug} sid=${maskLast4(block.twilio_account_sid)} token=${maskLast4(block.twilio_auth_token)} from=${block.twilio_whatsapp_from_number} webhook=${maskLast4(block.webhook_secret)} keyRef=${sidEnc.keyRef}`,
  );
}

async function seedWhatsappVerifyTemplate(prisma: PrismaClient, tenant: TenantRow): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
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

// ─── Main entry — exported for testing ───────────────────────────────────────

export async function runBackfill(
  prisma: PrismaClient,
  encryptor: StandaloneEncryptor,
  config: CredentialsConfig,
): Promise<BackfillResult> {
  const tenants = await prisma.$queryRaw<TenantRow[]>`
    SELECT id, slug FROM tenants
     WHERE slug = ANY(${[...TENANT_SLUGS]}::text[])
     ORDER BY slug
  `;

  const foundSlugs = new Set(tenants.map((t) => t.slug));
  for (const slug of TENANT_SLUGS) {
    if (!foundSlugs.has(slug)) {
      throw new Error(
        `tenant slug='${slug}' not found in DB — run the seed first or check connection target`,
      );
    }
  }

  let emailRowsWritten = 0;
  let smsRowsWritten = 0;
  let whatsappRowsWritten = 0;
  let whatsappTemplateRowsWritten = 0;

  for (const tenant of tenants) {
    console.log(`\n[tenant=${tenant.slug}, id=${tenant.id}]`);
    const block = config[tenant.slug as TenantSlug];
    if (!block) {
      throw new Error(`Credentials block missing for slug=${tenant.slug}`);
    }

    await backfillEmail(prisma, encryptor, tenant, block.email);
    emailRowsWritten++;

    await backfillSms(prisma, encryptor, tenant, block.sms);
    smsRowsWritten++;

    await backfillWhatsapp(prisma, encryptor, tenant, block.whatsapp);
    whatsappRowsWritten++;

    await seedWhatsappVerifyTemplate(prisma, tenant);
    whatsappTemplateRowsWritten++;
  }

  // ─── Post-condition: every encrypted column is non-plaintext ──────────────
  const emailRows = await prisma.tenantEmailConfig.findMany({
    where: { tenant_id: { in: tenants.map((t) => t.id) } },
    select: { tenant_id: true, resend_api_key_encrypted: true, webhook_secret_encrypted: true },
  });
  const smsRows = await prisma.tenantSmsConfig.findMany({
    where: { tenant_id: { in: tenants.map((t) => t.id) } },
    select: {
      tenant_id: true,
      twilio_account_sid_encrypted: true,
      twilio_auth_token_encrypted: true,
    },
  });
  const waRows = await prisma.tenantWhatsAppConfig.findMany({
    where: { tenant_id: { in: tenants.map((t) => t.id) } },
    select: {
      tenant_id: true,
      twilio_account_sid_encrypted: true,
      twilio_auth_token_encrypted: true,
    },
  });

  for (const row of emailRows) {
    if (row.resend_api_key_encrypted.split(':').length !== 3) {
      throw new Error(
        `email row ${row.tenant_id} — resend_api_key_encrypted not in {iv}:{tag}:{ct} format`,
      );
    }
  }
  for (const row of smsRows) {
    if (row.twilio_auth_token_encrypted.split(':').length !== 3) {
      throw new Error(
        `sms row ${row.tenant_id} — twilio_auth_token_encrypted not in {iv}:{tag}:{ct} format`,
      );
    }
  }
  for (const row of waRows) {
    if (row.twilio_auth_token_encrypted.split(':').length !== 3) {
      throw new Error(
        `whatsapp row ${row.tenant_id} — twilio_auth_token_encrypted not in {iv}:{tag}:{ct} format`,
      );
    }
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(`Tenants processed:       ${tenants.length} / ${TENANT_SLUGS.length}`);
  console.log(`Email config rows:       ${emailRowsWritten}`);
  console.log(`SMS config rows:         ${smsRowsWritten}`);
  console.log(`WhatsApp config rows:    ${whatsappRowsWritten}`);
  console.log(
    `WhatsApp template rows:  ${whatsappTemplateRowsWritten} (one comms.verify per tenant)`,
  );
  console.log(
    `Encryption invariant:    every secret column passes the {iv}:{tag}:{ct} shape check`,
  );
  console.log('──────────────────────────────────────────────');

  return {
    tenantsProcessed: tenants.length,
    emailRowsWritten,
    smsRowsWritten,
    whatsappRowsWritten,
    whatsappTemplateRowsWritten,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
  }
  const config = loadConfig();
  const encryptor = loadEncryptor();
  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

  try {
    await runBackfill(prisma, encryptor, config);
    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
