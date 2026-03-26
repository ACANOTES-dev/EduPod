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
import {
  createCategorySchema,
  createPolicyRuleSchema,
  createTemplateSchema,
  importPolicyRulesSchema,
  listPolicyRulesQuerySchema,
  PolicyDryRunSchema,
  ReplayPolicyRuleSchema,
  updateCategorySchema,
  updatePolicyPrioritySchema,
  updatePolicyRuleSchema,
  updateTemplateSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourConfigService } from './behaviour-config.service';
import { PolicyReplayService } from './policy/policy-replay.service';
import { PolicyRulesService } from './policy/policy-rules.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const listTemplatesQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourConfigController {
  constructor(
    private readonly configService: BehaviourConfigService,
    private readonly policyRulesService: PolicyRulesService,
    private readonly policyReplayService: PolicyReplayService,
  ) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('behaviour/categories')
  @RequiresPermission('behaviour.view')
  async listCategories(
    @CurrentTenant() tenant: TenantContext,
  ) {
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
    return this.configService.listTemplates(
      tenant.tenant_id,
      query.category_id,
    );
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
    return this.policyRulesService.createRule(
      tenant.tenant_id,
      user.sub,
      dto,
    );
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
    return this.policyRulesService.importRules(
      tenant.tenant_id,
      user.sub,
      dto,
    );
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

  @Get('behaviour/policies/:id')
  @RequiresPermission('behaviour.admin')
  async getPolicy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
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
    return this.policyRulesService.updateRule(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
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
}
