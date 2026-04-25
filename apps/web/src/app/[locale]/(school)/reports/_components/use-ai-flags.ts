'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { AiFlagState } from './use-ai-flag';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiFlagRow {
  module_key: string;
  enabled: boolean;
}

/**
 * The three reports module AI flags impl 10 / 11 / 12 introduced. Kept as a
 * literal tuple so consumers can iterate / type-narrow without re-importing
 * the shared schema.
 */
export const REPORTS_AI_FLAG_KEYS = [
  'reports_narration',
  'reports_ask_ai',
  'reports_predictions',
] as const;
export type ReportsAiFlagKey = (typeof REPORTS_AI_FLAG_KEYS)[number];

export type ReportsAiFlagsState = Record<ReportsAiFlagKey, AiFlagState>;

// ─── Module-level cache ───────────────────────────────────────────────────────
//
// `useAiFlag` (singular) refetches every mount because each panel uses it
// independently. `useAiFlags` (plural) is invoked on a page that may host
// multiple AI panels — fetching once per session and sharing the result
// across those panels keeps the number of `/v1/ai-flags` requests at one
// per session even when the dashboard renders narration + predictions
// panels alongside Ask-AI affordances.

interface CachedFlags {
  fetchedAt: number;
  state: ReportsAiFlagsState;
}

let cache: CachedFlags | null = null;
let inflight: Promise<ReportsAiFlagsState> | null = null;
const subscribers = new Set<(state: ReportsAiFlagsState) => void>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches the dashboard's KPI cache TTL.

const ALL_LOADING: ReportsAiFlagsState = {
  reports_narration: 'loading',
  reports_ask_ai: 'loading',
  reports_predictions: 'loading',
};

function broadcast(state: ReportsAiFlagsState): void {
  for (const subscriber of subscribers) {
    subscriber(state);
  }
}

async function fetchAiFlags(): Promise<ReportsAiFlagsState> {
  try {
    const raw = await apiClient<{ data: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', {
      silent: true,
    });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const next: ReportsAiFlagsState = { ...ALL_LOADING };
    for (const key of REPORTS_AI_FLAG_KEYS) {
      const row = rows.find((r) => r.module_key === key);
      next[key] = row ? (row.enabled ? 'enabled' : 'disabled') : 'unknown';
    }
    cache = { fetchedAt: Date.now(), state: next };
    broadcast(next);
    return next;
  } catch (err) {
    console.error('[useAiFlags]', err);
    const next: ReportsAiFlagsState = {
      reports_narration: 'unknown',
      reports_ask_ai: 'unknown',
      reports_predictions: 'unknown',
    };
    cache = { fetchedAt: Date.now(), state: next };
    broadcast(next);
    return next;
  }
}

function ensureFetch(force: boolean): Promise<ReportsAiFlagsState> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cache.state);
  }
  if (!inflight) {
    inflight = fetchAiFlags().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Resolves all three reports module AI flags (`reports_narration`,
 * `reports_ask_ai`, `reports_predictions`) in one shared request. Cached
 * for 5 minutes per session and revalidated on window focus, so a page
 * that hosts multiple AI panels (narration + prediction + ask-AI) does
 * not trigger N parallel `/v1/ai-flags` calls.
 *
 * Each individual flag follows the same `AiFlagState` machine as the
 * singular `useAiFlag`:
 * - `loading` while the request is in flight
 * - `enabled` when the row exists with `enabled = true`
 * - `disabled` when the row exists with `enabled = false`
 * - `unknown` when the row is missing or the request errored
 */
export function useAiFlags(): ReportsAiFlagsState {
  const [state, setState] = React.useState<ReportsAiFlagsState>(() => cache?.state ?? ALL_LOADING);

  React.useEffect(() => {
    let cancelled = false;
    subscribers.add(setState);

    void ensureFetch(false).then((next) => {
      if (!cancelled) setState(next);
    });

    const handleFocus = () => {
      if (!cache || Date.now() - cache.fetchedAt >= CACHE_TTL_MS) {
        void ensureFetch(true);
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      subscribers.delete(setState);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return state;
}

/**
 * Test-only escape hatch. Exported so jest specs can reset the module-
 * level cache between tests; not meant for production callers.
 */
export function __resetAiFlagsCacheForTests(): void {
  cache = null;
  inflight = null;
  subscribers.clear();
}
