import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PlatformAuditAction } from '@prisma/client';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenantsService } from '../tenants/tenants.service';

import { OwnerActionConfirmationService } from './owner-action-confirmation.service';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const CONFIRMATION_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '333';

const auditContext = {
  actor_user_id: ACTOR_USER_ID,
  ip_address: '127.0.0.1',
  user_agent: 'jest',
};

function buildMockPrisma() {
  return {
    platformOwnerActionConfirmation: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

function buildDto(
  overrides: Partial<{
    action: PlatformAuditAction;
    payload: unknown;
    target_resource_id: string;
    target_tenant_id: string;
    typed_confirmation: string;
  }> = {},
) {
  return {
    action: overrides.action ?? 'job_removed',
    target_resource_type: 'queue_job',
    target_resource_id: overrides.target_resource_id ?? JOB_ID,
    target_tenant_id: overrides.target_tenant_id,
    payload: overrides.payload ?? { queue: 'gradebook', job_id: JOB_ID },
    confirmation_phrase: `DELETE JOB ${JOB_ID}`,
    typed_confirmation: overrides.typed_confirmation ?? `DELETE JOB ${JOB_ID}`,
    reason: 'Removing a poison failed job after inspection.',
  };
}

describe('OwnerActionConfirmationService', () => {
  let service: OwnerActionConfirmationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockPlatformUsers: { hasPermission: jest.Mock<Promise<boolean>, [string, string]> };
  let mockAudit: { log: jest.Mock<Promise<void>, [Record<string, unknown>]> };
  let mockGradebookQueue: {
    clean: jest.Mock;
    getJob: jest.Mock;
  };
  let mockRedisClient: {
    del: jest.Mock;
    get: jest.Mock;
    scan: jest.Mock;
    srem: jest.Mock;
  };
  let mockTenantsService: {
    archiveTenant: jest.Mock;
  };
  let mockJob: {
    getState: jest.Mock<Promise<string>, []>;
    name: string;
    remove: jest.Mock<Promise<void>, []>;
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.platformOwnerActionConfirmation.create.mockResolvedValue({
      id: CONFIRMATION_ID,
    });
    mockPrisma.platformOwnerActionConfirmation.update.mockResolvedValue({});
    mockPlatformUsers = { hasPermission: jest.fn().mockResolvedValue(true) };
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    mockJob = {
      getState: jest.fn().mockResolvedValue('failed'),
      name: 'test:job',
      remove: jest.fn().mockResolvedValue(undefined),
    };
    mockGradebookQueue = {
      clean: jest.fn().mockResolvedValue([]),
      getJob: jest.fn().mockResolvedValue(mockJob),
    };
    mockRedisClient = {
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          session_id: 'session-1',
          user_id: 'user-1',
          tenant_id: 'tenant-1',
        }),
      ),
      scan: jest.fn().mockResolvedValue(['0', []]),
      srem: jest.fn().mockResolvedValue(1),
    };
    mockTenantsService = {
      archiveTenant: jest.fn().mockResolvedValue({ id: 'tenant-1', status: 'archived' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        OwnerActionConfirmationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformUsersService, useValue: mockPlatformUsers },
        { provide: PlatformAuditService, useValue: mockAudit },
        { provide: RedisService, useValue: { getClient: jest.fn(() => mockRedisClient) } },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: getQueueToken('gradebook'), useValue: mockGradebookQueue },
        {
          provide: getQueueToken('notifications'),
          useValue: { clean: jest.fn(), getJob: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(OwnerActionConfirmationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('registers the initial owner-confirmed executors', () => {
    expect(service.getRegisteredExecutorActions()).toEqual(
      expect.arrayContaining([
        'cache_flushed_global',
        'queue_cleaned',
        'tenant_ownership_transferred',
        'session_force_logged_out_tenant',
        'tenant_archive',
      ]),
    );
  });

  it('paginates confirmation history', async () => {
    mockPrisma.platformOwnerActionConfirmation.findMany.mockResolvedValueOnce([
      { id: CONFIRMATION_ID },
    ]);
    mockPrisma.platformOwnerActionConfirmation.count.mockResolvedValueOnce(1);

    const result = await service.list({ page: 2, pageSize: 25 });

    expect(result).toEqual({
      data: [{ id: CONFIRMATION_ID }],
      meta: { page: 2, pageSize: 25, total: 1 },
    });
    expect(mockPrisma.platformOwnerActionConfirmation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it('blocks phrase mismatches before creating a confirmation row', async () => {
    await expect(
      service.confirmAndExecute(
        buildDto({ typed_confirmation: 'DELETE THE WRONG JOB' }),
        ACTOR_USER_ID,
        auditContext,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.platformOwnerActionConfirmation.create).not.toHaveBeenCalled();
  });

  it('blocks actors without the mapped platform permission', async () => {
    mockPlatformUsers.hasPermission.mockResolvedValueOnce(false);

    await expect(
      service.confirmAndExecute(buildDto(), ACTOR_USER_ID, auditContext),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('executes a permitted queue job removal and writes audit before execution', async () => {
    const result = await service.confirmAndExecute(buildDto(), ACTOR_USER_ID, auditContext);

    expect(result).toEqual({ confirmation_id: CONFIRMATION_ID, execution_status: 'executed' });
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'job_removed',
        reason: 'Removing a poison failed job after inspection.',
      }),
    );
    expect(mockJob.remove).toHaveBeenCalledTimes(1);
    expect(mockPrisma.platformOwnerActionConfirmation.update).toHaveBeenCalledWith({
      where: { id: CONFIRMATION_ID },
      data: expect.objectContaining({ execution_status: 'executed' }),
    });
  });

  it('captures executor failures on the confirmation row', async () => {
    mockJob.remove.mockRejectedValueOnce(new Error('remove failed'));

    const result = await service.confirmAndExecute(buildDto(), ACTOR_USER_ID, auditContext);

    expect(result).toEqual({ confirmation_id: CONFIRMATION_ID, execution_status: 'failed' });
    expect(mockPrisma.platformOwnerActionConfirmation.update).toHaveBeenCalledWith({
      where: { id: CONFIRMATION_ID },
      data: expect.objectContaining({ execution_status: 'failed' }),
    });
  });

  it('cleans a queue with bounded owner-confirmed payload values', async () => {
    mockGradebookQueue.clean.mockResolvedValueOnce(['job-1', 'job-2']);

    const result = await service.confirmAndExecute(
      {
        ...buildDto({
          action: 'queue_cleaned',
          payload: { queue: 'gradebook', state: 'completed', grace_ms: 500, limit: 5000 },
        }),
        confirmation_phrase: 'CLEAN QUEUE gradebook',
        typed_confirmation: 'CLEAN QUEUE gradebook',
      },
      ACTOR_USER_ID,
      auditContext,
    );

    expect(result).toEqual({ confirmation_id: CONFIRMATION_ID, execution_status: 'executed' });
    expect(mockGradebookQueue.clean).toHaveBeenCalledWith(500, 1000, 'completed');
  });

  it('marks unsupported queue clean states as failed executions', async () => {
    const result = await service.confirmAndExecute(
      {
        ...buildDto({
          action: 'queue_cleaned',
          payload: { queue: 'gradebook', state: 'unknown' },
        }),
        confirmation_phrase: 'CLEAN QUEUE gradebook',
        typed_confirmation: 'CLEAN QUEUE gradebook',
      },
      ACTOR_USER_ID,
      auditContext,
    );

    expect(result).toEqual({ confirmation_id: CONFIRMATION_ID, execution_status: 'failed' });
    expect(mockPrisma.platformOwnerActionConfirmation.update).toHaveBeenCalledWith({
      where: { id: CONFIRMATION_ID },
      data: expect.objectContaining({
        execution_result: { error: 'Queue clean state "unknown" is not supported.' },
        execution_status: 'failed',
      }),
    });
  });

  it('flushes global cache patterns from Redis', async () => {
    mockRedisClient.scan
      .mockResolvedValueOnce(['0', ['analytics:school']])
      .mockResolvedValue(['0', []]);

    await service.confirmAndExecute(
      {
        ...buildDto({ action: 'cache_flushed_global', payload: {} }),
        confirmation_phrase: 'FLUSH PLATFORM CACHE',
        typed_confirmation: 'FLUSH PLATFORM CACHE',
      },
      ACTOR_USER_ID,
      auditContext,
    );

    expect(mockRedisClient.del).toHaveBeenCalledWith('analytics:school');
  });

  it('force logs out tenant sessions matching Redis metadata', async () => {
    mockRedisClient.scan.mockResolvedValueOnce(['0', ['session:1']]);

    await service.confirmAndExecute(
      {
        ...buildDto({
          action: 'session_force_logged_out_tenant',
          payload: {},
          target_resource_id: 'tenant-1',
          target_tenant_id: 'tenant-1',
        }),
        confirmation_phrase: 'LOG OUT TENANT tenant-1',
        typed_confirmation: 'LOG OUT TENANT tenant-1',
      },
      ACTOR_USER_ID,
      auditContext,
    );

    expect(mockRedisClient.del).toHaveBeenCalledWith('session:1');
    expect(mockRedisClient.srem).toHaveBeenCalledWith('user_sessions:user-1', 'session-1');
  });

  it('archives a tenant through the tenant service', async () => {
    await service.confirmAndExecute(
      {
        ...buildDto({
          action: 'tenant_archive',
          payload: {},
          target_resource_id: 'tenant-1',
          target_tenant_id: 'tenant-1',
        }),
        confirmation_phrase: 'ARCHIVE TENANT tenant-1',
        typed_confirmation: 'ARCHIVE TENANT tenant-1',
      },
      ACTOR_USER_ID,
      auditContext,
    );

    expect(mockTenantsService.archiveTenant).toHaveBeenCalledWith('tenant-1', ACTOR_USER_ID);
  });
});
