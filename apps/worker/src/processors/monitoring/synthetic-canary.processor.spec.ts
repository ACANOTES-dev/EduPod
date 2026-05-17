import { Job } from 'bullmq';

import { SYNTHETIC_CANARY_JOB } from '../../base/queue.constants';

import { SyntheticCanaryProcessor } from './synthetic-canary.processor';

describe('SyntheticCanaryProcessor', () => {
  it('returns a successful canary response for the dedicated synthetic job', async () => {
    const processor = new SyntheticCanaryProcessor();
    const job = {
      data: { _synthetic: true, canary_id: 'canary-1' },
      name: SYNTHETIC_CANARY_JOB,
    } as Job<{ _synthetic?: boolean; canary_id?: string }>;

    await expect(processor.process(job)).resolves.toEqual({
      canary_id: 'canary-1',
      ok: true,
    });
  });

  it('ignores non-synthetic jobs on the canary queue', async () => {
    const processor = new SyntheticCanaryProcessor();
    const job = {
      data: { canary_id: 'canary-1' },
      name: 'unknown',
    } as Job<{ _synthetic?: boolean; canary_id?: string }>;

    await expect(processor.process(job)).resolves.toEqual({ ignored: true });
  });
});
