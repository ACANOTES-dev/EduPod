import type { ModuleView } from '@/lib/api/admin-tenant-modules';
import {
  applyOptimisticModuleToggle,
  buildStandardPresetChanges,
  getEnabledDependentModules,
  groupTenantModules,
} from '@/lib/api/admin-tenant-modules';

function buildModule(overrides: Partial<ModuleView> & Pick<ModuleView, 'key'>): ModuleView {
  return {
    category: 'academic',
    default_enabled: true,
    description: `${overrides.key} description`,
    display_name: `${overrides.key} name`,
    has_row: true,
    is_enabled: false,
    last_toggled_at: null,
    last_toggled_by: null,
    ...overrides,
  };
}

describe('tenant modules page helpers', () => {
  it('groups modules by registry category', () => {
    const grouped = groupTenantModules([
      buildModule({ key: 'finance', category: 'finance_ops' }),
      buildModule({ key: 'gradebook', category: 'academic' }),
    ]);

    expect(grouped.academic.map((module) => module.key)).toEqual(['gradebook']);
    expect(grouped.finance_ops.map((module) => module.key)).toEqual(['finance']);
  });

  it('finds enabled dependent modules for warning prompts', () => {
    const dependents = getEnabledDependentModules('finance', [
      buildModule({ key: 'finance', is_enabled: true }),
      buildModule({ key: 'budgeting', depends_on: ['finance'], is_enabled: true }),
      buildModule({ key: 'admissions', depends_on: ['finance'], is_enabled: false }),
    ]);

    expect(dependents.map((module) => module.key)).toEqual(['budgeting']);
  });

  it('optimistically updates one module without mutating the original array', () => {
    const modules = [buildModule({ key: 'sen', is_enabled: false })];
    const updated = applyOptimisticModuleToggle(modules, 'sen', true);

    expect(updated[0]?.is_enabled).toBe(true);
    expect(modules[0]?.is_enabled).toBe(false);
  });

  it('builds Standard preset changes from registry defaults only', () => {
    const changes = buildStandardPresetChanges([
      buildModule({ key: 'finance', default_enabled: true, is_enabled: false }),
      buildModule({ key: 'sen', default_enabled: false, is_enabled: false }),
      buildModule({ key: 'compliance_advanced', default_enabled: false, is_enabled: true }),
    ]);

    expect(changes).toEqual([
      { key: 'finance', nextState: true },
      { key: 'compliance_advanced', nextState: false },
    ]);
  });

  it('includes missing rows when applying Standard defaults', () => {
    const changes = buildStandardPresetChanges([
      buildModule({ key: 'finance', default_enabled: true, has_row: false, is_enabled: false }),
      buildModule({ key: 'sen', default_enabled: false, has_row: false, is_enabled: false }),
    ]);

    expect(changes).toEqual([
      { key: 'finance', nextState: true },
      { key: 'sen', nextState: false },
    ]);
  });
});
