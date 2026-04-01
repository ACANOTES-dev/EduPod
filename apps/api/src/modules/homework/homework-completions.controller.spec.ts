import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HomeworkCompletionsController } from './homework-completions.controller';
import { HomeworkCompletionsService } from './homework-completions.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEWORK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tenantCtx = { tenant_id: TENANT_ID };
const userCtx: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkCompletionsController', () => {
  let module: TestingModule;
  let controller: HomeworkCompletionsController;
  let mockService: {
    listCompletions: jest.Mock;
    studentSelfReport: jest.Mock;
    teacherUpdate: jest.Mock;
    bulkMark: jest.Mock;
    getCompletionRate: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listCompletions: jest.fn(),
      studentSelfReport: jest.fn(),
      teacherUpdate: jest.fn(),
      bulkMark: jest.fn(),
      getCompletionRate: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [HomeworkCompletionsController],
      providers: [{ provide: HomeworkCompletionsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HomeworkCompletionsController>(HomeworkCompletionsController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  // ─── listCompletions ─────────────────────────────────────────────────────

  describe('listCompletions', () => {
    it('should delegate to service with tenantId and homeworkId', async () => {
      const expected = { data: [], assignment: { id: HOMEWORK_ID } };
      mockService.listCompletions.mockResolvedValue(expected);

      const result = await controller.listCompletions(tenantCtx, HOMEWORK_ID);

      expect(mockService.listCompletions).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID);
      expect(result).toEqual(expected);
    });
  });

  // ─── studentSelfReport ───────────────────────────────────────────────────

  describe('studentSelfReport', () => {
    it('should delegate to service with tenantId, homeworkId, userId, and dto', async () => {
      const dto = { status: 'completed' as const };
      const expected = { id: 'comp-1', status: 'completed' };
      mockService.studentSelfReport.mockResolvedValue(expected);

      const result = await controller.studentSelfReport(tenantCtx, userCtx, HOMEWORK_ID, dto);

      expect(mockService.studentSelfReport).toHaveBeenCalledWith(
        TENANT_ID,
        HOMEWORK_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── bulkMark ────────────────────────────────────────────────────────────

  describe('bulkMark', () => {
    it('should delegate to service with tenantId, homeworkId, userId, and dto', async () => {
      const dto = {
        completions: [{ student_id: STUDENT_ID, status: 'completed' as const }],
      };
      const expected = { data: [], count: 1 };
      mockService.bulkMark.mockResolvedValue(expected);

      const result = await controller.bulkMark(tenantCtx, userCtx, HOMEWORK_ID, dto);

      expect(mockService.bulkMark).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, USER_ID, dto);
      expect(result).toEqual(expected);
    });
  });

  // ─── teacherUpdate ───────────────────────────────────────────────────────

  describe('teacherUpdate', () => {
    it('should delegate to service with tenantId, homeworkId, studentId, userId, and dto', async () => {
      const dto = { status: 'completed' as const, notes: 'Good work' };
      const expected = { id: 'comp-1', status: 'completed' };
      mockService.teacherUpdate.mockResolvedValue(expected);

      const result = await controller.teacherUpdate(
        tenantCtx,
        userCtx,
        HOMEWORK_ID,
        STUDENT_ID,
        dto,
      );

      expect(mockService.teacherUpdate).toHaveBeenCalledWith(
        TENANT_ID,
        HOMEWORK_ID,
        STUDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── getCompletionRate ───────────────────────────────────────────────────

  describe('getCompletionRate', () => {
    it('should delegate to service with tenantId and homeworkId', async () => {
      const expected = {
        homework_assignment_id: HOMEWORK_ID,
        total_students: 20,
        completed: 15,
        in_progress: 3,
        not_started: 2,
        completion_rate: 75,
      };
      mockService.getCompletionRate.mockResolvedValue(expected);

      const result = await controller.getCompletionRate(tenantCtx, HOMEWORK_ID);

      expect(mockService.getCompletionRate).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID);
      expect(result).toEqual(expected);
    });
  });

  // ─── Permission guard metadata ──────────────────────────────────────────────

  describe('Permission guards', () => {
    it('should have AuthGuard and PermissionGuard applied at class level', () => {
      const guards = Reflect.getMetadata('__guards__', HomeworkCompletionsController);
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThanOrEqual(2);
    });

    it('should require homework.view on listCompletions', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkCompletionsController.prototype.listCompletions,
      );
      expect(permission).toBe('homework.view');
    });

    it('should require homework.manage on studentSelfReport', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkCompletionsController.prototype.studentSelfReport,
      );
      expect(permission).toBe('homework.manage');
    });

    it('should require homework.manage on bulkMark', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkCompletionsController.prototype.bulkMark,
      );
      expect(permission).toBe('homework.manage');
    });

    it('should require homework.manage on teacherUpdate', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkCompletionsController.prototype.teacherUpdate,
      );
      expect(permission).toBe('homework.manage');
    });

    it('should require homework.view on getCompletionRate', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkCompletionsController.prototype.getCompletionRate,
      );
      expect(permission).toBe('homework.view');
    });
  });
});
