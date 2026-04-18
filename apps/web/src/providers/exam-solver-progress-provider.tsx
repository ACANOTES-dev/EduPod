'use client';

import * as React from 'react';

import { apiClient, refreshAuthToken } from '@/lib/api-client';

// Mirrors SolverProgressProvider for exam-session solves. Kept as a separate
// provider so the two widgets can coexist (a tenant could theoretically solve
// a timetable and an exam schedule at the same time) and so polling paths and
// session keys don't collide.

export type ExamSolveStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ProgressResponse {
  id: string;
  status: ExamSolveStatus;
  placed: number;
  total: number;
  slots_written: number;
  solve_time_ms: number;
  elapsed_ms: number;
  failure_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface Snapshot {
  jobId: string;
  sessionId: string;
  startedAt: number;
  status: ExamSolveStatus | 'unknown';
  placed: number;
  total: number;
  elapsedMs: number;
  failureReason: string | null;
}

interface ContextValue {
  snapshot: Snapshot | null;
  startTracking: (jobId: string, sessionId: string) => void;
  dismiss: () => void;
  cancel: () => Promise<void>;
  isTerminal: boolean;
}

const SESSION_KEY = 'scheduling:active-exam-solve';
const POLL_INTERVAL_MS = 3000;

const ExamSolverProgressContext = React.createContext<ContextValue | null>(null);

function readPersisted(): { jobId: string; sessionId: string; startedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      jobId?: unknown;
      sessionId?: unknown;
      startedAt?: unknown;
    };
    if (typeof parsed.jobId !== 'string' || typeof parsed.sessionId !== 'string') return null;
    const startedAt = typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now();
    return { jobId: parsed.jobId, sessionId: parsed.sessionId, startedAt };
  } catch {
    return null;
  }
}

function writePersisted(jobId: string, sessionId: string, startedAt: number): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ jobId, sessionId, startedAt }));
  } catch (err) {
    console.error('[ExamSolverProgressProvider]', err);
  }
}

function clearPersisted(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('[ExamSolverProgressProvider]', err);
  }
}

function isTerminal(status: ExamSolveStatus | 'unknown'): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function ExamSolverProgressProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = React.useRef<Snapshot | null>(null);

  React.useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (refreshRef.current) {
      clearInterval(refreshRef.current);
      refreshRef.current = null;
    }
  }, []);

  const pollOnce = React.useCallback(
    async (jobId: string, sessionId: string, startedAt: number): Promise<boolean> => {
      try {
        const res = await apiClient<{ data: ProgressResponse } | ProgressResponse>(
          `/api/v1/scheduling/exam-sessions/${sessionId}/solve-jobs/${jobId}/progress`,
        );
        const inner =
          res && typeof res === 'object' && 'data' in (res as object)
            ? ((res as { data: ProgressResponse }).data ?? (res as ProgressResponse))
            : (res as ProgressResponse);
        setSnapshot({
          jobId: inner.id,
          sessionId,
          startedAt,
          status: inner.status,
          placed: inner.placed,
          total: inner.total,
          elapsedMs: inner.elapsed_ms,
          failureReason: inner.failure_reason,
        });
        if (isTerminal(inner.status)) return true;
      } catch (err) {
        console.error('[ExamSolverProgressProvider.poll]', err);
        const prior = snapshotRef.current;
        if (prior && !isTerminal(prior.status)) {
          setSnapshot({
            ...prior,
            status: 'failed',
            failureReason: prior.failureReason ?? 'Lost connection to the exam solver',
          });
        }
        return true;
      }
      return false;
    },
    [],
  );

  const startPolling = React.useCallback(
    (jobId: string, sessionId: string, startedAt: number) => {
      stopPolling();
      void pollOnce(jobId, sessionId, startedAt);
      pollRef.current = setInterval(async () => {
        const done = await pollOnce(jobId, sessionId, startedAt);
        if (done) stopPolling();
      }, POLL_INTERVAL_MS);
      // JWT keepalive — exam solve can take up to 7.5 min with a 450s budget.
      refreshRef.current = setInterval(() => {
        void refreshAuthToken();
      }, 600_000);
    },
    [pollOnce, stopPolling],
  );

  const startTracking = React.useCallback(
    (jobId: string, sessionId: string) => {
      const startedAt = Date.now();
      writePersisted(jobId, sessionId, startedAt);
      setSnapshot({
        jobId,
        sessionId,
        startedAt,
        status: 'unknown',
        placed: 0,
        total: 0,
        elapsedMs: 0,
        failureReason: null,
      });
      startPolling(jobId, sessionId, startedAt);
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
      await apiClient(
        `/api/v1/scheduling/exam-sessions/${current.sessionId}/solve-jobs/${current.jobId}/cancel`,
        { method: 'POST' },
      );
    } catch (err) {
      console.error('[ExamSolverProgressProvider.cancel]', err);
    }
    await pollOnce(current.jobId, current.sessionId, current.startedAt);
    stopPolling();
  }, [pollOnce, stopPolling]);

  // Resume on mount if sessionStorage has a live job id.
  React.useEffect(() => {
    const persisted = readPersisted();
    if (persisted) {
      setSnapshot({
        jobId: persisted.jobId,
        sessionId: persisted.sessionId,
        startedAt: persisted.startedAt,
        status: 'unknown',
        placed: 0,
        total: 0,
        elapsedMs: 0,
        failureReason: null,
      });
      startPolling(persisted.jobId, persisted.sessionId, persisted.startedAt);
    }
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Once terminal, drop sessionStorage so next tab-open doesn't resume.
  React.useEffect(() => {
    if (snapshot && isTerminal(snapshot.status)) {
      clearPersisted();
    }
  }, [snapshot]);

  const value = React.useMemo<ContextValue>(
    () => ({
      snapshot,
      startTracking,
      dismiss,
      cancel,
      isTerminal: snapshot ? isTerminal(snapshot.status) : false,
    }),
    [snapshot, startTracking, dismiss, cancel],
  );

  return (
    <ExamSolverProgressContext.Provider value={value}>
      {children}
    </ExamSolverProgressContext.Provider>
  );
}

export function useExamSolverProgress(): ContextValue {
  const ctx = React.useContext(ExamSolverProgressContext);
  if (!ctx) {
    throw new Error('useExamSolverProgress must be used within <ExamSolverProgressProvider>');
  }
  return ctx;
}
