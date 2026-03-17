import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

interface EncryptionResult {
  encrypted: string;
  keyRef: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly keyRef: string;

  constructor(private readonly configService: ConfigService) {
    const keyHex =
      this.configService.get<string>('ENCRYPTION_KEY') ??
      this.configService.get<string>('ENCRYPTION_KEY_LOCAL');

    if (!keyHex) {
      throw new Error(
        'Encryption key not configured. Set ENCRYPTION_KEY or ENCRYPTION_KEY_LOCAL env var (64 hex chars = 32 bytes).',
      );
    }

    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters).');
    }

    // In production this would be an AWS Secrets Manager ARN
    this.keyRef = this.configService.get<string>('ENCRYPTION_KEY') ? 'aws' : 'local';
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
   */
  encrypt(plaintext: string): EncryptionResult {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`,
      keyRef: this.keyRef,
    };
  }

  /**
   * Decrypt a value encrypted with encrypt().
   * Expects format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
   */
  decrypt(encrypted: string, _keyRef: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException({
        error: { code: 'DECRYPTION_FAILED', message: 'Failed to decrypt value' },
      });
    }

    try {
      const ivHex = parts[0] as string;
      const authTagHex = parts[1] as string;
      const ciphertextHex = parts[2] as string;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

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
}
