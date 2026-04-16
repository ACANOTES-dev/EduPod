import * as crypto from 'crypto';

import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

import {
  ACCOUNT_LOCKOUT_DURATION_MINUTES,
  ACCOUNT_LOCKOUT_THRESHOLD,
  type JwtPayload,
  type RefreshTokenPayload,
  type SessionMetadata,
} from '@school/shared';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { MfaService } from './auth-mfa.service';
import { PasswordResetService } from './auth-password-reset.service';
import { RateLimitService } from './auth-rate-limit.service';
import { SessionService } from './auth-session.service';
import { TokenService } from './auth-token.service';
import type {
  LoginResult,
  MfaRequiredResult,
  MfaSetupResult,
  SanitisedUser,
  SessionInfo,
} from './auth.types';

export type { LoginResult, MfaRequiredResult, MfaSetupResult, SanitisedUser, SessionInfo };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly rateLimitService: RateLimitService,
    private readonly mfaService: MfaService,
    private readonly passwordResetService: PasswordResetService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  // ─── Token signing / verification (delegates to TokenService) ──────────────

  signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'type'>): string {
    return this.tokenService.signAccessToken(payload);
  }

  signRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'type'>): string {
    return this.tokenService.signRefreshToken(payload);
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.tokenService.verifyAccessToken(token);
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.tokenService.verifyRefreshToken(token);
  }

  // ─── Session CRUD (delegates to SessionService) ───────────────────────────

  async createSession(session: SessionMetadata): Promise<void> {
    return this.sessionService.createSession(session);
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    return this.sessionService.getSession(sessionId);
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    return this.sessionService.deleteSession(sessionId, userId);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    return this.sessionService.deleteAllUserSessions(userId);
  }

  // ─── Brute Force Protection (delegates to RateLimitService) ───────────────

  async checkBruteForce(email: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
    return this.rateLimitService.checkBruteForce(email);
  }

  async recordFailedLogin(email: string, ipAddress?: string, userAgent?: string): Promise<void> {
    return this.rateLimitService.recordFailedLogin(email, ipAddress, userAgent);
  }

  async clearBruteForce(email: string): Promise<void> {
    return this.rateLimitService.clearBruteForce(email);
  }

  // ─── Core Auth Methods ────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string,
    tenantId?: string,
    mfaCode?: string,
  ): Promise<LoginResult | MfaRequiredResult> {
    // 1–4. Validate credentials and user status
    const user = await this.validateCredentialsAndStatus(
      email,
      password,
      ipAddress,
      userAgent,
      tenantId ?? null,
    );

    // 5. Tenant context checks
    let membershipId: string | null = null;
    if (tenantId) {
      const membership = await runWithRlsContext(
        this.prisma,
        { tenant_id: tenantId, user_id: user.id },
        async (tx) =>
          tx.tenantMembership.findUnique({
            where: {
              idx_tenant_memberships_tenant_user: {
                tenant_id: tenantId,
                user_id: user.id,
              },
            },
            include: { tenant: true },
          }),
      );

      if (!membership || membership.membership_status !== 'active') {
        await this.securityAuditService.logLoginFailure(
          email,
          ipAddress,
          'MEMBERSHIP_NOT_ACTIVE',
          tenantId ?? null,
          userAgent,
        );
        throw new ForbiddenException({
          code: 'MEMBERSHIP_NOT_ACTIVE',
          message: 'You do not have an active membership at this school',
        });
      }

      // Check tenant status
      if (membership.tenant.status === 'suspended') {
        await this.securityAuditService.logLoginFailure(
          email,
          ipAddress,
          'TENANT_SUSPENDED',
          tenantId ?? null,
          userAgent,
        );
        throw new ForbiddenException({
          code: 'TENANT_SUSPENDED',
          message: 'This school account has been suspended',
        });
      }
      if (membership.tenant.status === 'archived') {
        await this.securityAuditService.logLoginFailure(
          email,
          ipAddress,
          'TENANT_ARCHIVED',
          tenantId ?? null,
          userAgent,
        );
        throw new ForbiddenException({
          code: 'TENANT_ARCHIVED',
          message: 'This school account has been archived',
        });
      }

      membershipId = membership.id;
    }

    // 6. MFA check
    if (user.mfa_enabled) {
      if (!mfaCode) {
        // Return MFA required, issue a short-lived temp token
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET not configured');

        const mfaToken = jwt.sign(
          {
            sub: user.id,
            email: user.email,
            tenant_id: tenantId || null,
            membership_id: membershipId,
            type: 'mfa_pending',
          },
          secret,
          { expiresIn: '5m' },
        );

        return { mfa_required: true, mfa_token: mfaToken };
      }

      // Verify TOTP
      if (!user.mfa_secret) {
        await this.securityAuditService.logLoginFailure(
          email,
          ipAddress,
          'MFA_NOT_CONFIGURED',
          tenantId ?? null,
          userAgent,
        );
        throw new UnauthorizedException({
          code: 'MFA_NOT_CONFIGURED',
          message: 'MFA is enabled but not configured properly',
        });
      }

      // Delegate TOTP verification to MfaService
      const isValid = await this.mfaService.verifyTotp(
        mfaCode,
        user.mfa_secret,
        user.mfa_secret_key_ref,
      );

      if (!isValid) {
        await this.securityAuditService.logLoginFailure(
          email,
          ipAddress,
          'INVALID_MFA_CODE',
          tenantId ?? null,
          userAgent,
        );
        throw new UnauthorizedException({
          code: 'INVALID_MFA_CODE',
          message: 'Invalid MFA code',
        });
      }
    }

    // 7. Clear brute force counter
    await this.clearBruteForce(email);

    // 8. Update last_login_at
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    // 9. Create session
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: SessionMetadata = {
      user_id: user.id,
      session_id: sessionId,
      tenant_id: tenantId || null,
      membership_id: membershipId,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: now,
      last_active_at: now,
    };
    await this.createSession(session);
    await this.securityAuditService.logLoginSuccess(
      user.id,
      ipAddress,
      userAgent,
      tenantId ?? null,
      sessionId,
    );

    // 10. Generate tokens
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      tenant_id: tenantId || null,
      membership_id: membershipId,
    });

    const refreshToken = this.signRefreshToken({
      sub: user.id,
      session_id: sessionId,
    });

    // 11. Return
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: this.sanitiseUser(user),
    };
  }

  async refresh(
    refreshToken: string,
    requestedTenantId?: string | null,
  ): Promise<{ access_token: string; refresh_token: string }> {
    // 1. Verify refresh token
    let payload: RefreshTokenPayload;
    try {
      payload = this.verifyRefreshToken(refreshToken);
    } catch (err) {
      this.logger.error(
        '[refresh] refresh token verification failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    // 2. Get session from Redis
    const session = await this.getSession(payload.session_id);
    if (!session) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session has expired or been revoked',
      });
    }

    // 3. Check user global_status
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.global_status !== 'active') {
      await this.deleteAllUserSessions(user.id);
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'Your account is no longer active',
      });
    }

    if (!session.tenant_id && requestedTenantId) {
      const membership = await runWithRlsContext(
        this.prisma,
        { tenant_id: requestedTenantId, user_id: user.id },
        async (tx) =>
          tx.tenantMembership.findUnique({
            where: {
              idx_tenant_memberships_tenant_user: {
                tenant_id: requestedTenantId,
                user_id: user.id,
              },
            },
            include: { tenant: true },
          }),
      );

      if (!membership || membership.membership_status !== 'active') {
        throw new ForbiddenException({
          code: 'MEMBERSHIP_NOT_ACTIVE',
          message: 'You do not have an active membership at this school',
        });
      }

      if (membership.tenant.status !== 'active') {
        throw new ForbiddenException({
          code: 'TENANT_NOT_ACTIVE',
          message: 'This school account is not active',
        });
      }

      session.tenant_id = requestedTenantId;
      session.membership_id = membership.id;
    }

    // 4. If tenant_id in session, check tenant suspension
    if (session.tenant_id) {
      const client = this.redis.getClient();
      const suspended = await client.get(`tenant:${session.tenant_id}:suspended`);
      if (suspended) {
        throw new ForbiddenException({
          code: 'TENANT_SUSPENDED',
          message: 'This school account has been suspended',
        });
      }

      // Also check DB for more accuracy
      const tenant = await this.tenantReadFacade.findById(session.tenant_id);
      if (tenant && tenant.status !== 'active') {
        throw new ForbiddenException({
          code: 'TENANT_NOT_ACTIVE',
          message: 'This school account is no longer active',
        });
      }
    }

    // 5. Update last_active_at on session
    session.last_active_at = new Date().toISOString();
    const client = this.redis.getClient();
    await client.set(
      `session:${session.session_id}`,
      JSON.stringify(session),
      'EX',
      7 * 24 * 60 * 60,
    );

    // 6. Issue new access token and rotated refresh token
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      tenant_id: session.tenant_id,
      membership_id: session.membership_id,
    });

    const newRefreshToken = this.signRefreshToken({
      sub: user.id,
      session_id: session.session_id,
    });

    return { access_token: accessToken, refresh_token: newRefreshToken };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.deleteSession(sessionId, userId);
  }

  // ─── Password Reset (delegates to PasswordResetService) ───────────────────

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return this.passwordResetService.requestPasswordReset(email);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<{ message: string }> {
    return this.passwordResetService.confirmPasswordReset(token, newPassword);
  }

  // ─── MFA (delegates to MfaService) ────────────────────────────────────────

  async setupMfa(userId: string): Promise<MfaSetupResult> {
    return this.mfaService.setupMfa(userId);
  }

  async verifyMfaSetup(userId: string, code: string): Promise<{ recovery_codes: string[] }> {
    return this.mfaService.verifyMfaSetup(userId, code);
  }

  async useRecoveryCode(userId: string, code: string): Promise<void> {
    return this.mfaService.useRecoveryCode(userId, code);
  }

  async loginWithRecoveryCode(
    email: string,
    password: string,
    recoveryCode: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // 1–4. Validate credentials and user status
    const user = await this.validateCredentialsAndStatus(
      email,
      password,
      ipAddress,
      userAgent,
      null,
    );

    // 5. Verify and use recovery code
    try {
      await this.useRecoveryCode(user.id, recoveryCode);
    } catch (error: unknown) {
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'INVALID_RECOVERY_CODE',
        null,
        userAgent,
      );
      throw error;
    }

    // 6. Disable MFA
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfa_enabled: false, mfa_secret: null, mfa_secret_key_ref: null },
    });
    await this.securityAuditService.logMfaDisable(user.id, null, 'recovery_code');

    // 7. Delete all recovery codes
    await this.prisma.mfaRecoveryCode.deleteMany({
      where: { user_id: user.id },
    });

    // 8. Clear brute force
    await this.clearBruteForce(email);

    // 9. Update last_login_at
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    // 10. Create session
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: SessionMetadata = {
      user_id: user.id,
      session_id: sessionId,
      tenant_id: null,
      membership_id: null,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: now,
      last_active_at: now,
    };
    await this.createSession(session);
    await this.securityAuditService.logLoginSuccess(user.id, ipAddress, userAgent, null, sessionId);

    // 11. Generate tokens
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      tenant_id: null,
      membership_id: null,
    });

    const refreshToken = this.signRefreshToken({
      sub: user.id,
      session_id: sessionId,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: this.sanitiseUser(user),
    };
  }

  async switchTenant(
    userId: string,
    currentEmail: string,
    targetTenantId: string,
  ): Promise<{ access_token: string }> {
    // 1. Find membership for user at target tenant
    const membership = await runWithRlsContext(
      this.prisma,
      { tenant_id: targetTenantId, user_id: userId },
      async (tx) =>
        tx.tenantMembership.findUnique({
          where: {
            idx_tenant_memberships_tenant_user: {
              tenant_id: targetTenantId,
              user_id: userId,
            },
          },
          include: { tenant: true },
        }),
    );

    if (!membership || membership.membership_status !== 'active') {
      throw new ForbiddenException({
        code: 'MEMBERSHIP_NOT_ACTIVE',
        message: 'You do not have an active membership at this school',
      });
    }

    // 2. Check tenant status
    if (membership.tenant.status !== 'active') {
      throw new ForbiddenException({
        code: 'TENANT_NOT_ACTIVE',
        message: 'This school account is not active',
      });
    }

    // 3. Update ALL Redis sessions for this user with new tenant context
    const redisClient = this.redis.getClient();
    const sessionIds = await redisClient.smembers(`user_sessions:${userId}`);
    for (const sessionId of sessionIds) {
      const key = `session:${sessionId}`;
      const raw = await redisClient.get(key);
      if (!raw) continue;
      try {
        const session = JSON.parse(raw);
        session.tenant_id = targetTenantId;
        session.membership_id = membership.id;
        await redisClient.set(key, JSON.stringify(session), 'KEEPTTL');
      } catch (err) {
        this.logger.warn(
          `Skipping malformed session ${sessionId} during tenant switch for user ${userId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // 4. Generate new access token
    const accessToken = this.signAccessToken({
      sub: userId,
      email: currentEmail,
      tenant_id: targetTenantId,
      membership_id: membership.id,
    });

    return { access_token: accessToken };
  }

  async getMe(
    userId: string,
    tenantId?: string | null,
  ): Promise<{
    user: SanitisedUser;
    memberships: Array<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      membership_status: string;
      roles: Array<{
        role_id: string;
        role_key: string;
        display_name: string;
      }>;
    }>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    // Build membership query
    const membershipWhere: { user_id: string; tenant_id?: string } = {
      user_id: userId,
    };
    if (tenantId) {
      membershipWhere.tenant_id = tenantId;
    }

    const memberships = await runWithRlsContext(
      this.prisma,
      tenantId ? { tenant_id: tenantId, user_id: userId } : { user_id: userId },
      async (tx) =>
        tx.tenantMembership.findMany({
          where: membershipWhere,
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
            membership_roles: {
              include: {
                role: {
                  select: { id: true, role_key: true, display_name: true },
                },
              },
            },
          },
        }),
    );

    return {
      user: this.sanitiseUser(user),
      memberships: memberships.map((m) => ({
        id: m.id,
        tenant_id: m.tenant_id,
        tenant_name: m.tenant.name,
        tenant_slug: m.tenant.slug,
        membership_status: m.membership_status,
        roles: m.membership_roles.map((mr) => ({
          role_id: mr.role.id,
          role_key: mr.role.role_key,
          display_name: mr.role.display_name,
        })),
      })),
    };
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    return this.sessionService.listSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    return this.sessionService.revokeSession(userId, sessionId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Validates credentials and user status for login flows.
   * Checks IP throttle, brute force, user existence, password, account lockout,
   * and global_status. Throws on failure with appropriate security audit logging.
   */
  private async validateCredentialsAndStatus(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string,
    tenantId: string | null,
  ) {
    // ─── Layer 1: IP-based throttle (before any DB lookup) ─────────────────
    const ipThrottle = await this.rateLimitService.checkIpThrottle(ipAddress);
    if (ipThrottle.blocked) {
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'IP_THROTTLED',
        tenantId,
        userAgent,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 2. Check email brute force protection (Layer 3 — existing)
    const bruteForce = await this.checkBruteForce(email);
    if (bruteForce.blocked) {
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'BRUTE_FORCE_BLOCKED',
        tenantId,
        userAgent,
      );

      throw new UnauthorizedException({
        code: 'BRUTE_FORCE_BLOCKED',
        message: `Too many failed attempts. Try again in ${bruteForce.retryAfterSeconds} seconds`,
      });
    }

    // 3. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.recordFailedLogin(email, ipAddress, userAgent);
      await this.rateLimitService.recordIpFailedLogin(ipAddress);
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'INVALID_CREDENTIALS',
        tenantId,
        userAgent,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // ─── Layer 2: Account lockout check (after user found) ─────────────────
    if (user.locked_until && user.locked_until > new Date()) {
      await this.rateLimitService.recordIpFailedLogin(ipAddress);
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'ACCOUNT_LOCKED',
        tenantId,
        userAgent,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 4. Compare password with bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await this.recordFailedLogin(email, ipAddress, userAgent);
      await this.rateLimitService.recordIpFailedLogin(ipAddress);

      // Increment account-level failed attempts
      const newFailedAttempts = user.failed_login_attempts + 1;
      const lockoutData: { failed_login_attempts: number; locked_until?: Date } = {
        failed_login_attempts: newFailedAttempts,
      };
      if (newFailedAttempts >= ACCOUNT_LOCKOUT_THRESHOLD) {
        lockoutData.locked_until = new Date(
          Date.now() + ACCOUNT_LOCKOUT_DURATION_MINUTES * 60 * 1000,
        );
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: lockoutData,
      });

      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'INVALID_CREDENTIALS',
        tenantId,
        userAgent,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 5. Check user global_status
    if (user.global_status === 'suspended') {
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'USER_SUSPENDED',
        tenantId,
        userAgent,
      );
      throw new ForbiddenException({
        code: 'USER_SUSPENDED',
        message: 'Your account has been suspended',
      });
    }
    if (user.global_status === 'disabled') {
      await this.securityAuditService.logLoginFailure(
        email,
        ipAddress,
        'USER_DISABLED',
        tenantId,
        userAgent,
      );
      throw new ForbiddenException({
        code: 'USER_DISABLED',
        message: 'Your account has been disabled',
      });
    }

    // Reset account lockout counters on successful credential validation
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failed_login_attempts: 0, locked_until: null },
      });
    }

    return user;
  }

  private sanitiseUser(user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    preferred_locale: string | null;
    global_status: string;
    mfa_enabled: boolean;
    last_login_at: Date | null;
    created_at: Date;
  }): SanitisedUser {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      preferred_locale: user.preferred_locale,
      global_status: user.global_status,
      mfa_enabled: user.mfa_enabled,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
    };
  }
}
