import { MODULE_REGISTRY } from '@school/shared/modules';
import type { ModuleCategory, ModuleDefinition, ModuleKey } from '@school/shared/modules';

import { apiClient } from '@/lib/api-client';

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

export interface TenantModulesSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
}

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  academic: 'Academic',
  finance_ops: 'Finance / Ops',
  people_care: 'People Care',
  communications: 'Communications',
  operations: 'Operations',
  compliance: 'Compliance',
};

export const MODULE_CATEGORY_ORDER: ModuleCategory[] = [
  'academic',
  'finance_ops',
  'people_care',
  'communications',
  'operations',
  'compliance',
];

export async function getTenantModulesView(tenantId: string): Promise<TenantModulesViewResponse> {
  return apiClient<TenantModulesViewResponse>(`/api/v1/admin/tenants/${tenantId}/modules`, {
    silent: true,
  });
}

export async function getTenantModulesTenant(tenantId: string): Promise<TenantModulesSummary> {
  return apiClient<TenantModulesSummary>(`/api/v1/admin/tenants/${tenantId}`, { silent: true });
}

export async function toggleTenantModule(
  tenantId: string,
  moduleKey: ModuleKey,
  isEnabled: boolean,
): Promise<void> {
  await apiClient(`/api/v1/admin/tenants/${tenantId}/modules/${moduleKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_enabled: isEnabled }),
    silent: true,
  });
}

export function groupTenantModules(modules: ModuleView[]): Record<ModuleCategory, ModuleView[]> {
  const grouped: Record<ModuleCategory, ModuleView[]> = {
    academic: [],
    finance_ops: [],
    people_care: [],
    communications: [],
    operations: [],
    compliance: [],
  };

  for (const moduleView of modules) {
    grouped[moduleView.category].push(moduleView);
  }

  return grouped;
}

export function getEnabledDependentModules(
  parentKey: ModuleKey,
  modules: ModuleView[],
): ModuleView[] {
  return modules.filter(
    (module) => module.is_enabled && (module.depends_on ?? []).includes(parentKey),
  );
}

export function applyOptimisticModuleToggle(
  modules: ModuleView[],
  moduleKey: ModuleKey,
  isEnabled: boolean,
): ModuleView[] {
  return modules.map((module) =>
    module.key === moduleKey ? { ...module, is_enabled: isEnabled } : module,
  );
}

export function buildStandardPresetChanges(modules: ModuleView[]): Array<{
  key: ModuleKey;
  nextState: boolean;
}> {
  const defaults = new Map(MODULE_REGISTRY.map((module) => [module.key, module.default_enabled]));
  return modules
    .filter((module) => module.is_enabled !== defaults.get(module.key))
    .map((module) => ({ key: module.key, nextState: defaults.get(module.key) ?? false }));
}

export function getAdminTenantModulesErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const message = (err as { error?: { message?: string } }).error?.message;
    if (message) return message;
  }
  return fallback;
}
