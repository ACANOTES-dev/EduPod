import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertHistoryService } from './alert-history.service';
import { AlertRoutingService } from './alert-routing.service';

const ALERT_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const FIRED_AT = new Date('2026-05-15T10:00:00.000Z');

const ALERT = {
  id: ALERT_ID,
  rule_id: RULE_ID,
  severity: 'critical',
  message: 'Latency breached',
  metric_value: new Prisma.Decimal(600),
  channels_notified: ['email'],
  status: 'fired',
  fired_at: FIRED_AT,
  acknowledged_at: null,
  resolved_at: null,
  acknowledged_by: null,
};

function buildMockPrisma() {
  return {
    platformAlertHistory: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('AlertHistoryService', () => {
  let service: AlertHistoryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAlertRoutingService: { acknowledge: jest.Mock };
  let mockPlatformAuditService: { log: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T10:05:00.000Z'));
    mockPrisma = buildMockPrisma();
    mockAlertRoutingService = {
      acknowledge: jest.fn().mockResolvedValue({
        ...ALERT,
        status: 'acknowledged',
        acknowledged_at: new Date('2026-05-15T10:05:00.000Z'),
        acknowledged_by: USER_ID,
      }),
    };
    mockPlatformAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertHistoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformAuditService, useValue: mockPlatformAuditService },
        { provide: AlertRoutingService, useValue: mockAlertRoutingService },
      ],
    }).compile();

    service = module.get<AlertHistoryService>(AlertHistoryService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('lists alert history with filters and pagination', async () => {
    const row = { ...ALERT, rule: { name: 'PostgreSQL latency' } };
    mockPrisma.platformAlertHistory.findMany.mockResolvedValueOnce([row]);
    mockPrisma.platformAlertHistory.count.mockResolvedValueOnce(1);

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        rule_id: RULE_ID,
        severity: 'critical',
        status: 'fired',
      }),
    ).resolves.toEqual({
      data: [row],
      meta: { page: 2, pageSize: 10, total: 1 },
    });

    expect(mockPrisma.platformAlertHistory.findMany).toHaveBeenCalledWith({
      where: { status: 'fired', severity: 'critical', rule_id: RULE_ID },
      orderBy: { fired_at: 'desc' },
      skip: 10,
      take: 10,
      include: { rule: { select: { name: true } } },
    });
  });

  it('acknowledges fired alerts', async () => {
    mockPrisma.platformAlertHistory.findUnique.mockResolvedValueOnce(ALERT);
    await expect(service.acknowledge(ALERT_ID, USER_ID)).resolves.toMatchObject({
      status: 'acknowledged',
      acknowledged_by: USER_ID,
    });

    expect(mockAlertRoutingService.acknowledge).toHaveBeenCalledWith({
      alert_history_id: ALERT_ID,
      comment: undefined,
      user_id: USER_ID,
    });
  });

  it('throws when acknowledging a missing alert', async () => {
    mockPrisma.platformAlertHistory.findUnique.mockResolvedValueOnce(null);

    await expect(service.acknowledge(ALERT_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when acknowledging a non-fired alert', async () => {
    mockPrisma.platformAlertHistory.findUnique.mockResolvedValueOnce({
      ...ALERT,
      status: 'resolved',
    });

    await expect(service.acknowledge(ALERT_ID, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
