import type { JwtPayload, TenantContext } from '@school/shared';
import type { Request } from 'express';


export interface AuthenticatedRequest extends Request {
  currentUser: JwtPayload;
  tenantContext: TenantContext | null;
}
