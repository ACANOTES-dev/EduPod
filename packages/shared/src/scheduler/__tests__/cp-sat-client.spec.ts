/**
 * Stage 6 — unit tests for ``solveViaCpSat``.
 *
 * Covers every failure-surface path since the worker maps ``CpSatSolveError``
 * codes directly into ``scheduling_runs.failure_reason``. The sidecar itself
 * is exercised by the Stage 5 parity harness; these tests mock ``fetch``.
 */
import { CpSatSolveError, solveViaCpSat } from '../cp-sat-client';
import type { SolverInputV2, SolverOutputV2 } from '../types-v2';

const BASE_URL = 'http://localhost:5557';

function minimalInput(): SolverInputV2 {
  return {
    year_groups: [],
    curriculum: [],
    teachers: [],
    rooms: [],
    room_closures: [],
    break_groups: [],
    pinned_entries: [],
    student_overlaps: [],
    settings: {
      solver_seed: 0,
      max_solver_duration_seconds: 30,
    } as SolverInputV2['settings'],
  } as SolverInputV2;
}

function okOutput(): SolverOutputV2 {
  return {
    entries: [],
    unassigned: [],
    score: 0,
    max_score: 0,
    duration_ms: 42,
    constraint_summary: { tier1_violations: 0, tier2_violations: 0, tier3_violations: 0 },
    cp_sat_status: 'optimal',
  };
}

describe('solveViaCpSat', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs the input to {baseUrl}/solve and returns the parsed body', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(okOutput()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const input = minimalInput();
    const out = await solveViaCpSat(input, {
      baseUrl: BASE_URL,
      timeoutMs: 1000,
      requestId: 'run-abc',
    });
    expect(out.cp_sat_status).toBe('optimal');
    expect(out.duration_ms).toBe(42);
    expect(spy).toHaveBeenCalledWith(
      `${BASE_URL}/solve`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Request-Id': 'run-abc',
        }),
        body: JSON.stringify(input),
      }),
    );
  });

  it('omits X-Request-Id when not provided', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(okOutput()), { status: 200 }));
    await solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 1000 });
    const headers = (spy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Request-Id']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('maps HTTP 500 with structured error body into a CpSatSolveError', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'model build failed' } }),
          { status: 500 },
        ),
      );
    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 1000 }),
    ).rejects.toMatchObject({
      name: 'CpSatSolveError',
      code: 'INTERNAL_ERROR',
      message: 'model build failed',
      status: 500,
    });
  });

  it('maps HTTP 422 (pydantic validation) into a CpSatSolveError', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: [{ loc: ['settings'], msg: 'field required' }] }), {
        status: 422,
      }),
    );
    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 1000 }),
    ).rejects.toMatchObject({
      code: 'CP_SAT_ERROR',
      status: 422,
    });
  });

  it('handles HTTP error with an unparseable body (falls through to generic code)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 503 }));
    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 1000 }),
    ).rejects.toMatchObject({
      code: 'CP_SAT_ERROR',
      message: 'Sidecar returned 503',
      status: 503,
    });
  });

  it('surfaces connection-refused as CP_SAT_UNREACHABLE', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: 'ECONNREFUSED' }));
    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 1000 }),
    ).rejects.toMatchObject({
      code: 'CP_SAT_UNREACHABLE',
      status: 0,
    });
  });

  it('surfaces timeout (AbortError) as CP_SAT_UNREACHABLE', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const t0 = Date.now();
    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: 'CP_SAT_UNREACHABLE',
    });
    // Abort fired within the expected budget.
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('does not swallow a thrown CpSatSolveError inside finally', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'BAD', message: 'bad' } }), { status: 400 }),
      );
    const err = await solveViaCpSat(minimalInput(), {
      baseUrl: BASE_URL,
      timeoutMs: 1000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(CpSatSolveError);
  });

  // Stage 9.5.1 post-close amendment — fire-and-forget DELETE on abort.
  it('fires DELETE /solve/{requestId} when AbortError is raised, before rethrowing', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      calls.push({ url, method });
      if (method === 'POST') {
        // The POST /solve resolves only when the caller's AbortController fires.
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }
      // The DELETE /solve/{id} resolves immediately; the sidecar returns 200 /
      // `{cancelled: true}` but the client ignores the body.
      return Promise.resolve(
        new Response(JSON.stringify({ cancelled: true, request_id: 'run-xyz' }), {
          status: 200,
        }),
      );
    });

    await expect(
      solveViaCpSat(minimalInput(), {
        baseUrl: BASE_URL,
        timeoutMs: 20,
        requestId: 'run-xyz',
      }),
    ).rejects.toMatchObject({
      code: 'CP_SAT_UNREACHABLE',
    });

    // Let the fire-and-forget DELETE microtask settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const deleteCall = calls.find((c) => c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toBe(`${BASE_URL}/solve/run-xyz`);
  });

  it('does NOT fire DELETE when AbortError fires without a requestId', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      calls.push({ url, method });
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    await expect(
      solveViaCpSat(minimalInput(), { baseUrl: BASE_URL, timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'CP_SAT_UNREACHABLE' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // POST was the only call — DELETE was skipped because requestId was absent.
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});
