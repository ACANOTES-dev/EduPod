import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateApprovalWorkflowDto, UpdateApprovalWorkflowDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApprovalWorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all approval workflows for a tenant, including approver role.
   */
  async listWorkflows(tenantId: string) {
    const workflows = await this.prisma.approvalWorkflow.findMany({
      where: { tenant_id: tenantId },
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

    return { data: workflows };
  }

  /**
   * Create an approval workflow.
   * Validates the action_type and approver_role existence.
   */
  async createWorkflow(tenantId: string, data: CreateApprovalWorkflowDto) {
    // Verify approver role exists and belongs to this tenant
    const role = await this.prisma.role.findFirst({
      where: {
        id: data.approver_role_id,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Approver role with id "${data.approver_role_id}" not found`,
      });
    }

    // Check for existing workflow with same action_type for this tenant
    const existing = await this.prisma.approvalWorkflow.findFirst({
      where: {
        tenant_id: tenantId,
        action_type: data.action_type,
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: 'WORKFLOW_EXISTS',
        message: `An approval workflow for action "${data.action_type}" already exists for this tenant`,
      });
    }

    const workflow = await this.prisma.approvalWorkflow.create({
      data: {
        tenant_id: tenantId,
        action_type: data.action_type,
        approver_role_id: data.approver_role_id,
        is_enabled: data.is_enabled,
      },
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
    });

    return workflow;
  }

  /**
   * Update an approval workflow.
   */
  async updateWorkflow(tenantId: string, workflowId: string, data: UpdateApprovalWorkflowDto) {
    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: {
        id: workflowId,
        tenant_id: tenantId,
      },
    });

    if (!workflow) {
      throw new NotFoundException({
        code: 'WORKFLOW_NOT_FOUND',
        message: `Approval workflow with id "${workflowId}" not found`,
      });
    }

    // If updating approver role, verify it exists
    if (data.approver_role_id) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: data.approver_role_id,
          OR: [{ tenant_id: tenantId }, { tenant_id: null }],
        },
      });

      if (!role) {
        throw new NotFoundException({
          code: 'ROLE_NOT_FOUND',
          message: `Approver role with id "${data.approver_role_id}" not found`,
        });
      }
    }

    const updated = await this.prisma.approvalWorkflow.update({
      where: { id: workflowId },
      data: {
        ...(data.approver_role_id !== undefined ? { approver_role_id: data.approver_role_id } : {}),
        ...(data.is_enabled !== undefined ? { is_enabled: data.is_enabled } : {}),
      },
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
    });

    return updated;
  }

  /**
   * Delete an approval workflow.
   * Blocks deletion if there are pending requests referencing this workflow.
   */
  async deleteWorkflow(tenantId: string, workflowId: string) {
    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: {
        id: workflowId,
        tenant_id: tenantId,
      },
    });

    if (!workflow) {
      throw new NotFoundException({
        code: 'WORKFLOW_NOT_FOUND',
        message: `Approval workflow with id "${workflowId}" not found`,
      });
    }

    // Check for pending requests with this action_type in this tenant
    const pendingCount = await this.prisma.approvalRequest.count({
      where: {
        tenant_id: tenantId,
        action_type: workflow.action_type,
        status: 'pending_approval',
      },
    });

    if (pendingCount > 0) {
      throw new BadRequestException({
        code: 'WORKFLOW_HAS_PENDING_REQUESTS',
        message: `Cannot delete workflow: ${pendingCount} pending request(s) reference this action type`,
      });
    }

    await this.prisma.approvalWorkflow.delete({
      where: { id: workflowId },
    });

    return { deleted: true };
  }
}
