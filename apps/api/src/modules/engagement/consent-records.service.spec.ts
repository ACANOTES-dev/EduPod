import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ConsentRecordsService } from './consent-records.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONSENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBMISSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TEMPLATE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACADEMIC_YEAR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  engagementConsentRecord: {
    update: jest.fn(),
  },
  engagementFormSubmission: {
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    engagementConsentRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const NOW = new Date('2026-03-01T12:00:00.000Z');

const baseConsentRecord = {
  id: CONSENT_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  consent_type: 'standing',
  form_template_id: TEMPLATE_ID,
  form_submission_id: SUBMISSION_ID,
  event_id: null,
  status: 'active',
  granted_at: new Date('2026-01-15'),
  expires_at: null,
  revoked_at: null,
  academic_year_id: ACADEMIC_YEAR_ID,
  created_at: new Date('2026-01-15'),
  updated_at: new Date('2026-01-15'),
};

const baseSubmissionSelect = {
  id: SUBMISSION_ID,
  status: 'acknowledged',
};

// ─── Tests: findAll ───────────────────────────────────────────────────────────

describe('ConsentRecordsService — findAll', () => {
  let service: ConsentRecordsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsentRecordsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ConsentRecordsService>(ConsentRecordsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated consent records with default filters', async () => {
    const records = [
      {
        ...baseConsentRecord,
        student: { first_name: 'Ali', last_name: 'Hassan' },
        form_template: { name: 'Photo Consent', form_type: 'consent_form' },
      },
    ];
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue(records);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toEqual(records);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('should apply student_id filter', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 10, student_id: STUDENT_ID });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student_id: STUDENT_ID }),
      }),
    );
  });

  it('should apply consent_type filter', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 10, consent_type: 'annual' });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ consent_type: 'annual' }),
      }),
    );
  });

  it('should apply status filter', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 10, status: 'revoked' });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'revoked' }),
      }),
    );
  });

  it('should apply form_type filter via nested form_template', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 10, form_type: 'consent_form' });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          form_template: { form_type: 'consent_form' },
        }),
      }),
    );
  });

  it('should apply date_from and date_to filters on granted_at', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 10,
      date_from: '2026-01-01',
      date_to: '2026-06-30',
    });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          granted_at: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-06-30'),
          },
        }),
      }),
    );
  });

  it('should calculate skip correctly for page > 1', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);
    mockPrisma.engagementConsentRecord.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 3, pageSize: 10 });

    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

// ─── Tests: findByStudent ─────────────────────────────────────────────────────

describe('ConsentRecordsService — findByStudent', () => {
  let service: ConsentRecordsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsentRecordsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ConsentRecordsService>(ConsentRecordsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all consent records for a student', async () => {
    const records = [
      {
        ...baseConsentRecord,
        form_template: { name: 'Photo Consent', form_type: 'consent_form' },
        form_submission: {
          id: SUBMISSION_ID,
          status: 'acknowledged',
          submitted_at: new Date('2026-01-15'),
        },
      },
    ];
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue(records);

    const result = await service.findByStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual(records);
    expect(mockPrisma.engagementConsentRecord.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
      include: {
        form_template: { select: { name: true, form_type: true } },
        form_submission: { select: { id: true, status: true, submitted_at: true } },
      },
      orderBy: { granted_at: 'desc' },
    });
  });

  it('should return empty array when student has no consent records', async () => {
    mockPrisma.engagementConsentRecord.findMany.mockResolvedValue([]);

    const result = await service.findByStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([]);
  });
});

// ─── Tests: revoke ────────────────────────────────────────────────────────────

describe('ConsentRecordsService — revoke', () => {
  let service: ConsentRecordsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.engagementConsentRecord.update.mockReset();
    mockRlsTx.engagementFormSubmission.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsentRecordsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ConsentRecordsService>(ConsentRecordsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should revoke a standing consent and update linked submission', async () => {
    const record = {
      ...baseConsentRecord,
      consent_type: 'standing',
      status: 'active',
      form_submission: { ...baseSubmissionSelect },
    };
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(record);

    const updatedConsent = { ...baseConsentRecord, status: 'revoked', revoked_at: NOW };
    mockRlsTx.engagementConsentRecord.update.mockResolvedValue(updatedConsent);
    mockRlsTx.engagementFormSubmission.update.mockResolvedValue({});

    const result = await service.revoke(TENANT_ID, CONSENT_ID, 'Parent withdrew consent');

    expect(result).toEqual(updatedConsent);
    expect(mockRlsTx.engagementConsentRecord.update).toHaveBeenCalledWith({
      where: { id: CONSENT_ID },
      data: expect.objectContaining({ status: 'revoked' }),
    });
    expect(mockRlsTx.engagementFormSubmission.update).toHaveBeenCalledWith({
      where: { id: SUBMISSION_ID },
      data: expect.objectContaining({
        status: 'revoked',
        revocation_reason: 'Parent withdrew consent',
      }),
    });
  });

  it('should revoke an annual consent', async () => {
    const record = {
      ...baseConsentRecord,
      consent_type: 'annual',
      status: 'active',
      form_submission: { ...baseSubmissionSelect },
    };
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(record);

    const updatedConsent = {
      ...baseConsentRecord,
      consent_type: 'annual',
      status: 'revoked',
      revoked_at: NOW,
    };
    mockRlsTx.engagementConsentRecord.update.mockResolvedValue(updatedConsent);
    mockRlsTx.engagementFormSubmission.update.mockResolvedValue({});

    const result = await service.revoke(TENANT_ID, CONSENT_ID);

    expect(result).toEqual(updatedConsent);
    expect(mockRlsTx.engagementConsentRecord.update).toHaveBeenCalledWith({
      where: { id: CONSENT_ID },
      data: expect.objectContaining({ status: 'revoked' }),
    });
    expect(mockRlsTx.engagementFormSubmission.update).toHaveBeenCalledWith({
      where: { id: SUBMISSION_ID },
      data: expect.objectContaining({
        status: 'revoked',
        revocation_reason: null,
      }),
    });
  });

  it('should throw NotFoundException when consent record does not exist', async () => {
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(null);

    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException for one_time consent', async () => {
    const record = {
      ...baseConsentRecord,
      consent_type: 'one_time',
      status: 'active',
      form_submission: { ...baseSubmissionSelect },
    };
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(record);

    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toThrow(BadRequestException);
    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ONE_TIME_CONSENT_NOT_REVOCABLE' }),
    });
  });

  it('should throw BadRequestException when consent is not active', async () => {
    const record = {
      ...baseConsentRecord,
      consent_type: 'standing',
      status: 'revoked',
      form_submission: { ...baseSubmissionSelect },
    };
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(record);

    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toThrow(BadRequestException);
    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONSENT_NOT_ACTIVE' }),
    });
  });

  it('should throw BadRequestException when consent is expired (not active)', async () => {
    const record = {
      ...baseConsentRecord,
      consent_type: 'annual',
      status: 'expired',
      form_submission: { ...baseSubmissionSelect },
    };
    mockPrisma.engagementConsentRecord.findFirst.mockResolvedValue(record);

    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toThrow(BadRequestException);
    await expect(service.revoke(TENANT_ID, CONSENT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONSENT_NOT_ACTIVE' }),
    });
  });
});
