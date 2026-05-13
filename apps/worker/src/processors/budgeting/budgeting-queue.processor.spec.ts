import type { Job } from 'bullmq';

import {
  BUDGETING_BOARD_PACK_RENDER_JOB,
  type BoardPackRenderProcessor,
} from './board-pack-render.processor';
import { BudgetingQueueDispatcher } from './budgeting-queue.processor';
import {
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  type ShareableLinkCleanupProcessor,
} from './shareable-link-cleanup.processor';
import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
  BUDGETING_VARIANCE_REFRESH_JOB,
  type VarianceRefreshProcessor,
} from './variance-refresh.processor';

/**
 * Routing-only spec for the queue dispatcher.
 *
 * The dispatcher is a thin switch over `job.name` that delegates to one of
 * three sibling processors. Each delegate has its own behavioural spec
 * (variance-refresh.processor.spec.ts, board-pack-render.processor.spec.ts,
 * shareable-link-cleanup.processor.spec.ts). This spec verifies the
 * routing contract — that the right processor is invoked for each known
 * job name and that unknown names fall through silently (the canary-ping
 * branch).
 */

interface MockProcessor<P> {
  process: jest.Mock<Promise<void>, [Job<P, unknown, string>]>;
}

function buildTenantModuleService(enabled = true) {
  return { isEnabled: jest.fn().mockResolvedValue(enabled) };
}

function buildJob(name: string, data: Record<string, unknown> = {}): Job {
  // Intentional minimal shape — the dispatcher only reads `name`, `id`, and tenant_id.
  return { name, id: `job-${name}`, data } as Job;
}

describe('BudgetingQueueDispatcher', () => {
  let variance: MockProcessor<unknown>;
  let boardPack: MockProcessor<unknown>;
  let cleanup: MockProcessor<unknown>;
  let tenantModuleService: ReturnType<typeof buildTenantModuleService>;
  let dispatcher: BudgetingQueueDispatcher;

  beforeEach(() => {
    variance = { process: jest.fn().mockResolvedValue(undefined) };
    boardPack = { process: jest.fn().mockResolvedValue(undefined) };
    cleanup = { process: jest.fn().mockResolvedValue(undefined) };
    tenantModuleService = buildTenantModuleService();
    dispatcher = new BudgetingQueueDispatcher(
      variance as unknown as VarianceRefreshProcessor,
      boardPack as unknown as BoardPackRenderProcessor,
      cleanup as unknown as ShareableLinkCleanupProcessor,
      tenantModuleService as never,
    );
  });

  it('routes variance-refresh jobs to VarianceRefreshProcessor', async () => {
    await dispatcher.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: 'tenant-1' }));
    expect(variance.process).toHaveBeenCalledTimes(1);
    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith('tenant-1', 'budgeting');
    expect(boardPack.process).not.toHaveBeenCalled();
    expect(cleanup.process).not.toHaveBeenCalled();
  });

  it('routes variance-refresh-bootstrap jobs to VarianceRefreshProcessor', async () => {
    await dispatcher.process(buildJob(BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB));
    expect(variance.process).toHaveBeenCalledTimes(1);
  });

  it('routes board-pack-render jobs to BoardPackRenderProcessor', async () => {
    await dispatcher.process(buildJob(BUDGETING_BOARD_PACK_RENDER_JOB, { tenant_id: 'tenant-1' }));
    expect(boardPack.process).toHaveBeenCalledTimes(1);
    expect(variance.process).not.toHaveBeenCalled();
    expect(cleanup.process).not.toHaveBeenCalled();
  });

  it('skips tenant jobs when budgeting is disabled', async () => {
    tenantModuleService.isEnabled.mockResolvedValue(false);

    await dispatcher.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: 'tenant-1' }));

    expect(variance.process).not.toHaveBeenCalled();
    expect(boardPack.process).not.toHaveBeenCalled();
    expect(cleanup.process).not.toHaveBeenCalled();
  });

  it('routes shareable-link-cleanup jobs to ShareableLinkCleanupProcessor', async () => {
    await dispatcher.process(buildJob(BUDGETING_SHAREABLE_LINK_CLEANUP_JOB));
    expect(cleanup.process).toHaveBeenCalledTimes(1);
    expect(variance.process).not.toHaveBeenCalled();
    expect(boardPack.process).not.toHaveBeenCalled();
  });

  it('logs a warning for unknown job names that are NOT canary pings', async () => {
    const warn = jest
      .spyOn((dispatcher as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    await dispatcher.process(buildJob('budgeting:not-a-real-job'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(variance.process).not.toHaveBeenCalled();
    expect(boardPack.process).not.toHaveBeenCalled();
    expect(cleanup.process).not.toHaveBeenCalled();
  });

  it('falls through silently for monitoring:canary-* probes', async () => {
    const warn = jest
      .spyOn((dispatcher as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    await dispatcher.process(buildJob('monitoring:canary-ping'));
    expect(warn).not.toHaveBeenCalled();
    expect(variance.process).not.toHaveBeenCalled();
  });
});
