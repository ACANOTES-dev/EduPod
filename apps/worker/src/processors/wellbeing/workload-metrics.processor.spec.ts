import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { WorkloadMetricsProcessor, WORKLOAD_METRICS_JOB } from './workload-metrics.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock Redis ─────────────────────────────────────────────────────────────

const mockPipeline = {
  set: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisClient = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

// ─── Mock Prisma ────────────────────────────────────────────────────────────

const mockTx = {
  $executeRaw: jest.fn().mockResolvedValue(0),
  academicYear: { findFirst: jest.fn() },
  academicPeriod: { findFirst: jest.fn() },
  tenantSetting: { findUnique: jest.fn() },
  schedule: { findMany: jest.fn() },
  schedulePeriodTemplate: { findMany: jest.fn() },
  substitutionRecord: { findMany: jest.fn() },
  teacherAbsence: { findMany: jest.fn() },
  staffProfile: { count: jest.fn() },
};

const mockPrisma = {
  tenantModule: { findMany: jest.fn() },
  $transaction: jest.fn().mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
  ),
};

// ─── Test Data ──────────────────────────────────────────────────────────────

const makeSchedules = (staffId: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    teacher_staff_id: staffId,
    weekday: i % 5,
    room_id: `room-${i % 3}`,
    period_order: i,
    schedule_period_template_id: 'tpl-teaching',
  }));

const setupDefaultMocks = () => {
  mockTx.academicYear.findFirst.mockResolvedValue({ id: 'year-1' });
  mockTx.academicPeriod.findFirst.mockResolvedValue({
    id: 'period-1',
    start_date: new Date('2026-01-15'),
    end_date: new Date('2026-04-01'),
  });
  mockTx.tenantSetting.findUnique.mockResolvedValue({
    settings: { staff_wellbeing: { workload_high_threshold_periods: 22, workload_high_threshold_covers: 8 } },
  });
  mockTx.schedule.findMany.mockResolvedValue([
    ...makeSchedules('staff-1', 20),
    ...makeSchedules('staff-2', 18),
  ]);
  mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([
    { id: 'tpl-teaching' },
  ]);
  mockTx.substitutionRecord.findMany.mockResolvedValue([
    { substitute_staff_id: 'staff-1' },
    { substitute_staff_id: 'staff-1' },
    { substitute_staff_id: 'staff-2' },
  ]);
  mockTx.teacherAbsence.findMany.mockResolvedValue([
    { absence_date: new Date('2026-02-10'), staff_profile_id: 'staff-3' },
    { absence_date: new Date('2026-02-12'), staff_profile_id: 'staff-4' },
  ]);
  mockTx.staffProfile.count.mockResolvedValue(10);
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('WorkloadMetricsProcessor', () => {
  let processor: WorkloadMetricsProcessor;

  beforeEach(async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkloadMetricsProcessor,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<WorkloadMetricsProcessor>(WorkloadMetricsProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  const makeJob = (name: string): Job =>
    ({ name, data: {} } as unknown as Job);

  // ─── Processing ─────────────────────────────────────────────────────────

  it('should process all active tenants with staff_wellbeing enabled', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([
      { tenant_id: TENANT_A },
      { tenant_id: TENANT_B },
    ]);
    setupDefaultMocks();

    await processor.process(makeJob(WORKLOAD_METRICS_JOB));

    // Should have opened a transaction for each tenant
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should skip tenants where staff_wellbeing module is not enabled', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

    await processor.process(makeJob(WORKLOAD_METRICS_JOB));

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should skip tenants with no active academic year', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([{ tenant_id: TENANT_A }]);
    mockTx.academicYear.findFirst.mockResolvedValue(null);

    await processor.process(makeJob(WORKLOAD_METRICS_JOB));

    // Transaction opened but no cache writes
    expect(mockPipeline.set).not.toHaveBeenCalled();
  });

  it('should write aggregate metrics to Redis with correct key format', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([{ tenant_id: TENANT_A }]);
    setupDefaultMocks();

    await processor.process(makeJob(WORKLOAD_METRICS_JOB));

    // 6 metric types should be written
    expect(mockPipeline.set).toHaveBeenCalledTimes(6);

    // Check key patterns
    const keys = mockPipeline.set.mock.calls.map(
      (call: [string, string, string, number]) => call[0],
    );
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:workload-summary`);
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:cover-fairness`);
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:timetable-quality`);
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:absence-trends`);
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:substitution-pressure`);
    expect(keys).toContain(`wellbeing:aggregate:${TENANT_A}:correlation`);
  });

  it('should write with 24-hour TTL', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([{ tenant_id: TENANT_A }]);
    setupDefaultMocks();

    await processor.process(makeJob(WORKLOAD_METRICS_JOB));

    // All pipeline.set calls should have 'EX', 86400
    for (const call of mockPipeline.set.mock.calls) {
      expect(call[2]).toBe('EX');
      expect(call[3]).toBe(86400);
    }
  });

  it('should continue processing remaining tenants when one fails', async () => {
    mockPrisma.tenantModule.findMany.mockResolvedValue([
      { tenant_id: TENANT_A },
      { tenant_id: TENANT_B },
    ]);

    // First tenant fails, second succeeds
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) throw new Error('DB error');
      setupDefaultMocks();
      return fn(mockTx);
    });

    await expect(processor.process(makeJob(WORKLOAD_METRICS_JOB))).resolves.not.toThrow();

    // Should have attempted both tenants
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should ignore jobs with non-matching job name', async () => {
    await processor.process(makeJob('other:job'));

    expect(mockPrisma.tenantModule.findMany).not.toHaveBeenCalled();
  });
});
