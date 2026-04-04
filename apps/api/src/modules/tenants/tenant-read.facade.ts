/**
 * TenantReadFacade — Centralized read service for tenant, branding, module, and domain data.
 *
 * PURPOSE:
 * Many modules (finance, gradebook, reports, communications, configuration, compliance,
 * engagement, scheduling, admissions, gdpr, pastoral, early-warning, homework, dashboard,
 * registration, auth, payroll) need to look up tenant details, branding, enabled modules,
 * and sequences. This facade provides a single, well-typed entry point for all cross-module
 * tenant reads.
 *
 * CONVENTIONS:
 * - The `tenant` table is platform-level (no `tenant_id` column). Methods use the tenant's own `id`.
 * - Related tables (`tenantBranding`, `tenantModule`, `tenantDomain`) have `tenant_id` and filter by it.
 * - `tenantSequence` is read-only here; writes go through SequenceService.
 * - Returns `null` when a single record is not found — callers decide whether to throw.
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Core tenant fields used across cross-module reads (name, locale, currency, timezone). */
const TENANT_CORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  default_locale: true,
  timezone: true,
  date_format: true,
  currency_code: true,
  academic_year_start_month: true,
} as const;

/** Branding fields commonly needed for PDF generation, emails, and display. */
const BRANDING_SELECT = {
  id: true,
  tenant_id: true,
  primary_color: true,
  secondary_color: true,
  logo_url: true,
  school_name_display: true,
  school_name_ar: true,
  email_from_name: true,
  email_from_name_ar: true,
  support_email: true,
  support_phone: true,
  receipt_prefix: true,
  invoice_prefix: true,
  report_card_title: true,
  payslip_prefix: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TenantCoreRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  default_locale: string;
  timezone: string;
  date_format: string;
  currency_code: string;
  academic_year_start_month: number;
}

export interface TenantBrandingRow {
  id: string;
  tenant_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  school_name_display: string | null;
  school_name_ar: string | null;
  email_from_name: string | null;
  email_from_name_ar: string | null;
  support_email: string | null;
  support_phone: string | null;
  receipt_prefix: string;
  invoice_prefix: string;
  report_card_title: string | null;
  payslip_prefix: string;
}

export interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_key: string;
  is_enabled: boolean;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class TenantReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Tenant ─────────────────────────────────────────────────────────────────

  /**
   * Find a tenant by its own ID with core display fields.
   * The tenant table is platform-level — no tenant_id filtering needed.
   */
  async findById(tenantId: string): Promise<TenantCoreRow | null> {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: TENANT_CORE_SELECT,
    });
  }

  /**
   * Assert that a tenant exists. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string): Promise<void> {
    const found = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }
  }

  /**
   * Find tenant name by ID. Returns null if not found.
   * Used by PDF generators and display contexts that only need the name.
   */
  async findNameById(tenantId: string): Promise<string | null> {
    const result = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return result?.name ?? null;
  }

  /**
   * Find tenant's default locale. Returns 'en' if tenant not found.
   * Used by PDF rendering and email templating.
   */
  async findDefaultLocale(tenantId: string): Promise<string> {
    const result = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_locale: true },
    });
    return result?.default_locale ?? 'en';
  }

  /**
   * Find tenant's currency code. Returns null if tenant not found.
   * Used by finance and fee generation.
   */
  async findCurrencyCode(tenantId: string): Promise<string | null> {
    const result = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency_code: true },
    });
    return result?.currency_code ?? null;
  }

  // ─── Branding ───────────────────────────────────────────────────────────────

  /**
   * Find branding for a tenant. Returns null if no branding configured.
   * Used by PDF generation (invoices, receipts, report cards, transcripts, payslips).
   */
  async findBranding(tenantId: string): Promise<TenantBrandingRow | null> {
    return this.prisma.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
      select: BRANDING_SELECT,
    });
  }

  // ─── Modules ────────────────────────────────────────────────────────────────

  /**
   * Find all enabled/disabled modules for a tenant.
   * Used by configuration and module-enabled guards.
   */
  async findModules(tenantId: string): Promise<TenantModuleRow[]> {
    return this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, tenant_id: true, module_key: true, is_enabled: true },
    });
  }

  /**
   * Check whether a specific module is enabled for a tenant.
   * Returns false if the module row does not exist.
   */
  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const row = await this.prisma.tenantModule.findFirst({
      where: { tenant_id: tenantId, module_key: moduleKey },
      select: { is_enabled: true },
    });
    return row?.is_enabled ?? false;
  }

  /**
   * Find the tenant's JSONB settings blob. Returns null if tenant not found.
   * Used by homework, reports, and other modules that read per-tenant feature flags.
   */
  async findSettings(tenantId: string): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return (row?.settings as Record<string, unknown>) ?? null;
  }
}
