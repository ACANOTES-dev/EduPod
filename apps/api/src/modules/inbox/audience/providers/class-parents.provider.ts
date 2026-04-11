import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { classParamsSchema } from '@school/shared/inbox';

import { ClassesReadFacade } from '../../../classes/classes-read.facade';
import { StudentReadFacade } from '../../../students/student-read.facade';
import { AudienceUserIdResolver } from '../audience-user-id.resolver';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

type ClassParams = z.infer<typeof classParamsSchema>;

/**
 * `class_parents` — parents of actively enrolled students in the listed classes.
 */
@Injectable()
export class ClassParentsAudienceProvider implements AudienceProvider {
  readonly key = 'class_parents' as const;
  readonly displayName = 'Class parents';
  readonly paramsSchema = classParamsSchema;
  readonly wired = true;

  constructor(
    private readonly classes: ClassesReadFacade,
    private readonly students: StudentReadFacade,
    private readonly users: AudienceUserIdResolver,
  ) {}

  async resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult> {
    const parsed = classParamsSchema.parse(params) as ClassParams;

    const perClass = await Promise.all(
      parsed.class_ids.map((classId) => this.classes.findEnrolledStudentIds(tenantId, classId)),
    );
    const studentIds = [...new Set(perClass.flat())];
    if (studentIds.length === 0) return { user_ids: [] };

    const parentIds = await this.students.findParentIdsByStudentIds(tenantId, studentIds);
    const user_ids = await this.users.parentIdsToUserIds(tenantId, parentIds);
    return { user_ids };
  }
}
