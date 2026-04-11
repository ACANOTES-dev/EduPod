import { Injectable } from '@nestjs/common';

import type { AudienceDefinition } from '@school/shared/inbox';

import { AuthReadFacade } from '../../auth/auth-read.facade';

import { AudienceComposer } from './audience-composer';
import { SavedAudiencesRepository } from './saved-audiences.repository';

/**
 * Shape of the preview result. `count` is the total resolved recipient
 * count; `sample` is a deterministic 5-user slice used by the chip
 * builder UI to show recognisable names alongside the count.
 */
export interface AudiencePreviewResult {
  count: number;
  sample: Array<{ user_id: string; display_name: string }>;
}

/**
 * Shape of a fully resolved audience. Consumers that persist a
 * broadcast snapshot (impl 04 / impl 06) use `user_ids` as the frozen
 * participant list and echo the original `definition` back into
 * `broadcast_audience_definitions.definition_json`.
 */
export interface AudienceResolutionResult {
  user_ids: string[];
  resolved_at: Date;
  definition: AudienceDefinition;
}

const SAMPLE_SIZE = 5;

/**
 * AudienceResolutionService — the front-door service for turning an
 * `AudienceDefinition` (or a saved audience ID) into a deduped
 * `user_ids[]`. Consumed by the broadcast send path (impl 04 / 06) and
 * the compose-dialog preview endpoint (`POST /v1/inbox/audiences/preview`).
 *
 * Composition, cycle detection, and the NOT-universe all live in
 * `AudienceComposer`. This service is the thin orchestration layer that
 * (a) times the resolution, (b) echoes the definition back for snapshot
 * persistence, and (c) builds the preview sample by joining the first
 * few user_ids against `AuthReadFacade`.
 */
@Injectable()
export class AudienceResolutionService {
  constructor(
    private readonly composer: AudienceComposer,
    private readonly savedAudiences: SavedAudiencesRepository,
    private readonly auth: AuthReadFacade,
  ) {}

  async resolve(
    tenantId: string,
    definition: AudienceDefinition,
  ): Promise<AudienceResolutionResult> {
    const { user_ids } = await this.composer.compose(tenantId, definition);
    return {
      user_ids,
      resolved_at: new Date(),
      definition,
    };
  }

  async resolveSavedAudience(
    tenantId: string,
    savedAudienceId: string,
  ): Promise<AudienceResolutionResult> {
    const row = await this.savedAudiences.findByIdOrThrow(tenantId, savedAudienceId);
    const { user_ids } = await this.composer.composeSavedAudienceRow(tenantId, row);
    return {
      user_ids,
      resolved_at: new Date(),
      definition: { provider: 'saved_group', params: { saved_audience_id: savedAudienceId } },
    };
  }

  /**
   * Preview an arbitrary definition without saving it. Returns the
   * total recipient count plus a deterministic 5-user sample so the
   * chip builder can show "≈ 142 recipients — including Alice, Bob…".
   *
   * The sample is deterministic by sorting the resolved user_ids
   * lexicographically and taking the top 5 — tests can assert the
   * exact sample without relying on insertion order, and callers get
   * a stable preview for a given definition over successive refreshes.
   */
  async previewCount(
    tenantId: string,
    definition: AudienceDefinition,
  ): Promise<AudiencePreviewResult> {
    const { user_ids } = await this.composer.compose(tenantId, definition);
    const sorted = [...user_ids].sort();
    const sampleIds = sorted.slice(0, SAMPLE_SIZE);
    const users = await this.auth.findUsersByIds(tenantId, sampleIds);
    const displayById = new Map<string, string>();
    for (const u of users) {
      displayById.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim());
    }
    const sample = sampleIds.map((id) => ({
      user_id: id,
      display_name: displayById.get(id) ?? '(unknown user)',
    }));
    return {
      count: user_ids.length,
      sample,
    };
  }
}
