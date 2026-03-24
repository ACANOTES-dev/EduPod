import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import {
  CreateCustomFieldDefDto,
  CustomFieldValueInput,
  ReportCardCustomFieldsService,
} from './report-card-custom-fields.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FIELD_DEF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REPORT_CARD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardCustomFieldDef: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  reportCardCustomFieldValue: {
    upsert: jest.fn(),
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
    reportCardCustomFieldDef: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    reportCard: {
      findFirst: jest.fn(),
    },
    reportCardCustomFieldValue: {
      findMany: jest.fn(),
    },
  };
}

const baseFieldDef = {
  id: FIELD_DEF_ID,
  tenant_id: TENANT_ID,
  name: 'conduct_rating',
  label: 'Conduct Rating',
  label_ar: 'تقييم السلوك',
  field_type: 'rating' as const,
  options_json: null,
  section_type: 'conduct' as const,
  display_order: 1,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── createFieldDef ───────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — createFieldDef', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardCustomFieldDef.create.mockReset().mockResolvedValue(baseFieldDef);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a field definition successfully', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(null);

    const dto: CreateCustomFieldDefDto = {
      name: 'conduct_rating',
      label: 'Conduct Rating',
      field_type: 'rating',
      section_type: 'conduct',
    };

    await service.createFieldDef(TENANT_ID, dto);

    expect(mockRlsTx.reportCardCustomFieldDef.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'conduct_rating',
          field_type: 'rating',
          section_type: 'conduct',
        }),
      }),
    );
  });

  it('should throw ConflictException when field name already exists', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(baseFieldDef);

    await expect(
      service.createFieldDef(TENANT_ID, {
        name: 'conduct_rating',
        label: 'Conduct Rating',
        field_type: 'rating',
        section_type: 'conduct',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should default display_order to 0 when not provided', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(null);

    await service.createFieldDef(TENANT_ID, {
      name: 'new_field',
      label: 'New Field',
      field_type: 'text',
      section_type: 'custom',
    });

    expect(mockRlsTx.reportCardCustomFieldDef.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ display_order: 0 }),
      }),
    );
  });
});

// ─── findAllFieldDefs ─────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — findAllFieldDefs', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all field definitions for the tenant', async () => {
    mockPrisma.reportCardCustomFieldDef.findMany.mockResolvedValue([baseFieldDef]);

    const result = await service.findAllFieldDefs(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.reportCardCustomFieldDef.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID },
      }),
    );
  });
});

// ─── findOneFieldDef ──────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — findOneFieldDef', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the field definition when found', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(baseFieldDef);

    const result = await service.findOneFieldDef(TENANT_ID, FIELD_DEF_ID);

    expect(result.id).toBe(FIELD_DEF_ID);
  });

  it('should throw NotFoundException when field def not found', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(null);

    await expect(service.findOneFieldDef(TENANT_ID, FIELD_DEF_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── removeFieldDef ───────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — removeFieldDef', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardCustomFieldDef.delete.mockReset().mockResolvedValue(baseFieldDef);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete the field def and return { deleted: true }', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(baseFieldDef);

    const result = await service.removeFieldDef(TENANT_ID, FIELD_DEF_ID);

    expect(result).toEqual({ deleted: true });
    expect(mockRlsTx.reportCardCustomFieldDef.delete).toHaveBeenCalledWith({
      where: { id: FIELD_DEF_ID },
    });
  });

  it('should throw NotFoundException when field def not found', async () => {
    mockPrisma.reportCardCustomFieldDef.findFirst.mockResolvedValue(null);

    await expect(service.removeFieldDef(TENANT_ID, FIELD_DEF_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── saveFieldValues ──────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — saveFieldValues', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardCustomFieldValue.upsert.mockReset().mockResolvedValue({
      id: 'value-1',
      tenant_id: TENANT_ID,
      report_card_id: REPORT_CARD_ID,
      field_def_id: FIELD_DEF_ID,
      value: '4',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should upsert values for each field', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });
    mockPrisma.reportCardCustomFieldDef.findMany.mockResolvedValue([{ id: FIELD_DEF_ID }]);

    const values: CustomFieldValueInput[] = [{ field_def_id: FIELD_DEF_ID, value: '4' }];

    const result = await service.saveFieldValues(TENANT_ID, REPORT_CARD_ID, USER_ID, values);

    expect(result.saved).toHaveLength(1);
    expect(mockRlsTx.reportCardCustomFieldValue.upsert).toHaveBeenCalledTimes(1);
    expect(mockRlsTx.reportCardCustomFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenant_id: TENANT_ID,
          report_card_id: REPORT_CARD_ID,
          field_def_id: FIELD_DEF_ID,
          value: '4',
        }),
      }),
    );
  });

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(
      service.saveFieldValues(TENANT_ID, REPORT_CARD_ID, USER_ID, []),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when report card is not draft', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
    });

    await expect(
      service.saveFieldValues(TENANT_ID, REPORT_CARD_ID, USER_ID, []),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when field_def_id does not belong to tenant', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });
    mockPrisma.reportCardCustomFieldDef.findMany.mockResolvedValue([]); // none found = invalid id

    await expect(
      service.saveFieldValues(TENANT_ID, REPORT_CARD_ID, USER_ID, [
        { field_def_id: 'foreign-id', value: 'x' },
      ]),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── getFieldValues ───────────────────────────────────────────────────────────

describe('ReportCardCustomFieldsService — getFieldValues', () => {
  let service: ReportCardCustomFieldsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardCustomFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardCustomFieldsService>(ReportCardCustomFieldsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return field values for a report card', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID });
    mockPrisma.reportCardCustomFieldValue.findMany.mockResolvedValue([
      {
        id: 'val-1',
        field_def: { id: FIELD_DEF_ID, name: 'conduct_rating', label: 'Conduct Rating' },
        value: '5',
      },
    ]);

    const result = await service.getFieldValues(TENANT_ID, REPORT_CARD_ID);

    expect(result.values).toHaveLength(1);
  });

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.getFieldValues(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
