import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import type { AudienceDefinition } from '@school/shared/inbox';

import { AudienceComposer } from './audience-composer';
import { AudienceProviderRegistry } from './audience-provider.registry';
import type { AudienceUserIdResolver } from './audience-user-id.resolver';
import type { AudienceProvider } from './providers/provider.interface';
import { SavedAudiencesRepository, type SavedAudienceRow } from './saved-audiences.repository';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function provider(
  key: string,
  userIds: string[],
  overrides: Partial<AudienceProvider> = {},
): AudienceProvider {
  return {
    key: key as AudienceProvider['key'],
    displayName: key,
    paramsSchema: z.record(z.unknown()).optional(),
    wired: true,
    resolve: jest.fn(async () => ({ user_ids: userIds })),
    ...overrides,
  };
}

function buildComposer(options: {
  providers: AudienceProvider[];
  universe?: string[];
  savedAudiences?: SavedAudienceRow[];
  tenantMembers?: string[];
}): { composer: AudienceComposer; registry: AudienceProviderRegistry } {
  const registry = new AudienceProviderRegistry();
  for (const p of options.providers) registry.register(p);

  const users = {
    buildTenantUniverse: jest.fn(async () => options.universe ?? []),
    filterToTenantMembers: jest.fn(async (_t: string, ids: string[]) => {
      const members = new Set(options.tenantMembers ?? ids);
      return ids.filter((id) => members.has(id));
    }),
  } as unknown as AudienceUserIdResolver;

  const savedAudiences = {
    findByIdOrThrow: jest.fn(async (_t: string, id: string) => {
      const row = options.savedAudiences?.find((s) => s.id === id);
      if (!row) {
        throw new NotFoundException({ code: 'SAVED_AUDIENCE_NOT_FOUND', message: id });
      }
      return row;
    }),
  } as unknown as SavedAudiencesRepository;

  return {
    composer: new AudienceComposer(registry, savedAudiences, users),
    registry,
  };
}

describe('AudienceComposer — leaf', () => {
  it('resolves a single leaf to its provider output', async () => {
    const { composer } = buildComposer({
      providers: [provider('school', ['u1', 'u2'])],
    });
    const result = await composer.compose(TENANT_A, { provider: 'school' });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2']);
  });

  it('throws UNKNOWN_AUDIENCE_PROVIDER for an unregistered key', async () => {
    const { composer } = buildComposer({ providers: [] });
    await expect(composer.compose(TENANT_A, { provider: 'school' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AudienceComposer — set algebra', () => {
  it('AND intersects operand sets', async () => {
    const { composer } = buildComposer({
      providers: [
        provider('handpicked', ['u1', 'u2', 'u3']),
        provider('school', ['u2', 'u3', 'u4']),
      ],
    });
    const def: AudienceDefinition = {
      operator: 'and',
      operands: [{ provider: 'handpicked' }, { provider: 'school' }],
    };
    const result = await composer.compose(TENANT_A, def);
    expect(result.user_ids.sort()).toEqual(['u2', 'u3']);
  });

  it('OR unions operand sets and dedupes', async () => {
    const { composer } = buildComposer({
      providers: [provider('handpicked', ['u1', 'u2']), provider('school', ['u2', 'u3'])],
    });
    const def: AudienceDefinition = {
      operator: 'or',
      operands: [{ provider: 'handpicked' }, { provider: 'school' }],
    };
    const result = await composer.compose(TENANT_A, def);
    expect(result.user_ids.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('NOT takes the complement against the tenant universe', async () => {
    const { composer } = buildComposer({
      providers: [provider('handpicked', ['u2'])],
      universe: ['u1', 'u2', 'u3'],
    });
    const def: AudienceDefinition = {
      operator: 'not',
      operand: { provider: 'handpicked' },
    };
    const result = await composer.compose(TENANT_A, def);
    expect(result.user_ids.sort()).toEqual(['u1', 'u3']);
  });

  it('handles nested AND/OR/NOT trees', async () => {
    const { composer } = buildComposer({
      providers: [
        provider('parents_school', ['u1', 'u2', 'u3', 'u4']),
        provider('handpicked', ['u3']),
      ],
      universe: ['u1', 'u2', 'u3', 'u4'],
    });
    // parents_school AND NOT handpicked  == {u1, u2, u4}
    const def: AudienceDefinition = {
      operator: 'and',
      operands: [
        { provider: 'parents_school' },
        { operator: 'not', operand: { provider: 'handpicked' } },
      ],
    };
    const result = await composer.compose(TENANT_A, def);
    expect(result.user_ids.sort()).toEqual(['u1', 'u2', 'u4']);
  });
});

describe('AudienceComposer — saved_group', () => {
  it('dereferences a static saved audience, filtered to tenant members', async () => {
    const { composer } = buildComposer({
      providers: [provider('saved_group', [])],
      savedAudiences: [
        {
          id: 'sa-1',
          tenant_id: TENANT_A,
          name: 'Core parents',
          description: null,
          kind: 'static',
          definition_json: { user_ids: ['u1', 'u2', 'u-ghost'] },
          created_by_user_id: 'creator',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      tenantMembers: ['u1', 'u2'],
    });
    const result = await composer.compose(TENANT_A, {
      provider: 'saved_group',
      params: { saved_audience_id: 'sa-1' },
    });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2']);
  });

  it('dereferences a dynamic saved audience by walking its stored definition', async () => {
    const { composer } = buildComposer({
      providers: [provider('handpicked', ['u1', 'u2'])],
      savedAudiences: [
        {
          id: 'sa-dyn',
          tenant_id: TENANT_A,
          name: 'Dynamic',
          description: null,
          kind: 'dynamic',
          definition_json: { provider: 'handpicked' },
          created_by_user_id: 'creator',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const result = await composer.compose(TENANT_A, {
      provider: 'saved_group',
      params: { saved_audience_id: 'sa-dyn' },
    });
    expect(result.user_ids.sort()).toEqual(['u1', 'u2']);
  });

  it('throws SAVED_AUDIENCE_CYCLE_DETECTED on self-reference', async () => {
    const { composer } = buildComposer({
      providers: [],
      savedAudiences: [
        {
          id: 'sa-cycle',
          tenant_id: TENANT_A,
          name: 'Cycle',
          description: null,
          kind: 'dynamic',
          definition_json: {
            provider: 'saved_group',
            params: { saved_audience_id: 'sa-cycle' },
          },
          created_by_user_id: 'creator',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    try {
      await composer.compose(TENANT_A, {
        provider: 'saved_group',
        params: { saved_audience_id: 'sa-cycle' },
      });
      fail('expected cycle detection to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as { code: string };
      expect(response.code).toBe('SAVED_AUDIENCE_CYCLE_DETECTED');
    }
  });
});

describe('AudienceComposer — validation', () => {
  it('rejects a tree deeper than AUDIENCE_DEFINITION_MAX_DEPTH', async () => {
    const { composer } = buildComposer({
      providers: [provider('handpicked', ['u1'])],
    });
    let def: AudienceDefinition = { provider: 'handpicked' };
    for (let i = 0; i < 10; i += 1) {
      def = { operator: 'not', operand: def };
    }
    await expect(composer.compose(TENANT_A, def)).rejects.toThrow();
  });

  it('caches the tenant universe for multiple NOT nodes in one walk', async () => {
    const users = {
      buildTenantUniverse: jest.fn(async () => ['u1', 'u2', 'u3']),
      filterToTenantMembers: jest.fn(async (_t: string, ids: string[]) => ids),
    } as unknown as AudienceUserIdResolver;
    const registry = new AudienceProviderRegistry();
    registry.register(provider('handpicked', ['u1']));
    registry.register(provider('school', ['u2']));
    const savedAudiences = {
      findByIdOrThrow: jest.fn(),
    } as unknown as SavedAudiencesRepository;
    const composer = new AudienceComposer(registry, savedAudiences, users);

    const def: AudienceDefinition = {
      operator: 'or',
      operands: [
        { operator: 'not', operand: { provider: 'handpicked' } },
        { operator: 'not', operand: { provider: 'school' } },
      ],
    };
    await composer.compose(TENANT_A, def);
    expect((users.buildTenantUniverse as jest.Mock).mock.calls).toHaveLength(1);
  });
});
