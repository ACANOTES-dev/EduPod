import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleRow {
  module_key: string;
  is_enabled: boolean;
}

export type ModuleState = 'unknown' | 'enabled' | 'disabled';

// ─── Session-scoped cache ─────────────────────────────────────────────────────
// Match `useAiFlag`: one fetch per page-load. If the request fails (rare —
// every authed user can call it), we project to an empty map and every module
// lookup resolves to 'unknown'. Backend `@ModuleEnabled` guards remain the
// authoritative check; this hook only drives UI visibility.

let cachePromise: Promise<Map<string, boolean>> | null = null;

function loadModules(): Promise<Map<string, boolean>> {
  if (!cachePromise) {
    cachePromise = apiClient<{ data: ModuleRow[] }>('/api/v1/auth/me/modules', {
      silent: true,
    })
      .then((res) => {
        const map = new Map<string, boolean>();
        for (const row of res.data ?? []) {
          if (typeof row.module_key === 'string' && typeof row.is_enabled === 'boolean') {
            map.set(row.module_key, row.is_enabled);
          }
        }
        return map;
      })
      .catch(() => new Map<string, boolean>());
  }
  return cachePromise;
}

export function resetModuleEnabledCache(): void {
  cachePromise = null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the enabled/disabled state for a module. Passing `undefined` always
 * returns 'enabled' (no gating requested). Unknown module keys resolve to
 * 'unknown' while the fetch is in flight — treat 'unknown' as optimistic,
 * same contract as `useAiFlag`.
 */
export function useModuleEnabled(moduleKey: string | undefined): ModuleState {
  const [state, setState] = React.useState<ModuleState>(
    moduleKey === undefined ? 'enabled' : 'unknown',
  );

  React.useEffect(() => {
    if (moduleKey === undefined) {
      setState('enabled');
      return;
    }
    let cancelled = false;
    void loadModules().then((map) => {
      if (cancelled) return;
      const value = map.get(moduleKey);
      if (value === undefined) setState('unknown');
      else setState(value ? 'enabled' : 'disabled');
    });
    return () => {
      cancelled = true;
    };
  }, [moduleKey]);

  return state;
}
