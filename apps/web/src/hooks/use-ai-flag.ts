import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WellbeingAiModuleKey = 'behaviour' | 'pastoral' | 'early_warning' | 'staff_wellbeing';

export type AiFlagState = 'unknown' | 'enabled' | 'disabled';

export interface AiFlagRow {
  module_key: string;
  enabled: boolean;
  updated_at?: string | null;
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Projects a raw API response into a `Map<moduleKey, enabled>`. Accepts either
 * the bare-array shape or the `{ data: [...] }` envelope shape (the global
 * ResponseTransformInterceptor may wrap 200s either way).
 */
export function projectFlagsResponse(raw: unknown): Map<string, boolean> {
  const rows = extractRows(raw);
  const map = new Map<string, boolean>();
  for (const row of rows) {
    if (row && typeof row.module_key === 'string' && typeof row.enabled === 'boolean') {
      map.set(row.module_key, row.enabled);
    }
  }
  return map;
}

/**
 * Derives the per-module state from a pre-projected map. A module that's
 * absent from the map resolves to `'unknown'` — the common case when the
 * user lacks `ai_flag.manage` and the API returned 403 (projected to
 * empty map) or the tenant is missing defensive backfill rows.
 */
export function deriveFlagState(
  map: Map<string, boolean>,
  moduleKey: WellbeingAiModuleKey,
): AiFlagState {
  const value = map.get(moduleKey);
  if (value === undefined) return 'unknown';
  return value ? 'enabled' : 'disabled';
}

function extractRows(raw: unknown): AiFlagRow[] {
  if (Array.isArray(raw)) return raw as AiFlagRow[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
    return (raw as { data: AiFlagRow[] }).data;
  }
  return [];
}

// ─── Session-scoped cache ─────────────────────────────────────────────────────
// One fetch per page-load. Teachers lacking ai_flag.manage get 403 — that
// rejection is caught and projected to an empty map, so every call to
// `useAiFlag` resolves to 'unknown' and the backend @RequiresAiFlag decorator
// stays the authoritative gate.

let cachePromise: Promise<Map<string, boolean>> | null = null;

function loadFlags(): Promise<Map<string, boolean>> {
  if (!cachePromise) {
    cachePromise = apiClient<{ data: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', {
      silent: true,
    })
      .then(projectFlagsResponse)
      .catch(() => new Map<string, boolean>());
  }
  return cachePromise;
}

/**
 * Reset the session cache. Exposed so the AI flags admin page (impl 18) can
 * propagate a toggle to any live consumer without a full page reload.
 */
export function resetAiFlagCache(): void {
  cachePromise = null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Returns the AI flag state for a wellbeing module. Consumers should show
 * AI surfaces when state !== 'disabled' (treat 'unknown' as optimistic —
 * the backend is authoritative).
 */
export function useAiFlag(moduleKey: WellbeingAiModuleKey): AiFlagState {
  const [state, setState] = React.useState<AiFlagState>('unknown');

  React.useEffect(() => {
    let cancelled = false;
    void loadFlags().then((map) => {
      if (cancelled) return;
      setState(deriveFlagState(map, moduleKey));
    });
    return () => {
      cancelled = true;
    };
  }, [moduleKey]);

  return state;
}

/**
 * Convenience: returns true iff AI should be visible to the user for a
 * given module (state !== 'disabled').
 */
export function useAiFlagVisible(moduleKey: WellbeingAiModuleKey): boolean {
  return useAiFlag(moduleKey) !== 'disabled';
}
