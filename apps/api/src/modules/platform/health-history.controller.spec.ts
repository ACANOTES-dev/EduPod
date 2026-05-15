import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';

describe('HealthHistoryController', () => {
  let controller: HealthHistoryController;
  let mockService: { getHistory: jest.Mock };

  beforeEach(async () => {
    mockService = {
      getHistory: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthHistoryController],
      providers: [{ provide: HealthSnapshotService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformOwnerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HealthHistoryController>(HealthHistoryController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates history queries to the snapshot service', async () => {
    await controller.getHistory({ hours: 24, component: 'redis' });

    expect(mockService.getHistory).toHaveBeenCalledWith(24, 'redis');
  });
});

describe('HealthHistoryController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: { getHistory: jest.Mock };

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = {
      getHistory: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    };

    const module = await Test.createTestingModule({
      controllers: [HealthHistoryController],
      providers: [{ provide: HealthSnapshotService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformOwnerGuard)
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

  it('returns history for valid query parameters', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get('/v1/admin/health/history?hours=24').expect(200);

    expect(mockService.getHistory).toHaveBeenCalledWith(24, undefined);
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

    await request(app.getHttpServer()).get('/v1/admin/health/history').expect(403);
  });

  it('returns 400 for invalid hours query values', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get('/v1/admin/health/history?hours=0').expect(400);
    await request(app.getHttpServer()).get('/v1/admin/health/history?hours=999').expect(400);
  });
});
