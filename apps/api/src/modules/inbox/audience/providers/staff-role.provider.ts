import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { staffRoleParamsSchema } from '@school/shared/inbox';

import { RbacReadFacade } from '../../../rbac/rbac-read.facade';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type StaffRoleParams = z.infer<typeof staffRoleParamsSchema>;

/**
 * `staff_role` — all active users holding ANY of the supplied role keys.
 * Role keys come from the rbac registry (e.g. `teacher`, `school_principal`,
 * `accounting`). The composer validates params via the shared schema before
 * they reach this provider.
 */
@Injectable()
export class StaffRoleAudienceProvider implements AudienceProvider {
  readonly key = 'staff_role' as const;
  readonly displayName = 'Staff by role';
  readonly paramsSchema = staffRoleParamsSchema;
  readonly wired = true;

  constructor(private readonly rbac: RbacReadFacade) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = staffRoleParamsSchema.parse(params) as StaffRoleParams;
    const perRole = await Promise.all(
      parsed.roles.map((roleKey) => this.rbac.findActiveUserIdsByRoleKey(tenantId, roleKey)),
    );
    return { user_ids: [...new Set(perRole.flat())] };
  }
}
