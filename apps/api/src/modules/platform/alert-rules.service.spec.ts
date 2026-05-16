import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { CreateAlertRuleDto } from '@school/shared';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertRulesService } from './alert-rules.service';

const RULE_ID = '11111111-1111-4111-8111-111111111111';

const CREATE_DTO: CreateAlertRuleDto = {
  name: 'PostgreSQL latency',
  metric: 'component_latency',
  condition_config: {
    component: 'postgresql',
    operator: 'gt',
    threshold: 500,
    duration_minutes: 2,
  },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  is_security_critical: false,
  notify_emails: ['ops@example.com'],
  channel_ids: [],
};

const ALERT_RULE = {
  id: RULE_ID,
  name: CREATE_DTO.name,
  metric: CREATE_DTO.metric,
  condition_config: CREATE_DTO.condition_config,
  severity: CREATE_DTO.severity,
  cooldown_minutes: CREATE_DTO.cooldown_minutes,
  is_enabled: CREATE_DTO.is_enabled,
  is_security_critical: CREATE_DTO.is_security_critical,
  notify_emails: CREATE_DTO.notify_emails,
  created_at: new Date('2026-05-15T10:00:00.000Z'),
  updated_at: new Date('2026-05-15T10:00:00.000Z'),
};
const ALERT_RULE_WITH_CHANNELS = { ...ALERT_RULE, channels: [] };
const ALERT_RULE_RESPONSE = { ...ALERT_RULE, channel_ids: [] };

function buildMockPrisma() {
  const mock = {
    $transaction: jest.fn(),
    platformAlertChannel: {
      findMany: jest.fn(),
    },
    platformAlertRule: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformAlertRuleChannel: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  mock.$transaction.mockImplementation((callback: (tx: typeof mock) => unknown) => callback(mock));
  return mock;
}

describe('AlertRulesService', () => {
  let service: AlertRulesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockPlatformAuditService: { log: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPlatformAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertRulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformAuditService, useValue: mockPlatformAuditService },
      ],
    }).compile();

    service = module.get<AlertRulesService>(AlertRulesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists alert rules newest first', async () => {
    mockPrisma.platformAlertRule.findMany.mockResolvedValueOnce([ALERT_RULE_WITH_CHANNELS]);

    await expect(service.list()).resolves.toEqual([ALERT_RULE_RESPONSE]);

    expect(mockPrisma.platformAlertRule.findMany).toHaveBeenCalledWith({
      include: { channels: { select: { channel_id: true } } },
      orderBy: { created_at: 'desc' },
    });
  });

  it('creates an alert rule', async () => {
    mockPrisma.platformAlertRule.create.mockResolvedValueOnce(ALERT_RULE);
    mockPrisma.platformAlertRule.findUniqueOrThrow.mockResolvedValueOnce(ALERT_RULE_WITH_CHANNELS);

    await expect(service.create(CREATE_DTO)).resolves.toEqual(ALERT_RULE_RESPONSE);

    expect(mockPrisma.platformAlertRule.create).toHaveBeenCalledWith({
      data: {
        name: CREATE_DTO.name,
        metric: CREATE_DTO.metric,
        condition_config: CREATE_DTO.condition_config,
        severity: CREATE_DTO.severity,
        cooldown_minutes: CREATE_DTO.cooldown_minutes,
        is_enabled: CREATE_DTO.is_enabled,
        is_security_critical: CREATE_DTO.is_security_critical,
        notify_emails: CREATE_DTO.notify_emails,
      },
    });
  });

  it('rejects queue metrics without a queue in condition_config', async () => {
    await expect(
      service.create({
        ...CREATE_DTO,
        metric: 'queue_depth',
        condition_config: { operator: 'gt', threshold: 100 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects health status metrics without a component in condition_config', async () => {
    await expect(
      service.create({
        ...CREATE_DTO,
        metric: 'health_status',
        condition_config: { operator: 'gte', threshold: 1 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets default severity and cooldown values', async () => {
    const ruleWithDefaults = {
      ...ALERT_RULE,
      severity: 'warning',
      cooldown_minutes: 15,
      is_enabled: true,
      is_security_critical: false,
      notify_emails: [],
    };
    mockPrisma.platformAlertRule.create.mockResolvedValueOnce(ruleWithDefaults);
    mockPrisma.platformAlertRule.findUniqueOrThrow.mockResolvedValueOnce({
      ...ruleWithDefaults,
      channels: [],
    });

    await expect(
      service.create({
        name: 'Redis degraded',
        metric: 'health_status',
        condition_config: { component: 'redis', operator: 'gte', threshold: 1 },
      } as CreateAlertRuleDto),
    ).resolves.toEqual({ ...ruleWithDefaults, channel_ids: [] });

    expect(mockPrisma.platformAlertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: 'warning',
        cooldown_minutes: 15,
        is_enabled: true,
        is_security_critical: false,
        notify_emails: [],
      }),
    });
  });

  it('updates an existing alert rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE_WITH_CHANNELS);
    mockPrisma.platformAlertRule.update.mockResolvedValueOnce({
      ...ALERT_RULE,
      is_enabled: false,
    });
    mockPrisma.platformAlertRule.findUniqueOrThrow.mockResolvedValueOnce({
      ...ALERT_RULE_WITH_CHANNELS,
      is_enabled: false,
    });

    await expect(service.update(RULE_ID, { is_enabled: false })).resolves.toMatchObject({
      is_enabled: false,
    });

    expect(mockPrisma.platformAlertRule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { is_enabled: false },
    });
  });

  it('rejects updates that would leave queue metrics without a queue', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE_WITH_CHANNELS);

    await expect(service.update(RULE_ID, { metric: 'queue_depth' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when updating a missing rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(null);

    await expect(service.update(RULE_ID, { is_enabled: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toggles an existing alert rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE_WITH_CHANNELS);
    mockPrisma.platformAlertRule.update.mockResolvedValueOnce({
      ...ALERT_RULE,
      is_enabled: false,
    });
    mockPrisma.platformAlertRule.findUniqueOrThrow.mockResolvedValueOnce({
      ...ALERT_RULE_WITH_CHANNELS,
      is_enabled: false,
    });

    await expect(service.toggle(RULE_ID, false)).resolves.toMatchObject({
      is_enabled: false,
    });

    expect(mockPrisma.platformAlertRule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID },
      data: { is_enabled: false },
    });
  });

  it('deletes an existing alert rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE_WITH_CHANNELS);
    mockPrisma.platformAlertRule.delete.mockResolvedValueOnce(ALERT_RULE);

    await expect(service.remove(RULE_ID)).resolves.toBeUndefined();

    expect(mockPrisma.platformAlertRule.delete).toHaveBeenCalledWith({ where: { id: RULE_ID } });
  });

  it('throws when deleting a missing rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(null);

    await expect(service.remove(RULE_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
