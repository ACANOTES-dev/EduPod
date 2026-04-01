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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  actionFilterSchema,
  addSstMemberSchema,
  createManualAgendaItemSchema,
  createMeetingActionSchema,
  createMeetingSchema,
  meetingAttendeesJsonSchema,
  meetingFilterSchema,
  updateAgendaItemSchema,
  updateMeetingActionSchema,
  updateSstMemberSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { SstAgendaGeneratorService } from '../services/sst-agenda-generator.service';
import { SstMeetingService } from '../services/sst-meeting.service';
import { SstService } from '../services/sst.service';

/**
 * Inline schema for the general meeting update endpoint (PATCH /meetings/:id).
 * Accepts optional attendees and/or general_notes in a single body.
 */
const updateMeetingSchema = z.object({
  attendees: meetingAttendeesJsonSchema.optional(),
  general_notes: z.string().optional(),
});

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SstController {
  constructor(
    private readonly sstService: SstService,
    private readonly meetingService: SstMeetingService,
    private readonly agendaService: SstAgendaGeneratorService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROSTER
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. List All SST Members ─────────────────────────────────────────────

  @Get('pastoral/sst/members')
  @RequiresPermission('pastoral.view_tier2')
  async listMembers(@CurrentTenant() tenant: TenantContext) {
    return this.sstService.listMembers(tenant.tenant_id);
  }

  // ─── 2. List Active SST Members ─────────────────────────────────────────

  @Get('pastoral/sst/members/active')
  @RequiresPermission('pastoral.view_tier2')
  async listActiveMembers(@CurrentTenant() tenant: TenantContext) {
    return this.sstService.listMembers(tenant.tenant_id, { active: true });
  }

  // ─── 3. Add SST Member ──────────────────────────────────────────────────

  @Post('pastoral/sst/members')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(addSstMemberSchema))
    dto: z.infer<typeof addSstMemberSchema>,
  ) {
    return this.sstService.addMember(tenant.tenant_id, dto.user_id, dto, user.sub);
  }

  // ─── 4. Update SST Member ───────────────────────────────────────────────

  @Patch('pastoral/sst/members/:id')
  @RequiresPermission('pastoral.manage_sst')
  async updateMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSstMemberSchema))
    dto: z.infer<typeof updateSstMemberSchema>,
  ) {
    return this.sstService.updateMember(tenant.tenant_id, id, dto, user.sub);
  }

  // ─── 5. Remove SST Member ───────────────────────────────────────────────

  @Delete('pastoral/sst/members/:id')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.sstService.removeMember(tenant.tenant_id, id, user.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MEETINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 6. List Meetings ────────────────────────────────────────────────────

  @Get('pastoral/sst/meetings')
  @RequiresPermission('pastoral.view_tier2')
  async listMeetings(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(meetingFilterSchema))
    query: z.infer<typeof meetingFilterSchema>,
  ) {
    return this.meetingService.listMeetings(tenant.tenant_id, query);
  }

  // ─── 7. Get Meeting Detail ──────────────────────────────────────────────

  @Get('pastoral/sst/meetings/:id')
  @RequiresPermission('pastoral.view_tier2')
  async getMeeting(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetingService.getMeeting(tenant.tenant_id, id);
  }

  // ─── 8. Create Meeting ──────────────────────────────────────────────────

  @Post('pastoral/sst/meetings')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.CREATED)
  async createMeeting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createMeetingSchema))
    dto: z.infer<typeof createMeetingSchema>,
  ) {
    return this.meetingService.createMeeting(tenant.tenant_id, dto, user.sub);
  }

  // ─── 9. Update Meeting (attendees, general_notes) ───────────────────────

  @Patch('pastoral/sst/meetings/:id')
  @RequiresPermission('pastoral.manage_sst')
  async updateMeeting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMeetingSchema))
    dto: z.infer<typeof updateMeetingSchema>,
  ) {
    const meeting = await this.meetingService.getMeeting(tenant.tenant_id, id);
    this.meetingService.assertMeetingEditable(meeting);

    if (dto.attendees !== undefined) {
      await this.meetingService.updateAttendees(tenant.tenant_id, id, dto.attendees, user.sub);
    }

    if (dto.general_notes !== undefined) {
      await this.meetingService.updateGeneralNotes(
        tenant.tenant_id,
        id,
        dto.general_notes,
        user.sub,
      );
    }

    return this.meetingService.getMeeting(tenant.tenant_id, id);
  }

  // ─── 10. Start Meeting ──────────────────────────────────────────────────

  @Patch('pastoral/sst/meetings/:id/start')
  @RequiresPermission('pastoral.manage_sst')
  async startMeeting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.startMeeting(tenant.tenant_id, id, user.sub);
  }

  // ─── 11. Complete Meeting ───────────────────────────────────────────────

  @Patch('pastoral/sst/meetings/:id/complete')
  @RequiresPermission('pastoral.manage_sst')
  async completeMeeting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.completeMeeting(tenant.tenant_id, id, user.sub);
  }

  // ─── 12. Cancel Meeting ─────────────────────────────────────────────────

  @Patch('pastoral/sst/meetings/:id/cancel')
  @RequiresPermission('pastoral.manage_sst')
  async cancelMeeting(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.cancelMeeting(tenant.tenant_id, id, user.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AGENDA
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 13. Get Agenda Items ───────────────────────────────────────────────

  @Get('pastoral/sst/meetings/:id/agenda')
  @RequiresPermission('pastoral.view_tier2')
  async getAgenda(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetingService
      .getMeeting(tenant.tenant_id, id)
      .then((meeting) => meeting.agenda_items);
  }

  // ─── 14. Add Manual Agenda Item ─────────────────────────────────────────

  @Post('pastoral/sst/meetings/:id/agenda')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.CREATED)
  async addAgendaItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createManualAgendaItemSchema))
    dto: z.infer<typeof createManualAgendaItemSchema>,
  ) {
    const meeting = await this.meetingService.getMeeting(tenant.tenant_id, id);
    this.meetingService.assertMeetingEditable(meeting);

    return this.agendaService.addManualItem(tenant.tenant_id, id, dto, user.sub);
  }

  // ─── 15. Update Agenda Item ─────────────────────────────────────────────

  @Patch('pastoral/sst/meetings/:id/agenda/:itemId')
  @RequiresPermission('pastoral.manage_sst')
  async updateAgendaItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateAgendaItemSchema))
    dto: z.infer<typeof updateAgendaItemSchema>,
  ) {
    const meeting = await this.meetingService.getMeeting(tenant.tenant_id, id);
    this.meetingService.assertMeetingEditable(meeting);

    return this.agendaService.updateItem(tenant.tenant_id, id, itemId, dto, user.sub);
  }

  // ─── 16. Delete Manual Agenda Item ──────────────────────────────────────

  @Delete('pastoral/sst/meetings/:id/agenda/:itemId')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgendaItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    const meeting = await this.meetingService.getMeeting(tenant.tenant_id, id);
    this.meetingService.assertMeetingEditable(meeting);

    await this.agendaService.removeManualItem(tenant.tenant_id, id, itemId, user.sub);
  }

  // ─── 17. Refresh Agenda (re-run generation) ─────────────────────────────

  @Post('pastoral/sst/meetings/:id/agenda/refresh')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.OK)
  async refreshAgenda(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agendaService.generateAgenda(tenant.tenant_id, id, user.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 18. List Actions for Meeting ───────────────────────────────────────

  @Get('pastoral/sst/meetings/:id/actions')
  @RequiresPermission('pastoral.view_tier2')
  async listMeetingActions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.listActionsForMeeting(tenant.tenant_id, id);
  }

  // ─── 19. List All Actions ───────────────────────────────────────────────

  @Get('pastoral/sst/actions')
  @RequiresPermission('pastoral.view_tier2')
  async listAllActions(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(actionFilterSchema))
    query: z.infer<typeof actionFilterSchema>,
  ) {
    return this.meetingService.listAllActions(tenant.tenant_id, query);
  }

  // ─── 20. List My Actions ────────────────────────────────────────────────

  @Get('pastoral/sst/actions/my')
  @RequiresPermission('pastoral.view_tier2')
  async listMyActions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(actionFilterSchema))
    query: z.infer<typeof actionFilterSchema>,
  ) {
    return this.meetingService.listMyActions(tenant.tenant_id, user.sub, query);
  }

  // ─── 21. Create Action ──────────────────────────────────────────────────

  @Post('pastoral/sst/meetings/:id/actions')
  @RequiresPermission('pastoral.manage_sst')
  @HttpCode(HttpStatus.CREATED)
  async createAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createMeetingActionSchema))
    dto: z.infer<typeof createMeetingActionSchema>,
  ) {
    return this.meetingService.createAction(tenant.tenant_id, id, dto, user.sub);
  }

  // ─── 22. Update Action ──────────────────────────────────────────────────

  @Patch('pastoral/sst/actions/:id')
  @RequiresPermission('pastoral.view_tier2')
  async updateAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMeetingActionSchema))
    dto: z.infer<typeof updateMeetingActionSchema>,
  ) {
    return this.meetingService.updateAction(tenant.tenant_id, id, dto, user.sub);
  }

  // ─── 23. Complete Action ────────────────────────────────────────────────

  @Patch('pastoral/sst/actions/:id/complete')
  @RequiresPermission('pastoral.view_tier2')
  async completeAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetingService.completeAction(tenant.tenant_id, id, user.sub);
  }
}
