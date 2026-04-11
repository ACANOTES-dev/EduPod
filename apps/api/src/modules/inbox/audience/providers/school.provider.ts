import { Injectable } from '@nestjs/common';

import { emptyParamsSchema } from '@school/shared/inbox';

import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `school` — every active addressable user in the tenant: parents + staff.
 * Same as the tenant universe used by NOT. Students are excluded until
 * they have `user_id`s; see `AudienceUserIdResolver`.
 */
@Injectable()
export class SchoolAudienceProvider implements AudienceProvider {
  readonly key = 'school' as const;
  readonly displayName = 'Whole school (parents + staff)';
  readonly paramsSchema = emptyParamsSchema;
  readonly wired = true;

  constructor(private readonly users: AudienceUserIdResolver) {}

  async resolve(tenantId: string, _params: unknown = {}): Promise<AudienceResolveResult> {
    const user_ids = await this.users.buildTenantUniverse(tenantId);
    return { user_ids };
  }
}
