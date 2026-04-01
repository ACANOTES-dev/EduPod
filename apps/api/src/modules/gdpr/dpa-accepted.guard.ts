import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';

import type { JwtPayload } from '@school/shared';

import { DpaService } from './dpa.service';

const EXEMPT_PATH_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/legal',
  '/api/v1/public',
  '/api/v1/invitations/accept',
];

@Injectable()
export class DpaAcceptedGuard implements CanActivate {
  constructor(private readonly dpaService: DpaService) {}

  async canActivate(context: ExecutionContext) {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { tenantContext?: { tenant_id: string } | null; currentUser?: JwtPayload }
      >();

    if (request.method === 'OPTIONS') {
      return true;
    }

    const path = request.originalUrl ?? request.url ?? '';
    if (EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    const tenantId = request.tenantContext?.tenant_id;
    if (!tenantId) {
      return true;
    }

    const currentUser = request.currentUser ?? this.extractUser(request);
    if (!currentUser || currentUser.type !== 'access') {
      return true;
    }

    const currentVersion = await this.dpaService.getCurrentVersion();
    const accepted = await this.dpaService.hasAccepted(tenantId, currentVersion.version);

    if (!accepted) {
      throw new ForbiddenException({
        error: {
          code: 'DPA_NOT_ACCEPTED',
          message:
            'Your school must accept the current Data Processing Agreement before accessing this service.',
          redirect: '/settings/legal/dpa',
        },
      });
    }

    return true;
  }

  private extractUser(request: Request): JwtPayload | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      return null;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return null;
    }

    try {
      return jwt.verify(token, secret) as JwtPayload;
    } catch {
      return null;
    }
  }
}
