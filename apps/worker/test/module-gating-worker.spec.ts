import type { ModuleKey } from '@school/shared/modules';

type WorkerGatingCase = {
  key: ModuleKey;
  processorName: string;
};

const WORKER_GATING_CASES: WorkerGatingCase[] = [
  { key: 'pastoral', processorName: 'PastoralCronDispatchProcessor' },
  { key: 'behaviour', processorName: 'BehaviourCronDispatchProcessor' },
  { key: 'early_warning', processorName: 'EarlyWarningComputeDailyProcessor' },
];

describe('Worker module gating contract', () => {
  it.skip.each(WORKER_GATING_CASES)(
    'skips disabled-tenant fan-out for $key in $processorName',
    async () => {
      // Per-module specs un-skip their processor case and assert that a tenant
      // with the module disabled produces zero downstream jobs while an enabled
      // tenant still fans out normally.
    },
  );
});
