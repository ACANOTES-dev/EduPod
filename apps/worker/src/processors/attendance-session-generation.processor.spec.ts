import { Job } from 'bullmq';

import {
  ATTENDANCE_GENERATE_SESSIONS_JOB,
  type AttendanceSessionGenerationPayload,
  AttendanceSessionGenerationProcessor,
} from './attendance-session-generation.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CLASS_ID = '22222222-2222-2222-2222-222222222222';
const SCHEDULE_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_ID = '44444444-4444-4444-4444-444444444444';
const YEAR_GROUP_ID = '55555555-5555-5555-5555-555555555555';
const STUDENT_ID = '66666666-6666-6666-6666-666666666666';

function buildSchedule(overrides: Record<string, unknown> = {}) {
  return {
    class_entity: {
      academic_year: {
        end_date: new Date('2026-06-30T00:00:00.000Z'),
        start_date: new Date('2025-09-01T00:00:00.000Z'),
      },
      id: CLASS_ID,
      status: 'active',
      year_group_id: YEAR_GROUP_ID,
    },
    class_id: CLASS_ID,
    id: SCHEDULE_ID,
    ...overrides,
  };
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    attendanceRecord: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    attendanceSession: {
      create: jest.fn().mockResolvedValue({ id: SESSION_ID }),
      update: jest.fn().mockResolvedValue({ id: SESSION_ID }),
    },
    class: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: CLASS_ID,
          year_group_id: YEAR_GROUP_ID,
          academic_year: {
            start_date: new Date('2025-09-01T00:00:00.000Z'),
            end_date: new Date('2026-06-30T00:00:00.000Z'),
          },
        },
      ]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([{ student_id: STUDENT_ID }]),
    },
    schedule: {
      findMany: jest.fn().mockResolvedValue([buildSchedule()]),
    },
    schoolClosure: {
      count: jest.fn().mockResolvedValue(0),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          attendance: {
            defaultPresentEnabled: true,
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
  name: string = ATTENDANCE_GENERATE_SESSIONS_JOB,
  data: Partial<AttendanceSessionGenerationPayload> = {},
): Job<AttendanceSessionGenerationPayload> {
  return {
    data: {
      date: '2026-03-30',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AttendanceSessionGenerationPayload>;
}

describe('AttendanceSessionGenerationProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('attendance:other-job'));

    expect(mockTx.schedule.findMany).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(ATTENDANCE_GENERATE_SESSIONS_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should create sessions and default-present attendance records when enabled', async () => {
    const mockTx = buildMockTx();
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.schedule.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        weekday: 0,
        effective_start_date: { lte: new Date('2026-03-30') },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date('2026-03-30') } }],
      },
      include: {
        class_entity: {
          select: {
            id: true,
            status: true,
            academic_year: {
              select: { start_date: true, end_date: true },
            },
            year_group_id: true,
          },
        },
      },
    });
    expect(mockTx.attendanceSession.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        class_id: CLASS_ID,
        schedule_id: SCHEDULE_ID,
        session_date: new Date('2026-03-30'),
        status: 'open',
      },
    });
    expect(mockTx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attendance_session_id: SESSION_ID,
          marked_by_user_id: '00000000-0000-0000-0000-000000000000',
          status: 'present',
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('should skip schedules when a school closure applies', async () => {
    const mockTx = buildMockTx();
    mockTx.schoolClosure.count.mockResolvedValue(1);
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.attendanceSession.create).not.toHaveBeenCalled();
    expect(mockTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('should swallow duplicate-session P2002 errors', async () => {
    const mockTx = buildMockTx();
    mockTx.attendanceSession.create.mockRejectedValue({ code: 'P2002' });
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  // ─── Daily capture-mode branch ─────────────────────────────────────────────

  it('should create one session per active class with schedule_id=null when captureMode is daily', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { captureMode: 'daily', defaultPresentEnabled: false } },
    });
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.schedule.findMany).not.toHaveBeenCalled();
    expect(mockTx.class.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active' },
      select: {
        id: true,
        year_group_id: true,
        academic_year: { select: { start_date: true, end_date: true } },
      },
    });
    expect(mockTx.attendanceSession.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        class_id: CLASS_ID,
        schedule_id: null,
        session_date: new Date('2026-03-30'),
        status: 'open',
      },
    });
    expect(mockTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('should insert default-present records for daily sessions when enabled', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { captureMode: 'daily', defaultPresentEnabled: true } },
    });
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.attendanceSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { default_present: true },
    });
    expect(mockTx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attendance_session_id: SESSION_ID,
          student_id: STUDENT_ID,
          status: 'present',
          tenant_id: TENANT_ID,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('should skip daily sessions when a school closure applies', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { captureMode: 'daily', defaultPresentEnabled: false } },
    });
    mockTx.schoolClosure.count.mockResolvedValue(1);
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.attendanceSession.create).not.toHaveBeenCalled();
  });

  it('should skip daily sessions when date is outside the academic year', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { captureMode: 'daily', defaultPresentEnabled: false } },
    });
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob(ATTENDANCE_GENERATE_SESSIONS_JOB, { date: '2030-01-01' }));

    expect(mockTx.attendanceSession.create).not.toHaveBeenCalled();
  });

  it('should swallow duplicate-session P2002 errors in daily mode', async () => {
    const mockTx = buildMockTx();
    mockTx.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { captureMode: 'daily', defaultPresentEnabled: true } },
    });
    mockTx.attendanceSession.create.mockRejectedValue({ code: 'P2002' });
    const processor = new AttendanceSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });
});
