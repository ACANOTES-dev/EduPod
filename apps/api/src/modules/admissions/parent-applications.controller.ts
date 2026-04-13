import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';

import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsService } from './applications.service';

@Controller('v1/parent/applications')
@UseGuards(AuthGuard)
export class ParentApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly applicationNotesService: ApplicationNotesService,
  ) {}

  @Get()
  async findOwn(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    // Wrap the array return in the canonical `{ data, meta }` envelope so
    // frontend list pages do not crash on `res.meta.total` for empty results
    // (ADM-016 + ADM-043). The service returns an array; pagination is not
    // currently implemented at this endpoint, so report the total as the
    // array length on a single page.
    const data = (await this.applicationsService.findByParent(
      tenant.tenant_id,
      user.sub,
    )) as unknown[];
    return {
      data,
      meta: { total: data.length, page: 1, pageSize: data.length },
    };
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Fetch the application, then verify ownership
    const application = await this.applicationsService.findOne(tenant.tenant_id, id);

    // Parent can only view their own applications — findByParent check
    const parentApps = (await this.applicationsService.findByParent(
      tenant.tenant_id,
      user.sub,
    )) as Array<{ id: string }>;

    const owns = parentApps.some((app: { id: string }) => app.id === id);
    if (!owns) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this application' },
      });
    }

    // Filter internal notes for parent view
    const notes = await this.applicationNotesService.findByApplication(
      tenant.tenant_id,
      id,
      false, // excludeInternal
    );

    return { ...application, notes };
  }

  @Post(':id/withdraw')
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.withdraw(
      tenant.tenant_id,
      id,
      user.sub,
      true, // isParent = true
    );
  }
}
