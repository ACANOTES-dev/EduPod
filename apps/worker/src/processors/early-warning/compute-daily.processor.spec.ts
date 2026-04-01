/* eslint-disable import/order -- jest.mock must precede mocked imports */
import type { RiskAssessment, SignalResult } from '@school/shared';
import { EARLY_WARNING_COMPUTE_DAILY_JOB } from '@school/shared';
import { Job } from 'bullmq';

jest.mock('./early-warning-action.utils', () => ({
  computeRiskAssessment: jest.fn(),
  getActiveAcademicYear: jest.fn(),
  loadTenantConfig: jest.fn(),
  logTierTransition: jest.fn(),
  upsertRiskProfile: jest.fn(),
  writeSignalAuditTrail: jest.fn(),
}));

jest.mock('./signal-collection.utils', () => ({
  collectAllSignals: jest.fn(),
}));

import {
  computeRiskAssessment,
  getActiveAcademicYear,
  loadTenantConfig,
  logTierTransition,
  upsertRiskProfile,
  writeSignalAuditTrail,
} from './early-warning-action.utils';
import { ComputeDailyProcessor, type ComputeDailyPayload } from './compute-daily.processor';
import { collectAllSignals } from './signal-collection.utils';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_A_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_B_ID = '44444444-4444-4444-4444-444444444444';
const STUDENT_C_ID = '55555555-5555-5555-5555-555555555555';
const ACADEMIC_YEAR_ID = '66666666-6666-6666-6666-666666666666';

const DEFAULT_CONFIG = {
  digestDay: 1,
  digestRecipients: [],
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

const SIGNALS: SignalResult[] = [
  {
    domain: 'attendance',
    rawScore: 30,
    signals: [],
    summaryFragments: [],
  },
];

const FIRST_ASSESSMENT: RiskAssessment = {
  compositeScore: 55,
  crossDomainBoost: 0,
  domainScores: {
    attendance: 30,
    behaviour: 0,
    engagement: 0,
    grades: 0,
    wellbeing: 0,
  },
  previousTier: 'yellow',
  riskTier: 'amber',
  signals: [],
  summaryText: 'Risk score increased.',
  tierChanged: true,
  trendData: [30, 40, 55],
};

const SECOND_ASSESSMENT: RiskAssessment = {
  compositeScore: 18,
  crossDomainBoost: 0,
  domainScores: {
    attendance: 18,
    behaviour: 0,
    engagement: 0,
    grades: 0,
    wellbeing: 0,
  },
  previousTier: 'green',
  riskTier: 'green',
  signals: [],
  summaryText: 'Risk score stable.',
  tierChanged: false,
  trendData: [15, 18],
};

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    student: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: STUDENT_A_ID }, { id: STUDENT_B_ID }, { id: STUDENT_C_ID }]),
    },
    studentRiskProfile: {
      findUnique: jest.fn().mockImplementation(
        async (args: {
          where: {
            uq_risk_profile_tenant_student_year: { student_id: string };
          };
        }) => {
          if (args.where.uq_risk_profile_tenant_student_year.student_id === STUDENT_C_ID) {
            return {
              risk_tier: 'green',
              trend_json: { dailyScores: [15] },
            };
          }

          return {
            risk_tier: 'yellow',
            trend_json: { dailyScores: [30, 40] },
          };
        },
      ),
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
  name: string = EARLY_WARNING_COMPUTE_DAILY_JOB,
  data: Partial<ComputeDailyPayload> = {},
): Job<ComputeDailyPayload> {
  return {
    data: {
      tenant_id: TENANT_A_ID,
      ...data,
    },
    name,
  } as Job<ComputeDailyPayload>;
}

describe('ComputeDailyProcessor', () => {
  const mockComputeRiskAssessment = jest.mocked(computeRiskAssessment);
  const mockGetActiveAcademicYear = jest.mocked(getActiveAcademicYear);
  const mockLoadTenantConfig = jest.mocked(loadTenantConfig);
  const mockLogTierTransition = jest.mocked(logTierTransition);
  const mockUpsertRiskProfile = jest.mocked(upsertRiskProfile);
  const mockWriteSignalAuditTrail = jest.mocked(writeSignalAuditTrail);
  const mockCollectAllSignals = jest.mocked(collectAllSignals);

  beforeEach(() => {
    mockLoadTenantConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockGetActiveAcademicYear.mockResolvedValue({ id: ACADEMIC_YEAR_ID } as never);
    mockComputeRiskAssessment.mockReturnValue(FIRST_ASSESSMENT);
    mockUpsertRiskProfile.mockImplementation(async (_tx, _tenantId, studentId: string) => {
      if (studentId === STUDENT_A_ID) {
        return 'profile-a';
      }

      if (studentId === STUDENT_C_ID) {
        return 'profile-c';
      }

      return 'profile-b';
    });
    mockWriteSignalAuditTrail.mockResolvedValue(undefined);
    mockLogTierTransition.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeDailyProcessor(mockPrisma as never);

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
    const processor = new ComputeDailyProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(EARLY_WARNING_COMPUTE_DAILY_JOB, { tenant_id: undefined })),
    ).resolves.toBeUndefined();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should skip tenant processing when early warning is disabled', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeDailyProcessor(mockPrisma as never);
    mockLoadTenantConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      isEnabled: false,
    });

    await processor.process(buildJob());

    expect(mockTx.student.findMany).not.toHaveBeenCalled();
    expect(mockCollectAllSignals).not.toHaveBeenCalled();
  });

  it('should skip tenant processing when there is no active academic year', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeDailyProcessor(mockPrisma as never);
    mockGetActiveAcademicYear.mockResolvedValue(null);

    await processor.process(buildJob());

    expect(mockTx.student.findMany).not.toHaveBeenCalled();
    expect(mockCollectAllSignals).not.toHaveBeenCalled();
  });

  it('should process active students and continue after one student fails', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeDailyProcessor(mockPrisma as never);

    mockCollectAllSignals.mockImplementation(async (_tx, _tenantId, studentId: string) => {
      if (studentId === STUDENT_B_ID) {
        throw new Error('signal collection failed');
      }

      return SIGNALS;
    });
    mockComputeRiskAssessment
      .mockReturnValueOnce(FIRST_ASSESSMENT)
      .mockReturnValueOnce(SECOND_ASSESSMENT);

    await processor.process(buildJob());

    expect(mockCollectAllSignals).toHaveBeenCalledTimes(3);
    expect(mockUpsertRiskProfile).toHaveBeenCalledTimes(2);
    expect(mockWriteSignalAuditTrail).toHaveBeenCalledTimes(2);
    expect(mockLogTierTransition).toHaveBeenCalledTimes(1);
    expect(mockLogTierTransition).toHaveBeenCalledWith(
      mockTx,
      TENANT_A_ID,
      STUDENT_A_ID,
      'profile-a',
      FIRST_ASSESSMENT,
      DEFAULT_CONFIG.routingRules,
    );
  });
});
