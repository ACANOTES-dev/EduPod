/**
 * HTTP client for the exam-solver endpoint on the OR-Tools CP-SAT sidecar.
 *
 * POSTs an ``ExamSolverInput`` to ``{baseUrl}/exam/solve`` and returns an
 * ``ExamSolverOutput``. Mirrors the shape of ``cp-sat-client-v3.solveViaCpSatV3``
 * but targets the exam solver rather than the timetable solver.
 */
import { Agent } from 'undici';

import type { ExamSolverInput, ExamSolverOutput } from '../schemas/exam-scheduling.schema';

import { CpSatSolveError } from './cp-sat-client';

export interface ExamCpSatClientOptions {
  baseUrl: string;
  timeoutMs: number;
  requestId?: string;
}

export async function solveExamViaCpSat(
  input: ExamSolverInput,
  opts: ExamCpSatClientOptions,
): Promise<ExamSolverOutput> {
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
      res = await fetch(`${opts.baseUrl}/exam/solve`, {
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
      const message = err instanceof Error ? err.message : 'Unknown CP-SAT transport error';
      throw new CpSatSolveError('CP_SAT_UNREACHABLE', message, 0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const err = (body as { error?: { code?: string; message?: string } }).error;
      throw new CpSatSolveError(
        err?.code ?? 'EXAM_SOLVER_ERROR',
        err?.message ?? `Exam solver sidecar returned ${res.status}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as ExamSolverOutput;
  } finally {
    clearTimeout(timer);
    await dispatcher.close().catch(() => {
      /* dispatcher already closed — non-fatal */
    });
  }
}
