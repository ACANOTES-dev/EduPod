import { Injectable } from '@nestjs/common';

import {
  ACCOUNT_LOCKOUT_DURATION_MINUTES,
  ACCOUNT_LOCKOUT_THRESHOLD,
  BRUTE_FORCE_THRESHOLDS,
  BRUTE_FORCE_WINDOW_SECONDS,
  IP_LOGIN_THROTTLE_MAX_ATTEMPTS,
  IP_LOGIN_THROTTLE_WINDOW_SECONDS,
} from '@school/shared';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── RateLimitService ───────────────────────────────────────────────────────

@Injectable()
export class RateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

  // ─── Email-based brute force ──────────────────────────────────────────────

  async checkBruteForce(email: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
    const client = this.redis.getClient();
    const key = `brute_force:${email}`;
    const failureCount = parseInt((await client.get(key)) || '0', 10);

    for (let i = BRUTE_FORCE_THRESHOLDS.length - 1; i >= 0; i--) {
      const threshold = BRUTE_FORCE_THRESHOLDS[i];
      if (threshold && failureCount >= threshold.failures) {
        return { blocked: true, retryAfterSeconds: threshold.delaySeconds };
      }
    }

    return { blocked: false, retryAfterSeconds: 0 };
  }

  async recordFailedLogin(email: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const client = this.redis.getClient();
    const key = `brute_force:${email}`;
    const failureCount = await client.incr(key);
    await client.expire(key, BRUTE_FORCE_WINDOW_SECONDS);

    if (!ipAddress) {
      return;
    }

    const threshold = BRUTE_FORCE_THRESHOLDS.find(
      (candidate) => candidate.failures === failureCount,
    );

    if (threshold) {
      await this.securityAuditService.logBruteForceLockout(
        email,
        ipAddress,
        threshold.delaySeconds / 60,
        null,
        userAgent,
      );
    }
  }

  async clearBruteForce(email: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`brute_force:${email}`);
  }

  // ─── IP-based login throttle ──────────────────────────────────────────────

  async checkIpThrottle(ipAddress: string): Promise<{ blocked: boolean }> {
    const client = this.redis.getClient();
    const key = `ip_login_throttle:${ipAddress}`;
    const failureCount = parseInt((await client.get(key)) || '0', 10);

    return { blocked: failureCount >= IP_LOGIN_THROTTLE_MAX_ATTEMPTS };
  }

  async recordIpFailedLogin(ipAddress: string): Promise<void> {
    const client = this.redis.getClient();
    const key = `ip_login_throttle:${ipAddress}`;
    await client.incr(key);
    await client.expire(key, IP_LOGIN_THROTTLE_WINDOW_SECONDS);
  }

  async clearIpThrottle(ipAddress: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`ip_login_throttle:${ipAddress}`);
  }

  // ─── Account lockout ──────────────────────────────────────────────────────

  /**
   * Checks whether the account is currently locked. Returns true if locked_until
   * is in the future, false otherwise (including if the lock has expired).
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locked_until: true },
    });

    if (!user?.locked_until) return false;
    return user.locked_until > new Date();
  }

  /**
   * Increments the user's failed_login_attempts counter. If the threshold is
   * reached, sets locked_until to now + lockout duration.
   */
  async recordAccountFailedLogin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failed_login_attempts: true },
    });

    const newCount = (user?.failed_login_attempts ?? 0) + 1;

    const data: { failed_login_attempts: number; locked_until?: Date } = {
      failed_login_attempts: newCount,
    };

    if (newCount >= ACCOUNT_LOCKOUT_THRESHOLD) {
      data.locked_until = new Date(
        Date.now() + ACCOUNT_LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Resets the failed login counter and clears any lockout on successful login.
   */
  async clearAccountLockout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failed_login_attempts: 0, locked_until: null },
    });
  }
}
