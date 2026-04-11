import { Injectable } from '@nestjs/common';

import { classParamsSchema } from '@school/shared/inbox';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `class_students` — students enrolled in the listed classes.
 *
 * Currently returns an empty `user_ids` array; students have no
 * `user_id` column yet. See `year-group-students.provider.ts` for the
 * full rationale.
 */
@Injectable()
export class ClassStudentsAudienceProvider implements AudienceProvider {
  readonly key = 'class_students' as const;
  readonly displayName = 'Class students';
  readonly paramsSchema = classParamsSchema;
  readonly wired = true;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    return { user_ids: [] };
  }
}
