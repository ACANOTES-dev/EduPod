import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourExclusionCasesService } from './behaviour-exclusion-cases.service';
import { BehaviourExclusionsController } from './behaviour-exclusions.controller';

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
  create: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  transitionStatus: jest.fn(),
  generateNotice: jest.fn(),
  generateBoardPack: jest.fn(),
  recordDecision: jest.fn(),
  getTimeline: jest.fn(),
  getDocuments: jest.fn(),
};

describe('BehaviourExclusionsController', () => {
  let controller: BehaviourExclusionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourExclusionsController],
      providers: [
        { provide: BehaviourExclusionCasesService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourExclusionsController>(BehaviourExclusionsController);
    jest.clearAllMocks();
  });

  it('should call exclusionCasesService.create with tenant_id, dto, and user sub', async () => {
    const dto = { student_id: 's-1', type: 'fixed_term', reason: 'Serious incident' };
    mockService.create.mockResolvedValue({ id: 'exc-1' });

    const result = await controller.create(TENANT, USER, dto as never);

    expect(mockService.create).toHaveBeenCalledWith('tenant-uuid', dto, 'user-uuid');
    expect(result).toEqual({ id: 'exc-1' });
  });

  it('should call exclusionCasesService.list with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.list(TENANT, query as never);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call exclusionCasesService.getById with tenant_id and id', async () => {
    mockService.getById.mockResolvedValue({ id: 'exc-1', status: 'open' });

    const result = await controller.getById(TENANT, 'exc-1');

    expect(mockService.getById).toHaveBeenCalledWith('tenant-uuid', 'exc-1');
    expect(result).toEqual({ id: 'exc-1', status: 'open' });
  });

  it('should call exclusionCasesService.update with tenant_id, id, dto, and user sub', async () => {
    const dto = { reason: 'Updated reason' };
    mockService.update.mockResolvedValue({ id: 'exc-1' });

    const result = await controller.update(TENANT, USER, 'exc-1', dto as never);

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'exc-1', dto, 'user-uuid');
    expect(result).toEqual({ id: 'exc-1' });
  });

  it('should call exclusionCasesService.transitionStatus with mapped status', async () => {
    const dto = { status: 'hearing_scheduled', reason: 'Hearing set' };
    mockService.transitionStatus.mockResolvedValue({ id: 'exc-1', status: 'hearing_scheduled_exc' });

    const result = await controller.transitionStatus(TENANT, USER, 'exc-1', dto as never);

    expect(mockService.transitionStatus).toHaveBeenCalledWith(
      'tenant-uuid', 'exc-1', 'hearing_scheduled_exc', 'Hearing set', 'user-uuid',
    );
    expect(result).toEqual({ id: 'exc-1', status: 'hearing_scheduled_exc' });
  });

  it('should call exclusionCasesService.generateNotice with tenant_id, id, and user sub', async () => {
    mockService.generateNotice.mockResolvedValue({ url: 'https://s3/notice.pdf' });

    const result = await controller.generateNotice(TENANT, USER, 'exc-1');

    expect(mockService.generateNotice).toHaveBeenCalledWith('tenant-uuid', 'exc-1', 'user-uuid');
    expect(result).toEqual({ url: 'https://s3/notice.pdf' });
  });

  it('should call exclusionCasesService.generateBoardPack with tenant_id, id, and user sub', async () => {
    mockService.generateBoardPack.mockResolvedValue({ url: 'https://s3/board-pack.pdf' });

    const result = await controller.generateBoardPack(TENANT, USER, 'exc-1');

    expect(mockService.generateBoardPack).toHaveBeenCalledWith('tenant-uuid', 'exc-1', 'user-uuid');
    expect(result).toEqual({ url: 'https://s3/board-pack.pdf' });
  });

  it('should call exclusionCasesService.recordDecision with tenant_id, id, dto, and user sub', async () => {
    const dto = { decision: 'permanent_exclusion', rationale: 'Exhausted alternatives' };
    mockService.recordDecision.mockResolvedValue({ id: 'exc-1', decision: 'permanent_exclusion' });

    const result = await controller.recordDecision(TENANT, USER, 'exc-1', dto as never);

    expect(mockService.recordDecision).toHaveBeenCalledWith('tenant-uuid', 'exc-1', dto, 'user-uuid');
    expect(result).toEqual({ id: 'exc-1', decision: 'permanent_exclusion' });
  });

  it('should call exclusionCasesService.getTimeline with tenant_id and id', async () => {
    mockService.getTimeline.mockResolvedValue([{ event: 'created', at: '2026-01-01' }]);

    const result = await controller.getTimeline(TENANT, 'exc-1');

    expect(mockService.getTimeline).toHaveBeenCalledWith('tenant-uuid', 'exc-1');
    expect(result).toEqual([{ event: 'created', at: '2026-01-01' }]);
  });

  it('should call exclusionCasesService.getDocuments with tenant_id and id', async () => {
    mockService.getDocuments.mockResolvedValue([{ id: 'doc-1', type: 'notice' }]);

    const result = await controller.getDocuments(TENANT, 'exc-1');

    expect(mockService.getDocuments).toHaveBeenCalledWith('tenant-uuid', 'exc-1');
    expect(result).toEqual([{ id: 'doc-1', type: 'notice' }]);
  });
});
