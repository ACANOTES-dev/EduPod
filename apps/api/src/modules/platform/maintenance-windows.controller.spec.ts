import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type {
  CancelAlertMaintenanceWindowDto,
  CreateAlertMaintenanceWindowDto,
  JwtPayload,
} from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { MaintenanceWindowService } from './maintenance-window.service';
import { MaintenanceWindowsController } from './maintenance-windows.controller';

const WINDOW_ID = '11111111-1111-4111-8111-111111111111';
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

const createBody: CreateAlertMaintenanceWindowDto = {
  title: 'Database patching',
  description: 'Planned PostgreSQL maintenance window.',
  starts_at: new Date('2026-05-16T10:00:00.000Z'),
  ends_at: new Date('2026-05-16T12:00:00.000Z'),
};
const cancelBody: CancelAlertMaintenanceWindowDto = {
  reason: 'Maintenance completed earlier than expected.',
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
    cancel: jest.fn().mockResolvedValue({ id: WINDOW_ID, ...createBody, cancelled_at: new Date() }),
    create: jest.fn().mockResolvedValue({ id: WINDOW_ID, ...createBody }),
    list: jest.fn().mockResolvedValue([]),
  };
}

describe('MaintenanceWindowsController', () => {
  let controller: MaintenanceWindowsController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceWindowsController],
      providers: [{ provide: MaintenanceWindowService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaintenanceWindowsController>(MaintenanceWindowsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service with parsed query values', async () => {
    await controller.list({ include_past: true });

    expect(mockService.list).toHaveBeenCalledWith({ include_past: true });
  });

  it('delegates create to the service with the actor and audit context', async () => {
    await controller.create(createBody, mockUser, mockRequest);

    expect(mockService.create).toHaveBeenCalledWith(createBody, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('delegates cancel to the service with the actor and audit context', async () => {
    await controller.cancel(WINDOW_ID, cancelBody, mockUser, mockRequest);

    expect(mockService.cancel).toHaveBeenCalledWith(WINDOW_ID, cancelBody, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('MaintenanceWindowsController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();

    const module = await Test.createTestingModule({
      controllers: [MaintenanceWindowsController],
      providers: [{ provide: MaintenanceWindowService, useValue: mockService }],
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

  it('schedules a maintenance window for valid payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alert-maintenance-windows')
      .send({
        ...createBody,
        starts_at: createBody.starts_at.toISOString(),
        ends_at: createBody.ends_at.toISOString(),
      })
      .expect(201);

    expect(mockService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Database patching' }),
      USER_ID,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 for windows that end before they start', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alert-maintenance-windows')
      .send({
        title: 'Invalid timing',
        starts_at: '2026-05-16T12:00:00.000Z',
        ends_at: '2026-05-16T10:00:00.000Z',
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

    await request(app.getHttpServer()).get('/v1/admin/alert-maintenance-windows').expect(403);
  });
});
