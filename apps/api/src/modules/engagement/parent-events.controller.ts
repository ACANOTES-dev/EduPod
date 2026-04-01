import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EngagementEventStatus } from '@prisma/client';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PrismaService } from '../prisma/prisma.service';

import { EventParticipantsService } from './event-participants.service';
import { EventsService } from './events.service';

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/parent/engagement/events')
@ModuleEnabled('engagement')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ParentEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly eventParticipantsService: EventParticipantsService,
  ) {}

  // GET /v1/parent/engagement/events
  @Get()
  @RequiresPermission('parent.view_engagement')
  async listEvents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const studentIds = await this.getParentStudentIds(user.sub, tenant.tenant_id);

    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
    const skip = (pageNum - 1) * pageSizeNum;

    const where = {
      tenant_id: tenant.tenant_id,
      status: {
        in: [
          EngagementEventStatus.open,
          EngagementEventStatus.closed,
          EngagementEventStatus.in_progress,
          EngagementEventStatus.completed,
        ],
      },
      participants: { some: { student_id: { in: studentIds } } },
    };

    const [data, total] = await Promise.all([
      this.prisma.engagementEvent.findMany({
        where,
        skip,
        take: pageSizeNum,
        orderBy: { start_date: 'desc' },
        select: {
          id: true,
          title: true,
          title_ar: true,
          event_type: true,
          status: true,
          start_date: true,
          end_date: true,
          location: true,
          location_ar: true,
          fee_amount: true,
          consent_deadline: true,
          payment_deadline: true,
          participants: {
            where: { student_id: { in: studentIds } },
            select: {
              id: true,
              student_id: true,
              status: true,
              consent_status: true,
              payment_status: true,
            },
          },
        },
      }),
      this.prisma.engagementEvent.count({ where }),
    ]);

    return {
      data: data.map((e) => ({
        ...e,
        fee_amount: e.fee_amount ? Number(e.fee_amount) : null,
      })),
      meta: { page: pageNum, pageSize: pageSizeNum, total },
    };
  }

  // GET /v1/parent/engagement/events/:id
  @Get(':id')
  @RequiresPermission('parent.view_engagement')
  async getEvent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const studentIds = await this.getParentStudentIds(user.sub, tenant.tenant_id);
    const event = await this.eventsService.findOne(tenant.tenant_id, id);

    const myParticipants = await this.prisma.engagementEventParticipant.findMany({
      where: {
        event_id: id,
        tenant_id: tenant.tenant_id,
        student_id: { in: studentIds },
      },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return { ...event, my_participants: myParticipants };
  }

  // POST /v1/parent/engagement/events/:id/register/:studentId
  @Post(':id/register/:studentId')
  @RequiresPermission('parent.manage_engagement')
  @HttpCode(HttpStatus.OK)
  async registerStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);
    return this.eventParticipantsService.register(tenant.tenant_id, id, studentId, user.sub);
  }

  // POST /v1/parent/engagement/events/:id/withdraw/:studentId
  @Post(':id/withdraw/:studentId')
  @RequiresPermission('parent.manage_engagement')
  @HttpCode(HttpStatus.OK)
  async withdrawStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);
    return this.eventParticipantsService.withdraw(tenant.tenant_id, id, studentId);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getParentStudentIds(userId: string, tenantId: string): Promise<string[]> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const links = await this.prisma.studentParent.findMany({
      where: { parent_id: parent.id, tenant_id: tenantId },
      select: { student_id: true },
    });

    return links.map((l) => l.student_id);
  }

  private async verifyParentStudentLink(
    userId: string,
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const link = await this.prisma.studentParent.findUnique({
      where: {
        student_id_parent_id: { student_id: studentId, parent_id: parent.id },
      },
    });

    if (!link || link.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }
  }
}
