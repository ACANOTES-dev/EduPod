import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  familyRegistrationSchema,
  previewFeesSchema,
} from '@school/shared';
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
  private readonly logger = new Logger(RegistrationController.name);

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
    try {
      return await this.registrationService.registerFamily(tenant.tenant_id, user.sub, dto);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Registration failed: ${message}`, stack);
      throw new HttpException(
        { error: { code: 'REGISTRATION_ERROR', message, details: { stack: stack?.split('\n').slice(0, 5) } } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
