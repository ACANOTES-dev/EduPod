import { Job } from 'bullmq';

import {
  ATTENDANCE_DETECT_PENDING_JOB,
  type AttendancePendingDetectionPayload,
  AttendancePendingDetectionProcessor,
} from './attendance-pending-detection.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    attendanceSession: {
      count: jest.fn().mockResolvedValue(7),
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
  name: string = ATTENDANCE_DETECT_PENDING_JOB,
  data: Partial<AttendancePendingDetectionPayload> = {},
): Job<AttendancePendingDetectionPayload> {
  return {
    data: {
      date: '2026-04-01',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AttendancePendingDetectionPayload>;
}

describe('AttendancePendingDetectionProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendancePendingDetectionProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(ATTENDANCE_DETECT_PENDING_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should count open attendance sessions for the target date', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendancePendingDetectionProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.attendanceSession.count).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        session_date: new Date('2026-04-01'),
        status: 'open',
      },
    });
  });
});
