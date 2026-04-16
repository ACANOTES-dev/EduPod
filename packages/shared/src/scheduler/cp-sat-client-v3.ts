/**
 * Stage 10 — CP-SAT sidecar HTTP client for the V3 contract.
 *
 * Posts a ``SolverInputV3`` to ``POST {baseUrl}/v3/solve`` and returns a
 * ``SolverOutputV3``. Mirrors the V2 client in ``cp-sat-client.ts`` with
 * identical error handling, undici timeout scaling, and cooperative cancel.
 *
 * Stage 11 switches the worker to this client; until then it's used only
 * by the V3 parity test and the sidecar smoke.
 */
import { Agent } from 'undici';

import type { CpSatClientOptions } from './cp-sat-client';
import { CpSatSolveError } from './cp-sat-client';
import type { SolverInputV3, SolverOutputV3 } from './types-v3';

export async function solveViaCpSatV3(
  input: SolverInputV3,
  opts: CpSatClientOptions,
): Promise<SolverOutputV3> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const dispatcher = new Agent({
    headersTimeout: opts.timeoutMs,
    bodyTimeout: opts.timeoutMs,
    connectTimeout: 30_000,
  });
  try {
    let res: Response;
    try {
      res = await fetch(`${opts.baseUrl}/v3/solve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.requestId ? { 'X-Request-Id': opts.requestId } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        dispatcher,
      } as Parameters<typeof fetch>[1] & { dispatcher: Agent });
    } catch (err) {
      if (opts.requestId) {
        void cancelSolveV3(opts.baseUrl, opts.requestId);
      }
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
    return (await res.json()) as SolverOutputV3;
  } finally {
    clearTimeout(timer);
    await dispatcher.close().catch(() => {
      /* dispatcher already closed — non-fatal */
    });
  }
}

async function cancelSolveV3(baseUrl: string, requestId: string): Promise<void> {
  const cancelController = new AbortController();
  const cancelTimer = setTimeout(() => cancelController.abort(), 5_000);
  try {
    await fetch(`${baseUrl}/solve/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
      signal: cancelController.signal,
    });
  } catch (err) {
    console.warn('[cp-sat-client-v3.cancelSolveV3] best-effort DELETE failed', err);
  } finally {
    clearTimeout(cancelTimer);
  }
}
