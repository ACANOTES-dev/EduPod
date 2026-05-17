import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import {
  type JwtPayload,
  updateEmergencyContactSchema,
  type UpdateEmergencyContactDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { EmergencyContactService } from './emergency-contact.service';

@Controller('v1/admin/emergency-contacts')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class EmergencyContactController {
  constructor(private readonly contacts: EmergencyContactService) {}

  // GET /v1/admin/emergency-contacts/me
  @Get('me')
  @RequiresPlatformPermission('platform.profile.view')
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.contacts.getMe(user.sub);
  }

  // PATCH /v1/admin/emergency-contacts/me
  @Patch('me')
  @RequiresPlatformPermission('platform.profile.manage')
  async updateMe(
    @Body(new ZodValidationPipe(updateEmergencyContactSchema)) dto: UpdateEmergencyContactDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.contacts.updateMe(user.sub, dto, auditContextFromRequest(user, request));
  }
}
