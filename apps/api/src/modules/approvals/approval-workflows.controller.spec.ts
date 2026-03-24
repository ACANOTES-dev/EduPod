import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ApprovalWorkflowsController } from './approval-workflows.controller';
import { ApprovalWorkflowsService } from './approval-workflows.service';

const TENANT_ID = 'tenant-uuid-1';
const WORKFLOW_ID = 'workflow-uuid-1';
const ROLE_ID = 'role-uuid-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('ApprovalWorkflowsController', () => {
  let controller: ApprovalWorkflowsController;
  let mockService: {
    listWorkflows: jest.Mock;
    createWorkflow: jest.Mock;
    updateWorkflow: jest.Mock;
    deleteWorkflow: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listWorkflows: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      deleteWorkflow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalWorkflowsController],
      providers: [
        { provide: ApprovalWorkflowsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApprovalWorkflowsController>(
      ApprovalWorkflowsController,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should list all workflows for a tenant', async () => {
    const expected = { data: [] };
    mockService.listWorkflows.mockResolvedValue(expected);

    const result = await controller.listWorkflows(mockTenant);

    expect(result).toEqual(expected);
    expect(mockService.listWorkflows).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should create a workflow', async () => {
    const dto = {
      action_type: 'payroll_finalise' as const,
      approver_role_id: ROLE_ID,
      is_enabled: true,
    };
    const expected = { id: WORKFLOW_ID, ...dto };
    mockService.createWorkflow.mockResolvedValue(expected);

    const result = await controller.createWorkflow(mockTenant, dto);

    expect(result).toEqual(expected);
    expect(mockService.createWorkflow).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should update a workflow', async () => {
    const dto = { is_enabled: false };
    const expected = { id: WORKFLOW_ID, is_enabled: false };
    mockService.updateWorkflow.mockResolvedValue(expected);

    const result = await controller.updateWorkflow(
      mockTenant,
      WORKFLOW_ID,
      dto,
    );

    expect(result).toEqual(expected);
    expect(mockService.updateWorkflow).toHaveBeenCalledWith(
      TENANT_ID,
      WORKFLOW_ID,
      dto,
    );
  });

  it('should delete a workflow', async () => {
    const expected = { deleted: true };
    mockService.deleteWorkflow.mockResolvedValue(expected);

    const result = await controller.deleteWorkflow(mockTenant, WORKFLOW_ID);

    expect(result).toEqual(expected);
    expect(mockService.deleteWorkflow).toHaveBeenCalledWith(
      TENANT_ID,
      WORKFLOW_ID,
    );
  });
});
