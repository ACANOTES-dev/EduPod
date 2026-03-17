import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { promotionCommitSchema } from './dto/promotion-commit.dto';
import type { PromotionCommitDto } from './dto/promotion-commit.dto';
import { PromotionService } from './promotion.service';

@Controller('v1/promotion')
@UseGuards(AuthGuard, PermissionGuard)
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get('preview')
  @RequiresPermission('students.manage')
  async preview(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query('academic_year_id', ParseUUIDPipe) academicYearId: string,
  ) {
    return this.promotionService.preview(tenantContext.tenant_id, academicYearId);
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('students.manage')
  async commit(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(promotionCommitSchema)) dto: PromotionCommitDto,
  ) {
    return this.promotionService.commit(tenantContext.tenant_id, dto);
  }
}
