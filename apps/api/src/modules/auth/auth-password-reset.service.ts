import * as crypto from 'crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { SessionService } from './auth-session.service';

// ─── PasswordResetService ───────────────────────────────────────────────────

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly sessionService: SessionService,
  ) {}

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success to avoid leaking user existence
    if (!user) {
      await this.securityAuditService.logPasswordReset(null, 'email', email);
      return { message: 'If email exists, reset link sent' };
    }

    // Check count of active (unexpired, unused) tokens - max 3
    const activeTokenCount = await this.prisma.passwordResetToken.count({
      where: {
        user_id: user.id,
        used_at: null,
        expires_at: { gt: new Date() },
      },
    });

    if (activeTokenCount >= 3) {
      await this.securityAuditService.logPasswordReset(user.id, 'email', email);
      return { message: 'If email exists, reset link sent' };
    }

    // Generate random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Store with 1-hour expiry
    await this.prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await this.securityAuditService.logPasswordReset(user.id, 'email', email);

    // Note: actual email sending deferred to Phase 7
    // In a real implementation, rawToken would be sent via email
    return { message: 'If email exists, reset link sent' };
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<{ message: string }> {
    // 1. Hash the provided token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Find matching token
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
    });

    if (!resetToken) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Invalid or expired reset token',
      });
    }

    // 3. Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // 4. Update user's password_hash
    await this.prisma.user.update({
      where: { id: resetToken.user_id },
      data: { password_hash: passwordHash },
    });

    // 5. Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used_at: new Date() },
    });

    // 6. Invalidate all other active tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        user_id: resetToken.user_id,
        used_at: null,
        id: { not: resetToken.id },
      },
      data: { used_at: new Date() },
    });

    // 7. Delete all Redis sessions for this user
    await this.sessionService.deleteAllUserSessions(resetToken.user_id);
    await this.securityAuditService.logPasswordChange(resetToken.user_id);

    return { message: 'Password reset successfully' };
  }
}
