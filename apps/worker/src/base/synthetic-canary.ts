import type { Job } from 'bullmq';

import { SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB, SYNTHETIC_TENANT_SENTINEL } from './queue.constants';

export interface SyntheticCanaryPayload {
  _synthetic?: boolean;
  canary_id?: string;
  tenant_id?: string;
}

export function isSyntheticCriticalQueueCanary(job: Job): job is Job<SyntheticCanaryPayload> {
  const data = job.data as SyntheticCanaryPayload;
  return (
    job.name === SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB &&
    data?._synthetic === true &&
    data.tenant_id === SYNTHETIC_TENANT_SENTINEL &&
    typeof data.canary_id === 'string'
  );
}

export function syntheticCanaryResult(job: Job<SyntheticCanaryPayload>) {
  return { canary_id: job.data.canary_id, ok: true };
}
