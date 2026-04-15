/**
 * Stage 6 — CP-SAT sidecar HTTP client.
 *
 * The worker (``apps/worker/src/processors/scheduling/solver-v2.processor.ts``)
 * posts a ``SolverInputV2`` to the sidecar at ``POST {baseUrl}/solve`` and
 * awaits a ``SolverOutputV2`` response. This module is the only place that
 * knows about the wire format — every error path funnels through
 * ``CpSatSolveError`` so callers can surface a single structured failure
 * reason on the ``scheduling_runs`` row.
 *
 * Stage 9.5.1 §D follow-up: Node's undici fetch defaults
 * ``headersTimeout`` and ``bodyTimeout`` to 5 minutes each. The sidecar
 * blocks on ``solver.solve()`` for up to ``max_solver_duration_seconds``,
 * so any tenant budget > 240 s caused the worker to abort with
 * ``CP_SAT_UNREACHABLE: fetch failed`` even though the AbortController
 * timeout was set higher. We pass an explicit undici Agent that scales
 * its timeouts with the caller's ``timeoutMs`` so the 3600 s ceiling is
 * actually reachable end-to-end.
 */
import { Agent } from 'undici';

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
  // Scale undici's per-request timeouts with the caller's ``timeoutMs``.
  // Defaults are 5 min each; without this any solve > 240 s aborts before
  // the AbortController's higher ceiling fires (Stage 9.5.1 NHQS smoke
  // surfaced this — sidecar took 601 s, worker errored at 5 min).
  const dispatcher = new Agent({
    headersTimeout: opts.timeoutMs,
    bodyTimeout: opts.timeoutMs,
    connectTimeout: 30_000,
  });
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
        // Cast: Node's web-spec fetch types don't expose the Node-only
        // ``dispatcher`` field, but undici picks it up at runtime. This
        // is the documented Node-fetch escape hatch for per-request
        // dispatcher overrides.
        dispatcher,
      } as Parameters<typeof fetch>[1] & { dispatcher: Agent });
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
    await dispatcher.close().catch(() => {
      /* dispatcher already closed — non-fatal */
    });
  }
}
