import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const STEP_ID = '22222222-2222-4222-8222-222222222222';
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

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = mockUser;
      return true;
    },
  };
}

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let mockService: {
    getForTenant: jest.Mock;
    resetForTenant: jest.Mock;
    updateStep: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getForTenant: jest.fn().mockResolvedValue({ steps: [], phases: {}, summary: { total: 0 } }),
      resetForTenant: jest.fn().mockResolvedValue(undefined),
      updateStep: jest.fn().mockResolvedValue({ id: STEP_ID, status: 'completed' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates get requests to the onboarding service', async () => {
    await controller.get(TENANT_ID);

    expect(mockService.getForTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('delegates step updates with the actor user id', async () => {
    await controller.updateStep(TENANT_ID, STEP_ID, { status: 'completed' }, mockUser, mockRequest);

    expect(mockService.updateStep).toHaveBeenCalledWith(
      TENANT_ID,
      STEP_ID,
      { status: 'completed' },
      USER_ID,
      {
        actor_user_id: USER_ID,
        ip_address: undefined,
        user_agent: undefined,
      },
    );
  });

  it('delegates reset requests', async () => {
    await expect(controller.reset(TENANT_ID, mockUser, mockRequest)).resolves.toEqual({
      message: 'Onboarding tracker reset successfully',
    });

    expect(mockService.resetForTenant).toHaveBeenCalledWith(TENANT_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('OnboardingController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: {
    getForTenant: jest.Mock;
    resetForTenant: jest.Mock;
    updateStep: jest.Mock;
  };

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = {
      getForTenant: jest.fn().mockResolvedValue({ steps: [], phases: {}, summary: { total: 0 } }),
      resetForTenant: jest.fn().mockResolvedValue(undefined),
      updateStep: jest.fn().mockResolvedValue({ id: STEP_ID, status: 'completed' }),
    };

    const module = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: mockService }],
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

  it('returns onboarding tracker data for platform owners', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/onboarding`).expect(200);

    expect(mockService.getForTenant).toHaveBeenCalledWith(TENANT_ID);
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

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/onboarding`).expect(403);
  });

  it('returns 400 for invalid step update payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .patch(`/v1/admin/tenants/${TENANT_ID}/onboarding/${STEP_ID}`)
      .send({ status: 'blocked' })
      .expect(400);
  });
});
