import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';
import request from 'supertest';

import { MODULE_ENABLED_KEY } from '../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SenTransitionController } from './sen-transition.controller';
import { SenTransitionService } from './sen-transition.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROFILE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SenTransitionController', () => {
  let controller: SenTransitionController;

  const mockService = {
    createNote: jest.fn(),
    findNotes: jest.fn(),
    generateHandoverPack: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['sen.view', 'sen.manage']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenTransitionController],
      providers: [
        { provide: SenTransitionService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SenTransitionController>(SenTransitionController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue(['sen.view', 'sen.manage']);
  });

  afterEach(() => jest.clearAllMocks());

  it('has module-enabled metadata', () => {
    expect(Reflect.getMetadata(MODULE_ENABLED_KEY, SenTransitionController)).toBe('sen');
  });

  it('delegates create, list, and handover generation', async () => {
    mockService.createNote.mockResolvedValue({ id: 'note-1' });
    mockService.findNotes.mockResolvedValue([]);
    mockService.generateHandoverPack.mockResolvedValue({ student: { id: STUDENT_ID } });

    await controller.createNote(TENANT, USER, PROFILE_ID, {
      note_type: 'general',
      content: 'Useful classroom supports.',
    });
    await controller.findNotes(TENANT, USER, PROFILE_ID, {
      note_type: 'general',
    });
    await controller.generateHandoverPack(TENANT, USER, STUDENT_ID);

    expect(mockService.createNote).toHaveBeenCalledWith(
      TENANT_ID,
      PROFILE_ID,
      { note_type: 'general', content: 'Useful classroom supports.' },
      USER_ID,
    );
    expect(mockService.findNotes).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      PROFILE_ID,
      { note_type: 'general' },
    );
    expect(mockService.generateHandoverPack).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ['sen.view', 'sen.manage'],
      STUDENT_ID,
    );
  });

  it('declares the expected permissions and static handover route', () => {
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenTransitionController.prototype.createNote),
    ).toBe('sen.manage');
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, SenTransitionController.prototype.findNotes),
    ).toBe('sen.view');
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        SenTransitionController.prototype.generateHandoverPack,
      ),
    ).toBe('sen.manage');
    expect(
      Reflect.getMetadata(PATH_METADATA, SenTransitionController.prototype.generateHandoverPack),
    ).toBe('sen/transition/handover-pack/:studentId');
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('SenTransitionController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SenTransitionController],
      providers: [
        { provide: SenTransitionService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks sen.manage permission (GET /v1/sen/transition/handover-pack/123e4567-e89b-12d3-a456-426614174000)', async () => {
    await request(app.getHttpServer())
      .get('/v1/sen/transition/handover-pack/123e4567-e89b-12d3-a456-426614174000')
      .send({})
      .expect(403);
  });
});
