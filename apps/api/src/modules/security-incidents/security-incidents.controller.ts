import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import {
  notifyControllersSchema,
  notifyDpcSchema,
  type NotifyControllersDto,
  type NotifyDpcDto,
} from '@school/shared/security';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { createIncidentEventSchema } from './dto/create-incident-event.dto';
import type { CreateIncidentEventDto } from './dto/create-incident-event.dto';
import { createSecurityIncidentSchema } from './dto/create-security-incident.dto';
import type { CreateSecurityIncidentDto } from './dto/create-security-incident.dto';
import { listSecurityIncidentsSchema } from './dto/list-security-incidents-query.dto';
import type { ListSecurityIncidentsDto } from './dto/list-security-incidents-query.dto';
import { updateSecurityIncidentSchema } from './dto/update-security-incident.dto';
import type { UpdateSecurityIncidentDto } from './dto/update-security-incident.dto';
import { SecurityIncidentsService } from './security-incidents.service';

@Controller('v1/admin/security-incidents')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class SecurityIncidentsController {
  constructor(private readonly service: SecurityIncidentsService) {}

  // GET /v1/admin/security-incidents
  @Get()
  @RequiresPlatformPermission('platform.audit_log.view')
  async list(
    @Query(new ZodValidationPipe(listSecurityIncidentsSchema))
    query: ListSecurityIncidentsDto,
  ) {
    return this.service.list(query);
  }

  // POST /v1/admin/security-incidents
  @Post()
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit('Security incidents maintain their own incident event ledger.')
  async create(
    @Body(new ZodValidationPipe(createSecurityIncidentSchema))
    dto: CreateSecurityIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(dto, user.sub);
  }

  // GET /v1/admin/security-incidents/:id
  @Get(':id')
  @RequiresPlatformPermission('platform.audit_log.view')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  // PATCH /v1/admin/security-incidents/:id
  @Patch(':id')
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit('Security incidents maintain their own incident event ledger.')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSecurityIncidentSchema))
    dto: UpdateSecurityIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  // POST /v1/admin/security-incidents/:id/events
  @Post(':id/events')
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit('Security incidents maintain their own incident event ledger.')
  async addEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createIncidentEventSchema))
    dto: CreateIncidentEventDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addEvent(id, dto, user.sub);
  }

  // POST /v1/admin/security-incidents/:id/notify-controllers
  @Post(':id/notify-controllers')
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit('Security incidents maintain their own incident event ledger.')
  async notifyControllers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(notifyControllersSchema))
    dto: NotifyControllersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.notifyControllers(id, dto, user.sub);
  }

  // POST /v1/admin/security-incidents/:id/notify-dpc
  @Post(':id/notify-dpc')
  @RequiresPlatformPermission('platform.audit_log.view')
  @SkipPlatformAudit('Security incidents maintain their own incident event ledger.')
  async notifyDpc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(notifyDpcSchema))
    dto: NotifyDpcDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.notifyDpc(id, dto, user.sub);
  }
}
