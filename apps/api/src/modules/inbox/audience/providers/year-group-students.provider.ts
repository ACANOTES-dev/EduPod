import { Injectable } from '@nestjs/common';

import { yearGroupParamsSchema } from '@school/shared/inbox';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `year_group_students` — students in the listed year groups.
 *
 * Returns an empty `user_ids` array until the Student ↔ User mapping
 * lands. Students currently have no `user_id` column (see impl 02
 * completion record: "student branches return unreachable because
 * Student.user_id does not yet exist"). The provider is registered so
 * broadcast definitions remain forward-compatible: once students are
 * provisioned as users, this provider is the single place that needs to
 * be updated to return their `user_ids`.
 */
@Injectable()
export class YearGroupStudentsAudienceProvider implements AudienceProvider {
  readonly key = 'year_group_students' as const;
  readonly displayName = 'Year group students';
  readonly paramsSchema = yearGroupParamsSchema;
  readonly wired = true;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    return { user_ids: [] };
  }
}
