import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AudienceProviderKey } from '@school/shared/inbox';

import type { AudienceProvider } from './providers/provider.interface';

/**
 * Process-wide, singleton registry of `AudienceProvider` instances.
 *
 * Providers self-register at module init time:
 *
 *   - inbox-owned providers (school, parents_school, staff_*, year_group_*,
 *     class_*, section_parents, household, handpicked, saved_group) are
 *     registered in `InboxAudienceProvidersInit` inside `InboxModule`.
 *
 *   - cross-module providers register from their owning module's
 *     `onModuleInit` hook so the inbox module never reaches across a
 *     module boundary for Prisma access. v1 providers:
 *       - `FeesInArrearsProvider`      ← FinanceModule
 *       - `EventAttendeesProvider`     ← EventsModule (stub)
 *       - `TripRosterProvider`         ← TripsModule  (stub)
 *
 * The registry deliberately throws a structured `NotFoundException` when
 * a caller asks for an unknown key — the composer surfaces that error
 * with the code `UNKNOWN_AUDIENCE_PROVIDER` so it's easy to diagnose a
 * stale broadcast definition after a provider rename.
 */
@Injectable()
export class AudienceProviderRegistry {
  private readonly logger = new Logger(AudienceProviderRegistry.name);
  private readonly providers = new Map<AudienceProviderKey, AudienceProvider>();

  register(provider: AudienceProvider): void {
    if (this.providers.has(provider.key)) {
      this.logger.warn(
        `AudienceProvider "${provider.key}" re-registered; replacing previous instance.`,
      );
    }
    this.providers.set(provider.key, provider);
  }

  get(key: AudienceProviderKey): AudienceProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new NotFoundException({
        code: 'UNKNOWN_AUDIENCE_PROVIDER',
        message: `No audience provider registered for key "${key}"`,
      });
    }
    return provider;
  }

  has(key: AudienceProviderKey): boolean {
    return this.providers.has(key);
  }

  list(): AudienceProvider[] {
    return [...this.providers.values()];
  }

  /** Test helper — drop all registered providers. Not used in production code. */
  clearForTest(): void {
    this.providers.clear();
  }
}
