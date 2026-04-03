/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  type RiskAssessment,
  type SignalResult,
  EARLY_WARNING_COMPUTE_STUDENT_JOB,
} from '@school/shared/early-warning';
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
import { ComputeStudentProcessor, type ComputeStudentPayload } from './compute-student.processor';
import { collectAllSignals } from './signal-collection.utils';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

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

const ASSESSMENT: RiskAssessment = {
  compositeScore: 42,
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
  summaryText: 'Risk score increased from 35 to 42.',
  tierChanged: true,
  trendData: [30, 35, 42],
};

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    student: {
      findFirst: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
    },
    studentRiskProfile: {
      findUnique: jest.fn().mockResolvedValue({
        risk_tier: 'yellow',
        trend_json: { dailyScores: [30, 35] },
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
  name: string = EARLY_WARNING_COMPUTE_STUDENT_JOB,
  data: Partial<ComputeStudentPayload> = {},
): Job<ComputeStudentPayload> {
  return {
    data: {
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      trigger_event: 'suspension',
      ...data,
    },
    name,
  } as Job<ComputeStudentPayload>;
}

describe('ComputeStudentProcessor', () => {
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
    mockCollectAllSignals.mockResolvedValue(SIGNALS);
    mockComputeRiskAssessment.mockReturnValue(ASSESSMENT);
    mockUpsertRiskProfile.mockResolvedValue('profile-id');
    mockWriteSignalAuditTrail.mockResolvedValue(undefined);
    mockLogTierTransition.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);

    await processor.process(buildJob('early-warning:other-job'));

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(EARLY_WARNING_COMPUTE_STUDENT_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should reject jobs without student_id', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(EARLY_WARNING_COMPUTE_STUDENT_JOB, { student_id: undefined })),
    ).rejects.toThrow('missing student_id');
  });

  it('should skip processing when early warning is disabled', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);
    mockLoadTenantConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      isEnabled: false,
    });

    await processor.process(buildJob());

    expect(mockTx.student.findFirst).not.toHaveBeenCalled();
    expect(mockCollectAllSignals).not.toHaveBeenCalled();
  });

  it('should skip when the student is missing or inactive', async () => {
    const mockTx = buildMockTx();
    mockTx.student.findFirst.mockResolvedValue(null);
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockGetActiveAcademicYear).not.toHaveBeenCalled();
    expect(mockCollectAllSignals).not.toHaveBeenCalled();
  });

  it('should skip when there is no active academic year', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);
    mockGetActiveAcademicYear.mockResolvedValue(null);

    await processor.process(buildJob());

    expect(mockCollectAllSignals).not.toHaveBeenCalled();
    expect(mockUpsertRiskProfile).not.toHaveBeenCalled();
  });

  it('should orchestrate signal collection, assessment, profile upsert, audit trail, and tier transition logging', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockCollectAllSignals).toHaveBeenCalledWith(
      mockTx,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    expect(mockComputeRiskAssessment).toHaveBeenCalledWith(
      SIGNALS,
      DEFAULT_CONFIG.weights,
      DEFAULT_CONFIG.thresholds,
      DEFAULT_CONFIG.hysteresisBuffer,
      'yellow',
      [30, 35],
    );
    expect(mockUpsertRiskProfile).toHaveBeenCalledWith(
      mockTx,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
      ASSESSMENT,
    );
    expect(mockWriteSignalAuditTrail).toHaveBeenCalledWith(
      mockTx,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
      ASSESSMENT.signals,
    );
    expect(mockLogTierTransition).toHaveBeenCalledWith(
      mockTx,
      TENANT_ID,
      STUDENT_ID,
      'profile-id',
      ASSESSMENT,
      DEFAULT_CONFIG.routingRules,
    );
  });

  it('should skip tier transition logging when the tier did not change', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new ComputeStudentProcessor(mockPrisma as never);
    mockComputeRiskAssessment.mockReturnValue({
      ...ASSESSMENT,
      tierChanged: false,
    });

    await processor.process(buildJob());

    expect(mockLogTierTransition).not.toHaveBeenCalled();
  });
});
