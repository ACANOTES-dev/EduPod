import {
  MODULE_KEYS,
  MODULE_KEYS_ARRAY,
  MODULE_REGISTRY,
  type ModuleKey,
  isModuleKey,
} from './registry';

describe('module registry', () => {
  it('contains the 20 canonical gateable modules', () => {
    expect(MODULE_REGISTRY).toHaveLength(20);
    expect(MODULE_KEYS.size).toBe(20);
    expect(MODULE_KEYS_ARRAY).toHaveLength(20);
  });

  it('does not contain duplicate keys', () => {
    const keys = MODULE_REGISTRY.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has complete admin display metadata for every module', () => {
    for (const entry of MODULE_REGISTRY) {
      expect(entry.display_name.trim()).not.toBe('');
      expect(entry.description.trim()).not.toBe('');
    }
  });

  it('keeps runtime keys aligned with the ModuleKey union', () => {
    for (const entry of MODULE_REGISTRY) {
      const check: ModuleKey = entry.key;

      expect(isModuleKey(check)).toBe(true);
    }
  });

  it('only references existing modules in dependency metadata', () => {
    for (const entry of MODULE_REGISTRY) {
      for (const dependency of entry.depends_on ?? []) {
        expect(MODULE_KEYS.has(dependency)).toBe(true);
      }
    }
  });
});
