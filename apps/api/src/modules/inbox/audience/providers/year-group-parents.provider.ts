import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { yearGroupParamsSchema } from '@school/shared/inbox';

import { StudentReadFacade } from '../../../students/student-read.facade';
import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type YearGroupParams = z.infer<typeof yearGroupParamsSchema>;

/**
 * `year_group_parents` — parents of active students in the listed year groups.
 * Mirrors the existing `communications/audience-resolution.service.ts`
 * `year_group` scope but returns `user_ids` instead of dispatch targets.
 */
@Injectable()
export class YearGroupParentsAudienceProvider implements AudienceProvider {
  readonly key = 'year_group_parents' as const;
  readonly displayName = 'Year group parents';
  readonly paramsSchema = yearGroupParamsSchema;
  readonly wired = true;

  constructor(
    private readonly students: StudentReadFacade,
    private readonly users: AudienceUserIdResolver,
  ) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = yearGroupParamsSchema.parse(params) as YearGroupParams;

    const rows = (await this.students.findManyGeneric(tenantId, {
      where: { year_group_id: { in: parsed.year_group_ids }, status: 'active' },
      select: { id: true },
    })) as Array<{ id: string }>;

    if (rows.length === 0) return { user_ids: [] };

    const parentIds = await this.students.findParentIdsByStudentIds(
      tenantId,
      rows.map((r) => r.id),
    );
    const user_ids = await this.users.parentIdsToUserIds(tenantId, parentIds);
    return { user_ids };
  }
}
