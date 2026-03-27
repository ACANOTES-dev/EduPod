import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EncryptionResult {
  encrypted: string;
  keyRef: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly keys: Map<number, Buffer>;
  private readonly currentVersion: number;

  constructor(private readonly configService: ConfigService) {
    this.keys = new Map<number, Buffer>();

    // ─── Load versioned keys (ENCRYPTION_KEY_V1, _V2, ...) ──────────────────
    for (let v = 1; v <= 100; v++) {
      const hex = this.configService.get<string>(`ENCRYPTION_KEY_V${v}`);
      if (!hex) break;
      const buf = Buffer.from(hex, 'hex');
      if (buf.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY_V${v} must be 32 bytes (64 hex characters), got ${buf.length}.`,
        );
      }
      this.keys.set(v, buf);
    }

    // ─── Backward compatibility: fall back to legacy env vars as v1 ─────────
    if (!this.keys.has(1)) {
      const legacyHex =
        this.configService.get<string>('ENCRYPTION_KEY') ??
        this.configService.get<string>('ENCRYPTION_KEY_LOCAL');

      if (legacyHex) {
        const buf = Buffer.from(legacyHex, 'hex');
        if (buf.length !== 32) {
          throw new Error('Encryption key must be 32 bytes (64 hex characters).');
        }
        this.keys.set(1, buf);
      }
    }

    // ─── Determine current version ──────────────────────────────────────────
    const versionStr = this.configService.get<string>('ENCRYPTION_CURRENT_VERSION');
    this.currentVersion = versionStr ? parseInt(versionStr, 10) : 1;

    if (!this.keys.has(this.currentVersion)) {
      throw new Error(
        `Current encryption key version ${this.currentVersion} is not configured. ` +
          `Set ENCRYPTION_KEY_V${this.currentVersion} env var (64 hex chars = 32 bytes).`,
      );
    }

    if (this.keys.size === 0) {
      throw new Error(
        'No encryption keys configured. Set ENCRYPTION_KEY_V1 or ENCRYPTION_KEY / ENCRYPTION_KEY_LOCAL env var.',
      );
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM with the current version key.
   * Returns format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
   */
  encrypt(plaintext: string): EncryptionResult {
    const key = this.keys.get(this.currentVersion);
    if (!key) {
      throw new InternalServerErrorException({
        error: { code: 'ENCRYPTION_KEY_MISSING', message: 'Current encryption key not available' },
      });
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`,
      keyRef: `v${this.currentVersion}`,
    };
  }

  /**
   * Decrypt a value encrypted with encrypt().
   * Handles versioned keyRefs (v1, v2, ...) and legacy keyRefs (aws, local).
   */
  decrypt(encrypted: string, keyRef: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException({
        error: { code: 'DECRYPTION_FAILED', message: 'Failed to decrypt value' },
      });
    }

    const version = this.resolveKeyVersion(keyRef);
    const key = this.keys.get(version);

    if (!key) {
      throw new InternalServerErrorException({
        error: {
          code: 'DECRYPTION_KEY_MISSING',
          message: `Encryption key for version ${version} (keyRef: ${keyRef}) is not available`,
        },
      });
    }

    try {
      const ivHex = parts[0] as string;
      const authTagHex = parts[1] as string;
      const ciphertextHex = parts[2] as string;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Decryption failed: ${err.message}`, err.stack);
      throw new InternalServerErrorException({
        error: { code: 'DECRYPTION_FAILED', message: 'Failed to decrypt value' },
      });
    }
  }

  /** Returns the current key version number (e.g. 1, 2). */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /** Returns the current keyRef string (e.g. 'v1', 'v2'). */
  getKeyRef(): string {
    return `v${this.currentVersion}`;
  }

  /**
   * Mask a string, showing only the last 4 characters.
   * Returns '****{last4}' or '****' if string is shorter than 4.
   */
  mask(value: string): string {
    if (value.length <= 4) {
      return '****';
    }
    return `****${value.slice(-4)}`;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Resolve a keyRef string to a key version number.
   * - 'v1', 'v2', ... → parsed version number
   * - 'aws', 'local' → 1 (backward compat for legacy data)
   * - Unknown → fall back to v1 with a warning
   */
  private resolveKeyVersion(keyRef: string): number {
    // Versioned keyRef: 'v1', 'v2', etc.
    const versionMatch = /^v(\d+)$/.exec(keyRef);
    if (versionMatch) {
      return parseInt(versionMatch[1] as string, 10);
    }

    // Legacy keyRefs from before multi-key support
    if (keyRef === 'aws' || keyRef === 'local') {
      return 1;
    }

    // Unknown keyRef — try v1 as fallback
    this.logger.warn(
      `Unknown keyRef "${keyRef}" encountered during decryption, falling back to v1`,
    );
    return 1;
  }
}
