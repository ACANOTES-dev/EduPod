import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { createFileInterceptor } from '../../../common/interceptors/file-upload.interceptor';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { updateReportCardTenantSettingsSchema } from './dto/tenant-settings.dto';
import type { UpdateReportCardTenantSettingsDto } from './dto/tenant-settings.dto';
import { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';

// ─── Signature multipart types ───────────────────────────────────────────────

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const SIGNATURE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1/report-card-tenant-settings')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardTenantSettingsController {
  constructor(private readonly settingsService: ReportCardTenantSettingsService) {}

  // GET /v1/report-card-tenant-settings
  @Get()
  @RequiresPermission('report_cards.view')
  async get(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.settingsService.get(tenant.tenant_id);
  }

  // PATCH /v1/report-card-tenant-settings
  @Patch()
  @RequiresPermission('report_cards.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateReportCardTenantSettingsSchema))
    dto: UpdateReportCardTenantSettingsDto,
  ) {
    return this.settingsService.update(tenant.tenant_id, user.sub, dto);
  }

  // POST /v1/report-card-tenant-settings/principal-signature — multipart/form-data
  @Post('principal-signature')
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    createFileInterceptor({
      allowedMimes: SIGNATURE_MIMES,
      maxSizeMb: 2,
    }),
  )
  async uploadPrincipalSignature(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { principal_name?: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A signature file must be uploaded under the "file" field',
      });
    }

    return this.settingsService.uploadPrincipalSignature(tenant.tenant_id, user.sub, file, {
      principalName: body?.principal_name ?? null,
    });
  }

  // DELETE /v1/report-card-tenant-settings/principal-signature
  @Delete('principal-signature')
  @RequiresPermission('report_cards.manage')
  async deletePrincipalSignature(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settingsService.deletePrincipalSignature(tenant.tenant_id, user.sub);
  }
}
