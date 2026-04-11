import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { departmentParamsSchema } from '@school/shared/inbox';

import { StaffProfileReadFacade } from '../../../staff-profiles/staff-profile-read.facade';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type DepartmentParams = z.infer<typeof departmentParamsSchema>;

/**
 * `department` — active staff whose `department` matches ANY of the
 * supplied department names.
 *
 * Deviation from the impl spec: the schema exposes `departments: string[]`
 * rather than `department_ids: string[]` because `StaffProfile.department`
 * is a free-text `VARCHAR(150)` column. There is no dedicated
 * `departments` table at this point in the platform. The chip builder in
 * Wave 4 will surface the distinct department names it discovers from
 * the staff profile list.
 */
@Injectable()
export class DepartmentAudienceProvider implements AudienceProvider {
  readonly key = 'department' as const;
  readonly displayName = 'Staff by department';
  readonly paramsSchema = departmentParamsSchema;
  readonly wired = true;

  constructor(private readonly staffProfiles: StaffProfileReadFacade) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = departmentParamsSchema.parse(params) as DepartmentParams;

    const rows = (await this.staffProfiles.findManyGeneric(tenantId, {
      where: {
        employment_status: 'active',
        department: { in: parsed.departments },
      },
      select: { user_id: true },
    })) as Array<{ user_id: string }>;

    return { user_ids: [...new Set(rows.map((r) => r.user_id))] };
  }
}
