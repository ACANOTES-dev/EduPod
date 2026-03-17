import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { tenantSettingsSchema } from '@school/shared';
import type { TenantSettingsDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Deep merge utility for settings objects.
 * Recursively merges `source` into `target`, creating a new object.
 * Arrays are replaced, not merged.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

export interface SettingsWarning {
  field: string;
  message: string;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get tenant settings, parsed through Zod to fill defaults.
   */
  async getSettings(tenantId: string): Promise<TenantSettingsDto> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'SETTINGS_NOT_FOUND',
        message: 'Settings not found for this tenant',
      });
    }

    // Parse through Zod to fill any missing defaults
    const parsed = tenantSettingsSchema.parse(record.settings);
    return parsed;
  }

  /**
   * Update tenant settings via deep merge, validate, and save.
   * Returns updated settings + any cross-module warnings.
   */
  async updateSettings(tenantId: string, data: Partial<TenantSettingsDto>) {
    const existing = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SETTINGS_NOT_FOUND',
        message: 'Settings not found for this tenant',
      });
    }

    // Deep merge incoming partial data with existing settings
    const merged = deepMerge(
      existing.settings as Record<string, unknown>,
      data as Record<string, unknown>,
    );

    // Validate merged result through Zod (fills any missing defaults)
    const validated = tenantSettingsSchema.parse(merged);

    // Save
    await this.prisma.tenantSetting.update({
      where: { tenant_id: tenantId },
      data: { settings: validated as unknown as Prisma.InputJsonValue },
    });

    // Check for cross-module warnings
    const warnings = await this.getWarnings(tenantId, validated);

    return {
      settings: validated,
      warnings,
    };
  }

  /**
   * Check cross-module dependency warnings.
   */
  async getWarnings(
    tenantId: string,
    settings: TenantSettingsDto,
  ): Promise<SettingsWarning[]> {
    const warnings: SettingsWarning[] = [];

    // Load tenant modules to check enabled status
    const modules = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
    });

    const moduleMap = new Map<string, boolean>();
    for (const m of modules) {
      moduleMap.set(m.module_key, m.is_enabled);
    }

    // Warning: autoPopulateClassCounts requires attendance module
    if (
      settings.payroll.autoPopulateClassCounts === true &&
      moduleMap.get('attendance') === false
    ) {
      warnings.push({
        field: 'payroll.autoPopulateClassCounts',
        message:
          'Auto-populate class counts is enabled but the attendance module is disabled. Counts will not be populated automatically.',
      });
    }

    // Warning: whatsapp channel requires communications module
    if (
      settings.communications.primaryOutboundChannel === 'whatsapp' &&
      moduleMap.get('communications') === false
    ) {
      warnings.push({
        field: 'communications.primaryOutboundChannel',
        message:
          'WhatsApp is set as primary outbound channel but the communications module is disabled.',
      });
    }

    return warnings;
  }
}
