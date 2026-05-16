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
    typed_confirmation: string;
  }> = {},
) {
  return {
    action: overrides.action ?? 'job_removed',
    target_resource_type: 'queue_job',
    target_resource_id: JOB_ID,
    payload: { queue: 'gradebook', job_id: JOB_ID },
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

    const module = await Test.createTestingModule({
      providers: [
        OwnerActionConfirmationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformUsersService, useValue: mockPlatformUsers },
        { provide: PlatformAuditService, useValue: mockAudit },
        { provide: RedisService, useValue: { getClient: jest.fn() } },
        { provide: TenantsService, useValue: { archiveTenant: jest.fn() } },
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
});
