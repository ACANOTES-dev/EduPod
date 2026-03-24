import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardDeliveryService } from './report-card-delivery.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DELIVERY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardDelivery: {
    findFirst: jest.fn(),
    create: jest.fn(),
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
    reportCard: {
      findFirst: jest.fn(),
    },
    reportCardDelivery: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    tenantSetting: {
      findUnique: jest.fn(),
    },
  };
}

const baseDelivery = {
  id: DELIVERY_ID,
  tenant_id: TENANT_ID,
  report_card_id: REPORT_CARD_ID,
  parent_id: PARENT_ID_1,
  channel: 'email' as const,
  status: 'pending_delivery',
  sent_at: null,
  viewed_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── deliver ──────────────────────────────────────────────────────────────────

describe('ReportCardDeliveryService — deliver', () => {
  let service: ReportCardDeliveryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardDelivery.findFirst.mockReset().mockResolvedValue(null);
    mockRlsTx.reportCardDelivery.create.mockReset().mockImplementation(
      ({ data }: { data: { channel: string } }) => Promise.resolve({ ...baseDelivery, channel: data.channel }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardDeliveryService>(ReportCardDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.deliver(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when report card is not published', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'draft',
      student: { id: 'student-1', student_parents: [] },
    });

    await expect(service.deliver(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return delivered_count 0 when student has no parents', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: { id: 'student-1', student_parents: [] },
    });

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    expect(result.delivered_count).toBe(0);
    expect(result).toHaveProperty('message');
  });

  it('should create email + in_app deliveries for each parent', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockPrisma.tenantSetting.findUnique.mockResolvedValue(null); // defaults to email
    // in_app update after tx
    mockPrisma.reportCardDelivery.update.mockResolvedValue({
      ...baseDelivery,
      channel: 'in_app',
      status: 'sent',
    });

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    // 2 deliveries per parent: email + in_app
    expect(result.delivered_count).toBe(2);
    expect(mockRlsTx.reportCardDelivery.create).toHaveBeenCalledTimes(2);
  });

  it('should skip a parent when delivery record already exists', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
    // Already delivered
    mockRlsTx.reportCardDelivery.findFirst.mockResolvedValue(baseDelivery);

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    expect(result.delivered_count).toBe(0);
    expect(mockRlsTx.reportCardDelivery.create).not.toHaveBeenCalled();
  });

  it('should use whatsapp channel from tenant settings', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockPrisma.tenantSetting.findUnique.mockResolvedValue({
      tenant_id: TENANT_ID,
      settings: { reportCards: { deliveryChannel: 'whatsapp' } },
    });
    mockPrisma.reportCardDelivery.update.mockResolvedValue({
      ...baseDelivery,
      channel: 'in_app',
      status: 'sent',
    });

    await service.deliver(TENANT_ID, REPORT_CARD_ID);

    // First create call should be whatsapp
    const firstCall = mockRlsTx.reportCardDelivery.create.mock.calls[0] as [{ data: { channel: string } }];
    expect(firstCall[0].data.channel).toBe('whatsapp');
  });
});

// ─── bulkDeliver ──────────────────────────────────────────────────────────────

describe('ReportCardDeliveryService — bulkDeliver', () => {
  let service: ReportCardDeliveryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const RC_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardDelivery.findFirst.mockReset().mockResolvedValue(null);
    mockRlsTx.reportCardDelivery.create.mockReset().mockResolvedValue(baseDelivery);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardDeliveryService>(ReportCardDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should process multiple report cards and report successes and failures', async () => {
    mockPrisma.reportCard.findFirst
      .mockResolvedValueOnce({
        id: REPORT_CARD_ID,
        status: 'published',
        student: { id: 'student-1', student_parents: [] },
      })
      .mockResolvedValueOnce(null); // second card not found

    const result = await service.bulkDeliver(TENANT_ID, [REPORT_CARD_ID, RC_ID_2]);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2);
  });

  it('should return empty results for empty input', async () => {
    const result = await service.bulkDeliver(TENANT_ID, []);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ─── markViewed ───────────────────────────────────────────────────────────────

describe('ReportCardDeliveryService — markViewed', () => {
  let service: ReportCardDeliveryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardDelivery.update.mockReset().mockResolvedValue({
      ...baseDelivery,
      status: 'viewed',
      viewed_at: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardDeliveryService>(ReportCardDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark delivery as viewed', async () => {
    mockPrisma.reportCardDelivery.findFirst.mockResolvedValue(baseDelivery);

    const result = await service.markViewed(TENANT_ID, DELIVERY_ID);

    expect(mockRlsTx.reportCardDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DELIVERY_ID },
        data: expect.objectContaining({ status: 'viewed' }),
      }),
    );
    expect(result).toHaveProperty('status', 'viewed');
  });

  it('should return the existing delivery when already viewed (idempotent)', async () => {
    const alreadyViewed = { ...baseDelivery, status: 'viewed', viewed_at: new Date() };
    mockPrisma.reportCardDelivery.findFirst.mockResolvedValue(alreadyViewed);

    const result = await service.markViewed(TENANT_ID, DELIVERY_ID);

    expect(mockRlsTx.reportCardDelivery.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: DELIVERY_ID });
  });

  it('should throw NotFoundException when delivery not found', async () => {
    mockPrisma.reportCardDelivery.findFirst.mockResolvedValue(null);

    await expect(service.markViewed(TENANT_ID, DELIVERY_ID)).rejects.toThrow(NotFoundException);
  });
});
