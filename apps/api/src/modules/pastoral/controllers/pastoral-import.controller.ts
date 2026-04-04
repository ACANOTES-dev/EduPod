import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import { importConfirmSchema } from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { apiError } from '../../../common/errors/api-error';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import {
  createFileInterceptor,
  FILE_UPLOAD_PRESETS,
} from '../../../common/interceptors/file-upload.interceptor';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PastoralImportService } from '../services/pastoral-import.service';

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class PastoralImportController {
  constructor(private readonly importService: PastoralImportService) {}

  // ─── Validate ───────────────────────────────────────────────────────────────

  @Post('pastoral/import/validate')
  @RequiresPermission('pastoral.import_historical')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.CSV }))
  async validate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(apiError('FILE_REQUIRED', 'CSV file is required'));
    }

    return this.importService.validate(tenant.tenant_id, user.sub, file.buffer);
  }

  // ─── Confirm ────────────────────────────────────────────────────────────────

  @Post('pastoral/import/confirm')
  @RequiresPermission('pastoral.import_historical')
  @HttpCode(HttpStatus.CREATED)
  async confirm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(importConfirmSchema))
    body: z.infer<typeof importConfirmSchema>,
  ) {
    return this.importService.confirm(tenant.tenant_id, user.sub, body.validation_token);
  }

  // ─── Template ────────────────────────────────────────────────────────────────

  @Get('pastoral/import/template')
  @RequiresPermission('pastoral.import_historical')
  getTemplate(@Res() res: Response) {
    const buffer = this.importService.generateTemplate();
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="pastoral-import-template.csv"',
    });
    res.send(buffer);
  }
}
