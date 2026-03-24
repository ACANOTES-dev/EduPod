import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardVerificationService } from './report-card-verification.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SAMPLE_TOKEN = 'a'.repeat(64);

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardVerificationToken: {
    create: jest.fn(),
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
    reportCard: {
      findFirst: jest.fn(),
    },
    reportCardVerificationToken: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

const baseVerificationToken = {
  id: 'token-1',
  tenant_id: TENANT_ID,
  report_card_id: REPORT_CARD_ID,
  token: SAMPLE_TOKEN,
  created_at: new Date(),
};

const publishedReportCard = {
  id: REPORT_CARD_ID,
  status: 'published',
  published_at: new Date('2026-01-15'),
  student: { first_name: 'Ahmad', last_name: 'Al-Rashidi' },
  academic_period: { name: 'Term 1 2025/26' },
};

// ─── generateToken ────────────────────────────────────────────────────────────

describe('ReportCardVerificationService — generateToken', () => {
  let service: ReportCardVerificationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardVerificationToken.create.mockReset().mockResolvedValue(
      baseVerificationToken,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardVerificationService>(ReportCardVerificationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should generate and persist a new token', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID, status: 'published' });
    mockPrisma.reportCardVerificationToken.findFirst.mockResolvedValue(null);

    const result = await service.generateToken(TENANT_ID, REPORT_CARD_ID);

    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
    expect(result.token).toHaveLength(64); // 32 bytes hex
    expect(mockRlsTx.reportCardVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          report_card_id: REPORT_CARD_ID,
        }),
      }),
    );
  });

  it('should be idempotent — return existing token when one already exists', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID, status: 'published' });
    mockPrisma.reportCardVerificationToken.findFirst.mockResolvedValue(baseVerificationToken);

    const result = await service.generateToken(TENANT_ID, REPORT_CARD_ID);

    expect(result.token).toBe(SAMPLE_TOKEN);
    // Should not create a new token
    expect(mockRlsTx.reportCardVerificationToken.create).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.generateToken(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should generate a unique 64-character hex token', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID, status: 'draft' });
    mockPrisma.reportCardVerificationToken.findFirst.mockResolvedValue(null);

    const result = await service.generateToken(TENANT_ID, REPORT_CARD_ID);

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── verify ───────────────────────────────────────────────────────────────────

describe('ReportCardVerificationService — verify', () => {
  let service: ReportCardVerificationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardVerificationService>(ReportCardVerificationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return verification info without grades when token is valid', async () => {
    mockPrisma.reportCardVerificationToken.findUnique.mockResolvedValue({
      ...baseVerificationToken,
      report_card: publishedReportCard,
      tenant: { name: 'Sunrise Academy' },
    });

    const result = await service.verify(SAMPLE_TOKEN);

    expect(result.valid).toBe(true);
    expect(result.school_name).toBe('Sunrise Academy');
    expect(result.student_name).toBe('Ahmad Al-Rashidi');
    expect(result.period_name).toBe('Term 1 2025/26');
    expect(result.published_at).toBeTruthy();
    // Must NOT include grade information
    expect(result).not.toHaveProperty('grades');
    expect(result).not.toHaveProperty('subjects');
    expect(result).not.toHaveProperty('snapshot_payload_json');
  });

  it('should throw NotFoundException when token does not exist', async () => {
    mockPrisma.reportCardVerificationToken.findUnique.mockResolvedValue(null);

    await expect(service.verify('invalid-token-xxxx')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when report card is not published', async () => {
    mockPrisma.reportCardVerificationToken.findUnique.mockResolvedValue({
      ...baseVerificationToken,
      report_card: { ...publishedReportCard, status: 'draft' },
      tenant: { name: 'Sunrise Academy' },
    });

    await expect(service.verify(SAMPLE_TOKEN)).rejects.toThrow(NotFoundException);
  });

  it('should return null for published_at when not set', async () => {
    mockPrisma.reportCardVerificationToken.findUnique.mockResolvedValue({
      ...baseVerificationToken,
      report_card: { ...publishedReportCard, published_at: null },
      tenant: { name: 'Sunrise Academy' },
    });

    const result = await service.verify(SAMPLE_TOKEN);

    expect(result.published_at).toBeNull();
  });
});
