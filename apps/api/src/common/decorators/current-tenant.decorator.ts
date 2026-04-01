import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import type { AuthenticatedRequest } from '../types/request.types';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | null => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.tenantContext;
  },
);
