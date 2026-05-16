import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertSilenceService } from './alert-silence.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RULE_ID = '22222222-2222-4222-8222-222222222222';
const SILENCE_ID = '33333333-3333-4333-8333-333333333333';

const baseRule = {
  id: RULE_ID,
  name: 'Redis latency',
  metric: 'component_latency',
  condition_config: { component: 'redis', operator: 'gt', threshold: 100 },
  severity: 'warning',
  cooldown_minutes: 15,
  is_enabled: true,
  is_security_critical: false,
  notify_emails: [],
  created_at: new Date('2026-05-16T09:00:00.000Z'),
  updated_at: new Date('2026-05-16T09:00:00.000Z'),
};

function buildMockPrisma() {
  return {
    platformAlertRule: { findUnique: jest.fn() },
    platformAlertSilence: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('AlertSilenceService', () => {
  let service: AlertSilenceService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAudit: { log: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T10:00:00.000Z'));
    mockPrisma = buildMockPrisma();
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AlertSilenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AlertSilenceService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('creates and audits a single-rule silence', async () => {
    mockPrisma.platformAlertRule.findUnique.mockResolvedValueOnce({ id: RULE_ID });
    mockPrisma.platformAlertSilence.create.mockResolvedValueOnce({ id: SILENCE_ID });

    await service.create(
      {
        scope: 'single_rule',
        alert_rule_id: RULE_ID,
        reason: 'Planned database failover exercise.',
        ends_at: new Date('2026-05-16T11:00:00.000Z'),
      },
      USER_ID,
      { actor_user_id: USER_ID },
    );

    expect(mockPrisma.platformAlertSilence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alert_rule_id: RULE_ID,
          created_by_user_id: USER_ID,
          scope: 'single_rule',
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'alert_silenced', target_resource_id: SILENCE_ID }),
    );
  });

  it('lists active and recently removed silences by default', async () => {
    mockPrisma.platformAlertSilence.findMany.mockResolvedValueOnce([]);

    await service.list({ include_expired: false });

    expect(mockPrisma.platformAlertSilence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { removed_at: null, ends_at: { gte: new Date('2026-05-16T10:00:00.000Z') } },
          ]),
        }),
      }),
    );
  });

  it('removes and audits an active silence', async () => {
    const existing = { id: SILENCE_ID, removed_at: null };
    const updated = { id: SILENCE_ID, removed_at: new Date('2026-05-16T10:01:00.000Z') };
    mockPrisma.platformAlertSilence.findUnique.mockResolvedValueOnce(existing);
    mockPrisma.platformAlertSilence.update.mockResolvedValueOnce(updated);

    await service.remove(
      SILENCE_ID,
      { reason: 'Noise has cleared and alerting can resume.' },
      USER_ID,
      { actor_user_id: USER_ID },
    );

    expect(mockPrisma.platformAlertSilence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SILENCE_ID },
        data: expect.objectContaining({ removed_by_user_id: USER_ID }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alert_silenced',
        payload: { before: existing, after: updated, extra: { removed: true } },
      }),
    );
  });

  it('rejects removal of an already removed silence', async () => {
    mockPrisma.platformAlertSilence.findUnique.mockResolvedValueOnce({
      id: SILENCE_ID,
      removed_at: new Date('2026-05-16T09:00:00.000Z'),
    });

    await expect(
      service.remove(SILENCE_ID, { reason: 'Duplicate removal attempt from the page.' }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects silence windows whose end is before the start', async () => {
    await expect(
      service.create(
        {
          scope: 'global',
          reason: 'Invalid planned work timing.',
          starts_at: new Date('2026-05-16T12:00:00.000Z'),
          ends_at: new Date('2026-05-16T11:00:00.000Z'),
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('finds an active component silence for matching rules', async () => {
    mockPrisma.platformAlertSilence.findMany.mockResolvedValueOnce([{ id: SILENCE_ID }]);

    const result = await service.findActiveSilenceForRule(baseRule);

    expect(result).toEqual({ id: SILENCE_ID });
    expect(mockPrisma.platformAlertSilence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ scope: 'component', component: 'redis' }]),
        }),
      }),
    );
  });

  it('does not apply global silences to security-critical rules', async () => {
    mockPrisma.platformAlertSilence.findMany.mockResolvedValueOnce([]);

    await service.findActiveSilenceForRule({
      ...baseRule,
      is_security_critical: true,
      condition_config: baseRule.condition_config as Prisma.JsonValue,
    });

    expect(mockPrisma.platformAlertSilence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          OR: expect.arrayContaining([{ scope: 'global' }]),
        }),
      }),
    );
  });
});
