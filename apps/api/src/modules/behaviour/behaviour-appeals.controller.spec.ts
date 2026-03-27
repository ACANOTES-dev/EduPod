import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourAppealsController } from './behaviour-appeals.controller';
import { BehaviourAppealsService } from './behaviour-appeals.service';

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
  submit: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  decide: jest.fn(),
  withdraw: jest.fn(),
  uploadAttachment: jest.fn(),
  getAttachments: jest.fn(),
  generateDecisionLetter: jest.fn(),
  getEvidenceBundle: jest.fn(),
};

describe('BehaviourAppealsController', () => {
  let controller: BehaviourAppealsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAppealsController],
      providers: [
        { provide: BehaviourAppealsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourAppealsController>(BehaviourAppealsController);
    jest.clearAllMocks();
  });

  it('should call appealsService.submit with tenant_id, user sub, and dto', async () => {
    const dto = { incident_id: 'inc-1', reason: 'Unfair decision' };
    mockService.submit.mockResolvedValue({ id: 'appeal-1' });

    const result = await controller.submit(TENANT, USER, dto as never);

    expect(mockService.submit).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
    expect(result).toEqual({ id: 'appeal-1' });
  });

  it('should call appealsService.list with tenant_id and filters', async () => {
    const filters = { page: 1, pageSize: 20 };
    mockService.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.list(TENANT, filters as never);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', filters);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call appealsService.getById with tenant_id and id', async () => {
    mockService.getById.mockResolvedValue({ id: 'appeal-1', status: 'pending' });

    const result = await controller.getById(TENANT, 'appeal-1');

    expect(mockService.getById).toHaveBeenCalledWith('tenant-uuid', 'appeal-1');
    expect(result).toEqual({ id: 'appeal-1', status: 'pending' });
  });

  it('should call appealsService.update with tenant_id, id, dto, and user sub', async () => {
    const dto = { reason: 'Updated reason' };
    mockService.update.mockResolvedValue({ id: 'appeal-1', reason: 'Updated reason' });

    const result = await controller.update(TENANT, USER, 'appeal-1', dto as never);

    expect(mockService.update).toHaveBeenCalledWith('tenant-uuid', 'appeal-1', dto, 'user-uuid');
    expect(result).toEqual({ id: 'appeal-1', reason: 'Updated reason' });
  });

  it('should call appealsService.decide with tenant_id, id, user sub, and dto', async () => {
    const dto = { decision: 'upheld', notes: 'Appeal accepted' };
    mockService.decide.mockResolvedValue({ id: 'appeal-1', decision: 'upheld' });

    const result = await controller.decide(TENANT, USER, 'appeal-1', dto as never);

    expect(mockService.decide).toHaveBeenCalledWith('tenant-uuid', 'appeal-1', 'user-uuid', dto);
    expect(result).toEqual({ id: 'appeal-1', decision: 'upheld' });
  });

  it('should call appealsService.withdraw with tenant_id, id, user sub, and dto', async () => {
    const dto = { reason: 'No longer needed' };
    mockService.withdraw.mockResolvedValue({ id: 'appeal-1', status: 'withdrawn' });

    const result = await controller.withdraw(TENANT, USER, 'appeal-1', dto as never);

    expect(mockService.withdraw).toHaveBeenCalledWith('tenant-uuid', 'appeal-1', 'user-uuid', dto);
    expect(result).toEqual({ id: 'appeal-1', status: 'withdrawn' });
  });

  it('should call appealsService.uploadAttachment with tenant_id, id, and undefined', async () => {
    mockService.uploadAttachment.mockResolvedValue({ id: 'att-1' });

    const result = await controller.uploadAttachment(TENANT, 'appeal-1');

    expect(mockService.uploadAttachment).toHaveBeenCalledWith('tenant-uuid', 'appeal-1', undefined);
    expect(result).toEqual({ id: 'att-1' });
  });

  it('should call appealsService.getAttachments with tenant_id and id', async () => {
    mockService.getAttachments.mockResolvedValue([{ id: 'att-1' }]);

    const result = await controller.getAttachments(TENANT, 'appeal-1');

    expect(mockService.getAttachments).toHaveBeenCalledWith('tenant-uuid', 'appeal-1');
    expect(result).toEqual([{ id: 'att-1' }]);
  });

  it('should call appealsService.generateDecisionLetter with tenant_id and id', async () => {
    mockService.generateDecisionLetter.mockResolvedValue({ url: 'https://s3/letter.pdf' });

    const result = await controller.generateDecisionLetter(TENANT, 'appeal-1');

    expect(mockService.generateDecisionLetter).toHaveBeenCalledWith('tenant-uuid', 'appeal-1');
    expect(result).toEqual({ url: 'https://s3/letter.pdf' });
  });

  it('should call appealsService.getEvidenceBundle with tenant_id and id', async () => {
    mockService.getEvidenceBundle.mockResolvedValue({ url: 'https://s3/bundle.zip' });

    const result = await controller.getEvidenceBundle(TENANT, 'appeal-1');

    expect(mockService.getEvidenceBundle).toHaveBeenCalledWith('tenant-uuid', 'appeal-1');
    expect(result).toEqual({ url: 'https://s3/bundle.zip' });
  });
});
