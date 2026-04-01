import type { Request } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';

export interface AuthenticatedRequest extends Request {
  currentUser: JwtPayload;
  tenantContext: TenantContext | null;
}
