import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import {
  ApprovalStep,
  CreateApprovalConfigDto,
  ReportCardApprovalService,
} from './report-card-approval.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONFIG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REPORT_CARD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const APPROVAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardApprovalConfig: {
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  reportCardApproval: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  reportCard: {
    update: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCardApprovalConfig: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    reportCard: {
      findFirst: jest.fn(),
    },
    reportCardApproval: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const sampleSteps: ApprovalStep[] = [
  { order: 1, role_key: 'class_teacher', label: 'Class Teacher', required: true },
  { order: 2, role_key: 'principal', label: 'Principal', required: true },
];

const baseConfig = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  name: 'Two-Step Approval',
  steps_json: sampleSteps,
  is_active: false,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── createConfig ─────────────────────────────────────────────────────────────

describe('ReportCardApprovalService — createConfig', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardApprovalConfig.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.reportCardApprovalConfig.create.mockReset().mockResolvedValue(baseConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create an approval config successfully', async () => {
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(null);

    const dto: CreateApprovalConfigDto = {
      name: 'Two-Step Approval',
      steps_json: sampleSteps,
    };

    await service.createConfig(TENANT_ID, dto);

    expect(mockRlsTx.reportCardApprovalConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Two-Step Approval',
          is_active: false,
        }),
      }),
    );
  });

  it('should deactivate other configs when is_active is true', async () => {
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(null);

    await service.createConfig(TENANT_ID, {
      name: 'Active Config',
      steps_json: sampleSteps,
      is_active: true,
    });

    expect(mockRlsTx.reportCardApprovalConfig.updateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, is_active: true },
      data: { is_active: false },
    });
  });

  it('should throw ConflictException when name already exists', async () => {
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(baseConfig);

    await expect(
      service.createConfig(TENANT_ID, { name: 'Two-Step Approval', steps_json: sampleSteps }),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── findOneConfig ────────────────────────────────────────────────────────────

describe('ReportCardApprovalService — findOneConfig', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return config when found', async () => {
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(baseConfig);

    const result = await service.findOneConfig(TENANT_ID, CONFIG_ID);

    expect(result.id).toBe(CONFIG_ID);
  });

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(null);

    await expect(service.findOneConfig(TENANT_ID, CONFIG_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── submitForApproval ────────────────────────────────────────────────────────

describe('ReportCardApprovalService — submitForApproval', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardApproval.create.mockReset().mockResolvedValue({
      id: APPROVAL_ID,
      status: 'pending',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create one approval record per step', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue({
      ...baseConfig,
      is_active: true,
      steps_json: sampleSteps,
    });

    const result = await service.submitForApproval(TENANT_ID, REPORT_CARD_ID);

    expect(result).toHaveProperty('approvals');
    // One create call per step
    expect(mockRlsTx.reportCardApproval.create).toHaveBeenCalledTimes(sampleSteps.length);
  });

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.submitForApproval(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when report card is not a draft', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
    });

    await expect(service.submitForApproval(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should throw ConflictException when already submitted', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });
    mockPrisma.reportCardApproval.count.mockResolvedValue(1);

    await expect(service.submitForApproval(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should return no-op message when no active approval config exists', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockPrisma.reportCardApprovalConfig.findFirst.mockResolvedValue(null);

    const result = await service.submitForApproval(TENANT_ID, REPORT_CARD_ID);

    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('approvals');
  });
});

// ─── approve ──────────────────────────────────────────────────────────────────

describe('ReportCardApprovalService — approve', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardApproval.update.mockReset().mockResolvedValue({
      id: APPROVAL_ID,
      status: 'approved',
      actioned_by_user_id: USER_ID,
      actioned_at: new Date(),
    });
    mockRlsTx.reportCardApproval.findMany.mockReset();
    mockRlsTx.reportCard.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should approve a step and not auto-publish when other steps are pending', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue({
      id: APPROVAL_ID,
      report_card_id: REPORT_CARD_ID,
      step_order: 1,
      status: 'pending',
      role_key: 'class_teacher',
    });
    mockRlsTx.reportCardApproval.findMany.mockResolvedValue([
      { status: 'approved' },
      { status: 'pending' }, // second step still pending
    ]);

    const result = await service.approve(TENANT_ID, APPROVAL_ID, USER_ID) as { auto_published: boolean; approval: unknown; report_card: unknown };

    expect(result.auto_published).toBe(false);
    expect(mockRlsTx.reportCard.update).not.toHaveBeenCalled();
  });

  it('should auto-publish the report card when all steps are approved', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue({
      id: APPROVAL_ID,
      report_card_id: REPORT_CARD_ID,
      step_order: 2,
      status: 'pending',
      role_key: 'principal',
    });
    mockRlsTx.reportCardApproval.findMany.mockResolvedValue([
      { status: 'approved' },
      { status: 'approved' }, // all approved
    ]);
    mockRlsTx.reportCard.update.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      published_at: new Date(),
    });

    const result = await service.approve(TENANT_ID, APPROVAL_ID, USER_ID) as { auto_published: boolean; approval: unknown; report_card: unknown };

    expect(result.auto_published).toBe(true);
    expect(mockRlsTx.reportCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REPORT_CARD_ID },
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
  });

  it('should throw NotFoundException when approval record not found', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue(null);

    await expect(service.approve(TENANT_ID, APPROVAL_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when approval is not pending', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue({
      id: APPROVAL_ID,
      status: 'approved',
    });

    await expect(service.approve(TENANT_ID, APPROVAL_ID, USER_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});

// ─── reject ───────────────────────────────────────────────────────────────────

describe('ReportCardApprovalService — reject', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardApproval.update.mockReset().mockResolvedValue({
      id: APPROVAL_ID,
      status: 'rejected',
    });
    mockRlsTx.reportCardApproval.updateMany.mockReset().mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject the step and cancel remaining pending steps', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue({
      id: APPROVAL_ID,
      report_card_id: REPORT_CARD_ID,
      status: 'pending',
    });

    const result = await service.reject(TENANT_ID, APPROVAL_ID, USER_ID, 'Missing signature') as { approval: { status: string } };

    expect(result.approval.status).toBe('rejected');
    expect(mockRlsTx.reportCardApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          report_card_id: REPORT_CARD_ID,
          status: 'pending',
          id: { not: APPROVAL_ID },
        }),
        data: { status: 'rejected', rejection_reason: 'Cancelled due to earlier rejection' },
      }),
    );
  });

  it('should throw NotFoundException when approval not found', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue(null);

    await expect(
      service.reject(TENANT_ID, APPROVAL_ID, USER_ID, 'reason'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when approval is not pending', async () => {
    mockPrisma.reportCardApproval.findFirst.mockResolvedValue({
      id: APPROVAL_ID,
      status: 'rejected',
    });

    await expect(
      service.reject(TENANT_ID, APPROVAL_ID, USER_ID, 'reason'),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── bulkApprove ──────────────────────────────────────────────────────────────

describe('ReportCardApprovalService — bulkApprove', () => {
  let service: ReportCardApprovalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const APPROVAL_ID_2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardApproval.update.mockReset().mockResolvedValue({ id: APPROVAL_ID, status: 'approved' });
    mockRlsTx.reportCardApproval.findMany.mockReset().mockResolvedValue([
      { status: 'approved' },
    ]);
    mockRlsTx.reportCard.update.mockReset().mockResolvedValue({ id: REPORT_CARD_ID, status: 'published' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardApprovalService>(ReportCardApprovalService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should report success count and failure count', async () => {
    // First approval succeeds
    mockPrisma.reportCardApproval.findFirst
      .mockResolvedValueOnce({ id: APPROVAL_ID, report_card_id: REPORT_CARD_ID, status: 'pending', role_key: 'teacher' })
      // Second approval not found → fails
      .mockResolvedValueOnce(null);

    const result = await service.bulkApprove(TENANT_ID, [APPROVAL_ID, APPROVAL_ID_2], USER_ID);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2);
  });

  it('should return empty results for empty input', async () => {
    const result = await service.bulkApprove(TENANT_ID, [], USER_ID);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
