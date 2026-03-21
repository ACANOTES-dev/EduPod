import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { updateBrandingSchema } from '@school/shared';
import type { TenantContext, UpdateBrandingDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BrandingService } from './branding.service';

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('v1/branding')
@UseGuards(AuthGuard, PermissionGuard)
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get()
  @RequiresPermission('branding.manage')
  async getBranding(@CurrentTenant() tenant: TenantContext) {
    return this.brandingService.getBranding(tenant.tenant_id);
  }

  @Patch()
  @RequiresPermission('branding.manage')
  async updateBranding(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateBrandingSchema)) dto: UpdateBrandingDto,
  ) {
    return this.brandingService.updateBranding(tenant.tenant_id, dto);
  }

  @Post('logo')
  @RequiresPermission('branding.manage')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @CurrentTenant() tenant: TenantContext,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file must be uploaded',
      });
    }

    return this.brandingService.uploadLogo(tenant.tenant_id, file);
  }
}
