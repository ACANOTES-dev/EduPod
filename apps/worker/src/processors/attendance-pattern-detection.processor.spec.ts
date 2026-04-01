import { Job } from 'bullmq';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared';

import {
  ATTENDANCE_DETECT_PATTERNS_JOB,
  type AttendancePatternDetectionPayload,
  AttendancePatternDetectionProcessor,
} from './attendance-pattern-detection.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    attendancePatternAlert: {
      create: jest.fn().mockResolvedValue({ id: 'alert-id' }),
    },
    attendanceRecord: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    student: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ first_name: 'Amina', id: STUDENT_ID, last_name: 'OBrien' }]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          attendance: {
            patternDetection: {
              enabled: true,
              excessiveAbsenceThreshold: 5,
              excessiveAbsenceWindowDays: 14,
              parentNotificationMode: 'manual',
              recurringDayThreshold: 3,
              recurringDayWindowDays: 30,
              tardinessThreshold: 4,
              tardinessWindowDays: 14,
            },
          },
        },
      }),
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
  name: string = ATTENDANCE_DETECT_PATTERNS_JOB,
  data: Partial<AttendancePatternDetectionPayload> = {},
): Job<AttendancePatternDetectionPayload> {
  return {
    data: {
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AttendancePatternDetectionPayload>;
}

describe('AttendancePatternDetectionProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockQueue = { add: jest.fn() };
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      mockQueue as never,
    );

    await processor.process(buildJob('attendance:other-job'));

    expect(mockTx.student.findMany).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      { add: jest.fn() } as never,
    );

    await expect(
      processor.process(buildJob(ATTENDANCE_DETECT_PATTERNS_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should skip processing when pattern detection is disabled', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { patternDetection: { enabled: false } } },
    });
    const mockQueue = { add: jest.fn() };
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      mockQueue as never,
    );

    await processor.process(buildJob());

    expect(mockTx.student.findMany).not.toHaveBeenCalled();
    expect(mockTx.attendancePatternAlert.create).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should create excessive-absence alerts and enqueue early-warning recomputes', async () => {
    const mockTx = buildMockTx();
    mockTx.attendanceRecord.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      mockQueue as never,
    );

    await processor.process(buildJob());

    expect(mockTx.attendancePatternAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'excessive_absences',
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      }),
    });
    expect(mockQueue.add).toHaveBeenCalledWith(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        trigger_event: 'third_consecutive_absence',
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });

  it('should create recurring-day alerts from repeated absences on the same weekday', async () => {
    const mockTx = buildMockTx();
    mockTx.attendanceRecord.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockTx.attendanceRecord.findMany.mockResolvedValue([
      { session: { session_date: new Date('2026-03-02T09:00:00.000Z') } },
      { session: { session_date: new Date('2026-03-09T09:00:00.000Z') } },
      { session: { session_date: new Date('2026-03-16T09:00:00.000Z') } },
    ]);
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      { add: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.attendancePatternAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'recurring_day',
        details_json: expect.objectContaining({
          count: 3,
          day_name: 'Monday',
        }),
      }),
    });
  });

  it('should create chronic-tardiness alerts when late counts hit the threshold', async () => {
    const mockTx = buildMockTx();
    mockTx.attendanceRecord.count.mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      { add: jest.fn() } as never,
    );

    await processor.process(buildJob());

    expect(mockTx.attendancePatternAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'chronic_tardiness',
        details_json: expect.objectContaining({
          count: 4,
          window_days: 14,
        }),
      }),
    });
  });

  it('should swallow duplicate-alert P2002 errors without enqueueing early-warning work', async () => {
    const mockTx = buildMockTx();
    mockTx.attendanceRecord.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    mockTx.attendancePatternAlert.create.mockRejectedValue({ code: 'P2002' });
    const mockQueue = { add: jest.fn() };
    const processor = new AttendancePatternDetectionProcessor(
      buildMockPrisma(mockTx) as never,
      mockQueue as never,
    );

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
