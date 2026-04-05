import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../../common/tests/mock-facades';
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

const mockConfigFacade = { findSettings: jest.fn() };

describe('ReportCardDeliveryService — deliver', () => {
  let service: ReportCardDeliveryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardDelivery.findFirst.mockReset().mockResolvedValue(null);
    mockRlsTx.reportCardDelivery.create
      .mockReset()
      .mockImplementation(({ data }: { data: { channel: string } }) =>
        Promise.resolve({ ...baseDelivery, channel: data.channel }),
      );
    mockConfigFacade.findSettings.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
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

  it('should default to email when settings have a non-whatsapp channel', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue({
      tenant_id: TENANT_ID,
      settings: { reportCards: { deliveryChannel: 'sms' } },
    });
    mockPrisma.reportCardDelivery.update.mockResolvedValue({
      ...baseDelivery,
      channel: 'in_app',
      status: 'sent',
    });

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    // 2 deliveries per parent: email (default) + in_app
    expect(result.delivered_count).toBe(2);
    const firstCall = mockRlsTx.reportCardDelivery.create.mock.calls[0] as [
      { data: { channel: string } },
    ];
    expect(firstCall[0].data.channel).toBe('email');
  });

  it('should default to email when settings has no reportCards key', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue({
      tenant_id: TENANT_ID,
      settings: {},
    });
    mockPrisma.reportCardDelivery.update.mockResolvedValue({
      ...baseDelivery,
      channel: 'in_app',
      status: 'sent',
    });

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    expect(result.delivered_count).toBe(2);
  });

  it('should handle in_app delivery update failure gracefully', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    // The post-tx update for in_app channel fails
    mockPrisma.reportCardDelivery.update.mockRejectedValue(new Error('DB error'));

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    // Should still return the deliveries despite the update failure
    expect(result.delivered_count).toBe(2);
  });

  it('should default to email when getDeliveryChannel throws', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      id: REPORT_CARD_ID,
      status: 'published',
      student: {
        id: 'student-1',
        student_parents: [{ parent_id: PARENT_ID_1 }],
      },
    });
    mockConfigFacade.findSettings.mockRejectedValue(new Error('settings error'));
    mockPrisma.reportCardDelivery.update.mockResolvedValue({
      ...baseDelivery,
      channel: 'in_app',
      status: 'sent',
    });

    const result = await service.deliver(TENANT_ID, REPORT_CARD_ID);

    // Should use 'email' as default, so 2 deliveries (email + in_app)
    expect(result.delivered_count).toBe(2);
    const firstCall = mockRlsTx.reportCardDelivery.create.mock.calls[0] as [
      { data: { channel: string } },
    ];
    expect(firstCall[0].data.channel).toBe('email');
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
    mockConfigFacade.findSettings.mockResolvedValue({
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
    const firstCall = mockRlsTx.reportCardDelivery.create.mock.calls[0] as [
      { data: { channel: string } },
    ];
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
        ...MOCK_FACADE_PROVIDERS,
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

  it('should handle non-Error thrown during delivery', async () => {
    // First card throws a string (non-Error object)
    mockPrisma.reportCard.findFirst.mockRejectedValueOnce('string error');

    const result = await service.bulkDeliver(TENANT_ID, [REPORT_CARD_ID]);

    expect(result.failed).toBe(1);
    expect(result.results[0]?.error).toBe('Unknown error');
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
        ...MOCK_FACADE_PROVIDERS,
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

// ─── getDeliveryStatus ───────────────────────────────────────────────────────

describe('ReportCardDeliveryService — getDeliveryStatus', () => {
  let service: ReportCardDeliveryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardDeliveryService>(ReportCardDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.getDeliveryStatus(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return delivery summary with status counts', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID });
    mockPrisma.reportCardDelivery.findMany.mockResolvedValue([
      {
        ...baseDelivery,
        id: 'd1',
        status: 'pending_delivery',
        parent: { id: PARENT_ID_1, first_name: 'Dad', last_name: 'Smith', email: 'd@e.com' },
      },
      {
        ...baseDelivery,
        id: 'd2',
        status: 'sent',
        parent: { id: PARENT_ID_1, first_name: 'Dad', last_name: 'Smith', email: 'd@e.com' },
      },
      {
        ...baseDelivery,
        id: 'd3',
        status: 'viewed',
        parent: { id: PARENT_ID_1, first_name: 'Dad', last_name: 'Smith', email: 'd@e.com' },
      },
      {
        ...baseDelivery,
        id: 'd4',
        status: 'failed',
        parent: { id: PARENT_ID_1, first_name: 'Dad', last_name: 'Smith', email: 'd@e.com' },
      },
    ]);

    const result = await service.getDeliveryStatus(TENANT_ID, REPORT_CARD_ID);

    expect(result.summary.total).toBe(4);
    expect(result.summary.pending).toBe(1);
    expect(result.summary.sent).toBe(1);
    expect(result.summary.viewed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.deliveries).toHaveLength(4);
  });

  it('should return empty summary when no deliveries exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ id: REPORT_CARD_ID });
    mockPrisma.reportCardDelivery.findMany.mockResolvedValue([]);

    const result = await service.getDeliveryStatus(TENANT_ID, REPORT_CARD_ID);

    expect(result.summary.total).toBe(0);
    expect(result.summary.pending).toBe(0);
    expect(result.summary.sent).toBe(0);
    expect(result.summary.viewed).toBe(0);
    expect(result.summary.failed).toBe(0);
  });
});
