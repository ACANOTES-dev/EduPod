import { Job } from 'bullmq';

import {
  GRADEBOOK_DETECT_RISKS_JOB,
  type GradebookRiskDetectionPayload,
  GradebookRiskDetectionProcessor,
} from './gradebook-risk-detection.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_A_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_B_ID = '44444444-4444-4444-4444-444444444444';
const STUDENT_C_ID = '55555555-5555-5555-5555-555555555555';
const STUDENT_D_ID = '66666666-6666-6666-6666-666666666666';
const STUDENT_E_ID = '77777777-7777-7777-7777-777777777777';
const SUBJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEACHER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

interface GradeRowInput {
  assessmentId: string;
  classId?: string;
  createdAt: string;
  enteredByUserId?: string;
  maxScore?: number;
  rawScore: number;
  studentId: string;
  subjectId?: string;
}

interface BuildMockTxOptions {
  consentedStudentIds?: string[];
  existingAlertKeys?: string[];
  gradeRows?: Array<ReturnType<typeof buildGradeRow>>;
  riskDetectionSettings?: Record<string, unknown>;
  students?: string[];
}

interface BuildMockPrismaOptions {
  failingTransactionCalls?: number[];
  tenants?: Array<{ id: string }>;
  txByCall?: Partial<Record<number, MockTx>>;
}

function buildGradeRow(input: GradeRowInput) {
  return {
    assessment: {
      class_id: input.classId ?? CLASS_ID,
      max_score: input.maxScore ?? 100,
      subject_id: input.subjectId ?? SUBJECT_ID,
    },
    assessment_id: input.assessmentId,
    created_at: new Date(input.createdAt),
    entered_by_user_id: input.enteredByUserId ?? TEACHER_ID,
    raw_score: input.rawScore,
    student_id: input.studentId,
  };
}

function alertKey(
  studentId: string,
  subjectId: string | null | undefined,
  alertType: string,
): string {
  return `${studentId}::${subjectId ?? 'null'}::${alertType}`;
}

function buildMockTx(options: BuildMockTxOptions = {}) {
  const existingAlertKeys = new Set(options.existingAlertKeys ?? []);

  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    consentRecord: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.consentedStudentIds ?? []).map((subject_id) => ({ subject_id })),
        ),
    },
    grade: {
      findMany: jest.fn().mockResolvedValue(options.gradeRows ?? []),
    },
    student: {
      findMany: jest.fn().mockResolvedValue((options.students ?? []).map((id) => ({ id }))),
    },
    studentAcademicRiskAlert: {
      create: jest.fn().mockResolvedValue({ id: 'risk-alert-id' }),
      findFirst: jest.fn().mockImplementation(
        async (args: {
          where: {
            alert_type: string;
            student_id: string;
            subject_id: string | null;
          };
        }) => {
          const key = alertKey(args.where.student_id, args.where.subject_id, args.where.alert_type);

          return existingAlertKeys.has(key) ? { id: `existing-${key}` } : null;
        },
      ),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          gradebook: {
            riskDetection: options.riskDetectionSettings ?? {},
          },
        },
      }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(defaultTx: MockTx, options: BuildMockPrismaOptions = {}) {
  let transactionCall = 0;
  const failingCalls = new Set(options.failingTransactionCalls ?? []);

  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => {
      transactionCall += 1;

      if (failingCalls.has(transactionCall)) {
        throw new Error(`transaction ${transactionCall} failed`);
      }

      const tx = options.txByCall?.[transactionCall] ?? defaultTx;
      return callback(tx);
    }),
    tenant: {
      findMany: jest.fn().mockResolvedValue(options.tenants ?? []),
    },
  };
}

function buildJob(
  name: string = GRADEBOOK_DETECT_RISKS_JOB,
  data: Partial<GradebookRiskDetectionPayload> = {},
): Job<GradebookRiskDetectionPayload> {
  return {
    data: {
      tenant_id: TENANT_A_ID,
      ...data,
    },
    name,
  } as Job<GradebookRiskDetectionPayload>;
}

describe('GradebookRiskDetectionProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should iterate all active tenants in cron mode and continue after a tenant failure', async () => {
    const successTx = buildMockTx({
      riskDetectionSettings: { enabled: false },
    });
    const mockPrisma = buildMockPrisma(successTx, {
      failingTransactionCalls: [1],
      tenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
    });
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await expect(
      processor.process(buildJob(GRADEBOOK_DETECT_RISKS_JOB, { tenant_id: undefined })),
    ).resolves.toBeUndefined();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(successTx.tenantSetting.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should keep tenant-specific reads isolated across cron iterations', async () => {
    const tenantATx = buildMockTx({
      gradeRows: [],
      riskDetectionSettings: { enabled: true },
    });
    const tenantBTx = buildMockTx({
      gradeRows: [],
      riskDetectionSettings: { enabled: true },
    });
    const mockPrisma = buildMockPrisma(tenantATx, {
      tenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
      txByCall: {
        1: tenantATx,
        2: tenantBTx,
      },
    });
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob(GRADEBOOK_DETECT_RISKS_JOB, { tenant_id: undefined }));

    expect(tenantATx.tenantSetting.findFirst).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_A_ID },
      select: { settings: true },
    });
    expect(tenantBTx.tenantSetting.findFirst).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_B_ID },
      select: { settings: true },
    });
    expect(tenantATx.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_A_ID }),
      }),
    );
    expect(tenantBTx.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_B_ID }),
      }),
    );
  });

  it('should skip tenant processing when risk detection is disabled', async () => {
    const mockTx = buildMockTx({
      riskDetectionSettings: { enabled: false },
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.grade.findMany).not.toHaveBeenCalled();
    expect(mockTx.studentAcademicRiskAlert.create).not.toHaveBeenCalled();
  });

  it('should create a high-risk alert when trajectory drop crosses the high threshold', async () => {
    const mockTx = buildMockTx({
      consentedStudentIds: [STUDENT_A_ID],
      gradeRows: [
        buildGradeRow({
          assessmentId: 'asm-1',
          createdAt: '2026-01-01T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-2',
          createdAt: '2026-01-08T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-3',
          createdAt: '2026-01-15T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-4',
          createdAt: '2026-01-22T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-5',
          createdAt: '2026-01-29T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-6',
          createdAt: '2026-02-05T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
      ],
      students: [STUDENT_A_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.studentAcademicRiskAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'at_risk_high',
        risk_level: 'high',
        student_id: STUDENT_A_ID,
        subject_id: SUBJECT_ID,
      }),
    });
  });

  it('should skip creating duplicate alerts that already exist for the same day', async () => {
    const mockTx = buildMockTx({
      consentedStudentIds: [STUDENT_A_ID],
      existingAlertKeys: [alertKey(STUDENT_A_ID, SUBJECT_ID, 'at_risk_high')],
      gradeRows: [
        buildGradeRow({
          assessmentId: 'asm-1',
          createdAt: '2026-01-01T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-2',
          createdAt: '2026-01-08T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-3',
          createdAt: '2026-01-15T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-4',
          createdAt: '2026-01-22T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-5',
          createdAt: '2026-01-29T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-6',
          createdAt: '2026-02-05T09:00:00.000Z',
          rawScore: 50,
          studentId: STUDENT_A_ID,
        }),
      ],
      students: [STUDENT_A_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.studentAcademicRiskAlert.findFirst).toHaveBeenCalled();
    const atRiskCreates = mockTx.studentAcademicRiskAlert.create.mock.calls
      .map(
        (call) =>
          (
            call[0] as {
              data: { alert_type: string };
            }
          ).data,
      )
      .filter((data) => data.alert_type === 'at_risk_high');

    expect(atRiskCreates).toHaveLength(0);
  });

  it('should create a score anomaly alert when one assessment is far from the student mean', async () => {
    const scoreRows = [80, 80, 80, 80, 0, 80, 80, 80, 80, 80].map((rawScore, index) =>
      buildGradeRow({
        assessmentId: `asm-${index + 1}`,
        createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
        rawScore,
        studentId: STUDENT_A_ID,
      }),
    );
    const mockTx = buildMockTx({
      consentedStudentIds: [STUDENT_A_ID],
      gradeRows: scoreRows,
      students: [STUDENT_A_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.studentAcademicRiskAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_type: 'score_anomaly',
        risk_level: 'low',
        student_id: STUDENT_A_ID,
        subject_id: SUBJECT_ID,
      }),
    });
  });

  it('should create class anomaly alerts for each consented student in the affected class', async () => {
    const mockTx = buildMockTx({
      consentedStudentIds: [STUDENT_A_ID, STUDENT_B_ID],
      gradeRows: [
        buildGradeRow({
          assessmentId: 'asm-1',
          createdAt: '2026-01-01T09:00:00.000Z',
          rawScore: 90,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-1',
          createdAt: '2026-01-01T09:05:00.000Z',
          rawScore: 80,
          studentId: STUDENT_B_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-2',
          createdAt: '2026-02-01T09:00:00.000Z',
          rawScore: 40,
          studentId: STUDENT_A_ID,
        }),
        buildGradeRow({
          assessmentId: 'asm-2',
          createdAt: '2026-02-01T09:05:00.000Z',
          rawScore: 30,
          studentId: STUDENT_B_ID,
        }),
      ],
      students: [STUDENT_A_ID, STUDENT_B_ID],
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    const classAnomalyCreates = mockTx.studentAcademicRiskAlert.create.mock.calls
      .map(
        (call) =>
          (
            call[0] as {
              data: { alert_type: string; student_id: string };
            }
          ).data,
      )
      .filter((data) => data.alert_type === 'class_anomaly');

    expect(classAnomalyCreates).toHaveLength(2);
    expect(classAnomalyCreates.map((data) => data.student_id)).toEqual(
      expect.arrayContaining([STUDENT_A_ID, STUDENT_B_ID]),
    );
  });

  it('should create grading pattern anomaly alerts when an assessment has suspiciously uniform scores', async () => {
    const studentIds = [STUDENT_A_ID, STUDENT_B_ID, STUDENT_C_ID, STUDENT_D_ID, STUDENT_E_ID];
    const mockTx = buildMockTx({
      consentedStudentIds: studentIds,
      gradeRows: studentIds.map((studentId, index) =>
        buildGradeRow({
          assessmentId: 'uniform-assessment',
          createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
          rawScore: 80,
          studentId,
        }),
      ),
      students: studentIds,
    });
    const mockPrisma = buildMockPrisma(mockTx);
    const processor = new GradebookRiskDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    const anomalyCreates = mockTx.studentAcademicRiskAlert.create.mock.calls
      .map(
        (call) =>
          (
            call[0] as {
              data: { alert_type: string; student_id: string };
            }
          ).data,
      )
      .filter((data) => data.alert_type === 'grading_pattern_anomaly');

    expect(anomalyCreates).toHaveLength(5);
    expect(anomalyCreates.map((data) => data.student_id)).toEqual(
      expect.arrayContaining(studentIds),
    );
  });
});
