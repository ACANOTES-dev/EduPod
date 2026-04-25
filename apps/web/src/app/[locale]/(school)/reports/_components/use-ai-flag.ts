'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiFlagRow {
  module_key: string;
  enabled: boolean;
}

export type AiFlagState = 'loading' | 'enabled' | 'disabled' | 'unknown';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Resolves a single tenant_ai_flags row by module_key. Reads `/api/v1/ai-flags`
 * and reports the tenant-level toggle state for the requested key.
 *
 * - `loading` while the request is in flight
 * - `enabled` when the row exists with `enabled = true`
 * - `disabled` when the row exists with `enabled = false`
 * - `unknown` when the row is missing or the request errored (treated as off
 *   for UI gating — never auto-show AI surfaces if we can't confirm).
 */
export function useAiFlag(moduleKey: string): AiFlagState {
  const [state, setState] = React.useState<AiFlagState>('loading');

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', { silent: true })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const row = rows.find((r) => r.module_key === moduleKey);
        if (!row) {
          setState('unknown');
          return;
        }
        setState(row.enabled ? 'enabled' : 'disabled');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useAiFlag]', moduleKey, err);
        setState('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [moduleKey]);

  return state;
}
