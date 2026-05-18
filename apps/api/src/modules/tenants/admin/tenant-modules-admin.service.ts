import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { MODULE_KEYS_ARRAY, MODULE_REGISTRY, isModuleKey } from '@school/shared/modules';
import type { ModuleDefinition, ModuleKey } from '@school/shared/modules';

import { withRls } from '../../../common/helpers/with-rls';
import { PrismaService } from '../../prisma/prisma.service';

export interface ModuleView extends ModuleDefinition {
  has_row: boolean;
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

interface ModuleRowsWithCompleteness {
  moduleRows: Array<{ module_key: string; is_enabled: boolean }>;
  completeness: { complete: boolean; missing: ModuleKey[] };
}

@Injectable()
export class TenantModulesAdminService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [{ moduleRows, completeness }, recentToggles] = await Promise.all([
      this.fetchModuleRowsWithCompleteness(tenantId),
      this.fetchLatestToggleEventsByKey(tenantId),
    ]);
    const enabledByKey = new Map(
      moduleRows
        .filter((row) => isModuleKey(row.module_key))
        .map((row) => [row.module_key as ModuleKey, row.is_enabled]),
    );
    const presentKeys = new Set(
      moduleRows.filter((row) => isModuleKey(row.module_key)).map((row) => row.module_key),
    );

    return {
      tenant_id: tenantId,
      modules: MODULE_REGISTRY.map((definition) => {
        const latestToggle = recentToggles.get(definition.key);
        return {
          ...definition,
          has_row: presentKeys.has(definition.key),
          is_enabled: enabledByKey.get(definition.key) ?? false,
          last_toggled_at: latestToggle?.created_at.toISOString() ?? null,
          last_toggled_by: latestToggle?.actor ?? null,
        };
      }),
      completeness,
    };
  }

  private async fetchModuleRowsWithCompleteness(
    tenantId: string,
  ): Promise<ModuleRowsWithCompleteness> {
    return withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      const moduleRows = await tx.tenantModule.findMany({
        where: { tenant_id: tenantId },
        select: { module_key: true, is_enabled: true },
        orderBy: { module_key: 'asc' },
      });
      const present = new Set(moduleRows.map((row) => row.module_key));
      const missing = MODULE_KEYS_ARRAY.filter((key) => !present.has(key));

      return {
        moduleRows,
        completeness: { complete: missing.length === 0, missing },
      };
    });
  }

  private async fetchLatestToggleEventsByKey(
    tenantId: string,
  ): Promise<Map<ModuleKey, LatestToggle>> {
    const logs = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      return tx.auditLog.findMany({
        where: {
          action: 'module_toggle',
          entity_id: tenantId,
          entity_type: 'tenant_config',
          tenant_id: tenantId,
        },
        orderBy: { created_at: 'desc' },
        take: MODULE_REGISTRY.length * 5,
        include: {
          actor: {
            select: { id: true, email: true, first_name: true, last_name: true },
          },
        },
      });
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
