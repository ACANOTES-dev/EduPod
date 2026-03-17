export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface TenantContext {
  tenant_id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  default_locale: string;
  timezone: string;
}
