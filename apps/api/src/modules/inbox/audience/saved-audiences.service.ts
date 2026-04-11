import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

import {
  audienceDefinitionSchema,
  createSavedAudienceSchema,
  type AudienceDefinition,
  type CreateSavedAudienceDto,
  type SavedAudienceKind,
  type UpdateSavedAudienceDto,
} from '@school/shared/inbox';

import { AudienceResolutionService } from './audience-resolution.service';
import type { AudienceResolveResult } from './providers/provider.interface';
import { SavedAudiencesRepository, type SavedAudienceRow } from './saved-audiences.repository';

/**
 * SavedAudiencesService — thin CRUD + resolve orchestration over
 * `SavedAudiencesRepository`.
 *
 * Validation rules:
 *   - The supplied `definition` is validated against the static/dynamic
 *     discriminator in `createSavedAudienceSchema`, then (for dynamic)
 *     re-validated against `audienceDefinitionSchema` to enforce the
 *     depth limit.
 *   - Names are unique per tenant (DB constraint
 *     `uniq_saved_audience_name_per_tenant`); the service surfaces the
 *     violation as `SAVED_AUDIENCE_NAME_TAKEN`.
 *   - Dynamic definitions MUST NOT include a top-level `saved_group`
 *     leaf whose target is the audience being saved — that's enforced
 *     lazily at resolve time via the cycle detector, but we preemptively
 *     reject obvious self-refs on update.
 */
@Injectable()
export class SavedAudiencesService {
  constructor(
    private readonly repository: SavedAudiencesRepository,
    private readonly resolver: AudienceResolutionService,
  ) {}

  async list(tenantId: string, filter?: { kind?: SavedAudienceKind }): Promise<SavedAudienceRow[]> {
    return this.repository.findMany(tenantId, filter);
  }

  async get(tenantId: string, id: string): Promise<SavedAudienceRow> {
    return this.repository.findByIdOrThrow(tenantId, id);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSavedAudienceDto,
  ): Promise<SavedAudienceRow> {
    // Double-validate via the schema even though the controller already
    // ran the pipe — this keeps the service usable outside HTTP
    // boundaries (e.g. internal callers, tests) with the same guarantees.
    const parsed = createSavedAudienceSchema.parse(dto);

    if (parsed.kind === 'dynamic') {
      audienceDefinitionSchema.parse(parsed.definition);
    }

    const clash = await this.repository.findByName(tenantId, parsed.name);
    if (clash) {
      throw new ConflictException({
        code: 'SAVED_AUDIENCE_NAME_TAKEN',
        message: `A saved audience named "${parsed.name}" already exists in this tenant`,
      });
    }

    return this.repository.create(tenantId, {
      name: parsed.name,
      description: parsed.description ?? null,
      kind: parsed.kind,
      definition_json: parsed.definition,
      created_by_user_id: userId,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSavedAudienceDto,
  ): Promise<SavedAudienceRow> {
    const existing = await this.repository.findByIdOrThrow(tenantId, id);

    if (dto.name !== undefined && dto.name !== existing.name) {
      const clash = await this.repository.findByName(tenantId, dto.name);
      if (clash && clash.id !== id) {
        throw new ConflictException({
          code: 'SAVED_AUDIENCE_NAME_TAKEN',
          message: `A saved audience named "${dto.name}" already exists in this tenant`,
        });
      }
    }

    if (dto.definition !== undefined) {
      if (existing.kind === 'static') {
        if (!('user_ids' in dto.definition)) {
          throw new BadRequestException({
            code: 'SAVED_AUDIENCE_DEFINITION_INVALID',
            message: 'Cannot replace a static audience with a dynamic definition tree',
          });
        }
      } else {
        if ('user_ids' in dto.definition) {
          throw new BadRequestException({
            code: 'SAVED_AUDIENCE_DEFINITION_INVALID',
            message: 'Cannot replace a dynamic audience with a frozen user_ids list',
          });
        }
        audienceDefinitionSchema.parse(dto.definition);
        this.rejectObviousSelfReference(id, dto.definition as AudienceDefinition);
      }
    }

    return this.repository.update(tenantId, id, {
      name: dto.name,
      description: dto.description,
      definition_json: dto.definition,
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.repository.findByIdOrThrow(tenantId, id);
    await this.repository.delete(tenantId, id);
  }

  /**
   * Used by the `saved_group` provider indirectly via the composer, and
   * by the admin `/resolve` debug endpoint on the controller.
   */
  async resolve(tenantId: string, id: string): Promise<AudienceResolveResult> {
    const resolved = await this.resolver.resolveSavedAudience(tenantId, id);
    return { user_ids: resolved.user_ids };
  }

  /**
   * Scan a definition tree for a `saved_group` leaf pointing at the
   * same ID we're updating — that's always an immediate self-reference.
   * Transitive cycles still surface at resolve time via
   * `SAVED_AUDIENCE_CYCLE_DETECTED`, but catching the trivial case
   * early improves the error message for the common mistake.
   */
  private rejectObviousSelfReference(id: string, def: AudienceDefinition): void {
    if ('provider' in def) {
      if (
        def.provider === 'saved_group' &&
        typeof def.params?.saved_audience_id === 'string' &&
        def.params.saved_audience_id === id
      ) {
        throw new BadRequestException({
          code: 'SAVED_AUDIENCE_CYCLE_DETECTED',
          message: 'Saved audience cannot reference itself',
        });
      }
      return;
    }
    if (def.operator === 'not') {
      this.rejectObviousSelfReference(id, def.operand);
      return;
    }
    for (const op of def.operands) this.rejectObviousSelfReference(id, op);
  }
}
