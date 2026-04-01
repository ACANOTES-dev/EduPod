import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourTasksController } from './behaviour-tasks.controller';
import { BehaviourTasksService } from './behaviour-tasks.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockService = {
  listTasks: jest.fn(),
  getMyTasks: jest.fn(),
  getOverdueTasks: jest.fn(),
  getTaskStats: jest.fn(),
  getTask: jest.fn(),
  updateTask: jest.fn(),
  completeTask: jest.fn(),
  cancelTask: jest.fn(),
};

describe('BehaviourTasksController', () => {
  let controller: BehaviourTasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourTasksController],
      providers: [{ provide: BehaviourTasksService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourTasksController>(BehaviourTasksController);
    jest.clearAllMocks();
  });

  it('should call tasksService.listTasks with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20, status: 'pending' };
    mockService.listTasks.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listTasks(TENANT, query as never);

    expect(mockService.listTasks).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call tasksService.getMyTasks with tenant_id, user sub, page, and pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.getMyTasks.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getMyTasks(TENANT, USER, query as never);

    expect(mockService.getMyTasks).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 1, 20);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call tasksService.getOverdueTasks with tenant_id, page, and pageSize', async () => {
    const query = { page: 2, pageSize: 10 };
    mockService.getOverdueTasks.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getOverdueTasks(TENANT, query as never);

    expect(mockService.getOverdueTasks).toHaveBeenCalledWith('tenant-uuid', 2, 10);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call tasksService.getTaskStats with tenant_id', async () => {
    mockService.getTaskStats.mockResolvedValue({ pending: 5, overdue: 2, completed: 10 });

    const result = await controller.getTaskStats(TENANT);

    expect(mockService.getTaskStats).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual({ pending: 5, overdue: 2, completed: 10 });
  });

  it('should call tasksService.getTask with tenant_id and id', async () => {
    mockService.getTask.mockResolvedValue({ id: 'task-1', status: 'pending' });

    const result = await controller.getTask(TENANT, 'task-1');

    expect(mockService.getTask).toHaveBeenCalledWith('tenant-uuid', 'task-1');
    expect(result).toEqual({ id: 'task-1', status: 'pending' });
  });

  it('should call tasksService.updateTask with tenant_id, id, user sub, and dto', async () => {
    const dto = { notes: 'Updated notes' };
    mockService.updateTask.mockResolvedValue({ id: 'task-1' });

    const result = await controller.updateTask(TENANT, USER, 'task-1', dto as never);

    expect(mockService.updateTask).toHaveBeenCalledWith('tenant-uuid', 'task-1', 'user-uuid', dto);
    expect(result).toEqual({ id: 'task-1' });
  });

  it('should call tasksService.completeTask with tenant_id, id, user sub, and dto', async () => {
    const dto = { outcome: 'Resolved with parent meeting' };
    mockService.completeTask.mockResolvedValue({ id: 'task-1', status: 'completed' });

    const result = await controller.completeTask(TENANT, USER, 'task-1', dto as never);

    expect(mockService.completeTask).toHaveBeenCalledWith(
      'tenant-uuid',
      'task-1',
      'user-uuid',
      dto,
    );
    expect(result).toEqual({ id: 'task-1', status: 'completed' });
  });

  it('should call tasksService.cancelTask with tenant_id, id, user sub, and dto', async () => {
    const dto = { reason: 'No longer relevant' };
    mockService.cancelTask.mockResolvedValue({ id: 'task-1', status: 'cancelled' });

    const result = await controller.cancelTask(TENANT, USER, 'task-1', dto as never);

    expect(mockService.cancelTask).toHaveBeenCalledWith('tenant-uuid', 'task-1', 'user-uuid', dto);
    expect(result).toEqual({ id: 'task-1', status: 'cancelled' });
  });
});
