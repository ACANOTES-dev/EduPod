import { Job } from 'bullmq';

import { SEARCH_INDEX_ENTITY_JOB, SearchIndexProcessor } from './search-index.processor';
import { SEARCH_FULL_REINDEX_JOB, SearchReindexProcessor } from './search-reindex.processor';
import { SearchSyncQueueDispatcher } from './search-sync-queue.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('SearchSyncQueueDispatcher', () => {
  function buildDispatcher() {
    const searchIndex = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SearchIndexProcessor;
    const searchReindex = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SearchReindexProcessor;

    const dispatcher = new SearchSyncQueueDispatcher(searchIndex, searchReindex);

    return {
      dispatcher,
      searchIndex,
      searchReindex,
    };
  }

  it.each([
    [SEARCH_INDEX_ENTITY_JOB, 'searchIndex'],
    [SEARCH_FULL_REINDEX_JOB, 'searchReindex'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = ['searchIndex', 'searchReindex'] as const;
    for (const key of targets) {
      const expected = key === targetKey ? 1 : 0;
      expect(harness[key].process).toHaveBeenCalledTimes(expected);
    }
  });

  it('completes unknown job names silently — canary pings depend on this', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-unknown', name: 'monitoring:canary-ping', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });

  it('completes non-canary unknown jobs silently (logs warning)', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-weird', name: 'something:totally-unknown', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });
});
