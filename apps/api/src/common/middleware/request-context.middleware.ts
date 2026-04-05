import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import type { TenantContext } from '@school/shared';

import { RequestContextService } from '../services/request-context.service';
import type { AuthenticatedRequest } from '../types/request.types';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const request = req as AuthenticatedRequest;
    const tenantContext = request.tenantContext as TenantContext | null | undefined;
    const currentUser = request.currentUser;
    const hostname = this.getRequestHostname(req);

    this.requestContext.run(
      {
        tenant_id: currentUser?.tenant_id ?? tenantContext?.tenant_id ?? undefined,
        user_id: currentUser?.sub,
        membership_id: currentUser?.membership_id ?? undefined,
        tenant_domain: hostname,
      },
      next,
    );
  }

  private getRequestHostname(req: Request): string {
    const forwardedHostHeader = req.headers['x-forwarded-host'];
    const forwardedHost = Array.isArray(forwardedHostHeader)
      ? forwardedHostHeader[0]
      : forwardedHostHeader?.split(',')[0]?.trim();

    const rawHost = forwardedHost || req.hostname;
    return rawHost.replace(/:\d+$/, '').toLowerCase();
  }
}
