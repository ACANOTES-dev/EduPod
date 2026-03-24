import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { CompetencyScaleService } from './competency-scale.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCALE_ID = 'scale-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  competencyScale: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    competencyScale: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const baseScale = {
  id: SCALE_ID,
  tenant_id: TENANT_ID,
  name: 'Default Scale',
  levels_json: [
    { label: 'Beginning', threshold_min: 0 },
    { label: 'Developing', threshold_min: 40 },
    { label: 'Proficient', threshold_min: 70 },
    { label: 'Mastered', threshold_min: 90 },
  ],
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── create Tests ─────────────────────────────────────────────────────────────

describe('CompetencyScaleService — create', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.competencyScale.create.mockReset().mockResolvedValue(baseScale);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a scale with the given name and levels', async () => {
    const levels = [
      { label: 'Beginner', threshold_min: 0 },
      { label: 'Advanced', threshold_min: 80 },
    ];

    await service.create(TENANT_ID, { name: 'Custom Scale', levels });

    expect(mockRlsTx.competencyScale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Custom Scale',
        }),
      }),
    );
  });
});

// ─── list Tests ───────────────────────────────────────────────────────────────

describe('CompetencyScaleService — list', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all scales for the tenant', async () => {
    mockPrisma.competencyScale.findMany.mockResolvedValue([baseScale]);

    const result = await service.list(TENANT_ID);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe('Default Scale');
  });

  it('should return empty list when no scales exist', async () => {
    mockPrisma.competencyScale.findMany.mockResolvedValue([]);

    const result = await service.list(TENANT_ID);

    expect(result.data).toHaveLength(0);
  });
});

// ─── findOne Tests ────────────────────────────────────────────────────────────

describe('CompetencyScaleService — findOne', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return scale when found', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue(baseScale);

    const result = await service.findOne(TENANT_ID, SCALE_ID);

    expect(result.id).toBe(SCALE_ID);
  });

  it('should throw NotFoundException when scale does not exist', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(TENANT_ID, SCALE_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── update Tests ─────────────────────────────────────────────────────────────

describe('CompetencyScaleService — update', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.competencyScale.update.mockReset().mockResolvedValue(baseScale);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when scale does not exist', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, SCALE_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should update scale name', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue({ id: SCALE_ID });

    await service.update(TENANT_ID, SCALE_ID, { name: 'Renamed Scale' });

    expect(mockRlsTx.competencyScale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SCALE_ID },
        data: expect.objectContaining({ name: 'Renamed Scale' }),
      }),
    );
  });
});

// ─── delete Tests ─────────────────────────────────────────────────────────────

describe('CompetencyScaleService — delete', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.competencyScale.delete.mockReset().mockResolvedValue(baseScale);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when scale does not exist', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue(null);

    await expect(
      service.delete(TENANT_ID, SCALE_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete the scale when found', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue({ id: SCALE_ID });

    await service.delete(TENANT_ID, SCALE_ID);

    expect(mockRlsTx.competencyScale.delete).toHaveBeenCalledWith({
      where: { id: SCALE_ID },
    });
  });
});

// ─── ensureDefaultScale Tests ─────────────────────────────────────────────────

describe('CompetencyScaleService — ensureDefaultScale', () => {
  let service: CompetencyScaleService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.competencyScale.create.mockReset().mockResolvedValue(baseScale);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyScaleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompetencyScaleService>(CompetencyScaleService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return existing scale without creating when one exists', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue({ id: SCALE_ID });

    await service.ensureDefaultScale(TENANT_ID);

    expect(mockRlsTx.competencyScale.create).not.toHaveBeenCalled();
  });

  it('should create a default scale when none exists', async () => {
    mockPrisma.competencyScale.findFirst.mockResolvedValue(null);

    await service.ensureDefaultScale(TENANT_ID);

    expect(mockRlsTx.competencyScale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Default Scale',
        }),
      }),
    );
  });
});
