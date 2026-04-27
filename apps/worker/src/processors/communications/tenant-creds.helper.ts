import { createDecipheriv } from 'crypto';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('TenantCredsHelper');

/**
 * Worker-side, lightweight per-tenant credential resolver.
 *
 * Mirrors `apps/api/src/modules/configuration/{email,sms,whatsapp}-config.service.ts`
 * `getDecryptedConfig` semantics WITHOUT importing the full API config-service
 * DI graph (which depends on `PrismaService` + `RequestContextService`, neither of
 * which the worker has).
 *
 * After Impl 05 of the comms overhaul, this is the ONLY path the worker has to
 * resolve credentials. The platform `.env` fallback is removed.
 */

export interface DecryptedEmailCreds {
  resend_api_key: string;
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  is_enabled: boolean;
}

export interface DecryptedSmsCreds {
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_number: string;
  is_enabled: boolean;
}

export interface DecryptedWhatsAppCreds {
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_whatsapp_from_number: string;
  is_enabled: boolean;
}

// ─── AES-256-GCM decryption (mirrors EncryptionService.decrypt) ──────────────

function loadKeys(configService: ConfigService): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (let v = 1; v <= 100; v++) {
    const hex = configService.get<string>(`ENCRYPTION_KEY_V${v}`);
    if (!hex) break;
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) {
      throw new Error(`ENCRYPTION_KEY_V${v} must be 32 bytes (64 hex chars)`);
    }
    keys.set(v, buf);
  }
  if (!keys.has(1)) {
    const legacy =
      configService.get<string>('ENCRYPTION_KEY') ??
      configService.get<string>('ENCRYPTION_KEY_LOCAL');
    if (legacy) {
      const buf = Buffer.from(legacy, 'hex');
      if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
      keys.set(1, buf);
    }
  }
  return keys;
}

function resolveKeyVersion(keyRef: string): number {
  if (keyRef.startsWith('v')) {
    const n = parseInt(keyRef.slice(1), 10);
    if (!Number.isNaN(n)) return n;
  }
  // Legacy values like 'aws' / 'local' resolved to v1 in EncryptionService
  return 1;
}

function decrypt(encrypted: string, keyRef: string, configService: ConfigService): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Decryption failed: malformed ciphertext');
  }
  const keys = loadKeys(configService);
  const version = resolveKeyVersion(keyRef);
  const key = keys.get(version);
  if (!key) {
    throw new Error(`Encryption key for version ${version} (keyRef=${keyRef}) not available`);
  }
  const iv = Buffer.from(parts[0] as string, 'hex');
  const authTag = Buffer.from(parts[1] as string, 'hex');
  const ciphertext = Buffer.from(parts[2] as string, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// ─── Per-channel resolvers ───────────────────────────────────────────────────

export async function getEmailCreds(
  prisma: PrismaClient,
  configService: ConfigService,
  tenantId: string,
): Promise<DecryptedEmailCreds | null> {
  const row = await prisma.tenantEmailConfig.findUnique({ where: { tenant_id: tenantId } });
  if (!row) return null;
  try {
    return {
      resend_api_key: decrypt(row.resend_api_key_encrypted, row.encryption_key_ref, configService),
      from_email: row.from_email,
      from_name: row.from_name,
      reply_to_email: row.reply_to_email,
      is_enabled: row.is_enabled,
    };
  } catch (err) {
    logger.error(
      `Failed to decrypt email creds for tenant=${tenantId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export async function getSmsCreds(
  prisma: PrismaClient,
  configService: ConfigService,
  tenantId: string,
): Promise<DecryptedSmsCreds | null> {
  const row = await prisma.tenantSmsConfig.findUnique({ where: { tenant_id: tenantId } });
  if (!row) return null;
  try {
    return {
      twilio_account_sid: decrypt(
        row.twilio_account_sid_encrypted,
        row.encryption_key_ref,
        configService,
      ),
      twilio_auth_token: decrypt(
        row.twilio_auth_token_encrypted,
        row.encryption_key_ref,
        configService,
      ),
      twilio_from_number: row.twilio_from_number,
      is_enabled: row.is_enabled,
    };
  } catch (err) {
    logger.error(
      `Failed to decrypt SMS creds for tenant=${tenantId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

export async function getWhatsAppCreds(
  prisma: PrismaClient,
  configService: ConfigService,
  tenantId: string,
): Promise<DecryptedWhatsAppCreds | null> {
  const row = await prisma.tenantWhatsAppConfig.findUnique({ where: { tenant_id: tenantId } });
  if (!row) return null;
  try {
    return {
      twilio_account_sid: decrypt(
        row.twilio_account_sid_encrypted,
        row.encryption_key_ref,
        configService,
      ),
      twilio_auth_token: decrypt(
        row.twilio_auth_token_encrypted,
        row.encryption_key_ref,
        configService,
      ),
      twilio_whatsapp_from_number: row.twilio_whatsapp_from_number,
      is_enabled: row.is_enabled,
    };
  } catch (err) {
    logger.error(
      `Failed to decrypt WhatsApp creds for tenant=${tenantId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
