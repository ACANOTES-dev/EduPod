import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  initTier3ExportSchema,
  reportFilterSchema,
  studentSummaryOptionsSchema,
} from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PastoralExportService } from '../services/pastoral-export.service';
import { PastoralReportService } from '../services/pastoral-report.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class PastoralReportsController {
  constructor(
    private readonly reportService: PastoralReportService,
    private readonly exportService: PastoralExportService,
  ) {}

  // ─── Report Endpoints ───────────────────────────────────────────────────────

  // 1. Student Summary (JSON)

  @Get('pastoral/reports/student-summary/:studentId')
  @RequiresPermission('pastoral.view_reports')
  async getStudentSummary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(studentSummaryOptionsSchema))
    query: z.infer<typeof studentSummaryOptionsSchema>,
  ) {
    return this.reportService.getStudentSummary(tenant.tenant_id, user.sub, studentId, query);
  }

  // 2. Student Summary (PDF)

  @Get('pastoral/reports/student-summary/:studentId/pdf')
  @RequiresPermission('pastoral.view_reports')
  async getStudentSummaryPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('locale') locale: string = 'en',
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.exportStudentSummary(
      tenant.tenant_id,
      user.sub,
      studentId,
      locale,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pastoral-student-summary.pdf"',
    });
    res.end(buffer);
  }

  // 3. SST Activity (JSON)

  @Get('pastoral/reports/sst-activity')
  @RequiresPermission('pastoral.view_reports')
  async getSstActivity(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
  ) {
    return this.reportService.getSstActivity(tenant.tenant_id, user.sub, query);
  }

  // 4. SST Activity (PDF)

  @Get('pastoral/reports/sst-activity/pdf')
  @RequiresPermission('pastoral.view_reports')
  async getSstActivityPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
    @Query('locale') locale: string = 'en',
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.exportSstActivity(
      tenant.tenant_id,
      user.sub,
      query,
      locale,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pastoral-sst-activity.pdf"',
    });
    res.end(buffer);
  }

  // 5. Safeguarding Compliance (JSON)

  @Get('pastoral/reports/safeguarding-compliance')
  @RequiresPermission('pastoral.view_reports')
  async getSafeguardingCompliance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
  ) {
    return this.reportService.getSafeguardingCompliance(tenant.tenant_id, user.sub, query);
  }

  // 6. Safeguarding Compliance (PDF)

  @Get('pastoral/reports/safeguarding-compliance/pdf')
  @RequiresPermission('pastoral.view_reports')
  async getSafeguardingCompliancePdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
    @Query('locale') locale: string = 'en',
    @Res() res: Response,
  ) {
    const data = await this.reportService.getSafeguardingCompliance(
      tenant.tenant_id,
      user.sub,
      query,
    );
    const buffer = await this.exportService.renderPdf(
      'safeguarding-compliance',
      data,
      locale,
      tenant.tenant_id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pastoral-safeguarding-compliance.pdf"',
    });
    res.end(buffer);
  }

  // 7. Wellbeing Programme (JSON)

  @Get('pastoral/reports/wellbeing-programme')
  @RequiresPermission('pastoral.view_reports')
  async getWellbeingProgramme(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
  ) {
    return this.reportService.getWellbeingProgramme(tenant.tenant_id, user.sub, query);
  }

  // 8. Wellbeing Programme (PDF)

  @Get('pastoral/reports/wellbeing-programme/pdf')
  @RequiresPermission('pastoral.view_reports')
  async getWellbeingProgrammePdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
    @Query('locale') locale: string = 'en',
    @Res() res: Response,
  ) {
    const data = await this.reportService.getWellbeingProgramme(tenant.tenant_id, user.sub, query);
    const buffer = await this.exportService.renderPdf(
      'wellbeing-programme',
      data,
      locale,
      tenant.tenant_id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pastoral-wellbeing-programme.pdf"',
    });
    res.end(buffer);
  }

  // 9. DES Inspection (PDF only)

  @Get('pastoral/reports/des-inspection/pdf')
  @RequiresPermission('pastoral.view_reports')
  async getDesInspectionPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
    @Query('locale') locale: string = 'en',
    @Res() res: Response,
  ) {
    const data = await this.reportService.getDesInspection(tenant.tenant_id, user.sub, query);
    const buffer = await this.exportService.renderPdf(
      'des-inspection',
      data,
      locale,
      tenant.tenant_id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pastoral-des-inspection.pdf"',
    });
    res.end(buffer);
  }

  // ─── Export Endpoints ───────────────────────────────────────────────────────

  // 10. Export Student Summary (Tier 1/2)

  @Post('pastoral/exports/student-summary/:studentId')
  @RequiresPermission('pastoral.export_tier1_2')
  @HttpCode(HttpStatus.OK)
  async exportStudentSummary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('locale') locale: string = 'en',
  ) {
    return this.exportService.exportStudentSummary(tenant.tenant_id, user.sub, studentId, locale);
  }

  // 11. Export SST Activity (Tier 1/2)

  @Post('pastoral/exports/sst-activity')
  @RequiresPermission('pastoral.export_tier1_2')
  @HttpCode(HttpStatus.OK)
  async exportSstActivity(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(reportFilterSchema))
    query: z.infer<typeof reportFilterSchema>,
    @Query('locale') locale: string = 'en',
  ) {
    return this.exportService.exportSstActivity(tenant.tenant_id, user.sub, query, locale);
  }

  // 12. Init Tier 3 Export

  @Post('pastoral/exports/tier3/init')
  @RequiresPermission('pastoral.export_tier3')
  @HttpCode(HttpStatus.OK)
  async initTier3Export(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(initTier3ExportSchema))
    body: z.infer<typeof initTier3ExportSchema>,
  ) {
    return this.exportService.initTier3Export(tenant.tenant_id, user.sub, body);
  }

  // 13. Confirm Tier 3 Export

  @Post('pastoral/exports/tier3/:exportId/confirm')
  @RequiresPermission('pastoral.export_tier3')
  @HttpCode(HttpStatus.OK)
  async confirmTier3Export(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    return this.exportService.confirmTier3Export(tenant.tenant_id, user.sub, exportId);
  }

  // 14. Download Tier 3 Export

  @Get('pastoral/exports/tier3/:exportId/download')
  @RequiresPermission('pastoral.export_tier3')
  async downloadTier3Export(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    return this.exportService.downloadTier3Export(tenant.tenant_id, user.sub, exportId);
  }
}
