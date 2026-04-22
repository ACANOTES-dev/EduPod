import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

import { SEARCH_INDEX_ENTITY_JOB, SearchIndexProcessor } from './search-index.processor';
import { SEARCH_FULL_REINDEX_JOB, SearchReindexProcessor } from './search-reindex.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for the search-sync queue — BullMQ creates exactly ONE
// Worker bound to this class, so jobs cannot be silently consumed by a
// sibling processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.SEARCH_SYNC, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SearchSyncQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(SearchSyncQueueDispatcher.name);

  constructor(
    private readonly searchIndex: SearchIndexProcessor,
    private readonly searchReindex: SearchReindexProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case SEARCH_INDEX_ENTITY_JOB:
        await this.searchIndex.process(job);
        return;
      case SEARCH_FULL_REINDEX_JOB:
        await this.searchReindex.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown search-sync job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
