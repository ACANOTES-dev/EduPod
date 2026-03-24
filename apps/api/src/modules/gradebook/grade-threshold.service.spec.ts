import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { GradeThresholdService, ThresholdEntry } from './report-cards/grade-threshold.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'config-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  gradeThresholdConfig: {
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    gradeThresholdConfig: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const sampleThresholds: ThresholdEntry[] = [
  { min_score: 90, label: 'Excellent', label_ar: 'ممتاز' },
  { min_score: 80, label: 'Very Good', label_ar: 'جيد جداً' },
  { min_score: 70, label: 'Good', label_ar: 'جيد' },
  { min_score: 60, label: 'Pass', label_ar: 'مقبول' },
  { min_score: 0, label: 'Fail', label_ar: 'راسب' },
];

const baseConfig = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  name: 'Standard Thresholds',
  thresholds_json: sampleThresholds,
  is_default: false,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── applyThreshold Tests ─────────────────────────────────────────────────────

describe('GradeThresholdService — applyThreshold', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeThresholdService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  it('should return "Excellent" for score 95', () => {
    const result = service.applyThreshold(95, sampleThresholds);
    expect(result).toEqual({ label: 'Excellent', label_ar: 'ممتاز' });
  });

  it('should return "Very Good" for score 85', () => {
    const result = service.applyThreshold(85, sampleThresholds);
    expect(result).toEqual({ label: 'Very Good', label_ar: 'جيد جداً' });
  });

  it('should return "Good" for score 70 (at boundary)', () => {
    const result = service.applyThreshold(70, sampleThresholds);
    expect(result).toEqual({ label: 'Good', label_ar: 'جيد' });
  });

  it('should return "Pass" for score 65', () => {
    const result = service.applyThreshold(65, sampleThresholds);
    expect(result).toEqual({ label: 'Pass', label_ar: 'مقبول' });
  });

  it('should return "Fail" for score 0', () => {
    const result = service.applyThreshold(0, sampleThresholds);
    expect(result).toEqual({ label: 'Fail', label_ar: 'راسب' });
  });

  it('should return "Excellent" for score exactly 90 (at boundary)', () => {
    const result = service.applyThreshold(90, sampleThresholds);
    expect(result).toEqual({ label: 'Excellent', label_ar: 'ممتاز' });
  });

  it('should return null when score is below all thresholds and no 0 entry', () => {
    const strictThresholds: ThresholdEntry[] = [
      { min_score: 60, label: 'Pass', label_ar: 'مقبول' },
    ];

    const result = service.applyThreshold(50, strictThresholds);
    expect(result).toBeNull();
  });

  it('should work correctly regardless of input order (sorts descending)', () => {
    // Provide thresholds in ascending order — service should still return correct label
    const unsortedThresholds: ThresholdEntry[] = [
      { min_score: 0, label: 'Fail', label_ar: 'راسب' },
      { min_score: 60, label: 'Pass', label_ar: 'مقبول' },
      { min_score: 90, label: 'Excellent', label_ar: 'ممتاز' },
    ];

    expect(service.applyThreshold(95, unsortedThresholds)).toEqual({
      label: 'Excellent', label_ar: 'ممتاز',
    });
    expect(service.applyThreshold(65, unsortedThresholds)).toEqual({
      label: 'Pass', label_ar: 'مقبول',
    });
    expect(service.applyThreshold(30, unsortedThresholds)).toEqual({
      label: 'Fail', label_ar: 'راسب',
    });
  });

  it('edge: empty threshold list returns null', () => {
    const result = service.applyThreshold(75, []);
    expect(result).toBeNull();
  });
});

// ─── CRUD Tests ───────────────────────────────────────────────────────────────

describe('GradeThresholdService — create', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.gradeThresholdConfig.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.gradeThresholdConfig.create.mockReset().mockResolvedValue(baseConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeThresholdService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a threshold config successfully', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null); // No duplicate

    await service.create(TENANT_ID, {
      name: 'Standard Thresholds',
      thresholds_json: sampleThresholds,
    });

    expect(mockRlsTx.gradeThresholdConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Standard Thresholds',
          is_default: false,
        }),
      }),
    );
  });

  it('should clear other defaults when is_default is true', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await service.create(TENANT_ID, {
      name: 'New Default',
      thresholds_json: sampleThresholds,
      is_default: true,
    });

    expect(mockRlsTx.gradeThresholdConfig.updateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, is_default: true },
      data: { is_default: false },
    });
  });

  it('should throw ConflictException when name already exists', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(baseConfig);

    await expect(
      service.create(TENANT_ID, {
        name: 'Standard Thresholds',
        thresholds_json: sampleThresholds,
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('GradeThresholdService — findOne', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeThresholdService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return config when found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(baseConfig);

    const result = await service.findOne(TENANT_ID, CONFIG_ID);

    expect(result.id).toBe(CONFIG_ID);
  });

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(TENANT_ID, CONFIG_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GradeThresholdService — update', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.gradeThresholdConfig.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.gradeThresholdConfig.update.mockReset().mockResolvedValue(baseConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeThresholdService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update the config name', async () => {
    mockPrisma.gradeThresholdConfig.findFirst
      .mockResolvedValueOnce(baseConfig) // found for validation
      .mockResolvedValueOnce(null); // no name conflict

    await service.update(TENANT_ID, CONFIG_ID, { name: 'Renamed Config' });

    expect(mockRlsTx.gradeThresholdConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONFIG_ID },
        data: expect.objectContaining({ name: 'Renamed Config' }),
      }),
    );
  });

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, CONFIG_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when renaming to an existing name', async () => {
    mockPrisma.gradeThresholdConfig.findFirst
      .mockResolvedValueOnce(baseConfig) // found
      .mockResolvedValueOnce({ id: 'other-config', name: 'New Name' }); // conflict

    await expect(
      service.update(TENANT_ID, CONFIG_ID, { name: 'New Name' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('GradeThresholdService — remove', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.gradeThresholdConfig.delete.mockReset().mockResolvedValue(baseConfig);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeThresholdService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete the config and return { deleted: true }', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(baseConfig);

    const result = await service.remove(TENANT_ID, CONFIG_ID);

    expect(result).toEqual({ deleted: true });
    expect(mockRlsTx.gradeThresholdConfig.delete).toHaveBeenCalledWith({
      where: { id: CONFIG_ID },
    });
  });

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.remove(TENANT_ID, CONFIG_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
