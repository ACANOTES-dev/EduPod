/**
 * Tenant branding descriptor used by the export pipeline.
 *
 * Values are already resolved — `logo_url` is a usable absolute/presigned URL
 * (or `null` if the tenant has not uploaded a logo) and `school_name` is the
 * locale-appropriate display name (Arabic if the tenant's default locale is
 * `ar`, otherwise the English display name or tenant.name).
 *
 * `locale` drives document direction (RTL for `ar`) in each renderer.
 */
export interface TenantBranding {
  tenant_id: string;
  school_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  locale: 'en' | 'ar';
  currency_code: string;
}

/** Fallback branding when a tenant has no `TenantBranding` row. */
export const DEFAULT_PLATFORM_BRANDING: Omit<
  TenantBranding,
  'tenant_id' | 'school_name' | 'locale' | 'currency_code'
> = {
  logo_url: null,
  primary_color: '#0f172a', // slate-900
  secondary_color: '#64748b', // slate-500
};
