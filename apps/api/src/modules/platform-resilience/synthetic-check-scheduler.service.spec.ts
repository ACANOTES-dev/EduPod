import { ConfigService } from '@nestjs/config';

import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';
import { SyntheticCheckSchedulerService } from './synthetic-check-scheduler.service';

const mockQueue = {
  add: jest.fn(),
  close: jest.fn(),
  getRepeatableJobs: jest.fn(),
  removeRepeatableByKey: jest.fn(),
};

const mockWorker = { close: jest.fn() };

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => mockQueue),
  Worker: jest.fn(() => mockWorker),
}));

describe('SyntheticCheckSchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.getRepeatableJobs.mockResolvedValue([
      { id: 'cron-synthetic-platform.login', key: 'repeat-key-1' },
    ]);
  });

  function buildService(definition: { enabled: boolean; key: string; schedule_cron: string }) {
    const prisma = {
      platformSyntheticCheckDefinition: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'definition-1',
          ...definition,
        }),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const runner = { run: jest.fn() } as unknown as SyntheticCheckRunnerService;
    return {
      prisma,
      service: new SyntheticCheckSchedulerService(config, prisma as never, runner),
    };
  }

  it('removes existing repeatables before registering an enabled schedule', async () => {
    const { service } = buildService({
      enabled: true,
      key: 'platform.login',
      schedule_cron: '*/5 * * * *',
    });

    await service.onModuleInit();
    await service.syncDefinition('definition-1');

    expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('repeat-key-1');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'resilience:run-synthetic-check',
      { definition_id: 'definition-1' },
      expect.objectContaining({
        jobId: 'cron-synthetic-platform.login',
        repeat: { pattern: '*/5 * * * *' },
      }),
    );
  });

  it('removes schedules and does not add repeatables for disabled checks', async () => {
    const { service } = buildService({
      enabled: false,
      key: 'platform.login',
      schedule_cron: '*/5 * * * *',
    });

    await service.onModuleInit();
    await service.syncDefinition('definition-1');

    expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('repeat-key-1');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
