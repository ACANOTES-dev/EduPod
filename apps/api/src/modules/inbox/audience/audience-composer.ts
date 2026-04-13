import { BadRequestException, Injectable } from '@nestjs/common';

import {
  audienceDefinitionSchema,
  isAudienceAndNode,
  isAudienceLeaf,
  isAudienceNotNode,
  isAudienceOrNode,
  type AudienceDefinition,
} from '@school/shared/inbox';

import { AudienceProviderRegistry } from './audience-provider.registry';
import { AudienceUserIdResolver } from './audience-user-id.resolver';
import type { AudienceResolveResult } from './providers/provider.interface';
import { SavedAudiencesRepository, type SavedAudienceRow } from './saved-audiences.repository';

/**
 * Context carried through a single compose walk:
 *
 *   - `visitedSavedIds` tracks which `saved_group` IDs have been
 *     dereferenced on the current recursion stack so cycles fail fast.
 *   - `universePromise` memoises the tenant universe for `NOT`
 *     evaluation so a composition with many NOT nodes does not
 *     re-query the whole tenant repeatedly.
 */
interface ComposeContext {
  tenantId: string;
  visitedSavedIds: Set<string>;
  universePromise: Promise<string[]> | null;
}

// Hard cap on walk depth across and/or/not + saved_group nesting.
// Beyond this a definition is either malformed or pathological — fail
// fast with AUDIENCE_MAX_DEPTH_EXCEEDED rather than risk stack exhaustion.
const AUDIENCE_MAX_DEPTH = 8;

/**
 * AudienceComposer — pure-function set algebra over provider outputs.
 *
 * Walks an `AudienceDefinition` tree:
 *   - Leaf (`provider`) → parse leaf params with provider schema,
 *     call `provider.resolve(tenantId, params)`, return the resulting
 *     `Set<user_id>`.
 *   - `and` → intersection of every operand's set.
 *   - `or`  → union of every operand's set.
 *   - `not` → complement of the operand against the tenant universe
 *     (`AudienceUserIdResolver.buildTenantUniverse`). The universe is
 *     computed lazily and cached for the lifetime of a single
 *     `compose()` call.
 *
 * `saved_group` leaves are intercepted at walk time: the composer reads
 * the stored `definition_json` via `SavedAudiencesRepository` and
 * recursively composes it, tracking visited IDs so cycles surface as
 * `SAVED_AUDIENCE_CYCLE_DETECTED` instead of stack overflow.
 */
@Injectable()
export class AudienceComposer {
  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly savedAudiences: SavedAudiencesRepository,
    private readonly users: AudienceUserIdResolver,
  ) {}

  /**
   * Entry point — validates the definition tree against the shared
   * schema (including depth limit) and walks it to a deduped
   * `user_ids` array.
   */
  async compose(tenantId: string, definition: AudienceDefinition): Promise<AudienceResolveResult> {
    const parsed = audienceDefinitionSchema.parse(definition);
    const ctx: ComposeContext = {
      tenantId,
      visitedSavedIds: new Set(),
      universePromise: null,
    };
    const set = await this.walk(parsed, ctx, 0);
    return { user_ids: [...set] };
  }

  private async walk(
    definition: AudienceDefinition,
    ctx: ComposeContext,
    depth: number,
  ): Promise<Set<string>> {
    if (depth > AUDIENCE_MAX_DEPTH) {
      throw new BadRequestException({
        code: 'AUDIENCE_MAX_DEPTH_EXCEEDED',
        message: `Audience definition exceeds the maximum nesting depth of ${AUDIENCE_MAX_DEPTH}`,
      });
    }

    if (isAudienceLeaf(definition)) {
      return this.resolveLeaf(definition, ctx, depth);
    }

    if (isAudienceAndNode(definition)) {
      const operandSets = await Promise.all(
        definition.operands.map((op) => this.walk(op, ctx, depth + 1)),
      );
      return intersect(operandSets);
    }

    if (isAudienceOrNode(definition)) {
      const operandSets = await Promise.all(
        definition.operands.map((op) => this.walk(op, ctx, depth + 1)),
      );
      return union(operandSets);
    }

    if (isAudienceNotNode(definition)) {
      const [operandSet, universe] = await Promise.all([
        this.walk(definition.operand, ctx, depth + 1),
        this.getUniverse(ctx),
      ]);
      return complement(universe, operandSet);
    }

    // Exhaustive guard — audienceDefinitionSchema prevents this from firing.
    throw new BadRequestException({
      code: 'AUDIENCE_DEFINITION_INVALID',
      message: 'Unrecognised audience definition node',
    });
  }

  private async resolveLeaf(
    leaf: { provider: string; params?: Record<string, unknown> },
    ctx: ComposeContext,
    depth: number,
  ): Promise<Set<string>> {
    if (leaf.provider === 'saved_group') {
      return this.resolveSavedGroup(leaf.params ?? {}, ctx, depth);
    }

    const provider = this.registry.get(leaf.provider as never);
    const paramsParse = provider.paramsSchema.safeParse(leaf.params ?? {});
    if (!paramsParse.success) {
      throw new BadRequestException({
        code: 'AUDIENCE_PROVIDER_PARAMS_INVALID',
        message: `Params for provider "${leaf.provider}" are invalid`,
        details: paramsParse.error.flatten(),
      });
    }
    const result = await provider.resolve(ctx.tenantId, paramsParse.data);
    return new Set(result.user_ids);
  }

  private async resolveSavedGroup(
    params: Record<string, unknown>,
    ctx: ComposeContext,
    depth: number,
  ): Promise<Set<string>> {
    const id = typeof params.saved_audience_id === 'string' ? params.saved_audience_id : null;
    if (!id) {
      throw new BadRequestException({
        code: 'AUDIENCE_PROVIDER_PARAMS_INVALID',
        message: 'saved_group requires a saved_audience_id',
      });
    }

    if (ctx.visitedSavedIds.has(id)) {
      throw new BadRequestException({
        code: 'SAVED_AUDIENCE_CYCLE_DETECTED',
        message: `Saved audience "${id}" refers to itself (directly or transitively)`,
      });
    }
    ctx.visitedSavedIds.add(id);

    try {
      const row = await this.savedAudiences.findByIdOrThrow(ctx.tenantId, id);
      return await this.resolveStoredDefinition(row, ctx, depth + 1);
    } finally {
      ctx.visitedSavedIds.delete(id);
    }
  }

  /**
   * Resolve a saved audience row's stored definition. Static audiences
   * return their frozen `user_ids` after filtering to current tenant
   * members. Dynamic audiences walk back through the composer.
   */
  private async resolveStoredDefinition(
    row: SavedAudienceRow,
    ctx: ComposeContext,
    depth: number,
  ): Promise<Set<string>> {
    const stored = row.definition_json as {
      user_ids?: string[];
    } & Record<string, unknown>;

    if (row.kind === 'static') {
      if (!Array.isArray(stored.user_ids)) {
        throw new BadRequestException({
          code: 'SAVED_AUDIENCE_DEFINITION_INVALID',
          message: `Static saved audience "${row.id}" is missing its user_ids list`,
        });
      }
      const allowed = await this.users.filterToTenantMembers(ctx.tenantId, stored.user_ids);
      return new Set(allowed);
    }

    // Dynamic — the stored JSON is a full AudienceDefinition tree.
    const parsed = audienceDefinitionSchema.parse(stored);
    return this.walk(parsed, ctx, depth);
  }

  /**
   * Public helper used by `AudienceResolutionService.resolveSavedAudience`
   * so direct-resolve (without wrapping in a `saved_group` leaf) takes
   * the same code path and still gets cycle detection + universe cache.
   */
  async composeSavedAudienceRow(
    tenantId: string,
    row: SavedAudienceRow,
  ): Promise<AudienceResolveResult> {
    const ctx: ComposeContext = {
      tenantId,
      visitedSavedIds: new Set([row.id]),
      universePromise: null,
    };
    const set = await this.resolveStoredDefinition(row, ctx, 0);
    return { user_ids: [...set] };
  }

  private getUniverse(ctx: ComposeContext): Promise<string[]> {
    if (!ctx.universePromise) {
      ctx.universePromise = this.users.buildTenantUniverse(ctx.tenantId);
    }
    return ctx.universePromise;
  }
}

// ─── Pure set-algebra helpers ─────────────────────────────────────────────────

function intersect(sets: Set<string>[]): Set<string> {
  const first = sets[0];
  if (!first) return new Set();
  const rest = sets.slice(1);
  const result = new Set<string>();
  for (const v of first) {
    if (rest.every((s) => s.has(v))) result.add(v);
  }
  return result;
}

function union(sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const s of sets) for (const v of s) result.add(v);
  return result;
}

function complement(universe: string[], exclude: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const v of universe) if (!exclude.has(v)) result.add(v);
  return result;
}
