// Classification of `scheduling_runs.failure_reason` strings into UX-friendly
// categories. The worker writes failure_reason with a `{CODE}: {message}`
// prefix (see apps/worker/src/processors/scheduling/solver-v2.processor.ts) so
// operators can grep logs. The codes originate in
// packages/shared/src/scheduler/cp-sat-client*.ts (`CpSatSolveError.code`).
//
// This matters because a sidecar transport failure (`CP_SAT_UNREACHABLE`) is
// NOT the same kind of outcome as "solver ran but couldn't place every lesson"
// — the old UI showed "Solver finished with unplaced lessons" for both, which
// misled tenants into editing constraints when the right remediation was
// "retry / contact support".

export type SolverFailureCategory =
  /** Transport-level failure: sidecar unreachable, connection refused, timeout. */
  | 'serviceUnavailable'
  /** Sidecar returned an error but the process is alive (HTTP 5xx with body). */
  | 'solverError'
  /** Snapshot rejected as structurally invalid by the sidecar. */
  | 'modelInvalid'
  /** Worker crashed mid-solve and BullMQ reaped the run. */
  | 'workerCrashed'
  /** Generic failure — no specific category matched. */
  | 'unknown'
  /**
   * Legacy "failed" row from before Stage-10 classification rewrite, where a
   * run with partial placements was still marked failed. Kept distinct so the
   * UI can fall back to the old "unplaced lessons" wording for those.
   */
  | 'legacyPartial';

export function classifySolverFailure(
  failureReason: string | null,
  placed: number,
): SolverFailureCategory {
  const reason = failureReason ?? '';

  if (reason.startsWith('CP_SAT_UNREACHABLE')) return 'serviceUnavailable';
  if (reason.startsWith('MODEL_INVALID')) return 'modelInvalid';
  if (reason.startsWith('CP_SAT_ERROR') || reason.startsWith('INTERNAL_ERROR')) {
    return 'solverError';
  }
  if (reason.includes('Worker crashed mid-solve')) return 'workerCrashed';

  // Pre-Stage-10 runs were marked `failed` even when they produced partial
  // timetables; keep the old "unplaced lessons" copy for those so the user
  // gets the same explanation the diagnostics panel is built for.
  if (placed > 0) return 'legacyPartial';

  return 'unknown';
}
