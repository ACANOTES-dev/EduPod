import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { CreateSavedAudienceDto, UpdateSavedAudienceDto } from '@school/shared/inbox';

import type { AudienceResolutionService } from './audience-resolution.service';
import type { SavedAudiencesRepository, SavedAudienceRow } from './saved-audiences.repository';
import { SavedAudiencesService } from './saved-audiences.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CREATOR = 'creator-user';

function buildRow(over: Partial<SavedAudienceRow> = {}): SavedAudienceRow {
  return {
    id: 'sa-1',
    tenant_id: TENANT_A,
    name: 'Priority parents',
    description: null,
    kind: 'dynamic',
    definition_json: { provider: 'parents_school' },
    created_by_user_id: CREATOR,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function buildService(fixtures: {
  rowsByTenant?: Record<string, SavedAudienceRow[]>;
  resolveResult?: string[];
}): {
  service: SavedAudiencesService;
  repo: jest.Mocked<SavedAudiencesRepository>;
} {
  const rowsByTenant = fixtures.rowsByTenant ?? {};

  const repo = {
    findMany: jest.fn(async (t: string) => rowsByTenant[t] ?? []),
    findById: jest.fn(
      async (t: string, id: string) => (rowsByTenant[t] ?? []).find((r) => r.id === id) ?? null,
    ),
    findByIdOrThrow: jest.fn(async (t: string, id: string) => {
      const row = (rowsByTenant[t] ?? []).find((r) => r.id === id);
      if (!row) {
        throw new NotFoundException({ code: 'SAVED_AUDIENCE_NOT_FOUND', message: id });
      }
      return row;
    }),
    findByName: jest.fn(
      async (t: string, name: string) =>
        (rowsByTenant[t] ?? []).find((r) => r.name === name) ?? null,
    ),
    create: jest.fn(async (t: string, input: Parameters<SavedAudiencesRepository['create']>[1]) => {
      const row: SavedAudienceRow = {
        id: 'new-id',
        tenant_id: t,
        name: input.name,
        description: input.description,
        kind: input.kind,
        definition_json: input.definition_json,
        created_by_user_id: input.created_by_user_id,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rowsByTenant[t] = [...(rowsByTenant[t] ?? []), row];
      return row;
    }),
    update: jest.fn(
      async (t: string, id: string, patch: Parameters<SavedAudiencesRepository['update']>[2]) => {
        const list = rowsByTenant[t] ?? [];
        const idx = list.findIndex((r) => r.id === id);
        const existing = list[idx];
        if (!existing) throw new Error(`missing fixture row ${id}`);
        const merged: SavedAudienceRow = {
          ...existing,
          name: patch.name ?? existing.name,
          description: patch.description ?? existing.description,
          definition_json: patch.definition_json ?? existing.definition_json,
          updated_at: new Date(),
        };
        rowsByTenant[t] = [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
        return merged;
      },
    ),
    delete: jest.fn(async (t: string, id: string) => {
      rowsByTenant[t] = (rowsByTenant[t] ?? []).filter((r) => r.id !== id);
    }),
  } as unknown as jest.Mocked<SavedAudiencesRepository>;

  const resolver = {
    resolveSavedAudience: jest.fn(async () => ({
      user_ids: fixtures.resolveResult ?? [],
      resolved_at: new Date(),
      definition: { provider: 'saved_group' as const, params: {} },
    })),
  } as unknown as AudienceResolutionService;

  return { service: new SavedAudiencesService(repo, resolver), repo };
}

describe('SavedAudiencesService — create', () => {
  it('creates a dynamic audience with a valid definition', async () => {
    const { service } = buildService({});
    const dto: CreateSavedAudienceDto = {
      name: 'Year 5 parents',
      description: null,
      kind: 'dynamic',
      definition: {
        provider: 'year_group_parents',
        params: { year_group_ids: ['11111111-1111-1111-1111-111111111111'] },
      },
    };
    const row = await service.create(TENANT_A, CREATOR, dto);
    expect(row.name).toBe('Year 5 parents');
    expect(row.kind).toBe('dynamic');
    expect(row.created_by_user_id).toBe(CREATOR);
  });

  it('creates a static audience with a user_ids list', async () => {
    const { service } = buildService({});
    const dto: CreateSavedAudienceDto = {
      name: 'Priority',
      kind: 'static',
      definition: { user_ids: ['11111111-1111-1111-1111-111111111111'] },
    };
    const row = await service.create(TENANT_A, CREATOR, dto);
    expect(row.kind).toBe('static');
  });

  it('rejects a name that already exists in the tenant', async () => {
    const existing = buildRow({ name: 'Priority' });
    const { service } = buildService({ rowsByTenant: { [TENANT_A]: [existing] } });
    await expect(
      service.create(TENANT_A, CREATOR, {
        name: 'Priority',
        kind: 'dynamic',
        definition: { provider: 'parents_school' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SavedAudiencesService — update', () => {
  it('blocks replacing a static audience with a dynamic definition', async () => {
    const existing = buildRow({
      id: 'sa-2',
      kind: 'static',
      definition_json: { user_ids: ['11111111-1111-1111-1111-111111111111'] },
    });
    const { service } = buildService({ rowsByTenant: { [TENANT_A]: [existing] } });
    const patch: UpdateSavedAudienceDto = {
      definition: { provider: 'parents_school' },
    };
    await expect(service.update(TENANT_A, 'sa-2', patch)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a direct self-reference in a dynamic audience', async () => {
    const existing = buildRow({ id: 'sa-3' });
    const { service } = buildService({ rowsByTenant: { [TENANT_A]: [existing] } });
    const patch: UpdateSavedAudienceDto = {
      definition: { provider: 'saved_group', params: { saved_audience_id: 'sa-3' } },
    };
    await expect(service.update(TENANT_A, 'sa-3', patch)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('SavedAudiencesService — RLS isolation', () => {
  it('get() for an audience in another tenant returns 404', async () => {
    const rowA = buildRow({ id: 'sa-a', tenant_id: TENANT_A });
    const rowB = buildRow({
      id: 'sa-b',
      tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });
    const { service } = buildService({
      rowsByTenant: { [TENANT_A]: [rowA], 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': [rowB] },
    });
    await expect(service.get(TENANT_A, 'sa-b')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SavedAudiencesService — delete', () => {
  it('deletes an existing audience', async () => {
    const row = buildRow({ id: 'sa-del' });
    const { service, repo } = buildService({ rowsByTenant: { [TENANT_A]: [row] } });
    await service.delete(TENANT_A, 'sa-del');
    expect(repo.delete).toHaveBeenCalledWith(TENANT_A, 'sa-del');
  });

  it('throws 404 when deleting a missing audience', async () => {
    const { service } = buildService({});
    await expect(service.delete(TENANT_A, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
