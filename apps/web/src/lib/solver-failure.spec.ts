import { classifySolverFailure } from './solver-failure';

describe('classifySolverFailure', () => {
  it('maps CP_SAT_UNREACHABLE prefix to serviceUnavailable', () => {
    expect(classifySolverFailure('CP_SAT_UNREACHABLE: fetch failed', 0)).toBe('serviceUnavailable');
  });

  it('maps MODEL_INVALID prefix to modelInvalid', () => {
    expect(classifySolverFailure('MODEL_INVALID: missing field x', 0)).toBe('modelInvalid');
  });

  it('maps CP_SAT_ERROR to solverError', () => {
    expect(classifySolverFailure('CP_SAT_ERROR: HTTP 500', 0)).toBe('solverError');
  });

  it('maps INTERNAL_ERROR to solverError', () => {
    expect(classifySolverFailure('INTERNAL_ERROR: something broke', 0)).toBe('solverError');
  });

  it('maps SCHED-029 worker reaping to workerCrashed', () => {
    expect(
      classifySolverFailure(
        'Worker crashed mid-solve — BullMQ retry reaped the run (SCHED-029)',
        0,
      ),
    ).toBe('workerCrashed');
  });

  it('falls back to legacyPartial for unclassified reasons with placements', () => {
    expect(classifySolverFailure('some old message', 42)).toBe('legacyPartial');
  });

  it('falls back to unknown for unclassified reasons with no placements', () => {
    expect(classifySolverFailure('some old message', 0)).toBe('unknown');
  });

  it('treats null as unknown when no placements', () => {
    expect(classifySolverFailure(null, 0)).toBe('unknown');
  });

  it('routes on prefix even if message is long', () => {
    const longReason = 'CP_SAT_UNREACHABLE: ' + 'x'.repeat(2000);
    expect(classifySolverFailure(longReason, 0)).toBe('serviceUnavailable');
  });
});
