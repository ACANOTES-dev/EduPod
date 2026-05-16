import type { Request } from 'express';

import type { JwtPayload } from '@school/shared';

import type { PlatformAuditContext } from './platform-audit.service';

export function auditContextFromRequest(user: JwtPayload, request?: Request): PlatformAuditContext {
  const forwardedFor = request?.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || request?.ip;
  const userAgent = request?.headers['user-agent'];

  return {
    actor_user_id: user.sub,
    ip_address: ipAddress,
    user_agent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  };
}
