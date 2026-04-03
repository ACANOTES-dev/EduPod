/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { EARLY_WARNING_WEEKLY_DIGEST_JOB } from '@school/shared/early-warning';
import { Job } from 'bullmq';

jest.mock('./early-warning-action.utils', () => ({
  getActiveAcademicYear: jest.fn(),
  loadTenantConfig: jest.fn(),
}));

import { getActiveAcademicYear, loadTenantConfig } from './early-warning-action.utils';
import { type WeeklyDigestPayload, WeeklyDigestProcessor } from './weekly-digest.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';
const RECIPIENT_A_ID = '44444444-4444-4444-4444-444444444444';
const RECIPIENT_B_ID = '55555555-5555-5555-5555-555555555555';

const DIGEST_DATE = new Date('2026-04-01T12:00:00.000Z');
const DIGEST_DAY = DIGEST_DATE.getDay();

const DEFAULT_CONFIG = {
  digestDay: DIGEST_DAY,
  digestRecipients: [RECIPIENT_A_ID, RECIPIENT_B_ID],
  highSeverityEvents: ['suspension'],
  hysteresisBuffer: 5,
  isEnabled: true,
  routingRules: {
    amber: { role: 'year_head' },
    red: { roles: ['principal'] },
    yellow: { role: 'homeroom_teacher' },
  },
  thresholds: { amber: 40, green: 0, red: 70, yellow: 20 },
  weights: {
    attendance: 25,
    behaviour: 20,
    engagement: 15,
    grades: 20,
    wellbeing: 20,
  },
};

function buildProfiles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    composite_score: 80 - index,
    risk_tier: 'amber',
    signal_summary_json: { summaryText: `Summary ${index + 1}` },
    student: {
      first_name: `Student${index + 1}`,
      id: `student-${index + 1}`,
      last_name: 'Example',
    },
    student_id: `student-${index + 1}`,
  }));
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    earlyWarningTierTransition: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    studentRiskProfile: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

interface BuildMockPrismaOptions {
  failingTransactionCalls?: number[];
  tenants?: Array<{ id: string }>;
}

function buildMockPrisma(mockTx: MockTx, options: BuildMockPrismaOptions = {}) {
  let transactionCall = 0;
  const failingCalls = new Set(options.failingTransactionCalls ?? []);

  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => {
      transactionCall += 1;

      if (failingCalls.has(transactionCall)) {
        throw new Error(`transaction ${transactionCall} failed`);
      }

      return callback(mockTx);
    }),
    tenant: {
      findMany: jest.fn().mockResolvedValue(options.tenants ?? []),
    },
  };
}

function buildJob(
  name: string = EARLY_WARNING_WEEKLY_DIGEST_JOB,
  data: Partial<WeeklyDigestPayload> = {},
): Job<WeeklyDigestPayload> {
  return {
    data: {
      tenant_id: TENANT_A_ID,
      ...data,
    },
    name,
  } as Job<WeeklyDigestPayload>;
}

describe('WeeklyDigestProcessor', () => {
  const mockGetActiveAcademicYear = jest.mocked(getActiveAcademicYear);
  const mockLoadTenantConfig = jest.mocked(loadTenantConfig);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(DIGEST_DATE);
    mockLoadTenantConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockGetActiveAcademicYear.mockResolvedValue({ id: ACADEMIC_YEAR_ID } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);

    await processor.process(buildJob('early-warning:other-job'));

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should iterate all active tenants in cron mode and continue after a tenant failure', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx, {
      failingTransactionCalls: [1],
      tenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
    });
    const processor = new WeeklyDigestProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(EARLY_WARNING_WEEKLY_DIGEST_JOB, { tenant_id: undefined })),
    ).resolves.toBeUndefined();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should skip digest generation when early warning is disabled', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);
    mockLoadTenantConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      isEnabled: false,
    });

    await processor.process(buildJob());

    expect(mockTx.studentRiskProfile.findMany).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip digest generation when today is not the configured digest day', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);
    mockLoadTenantConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      digestDay: (DIGEST_DAY + 1) % 7,
    });

    await processor.process(buildJob());

    expect(mockGetActiveAcademicYear).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip digest generation when there is no active academic year', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);
    mockGetActiveAcademicYear.mockResolvedValue(null);

    await processor.process(buildJob());

    expect(mockTx.studentRiskProfile.findMany).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip digest generation when no recipients are configured', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);
    mockLoadTenantConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      digestRecipients: [],
    });

    await processor.process(buildJob());

    expect(mockTx.studentRiskProfile.findMany).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip digest generation when no risk profiles exist', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.studentRiskProfile.findMany).toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should send digest notifications with filtered, capped entries and continue after one recipient fails', async () => {
    const mockTx = buildMockTx();
    mockTx.studentRiskProfile.findMany.mockResolvedValue([
      ...buildProfiles(51),
      {
        composite_score: 10,
        risk_tier: 'green',
        signal_summary_json: { summaryText: 'Recently improved' },
        student: {
          first_name: 'Changed',
          id: 'student-green-changed',
          last_name: 'Student',
        },
        student_id: 'student-green-changed',
      },
      {
        composite_score: 5,
        risk_tier: 'green',
        signal_summary_json: { summaryText: 'Stable green' },
        student: {
          first_name: 'Stable',
          id: 'student-green-stable',
          last_name: 'Student',
        },
        student_id: 'student-green-stable',
      },
    ]);
    mockTx.earlyWarningTierTransition.findMany.mockResolvedValue([
      {
        from_tier: 'yellow',
        student_id: 'student-green-changed',
        to_tier: 'green',
      },
    ]);
    mockTx.notification.create
      .mockRejectedValueOnce(new Error('recipient unavailable'))
      .mockResolvedValueOnce({ id: 'notification-ok' });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new WeeklyDigestProcessor(mockPrisma as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockTx.notification.create).toHaveBeenCalledTimes(2);

    const firstPayload = mockTx.notification.create.mock.calls[0]?.[0] as {
      data: {
        payload_json: {
          distribution: Record<string, number>;
          entries: unknown[];
          students_at_risk: number;
          tier_changes_this_week: number;
          total_students: number;
        };
      };
    };

    expect(firstPayload.data.payload_json.total_students).toBe(53);
    expect(firstPayload.data.payload_json.students_at_risk).toBe(52);
    expect(firstPayload.data.payload_json.tier_changes_this_week).toBe(1);
    expect(firstPayload.data.payload_json.entries).toHaveLength(50);
    expect(firstPayload.data.payload_json.distribution).toEqual({
      amber: 51,
      green: 2,
      red: 0,
      yellow: 0,
    });
  });
});
