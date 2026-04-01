import { createHash } from 'crypto';

import { Job } from 'bullmq';

import {
  type PpodSyncPayload,
  REGULATORY_PPOD_SYNC_JOB,
  RegulatoryPpodSyncProcessor,
} from './ppod-sync.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const MAPPING_ID = '44444444-4444-4444-4444-444444444444';

function buildStudent(overrides: Record<string, unknown> = {}) {
  return {
    date_of_birth: new Date('2010-03-15T00:00:00.000Z'),
    first_name: 'Amina',
    id: STUDENT_ID,
    last_name: 'OBrien',
    national_id: 'PPS1234',
    ...overrides,
  };
}

function buildStudentHash(student: {
  date_of_birth: Date | null;
  first_name: string;
  last_name: string;
  national_id: string | null;
}): string {
  return createHash('md5')
    .update(
      [
        student.first_name,
        student.last_name,
        student.date_of_birth?.toISOString() ?? '',
        student.national_id ?? '',
      ].join('|'),
    )
    .digest('hex');
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    ppodStudentMapping: {
      create: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
    },
    ppodSyncLog: {
      create: jest.fn().mockResolvedValue({ id: 'sync-log-id' }),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([buildStudent()]),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = REGULATORY_PPOD_SYNC_JOB,
  data: Partial<PpodSyncPayload> = {},
): Job<PpodSyncPayload> {
  return {
    data: {
      database_type: 'ppod',
      scope: 'full',
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<PpodSyncPayload>;
}

describe('RegulatoryPpodSyncProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodSyncProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('regulatory:other-job'));

    expect(mockTx.student.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodSyncProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(REGULATORY_PPOD_SYNC_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should create pending mappings during a full sync', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodSyncProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        date_of_birth: true,
        national_id: true,
      },
    });
    expect(mockTx.ppodStudentMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        sync_status: 'pod_pending',
      }),
    });
    expect(mockTx.ppodSyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        records_pushed: 1,
        records_updated: 1,
        status: 'sync_completed',
        tenant_id: TENANT_ID,
        triggered_by_id: USER_ID,
      }),
    });
  });

  it('should skip unchanged mappings during an incremental sync', async () => {
    const mockTx = buildMockTx();
    const student = buildStudent();
    mockTx.student.findMany.mockResolvedValue([student]);
    mockTx.ppodStudentMapping.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      last_sync_hash: buildStudentHash(student),
    });
    const processor = new RegulatoryPpodSyncProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob(REGULATORY_PPOD_SYNC_JOB, { scope: 'incremental' }));

    expect(mockTx.ppodStudentMapping.update).not.toHaveBeenCalled();
    expect(mockTx.ppodStudentMapping.create).not.toHaveBeenCalled();
    expect(mockTx.ppodSyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        records_pushed: 0,
        records_updated: 0,
      }),
    });
  });

  it('should update existing mappings when incremental sync detects changed data', async () => {
    const mockTx = buildMockTx();
    mockTx.ppodStudentMapping.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      last_sync_hash: 'old-hash',
    });
    const processor = new RegulatoryPpodSyncProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob(REGULATORY_PPOD_SYNC_JOB, { scope: 'incremental' }));

    expect(mockTx.ppodStudentMapping.update).toHaveBeenCalledWith({
      where: { id: MAPPING_ID },
      data: expect.objectContaining({
        sync_status: 'pod_pending',
      }),
    });
  });
});
