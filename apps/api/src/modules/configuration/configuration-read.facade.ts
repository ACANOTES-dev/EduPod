/**
 * ConfigurationReadFacade — Centralized read service for tenant settings, module settings,
 * notification settings, and Stripe config data.
 *
 * PURPOSE:
 * Many modules (behaviour, pastoral, attendance, compliance, early-warning, gradebook,
 * finance, admissions, homework, engagement, staff-wellbeing, communications) need to
 * look up tenant settings (the JSONB blob), per-module settings, notification settings,
 * and Stripe config. This facade provides a single, well-typed entry point for all
 * cross-module configuration reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found — callers decide whether to throw.
 * - Stripe config returns only non-sensitive fields; encrypted keys are never exposed.
 */
import { Injectable } from '@nestjs/common';
import type { ModuleKey } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TenantSettingsRow {
  id: string;
  tenant_id: string;
  settings: JsonValue;
}

export interface TenantModuleSettingRow {
  id: string;
  tenant_id: string;
  module_key: string;
  settings: JsonValue;
}

export interface TenantNotificationSettingRow {
  id: string;
  tenant_id: string;
  notification_type: string;
  is_enabled: boolean;
  channels: JsonValue;
}

export interface TenantStripeConfigPublicRow {
  id: string;
  tenant_id: string;
  stripe_publishable_key: string;
  encryption_key_ref: string;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class ConfigurationReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Tenant Settings (legacy JSONB blob) ────────────────────────────────────

  /**
   * Find the legacy tenant settings JSONB blob. Returns null if no row exists.
   * Most consumers extract a nested key from `settings` (e.g., `settings.behaviour`).
   */
  async findSettings(tenantId: string): Promise<TenantSettingsRow | null> {
    return this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Find only the settings JSON value for a tenant. Returns null if no row exists.
   * Convenience method for consumers that only need the JSON, not the full row.
   */
  async findSettingsJson(tenantId: string): Promise<JsonValue | null> {
    const row = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    return row?.settings ?? null;
  }

  // ─── Per-Module Settings ────────────────────────────────────────────────────

  /**
   * Find all per-module setting rows for a tenant.
   * Used by the configuration service to merge with the legacy blob.
   */
  async findAllModuleSettings(tenantId: string): Promise<TenantModuleSettingRow[]> {
    return this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Find a single module's settings row by tenant + module key.
   * Returns null if no per-module row exists (caller may fall back to legacy blob).
   */
  async findModuleSettings(
    tenantId: string,
    moduleKey: ModuleKey,
  ): Promise<TenantModuleSettingRow | null> {
    return this.prisma.tenantModuleSetting.findUnique({
      where: { tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey } },
    });
  }

  // ─── Notification Settings ──────────────────────────────────────────────────

  /**
   * Find all notification settings for a tenant. Returns empty array if none configured.
   * Used by communications and audience-resolution services.
   */
  async findAllNotificationSettings(tenantId: string): Promise<TenantNotificationSettingRow[]> {
    return this.prisma.tenantNotificationSetting.findMany({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Find a single notification setting by type for a tenant.
   * Returns null if the notification type is not configured.
   */
  async findNotificationSettingByType(
    tenantId: string,
    notificationType: string,
  ): Promise<TenantNotificationSettingRow | null> {
    return this.prisma.tenantNotificationSetting.findFirst({
      where: { tenant_id: tenantId, notification_type: notificationType },
    });
  }

  // ─── Stripe Config ──────────────────────────────────────────────────────────

  /**
   * Check whether a tenant has Stripe configured. Returns only non-sensitive fields.
   * Encrypted keys are NEVER returned through this facade.
   */
  async findStripeConfigPublic(tenantId: string): Promise<TenantStripeConfigPublicRow | null> {
    return this.prisma.tenantStripeConfig.findUnique({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        tenant_id: true,
        stripe_publishable_key: true,
        encryption_key_ref: true,
      },
    });
  }

  /**
   * Check whether Stripe is configured for a tenant.
   */
  async hasStripeConfig(tenantId: string): Promise<boolean> {
    const row = await this.prisma.tenantStripeConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { id: true },
    });
    return row !== null;
  }
}
