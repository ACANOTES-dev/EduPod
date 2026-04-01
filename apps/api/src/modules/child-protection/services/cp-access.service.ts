import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { GrantCpAccessDto, RevokeCpAccessDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CpAccessGrantRow {
  id: string;
  tenant_id: string;
  user_id: string;
  granted_by_user_id: string;
  granted_at: Date;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  revocation_reason: string | null;
}

export interface CpAccessGrantSummary {
  id: string;
  user_id: string;
  user_name: string;
  granted_by_user_id: string;
  granted_by_name: string;
  granted_at: Date;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CpAccessService {
  private readonly logger = new Logger(CpAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── GRANT ──────────────────────────────────────────────────────────────────

  /**
   * Grant CP access to a user. Only the DLP (or principal with
   * pastoral.manage_cp_access permission) can call this.
   *
   * Creates cp_access_grants row.
   * Generates pastoral_event: cp_access_granted.
   *
   * Idempotent: if user already has an active grant, returns existing grant
   * without creating a duplicate.
   */
  async grant(
    tenantId: string,
    grantedByUserId: string,
    dto: GrantCpAccessDto,
    ipAddress: string | null,
  ): Promise<{ data: CpAccessGrantRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: grantedByUserId,
    });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Idempotency check: if user already has an active grant, return it
      const existing = await db.cpAccessGrant.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: dto.user_id,
          revoked_at: null,
        },
      });

      if (existing) {
        return existing;
      }

      // Create the grant
      const created = await db.cpAccessGrant.create({
        data: {
          tenant_id: tenantId,
          user_id: dto.user_id,
          granted_by_user_id: grantedByUserId,
        },
      });

      return created;
    })) as CpAccessGrantRow;

    // Fire-and-forget: write cp_access_granted audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_access_granted',
      entity_type: 'cp_access_grant',
      entity_id: result.id,
      student_id: null,
      actor_user_id: grantedByUserId,
      tier: 3,
      payload: {
        grant_id: result.id,
        granted_to_user_id: dto.user_id,
        granted_by_user_id: grantedByUserId,
      },
      ip_address: ipAddress,
    });

    return { data: result };
  }

  // ─── REVOKE ─────────────────────────────────────────────────────────────────

  /**
   * Revoke CP access. Sets revoked_at and revoked_by_user_id.
   * Generates pastoral_event: cp_access_revoked.
   *
   * A user cannot revoke their own access (DLP cannot lock themselves out).
   */
  async revoke(
    tenantId: string,
    revokedByUserId: string,
    grantId: string,
    dto: RevokeCpAccessDto,
    ipAddress: string | null,
  ): Promise<{ data: { revoked: true } }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: revokedByUserId,
    });

    const grant = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Find the active grant
      const existing = await db.cpAccessGrant.findFirst({
        where: {
          id: grantId,
          tenant_id: tenantId,
          revoked_at: null,
        },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'GRANT_NOT_FOUND',
            message: 'Active CP access grant not found',
          },
        });
      }

      // Self-revocation blocked
      if (existing.user_id === revokedByUserId) {
        throw new BadRequestException({
          error: {
            code: 'SELF_REVOCATION_BLOCKED',
            message: 'You cannot revoke your own CP access',
          },
        });
      }

      // Revoke the grant
      const now = new Date();
      await db.cpAccessGrant.update({
        where: { id: grantId },
        data: {
          revoked_at: now,
          revoked_by_user_id: revokedByUserId,
          revocation_reason: dto.revocation_reason,
        },
      });

      return existing;
    })) as CpAccessGrantRow;

    // Fire-and-forget: write cp_access_revoked audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_access_revoked',
      entity_type: 'cp_access_grant',
      entity_id: grantId,
      student_id: null,
      actor_user_id: revokedByUserId,
      tier: 3,
      payload: {
        grant_id: grantId,
        user_id: grant.user_id,
        revoked_by_user_id: revokedByUserId,
        reason: dto.revocation_reason,
      },
      ip_address: ipAddress,
    });

    return { data: { revoked: true } };
  }

  // ─── LIST ACTIVE ────────────────────────────────────────────────────────────

  /**
   * List all active CP access grants for the tenant.
   * Returns: grant id, user name, granted_by name, granted_at.
   */
  async listActive(tenantId: string, userId: string): Promise<{ data: CpAccessGrantSummary[] }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const grants = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.cpAccessGrant.findMany({
        where: {
          tenant_id: tenantId,
          revoked_at: null,
        },
        include: {
          user: { select: { first_name: true, last_name: true } },
          granted_by: { select: { first_name: true, last_name: true } },
        },
        orderBy: { granted_at: 'desc' },
      });
    });

    const data = (
      grants as Array<
        CpAccessGrantRow & {
          user: { first_name: string; last_name: string };
          granted_by: { first_name: string; last_name: string };
        }
      >
    ).map((g) => ({
      id: g.id,
      user_id: g.user_id,
      user_name: `${g.user.first_name} ${g.user.last_name}`,
      granted_by_user_id: g.granted_by_user_id,
      granted_by_name: `${g.granted_by.first_name} ${g.granted_by.last_name}`,
      granted_at: g.granted_at,
    }));

    return { data };
  }

  // ─── HAS ACCESS ─────────────────────────────────────────────────────────────

  /**
   * Check if a specific user has active CP access.
   * Used by CpAccessGuard and by service-layer checks.
   * Does NOT generate an audit event (called on every CP-related request).
   */
  async hasAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: { id: true },
    });

    return !!grant;
  }
}
