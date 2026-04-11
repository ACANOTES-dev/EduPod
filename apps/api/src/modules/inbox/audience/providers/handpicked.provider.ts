import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { handpickedParamsSchema } from '@school/shared/inbox';

import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type HandpickedParams = z.infer<typeof handpickedParamsSchema>;

/**
 * `handpicked` — exactly the supplied user_ids, after filtering to
 * those with an active membership in the requesting tenant. IDs that
 * don't resolve to a tenant member are silently dropped so a caller
 * can't accidentally broadcast outside the tenant by pasting foreign
 * UUIDs.
 */
@Injectable()
export class HandpickedAudienceProvider implements AudienceProvider {
  readonly key = 'handpicked' as const;
  readonly displayName = 'Handpicked users';
  readonly paramsSchema = handpickedParamsSchema;
  readonly wired = true;

  constructor(private readonly users: AudienceUserIdResolver) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = handpickedParamsSchema.parse(params) as HandpickedParams;
    const allowed = await this.users.filterToTenantMembers(tenantId, parsed.user_ids);
    return { user_ids: allowed };
  }
}
