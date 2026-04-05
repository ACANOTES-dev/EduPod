import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

import type { JwtPayload } from '@school/shared';

import { RequestContextService } from '../services/request-context.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new UnauthorizedException('JWT secret not configured');
      }

      const payload = jwt.verify(token, secret) as JwtPayload;

      // Token type check: only 'access' tokens are valid for API requests.
      // Refresh tokens and mfa_pending tokens must not be accepted as Bearer tokens.
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Cross-tenant check: if a tenant context was resolved from the hostname,
      // the JWT's tenant_id must match. This prevents using a token issued for
      // Tenant A to access Tenant B's domain.
      const tenantContext = (request as unknown as { tenantContext?: { tenant_id: string } | null })
        .tenantContext;
      if (tenantContext && tenantContext.tenant_id !== payload.tenant_id) {
        throw new UnauthorizedException('Token does not match the current tenant');
      }

      const req = request as unknown as { currentUser?: JwtPayload };
      req.currentUser = payload;
      this.requestContext.set({
        tenant_id: payload.tenant_id ?? undefined,
        user_id: payload.sub,
        membership_id: payload.membership_id ?? undefined,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
