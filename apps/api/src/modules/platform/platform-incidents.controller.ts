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

import {
  createPlatformIncidentTimelineEventSchema,
  listPlatformIncidentsQuerySchema,
  savePlatformIncidentPostmortemSchema,
  updatePlatformIncidentSchema,
  type CreatePlatformIncidentTimelineEventDto,
  type JwtPayload,
  type ListPlatformIncidentsQuery,
  type SavePlatformIncidentPostmortemDto,
  type UpdatePlatformIncidentDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { SkipPlatformAudit } from '../../common/decorators/skip-platform-audit.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformIncidentService } from './platform-incident.service';
import { PostmortemGeneratorService } from './postmortem-generator.service';

@Controller('v1/admin/incidents')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformIncidentsController {
  constructor(
    private readonly incidents: PlatformIncidentService,
    private readonly postmortems: PostmortemGeneratorService,
  ) {}

  // GET /v1/admin/incidents
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async list(
    @Query(new ZodValidationPipe(listPlatformIncidentsQuerySchema))
    query: ListPlatformIncidentsQuery,
  ) {
    return this.incidents.list(query);
  }

  // GET /v1/admin/incidents/:id
  @Get(':id')
  @RequiresPlatformPermission('platform.alerts.view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidents.get(id);
  }

  // PATCH /v1/admin/incidents/:id
  @Patch(':id')
  @RequiresPlatformPermission('platform.alerts.acknowledge')
  @SkipPlatformAudit('Incident status/title changes are persisted in platform_incidents timeline.')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePlatformIncidentSchema)) dto: UpdatePlatformIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.incidents.update(id, dto, user.sub);
  }

  // PATCH /v1/admin/incidents/:id/postmortem
  @Patch(':id/postmortem')
  @RequiresPlatformPermission('platform.alerts.acknowledge')
  @SkipPlatformAudit('Operator-edited postmortem final is persisted on platform_incidents.')
  async savePostmortem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(savePlatformIncidentPostmortemSchema))
    dto: SavePlatformIncidentPostmortemDto,
  ) {
    return this.incidents.saveFinalPostmortem(id, dto.postmortem_final);
  }

  // POST /v1/admin/incidents/:id/regenerate-postmortem
  @Post(':id/regenerate-postmortem')
  @RequiresPlatformPermission('platform.alerts.acknowledge')
  @SkipPlatformAudit('Postmortem generations are persisted on platform_incidents and AI messages.')
  async regeneratePostmortem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postmortems.generate(id, user.sub);
  }

  // POST /v1/admin/incidents/:id/timeline-events
  @Post(':id/timeline-events')
  @RequiresPlatformPermission('platform.alerts.acknowledge')
  @SkipPlatformAudit('Operator notes are persisted in platform_incident_timeline_events.')
  async addTimelineEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPlatformIncidentTimelineEventSchema))
    dto: CreatePlatformIncidentTimelineEventDto,
  ) {
    return this.incidents.addOperatorNote(id, dto);
  }

  // POST /v1/admin/incidents/:id/generate-prevention
  @Post(':id/generate-prevention')
  @RequiresPlatformPermission('platform.ai.read')
  @SkipPlatformAudit('Prevention recommendations are persisted as 4C recommendation rows.')
  async generatePrevention(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postmortems.generatePreventionRecommendations(id, user.sub);
  }
}
