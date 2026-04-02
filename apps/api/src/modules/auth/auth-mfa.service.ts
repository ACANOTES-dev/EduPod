import * as crypto from 'crypto';

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret as otpGenerateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import type { MfaSetupResult } from './auth.types';

// ─── MfaService ─────────────────────────────────────────────────────────────

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

  async setupMfa(userId: string): Promise<MfaSetupResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Generate TOTP secret
    const secret = otpGenerateSecret();

    // Encrypt the secret before storing
    const { encrypted, keyRef } = this.encryptionService.encrypt(secret);

    // Store encrypted secret temporarily (don't enable MFA yet)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfa_secret: encrypted, mfa_secret_key_ref: keyRef },
    });

    // Generate otpauth URI
    const issuer = this.configService.get<string>('MFA_ISSUER') || 'SchoolOS';
    const otpauthUri = generateURI({
      issuer,
      label: user.email,
      secret,
    });

    // Generate QR code data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauthUri);

    return {
      secret,
      qr_code_url: qrCodeUrl,
      otpauth_uri: otpauthUri,
    };
  }

  async verifyMfaSetup(userId: string, code: string): Promise<{ recovery_codes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (!user.mfa_secret) {
      throw new BadRequestException({
        code: 'MFA_NOT_SETUP',
        message: 'MFA setup has not been initiated. Call /mfa/setup first.',
      });
    }

    // Decrypt the stored secret before TOTP verification
    const decryptedSecret = this.decryptMfaSecret(user.mfa_secret, user.mfa_secret_key_ref);

    // Verify TOTP code against secret
    const verifyResult = await otpVerify({
      token: code,
      secret: decryptedSecret,
    });
    const isValid = verifyResult.valid;

    if (!isValid) {
      throw new UnauthorizedException({
        code: 'INVALID_MFA_CODE',
        message: 'Invalid MFA code. Please try again.',
      });
    }

    // Enable MFA on user
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfa_enabled: true },
    });

    // Generate 10 recovery codes
    const recoveryCodes: string[] = [];
    const codeHashes: Array<{ user_id: string; code_hash: string }> = [];

    for (let i = 0; i < 10; i++) {
      const recoveryCode = crypto.randomBytes(4).toString('hex');
      recoveryCodes.push(recoveryCode);
      codeHashes.push({
        user_id: userId,
        code_hash: crypto.createHash('sha256').update(recoveryCode).digest('hex'),
      });
    }

    // Delete any existing recovery codes
    await this.prisma.mfaRecoveryCode.deleteMany({
      where: { user_id: userId },
    });

    // Store hashed codes
    await this.prisma.mfaRecoveryCode.createMany({
      data: codeHashes,
    });

    await this.securityAuditService.logMfaSetup(userId);

    return { recovery_codes: recoveryCodes };
  }

  async useRecoveryCode(userId: string, code: string): Promise<void> {
    // Get all unused recovery codes for user
    const recoveryCodes = await this.prisma.mfaRecoveryCode.findMany({
      where: { user_id: userId, used_at: null },
    });

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const matchingCode = recoveryCodes.find((rc) => rc.code_hash === codeHash);

    if (!matchingCode) {
      throw new UnauthorizedException({
        code: 'INVALID_RECOVERY_CODE',
        message: 'Invalid recovery code',
      });
    }

    // Mark as used
    await this.prisma.mfaRecoveryCode.update({
      where: { id: matchingCode.id },
      data: { used_at: new Date() },
    });
  }

  /**
   * Verify a TOTP code against the user's stored (encrypted) MFA secret.
   * Returns true if the code is valid, false otherwise.
   */
  async verifyTotp(
    code: string,
    mfaSecret: string,
    mfaSecretKeyRef: string | null,
  ): Promise<boolean> {
    const decryptedSecret = this.decryptMfaSecret(mfaSecret, mfaSecretKeyRef);

    const verifyResult = await otpVerify({
      token: code,
      secret: decryptedSecret,
    });
    return verifyResult.valid;
  }

  /**
   * Decrypt an MFA TOTP secret. Handles both legacy plaintext secrets
   * (where keyRef is null, pre-encryption migration) and encrypted secrets.
   */
  decryptMfaSecret(encrypted: string, keyRef: string | null): string {
    if (!keyRef) {
      // Legacy plaintext — return as-is (pre-migration data)
      return encrypted;
    }
    return this.encryptionService.decrypt(encrypted, keyRef);
  }
}
