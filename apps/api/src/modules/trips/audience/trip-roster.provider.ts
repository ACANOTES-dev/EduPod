import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { tripRosterParamsSchema } from '@school/shared/inbox';

import type {
  AudienceProvider,
  AudienceResolveResult,
} from '../../inbox/audience/providers/provider.interface';

/**
 * `trip_roster` — STUB. Same shape and rationale as
 * `EventAttendeesProvider`: registered so the audience registry knows
 * the key exists, but `resolve()` throws `AUDIENCE_PROVIDER_NOT_WIRED`
 * until a real trips module ships.
 */
@Injectable()
export class TripRosterProvider implements AudienceProvider {
  readonly key = 'trip_roster' as const;
  readonly displayName = 'Trip roster';
  readonly paramsSchema = tripRosterParamsSchema;
  readonly wired = false;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    throw new ServiceUnavailableException({
      code: 'AUDIENCE_PROVIDER_NOT_WIRED',
      message: 'trip_roster provider is stubbed for v1; trips module wires the resolver.',
    });
  }
}
