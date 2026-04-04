import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload, TenantContext } from '@school/shared';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade } from '../../common/tests/mock-facades';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendancePatternService } from './attendance-pattern.service';
import { AttendanceScanService } from './attendance-scan.service';
import { AttendanceUploadService } from './attendance-upload.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const MEMBERSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_PROFILE_ID = '22222222-2222-2222-2222-222222222222';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const user: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('AttendanceController', () => {
  let controller: AttendanceController;

  const mockAttendanceService = {
    createSession: jest.fn(),
    findAllSessions: jest.fn(),
    findOneSession: jest.fn(),
    cancelSession: jest.fn(),
    saveRecords: jest.fn(),
    submitSession: jest.fn(),
    amendRecord: jest.fn(),
    getExceptions: jest.fn(),
    getParentStudentAttendance: jest.fn(),
  };

  const mockAttendancePatternService = {
    listAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    resolveAlert: jest.fn(),
    notifyParentManual: jest.fn(),
  };

  const mockAttendanceScanService = {
    scanImage: jest.fn(),
  };

  const mockAttendanceUploadService = {
    generateTemplate: jest.fn(),
    processUpload: jest.fn(),
    processExceptionsUpload: jest.fn(),
    parseQuickMarkText: jest.fn(),
    undoUpload: jest.fn(),
  };

  const mockDailySummaryService = {
    findAll: jest.fn(),
    findForStudent: jest.fn(),
  };

  const mockPermissionCacheService = {
    getPermissions: jest.fn().mockResolvedValue(['attendance.view', 'attendance.take']),
  };

  const mockPrismaService = {
    staffProfile: { findFirst: jest.fn().mockResolvedValue({ id: STAFF_PROFILE_ID }) },
  };

  const mockStaffProfileFacade = {
    findByUserId: jest.fn().mockResolvedValue({ id: STAFF_PROFILE_ID }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AttendanceService, useValue: mockAttendanceService },
        { provide: AttendancePatternService, useValue: mockAttendancePatternService },
        { provide: AttendanceScanService, useValue: mockAttendanceScanService },
        { provide: AttendanceUploadService, useValue: mockAttendanceUploadService },
        { provide: DailySummaryService, useValue: mockDailySummaryService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileFacade },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttendanceController>(AttendanceController);

    jest.clearAllMocks();
    mockPermissionCacheService.getPermissions.mockResolvedValue([
      'attendance.view',
      'attendance.take',
    ]);
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates createSession', async () => {
    mockAttendanceService.createSession.mockResolvedValue({ id: SESSION_ID });

    const dto = { class_id: 'class-1', session_date: '2025-05-14T00:00:00Z' };
    await controller.createSession(TENANT, user, dto);

    expect(mockAttendanceService.createSession).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      dto,
      ['attendance.view', 'attendance.take'],
      STAFF_PROFILE_ID,
    );
    expect(
      Reflect.getMetadata(REQUIRES_PERMISSION_KEY, AttendanceController.prototype.createSession),
    ).toBe('attendance.take');
  });

  it('delegates findAllSessions', async () => {
    mockAttendanceService.findAllSessions.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllSessions(TENANT, user, { page: 1, pageSize: 20 });

    expect(mockAttendanceService.findAllSessions).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 1, pageSize: 20 },
      STAFF_PROFILE_ID, // because it's teacher-only (lacks manage)
    );
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('AttendanceController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AttendanceService, useValue: {} },
        { provide: AttendancePatternService, useValue: {} },
        { provide: AttendanceScanService, useValue: {} },
        { provide: AttendanceUploadService, useValue: {} },
        { provide: DailySummaryService, useValue: {} },
        {
          provide: PermissionCacheService,
          useValue: { getPermissions: jest.fn().mockResolvedValue([]) },
        },
        { provide: PrismaService, useValue: {} },
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

  it('should return 403 when user lacks attendance.take permission (POST /v1/attendance-sessions)', async () => {
    await request(app.getHttpServer())
      .post('/v1/attendance-sessions')
      .send({
        class_id: '123e4567-e89b-12d3-a456-426614174000',
        session_date: '2025-05-14T00:00:00Z',
      })
      .expect(403);
  });
});
