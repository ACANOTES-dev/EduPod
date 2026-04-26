import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { createLineItemSchema, type CreateLineItemDto } from './dto/create-line-item.dto';
import { updateLineItemSchema, type UpdateLineItemDto } from './dto/update-line-item.dto';
import { LineItemsService } from './line-items.service';

@Controller('v1/budgeting/financial-models/:modelId/line-items')
@UseGuards(AuthGuard, PermissionGuard)
export class LineItemsController {
  constructor(private readonly lineItemsService: LineItemsService) {}

  // POST /v1/budgeting/financial-models/:modelId/line-items
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCustom(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(createLineItemSchema)) dto: CreateLineItemDto,
  ) {
    return this.lineItemsService.createCustom(tenant.tenant_id, modelId, user.sub, dto);
  }

  // PATCH /v1/budgeting/financial-models/:modelId/line-items/:lineId
  @Patch(':lineId')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(new ZodValidationPipe(updateLineItemSchema)) dto: UpdateLineItemDto,
  ) {
    return this.lineItemsService.update(tenant.tenant_id, modelId, lineId, user.sub, dto);
  }

  // DELETE /v1/budgeting/financial-models/:modelId/line-items/:lineId
  @Delete(':lineId')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.lineItemsService.delete(tenant.tenant_id, modelId, lineId, user.sub);
  }

  // POST /v1/budgeting/financial-models/:modelId/line-items/:lineId/reset-to-derived
  @Post(':lineId/reset-to-derived')
  @RequiresPermission('budgeting.manage')
  async resetToDerived(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.lineItemsService.resetToDerived(tenant.tenant_id, modelId, lineId, user.sub);
  }
}
