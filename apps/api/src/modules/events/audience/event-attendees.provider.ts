import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { eventAttendeesParamsSchema } from '@school/shared/inbox';

import type {
  AudienceProvider,
  AudienceResolveResult,
} from '../../inbox/audience/providers/provider.interface';

/**
 * `event_attendees` — STUB. The events module has not been built yet, so
 * this provider is registered as a placeholder so the audience registry
 * knows the key exists and the Wave 4 chip builder can display it in a
 * "coming soon" state. Invoking `resolve` throws
 * `AUDIENCE_PROVIDER_NOT_WIRED`.
 *
 * When the events module ships it replaces this file's `resolve` body
 * with a real implementation that reads from
 * `EventsReadFacade.findAttendeeUserIds(eventId, status)` and maps
 * student attendees to their parents via `AudienceUserIdResolver`.
 */
@Injectable()
export class EventAttendeesProvider implements AudienceProvider {
  readonly key = 'event_attendees' as const;
  readonly displayName = 'Event RSVPs';
  readonly paramsSchema = eventAttendeesParamsSchema;
  readonly wired = false;

  async resolve(_tenantId: string = '', _params: unknown = {}): Promise<AudienceResolveResult> {
    throw new ServiceUnavailableException({
      code: 'AUDIENCE_PROVIDER_NOT_WIRED',
      message: 'event_attendees provider is stubbed for v1; events module wires the resolver.',
    });
  }
}
