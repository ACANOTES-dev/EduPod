import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload, TenantContext } from '@school/shared';

import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade } from '../../common/tests/mock-facades';
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

  it('delegates findAllSessions with undefined staffProfileId when user has manage', async () => {
    mockPermissionCacheService.getPermissions.mockResolvedValue([
      'attendance.view',
      'attendance.take',
      'attendance.manage',
    ]);
    mockAttendanceService.findAllSessions.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllSessions(TENANT, user, { page: 1, pageSize: 20 });

    expect(mockAttendanceService.findAllSessions).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 1, pageSize: 20 },
      undefined,
    );
  });

  it('delegates findOneSession', async () => {
    mockAttendanceService.findOneSession.mockResolvedValue({ id: SESSION_ID });

    await controller.findOneSession(TENANT, SESSION_ID);

    expect(mockAttendanceService.findOneSession).toHaveBeenCalledWith(TENANT_ID, SESSION_ID);
  });

  it('delegates cancelSession', async () => {
    mockAttendanceService.cancelSession.mockResolvedValue({ id: SESSION_ID, status: 'cancelled' });

    await controller.cancelSession(TENANT, SESSION_ID);

    expect(mockAttendanceService.cancelSession).toHaveBeenCalledWith(TENANT_ID, SESSION_ID);
  });

  it('delegates saveRecords', async () => {
    mockAttendanceService.saveRecords.mockResolvedValue({ data: [] });
    const dto = { records: [{ student_id: 'stu-1', status: 'present' as const }] };

    await controller.saveRecords(TENANT, user, SESSION_ID, dto);

    expect(mockAttendanceService.saveRecords).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      USER_ID,
      dto,
    );
  });

  it('delegates submitSession', async () => {
    mockAttendanceService.submitSession.mockResolvedValue({ id: SESSION_ID });

    await controller.submitSession(TENANT, user, SESSION_ID);

    expect(mockAttendanceService.submitSession).toHaveBeenCalledWith(
      TENANT_ID,
      SESSION_ID,
      USER_ID,
    );
  });

  it('delegates amendRecord', async () => {
    mockAttendanceService.amendRecord.mockResolvedValue({ id: 'rec-1' });
    const dto = { status: 'absent_excused' as const, amendment_reason: 'test' };

    await controller.amendRecord(TENANT, user, 'rec-1', dto);

    expect(mockAttendanceService.amendRecord).toHaveBeenCalledWith(
      TENANT_ID,
      'rec-1',
      USER_ID,
      dto,
    );
  });

  it('delegates findAllSummaries', async () => {
    mockDailySummaryService.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllSummaries(TENANT, { page: 1, pageSize: 20 });

    expect(mockDailySummaryService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });
  });

  it('delegates findStudentSummaries', async () => {
    mockDailySummaryService.findForStudent.mockResolvedValue({ data: [] });
    const studentId = '11111111-1111-1111-1111-111111111111';

    await controller.findStudentSummaries(TENANT, studentId, {});

    expect(mockDailySummaryService.findForStudent).toHaveBeenCalledWith(TENANT_ID, studentId, {});
  });

  it('delegates getExceptions', async () => {
    mockAttendanceService.getExceptions.mockResolvedValue({
      pending_sessions: [],
      excessive_absences: [],
    });

    await controller.getExceptions(TENANT, {});

    expect(mockAttendanceService.getExceptions).toHaveBeenCalledWith(TENANT_ID, {});
  });

  it('delegates getParentStudentAttendance', async () => {
    mockAttendanceService.getParentStudentAttendance.mockResolvedValue({
      summaries: [],
      records: [],
    });
    const studentId = '11111111-1111-1111-1111-111111111111';

    await controller.getParentStudentAttendance(TENANT, user, studentId, {});

    expect(mockAttendanceService.getParentStudentAttendance).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      studentId,
      {},
    );
  });

  it('delegates exceptionsUpload', async () => {
    mockAttendanceUploadService.processExceptionsUpload.mockResolvedValue({
      success: true,
      updated: 1,
      errors: [],
      batch_id: 'batch-1',
    });

    const body = {
      session_date: '2026-03-10',
      records: [{ student_number: 'STU001', status: 'absent_unexcused' as const }],
    };

    await controller.exceptionsUpload(TENANT, user, body);

    expect(mockAttendanceUploadService.processExceptionsUpload).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      body.session_date,
      body.records,
    );
  });

  it('delegates quickMark', async () => {
    mockAttendanceUploadService.parseQuickMarkText.mockReturnValue([
      { student_number: 'STU001', status: 'absent_unexcused' },
    ]);
    mockAttendanceUploadService.processExceptionsUpload.mockResolvedValue({
      success: true,
      updated: 1,
      errors: [],
      batch_id: 'batch-1',
    });

    await controller.quickMark(TENANT, user, {
      session_date: '2026-03-10',
      text: 'STU001 A',
    });

    expect(mockAttendanceUploadService.parseQuickMarkText).toHaveBeenCalledWith('STU001 A');
    expect(mockAttendanceUploadService.processExceptionsUpload).toHaveBeenCalled();
  });

  it('delegates undoUpload', async () => {
    mockAttendanceUploadService.undoUpload.mockResolvedValue({ reverted: 1 });

    await controller.undoUpload(TENANT, user, { batch_id: 'batch-1' });

    expect(mockAttendanceUploadService.undoUpload).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      'batch-1',
    );
  });

  it('delegates confirmScan', async () => {
    mockAttendanceUploadService.processExceptionsUpload.mockResolvedValue({
      success: true,
      updated: 1,
      errors: [],
      batch_id: 'batch-1',
    });

    const body = {
      session_date: '2026-03-10',
      entries: [{ student_number: 'STU001', status: 'absent_unexcused' as const }],
    };

    await controller.confirmScan(TENANT, user, body);

    expect(mockAttendanceUploadService.processExceptionsUpload).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      body.session_date,
      body.entries,
    );
  });

  it('delegates listPatternAlerts', async () => {
    mockAttendancePatternService.listAlerts.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.listPatternAlerts(TENANT, { page: 1, pageSize: 20 });

    expect(mockAttendancePatternService.listAlerts).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });
  });

  it('delegates acknowledgePatternAlert', async () => {
    mockAttendancePatternService.acknowledgeAlert.mockResolvedValue({ id: 'alert-1' });
    const alertId = '33333333-3333-3333-3333-333333333333';

    await controller.acknowledgePatternAlert(TENANT, user, alertId);

    expect(mockAttendancePatternService.acknowledgeAlert).toHaveBeenCalledWith(
      TENANT_ID,
      alertId,
      USER_ID,
    );
  });

  it('delegates resolvePatternAlert', async () => {
    mockAttendancePatternService.resolveAlert.mockResolvedValue({ id: 'alert-1' });
    const alertId = '33333333-3333-3333-3333-333333333333';

    await controller.resolvePatternAlert(TENANT, alertId);

    expect(mockAttendancePatternService.resolveAlert).toHaveBeenCalledWith(TENANT_ID, alertId);
  });

  it('delegates notifyParentManual', async () => {
    mockAttendancePatternService.notifyParentManual.mockResolvedValue({ notified: 1 });
    const alertId = '33333333-3333-3333-3333-333333333333';

    await controller.notifyParentManual(TENANT, alertId);

    expect(mockAttendancePatternService.notifyParentManual).toHaveBeenCalledWith(
      TENANT_ID,
      alertId,
    );
  });

  it('delegates getUserContext with null membership_id', async () => {
    const noMembershipUser: JwtPayload = { ...user, membership_id: null };
    mockAttendanceService.findAllSessions.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllSessions(TENANT, noMembershipUser, { page: 1, pageSize: 20 });

    // When membership_id is undefined, permissions default to []
    expect(mockAttendanceService.findAllSessions).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 1, pageSize: 20 },
      STAFF_PROFILE_ID, // no manage perm → teacher mode
    );
  });

  it('delegates getUserContext with null staffProfile', async () => {
    mockStaffProfileFacade.findByUserId.mockResolvedValue(null);
    mockAttendanceService.createSession.mockResolvedValue({ id: SESSION_ID });

    const dto = { class_id: 'class-1', session_date: '2025-05-14T00:00:00Z' };
    await controller.createSession(TENANT, user, dto);

    expect(mockAttendanceService.createSession).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      dto,
      ['attendance.view', 'attendance.take'],
      undefined, // staffProfileId is undefined when staff profile not found
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
