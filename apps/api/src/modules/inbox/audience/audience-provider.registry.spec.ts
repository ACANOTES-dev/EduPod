import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { AudienceProviderRegistry } from './audience-provider.registry';
import type { AudienceProvider } from './providers/provider.interface';

function buildFakeProvider(overrides: Partial<AudienceProvider> = {}): AudienceProvider {
  return {
    key: 'handpicked',
    displayName: 'Handpicked',
    paramsSchema: z.object({}),
    wired: true,
    resolve: async () => ({ user_ids: [] }),
    ...overrides,
  };
}

describe('AudienceProviderRegistry', () => {
  let registry: AudienceProviderRegistry;

  beforeEach(() => {
    registry = new AudienceProviderRegistry();
  });

  it('registers providers and resolves them by key', () => {
    const provider = buildFakeProvider();
    registry.register(provider);
    expect(registry.get('handpicked')).toBe(provider);
    expect(registry.has('handpicked')).toBe(true);
  });

  it('throws UNKNOWN_AUDIENCE_PROVIDER on get() for an unknown key', () => {
    expect(() => registry.get('school')).toThrow(NotFoundException);
    try {
      registry.get('school');
    } catch (err) {
      const response = (err as NotFoundException).getResponse() as { code: string };
      expect(response.code).toBe('UNKNOWN_AUDIENCE_PROVIDER');
    }
  });

  it('list() returns every registered provider', () => {
    registry.register(buildFakeProvider({ key: 'handpicked' }));
    registry.register(buildFakeProvider({ key: 'school', displayName: 'School' }));
    const keys = registry.list().map((p) => p.key);
    expect(keys.sort()).toEqual(['handpicked', 'school']);
  });

  it('re-registering the same key replaces the previous provider', () => {
    const first = buildFakeProvider({ displayName: 'First' });
    const second = buildFakeProvider({ displayName: 'Second' });
    registry.register(first);
    registry.register(second);
    expect(registry.get('handpicked').displayName).toBe('Second');
  });
});
