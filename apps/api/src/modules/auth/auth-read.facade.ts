/**
 * AuthReadFacade — Centralized read service for user (platform-level) data.
 *
 * PURPOSE:
 * Many modules (compliance, pastoral, finance, communications, tenants, safeguarding,
 * early-warning, gdpr, rbac, parents, reports, homework, registration, admissions)
 * need to look up user details. The `user` table is platform-level (no `tenant_id`),
 * so methods take userId directly. The `tenantId` parameter is kept in the signature
 * for consistency with the facade pattern, even when unused for platform-level tables.
 *
 * CONVENTIONS:
 * - The `user` table has NO `tenant_id` column — it is platform-level.
 * - Methods include `tenantId` in signatures for API consistency but may not use it.
 * - Returns `null` when a single record is not found — callers decide whether to throw.
 * - Sensitive fields (password_hash, mfa_secret) are NEVER selected.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Safe user fields — excludes password_hash, mfa_secret, and other sensitive data. */
const USER_DISPLAY_SELECT = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  phone: true,
  preferred_locale: true,
  global_status: true,
  email_verified_at: true,
  mfa_enabled: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
} as const;

/** Minimal user fields for cross-module display (name + email only). */
const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface UserDisplayRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  preferred_locale: string | null;
  global_status: string;
  email_verified_at: Date | null;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserSummaryRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class AuthReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by ID with safe display fields (no password, no MFA secret).
   * The user table is platform-level — tenantId is accepted for API consistency but unused.
   */
  async findUserById(tenantId: string, userId: string): Promise<UserDisplayRow | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_DISPLAY_SELECT,
    });
  }

  /**
   * Find a user by ID with minimal summary fields (name + email).
   * Used for audit log display, notification contexts, and cross-module references.
   */
  async findUserSummary(tenantId: string, userId: string): Promise<UserSummaryRow | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SUMMARY_SELECT,
    });
  }

  /**
   * Find multiple users by IDs with summary fields.
   * Used by communications and audience resolution for batch lookups.
   */
  async findUsersByIds(tenantId: string, userIds: string[]): Promise<UserSummaryRow[]> {
    if (userIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: USER_SUMMARY_SELECT,
    });
  }

  /**
   * Find a user by email address. Returns null if not found.
   * Used by invitation flows and registration.
   */
  async findUserByEmail(tenantId: string, email: string): Promise<UserSummaryRow | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SUMMARY_SELECT,
    });
  }

  /**
   * Count all users on the platform (no tenant scope).
   * Used by platform admin dashboard.
   */
  async countAllUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  /**
   * Find multiple users by IDs with full display fields (includes last_login_at).
   * Used by early-warning engagement signal collector for portal login detection.
   */
  async findUsersWithLoginInfo(
    userIds: string[],
  ): Promise<Array<{ id: string; last_login_at: Date | null }>> {
    if (userIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, last_login_at: true },
    });
  }

  /**
   * Assert that a user exists. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string, userId: string): Promise<void> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }
  }

  /**
   * Find users with MFA secrets encrypted under a stale key ref.
   * Used by key-rotation service to re-encrypt MFA secrets.
   */
  async findUsersWithStaleMfaKey(
    currentKeyRef: string,
    take: number,
    skip: number,
  ): Promise<Array<{ id: string; mfa_secret: string | null; mfa_secret_key_ref: string | null }>> {
    return this.prisma.user.findMany({
      where: {
        mfa_secret: { not: null },
        mfa_secret_key_ref: { not: null },
        NOT: { mfa_secret_key_ref: currentKeyRef },
      },
      select: { id: true, mfa_secret: true, mfa_secret_key_ref: true },
      take,
      skip,
    });
  }
}
