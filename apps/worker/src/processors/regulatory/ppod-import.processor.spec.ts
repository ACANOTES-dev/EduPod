import { Job } from 'bullmq';

import {
  type PpodImportPayload,
  REGULATORY_PPOD_IMPORT_JOB,
  RegulatoryPpodImportProcessor,
} from './ppod-import.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const MAPPING_ID = '44444444-4444-4444-4444-444444444444';

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
      findFirst: jest.fn().mockResolvedValue(null),
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
  name: string = REGULATORY_PPOD_IMPORT_JOB,
  data: Partial<PpodImportPayload> = {},
): Job<PpodImportPayload> {
  return {
    data: {
      csv_content:
        'pps_number,first_name,last_name,date_of_birth,ppod_id\nPPS1234,Amina,OBrien,2010-03-15,PPOD-1',
      database_type: 'ppod',
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<PpodImportPayload>;
}

describe('RegulatoryPpodImportProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodImportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('regulatory:other-job'));

    expect(mockTx.student.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodImportProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(REGULATORY_PPOD_IMPORT_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should create a mapping when a row matches by PPS number', async () => {
    const mockTx = buildMockTx();
    mockTx.student.findFirst.mockImplementation(
      async (args: { where: { national_id?: string } }) =>
        args.where.national_id ? { id: STUDENT_ID } : null,
    );
    const processor = new RegulatoryPpodImportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.ppodStudentMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        database_type: 'ppod',
        external_id: 'PPOD-1',
        student_id: STUDENT_ID,
        sync_status: 'synced',
        tenant_id: TENANT_ID,
      }),
    });
    expect(mockTx.ppodSyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        records_created: 1,
        records_failed: 0,
        records_updated: 0,
        status: 'sync_completed',
      }),
    });
  });

  it('should update an existing mapping when fallback name and date-of-birth match succeeds', async () => {
    const mockTx = buildMockTx();
    mockTx.student.findFirst.mockImplementation(
      async (args: { where: { date_of_birth?: Date; first_name?: { equals: string } } }) => {
        if (args.where.first_name) {
          return { id: STUDENT_ID };
        }

        return null;
      },
    );
    mockTx.ppodStudentMapping.findFirst.mockResolvedValue({
      external_id: 'PPOD-OLD',
      id: MAPPING_ID,
    });
    const processor = new RegulatoryPpodImportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(
      buildJob(REGULATORY_PPOD_IMPORT_JOB, {
        csv_content:
          'pps_number,first_name,last_name,date_of_birth,ppod_id\n,Siobhan,Murphy,2010-03-15,PPOD-9',
      }),
    );

    expect(mockTx.ppodStudentMapping.update).toHaveBeenCalledWith({
      where: { id: MAPPING_ID },
      data: expect.objectContaining({
        external_id: 'PPOD-9',
        sync_status: 'synced',
      }),
    });
  });

  it('should mark the sync log as completed_with_errors when rows cannot be matched', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryPpodImportProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(
      buildJob(REGULATORY_PPOD_IMPORT_JOB, {
        csv_content:
          'pps_number,first_name,last_name,date_of_birth,ppod_id\n,Mismatch,Student,2010-03-15,PPOD-2',
      }),
    );

    expect(mockTx.ppodStudentMapping.create).not.toHaveBeenCalled();
    expect(mockTx.ppodSyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        records_created: 0,
        records_failed: 1,
        records_updated: 0,
        status: 'completed_with_errors',
      }),
    });
  });
});
