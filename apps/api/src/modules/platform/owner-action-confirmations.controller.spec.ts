import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { JwtPayload, OwnerActionConfirmationDto } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { OwnerActionConfirmationService } from './owner-action-confirmation.service';
import { OwnerActionConfirmationsController } from './owner-action-confirmations.controller';

const CONFIRMATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';

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

const confirmationBody: OwnerActionConfirmationDto = {
  action: 'job_removed',
  target_resource_type: 'queue_job',
  target_resource_id: '123',
  payload: { queue: 'gradebook', job_id: '123' },
  confirmation_phrase: 'DELETE JOB 123',
  typed_confirmation: 'DELETE JOB 123',
  reason: 'Removing a failed job after inspection.',
};

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = mockUser;
      return true;
    },
  };
}

function buildMockService() {
  return {
    confirmAndExecute: jest.fn().mockResolvedValue({
      confirmation_id: CONFIRMATION_ID,
      execution_status: 'executed',
    }),
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
  };
}

describe('OwnerActionConfirmationsController', () => {
  let controller: OwnerActionConfirmationsController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerActionConfirmationsController],
      providers: [{ provide: OwnerActionConfirmationService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OwnerActionConfirmationsController>(OwnerActionConfirmationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service with parsed query values', async () => {
    await controller.list({ page: 2, pageSize: 50 });

    expect(mockService.list).toHaveBeenCalledWith({ page: 2, pageSize: 50 });
  });

  it('delegates confirmation to the service with the actor and audit context', async () => {
    await controller.confirmAndExecute(confirmationBody, mockUser, mockRequest);

    expect(mockService.confirmAndExecute).toHaveBeenCalledWith(confirmationBody, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('OwnerActionConfirmationsController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();

    const module = await Test.createTestingModule({
      controllers: [OwnerActionConfirmationsController],
      providers: [{ provide: OwnerActionConfirmationService, useValue: mockService }],
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

  it('confirms and executes a valid owner-confirmed action', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/action-confirmations')
      .send(confirmationBody)
      .expect(201);

    expect(mockService.confirmAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'job_removed' }),
      USER_ID,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 when the reason is too short', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/action-confirmations')
      .send({
        ...confirmationBody,
        reason: 'too short',
      })
      .expect(400);
  });

  it('returns 403 when platform owner guard rejects access', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_ACCESS_DENIED',
          message: 'Platform owner access required',
        });
      },
    });

    await request(app.getHttpServer()).get('/v1/admin/action-confirmations').expect(403);
  });
});
