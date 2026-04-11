import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { sectionParamsSchema } from '@school/shared/inbox';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `section_parents` — STUB. There is no `Section` model in the platform
 * schema at this stage of the rebuild; the spec anticipates a future
 * `SectionsReadFacade.findStudentIdsBySection`. Keeping the provider
 * registered (so the chip builder knows about it) but throwing
 * `AUDIENCE_PROVIDER_NOT_WIRED` on invocation. When sections land, this
 * file is the single touch point to wire real resolution.
 */
@Injectable()
export class SectionParentsAudienceProvider implements AudienceProvider {
  readonly key = 'section_parents' as const;
  readonly displayName = 'Section parents';
  readonly paramsSchema = sectionParamsSchema;
  readonly wired = false;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    throw new ServiceUnavailableException({
      code: 'AUDIENCE_PROVIDER_NOT_WIRED',
      message: 'section_parents provider is stubbed until the sections module lands.',
    });
  }
}
