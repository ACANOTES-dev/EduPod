/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';

import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEWORK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ATTACHMENT_ID = '11111111-1111-1111-1111-111111111111';
const RECURRENCE_RULE_ID = '22222222-2222-2222-2222-222222222222';

const mockTenant = { tenant_id: TENANT_ID };
const mockUser = { sub: USER_ID, tenant_id: TENANT_ID, role: 'teacher' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockHomeworkService() {
  return {
    create: jest.fn(),
    list: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    copy: jest.fn(),
    remove: jest.fn(),
    addAttachment: jest.fn(),
    removeAttachment: jest.fn(),
    findByClass: jest.fn(),
    findByClassWeek: jest.fn(),
    findToday: jest.fn(),
    findTemplates: jest.fn(),
    createRecurrenceRule: jest.fn(),
    updateRecurrenceRule: jest.fn(),
    deleteRecurrenceRule: jest.fn(),
    bulkCreate: jest.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkController', () => {
  let module: TestingModule;
  let controller: HomeworkController;
  let service: ReturnType<typeof buildMockHomeworkService>;

  beforeEach(async () => {
    service = buildMockHomeworkService();

    module = await Test.createTestingModule({
      controllers: [HomeworkController],
      providers: [{ provide: HomeworkService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HomeworkController>(HomeworkController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  // ─── POST /v1/homework ───────────────────────────────────────────────────────

  it('create — delegates to service with tenantId, userId, and dto', async () => {
    const dto = {
      class_id: CLASS_ID,
      academic_year_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      title: 'Math HW',
      homework_type: 'written' as const,
      due_date: '2026-04-15',
    };
    const expected = { id: HOMEWORK_ID, ...dto };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant as never, mockUser as never, dto as never);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework ────────────────────────────────────────────────────────

  it('findAll — delegates to service with tenantId and query', async () => {
    const query = { page: 1, pageSize: 20, sort: 'due_date', order: 'desc' };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.list.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant as never, query as never);

    expect(service.list).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework/today ──────────────────────────────────────────────────

  it('findToday — delegates to service with tenantId and userId', async () => {
    const expected = { data: [] };
    service.findToday.mockResolvedValue(expected);

    const result = await controller.findToday(mockTenant as never, mockUser as never);

    expect(service.findToday).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework/templates ──────────────────────────────────────────────

  it('findTemplates — delegates to service with tenantId and query', async () => {
    const query = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findTemplates.mockResolvedValue(expected);

    const result = await controller.findTemplates(mockTenant as never, query as never);

    expect(service.findTemplates).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework/by-class/:classId ──────────────────────────────────────

  it('findByClass — delegates to service with tenantId, classId, and query', async () => {
    const query = { page: 1, pageSize: 20, sort: 'due_date', order: 'desc' };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findByClass.mockResolvedValue(expected);

    const result = await controller.findByClass(mockTenant as never, CLASS_ID, query as never);

    expect(service.findByClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, query);
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework/by-class/:classId/week ────────────────────────────────

  it('findByClassWeek — delegates to service with tenantId, classId, and week_start', async () => {
    const query = { week_start: '2026-04-06' };
    const expected = { data: [], week_start: '2026-04-06', week_end: '2026-04-12' };
    service.findByClassWeek.mockResolvedValue(expected);

    const result = await controller.findByClassWeek(mockTenant as never, CLASS_ID, query as never);

    expect(service.findByClassWeek).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, '2026-04-06');
    expect(result).toBe(expected);
  });

  // ─── GET /v1/homework/:id ────────────────────────────────────────────────────

  it('findOne — delegates to service with tenantId and id', async () => {
    const expected = { id: HOMEWORK_ID, title: 'Math HW' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant as never, HOMEWORK_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID);
    expect(result).toBe(expected);
  });

  // ─── PATCH /v1/homework/:id ──────────────────────────────────────────────────

  it('update — delegates to service with tenantId, id, userId, and dto', async () => {
    const dto = { title: 'Updated Title' };
    const expected = { id: HOMEWORK_ID, title: 'Updated Title' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant as never, mockUser as never, HOMEWORK_ID, dto as never);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── PATCH /v1/homework/:id/status ───────────────────────────────────────────

  it('updateStatus — delegates to service with tenantId, id, and dto', async () => {
    const dto = { status: 'published' as const };
    const expected = { id: HOMEWORK_ID, status: 'published' };
    service.updateStatus.mockResolvedValue(expected);

    const result = await controller.updateStatus(mockTenant as never, HOMEWORK_ID, dto as never);

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── POST /v1/homework/:id/copy ─────────────────────────────────────────────

  it('copy — delegates to service with tenantId, id, userId, and dto', async () => {
    const dto = { due_date: '2026-05-01' };
    const expected = { id: 'new-id', copied_from_id: HOMEWORK_ID };
    service.copy.mockResolvedValue(expected);

    const result = await controller.copy(mockTenant as never, mockUser as never, HOMEWORK_ID, dto as never);

    expect(service.copy).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── DELETE /v1/homework/:id ─────────────────────────────────────────────────

  it('remove — delegates to service with tenantId and id', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(mockTenant as never, HOMEWORK_ID);

    expect(service.remove).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID);
  });

  // ─── POST /v1/homework/:id/attachments ───────────────────────────────────────

  it('addAttachment — delegates to service with tenantId, homeworkId, and dto', async () => {
    const dto = {
      attachment_type: 'file' as const,
      file_name: 'doc.pdf',
      mime_type: 'application/pdf',
      display_order: 0,
    };
    const expected = { id: ATTACHMENT_ID, ...dto };
    service.addAttachment.mockResolvedValue(expected);

    const result = await controller.addAttachment(mockTenant as never, HOMEWORK_ID, dto as never);

    expect(service.addAttachment).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── DELETE /v1/homework/:id/attachments/:attachmentId ───────────────────────

  it('removeAttachment — delegates to service with tenantId, homeworkId, and attachmentId', async () => {
    service.removeAttachment.mockResolvedValue(undefined);

    await controller.removeAttachment(mockTenant as never, HOMEWORK_ID, ATTACHMENT_ID);

    expect(service.removeAttachment).toHaveBeenCalledWith(TENANT_ID, HOMEWORK_ID, ATTACHMENT_ID);
  });

  // ─── POST /v1/homework/recurrence-rules ──────────────────────────────────────

  it('createRecurrenceRule — delegates to service with tenantId and dto', async () => {
    const dto = {
      frequency: 'weekly' as const,
      interval: 1,
      days_of_week: [1, 3, 5],
      start_date: '2026-04-01',
    };
    const expected = { id: RECURRENCE_RULE_ID, ...dto };
    service.createRecurrenceRule.mockResolvedValue(expected);

    const result = await controller.createRecurrenceRule(mockTenant as never, dto as never);

    expect(service.createRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── PATCH /v1/homework/recurrence-rules/:id ────────────────────────────────

  it('updateRecurrenceRule — delegates to service with tenantId, id, and dto', async () => {
    const dto = { interval: 2 };
    const expected = { id: RECURRENCE_RULE_ID, interval: 2 };
    service.updateRecurrenceRule.mockResolvedValue(expected);

    const result = await controller.updateRecurrenceRule(mockTenant as never, RECURRENCE_RULE_ID, dto as never);

    expect(service.updateRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, RECURRENCE_RULE_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── DELETE /v1/homework/recurrence-rules/:id ────────────────────────────────

  it('deleteRecurrenceRule — delegates to service with tenantId and id', async () => {
    service.deleteRecurrenceRule.mockResolvedValue(undefined);

    await controller.deleteRecurrenceRule(mockTenant as never, RECURRENCE_RULE_ID);

    expect(service.deleteRecurrenceRule).toHaveBeenCalledWith(TENANT_ID, RECURRENCE_RULE_ID);
  });

  // ─── POST /v1/homework/bulk-create ───────────────────────────────────────────

  it('bulkCreate — delegates to service with tenantId, userId, and dto', async () => {
    const dto = {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      class_id: CLASS_ID,
      academic_year_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      title: 'Daily Reading',
      homework_type: 'reading' as const,
      start_date: '2026-04-01',
      end_date: '2026-04-05',
    };
    const expected = { data: [], count: 5 };
    service.bulkCreate.mockResolvedValue(expected);

    const result = await controller.bulkCreate(mockTenant as never, mockUser as never, dto as never);

    expect(service.bulkCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── Permission guard metadata ──────────────────────────────────────────────

  describe('Permission guards', () => {
    it('should have AuthGuard and PermissionGuard applied at class level', () => {
      const guards = Reflect.getMetadata('__guards__', HomeworkController);
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThanOrEqual(2);
    });

    it('should require homework.manage on create', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkController.prototype.create,
      );
      expect(permission).toBe('homework.manage');
    });

    it('should require homework.view on findAll', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkController.prototype.findAll,
      );
      expect(permission).toBe('homework.view');
    });

    it('should require homework.view on findOne', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkController.prototype.findOne,
      );
      expect(permission).toBe('homework.view');
    });

    it('should require homework.manage on update', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkController.prototype.update,
      );
      expect(permission).toBe('homework.manage');
    });

    it('should require homework.manage on remove', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        HomeworkController.prototype.remove,
      );
      expect(permission).toBe('homework.manage');
    });
  });
});
