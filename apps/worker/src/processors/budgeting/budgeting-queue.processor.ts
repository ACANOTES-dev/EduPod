import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { TenantModuleService } from '../../../../api/src/common/services/tenant-module.service';
import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  BUDGETING_BOARD_PACK_RENDER_JOB,
  BoardPackRenderProcessor,
} from './board-pack-render.processor';
import {
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  ShareableLinkCleanupProcessor,
} from './shareable-link-cleanup.processor';
import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
  BUDGETING_VARIANCE_REFRESH_JOB,
  VarianceRefreshProcessor,
} from './variance-refresh.processor';

/**
 * Single `@Processor` for the `budgeting` queue. BullMQ creates one Worker
 * bound to this class; jobs cannot be silently consumed by a sibling
 * processor whose job-name guard misses (DZ-48).
 *
 * Phase 08 wires `budgeting:variance-refresh` and the bootstrap job.
 * Phase 09 wires `budgeting:board-pack-render`.
 * Phase 11 wires `budgeting:shareable-link-cleanup`.
 */
@Processor(QUEUE_NAMES.BUDGETING, {
  // 10 minutes — long enough for PDF/Excel renders in Phase 09; the
  // variance refresh itself runs in well under a minute.
  lockDuration: 600_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class BudgetingQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(BudgetingQueueDispatcher.name);

  constructor(
    private readonly varianceRefresh: VarianceRefreshProcessor,
    private readonly boardPackRender: BoardPackRenderProcessor,
    private readonly shareableLinkCleanup: ShareableLinkCleanupProcessor,
    private readonly tenantModuleService: TenantModuleService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case BUDGETING_VARIANCE_REFRESH_JOB:
        if (await this.shouldSkipTenantJob(job)) return;
        await this.varianceRefresh.process(job);
        return;
      case BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB:
        await this.varianceRefresh.process(job);
        return;
      case BUDGETING_BOARD_PACK_RENDER_JOB:
        if (await this.shouldSkipTenantJob(job)) return;
        await this.boardPackRender.process(job);
        return;
      case BUDGETING_SHAREABLE_LINK_CLEANUP_JOB:
        await this.shareableLinkCleanup.process(job);
        return;
      default:
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown budgeting job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }

  private async shouldSkipTenantJob(job: Job): Promise<boolean> {
    const data = job.data as { tenant_id?: unknown };
    if (typeof data.tenant_id !== 'string') return false;

    const enabled = await this.tenantModuleService.isEnabled(data.tenant_id, 'budgeting');
    if (enabled) return false;

    this.logger.debug(`${job.name} skipped — budgeting disabled for tenant ${data.tenant_id}`);
    return true;
  }
}
