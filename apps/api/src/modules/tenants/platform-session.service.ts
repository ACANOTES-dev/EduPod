import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';

import type { SessionMetadata } from '@school/shared';

import { AuthReadFacade } from '../auth/auth-read.facade';
import type { PlatformAuditContext } from '../platform-audit/platform-audit.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface PlatformUserSession {
  session_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  ip_address: string;
  user_agent: string;
  last_active_at: string;
  created_at: string;
}

export interface PlatformTenantSessionGroup {
  tenant_id: string | null;
  tenant_name: string | null;
  user_count: number;
  sessions: PlatformUserSession[];
}

@Injectable()
export class PlatformSessionService {
  private readonly logger = new Logger(PlatformSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly authReadFacade: AuthReadFacade,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async listSessions(): Promise<PlatformTenantSessionGroup[]> {
    const client = this.redis.getClient();
    const keys = await scanKeys(client, 'session:*');
    const sessions = await this.readSessionKeys(client, keys);
    const userIds = [...new Set(sessions.map((session) => session.user_id))];
    const tenantIds = [
      ...new Set(
        sessions
          .map((session) => session.tenant_id)
          .filter((tenantId): tenantId is string => typeof tenantId === 'string'),
      ),
    ];

    const [users, tenants] = await Promise.all([
      userIds.length > 0 ? this.authReadFacade.findUsersByIds('', userIds) : Promise.resolve([]),
      tenantIds.length > 0
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((user) => [user.id, user]));
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const groups = new Map<string, PlatformTenantSessionGroup>();

    for (const session of sessions) {
      const key = session.tenant_id ?? '__platform__';
      const existing = groups.get(key);
      const tenant = session.tenant_id ? tenantById.get(session.tenant_id) : null;
      const group =
        existing ??
        ({
          tenant_id: session.tenant_id,
          tenant_name: tenant?.name ?? null,
          user_count: 0,
          sessions: [],
        } satisfies PlatformTenantSessionGroup);
      const user = userById.get(session.user_id);
      group.sessions.push({
        session_id: session.session_id,
        user_id: session.user_id,
        user_email: user?.email ?? 'Unknown user',
        user_name: formatUserName(user),
        ip_address: session.ip_address,
        user_agent: session.user_agent,
        last_active_at: session.last_active_at,
        created_at: session.created_at,
      });
      groups.set(key, group);
    }

    const result = [...groups.values()].map((group) => ({
      ...group,
      user_count: new Set(group.sessions.map((session) => session.user_id)).size,
      sessions: group.sessions.sort((a, b) => b.last_active_at.localeCompare(a.last_active_at)),
    }));

    return result.sort((a, b) => {
      if (a.tenant_id === null) return -1;
      if (b.tenant_id === null) return 1;
      return (a.tenant_name ?? '').localeCompare(b.tenant_name ?? '');
    });
  }

  async forceLogoutTenant(
    tenantId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ logged_out: number }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${tenantId}" not found`,
      });
    }

    const client = this.redis.getClient();
    const keys = await scanKeys(client, 'session:*');
    const sessions = await this.readSessionKeys(client, keys);
    const matching = sessions.filter((session) => session.tenant_id === tenantId);
    await deleteSessions(client, matching);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'session_force_logged_out_tenant',
        target_resource_type: 'tenant_sessions',
        target_resource_id: tenantId,
        target_tenant_id: tenantId,
        payload: {
          after: { logged_out: matching.length },
          extra: { tenant_name: tenant.name },
        },
      });
    }

    return { logged_out: matching.length };
  }

  async forceLogoutUser(
    userId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ logged_out: number }> {
    const user = await this.authReadFacade.findUserSummary('', userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User "${userId}" not found`,
      });
    }

    const client = this.redis.getClient();
    const sessionIds = await client.smembers(`user_sessions:${userId}`);
    if (sessionIds.length > 0) {
      await client.del(...sessionIds.map((sessionId) => `session:${sessionId}`));
    }
    await client.del(`user_sessions:${userId}`);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'session_force_logged_out_user',
        target_resource_type: 'user_sessions',
        target_resource_id: userId,
        payload: {
          after: { logged_out: sessionIds.length },
          extra: { email: user.email },
        },
      });
    }

    return { logged_out: sessionIds.length };
  }

  private async readSessionKeys(client: Redis, keys: string[]): Promise<SessionMetadata[]> {
    const sessions: SessionMetadata[] = [];
    for (const key of keys) {
      const raw = await client.get(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isSessionMetadata(parsed)) {
          sessions.push(parsed);
        }
      } catch (err) {
        this.logger.warn(
          `Skipping malformed Redis session ${key}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return sessions;
  }
}

async function scanKeys(client: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

async function deleteSessions(client: Redis, sessions: SessionMetadata[]): Promise<void> {
  if (sessions.length === 0) return;
  const pipeline = client.pipeline();
  for (const session of sessions) {
    pipeline.del(`session:${session.session_id}`);
    pipeline.srem(`user_sessions:${session.user_id}`, session.session_id);
  }
  await pipeline.exec();
}

function isSessionMetadata(value: unknown): value is SessionMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.session_id === 'string' &&
    typeof record.user_id === 'string' &&
    (typeof record.tenant_id === 'string' || record.tenant_id === null) &&
    typeof record.ip_address === 'string' &&
    typeof record.user_agent === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.last_active_at === 'string'
  );
}

function formatUserName(
  user: { first_name: string; last_name: string; email: string } | undefined,
): string {
  if (!user) return 'Unknown user';
  const name = `${user.first_name} ${user.last_name}`.trim();
  return name.length > 0 ? name : user.email;
}
