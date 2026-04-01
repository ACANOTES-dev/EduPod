/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourExportService } from './behaviour-export.service';
import { BehaviourStudentsController } from './behaviour-students.controller';
import { BehaviourStudentsService } from './behaviour-students.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const PERMISSIONS = ['behaviour.view', 'behaviour.manage'];

const mockStudentsService = {
  listStudents: jest.fn(),
  getStudentProfile: jest.fn(),
  getStudentTimeline: jest.fn(),
  getStudentAnalytics: jest.fn(),
  getStudentPoints: jest.fn(),
  getStudentSanctions: jest.fn(),
  getStudentInterventions: jest.fn(),
  getStudentAwards: jest.fn(),
  getStudentAiSummary: jest.fn(),
  getStudentPreview: jest.fn(),
  getParentView: jest.fn(),
  getStudentTasks: jest.fn(),
};

const mockExportService = {
  generateStudentPackPdf: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

describe('BehaviourStudentsController', () => {
  let controller: BehaviourStudentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourStudentsController],
      providers: [
        { provide: BehaviourStudentsService, useValue: mockStudentsService },
        { provide: BehaviourExportService, useValue: mockExportService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourStudentsController>(BehaviourStudentsController);
    mockPermissionCacheService.getPermissions.mockResolvedValue(PERMISSIONS);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Student List ────────────────────────────────────────────────────────

  it('should call studentsService.listStudents with tenant_id, user_id, permissions, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockStudentsService.listStudents.mockResolvedValue({ data: [] });

    const result = await controller.listStudents(TENANT, USER, query);

    expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockStudentsService.listStudents).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      1,
      20,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Student Profile ─────────────────────────────────────────────────────

  it('should call studentsService.getStudentProfile with tenant_id and studentId', async () => {
    mockStudentsService.getStudentProfile.mockResolvedValue({ id: STUDENT_ID, name: 'Alice' });

    const result = await controller.getStudentProfile(TENANT, STUDENT_ID);

    expect(mockStudentsService.getStudentProfile).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ id: STUDENT_ID, name: 'Alice' });
  });

  // ─── Student Timeline ────────────────────────────────────────────────────

  it('should call studentsService.getStudentTimeline with tenant_id, studentId, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockStudentsService.getStudentTimeline.mockResolvedValue({ data: [] });

    const result = await controller.getStudentTimeline(TENANT, STUDENT_ID, query);

    expect(mockStudentsService.getStudentTimeline).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
      1,
      20,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Student Analytics ───────────────────────────────────────────────────

  it('should call studentsService.getStudentAnalytics with tenant_id and studentId', async () => {
    mockStudentsService.getStudentAnalytics.mockResolvedValue({ incidents: 5 });

    const result = await controller.getStudentAnalytics(TENANT, STUDENT_ID);

    expect(mockStudentsService.getStudentAnalytics).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ incidents: 5 });
  });

  // ─── Student Points ──────────────────────────────────────────────────────

  it('should call studentsService.getStudentPoints with tenant_id and studentId', async () => {
    mockStudentsService.getStudentPoints.mockResolvedValue({ total: 120 });

    const result = await controller.getStudentPoints(TENANT, STUDENT_ID);

    expect(mockStudentsService.getStudentPoints).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ total: 120 });
  });

  // ─── Student Sanctions ───────────────────────────────────────────────────

  it('should call studentsService.getStudentSanctions with tenant_id, studentId, page, pageSize', async () => {
    const query = { page: 1, pageSize: 10 };
    mockStudentsService.getStudentSanctions.mockResolvedValue({ data: [] });

    const result = await controller.getStudentSanctions(TENANT, STUDENT_ID, query);

    expect(mockStudentsService.getStudentSanctions).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
      1,
      10,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Student Interventions ───────────────────────────────────────────────

  it('should call studentsService.getStudentInterventions with tenant_id, studentId, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockStudentsService.getStudentInterventions.mockResolvedValue({ data: [] });

    const result = await controller.getStudentInterventions(TENANT, STUDENT_ID, query);

    expect(mockStudentsService.getStudentInterventions).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
      1,
      20,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Student Awards ──────────────────────────────────────────────────────

  it('should call studentsService.getStudentAwards with tenant_id, studentId, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockStudentsService.getStudentAwards.mockResolvedValue({ data: [] });

    const result = await controller.getStudentAwards(TENANT, STUDENT_ID, query);

    expect(mockStudentsService.getStudentAwards).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });

  // ─── Student AI Summary ──────────────────────────────────────────────────

  it('should call studentsService.getStudentAiSummary with tenant_id and studentId', async () => {
    mockStudentsService.getStudentAiSummary.mockResolvedValue({ summary: 'Good student' });

    const result = await controller.getStudentAiSummary(TENANT, STUDENT_ID);

    expect(mockStudentsService.getStudentAiSummary).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ summary: 'Good student' });
  });

  // ─── Student Preview ─────────────────────────────────────────────────────

  it('should call studentsService.getStudentPreview with tenant_id and studentId', async () => {
    mockStudentsService.getStudentPreview.mockResolvedValue({ id: STUDENT_ID, points: 80 });

    const result = await controller.getStudentPreview(TENANT, STUDENT_ID);

    expect(mockStudentsService.getStudentPreview).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ id: STUDENT_ID, points: 80 });
  });

  // ─── Student PDF Export ──────────────────────────────────────────────────

  it('should call exportService.generateStudentPackPdf with tenant_id, studentId, user_id, locale', async () => {
    const buffer = Buffer.from('pdf-content');
    mockExportService.generateStudentPackPdf.mockResolvedValue(buffer);

    const mockRes = {
      set: jest.fn(),
      send: jest.fn(),
    };

    await controller.exportStudentPdf(TENANT, USER, STUDENT_ID, mockRes as never);

    expect(mockExportService.generateStudentPackPdf).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
      USER_ID,
      'en',
    );
    expect(mockRes.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="student-pack-${STUDENT_ID.slice(0, 8)}.pdf"`,
    });
    expect(mockRes.send).toHaveBeenCalledWith(buffer);
  });

  // ─── Parent View ─────────────────────────────────────────────────────────

  it('should call studentsService.getParentView with tenant_id and studentId', async () => {
    mockStudentsService.getParentView.mockResolvedValue({ id: STUDENT_ID });

    const result = await controller.getParentView(TENANT, STUDENT_ID);

    expect(mockStudentsService.getParentView).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual({ id: STUDENT_ID });
  });

  // ─── Student Tasks ───────────────────────────────────────────────────────

  it('should call studentsService.getStudentTasks with tenant_id, studentId, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockStudentsService.getStudentTasks.mockResolvedValue({ data: [] });

    const result = await controller.getStudentTasks(TENANT, STUDENT_ID, query);

    expect(mockStudentsService.getStudentTasks).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });
});
