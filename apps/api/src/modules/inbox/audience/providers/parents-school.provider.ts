import { Injectable } from '@nestjs/common';

import { emptyParamsSchema } from '@school/shared/inbox';

import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `parents_school` — every active parent in the tenant.
 */
@Injectable()
export class ParentsSchoolAudienceProvider implements AudienceProvider {
  readonly key = 'parents_school' as const;
  readonly displayName = 'All parents';
  readonly paramsSchema = emptyParamsSchema;
  readonly wired = true;

  constructor(private readonly users: AudienceUserIdResolver) {}

  async resolve(tenantId: string, _params: unknown = {}): Promise<AudienceResolveResult> {
    const user_ids = await this.users.allActiveParentUserIds(tenantId);
    return { user_ids };
  }
}
