'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SolverRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'applied'
  | 'discarded';

export type SolverRunPhase = 'preparing' | 'solving' | 'complete' | 'failed';

interface ProgressResponse {
  id: string;
  status: SolverRunStatus;
  phase: SolverRunPhase;
  entries_assigned: number;
  entries_placed: number;
  entries_unassigned: number;
  entries_total: number;
  elapsed_ms: number;
  failure_reason: string | null;
  updated_at: string;
}

interface Snapshot {
  runId: string;
  startedAt: number;
  status: SolverRunStatus | 'unknown';
  phase: SolverRunPhase | null;
  placed: number;
  unassigned: number;
  total: number;
  elapsedMs: number;
  failureReason: string | null;
}

interface SolverProgressContextValue {
  snapshot: Snapshot | null;
  startTracking: (runId: string) => void;
  dismiss: () => void;
  cancel: () => Promise<void>;
  /**
   * Cooperative halt — tells the solver to stop polishing and return its
   * current best solution. Unlike cancel(), the partial result is saved as
   * a completed run.
   */
  stopAndAccept: () => Promise<void>;
  isTerminal: boolean;
}

const SESSION_KEY = 'scheduling:active-run';
const POLL_INTERVAL_MS = 3000;

const SolverProgressContext = React.createContext<SolverProgressContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readPersisted(): { runId: string; startedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { runId?: unknown; startedAt?: unknown };
    if (typeof parsed.runId !== 'string') return null;
    const startedAt = typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now();
    return { runId: parsed.runId, startedAt };
  } catch {
    return null;
  }
}

function writePersisted(runId: string, startedAt: number): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ runId, startedAt }));
  } catch (err) {
    console.error('[SolverProgressProvider]', err);
  }
}

function clearPersisted(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('[SolverProgressProvider]', err);
  }
}

function isTerminalStatus(status: SolverRunStatus | 'unknown'): boolean {
  return (
    status === 'completed' || status === 'failed' || status === 'applied' || status === 'discarded'
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SolverProgressProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = React.useRef<Snapshot | null>(null);

  // Keep ref in sync so the polling effect can read the current value without
  // retriggering itself on every tick.
  React.useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = React.useCallback(async (runId: string, startedAt: number) => {
    try {
      const res = await apiClient<{ data: ProgressResponse }>(
        `/api/v1/scheduling-runs/${runId}/progress`,
      );
      const p = res.data;
      setSnapshot({
        runId: p.id,
        startedAt,
        status: p.status,
        phase: p.phase,
        placed: p.entries_placed,
        unassigned: p.entries_unassigned,
        total: p.entries_total,
        elapsedMs: p.elapsed_ms,
        failureReason: p.failure_reason,
      });
      if (isTerminalStatus(p.status)) {
        // The run is terminal — stop polling but keep the snapshot so the
        // widget can show a result state until the user dismisses it.
        return true;
      }
    } catch (err) {
      console.error('[SolverProgressProvider.poll]', err);
      // On persistent fetch errors, surface as failed so the widget is not
      // silently stuck on a stale state.
      const prior = snapshotRef.current;
      if (prior && !isTerminalStatus(prior.status)) {
        setSnapshot({
          ...prior,
          status: 'failed',
          phase: 'failed',
          failureReason: prior.failureReason ?? 'Lost connection to the solver',
        });
      }
      return true;
    }
    return false;
  }, []);

  const startPolling = React.useCallback(
    (runId: string, startedAt: number) => {
      stopPolling();
      // Fire the first poll immediately so the widget never shows an empty
      // "Solving…" card — it's populated on first render.
      void pollOnce(runId, startedAt);
      pollRef.current = setInterval(async () => {
        const done = await pollOnce(runId, startedAt);
        if (done) stopPolling();
      }, POLL_INTERVAL_MS);
    },
    [pollOnce, stopPolling],
  );

  const startTracking = React.useCallback(
    (runId: string) => {
      const startedAt = Date.now();
      writePersisted(runId, startedAt);
      setSnapshot({
        runId,
        startedAt,
        status: 'unknown',
        phase: null,
        placed: 0,
        unassigned: 0,
        total: 0,
        elapsedMs: 0,
        failureReason: null,
      });
      startPolling(runId, startedAt);
    },
    [startPolling],
  );

  const dismiss = React.useCallback(() => {
    stopPolling();
    clearPersisted();
    setSnapshot(null);
  }, [stopPolling]);

  const cancel = React.useCallback(async () => {
    const current = snapshotRef.current;
    if (!current) return;
    try {
      await apiClient(`/api/v1/scheduling-runs/${current.runId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('[SolverProgressProvider.cancel]', err);
    }
    // Force a last poll so the UI reflects the cancelled status; it will
    // then show terminal state and the user can dismiss.
    await pollOnce(current.runId, current.startedAt);
    stopPolling();
  }, [pollOnce, stopPolling]);

  const stopAndAccept = React.useCallback(async () => {
    const current = snapshotRef.current;
    if (!current) return;
    try {
      await apiClient(`/api/v1/scheduling-runs/${current.runId}/stop-and-accept`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('[SolverProgressProvider.stopAndAccept]', err);
    }
    // Do NOT stop polling — the worker may take a few seconds to commit the
    // partial results, and we want the widget to show the transition from
    // running → completed as soon as the row updates.
  }, []);

  // Resume tracking on mount if sessionStorage has a live run id.
  React.useEffect(() => {
    const persisted = readPersisted();
    if (persisted) {
      setSnapshot({
        runId: persisted.runId,
        startedAt: persisted.startedAt,
        status: 'unknown',
        phase: null,
        placed: 0,
        unassigned: 0,
        total: 0,
        elapsedMs: 0,
        failureReason: null,
      });
      startPolling(persisted.runId, persisted.startedAt);
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Drop the sessionStorage entry once the run is terminal so a later tab-
  // open doesn't pick up an already-finished run. The UI keeps its in-memory
  // snapshot so the user can still click through to the review page.
  React.useEffect(() => {
    if (snapshot && isTerminalStatus(snapshot.status)) {
      clearPersisted();
    }
  }, [snapshot]);

  const value = React.useMemo<SolverProgressContextValue>(
    () => ({
      snapshot,
      startTracking,
      dismiss,
      cancel,
      stopAndAccept,
      isTerminal: snapshot ? isTerminalStatus(snapshot.status) : false,
    }),
    [snapshot, startTracking, dismiss, cancel, stopAndAccept],
  );

  return <SolverProgressContext.Provider value={value}>{children}</SolverProgressContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSolverProgress(): SolverProgressContextValue {
  const ctx = React.useContext(SolverProgressContext);
  if (!ctx) {
    throw new Error('useSolverProgress must be used within <SolverProgressProvider>');
  }
  return ctx;
}
