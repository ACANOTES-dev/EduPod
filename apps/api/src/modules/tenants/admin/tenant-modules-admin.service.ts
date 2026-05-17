import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { MODULE_REGISTRY, isModuleKey } from '@school/shared/modules';
import type { ModuleDefinition, ModuleKey } from '@school/shared/modules';

import { TenantModuleService } from '../../../common/services/tenant-module.service';
import { AuditLogReadFacade } from '../../audit-log/audit-log-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

export interface ModuleView extends ModuleDefinition {
  is_enabled: boolean;
  last_toggled_at: string | null;
  last_toggled_by: { user_id: string; display_name: string } | null;
}

export interface TenantModulesViewResponse {
  tenant_id: string;
  modules: ModuleView[];
  completeness: { complete: boolean; missing: ModuleKey[] };
}

interface LatestToggle {
  created_at: Date;
  actor: { user_id: string; display_name: string } | null;
}

@Injectable()
export class TenantModulesAdminService {
  constructor(
    private readonly tenantModule: TenantModuleService,
    private readonly auditLogReadFacade: AuditLogReadFacade,
    private readonly prisma: PrismaService,
  ) {}

  async getModulesView(tenantId: string): Promise<TenantModulesViewResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }

    const [moduleRows, completeness, recentToggles] = await Promise.all([
      this.tenantModule.getModuleRows(tenantId),
      this.tenantModule.assertCompleteness(tenantId),
      this.fetchLatestToggleEventsByKey(tenantId),
    ]);
    const enabledByKey = new Map(
      moduleRows
        .filter((row) => isModuleKey(row.module_key))
        .map((row) => [row.module_key as ModuleKey, row.is_enabled]),
    );

    return {
      tenant_id: tenantId,
      modules: MODULE_REGISTRY.map((definition) => {
        const latestToggle = recentToggles.get(definition.key);
        return {
          ...definition,
          is_enabled: enabledByKey.get(definition.key) ?? false,
          last_toggled_at: latestToggle?.created_at.toISOString() ?? null,
          last_toggled_by: latestToggle?.actor ?? null,
        };
      }),
      completeness,
    };
  }

  private async fetchLatestToggleEventsByKey(
    tenantId: string,
  ): Promise<Map<ModuleKey, LatestToggle>> {
    const logs = await this.auditLogReadFacade.findManyWithActor(tenantId, {
      entityType: 'tenant_config',
      entityId: tenantId,
      action: 'module_toggle',
      take: MODULE_REGISTRY.length * 5,
    });

    const latestByKey = new Map<ModuleKey, LatestToggle>();
    for (const log of logs) {
      const moduleKey = this.getMetadataModuleKey(log.metadata_json);
      if (!moduleKey || latestByKey.has(moduleKey)) {
        continue;
      }

      latestByKey.set(moduleKey, {
        created_at: log.created_at,
        actor: log.actor
          ? {
              user_id: log.actor.id,
              display_name: this.formatActorName(log.actor),
            }
          : null,
      });
    }

    return latestByKey;
  }

  private getMetadataModuleKey(metadata: Prisma.JsonValue): ModuleKey | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const value = (metadata as Record<string, unknown>).module_key;
    return typeof value === 'string' && isModuleKey(value) ? value : null;
  }

  private formatActorName(actor: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  }): string {
    const name = [actor.first_name, actor.last_name].filter(Boolean).join(' ').trim();
    return name || actor.email;
  }
}
