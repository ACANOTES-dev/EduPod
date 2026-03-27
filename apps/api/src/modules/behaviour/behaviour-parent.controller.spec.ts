import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourParentController } from './behaviour-parent.controller';
import { BehaviourParentService } from './behaviour-parent.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const PARENT_USER: JwtPayload = {
  sub: 'parent-uuid',
  tenant_id: 'tenant-uuid',
  email: 'parent@test.com',
  membership_id: 'mem-parent-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockParentService = {
  getSummary: jest.fn(),
  getIncidents: jest.fn(),
  getPointsAwards: jest.fn(),
  getSanctions: jest.fn(),
  acknowledge: jest.fn(),
  getRecognitionWall: jest.fn(),
  submitAppeal: jest.fn(),
};

describe('BehaviourParentController', () => {
  let controller: BehaviourParentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourParentController],
      providers: [
        { provide: BehaviourParentService, useValue: mockParentService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourParentController>(BehaviourParentController);
    jest.clearAllMocks();
  });

  it('should call parentService.getSummary with tenant_id and user sub', async () => {
    mockParentService.getSummary.mockResolvedValue({ total_incidents: 3, total_points: 25 });

    const result = await controller.getSummary(TENANT, PARENT_USER);

    expect(mockParentService.getSummary).toHaveBeenCalledWith('tenant-uuid', 'parent-uuid');
    expect(result).toEqual({ total_incidents: 3, total_points: 25 });
  });

  it('should call parentService.getIncidents with tenant_id, user sub, student_id, page, and pageSize', async () => {
    const query = { student_id: 'student-1', page: 1, pageSize: 20 };
    mockParentService.getIncidents.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getIncidents(TENANT, PARENT_USER, query as never);

    expect(mockParentService.getIncidents).toHaveBeenCalledWith(
      'tenant-uuid', 'parent-uuid', 'student-1', 1, 20,
    );
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call parentService.getPointsAwards with tenant_id, user sub, and student_id', async () => {
    const query = { student_id: 'student-1' };
    mockParentService.getPointsAwards.mockResolvedValue({ points: 50, awards: [] });

    const result = await controller.getPointsAwards(TENANT, PARENT_USER, query as never);

    expect(mockParentService.getPointsAwards).toHaveBeenCalledWith(
      'tenant-uuid', 'parent-uuid', 'student-1',
    );
    expect(result).toEqual({ points: 50, awards: [] });
  });

  it('should call parentService.getSanctions with tenant_id, user sub, and student_id', async () => {
    const query = { student_id: 'student-1' };
    mockParentService.getSanctions.mockResolvedValue([]);

    const result = await controller.getSanctions(TENANT, PARENT_USER, query as never);

    expect(mockParentService.getSanctions).toHaveBeenCalledWith(
      'tenant-uuid', 'parent-uuid', 'student-1',
    );
    expect(result).toEqual([]);
  });

  it('should call parentService.acknowledge with tenant_id, user sub, and acknowledgementId', async () => {
    mockParentService.acknowledge.mockResolvedValue({ acknowledged: true });

    const result = await controller.acknowledge(TENANT, PARENT_USER, 'ack-1');

    expect(mockParentService.acknowledge).toHaveBeenCalledWith('tenant-uuid', 'parent-uuid', 'ack-1');
    expect(result).toEqual({ acknowledged: true });
  });

  it('should call parentService.getRecognitionWall with tenant_id and user sub', async () => {
    mockParentService.getRecognitionWall.mockResolvedValue({ badges: [], achievements: [] });

    const result = await controller.getRecognitionWall(TENANT, PARENT_USER);

    expect(mockParentService.getRecognitionWall).toHaveBeenCalledWith('tenant-uuid', 'parent-uuid');
    expect(result).toEqual({ badges: [], achievements: [] });
  });

  it('should call parentService.submitAppeal with tenant_id, user sub, and dto', async () => {
    const dto = { incident_id: 'inc-1', reason: 'Unfair sanction', details: 'My child was not involved' };
    mockParentService.submitAppeal.mockResolvedValue({ id: 'appeal-1', status: 'submitted' });

    const result = await controller.submitAppeal(TENANT, PARENT_USER, dto as never);

    expect(mockParentService.submitAppeal).toHaveBeenCalledWith('tenant-uuid', 'parent-uuid', dto);
    expect(result).toEqual({ id: 'appeal-1', status: 'submitted' });
  });
});
