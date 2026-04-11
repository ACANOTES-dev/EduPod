import { Module, type OnModuleInit } from '@nestjs/common';

import { AudienceProviderRegistry } from '../inbox/audience/audience-provider.registry';
import { InboxModule } from '../inbox/inbox.module';

import { TripRosterProvider } from './audience/trip-roster.provider';

/**
 * TripsModule — placeholder module for the new-inbox rebuild
 * (Wave 2, Impl 03). See `EventsModule` for the same rationale: owns
 * the stub audience provider until the real trips domain lands.
 */
@Module({
  imports: [InboxModule],
  providers: [TripRosterProvider],
  exports: [TripRosterProvider],
})
export class TripsModule implements OnModuleInit {
  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly tripRoster: TripRosterProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.tripRoster);
  }
}
