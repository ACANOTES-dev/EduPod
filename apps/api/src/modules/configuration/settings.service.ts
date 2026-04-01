import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { TENANT_SETTINGS_MODULE_SCHEMAS, tenantSettingsSchema } from '@school/shared';
import type { TenantSettingsDto, TenantSettingsModuleKey } from '@school/shared';

import { withRls } from '../../common/helpers/with-rls';
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

// ─── Validation result types ──────────────────────────────────────────────────

export interface SettingsValidationError {
  module: string;
  path: string;
  message: string;
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: SettingsValidationError[];
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Read: full settings ────────────────────────────────────────────────────

  /**
   * Get tenant settings, parsed through Zod to fill defaults.
   * Reads from per-module rows first, falls back to the legacy JSONB blob
   * for any module that doesn't yet have a dedicated row.
   */
  async getSettings(tenantId: string): Promise<TenantSettingsDto> {
    // Fetch per-module rows and legacy blob in parallel
    const [moduleRows, legacyRecord] = await Promise.all([
      this.prisma.tenantModuleSetting.findMany({
        where: { tenant_id: tenantId },
      }),
      this.prisma.tenantSetting.findUnique({
        where: { tenant_id: tenantId },
      }),
    ]);

    // Build a combined raw object: per-module rows take priority over legacy blob
    const legacySettings = (legacyRecord?.settings ?? {}) as Record<string, unknown>;
    const raw: Record<string, unknown> = { ...legacySettings };

    for (const row of moduleRows) {
      raw[row.module_key] = row.settings;
    }

    // Validate each module section individually, logging any per-module errors.
    // Replace invalid sections with defaults so the full parse always succeeds.
    const validation = this.validateAllModuleSections(raw, tenantId);
    const sanitised = { ...raw };
    if (!validation.valid) {
      const invalidModules = new Set(validation.errors.map((e) => e.module));
      for (const mod of invalidModules) {
        delete sanitised[mod];
      }
    }

    // Parse through Zod to fill any missing defaults
    const parsed = tenantSettingsSchema.parse(sanitised);
    return parsed;
  }

  // ─── Read: single module section ────────────────────────────────────────────

  /**
   * Get a single module's settings, validated through its per-module Zod schema.
   * Reads from the per-module row first; falls back to the legacy JSONB blob
   * if no dedicated row exists yet.
   */
  async getModuleSettings<K extends TenantSettingsModuleKey>(
    tenantId: string,
    moduleKey: K,
  ): Promise<TenantSettingsDto[K]> {
    // Try per-module row first
    const moduleRow = await this.prisma.tenantModuleSetting.findUnique({
      where: { tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey } },
    });

    let moduleData: unknown;

    if (moduleRow) {
      moduleData = moduleRow.settings;
    } else {
      // Fall back to legacy blob
      const legacyRecord = await this.prisma.tenantSetting.findUnique({
        where: { tenant_id: tenantId },
      });

      if (!legacyRecord) {
        // No settings at all — return defaults
        const schema = TENANT_SETTINGS_MODULE_SCHEMAS[moduleKey];
        return schema.parse({}) as TenantSettingsDto[K];
      }

      const raw = (legacyRecord.settings ?? {}) as Record<string, unknown>;
      moduleData = raw[moduleKey] ?? {};
    }

    const schema = TENANT_SETTINGS_MODULE_SCHEMAS[moduleKey];
    return schema.parse(moduleData) as TenantSettingsDto[K];
  }

  // ─── Write: full settings (existing behaviour — legacy compat) ─────────────

  /**
   * Update tenant settings via deep merge, validate, and save.
   * Returns updated settings + any cross-module warnings.
   *
   * This method still writes to the legacy JSONB blob for backward compatibility.
   * Per-module writes should use updateModuleSettings instead.
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

    // Save to legacy blob
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

  // ─── Write: single module section ──────────────────────────────────────────

  /**
   * Update a single module's settings. Validates ONLY the target module section
   * against its per-module Zod schema before writing to the dedicated row.
   *
   * Uses RLS-scoped upsert to write to the per-module table. Also syncs the
   * legacy JSONB blob for backward compatibility during the transition period.
   */
  async updateModuleSettings<K extends TenantSettingsModuleKey>(
    tenantId: string,
    moduleKey: K,
    data: Record<string, unknown>,
  ) {
    // Read existing module data from the per-module row (or legacy blob fallback)
    const existingModuleData = await this.getExistingModuleData(tenantId, moduleKey);

    // Deep merge the incoming partial data with the existing module section
    const mergedModuleData = deepMerge(existingModuleData, data);

    // Validate ONLY the target module section through its per-module schema
    const schema = TENANT_SETTINGS_MODULE_SCHEMAS[moduleKey];
    let validatedModule: TenantSettingsDto[K];
    try {
      validatedModule = schema.parse(mergedModuleData) as TenantSettingsDto[K];
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        throw new BadRequestException({
          code: 'SETTINGS_VALIDATION_FAILED',
          message: `Validation failed for module "${moduleKey}"`,
          details,
        });
      }
      throw err;
    }

    // Write to both the per-module table (RLS-scoped) and the legacy blob
    await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      // Upsert the per-module row
      await tx.tenantModuleSetting.upsert({
        where: { tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey } },
        create: {
          tenant_id: tenantId,
          module_key: moduleKey,
          settings: validatedModule as unknown as Prisma.InputJsonValue,
        },
        update: {
          settings: validatedModule as unknown as Prisma.InputJsonValue,
        },
      });

      // Sync legacy blob — read existing, replace the module section, save
      const legacyRecord = await tx.tenantSetting.findUnique({
        where: { tenant_id: tenantId },
      });

      if (legacyRecord) {
        const existingSettings = (legacyRecord.settings ?? {}) as Record<string, unknown>;
        const updatedSettings = {
          ...existingSettings,
          [moduleKey]: validatedModule,
        };

        await tx.tenantSetting.update({
          where: { tenant_id: tenantId },
          data: { settings: updatedSettings as unknown as Prisma.InputJsonValue },
        });
      }
    });

    // Re-read full settings for warnings check
    const fullSettings = await this.getSettings(tenantId);
    const warnings = await this.getWarnings(tenantId, fullSettings);

    return {
      settings: validatedModule,
      warnings,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Read existing module data from the per-module row, falling back to the
   * legacy JSONB blob if no dedicated row exists yet.
   */
  private async getExistingModuleData(
    tenantId: string,
    moduleKey: TenantSettingsModuleKey,
  ): Promise<Record<string, unknown>> {
    const moduleRow = await this.prisma.tenantModuleSetting.findUnique({
      where: { tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey } },
    });

    if (moduleRow) {
      return (moduleRow.settings ?? {}) as Record<string, unknown>;
    }

    // Fall back to legacy blob
    const legacyRecord = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!legacyRecord) {
      return {};
    }

    const raw = (legacyRecord.settings ?? {}) as Record<string, unknown>;
    return (raw[moduleKey] ?? {}) as Record<string, unknown>;
  }

  // ─── Validation helpers ─────────────────────────────────────────────────────

  /**
   * Validate all module sections individually. Logs warnings for any malformed
   * sections but does not throw — the full schema parse handles defaults.
   */
  private validateAllModuleSections(
    raw: Record<string, unknown>,
    tenantId: string,
  ): SettingsValidationResult {
    const errors: SettingsValidationError[] = [];

    for (const [key, schema] of Object.entries(TENANT_SETTINGS_MODULE_SCHEMAS)) {
      const moduleData = raw[key] ?? {};
      try {
        schema.parse(moduleData);
      } catch (err) {
        if (err instanceof ZodError) {
          for (const issue of err.errors) {
            const error: SettingsValidationError = {
              module: key,
              path: issue.path.join('.'),
              message: issue.message,
            };
            errors.push(error);
            this.logger.warn(
              `[validateAllModuleSections] Tenant ${tenantId} — ${key}.${error.path}: ${error.message}`,
            );
          }
        } else {
          this.logger.error(
            `[validateAllModuleSections] Unexpected error validating module "${key}" for tenant ${tenantId}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check cross-module dependency warnings.
   */
  async getWarnings(tenantId: string, settings: TenantSettingsDto): Promise<SettingsWarning[]> {
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
