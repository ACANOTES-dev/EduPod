import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BRUTE_FORCE_THRESHOLDS,
  BRUTE_FORCE_WINDOW_SECONDS,
  JWT_EXPIRY,
  REFRESH_EXPIRY,
  type JwtPayload,
  type RefreshTokenPayload,
  type SessionMetadata,
} from '@school/shared';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { generateSecret as otpGenerateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: SanitisedUser;
}

export interface MfaRequiredResult {
  mfa_required: true;
  mfa_token: string;
}

export interface SanitisedUser {
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
}

export interface MfaSetupResult {
  secret: string;
  qr_code_url: string;
  otpauth_uri: string;
}

export interface SessionInfo {
  session_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  tenant_id: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private configService: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  // ─── Token signing / verification ──────────────────────────────────────────

  signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'type'>): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.sign({ ...payload, type: 'access' }, secret, {
      expiresIn: JWT_EXPIRY,
    });
  }

  signRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'type'>): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

    return jwt.sign({ ...payload, type: 'refresh' }, secret, {
      expiresIn: REFRESH_EXPIRY,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.verify(token, secret) as JwtPayload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

    return jwt.verify(token, secret) as RefreshTokenPayload;
  }

  // ─── Session CRUD in Redis ────────────────────────────────────────────────

  async createSession(session: SessionMetadata): Promise<void> {
    const key = `session:${session.session_id}`;
    const client = this.redis.getClient();
    await client.set(key, JSON.stringify(session), 'EX', 7 * 24 * 60 * 60);

    // Index by user for session listing/revocation
    const userKey = `user_sessions:${session.user_id}`;
    await client.sadd(userKey, session.session_id);
    await client.expire(userKey, 7 * 24 * 60 * 60);
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const client = this.redis.getClient();
    const data = await client.get(`session:${sessionId}`);
    if (!data) return null;
    return JSON.parse(data) as SessionMetadata;
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`session:${sessionId}`);
    await client.srem(`user_sessions:${userId}`, sessionId);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    const client = this.redis.getClient();
    const sessionIds = await client.smembers(`user_sessions:${userId}`);
    if (sessionIds.length > 0) {
      const keys = sessionIds.map((id) => `session:${id}`);
      await client.del(...keys);
    }
    await client.del(`user_sessions:${userId}`);
  }

  // ─── Brute Force Protection ───────────────────────────────────────────────

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

  async recordFailedLogin(email: string): Promise<void> {
    const client = this.redis.getClient();
    const key = `brute_force:${email}`;
    await client.incr(key);
    await client.expire(key, BRUTE_FORCE_WINDOW_SECONDS);
  }

  async clearBruteForce(email: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`brute_force:${email}`);
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
    // 1. Check brute force protection
    const bruteForce = await this.checkBruteForce(email);
    if (bruteForce.blocked) {
      throw new UnauthorizedException({
        code: 'BRUTE_FORCE_BLOCKED',
        message: `Too many failed attempts. Try again in ${bruteForce.retryAfterSeconds} seconds`,
      });
    }

    // 2. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 3. Compare password with bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 4. Check user.global_status
    if (user.global_status === 'suspended') {
      throw new ForbiddenException({
        code: 'USER_SUSPENDED',
        message: 'Your account has been suspended',
      });
    }
    if (user.global_status === 'disabled') {
      throw new ForbiddenException({
        code: 'USER_DISABLED',
        message: 'Your account has been disabled',
      });
    }

    // 5. Tenant context checks
    let membershipId: string | null = null;
    if (tenantId) {
      const membership = await this.prisma.tenantMembership.findUnique({
        where: {
          idx_tenant_memberships_tenant_user: {
            tenant_id: tenantId,
            user_id: user.id,
          },
        },
        include: { tenant: true },
      });

      if (!membership || membership.membership_status !== 'active') {
        throw new ForbiddenException({
          code: 'MEMBERSHIP_NOT_ACTIVE',
          message: 'You do not have an active membership at this school',
        });
      }

      // Check tenant status
      if (membership.tenant.status === 'suspended') {
        throw new ForbiddenException({
          code: 'TENANT_SUSPENDED',
          message: 'This school account has been suspended',
        });
      }
      if (membership.tenant.status === 'archived') {
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
        throw new UnauthorizedException({
          code: 'MFA_NOT_CONFIGURED',
          message: 'MFA is enabled but not configured properly',
        });
      }

      const verifyResult = await otpVerify({
        token: mfaCode,
        secret: user.mfa_secret,
      });
      const isValid = verifyResult.valid;

      if (!isValid) {
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

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    // 1. Verify refresh token
    let payload: RefreshTokenPayload;
    try {
      payload = this.verifyRefreshToken(refreshToken);
    } catch {
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
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: session.tenant_id },
      });
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

    // 6. Issue new access token
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      tenant_id: session.tenant_id,
      membership_id: session.membership_id,
    });

    return { access_token: accessToken };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.deleteSession(sessionId, userId);
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success to avoid leaking user existence
    if (!user) {
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
    await this.deleteAllUserSessions(resetToken.user_id);

    return { message: 'Password reset successfully' };
  }

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

    // Store secret temporarily (don't enable MFA yet)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfa_secret: secret },
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

    // Verify TOTP code against secret
    const verifyResult = await otpVerify({
      token: code,
      secret: user.mfa_secret,
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
      const code = crypto.randomBytes(4).toString('hex');
      recoveryCodes.push(code);
      codeHashes.push({
        user_id: userId,
        code_hash: crypto.createHash('sha256').update(code).digest('hex'),
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

  async loginWithRecoveryCode(
    email: string,
    password: string,
    recoveryCode: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // 1. Check brute force
    const bruteForce = await this.checkBruteForce(email);
    if (bruteForce.blocked) {
      throw new UnauthorizedException({
        code: 'BRUTE_FORCE_BLOCKED',
        message: `Too many failed attempts. Try again in ${bruteForce.retryAfterSeconds} seconds`,
      });
    }

    // 2. Find user
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 3. Check password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // 4. Check user status
    if (user.global_status !== 'active') {
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'Your account is not active',
      });
    }

    // 5. Verify and use recovery code
    await this.useRecoveryCode(user.id, recoveryCode);

    // 6. Disable MFA
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfa_enabled: false, mfa_secret: null },
    });

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
    const membership = await this.prisma.tenantMembership.findUnique({
      where: {
        idx_tenant_memberships_tenant_user: {
          tenant_id: targetTenantId,
          user_id: userId,
        },
      },
      include: { tenant: true },
    });

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
      } catch { /* skip malformed sessions */ }
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

    const memberships = await this.prisma.tenantMembership.findMany({
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
    });

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
    const client = this.redis.getClient();
    const sessionIds = await client.smembers(`user_sessions:${userId}`);

    if (sessionIds.length === 0) {
      return [];
    }

    const sessions: SessionInfo[] = [];
    for (const sessionId of sessionIds) {
      const data = await client.get(`session:${sessionId}`);
      if (data) {
        const session = JSON.parse(data) as SessionMetadata;
        sessions.push({
          session_id: session.session_id,
          ip_address: session.ip_address,
          user_agent: session.user_agent,
          created_at: session.created_at,
          last_active_at: session.last_active_at,
          tenant_id: session.tenant_id,
        });
      } else {
        // Clean up stale session reference
        await client.srem(`user_sessions:${userId}`, sessionId);
      }
    }

    return sessions;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    // Verify session belongs to user
    const session = await this.getSession(sessionId);
    if (!session || session.user_id !== userId) {
      throw new BadRequestException({
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found or does not belong to you',
      });
    }

    await this.deleteSession(sessionId, userId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
