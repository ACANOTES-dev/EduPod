import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, RbacReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ApprovalWorkflowsService } from './approval-workflows.service';

const TENANT_ID = 'tenant-uuid-1';
const WORKFLOW_ID = 'workflow-uuid-1';
const ROLE_ID = 'role-uuid-1';

function buildMockWorkflow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ID,
    tenant_id: TENANT_ID,
    action_type: 'payroll_finalise',
    approver_role_id: ROLE_ID,
    is_enabled: true,
    created_at: new Date(),
    updated_at: new Date(),
    approver_role: {
      id: ROLE_ID,
      role_key: 'admin',
      display_name: 'Admin',
      role_tier: 'admin',
    },
    ...overrides,
  };
}

describe('ApprovalWorkflowsService', () => {
  let service: ApprovalWorkflowsService;
  let mockPrisma: {
    approvalWorkflow: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    approvalRequest: {
      count: jest.Mock;
    };
    role: {
      findFirst: jest.Mock;
    };
  };
  let mockRbacReadFacade: { findRoleById: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      approvalWorkflow: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      approvalRequest: {
        count: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
    };

    mockRbacReadFacade = { findRoleById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ApprovalWorkflowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RbacReadFacade, useValue: mockRbacReadFacade },
      ],
    }).compile();

    service = module.get<ApprovalWorkflowsService>(ApprovalWorkflowsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listWorkflows', () => {
    it('should return all workflows for a tenant', async () => {
      const workflows = [buildMockWorkflow()];
      mockPrisma.approvalWorkflow.findMany.mockResolvedValue(workflows);

      const result = await service.listWorkflows(TENANT_ID);

      expect(result).toEqual({ data: workflows });
      expect(mockPrisma.approvalWorkflow.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        include: {
          approver_role: {
            select: {
              id: true,
              role_key: true,
              display_name: true,
              role_tier: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });
    });
  });

  describe('createWorkflow', () => {
    it('should create a workflow when role exists and no duplicate', async () => {
      const role = { id: ROLE_ID, role_key: 'admin' };
      mockRbacReadFacade.findRoleById.mockResolvedValue(role);
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(null);
      const created = buildMockWorkflow();
      mockPrisma.approvalWorkflow.create.mockResolvedValue(created);

      const result = await service.createWorkflow(TENANT_ID, {
        action_type: 'payroll_finalise',
        approver_role_id: ROLE_ID,
        is_enabled: true,
      });

      expect(result).toEqual(created);
      expect(mockPrisma.approvalWorkflow.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockRbacReadFacade.findRoleById.mockResolvedValue(null);

      await expect(
        service.createWorkflow(TENANT_ID, {
          action_type: 'payroll_finalise',
          approver_role_id: 'non-existent',
          is_enabled: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when workflow already exists for action type', async () => {
      const role = { id: ROLE_ID, role_key: 'admin' };
      mockRbacReadFacade.findRoleById.mockResolvedValue(role);
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());

      await expect(
        service.createWorkflow(TENANT_ID, {
          action_type: 'payroll_finalise',
          approver_role_id: ROLE_ID,
          is_enabled: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateWorkflow', () => {
    it('should update a workflow when it exists', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      const updated = buildMockWorkflow({ is_enabled: false });
      mockPrisma.approvalWorkflow.update.mockResolvedValue(updated);

      const result = await service.updateWorkflow(TENANT_ID, WORKFLOW_ID, {
        is_enabled: false,
      });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when workflow does not exist', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(null);

      await expect(
        service.updateWorkflow(TENANT_ID, 'non-existent', {
          is_enabled: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when new approver role does not exist', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      mockRbacReadFacade.findRoleById.mockResolvedValue(null);

      await expect(
        service.updateWorkflow(TENANT_ID, WORKFLOW_ID, {
          approver_role_id: 'non-existent-role',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip role validation when approver_role_id is not provided', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      const updated = buildMockWorkflow({ is_enabled: false });
      mockPrisma.approvalWorkflow.update.mockResolvedValue(updated);

      const result = await service.updateWorkflow(TENANT_ID, WORKFLOW_ID, {
        is_enabled: false,
      });

      expect(result).toEqual(updated);
      expect(mockRbacReadFacade.findRoleById).not.toHaveBeenCalled();
    });

    it('should update both approver_role_id and is_enabled when both provided', async () => {
      const newRole = { id: 'role-uuid-2', role_key: 'principal' };
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      mockRbacReadFacade.findRoleById.mockResolvedValue(newRole);
      const updated = buildMockWorkflow({
        approver_role_id: 'role-uuid-2',
        is_enabled: false,
      });
      mockPrisma.approvalWorkflow.update.mockResolvedValue(updated);

      const result = await service.updateWorkflow(TENANT_ID, WORKFLOW_ID, {
        approver_role_id: 'role-uuid-2',
        is_enabled: false,
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.approvalWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approver_role_id: 'role-uuid-2',
            is_enabled: false,
          }),
        }),
      );
    });

    it('edge: should build empty data object when neither field provided', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      const updated = buildMockWorkflow();
      mockPrisma.approvalWorkflow.update.mockResolvedValue(updated);

      const result = await service.updateWorkflow(TENANT_ID, WORKFLOW_ID, {});

      expect(result).toEqual(updated);
      // No role validation, no fields spread
      expect(mockRbacReadFacade.findRoleById).not.toHaveBeenCalled();
      expect(mockPrisma.approvalWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WORKFLOW_ID },
          data: {},
        }),
      );
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow when no pending requests exist', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      mockPrisma.approvalRequest.count.mockResolvedValue(0);
      mockPrisma.approvalWorkflow.delete.mockResolvedValue(undefined);

      const result = await service.deleteWorkflow(TENANT_ID, WORKFLOW_ID);

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.approvalWorkflow.delete).toHaveBeenCalledWith({
        where: { id: WORKFLOW_ID },
      });
    });

    it('should throw NotFoundException when workflow does not exist', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(null);

      await expect(service.deleteWorkflow(TENANT_ID, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when pending requests exist', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(buildMockWorkflow());
      mockPrisma.approvalRequest.count.mockResolvedValue(3);

      await expect(service.deleteWorkflow(TENANT_ID, WORKFLOW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
