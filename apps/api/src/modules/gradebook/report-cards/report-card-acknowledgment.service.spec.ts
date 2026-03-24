import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardAcknowledgment: {
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
    reportCardAcknowledgment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const baseAcknowledgment = {
  id: 'ack-1',
  tenant_id: TENANT_ID,
  report_card_id: REPORT_CARD_ID,
  parent_id: PARENT_ID,
  acknowledged_at: new Date('2026-01-20T10:00:00Z'),
  ip_address: '192.168.1.1',
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── acknowledge ──────────────────────────────────────────────────────────────

describe('ReportCardAcknowledgmentService — acknowledge', () => {
  let service: ReportCardAcknowledgmentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardAcknowledgment.create.mockReset().mockResolvedValue(baseAcknowledgment);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardAcknowledgmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardAcknowledgmentService>(ReportCardAcknowledgmentService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create an acknowledgment record', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
    });
    mockPrisma.reportCardAcknowledgment.findFirst.mockResolvedValue(null);

    const result = await service.acknowledge(TENANT_ID, REPORT_CARD_ID, PARENT_ID, '192.168.1.1');

    expect(mockRlsTx.reportCardAcknowledgment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          report_card_id: REPORT_CARD_ID,
          parent_id: PARENT_ID,
          ip_address: '192.168.1.1',
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'ack-1' });
  });

  it('should be idempotent — return existing acknowledgment on second call', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
    });
    mockPrisma.reportCardAcknowledgment.findFirst.mockResolvedValue(baseAcknowledgment);

    const result = await service.acknowledge(TENANT_ID, REPORT_CARD_ID, PARENT_ID);

    // Should not create a new record
    expect(mockRlsTx.reportCardAcknowledgment.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'ack-1' });
  });

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(
      service.acknowledge(TENANT_ID, REPORT_CARD_ID, PARENT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when report card is not published', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
    });

    await expect(
      service.acknowledge(TENANT_ID, REPORT_CARD_ID, PARENT_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('should store null ip_address when not provided', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
    });
    mockPrisma.reportCardAcknowledgment.findFirst.mockResolvedValue(null);

    await service.acknowledge(TENANT_ID, REPORT_CARD_ID, PARENT_ID);

    expect(mockRlsTx.reportCardAcknowledgment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ip_address: null }),
      }),
    );
  });
});

// ─── getAcknowledgmentStatus ──────────────────────────────────────────────────

describe('ReportCardAcknowledgmentService — getAcknowledgmentStatus', () => {
  let service: ReportCardAcknowledgmentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardAcknowledgmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardAcknowledgmentService>(ReportCardAcknowledgmentService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return correct status when all parents have acknowledged', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      student: {
        id: 'student-1',
        student_parents: [
          { parent: { id: PARENT_ID, first_name: 'Faisal', last_name: 'Al-Hamad' } },
          { parent: { id: PARENT_ID_2, first_name: 'Mariam', last_name: 'Al-Hamad' } },
        ],
      },
    });
    mockPrisma.reportCardAcknowledgment.findMany.mockResolvedValue([
      { parent_id: PARENT_ID, acknowledged_at: new Date() },
      { parent_id: PARENT_ID_2, acknowledged_at: new Date() },
    ]);

    const result = await service.getAcknowledgmentStatus(TENANT_ID, REPORT_CARD_ID);

    expect(result.total_parents).toBe(2);
    expect(result.acknowledged_count).toBe(2);
    expect(result.all_acknowledged).toBe(true);
    expect(result.parent_statuses).toHaveLength(2);
    expect(result.parent_statuses[0]?.acknowledged).toBe(true);
  });

  it('should return correct status when no parent has acknowledged', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      student: {
        id: 'student-1',
        student_parents: [
          { parent: { id: PARENT_ID, first_name: 'Faisal', last_name: 'Al-Hamad' } },
        ],
      },
    });
    mockPrisma.reportCardAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.getAcknowledgmentStatus(TENANT_ID, REPORT_CARD_ID);

    expect(result.total_parents).toBe(1);
    expect(result.acknowledged_count).toBe(0);
    expect(result.all_acknowledged).toBe(false);
    expect(result.parent_statuses[0]?.acknowledged).toBe(false);
    expect(result.parent_statuses[0]?.acknowledged_at).toBeNull();
  });

  it('should return all_acknowledged false when no parents exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      student: { id: 'student-1', student_parents: [] },
    });
    mockPrisma.reportCardAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.getAcknowledgmentStatus(TENANT_ID, REPORT_CARD_ID);

    expect(result.total_parents).toBe(0);
    expect(result.all_acknowledged).toBe(false);
  });

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(
      service.getAcknowledgmentStatus(TENANT_ID, REPORT_CARD_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
