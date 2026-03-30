import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HomeworkParentController } from './homework-parent.controller';
import { HomeworkParentService } from './homework-parent.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tenantContext = { tenant_id: TENANT_ID };
const userPayload = { sub: USER_ID };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkParentController', () => {
  let controller: HomeworkParentController;
  let mockService: {
    listAll: jest.Mock;
    listToday: jest.Mock;
    listOverdue: jest.Mock;
    listWeek: jest.Mock;
    studentSummary: jest.Mock;
    studentDiary: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listAll: jest.fn(),
      listToday: jest.fn(),
      listOverdue: jest.fn(),
      listWeek: jest.fn(),
      studentSummary: jest.fn(),
      studentDiary: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [HomeworkParentController],
      providers: [{ provide: HomeworkParentService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(HomeworkParentController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAll ──────────────────────────────────────────────────────────────

  describe('HomeworkParentController — listAll', () => {
    it('should delegate to service.listAll with tenantId, userId and query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listAll.mockResolvedValue(expected);

      const result = await controller.listAll(
        tenantContext as never,
        userPayload as never,
        query,
      );

      expect(result).toEqual(expected);
      expect(mockService.listAll).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
    });
  });

  // ─── listToday ────────────────────────────────────────────────────────────

  describe('HomeworkParentController — listToday', () => {
    it('should delegate to service.listToday with tenantId and userId', async () => {
      const expected = { data: [] };
      mockService.listToday.mockResolvedValue(expected);

      const result = await controller.listToday(
        tenantContext as never,
        userPayload as never,
      );

      expect(result).toEqual(expected);
      expect(mockService.listToday).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // ─── listOverdue ──────────────────────────────────────────────────────────

  describe('HomeworkParentController — listOverdue', () => {
    it('should delegate to service.listOverdue with tenantId and userId', async () => {
      const expected = { data: [] };
      mockService.listOverdue.mockResolvedValue(expected);

      const result = await controller.listOverdue(
        tenantContext as never,
        userPayload as never,
      );

      expect(result).toEqual(expected);
      expect(mockService.listOverdue).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // ─── listWeek ─────────────────────────────────────────────────────────────

  describe('HomeworkParentController — listWeek', () => {
    it('should delegate to service.listWeek with tenantId and userId', async () => {
      const expected = { data: [] };
      mockService.listWeek.mockResolvedValue(expected);

      const result = await controller.listWeek(
        tenantContext as never,
        userPayload as never,
      );

      expect(result).toEqual(expected);
      expect(mockService.listWeek).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // ─── studentSummary ───────────────────────────────────────────────────────

  describe('HomeworkParentController — studentSummary', () => {
    it('should delegate to service.studentSummary with tenantId, userId and studentId', async () => {
      const expected = {
        data: {
          total_assigned: 0,
          completed: 0,
          in_progress: 0,
          overdue: 0,
          completion_rate: 0,
          recent: [],
        },
      };
      mockService.studentSummary.mockResolvedValue(expected);

      const result = await controller.studentSummary(
        tenantContext as never,
        userPayload as never,
        STUDENT_ID,
      );

      expect(result).toEqual(expected);
      expect(mockService.studentSummary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
      );
    });
  });

  // ─── studentDiary ─────────────────────────────────────────────────────────

  describe('HomeworkParentController — studentDiary', () => {
    it('should delegate to service.studentDiary with tenantId, userId, studentId and query', async () => {
      const query = { page: 2, pageSize: 10 };
      const expected = { data: [], meta: { page: 2, pageSize: 10, total: 0 } };
      mockService.studentDiary.mockResolvedValue(expected);

      const result = await controller.studentDiary(
        tenantContext as never,
        userPayload as never,
        STUDENT_ID,
        query,
      );

      expect(result).toEqual(expected);
      expect(mockService.studentDiary).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        query,
      );
    });
  });
});
