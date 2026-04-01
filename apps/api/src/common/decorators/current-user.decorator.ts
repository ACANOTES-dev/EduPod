import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { JwtPayload } from '@school/shared';

import type { AuthenticatedRequest } from '../types/request.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.currentUser;
  },
);
