import { Test, TestingModule } from '@nestjs/testing';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { ErrorRedactorService } from './error-redactor.service';
import { PlatformErrorLogService } from './platform-error-log.service';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';

function buildMockPrisma() {
  const tx = {
    platformErrorLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  return {
    tx,
    prisma: {
      $transaction: jest.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx)),
      platformErrorLog: {
        count: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      platformErrorRedactionRule: {
        create: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformUser: {
        findFirst: jest.fn(),
      },
    },
  };
}

describe('PlatformErrorLogService', () => {
  let service: PlatformErrorLogService;
  let mock: ReturnType<typeof buildMockPrisma>;
  let mockAuditService: { log: jest.Mock };

  beforeEach(async () => {
    mock = buildMockPrisma();
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformErrorLogService,
        ErrorRedactorService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: PlatformAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PlatformErrorLogService>(PlatformErrorLogService);
  });

  afterEach(() => jest.clearAllMocks());

  it('redacts sensitive values before platform error persistence', async () => {
    const stripeSecret = ['sk', 'live', '123456789012345678901234'].join('_');

    await service.capture({
      source: 'api',
      level: 'error',
      message:
        'Failed for parent@example.com with token eyJabcdefghijkl.eyJmnopqrstuvwxyz.eyJabcdefghijk',
      stack: `Error: ${stripeSecret}`,
      tenant_id: '22222222-2222-4222-8222-222222222222',
    });

    const createCall = mock.tx.platformErrorLog.create.mock.calls[0]?.[0];
    expect(createCall).toBeDefined();
    const data = createCall?.data as { message_redacted: string; stack_redacted: string };

    expect(data.message_redacted).toContain('[EMAIL]');
    expect(data.message_redacted).toContain('[JWT]');
    expect(data.message_redacted).not.toContain('parent@example.com');
    expect(data.stack_redacted).toContain('[STRIPE_SK]');
    expect(data.stack_redacted).not.toContain(stripeSecret);
  });

  it('groups repeat fingerprints instead of storing duplicate rows', async () => {
    mock.tx.platformErrorLog.findFirst.mockResolvedValueOnce({
      id: '33333333-3333-4333-8333-333333333333',
      fingerprint: 'existing',
      sentry_event_id: null,
      correlation_id: null,
    });

    await service.capture({
      source: 'worker',
      level: 'warn',
      message: 'Same redacted failure',
      sentry_event_id: 'abc123',
    });

    expect(mock.tx.platformErrorLog.update).toHaveBeenCalledWith({
      where: { id: '33333333-3333-4333-8333-333333333333' },
      data: expect.objectContaining({
        count: { increment: 1 },
        sentry_event_id: 'abc123',
      }),
    });
    expect(mock.tx.platformErrorLog.create).not.toHaveBeenCalled();
  });

  it('lists redacted errors with filters and pagination', async () => {
    const row = { id: 'error-1' };
    mock.prisma.platformErrorLog.findMany.mockResolvedValueOnce([row]);
    mock.prisma.platformErrorLog.count.mockResolvedValueOnce(1);

    await expect(
      service.listRedacted({
        page: 3,
        pageSize: 15,
        source: 'api',
        level: 'error',
        fingerprint: 'fingerprint-1',
      }),
    ).resolves.toEqual({ data: [row], meta: { page: 3, pageSize: 15, total: 1 } });

    expect(mock.prisma.platformErrorLog.findMany).toHaveBeenCalledWith({
      where: { source: 'api', level: 'error', fingerprint: 'fingerprint-1' },
      orderBy: { last_seen_at: 'desc' },
      skip: 30,
      take: 15,
    });
  });

  it('returns built-in and custom redaction rules', async () => {
    const custom = [{ id: 'rule-1', name: 'Custom token' }];
    mock.prisma.platformErrorRedactionRule.findMany.mockResolvedValueOnce(custom);

    const result = await service.listRules();

    expect(result.built_in.length).toBeGreaterThan(0);
    expect(result.custom).toBe(custom);
    expect(mock.prisma.platformErrorRedactionRule.findMany).toHaveBeenCalledWith({
      orderBy: { created_at: 'desc' },
    });
  });

  it('creates a custom redaction rule and audits it', async () => {
    const created = { id: 'rule-1', name: 'Custom token' };
    mock.prisma.platformErrorRedactionRule.create.mockResolvedValueOnce(created);

    await expect(
      service.createRule(
        {
          name: 'Custom token',
          pattern: 'secret_[a-z]+',
          pattern_flags: 'gi',
          replacement: '[SECRET]',
          severity: 'high',
        },
        ACTOR_USER_ID,
      ),
    ).resolves.toBe(created);

    expect(mock.prisma.platformErrorRedactionRule.create).toHaveBeenCalledWith({
      data: {
        name: 'Custom token',
        pattern: 'secret_[a-z]+',
        pattern_flags: 'gi',
        replacement: '[SECRET]',
        severity: 'high',
        created_by_user_id: ACTOR_USER_ID,
      },
    });
    expect(mockAuditService.log).toHaveBeenCalledWith({
      actor_user_id: ACTOR_USER_ID,
      action: 'platform_error_redaction_rule_created',
      target_resource_type: 'platform_error_redaction_rule',
      target_resource_id: 'rule-1',
      payload: { after: created },
    });
  });

  it('deletes a custom redaction rule and audits it', async () => {
    const existing = { id: 'rule-1', name: 'Custom token' };
    mock.prisma.platformErrorRedactionRule.findUnique.mockResolvedValueOnce(existing);

    await expect(service.deleteRule('rule-1', ACTOR_USER_ID)).resolves.toBeUndefined();

    expect(mock.prisma.platformErrorRedactionRule.delete).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
    });
    expect(mockAuditService.log).toHaveBeenCalledWith({
      actor_user_id: ACTOR_USER_ID,
      action: 'platform_error_redaction_rule_deleted',
      target_resource_type: 'platform_error_redaction_rule',
      target_resource_id: 'rule-1',
      payload: { before: existing },
    });
  });

  it('throws when deleting a missing redaction rule', async () => {
    mock.prisma.platformErrorRedactionRule.findUnique.mockResolvedValueOnce(null);

    await expect(service.deleteRule('missing', ACTOR_USER_ID)).rejects.toMatchObject({
      response: { code: 'REDACTION_RULE_NOT_FOUND' },
    });
  });

  it('previews a redaction rule with the default sample', async () => {
    await expect(
      service.preview({
        name: 'token',
        pattern: 'eyJ[^\\s]+',
        replacement: '[JWT]',
      }),
    ).resolves.toMatchObject({
      redacted: expect.stringContaining('[JWT]'),
      rules_applied: ['token'],
    });
  });

  it('purges rows older than 90 days and writes a blocking audit entry', async () => {
    const now = new Date('2026-05-16T04:00:00.000Z');
    mock.prisma.platformErrorLog.deleteMany.mockResolvedValueOnce({ count: 7 });

    await expect(service.purgeExpired(ACTOR_USER_ID, now)).resolves.toBe(7);

    expect(mock.prisma.platformErrorLog.deleteMany).toHaveBeenCalledWith({
      where: { last_seen_at: { lt: new Date('2026-02-15T04:00:00.000Z') } },
    });
    expect(mockAuditService.log).toHaveBeenCalledWith({
      actor_user_id: ACTOR_USER_ID,
      action: 'platform_error_retention_purged',
      target_resource_type: 'platform_error_log',
      payload: {
        extra: {
          purged_count: 7,
          cutoff: '2026-02-15T04:00:00.000Z',
        },
      },
    });
  });

  it('resolves the oldest active platform owner as maintenance actor', async () => {
    mock.prisma.platformUser.findFirst.mockResolvedValueOnce({ user_id: ACTOR_USER_ID });

    await expect(service.resolveMaintenanceActor()).resolves.toBe(ACTOR_USER_ID);

    expect(mock.prisma.platformUser.findFirst).toHaveBeenCalledWith({
      where: {
        revoked_at: null,
        roles: { some: { role: { role_key: 'platform_owner' } } },
        user: { global_status: 'active' },
      },
      select: { user_id: true },
      orderBy: { invited_at: 'asc' },
    });
  });

  it('returns null when no maintenance actor is available', async () => {
    mock.prisma.platformUser.findFirst.mockResolvedValueOnce(null);

    await expect(service.resolveMaintenanceActor()).resolves.toBeNull();
  });
});
