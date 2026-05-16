import { NotFoundException } from '@nestjs/common';
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
  notify_emails: ['ops@example.com'],
};

const ALERT_RULE = {
  id: RULE_ID,
  ...CREATE_DTO,
  created_at: new Date('2026-05-15T10:00:00.000Z'),
  updated_at: new Date('2026-05-15T10:00:00.000Z'),
};

function buildMockPrisma() {
  return {
    platformAlertRule: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
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
    mockPrisma.platformAlertRule.findMany.mockResolvedValueOnce([ALERT_RULE]);

    await expect(service.list()).resolves.toEqual([ALERT_RULE]);

    expect(mockPrisma.platformAlertRule.findMany).toHaveBeenCalledWith({
      orderBy: { created_at: 'desc' },
    });
  });

  it('creates an alert rule', async () => {
    mockPrisma.platformAlertRule.create.mockResolvedValueOnce(ALERT_RULE);

    await expect(service.create(CREATE_DTO)).resolves.toEqual(ALERT_RULE);

    expect(mockPrisma.platformAlertRule.create).toHaveBeenCalledWith({
      data: {
        name: CREATE_DTO.name,
        metric: CREATE_DTO.metric,
        condition_config: CREATE_DTO.condition_config,
        severity: CREATE_DTO.severity,
        cooldown_minutes: CREATE_DTO.cooldown_minutes,
        is_enabled: CREATE_DTO.is_enabled,
        notify_emails: CREATE_DTO.notify_emails,
      },
    });
  });

  it('updates an existing alert rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE);
    mockPrisma.platformAlertRule.update.mockResolvedValueOnce({
      ...ALERT_RULE,
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

  it('throws when updating a missing rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(null);

    await expect(service.update(RULE_ID, { is_enabled: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an existing alert rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(ALERT_RULE);
    mockPrisma.platformAlertRule.delete.mockResolvedValueOnce(ALERT_RULE);

    await expect(service.remove(RULE_ID)).resolves.toBeUndefined();

    expect(mockPrisma.platformAlertRule.delete).toHaveBeenCalledWith({ where: { id: RULE_ID } });
  });

  it('throws when deleting a missing rule', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce(null);

    await expect(service.remove(RULE_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
