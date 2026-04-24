import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';

import type { JwtPayload } from '@school/shared';
import { type ReportSubjectKey, reportSubjectKeySchema } from '@school/shared/reports';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import {
  OWNER_SENTINEL_PERMISSION,
  ReportsSubjectRegistryService,
} from './reports-subject-registry.service';

/**
 * Read-only endpoints that expose the curated subject registry to the
 * builder UI. Every response is scoped to the caller's permissions — the
 * same code path the query engine uses when it validates queries.
 */
@Controller('v1/reports/subject-registry')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('reports.builder', 'analytics.manage_reports')
export class SubjectRegistryController {
  constructor(
    private readonly registry: ReportsSubjectRegistryService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  /** GET /v1/reports/subject-registry */
  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const permissions = await this.resolvePermissions(user);
    return { subjects: this.registry.getAllSubjects(permissions) };
  }

  /** GET /v1/reports/subject-registry/:subjectKey */
  @Get(':subjectKey')
  async get(@CurrentUser() user: JwtPayload, @Param('subjectKey') rawKey: string) {
    const parsed = reportSubjectKeySchema.safeParse(rawKey);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'REPORT_INVALID_SUBJECT',
        message: `Unknown subject key "${rawKey}"`,
      });
    }
    const permissions = await this.resolvePermissions(user);
    const subject: ReportSubjectKey = parsed.data;
    return this.registry.getSubject(subject, permissions);
  }

  /**
   * Resolve the caller's effective permissions, including the
   * owner-bypass sentinel for school_owner / school_principal /
   * school_vice_principal. The sentinel is then consumed by the
   * registry's scoping logic and by the query engine's field validator.
   */
  private async resolvePermissions(user: JwtPayload): Promise<string[]> {
    if (!user.membership_id) return [];

    const [permissions, owner] = await Promise.all([
      this.permissionCache.getPermissions(user.membership_id),
      this.permissionCache.isOwner(user.membership_id),
    ]);

    return owner ? [...permissions, OWNER_SENTINEL_PERMISSION] : permissions;
  }
}
