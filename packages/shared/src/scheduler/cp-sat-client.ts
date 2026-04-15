/**
 * Stage 6 — CP-SAT sidecar HTTP client.
 *
 * The worker (``apps/worker/src/processors/scheduling/solver-v2.processor.ts``)
 * posts a ``SolverInputV2`` to the sidecar at ``POST {baseUrl}/solve`` and
 * awaits a ``SolverOutputV2`` response. This module is the only place that
 * knows about the wire format — every error path funnels through
 * ``CpSatSolveError`` so callers can surface a single structured failure
 * reason on the ``scheduling_runs`` row.
 */
import type { SolverInputV2, SolverOutputV2 } from './types-v2';

export interface CpSatClientOptions {
  /** Base URL of the sidecar, e.g. ``http://localhost:5557``. */
  baseUrl: string;
  /** Total round-trip cap in milliseconds. Fires an ``AbortError`` when exceeded. */
  timeoutMs: number;
  /** Correlation id surfaced to the sidecar as ``X-Request-Id``. */
  requestId?: string;
}

/**
 * Every failure path from the sidecar lands here with a typed code. The worker
 * uses ``code`` as ``scheduling_runs.failure_reason``'s leading token so
 * operators can bucket failures at a glance.
 */
export class CpSatSolveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CpSatSolveError';
  }
}

export async function solveViaCpSat(
  input: SolverInputV2,
  opts: CpSatClientOptions,
): Promise<SolverOutputV2> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${opts.baseUrl}/solve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.requestId ? { 'X-Request-Id': opts.requestId } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch (err) {
      // Transport-level failures: AbortError (timeout) and TypeError (DNS /
      // connection refused / TLS) both surface as CP_SAT_UNREACHABLE so the
      // worker can retry-or-fail without trying to distinguish them.
      const message = err instanceof Error ? err.message : 'Unknown CP-SAT transport error';
      throw new CpSatSolveError('CP_SAT_UNREACHABLE', message, 0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const err = (body as { error?: { code?: string; message?: string } }).error;
      throw new CpSatSolveError(
        err?.code ?? 'CP_SAT_ERROR',
        err?.message ?? `Sidecar returned ${res.status}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as SolverOutputV2;
  } finally {
    clearTimeout(timer);
  }
}
