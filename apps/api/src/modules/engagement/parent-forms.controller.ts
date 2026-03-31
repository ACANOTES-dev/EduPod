import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { submitFormSchema } from '@school/shared';
import type { JwtPayload, SubmitFormDto, TenantContext } from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ConsentRecordsService } from './consent-records.service';
import { FormSubmissionsService } from './form-submissions.service';

// ─── Inline schemas ───────────────────────────────────────────────────────────

const revokeConsentSchema = z.object({
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/parent/engagement')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentFormsController {
  constructor(
    private readonly formSubmissionsService: FormSubmissionsService,
    private readonly consentRecordsService: ConsentRecordsService,
  ) {}

  // GET /v1/parent/engagement/pending-forms
  @Get('pending-forms')
  @RequiresPermission('parent.view_engagement')
  async getPendingForms(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.formSubmissionsService.getPendingFormsForParent(tenant.tenant_id, user.sub);
  }

  // GET /v1/parent/engagement/forms/:submissionId
  @Get('forms/:submissionId')
  @RequiresPermission('parent.view_engagement')
  async getSubmission(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    return this.formSubmissionsService.getSubmissionForParent(
      tenant.tenant_id,
      submissionId,
      user.sub,
    );
  }

  // POST /v1/parent/engagement/forms/:submissionId/submit
  @Post('forms/:submissionId/submit')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('parent.view_engagement')
  async submitForm(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body(new ZodValidationPipe(submitFormSchema)) dto: SubmitFormDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.formSubmissionsService.submit(
      tenant.tenant_id,
      submissionId,
      dto,
      user.sub,
      ipAddress,
      userAgent,
    );
  }

  // POST /v1/parent/engagement/consent/:consentId/revoke
  @Post('consent/:consentId/revoke')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('parent.view_engagement')
  async revokeConsent(
    @CurrentTenant() tenant: TenantContext,
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body(new ZodValidationPipe(revokeConsentSchema))
    dto: z.infer<typeof revokeConsentSchema>,
  ) {
    return this.consentRecordsService.revoke(tenant.tenant_id, consentId, dto.reason);
  }
}
