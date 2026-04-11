import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { SavedAudienceKind } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Low-level, dependency-free data-access layer for the `saved_audiences`
 * table.
 *
 * This repository is deliberately separate from `SavedAudiencesService`
 * so `AudienceComposer` can depend on it without creating a DI cycle
 * (the service depends on the composer to resolve dynamic audiences).
 *
 * All writes flow through `createRlsClient(prisma, { tenant_id }).$transaction(...)`
 * so RLS is enforced on insert/update/delete.
 */
@Injectable()
export class SavedAudiencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string): Promise<SavedAudienceRow | null> {
    const row = await this.prisma.savedAudience.findFirst({
      where: { id, tenant_id: tenantId },
      select: SAVED_AUDIENCE_SELECT,
    });
    return row as SavedAudienceRow | null;
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<SavedAudienceRow> {
    const row = await this.findById(tenantId, id);
    if (!row) {
      throw new NotFoundException({
        code: 'SAVED_AUDIENCE_NOT_FOUND',
        message: `Saved audience "${id}" not found`,
      });
    }
    return row;
  }

  async findMany(
    tenantId: string,
    filter?: { kind?: SavedAudienceKind },
  ): Promise<SavedAudienceRow[]> {
    const where: Prisma.SavedAudienceWhereInput = { tenant_id: tenantId };
    if (filter?.kind) where.kind = filter.kind;

    const rows = await this.prisma.savedAudience.findMany({
      where,
      select: SAVED_AUDIENCE_SELECT,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows as SavedAudienceRow[];
  }

  async findByName(tenantId: string, name: string): Promise<SavedAudienceRow | null> {
    const row = await this.prisma.savedAudience.findFirst({
      where: { tenant_id: tenantId, name },
      select: SAVED_AUDIENCE_SELECT,
    });
    return row as SavedAudienceRow | null;
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      description: string | null;
      kind: SavedAudienceKind;
      definition_json: unknown;
      created_by_user_id: string;
    },
  ): Promise<SavedAudienceRow> {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const row = await db.savedAudience.create({
        data: {
          tenant_id: tenantId,
          name: data.name,
          description: data.description,
          kind: data.kind,
          definition_json: data.definition_json as Prisma.InputJsonValue,
          created_by_user_id: data.created_by_user_id,
        },
        select: SAVED_AUDIENCE_SELECT,
      });
      return row as SavedAudienceRow;
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      definition_json?: unknown;
    },
  ): Promise<SavedAudienceRow> {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const patch: Prisma.SavedAudienceUpdateInput = {};
      if (data.name !== undefined) patch.name = data.name;
      if (data.description !== undefined) patch.description = data.description;
      if (data.definition_json !== undefined) {
        patch.definition_json = data.definition_json as Prisma.InputJsonValue;
      }

      const row = await db.savedAudience.update({
        where: { id },
        data: patch,
        select: SAVED_AUDIENCE_SELECT,
      });
      return row as SavedAudienceRow;
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.savedAudience.delete({ where: { id } });
    });
  }
}

const SAVED_AUDIENCE_SELECT = {
  id: true,
  tenant_id: true,
  name: true,
  description: true,
  kind: true,
  definition_json: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
} as const;

export interface SavedAudienceRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  kind: SavedAudienceKind;
  definition_json: unknown;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}
