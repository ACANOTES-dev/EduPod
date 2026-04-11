import type { ZodSchema } from 'zod';

import type { AudienceProviderKey } from '@school/shared/inbox';

/**
 * Contract every audience provider must implement.
 *
 * The registry (`AudienceProviderRegistry`) holds one instance of each
 * provider keyed by `key`. The composer walks an `AudienceDefinition`
 * tree and calls `resolve` on each leaf with the tenant context and the
 * already-parsed params for that leaf.
 *
 * `wired === false` signals to the chip builder that the provider is
 * stubbed — the frontend shows it as "coming soon" and disables the chip,
 * and the composer throws `AUDIENCE_PROVIDER_NOT_WIRED` if a stub is
 * actually invoked. The two v1 stubs are `event_attendees` and
 * `trip_roster`.
 */
export interface AudienceProvider {
  readonly key: AudienceProviderKey;
  readonly displayName: string;
  readonly paramsSchema: ZodSchema;
  readonly wired: boolean;
  resolve(tenantId: string, params: unknown): Promise<AudienceResolveResult>;
}

export interface AudienceResolveResult {
  user_ids: string[];
}
