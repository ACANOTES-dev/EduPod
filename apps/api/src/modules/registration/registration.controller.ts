import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { familyRegistrationSchema, previewFeesSchema } from '@school/shared';
import type {
  FamilyRegistrationDto,
  JwtPayload,
  PreviewFeesDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RegistrationService } from './registration.service';

@Controller('v1/registration')
@UseGuards(AuthGuard, PermissionGuard)
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('family/preview-fees')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async previewFees(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(previewFeesSchema)) dto: PreviewFeesDto,
  ) {
    return this.registrationService.previewFees(tenant.tenant_id, dto);
  }

  @Post('family')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async registerFamily(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(familyRegistrationSchema)) dto: FamilyRegistrationDto,
  ) {
    return this.registrationService.registerFamily(tenant.tenant_id, user.sub, dto);
  }
}
