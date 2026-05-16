import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { QueueAdminController } from './queue-admin.controller';
import { QueueManagementService } from './queue-management.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'owner@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};
const mockRequest = { headers: {} } as Request;

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = mockUser;
      return true;
    },
  };
}

function buildMockQueueService() {
  return {
    cleanQueue: jest.fn().mockResolvedValue({ cleaned: 1, job_ids: ['job-1'] }),
    getJobDetail: jest.fn().mockResolvedValue({ id: 'job-1', name: 'test', status: 'failed' }),
    listJobs: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    listQueues: jest.fn().mockResolvedValue([
      {
        name: 'notifications',
        is_paused: false,
        counts: { active: 0, completed: 1, delayed: 0, failed: 2, paused: 0, waiting: 3 },
      },
    ]),
    pauseQueue: jest.fn().mockResolvedValue({ paused: true }),
    removeJob: jest.fn().mockResolvedValue({
      attempts_made: 3,
      failed_reason: 'boom',
      job_name: 'test',
      previous_state: 'failed',
    }),
    resumeQueue: jest.fn().mockResolvedValue({ resumed: true }),
    retryJob: jest.fn().mockResolvedValue({ retried: true }),
  };
}

function buildMockAuditService() {
  return { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
}

describe('QueueAdminController', () => {
  let controller: QueueAdminController;
  let queueService: ReturnType<typeof buildMockQueueService>;
  let auditService: ReturnType<typeof buildMockAuditService>;

  beforeEach(async () => {
    queueService = buildMockQueueService();
    auditService = buildMockAuditService();
    const module = await Test.createTestingModule({
      controllers: [QueueAdminController],
      providers: [
        { provide: QueueManagementService, useValue: queueService },
        { provide: PlatformAuditService, useValue: auditService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(QueueAdminController);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists queues', async () => {
    await controller.listQueues();

    expect(queueService.listQueues).toHaveBeenCalledWith();
  });

  it('lists jobs with a status filter', async () => {
    await controller.listJobs('notifications', {
      order: 'desc',
      page: 1,
      pageSize: 20,
      sort: undefined,
      status: 'failed',
    });

    expect(queueService.listJobs).toHaveBeenCalledWith('notifications', {
      order: 'desc',
      page: 1,
      pageSize: 20,
      sort: undefined,
      status: 'failed',
    });
  });

  it('audits retry mutations', async () => {
    await controller.retryJob('notifications', 'job-1', mockUser, mockRequest);

    expect(queueService.retryJob).toHaveBeenCalledWith('notifications', 'job-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'job_retried',
        actor_user_id: USER_ID,
        target_resource_id: 'job-1',
      }),
    );
  });

  it('audits clean mutations', async () => {
    await controller.cleanQueue(
      'notifications',
      { grace_ms: 0, limit: 1000, status: 'failed' },
      mockUser,
      mockRequest,
    );

    expect(queueService.cleanQueue).toHaveBeenCalledWith('notifications', {
      grace_ms: 0,
      limit: 1000,
      status: 'failed',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'queue_cleaned', target_resource_id: 'notifications' }),
    );
  });
});

describe('QueueAdminController — HTTP guards and validation', () => {
  let app: INestApplication;
  let queueService: ReturnType<typeof buildMockQueueService>;
  let auditService: ReturnType<typeof buildMockAuditService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    queueService = buildMockQueueService();
    auditService = buildMockAuditService();
    const module = await Test.createTestingModule({
      controllers: [QueueAdminController],
      providers: [
        { provide: QueueManagementService, useValue: queueService },
        { provide: PlatformAuditService, useValue: auditService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue(platformGuard)
      .compile();

    const nestApp = module.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  it('returns queue list for platform operators', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get('/v1/admin/queues').expect(200);

    expect(queueService.listQueues).toHaveBeenCalledWith();
  });

  it('returns 403 for non-platform operators', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_PERMISSION_DENIED',
          message: 'Permission denied',
        });
      },
    });

    await request(app.getHttpServer()).get('/v1/admin/queues').expect(403);
  });

  it('validates clean status', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/queues/notifications/clean')
      .send({ status: 'active', grace_ms: 0 })
      .expect(400);
  });

  it('cleans queue with a valid body', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/queues/notifications/clean')
      .send({ status: 'failed', grace_ms: 0 })
      .expect(200);

    expect(queueService.cleanQueue).toHaveBeenCalledWith('notifications', {
      grace_ms: 0,
      limit: 1000,
      status: 'failed',
    });
  });
});
