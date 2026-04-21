import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  createAwardTypeSchema,
  createCategorySchema,
  createDocumentTemplateSchema,
  createPolicyRuleSchema,
  createTemplateSchema,
  importPolicyRulesSchema,
  listDocumentTemplatesQuerySchema,
  listPolicyRulesQuerySchema,
  PolicyDryRunSchema,
  ReplayPolicyRuleSchema,
  updateAwardTypeSchema,
  updateCategorySchema,
  updateDocumentTemplateSchema,
  updatePolicyPrioritySchema,
  updatePolicyRuleSchema,
  updateTemplateSchema,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PolicyReplayService } from '../policy-engine/policy-replay.service';
import { PolicyRulesService } from '../policy-engine/policy-rules.service';

import { BehaviourConfigService } from './behaviour-config.service';
import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const listTemplatesQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
});

const listAwardTypesQuerySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  // `sort` and `order` are accepted from the frontend for forward-compat; the
  // service always orders by display_order asc, name asc so the inputs are
  // currently ignored — they're whitelisted so the Zod pipe doesn't 400.
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourConfigController {
  constructor(
    private readonly configService: BehaviourConfigService,
    private readonly policyRulesService: PolicyRulesService,
    private readonly policyReplayService: PolicyReplayService,
    private readonly documentTemplateService: BehaviourDocumentTemplateService,
  ) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('behaviour/categories')
  @RequiresPermission('behaviour.view')
  async listCategories(@CurrentTenant() tenant: TenantContext) {
    return this.configService.listCategories(tenant.tenant_id);
  }

  @Post('behaviour/categories')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCategorySchema))
    dto: z.infer<typeof createCategorySchema>,
  ) {
    return this.configService.createCategory(tenant.tenant_id, dto);
  }

  @Patch('behaviour/categories/:id')
  @RequiresPermission('behaviour.admin')
  async updateCategory(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema))
    dto: z.infer<typeof updateCategorySchema>,
  ) {
    return this.configService.updateCategory(tenant.tenant_id, id, dto);
  }

  // ─── Description Templates ────────────────────────────────────────────────

  @Get('behaviour/description-templates')
  @RequiresPermission('behaviour.view')
  async listTemplates(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listTemplatesQuerySchema))
    query: z.infer<typeof listTemplatesQuerySchema>,
  ) {
    return this.configService.listTemplates(tenant.tenant_id, query.category_id);
  }

  @Post('behaviour/description-templates')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTemplateSchema))
    dto: z.infer<typeof createTemplateSchema>,
  ) {
    return this.configService.createTemplate(tenant.tenant_id, dto);
  }

  @Patch('behaviour/description-templates/:id')
  @RequiresPermission('behaviour.admin')
  async updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema))
    dto: z.infer<typeof updateTemplateSchema>,
  ) {
    return this.configService.updateTemplate(tenant.tenant_id, id, dto);
  }

  // ─── Policy Rules CRUD ────────────────────────────────────────────────────

  @Get('behaviour/policies')
  @RequiresPermission('behaviour.admin')
  async listPolicies(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listPolicyRulesQuerySchema))
    query: z.infer<typeof listPolicyRulesQuerySchema>,
  ) {
    return this.policyRulesService.listRules(tenant.tenant_id, query);
  }

  @Post('behaviour/policies')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createPolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPolicyRuleSchema))
    dto: z.infer<typeof createPolicyRuleSchema>,
  ) {
    return this.policyRulesService.createRule(tenant.tenant_id, user.sub, dto);
  }

  @Get('behaviour/policies/export')
  @RequiresPermission('behaviour.admin')
  async exportPolicies(@CurrentTenant() tenant: TenantContext) {
    return this.policyRulesService.exportRules(tenant.tenant_id);
  }

  @Post('behaviour/policies/import')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async importPolicies(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(importPolicyRulesSchema))
    dto: z.infer<typeof importPolicyRulesSchema>,
  ) {
    return this.policyRulesService.importRules(tenant.tenant_id, user.sub, dto);
  }

  @Post('behaviour/policies/replay')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async replayPolicy(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(ReplayPolicyRuleSchema))
    dto: z.infer<typeof ReplayPolicyRuleSchema>,
  ) {
    return this.policyReplayService.replayRule(tenant.tenant_id, dto);
  }

  // POST /v1/behaviour/policies/replay/preview — alias surfaced for Wave 6 UI
  // semantics: the underlying replayRule is non-persisting (dry-run), so the
  // preview endpoint shares the same service call but names the intent
  // explicitly for callers that want "just the counts, nothing applied".
  @Post('behaviour/policies/replay/preview')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async replayPolicyPreview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(ReplayPolicyRuleSchema))
    dto: z.infer<typeof ReplayPolicyRuleSchema>,
  ) {
    return this.policyReplayService.replayRule(tenant.tenant_id, { ...dto, dry_run: true });
  }

  @Get('behaviour/policies/:id')
  @RequiresPermission('behaviour.admin')
  async getPolicy(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.policyRulesService.getRule(tenant.tenant_id, id);
  }

  @Patch('behaviour/policies/:id')
  @RequiresPermission('behaviour.admin')
  async updatePolicy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePolicyRuleSchema))
    dto: z.infer<typeof updatePolicyRuleSchema>,
  ) {
    return this.policyRulesService.updateRule(tenant.tenant_id, id, user.sub, dto);
  }

  @Delete('behaviour/policies/:id')
  @RequiresPermission('behaviour.admin')
  async deletePolicy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.policyRulesService.deleteRule(tenant.tenant_id, id);
  }

  @Get('behaviour/policies/:id/versions')
  @RequiresPermission('behaviour.admin')
  async getPolicyVersions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.policyRulesService.getVersionHistory(tenant.tenant_id, id);
  }

  @Get('behaviour/policies/:id/versions/:version')
  @RequiresPermission('behaviour.admin')
  async getPolicyVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.policyRulesService.getVersion(tenant.tenant_id, id, version);
  }

  @Patch('behaviour/policies/:id/priority')
  @RequiresPermission('behaviour.admin')
  async updatePolicyPriority(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePolicyPrioritySchema))
    dto: z.infer<typeof updatePolicyPrioritySchema>,
  ) {
    return this.policyRulesService.updatePriority(tenant.tenant_id, id, dto);
  }

  // ─── Document Templates ─────────────────────────────────────────────────────

  @Get('behaviour/document-templates')
  @RequiresPermission('behaviour.admin')
  async listDocumentTemplates(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listDocumentTemplatesQuerySchema))
    query: z.infer<typeof listDocumentTemplatesQuerySchema>,
  ) {
    return this.documentTemplateService.listTemplates(tenant.tenant_id, query);
  }

  @Post('behaviour/document-templates')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createDocumentTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDocumentTemplateSchema))
    dto: z.infer<typeof createDocumentTemplateSchema>,
  ) {
    return this.documentTemplateService.createTemplate(tenant.tenant_id, dto);
  }

  @Patch('behaviour/document-templates/:id')
  @RequiresPermission('behaviour.admin')
  async updateDocumentTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentTemplateSchema))
    dto: z.infer<typeof updateDocumentTemplateSchema>,
  ) {
    return this.documentTemplateService.updateTemplate(tenant.tenant_id, id, dto);
  }

  // ─── Award Types ──────────────────────────────────────────────────────────

  @Get('behaviour/award-types')
  @RequiresPermission('behaviour.view')
  async listAwardTypes(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listAwardTypesQuerySchema))
    query: z.infer<typeof listAwardTypesQuerySchema>,
  ) {
    return this.configService.listAwardTypes(tenant.tenant_id, { pageSize: query.pageSize });
  }

  @Post('behaviour/award-types')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.CREATED)
  async createAwardType(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createAwardTypeSchema))
    dto: z.infer<typeof createAwardTypeSchema>,
  ) {
    return this.configService.createAwardType(tenant.tenant_id, dto);
  }

  @Patch('behaviour/award-types/:id')
  @RequiresPermission('behaviour.admin')
  async updateAwardType(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAwardTypeSchema))
    dto: z.infer<typeof updateAwardTypeSchema>,
  ) {
    return this.configService.updateAwardType(tenant.tenant_id, id, dto);
  }

  @Delete('behaviour/award-types/:id')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAwardType(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.configService.deleteAwardType(tenant.tenant_id, id);
  }

  // ─── Admin Dry-Run ────────────────────────────────────────────────────────

  @Post('behaviour/admin/policy-dry-run')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async policyDryRun(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(PolicyDryRunSchema))
    dto: z.infer<typeof PolicyDryRunSchema>,
  ) {
    return this.policyReplayService.dryRun(tenant.tenant_id, dto);
  }

  // POST /v1/behaviour/policy-dry-run — top-level alias per impl 09 spec.
  // Semantically identical to /admin/policy-dry-run; the top-level path is
  // the canonical surface for the Wave 6 policy UI.
  @Post('behaviour/policy-dry-run')
  @RequiresPermission('behaviour.admin')
  @HttpCode(HttpStatus.OK)
  async policyDryRunTopLevel(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(PolicyDryRunSchema))
    dto: z.infer<typeof PolicyDryRunSchema>,
  ) {
    return this.policyReplayService.dryRun(tenant.tenant_id, dto);
  }
}
