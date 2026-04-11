import { Injectable } from '@nestjs/common';

import { emptyParamsSchema } from '@school/shared/inbox';

import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `staff_all` — every active staff member in the tenant.
 */
@Injectable()
export class StaffAllAudienceProvider implements AudienceProvider {
  readonly key = 'staff_all' as const;
  readonly displayName = 'All staff';
  readonly paramsSchema = emptyParamsSchema;
  readonly wired = true;

  constructor(private readonly users: AudienceUserIdResolver) {}

  async resolve(tenantId: string, _params: unknown = {}): Promise<AudienceResolveResult> {
    const user_ids = await this.users.allActiveStaffUserIds(tenantId);
    return { user_ids };
  }
}
