import { Job } from 'bullmq';

import {
  BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
  PartitionMaintenanceProcessor,
} from './partition-maintenance.processor';

function buildJob(name: string): Job {
  return {
    data: {},
    name,
  } as Job;
}

function buildMockPrisma() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ exists: false }]),
  };
}

describe('PartitionMaintenanceProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const prisma = buildMockPrisma();
    const processor = new PartitionMaintenanceProcessor(prisma as never);

    await expect(processor.process(buildJob('behaviour:other-job'))).resolves.toEqual({});
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('should create or verify all configured monthly and yearly partitions', async () => {
    const prisma = buildMockPrisma();
    const processor = new PartitionMaintenanceProcessor(prisma as never);

    await expect(processor.process(buildJob(BEHAVIOUR_PARTITION_MAINTENANCE_JOB))).resolves.toEqual(
      {
        created_partitions: 22,
        tables_processed: 6,
      },
    );

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(22);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(22);
    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT EXISTS'),
      'behaviour_entity_history_2026_04',
    );
  });
});
