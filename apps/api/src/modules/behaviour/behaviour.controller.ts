import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';

import {
  bulkPositiveSchema,
  createIncidentSchema,
  createParticipantSchema,
  listIncidentsQuerySchema,
  quickLogSchema,
  recordFollowUpSchema,
  statusTransitionSchema,
  updateIncidentSchema,
  uploadBehaviourAttachmentSchema,
  withdrawIncidentSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourService } from './behaviour.service';
import { PolicyReplayService } from './policy/policy-replay.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourController {
  constructor(
    private readonly behaviourService: BehaviourService,
    private readonly quickLogService: BehaviourQuickLogService,
    private readonly historyService: BehaviourHistoryService,
    private readonly attachmentService: BehaviourAttachmentService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly policyReplayService: PolicyReplayService,
  ) {}

  // ─── Incident CRUD ──────────────────────────────────────────────────────────

  @Post('behaviour/incidents')
  @RequiresPermission('behaviour.log')
  @HttpCode(HttpStatus.CREATED)
  async createIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createIncidentSchema))
    dto: z.infer<typeof createIncidentSchema>,
  ) {
    return this.behaviourService.createIncident(tenant.tenant_id, user.sub, dto);
  }

  @Post('behaviour/incidents/quick')
  @RequiresPermission('behaviour.log')
  @HttpCode(HttpStatus.CREATED)
  async quickLog(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(quickLogSchema))
    dto: z.infer<typeof quickLogSchema>,
  ) {
    return this.quickLogService.quickLog(tenant.tenant_id, user.sub, dto);
  }

  @Post('behaviour/incidents/bulk-positive')
  @RequiresPermission('behaviour.log')
  @HttpCode(HttpStatus.CREATED)
  async bulkPositive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkPositiveSchema))
    dto: z.infer<typeof bulkPositiveSchema>,
  ) {
    return this.quickLogService.bulkPositive(tenant.tenant_id, user.sub, dto);
  }

  @Post('behaviour/incidents/ai-parse')
  @RequiresPermission('behaviour.log')
  @HttpCode(HttpStatus.OK)
  async aiParse() {
    // STUB: AI parse endpoint -- will be implemented in a later phase
    return { data: null, message: 'AI parse not yet implemented' };
  }

  @Get('behaviour/incidents')
  @RequiresPermission('behaviour.view')
  async listIncidents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listIncidentsQuerySchema))
    query: z.infer<typeof listIncidentsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.behaviourService.listIncidents(tenant.tenant_id, user.sub, permissions, query);
  }

  @Get('behaviour/incidents/my')
  @RequiresPermission('behaviour.log')
  async getMyIncidents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.behaviourService.getMyIncidents(
      tenant.tenant_id,
      user.sub,
      query.page,
      query.pageSize,
    );
  }

  @Get('behaviour/incidents/feed')
  @RequiresPermission('behaviour.view')
  async getFeed(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(feedQuerySchema))
    query: z.infer<typeof feedQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.behaviourService.getFeed(
      tenant.tenant_id,
      user.sub,
      permissions,
      query.page,
      query.pageSize,
    );
  }

  @Get('behaviour/incidents/:id')
  @RequiresPermission('behaviour.view')
  async getIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.behaviourService.getIncident(tenant.tenant_id, id, user.sub, permissions);
  }

  @Patch('behaviour/incidents/:id')
  @RequiresPermission('behaviour.manage')
  async updateIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIncidentSchema))
    dto: z.infer<typeof updateIncidentSchema>,
  ) {
    return this.behaviourService.updateIncident(tenant.tenant_id, id, user.sub, dto);
  }

  @Patch('behaviour/incidents/:id/status')
  @RequiresPermission('behaviour.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusTransitionSchema))
    dto: z.infer<typeof statusTransitionSchema>,
  ) {
    return this.behaviourService.transitionStatus(tenant.tenant_id, id, user.sub, dto);
  }

  @Post('behaviour/incidents/:id/withdraw')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async withdrawIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawIncidentSchema))
    dto: z.infer<typeof withdrawIncidentSchema>,
  ) {
    return this.behaviourService.withdrawIncident(tenant.tenant_id, id, user.sub, dto);
  }

  @Post('behaviour/incidents/:id/follow-up')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async recordFollowUp(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordFollowUpSchema))
    dto: z.infer<typeof recordFollowUpSchema>,
  ) {
    return this.attachmentService.recordFollowUp(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── Participants ───────────────────────────────────────────────────────────

  @Post('behaviour/incidents/:id/participants')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async addParticipant(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createParticipantSchema))
    dto: z.infer<typeof createParticipantSchema>,
  ) {
    return this.behaviourService.addParticipant(tenant.tenant_id, id, user.sub, dto);
  }

  @Delete('behaviour/incidents/:id/participants/:pid')
  @RequiresPermission('behaviour.manage')
  async removeParticipant(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
  ) {
    return this.behaviourService.removeParticipant(tenant.tenant_id, id, pid, user.sub);
  }

  // ─── Attachments ────────────────────────────────────────────────────────────

  @Post('behaviour/incidents/:id/attachments')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body(new ZodValidationPipe(uploadBehaviourAttachmentSchema))
    dto: z.infer<typeof uploadBehaviourAttachmentSchema>,
  ) {
    return this.attachmentService.uploadAttachment(tenant.tenant_id, user.sub, id, file, dto);
  }

  @Get('behaviour/incidents/:id/attachments')
  @RequiresPermission('behaviour.view')
  async listAttachments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attachmentService.listAttachments(tenant.tenant_id, id);
  }

  @Get('behaviour/incidents/:id/attachments/:aid')
  @RequiresPermission('behaviour.view')
  async downloadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
  ) {
    return this.attachmentService.getAttachment(tenant.tenant_id, user.sub, id, aid);
  }

  // ─── History ───────────────────────────────────────────────────────────────

  @Get('behaviour/incidents/:id/history')
  @RequiresPermission('behaviour.manage')
  async getIncidentHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.historyService.getHistory(
      tenant.tenant_id,
      'incident',
      id,
      query.page,
      query.pageSize,
    );
  }

  // ─── Policy Evaluation Trace ────────────────────────────────────────────────

  @Get('behaviour/incidents/:id/policy-evaluation')
  @RequiresPermission('behaviour.manage')
  async getPolicyEvaluation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.policyReplayService.getIncidentEvaluationTrace(tenant.tenant_id, id);
  }

  // ─── Quick-Log Context ─────────────────────────────────────────────────────

  @Get('behaviour/quick-log/context')
  @RequiresPermission('behaviour.log')
  async getQuickLogContext(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.quickLogService.getContext(tenant.tenant_id, user.sub);
  }

  @Get('behaviour/quick-log/templates')
  @RequiresPermission('behaviour.log')
  async getQuickLogTemplates(@CurrentTenant() tenant: TenantContext) {
    // Templates are included in the context response, but this provides a
    // separate endpoint for template-only refresh without full context reload.
    const context = await this.quickLogService.getContext(
      tenant.tenant_id,
      '', // userId not needed for templates
    );
    return { data: context.templates };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
