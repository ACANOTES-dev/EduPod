import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ATT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const RULE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const tenantCtx = { tenant_id: TENANT_ID };
const userCtx = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mock Service ────────────────────────────────────────────────────────────

const mockService = {
  create: jest.fn(),
  list: jest.fn(),
  findToday: jest.fn(),
  findTemplates: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn(),
  addAttachment: jest.fn(),
  removeAttachment: jest.fn(),
  findByClass: jest.fn(),
  findByClassWeek: jest.fn(),
  createRecurrenceRule: jest.fn(),
  updateRecurrenceRule: jest.fn(),
  deleteRecurrenceRule: jest.fn(),
  bulkCreate: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkController — branch coverage', () => {
  let controller: HomeworkController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HomeworkController],
      providers: [{ provide: HomeworkService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(HomeworkController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('HomeworkController — create', () => {
    it('should delegate to homeworkService.create', async () => {
      mockService.create.mockResolvedValue({ id: HW_ID });
      const dto = {
        title: 'Test HW',
        class_id: CLASS_ID,
        homework_type: 'written' as const,
        due_date: '2026-04-10',
        academic_year_id: HW_ID,
      };
      const result = await controller.create(tenantCtx, userCtx, dto as never);
      expect(result).toEqual({ id: HW_ID });
      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });

  describe('HomeworkController — findAll', () => {
    it('should delegate to homeworkService.list', async () => {
      mockService.list.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      await controller.findAll(tenantCtx, { page: 1, pageSize: 20 } as never);
      expect(mockService.list).toHaveBeenCalled();
    });
  });

  describe('HomeworkController — findToday', () => {
    it('should delegate to homeworkService.findToday', async () => {
      mockService.findToday.mockResolvedValue({ data: [] });
      await controller.findToday(tenantCtx, userCtx);
      expect(mockService.findToday).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  describe('HomeworkController — findTemplates', () => {
    it('should delegate to homeworkService.findTemplates', async () => {
      mockService.findTemplates.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
      await controller.findTemplates(tenantCtx, { page: 1, pageSize: 20 });
      expect(mockService.findTemplates).toHaveBeenCalled();
    });
  });

  describe('HomeworkController — findByClass', () => {
    it('should delegate to homeworkService.findByClass', async () => {
      mockService.findByClass.mockResolvedValue({ data: [] });
      await controller.findByClass(tenantCtx, CLASS_ID, { page: 1, pageSize: 20 } as never);
      expect(mockService.findByClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, expect.anything());
    });
  });

  describe('HomeworkController — findByClassWeek', () => {
    it('should delegate to homeworkService.findByClassWeek with week_start', async () => {
      mockService.findByClassWeek.mockResolvedValue({ data: [] });
      await controller.findByClassWeek(tenantCtx, CLASS_ID, { week_start: '2026-04-01' });
      expect(mockService.findByClassWeek).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, '2026-04-01');
    });

    it('should delegate with undefined week_start when not provided', async () => {
      mockService.findByClassWeek.mockResolvedValue({ data: [] });
      await controller.findByClassWeek(tenantCtx, CLASS_ID, {});
      expect(mockService.findByClassWeek).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, undefined);
    });
  });

  describe('HomeworkController — createRecurrenceRule', () => {
    it('should delegate to homeworkService.createRecurrenceRule', async () => {
      mockService.createRecurrenceRule.mockResolvedValue({ id: RULE_ID });
      const dto = {
        frequency: 'weekly' as const,
        interval: 1,
        days_of_week: [1, 3],
        start_date: '2026-04-01',
      };
      await controller.createRecurrenceRule(tenantCtx, dto);
      expect(mockService.createRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });

  describe('HomeworkController — updateRecurrenceRule', () => {
    it('should delegate to homeworkService.updateRecurrenceRule', async () => {
      mockService.updateRecurrenceRule.mockResolvedValue({ id: RULE_ID });
      const dto = { interval: 2 };
      await controller.updateRecurrenceRule(tenantCtx, RULE_ID, dto);
      expect(mockService.updateRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, RULE_ID, dto);
    });
  });

  describe('HomeworkController — deleteRecurrenceRule', () => {
    it('should delegate to homeworkService.deleteRecurrenceRule', async () => {
      mockService.deleteRecurrenceRule.mockResolvedValue(undefined);
      await controller.deleteRecurrenceRule(tenantCtx, RULE_ID);
      expect(mockService.deleteRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, RULE_ID);
    });
  });

  describe('HomeworkController — bulkCreate', () => {
    it('should delegate to homeworkService.bulkCreate', async () => {
      mockService.bulkCreate.mockResolvedValue({ data: [], count: 0 });
      const dto = {
        recurrence_rule_id: RULE_ID,
        class_id: CLASS_ID,
        academic_year_id: HW_ID,
        title: 'Recurring HW',
        homework_type: 'written' as const,
        start_date: '2026-04-01',
        end_date: '2026-06-30',
      };
      await controller.bulkCreate(tenantCtx, userCtx, dto);
      expect(mockService.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });

  describe('HomeworkController — findOne', () => {
    it('should delegate to homeworkService.findOne', async () => {
      mockService.findOne.mockResolvedValue({ id: HW_ID });
      await controller.findOne(tenantCtx, HW_ID);
      expect(mockService.findOne).toHaveBeenCalledWith(TENANT_ID, HW_ID);
    });
  });

  describe('HomeworkController — update', () => {
    it('should delegate to homeworkService.update', async () => {
      mockService.update.mockResolvedValue({ id: HW_ID });
      await controller.update(tenantCtx, userCtx, HW_ID, { title: 'Updated' } as never);
      expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, HW_ID, USER_ID, {
        title: 'Updated',
      });
    });
  });

  describe('HomeworkController — updateStatus', () => {
    it('should delegate to homeworkService.updateStatus', async () => {
      mockService.updateStatus.mockResolvedValue({ id: HW_ID });
      await controller.updateStatus(tenantCtx, HW_ID, { status: 'published' });
      expect(mockService.updateStatus).toHaveBeenCalledWith(TENANT_ID, HW_ID, {
        status: 'published',
      });
    });
  });

  describe('HomeworkController — copy', () => {
    it('should delegate to homeworkService.copy', async () => {
      mockService.copy.mockResolvedValue({ id: 'new-hw' });
      await controller.copy(tenantCtx, userCtx, HW_ID, { due_date: '2026-05-01' });
      expect(mockService.copy).toHaveBeenCalledWith(TENANT_ID, HW_ID, USER_ID, {
        due_date: '2026-05-01',
      });
    });
  });

  describe('HomeworkController — remove', () => {
    it('should delegate to homeworkService.remove', async () => {
      mockService.remove.mockResolvedValue(undefined);
      await controller.remove(tenantCtx, HW_ID);
      expect(mockService.remove).toHaveBeenCalledWith(TENANT_ID, HW_ID);
    });
  });

  describe('HomeworkController — addAttachment', () => {
    it('should delegate to homeworkService.addAttachment', async () => {
      mockService.addAttachment.mockResolvedValue({ id: ATT_ID });
      const dto = {
        attachment_type: 'link' as const,
        url: 'https://example.com',
        display_order: 0,
      };
      await controller.addAttachment(tenantCtx, HW_ID, dto);
      expect(mockService.addAttachment).toHaveBeenCalledWith(TENANT_ID, HW_ID, dto);
    });
  });

  describe('HomeworkController — removeAttachment', () => {
    it('should delegate to homeworkService.removeAttachment', async () => {
      mockService.removeAttachment.mockResolvedValue(undefined);
      await controller.removeAttachment(tenantCtx, HW_ID, ATT_ID);
      expect(mockService.removeAttachment).toHaveBeenCalledWith(TENANT_ID, HW_ID, ATT_ID);
    });
  });
});
