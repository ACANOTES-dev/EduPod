import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TENANT_SETTINGS_MODULE_SCHEMAS, tenantSettingsSchema } from '@school/shared';
import type { TenantSettingsDto, TenantSettingsModuleKey } from '@school/shared';
import { ZodError } from 'zod';

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
   * Each module section is individually validated to surface per-module errors.
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

    const raw = (record.settings ?? {}) as Record<string, unknown>;

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
   */
  async getModuleSettings<K extends TenantSettingsModuleKey>(
    tenantId: string,
    moduleKey: K,
  ): Promise<TenantSettingsDto[K]> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'SETTINGS_NOT_FOUND',
        message: 'Settings not found for this tenant',
      });
    }

    const raw = (record.settings ?? {}) as Record<string, unknown>;
    const moduleData = raw[moduleKey] ?? {};
    const schema = TENANT_SETTINGS_MODULE_SCHEMAS[moduleKey];

    return schema.parse(moduleData) as TenantSettingsDto[K];
  }

  // ─── Write: full settings (existing behaviour) ─────────────────────────────

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

  // ─── Write: single module section ──────────────────────────────────────────

  /**
   * Update a single module's settings. Validates ONLY the target module section
   * against its per-module Zod schema before merging, so a malformed write to
   * one module cannot corrupt other modules' settings (DZ-05 mitigation).
   */
  async updateModuleSettings<K extends TenantSettingsModuleKey>(
    tenantId: string,
    moduleKey: K,
    data: Record<string, unknown>,
  ) {
    const existing = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SETTINGS_NOT_FOUND',
        message: 'Settings not found for this tenant',
      });
    }

    const existingSettings = (existing.settings ?? {}) as Record<string, unknown>;
    const existingModuleData = (existingSettings[moduleKey] ?? {}) as Record<string, unknown>;

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

    // Replace only the target module section, leaving all other sections untouched
    const updatedSettings = {
      ...existingSettings,
      [moduleKey]: validatedModule,
    };

    // Save
    await this.prisma.tenantSetting.update({
      where: { tenant_id: tenantId },
      data: { settings: updatedSettings as unknown as Prisma.InputJsonValue },
    });

    // Re-parse the full blob to get a typed result for warnings check
    const fullSettings = tenantSettingsSchema.parse(updatedSettings);
    const warnings = await this.getWarnings(tenantId, fullSettings);

    return {
      settings: validatedModule,
      warnings,
    };
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
