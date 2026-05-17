import { EvidenceFreshnessScheduledTask } from './evidence-freshness-scheduled.task';

describe('EvidenceFreshnessScheduledTask', () => {
  it('runs the evidence freshness check on each tick', async () => {
    const freshness = {
      checkAll: jest.fn().mockResolvedValue(undefined),
      emitMetaFailure: jest.fn(),
    };
    const task = new EvidenceFreshnessScheduledTask(freshness as never);

    await task.tick();

    expect(freshness.checkAll).toHaveBeenCalledTimes(1);
    expect(freshness.emitMetaFailure).not.toHaveBeenCalled();
  });

  it('emits a meta failure if the scheduled check fails', async () => {
    const err = new Error('database unavailable');
    const freshness = {
      checkAll: jest.fn().mockRejectedValue(err),
      emitMetaFailure: jest.fn().mockResolvedValue(undefined),
    };
    const task = new EvidenceFreshnessScheduledTask(freshness as never);

    await task.tick();

    expect(freshness.emitMetaFailure).toHaveBeenCalledWith(err);
  });
});
