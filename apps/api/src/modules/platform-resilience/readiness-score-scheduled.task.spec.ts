import { ReadinessScoreScheduledTask } from './readiness-score-scheduled.task';
import type { ReadinessScoreResult } from './readiness-score.service';

const SCORE_RESULT: ReadinessScoreResult = {
  breakdown: [],
  computed_at: '2026-05-18T12:00:00.000Z',
  reasons: [],
  score: 88,
  weights_sum: 100,
  worst_dimension: null,
  worst_dimension_value: null,
};

function buildTask() {
  const readiness = {
    compute: jest.fn().mockResolvedValue(SCORE_RESULT),
    snapshot: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
  };
  const alerts = {
    evaluate: jest.fn().mockResolvedValue(undefined),
    recordDailySnapshotFailure: jest.fn().mockResolvedValue(undefined),
    recordLiveFailure: jest.fn().mockResolvedValue(undefined),
  };
  return {
    alerts,
    readiness,
    task: new ReadinessScoreScheduledTask(readiness as never, alerts as never),
  };
}

describe('ReadinessScoreScheduledTask', () => {
  it('runs live evaluation through in-memory compute and never writes a snapshot', async () => {
    const { alerts, readiness, task } = buildTask();

    await task.liveEvaluate();

    expect(readiness.compute).toHaveBeenCalledTimes(1);
    expect(alerts.evaluate).toHaveBeenCalledWith(SCORE_RESULT);
    expect(readiness.snapshot).not.toHaveBeenCalled();
  });

  it('writes daily snapshots without evaluating threshold alerts', async () => {
    const { alerts, readiness, task } = buildTask();

    await task.dailySnapshot();

    expect(readiness.snapshot).toHaveBeenCalledTimes(1);
    expect(readiness.compute).not.toHaveBeenCalled();
    expect(alerts.evaluate).not.toHaveBeenCalled();
  });

  it('records cron failures without throwing out of the scheduler', async () => {
    const { alerts, readiness, task } = buildTask();
    readiness.compute.mockRejectedValueOnce(new Error('live failed'));
    readiness.snapshot.mockRejectedValueOnce(new Error('snapshot failed'));

    await expect(task.liveEvaluate()).resolves.toBeUndefined();
    await expect(task.dailySnapshot()).resolves.toBeUndefined();

    expect(alerts.recordLiveFailure).toHaveBeenCalledWith(expect.any(Error));
    expect(alerts.recordDailySnapshotFailure).toHaveBeenCalledWith(expect.any(Error));
  });
});
