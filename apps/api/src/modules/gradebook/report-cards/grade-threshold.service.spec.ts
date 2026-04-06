/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import { PrismaService } from '../../prisma/prisma.service';

import { GradeThresholdService } from './grade-threshold.service';
import type { ThresholdEntry } from './grade-threshold.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'config-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  gradeThresholdConfig: {
    create: jest.fn().mockResolvedValue({ id: CONFIG_ID, name: 'Default' }),
    update: jest.fn().mockResolvedValue({ id: CONFIG_ID, name: 'Updated' }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn().mockResolvedValue({ id: CONFIG_ID }),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    gradeThresholdConfig: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const sampleThresholds: ThresholdEntry[] = [
  { min_score: 90, label: 'Excellent', label_ar: 'ممتاز' },
  { min_score: 75, label: 'Very Good', label_ar: 'جيد جدا' },
  { min_score: 60, label: 'Good', label_ar: 'جيد' },
  { min_score: 50, label: 'Pass', label_ar: 'مقبول' },
  { min_score: 0, label: 'Fail', label_ar: 'راسب' },
];

// ─── create Tests ────────────────────────────────────────────────────────────

describe('GradeThresholdService — create', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.gradeThresholdConfig.create
      .mockReset()
      .mockResolvedValue({ id: CONFIG_ID, name: 'Default' });
    mockRlsTx.gradeThresholdConfig.updateMany.mockReset().mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ConflictException when name already exists', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue({
      id: 'existing',
      name: 'Default',
    });

    await expect(
      service.create(TENANT_ID, { name: 'Default', thresholds_json: sampleThresholds }),
    ).rejects.toThrow(ConflictException);
  });

  it('should create threshold config successfully', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    const result = await service.create(TENANT_ID, {
      name: 'Default',
      thresholds_json: sampleThresholds,
    });

    expect(result.id).toBe(CONFIG_ID);
    expect(mockRlsTx.gradeThresholdConfig.create).toHaveBeenCalled();
  });

  it('should clear existing default when is_default=true', async () => {
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
});

// ─── findAll Tests ───────────────────────────────────────────────────────────

describe('GradeThresholdService — findAll', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all configs for tenant', async () => {
    mockPrisma.gradeThresholdConfig.findMany.mockResolvedValue([
      { id: CONFIG_ID, name: 'Default', is_default: true },
    ]);

    const result = await service.findAll(TENANT_ID);

    expect(result).toHaveLength(1);
  });
});

// ─── findOne Tests ───────────────────────────────────────────────────────────

describe('GradeThresholdService — findOne', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, CONFIG_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return config when found', async () => {
    const config = { id: CONFIG_ID, name: 'Default', is_default: true };
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(config);

    const result = await service.findOne(TENANT_ID, CONFIG_ID);

    expect(result.id).toBe(CONFIG_ID);
  });
});

// ─── update Tests ────────────────────────────────────────────────────────────

describe('GradeThresholdService — update', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.gradeThresholdConfig.update
      .mockReset()
      .mockResolvedValue({ id: CONFIG_ID, name: 'Updated' });
    mockRlsTx.gradeThresholdConfig.updateMany.mockReset().mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, CONFIG_ID, { name: 'Updated' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when new name conflicts', async () => {
    mockPrisma.gradeThresholdConfig.findFirst
      .mockResolvedValueOnce({ id: CONFIG_ID, name: 'Old Name' })
      .mockResolvedValueOnce({ id: 'other-id', name: 'Updated' });

    await expect(service.update(TENANT_ID, CONFIG_ID, { name: 'Updated' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should update successfully', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValueOnce({
      id: CONFIG_ID,
      name: 'Old Name',
    });

    const result = await service.update(TENANT_ID, CONFIG_ID, { name: 'Updated' });

    expect(result.id).toBe(CONFIG_ID);
  });

  it('should clear other defaults when is_default is set to true', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValueOnce({
      id: CONFIG_ID,
      name: 'Old Name',
    });

    await service.update(TENANT_ID, CONFIG_ID, { is_default: true });

    expect(mockRlsTx.gradeThresholdConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          is_default: true,
          id: { not: CONFIG_ID },
        }),
        data: { is_default: false },
      }),
    );
  });

  it('should update thresholds_json when provided', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValueOnce({
      id: CONFIG_ID,
      name: 'Old Name',
    });

    const newThresholds: ThresholdEntry[] = [
      { min_score: 80, label: 'Pass', label_ar: 'ناجح' },
      { min_score: 0, label: 'Fail', label_ar: 'راسب' },
    ];

    await service.update(TENANT_ID, CONFIG_ID, { thresholds_json: newThresholds });

    expect(mockRlsTx.gradeThresholdConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thresholds_json: newThresholds,
        }),
      }),
    );
  });
});

// ─── remove Tests ────────────────────────────────────────────────────────────

describe('GradeThresholdService — remove', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.gradeThresholdConfig.delete.mockReset().mockResolvedValue({ id: CONFIG_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when config not found', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, CONFIG_ID)).rejects.toThrow(NotFoundException);
  });

  it('should delete and return { deleted: true }', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });

    const result = await service.remove(TENANT_ID, CONFIG_ID);

    expect(result).toEqual({ deleted: true });
    expect(mockRlsTx.gradeThresholdConfig.delete).toHaveBeenCalledWith({
      where: { id: CONFIG_ID },
    });
  });
});

// ─── applyThreshold Tests ────────────────────────────────────────────────────

describe('GradeThresholdService — applyThreshold', () => {
  let service: GradeThresholdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: buildMockPrisma() }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return Excellent for score >= 90', () => {
    const result = service.applyThreshold(95, sampleThresholds);

    expect(result?.label).toBe('Excellent');
    expect(result?.label_ar).toBe('ممتاز');
  });

  it('should return Very Good for score >= 75 and < 90', () => {
    const result = service.applyThreshold(80, sampleThresholds);

    expect(result?.label).toBe('Very Good');
  });

  it('should return Pass for score = 50', () => {
    const result = service.applyThreshold(50, sampleThresholds);

    expect(result?.label).toBe('Pass');
  });

  it('should return Fail for score = 0', () => {
    const result = service.applyThreshold(0, sampleThresholds);

    expect(result?.label).toBe('Fail');
  });

  it('should return null when no threshold matches (negative score)', () => {
    const result = service.applyThreshold(-5, [{ min_score: 0, label: 'Fail', label_ar: 'راسب' }]);

    expect(result).toBeNull();
  });
});

// ─── getDefaultConfig Tests ──────────────────────────────────────────────────

describe('GradeThresholdService — getDefaultConfig', () => {
  let service: GradeThresholdService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeThresholdService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeThresholdService>(GradeThresholdService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return null when no default config exists', async () => {
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(null);

    const result = await service.getDefaultConfig(TENANT_ID);

    expect(result).toBeNull();
  });

  it('should return the default config', async () => {
    const config = { id: CONFIG_ID, name: 'Default', is_default: true };
    mockPrisma.gradeThresholdConfig.findFirst.mockResolvedValue(config);

    const result = await service.getDefaultConfig(TENANT_ID);

    expect(result?.id).toBe(CONFIG_ID);
  });
});
