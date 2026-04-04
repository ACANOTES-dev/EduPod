/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffSurvey: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  surveyQuestion: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  surveyResponse: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  surveyParticipationToken: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  staffProfile: {
    groupBy: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    findFirst: jest.fn(),
  },
  schedule: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  schedulePeriodTemplate: {
    findMany: jest.fn(),
  },
  teacherAbsence: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  substitutionRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

const mockCreateRlsClient = jest.fn().mockReturnValue({
  $transaction: jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
});

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: mockCreateRlsClient,
}));

import { BoardReportService } from '../services/board-report.service';
import { HmacService } from '../services/hmac.service';
import { SurveyResultsService } from '../services/survey-results.service';
import { SurveyService } from '../services/survey.service';
import { WorkloadAggregateService } from '../services/workload-aggregate.service';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';
import { WorkloadDataService } from '../services/workload-data.service';
import { WorkloadMetricsService } from '../services/workload-metrics.service';
import { WorkloadPersonalService } from '../services/workload-personal.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SURVEY_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const STAFF_PROFILE_ID = '33333333-3333-3333-3333-333333333333';

// ─── Dependency Mocks ───────────────────────────────────────────────────────

const mockPrisma = {} as PrismaService;

const mockHmacService = {
  computeTokenHash: jest.fn().mockResolvedValue('fake-hash'),
};

const mockAuditLogService = {
  write: jest.fn().mockResolvedValue(undefined),
};

const mockWorkloadCacheService = {
  getCachedPersonal: jest.fn().mockResolvedValue(null),
  setCachedPersonal: jest.fn().mockResolvedValue(undefined),
  getCachedAggregate: jest.fn().mockResolvedValue(null),
  setCachedAggregate: jest.fn().mockResolvedValue(undefined),
};

const mockWellbeingQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('G1 — Cross-Tenant Isolation', () => {
  let surveyService: SurveyService;
  let surveyResultsService: SurveyResultsService;
  let workloadComputeService: WorkloadComputeService;
  let boardReportService: BoardReportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        SurveyResultsService,
        WorkloadDataService,
        WorkloadMetricsService,
        WorkloadPersonalService,
        WorkloadAggregateService,
        WorkloadComputeService,
        BoardReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HmacService, useValue: mockHmacService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: WorkloadCacheService, useValue: mockWorkloadCacheService },
        { provide: 'BullQueue_wellbeing', useValue: mockWellbeingQueue },
      ],
    }).compile();

    surveyService = module.get(SurveyService);
    surveyResultsService = module.get(SurveyResultsService);
    workloadComputeService = module.get(WorkloadComputeService);
    boardReportService = module.get(BoardReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. Survey results — cross-tenant ────────────────────────────────────

  it('should throw NotFoundException when Tenant B requests results for Tenant A survey', async () => {
    // RLS-scoped findFirst returns null — Tenant A's survey is invisible to Tenant B
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    await expect(surveyResultsService.getResults(TENANT_B_ID, SURVEY_ID)).rejects.toThrow(
      NotFoundException,
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 2. Survey detail — cross-tenant ─────────────────────────────────────

  it('should throw NotFoundException when Tenant B requests detail for Tenant A survey', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    await expect(surveyService.findOne(TENANT_B_ID, SURVEY_ID)).rejects.toThrow(NotFoundException);

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 3. Moderation queue — cross-tenant ──────────────────────────────────

  it('should throw NotFoundException when Tenant B requests moderation queue for Tenant A survey', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    await expect(surveyResultsService.listModerationQueue(TENANT_B_ID, SURVEY_ID)).rejects.toThrow(
      NotFoundException,
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 4. Moderated comments — cross-tenant ────────────────────────────────

  it('should throw NotFoundException when Tenant B requests moderated comments for Tenant A survey', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    await expect(surveyResultsService.getModeratedComments(TENANT_B_ID, SURVEY_ID)).rejects.toThrow(
      NotFoundException,
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 5. Active survey — cross-tenant ─────────────────────────────────────

  it('should return null when Tenant B has no active survey (Tenant A does)', async () => {
    // RLS scopes to Tenant B — no active survey found
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    const result = await surveyService.getActiveSurvey(TENANT_B_ID, USER_ID);

    expect(result).toBeNull();

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 6. Submit response — cross-tenant ───────────────────────────────────

  it('should throw NotFoundException when Tenant B submits response to Tenant A survey', async () => {
    // RLS-scoped findFirst for the survey returns null
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

    const dto = {
      answers: [
        {
          question_id: '44444444-4444-4444-4444-444444444444',
          answer_value: 4,
        },
      ],
    };

    await expect(
      surveyService.submitResponse(TENANT_B_ID, SURVEY_ID, USER_ID, dto),
    ).rejects.toThrow(NotFoundException);

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 7. Personal workload — cross-tenant RLS verification ────────────────

  it('should invoke createRlsClient with TENANT_B_ID for personal workload summary', async () => {
    // No academic year found — returns empty/default summary
    mockRlsTx.academicYear.findFirst.mockResolvedValue(null);

    const result = await workloadComputeService.getPersonalWorkloadSummary(
      TENANT_B_ID,
      STAFF_PROFILE_ID,
    );

    // Service returns the empty default when no academic year exists
    expect(result).toEqual(
      expect.objectContaining({
        teaching_periods_per_week: 0,
        cover_duties_this_term: 0,
        status: 'normal',
      }),
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 8. Aggregate workload — cross-tenant RLS verification ───────────────

  it('should invoke createRlsClient with TENANT_B_ID for aggregate workload summary', async () => {
    // No academic year found — returns empty/default summary
    mockRlsTx.academicYear.findFirst.mockResolvedValue(null);

    const result = await workloadComputeService.getAggregateWorkloadSummary(TENANT_B_ID);

    expect(result).toEqual(
      expect.objectContaining({
        average_teaching_periods: 0,
        over_allocated_periods_count: 0,
      }),
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });

  // ─── 9. Board report — cross-tenant RLS verification ─────────────────────

  it('should invoke createRlsClient with TENANT_B_ID for board report generation', async () => {
    // resolveAcademicContext uses createRlsClient internally — mock the academic year lookup
    // to return null so the service throws NotFoundException. This still validates that
    // createRlsClient was called with TENANT_B_ID.
    mockRlsTx.academicYear.findFirst.mockResolvedValue(null);

    await expect(boardReportService.generateTermlySummary(TENANT_B_ID)).rejects.toThrow(
      NotFoundException,
    );

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_B_ID,
    });
  });
});
