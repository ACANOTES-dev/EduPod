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

import { updateBrandingSchema } from '@school/shared';
import type { TenantContext, UpdateBrandingDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  createFileInterceptor,
  FILE_UPLOAD_PRESETS,
} from '../../common/interceptors/file-upload.interceptor';
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

  // Branding (school name, logo, colours) is non-sensitive tenant data
  // read by the shell layout for every role. Auth is still required so
  // the tenant context is resolvable, but no specific permission — only
  // the mutating endpoints below require `branding.manage`.
  @Get()
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
  @UseInterceptors(createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.IMAGE }))
  async uploadLogo(
    @CurrentTenant() tenant: TenantContext,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(apiError('FILE_REQUIRED', 'A file must be uploaded'));
    }

    return this.brandingService.uploadLogo(tenant.tenant_id, file);
  }
}
