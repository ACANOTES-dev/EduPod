import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createApprovalWorkflowSchema,
  updateApprovalWorkflowSchema,
} from '@school/shared';
import type {
  CreateApprovalWorkflowDto,
  TenantContext,
  UpdateApprovalWorkflowDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ApprovalWorkflowsService } from './approval-workflows.service';

@Controller('v1/approval-workflows')
@UseGuards(AuthGuard, PermissionGuard)
export class ApprovalWorkflowsController {
  constructor(
    private readonly workflowsService: ApprovalWorkflowsService,
  ) {}

  @Get()
  @RequiresPermission('approvals.view')
  async listWorkflows(@CurrentTenant() tenant: TenantContext) {
    return this.workflowsService.listWorkflows(tenant.tenant_id);
  }

  @Post()
  @RequiresPermission('approvals.manage')
  async createWorkflow(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createApprovalWorkflowSchema))
    dto: CreateApprovalWorkflowDto,
  ) {
    return this.workflowsService.createWorkflow(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('approvals.manage')
  async updateWorkflow(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApprovalWorkflowSchema))
    dto: UpdateApprovalWorkflowDto,
  ) {
    return this.workflowsService.updateWorkflow(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async deleteWorkflow(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflowsService.deleteWorkflow(tenant.tenant_id, id);
  }
}
