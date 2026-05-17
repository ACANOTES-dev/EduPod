import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { QUEUE_NAMES, SYNTHETIC_CANARY_JOB } from '../../base/queue.constants';

@Processor(QUEUE_NAMES.SYNTHETIC_CANARY, {
  lockDuration: 30_000,
  stalledInterval: 15_000,
  maxStalledCount: 1,
})
export class SyntheticCanaryProcessor extends WorkerHost {
  async process(job: Job<{ _synthetic?: boolean; canary_id?: string }>) {
    if (job.name !== SYNTHETIC_CANARY_JOB || job.data._synthetic !== true) {
      return { ignored: true };
    }
    return { canary_id: job.data.canary_id, ok: true };
  }
}
