import { BadRequestException, Injectable } from '@nestjs/common';

import type { SessionMetadata } from '@school/shared';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { RedisService } from '../redis/redis.service';

import type { SessionInfo } from './auth.types';

// ─── SessionService ─────────────────────────────────────────────────────────

@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

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
    await this.securityAuditService.logSessionRevocation(userId, userId, sessionId);
  }
}
