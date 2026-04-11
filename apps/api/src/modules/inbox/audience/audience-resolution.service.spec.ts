import type { AudienceDefinition } from '@school/shared/inbox';

import type { AuthReadFacade } from '../../auth/auth-read.facade';

import type { AudienceComposer } from './audience-composer';
import { AudienceResolutionService } from './audience-resolution.service';
import type { SavedAudiencesRepository, SavedAudienceRow } from './saved-audiences.repository';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildService(options: {
  composeResult?: string[];
  composeSavedResult?: string[];
  savedAudienceRow?: SavedAudienceRow;
  users?: Array<{ id: string; first_name: string; last_name: string; email: string }>;
}): {
  service: AudienceResolutionService;
  composer: jest.Mocked<AudienceComposer>;
  savedAudiences: jest.Mocked<SavedAudiencesRepository>;
} {
  const composer = {
    compose: jest.fn(async () => ({ user_ids: options.composeResult ?? [] })),
    composeSavedAudienceRow: jest.fn(async () => ({
      user_ids: options.composeSavedResult ?? [],
    })),
  } as unknown as jest.Mocked<AudienceComposer>;

  const savedAudiences = {
    findByIdOrThrow: jest.fn(async () => {
      if (!options.savedAudienceRow) {
        throw new Error('savedAudienceRow fixture missing');
      }
      return options.savedAudienceRow;
    }),
  } as unknown as jest.Mocked<SavedAudiencesRepository>;

  const auth = {
    findUsersByIds: jest.fn(async (_t: string, ids: string[]) => {
      const all = options.users ?? [];
      return all.filter((u) => ids.includes(u.id));
    }),
  } as unknown as AuthReadFacade;

  const service = new AudienceResolutionService(composer, savedAudiences, auth);
  return { service, composer, savedAudiences };
}

describe('AudienceResolutionService — resolve', () => {
  it('calls composer.compose and echoes the definition back', async () => {
    const { service, composer } = buildService({ composeResult: ['u1', 'u2'] });
    const def: AudienceDefinition = { provider: 'parents_school' };
    const result = await service.resolve(TENANT_A, def);

    expect(composer.compose).toHaveBeenCalledWith(TENANT_A, def);
    expect(result.user_ids).toEqual(['u1', 'u2']);
    expect(result.definition).toBe(def);
    expect(result.resolved_at).toBeInstanceOf(Date);
  });
});

describe('AudienceResolutionService — resolveSavedAudience', () => {
  const row: SavedAudienceRow = {
    id: 'sa-1',
    tenant_id: TENANT_A,
    name: 'Priority parents',
    description: null,
    kind: 'static',
    definition_json: { user_ids: ['u1', 'u2'] },
    created_by_user_id: 'creator',
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('loads the saved audience then composes it', async () => {
    const { service, savedAudiences, composer } = buildService({
      savedAudienceRow: row,
      composeSavedResult: ['u1', 'u2'],
    });
    const result = await service.resolveSavedAudience(TENANT_A, 'sa-1');

    expect(savedAudiences.findByIdOrThrow).toHaveBeenCalledWith(TENANT_A, 'sa-1');
    expect(composer.composeSavedAudienceRow).toHaveBeenCalledWith(TENANT_A, row);
    expect(result.user_ids).toEqual(['u1', 'u2']);
    expect(result.definition).toEqual({
      provider: 'saved_group',
      params: { saved_audience_id: 'sa-1' },
    });
  });
});

describe('AudienceResolutionService — previewCount', () => {
  it('returns a deterministic 5-user sample sorted lexicographically', async () => {
    const { service } = buildService({
      composeResult: ['user-c', 'user-a', 'user-b', 'user-e', 'user-d', 'user-f'],
      users: [
        { id: 'user-a', first_name: 'Alice', last_name: 'Ant', email: 'a@x' },
        { id: 'user-b', first_name: 'Bob', last_name: 'Bee', email: 'b@x' },
        { id: 'user-c', first_name: 'Carol', last_name: 'Cat', email: 'c@x' },
        { id: 'user-d', first_name: 'Dan', last_name: 'Dog', email: 'd@x' },
        { id: 'user-e', first_name: 'Eve', last_name: 'Elk', email: 'e@x' },
        { id: 'user-f', first_name: 'Frank', last_name: 'Fox', email: 'f@x' },
      ],
    });

    const result = await service.previewCount(TENANT_A, { provider: 'parents_school' });
    expect(result.count).toBe(6);
    expect(result.sample.map((s) => s.user_id)).toEqual([
      'user-a',
      'user-b',
      'user-c',
      'user-d',
      'user-e',
    ]);
    expect(result.sample[0]?.display_name).toBe('Alice Ant');
  });

  it('falls back to "(unknown user)" when the user lookup misses', async () => {
    const { service } = buildService({
      composeResult: ['ghost'],
      users: [],
    });
    const result = await service.previewCount(TENANT_A, { provider: 'handpicked' });
    expect(result.sample[0]).toEqual({
      user_id: 'ghost',
      display_name: '(unknown user)',
    });
  });

  it('returns count 0 and empty sample when the audience resolves to nothing', async () => {
    const { service } = buildService({ composeResult: [] });
    const result = await service.previewCount(TENANT_A, { provider: 'parents_school' });
    expect(result).toEqual({ count: 0, sample: [] });
  });
});
