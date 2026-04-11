import { Module, type OnModuleInit } from '@nestjs/common';

import { AudienceProviderRegistry } from '../inbox/audience/audience-provider.registry';
import { InboxModule } from '../inbox/inbox.module';

import { EventAttendeesProvider } from './audience/event-attendees.provider';

/**
 * EventsModule — placeholder module created for the new-inbox rebuild
 * (Wave 2, Impl 03).
 *
 * The events domain itself hasn't been built yet. The only purpose of
 * this module in the current codebase is to own the `event_attendees`
 * audience provider stub: a stub must exist so the audience registry
 * surfaces the key to the chip-builder UI, but the resolver throws
 * `AUDIENCE_PROVIDER_NOT_WIRED` until a real events module ships and
 * replaces the provider implementation.
 *
 * When the real events module lands it should be renamed/moved back to
 * live alongside the events data model, keeping the provider as a thin
 * wrapper over a new `EventsReadFacade.findAttendeeUserIds` method.
 */
@Module({
  imports: [InboxModule],
  providers: [EventAttendeesProvider],
  exports: [EventAttendeesProvider],
})
export class EventsModule implements OnModuleInit {
  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly eventAttendees: EventAttendeesProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.eventAttendees);
  }
}
