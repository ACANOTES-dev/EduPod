import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { savedGroupParamsSchema } from '@school/shared/inbox';

import type { AudienceProvider, AudienceResolveResult } from './provider.interface';

/**
 * `saved_group` — marker provider. Registered so the frontend chip
 * builder can list it via `GET /v1/inbox/audiences/providers`, but
 * `resolve()` is never invoked: `AudienceComposer` intercepts
 * `saved_group` leaves at walk time so it can (a) load the referenced
 * saved audience's stored definition and (b) track visited saved
 * audience IDs for cycle detection.
 *
 * If this resolve() ever fires it means the composer was bypassed — a
 * caller is using `registry.get('saved_group').resolve(...)` directly,
 * which is a bug.
 */
@Injectable()
export class SavedGroupAudienceProvider implements AudienceProvider {
  readonly key = 'saved_group' as const;
  readonly displayName = 'Saved audience';
  readonly paramsSchema = savedGroupParamsSchema;
  readonly wired = true;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    throw new InternalServerErrorException({
      code: 'SAVED_GROUP_RESOLVE_BYPASSED_COMPOSER',
      message:
        'saved_group must be resolved through AudienceComposer, not directly via the registry.',
    });
  }
}
