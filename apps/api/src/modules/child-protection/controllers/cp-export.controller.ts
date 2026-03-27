import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import { cpExportGenerateSchema, cpExportPreviewSchema } from '@school/shared';
import type { Request, Response } from 'express';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CpAccessGuard } from '../guards/cp-access.guard';
import { CpExportService } from '../services/cp-export.service';

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/child-protection/export')
@ModuleEnabled('pastoral')
export class CpExportController {
  constructor(private readonly cpExportService: CpExportService) {}

  // ─── 1. Preview Export ──────────────────────────────────────────────────

  @Post('preview')
  @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, CpAccessGuard)
  @RequiresPermission('pastoral.export_tier3')
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(cpExportPreviewSchema))
    dto: { student_id: string; record_types?: string[]; date_from?: string; date_to?: string },
    @Req() req: Request,
  ) {
    return this.cpExportService.preview(
      tenant.tenant_id,
      user.sub,
      dto,
      req.ip ?? null,
    );
  }

  // ─── 2. Generate Export ─────────────────────────────────────────────────

  @Post('generate')
  @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard, CpAccessGuard)
  @RequiresPermission('pastoral.export_tier3')
  @HttpCode(HttpStatus.OK)
  async generate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(cpExportGenerateSchema))
    dto: {
      student_id: string;
      purpose: string;
      other_reason?: string;
      record_types?: string[];
      date_from?: string;
      date_to?: string;
      locale?: string;
    },
    @Req() req: Request,
  ) {
    return this.cpExportService.generate(
      tenant.tenant_id,
      user.sub,
      dto as Parameters<CpExportService['generate']>[2],
      req.ip ?? null,
    );
  }

  // ─── 3. Download Export (Token-Based) ───────────────────────────────────

  /**
   * Download endpoint uses the one-time download token as authentication.
   * The token itself proves the user was authorized at generation time.
   * No auth guard is applied — the token IS the authorization.
   */
  @Get('download/:token')
  @HttpCode(HttpStatus.OK)
  async download(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.cpExportService.download(
      token,
      req.ip ?? null,
    );

    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.buffer.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });

    res.send(result.buffer);
  }
}
