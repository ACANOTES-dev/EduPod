import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { paginationQuerySchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ConsentRecordsService } from './consent-records.service';

// ─── Query schemas ────────────────────────────────────────────────────────────

const listConsentRecordsQuerySchema = paginationQuerySchema.extend({
  student_id: z.string().uuid().optional(),
  consent_type: z.enum(['one_time', 'annual', 'standing']).optional(),
  form_type: z.enum(['consent_form', 'risk_assessment', 'survey', 'policy_signoff']).optional(),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/engagement/consent-records')
@UseGuards(AuthGuard, PermissionGuard)
export class ConsentRecordsController {
  constructor(private readonly consentRecordsService: ConsentRecordsService) {}

  // GET /v1/engagement/consent-records
  @Get()
  @RequiresPermission('engagement.consent_archive.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listConsentRecordsQuerySchema))
    query: z.infer<typeof listConsentRecordsQuerySchema>,
  ) {
    return this.consentRecordsService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/engagement/consent-records/student/:studentId
  @Get('student/:studentId')
  @RequiresPermission('engagement.consent_archive.view')
  async findByStudent(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.consentRecordsService.findByStudent(tenant.tenant_id, studentId);
  }
}
