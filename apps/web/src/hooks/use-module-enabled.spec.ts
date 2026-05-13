import { isModuleEnabledForList } from './use-module-enabled';

describe('isModuleEnabledForList', () => {
  it('returns true for enabled canonical modules', () => {
    expect(isModuleEnabledForList(['gradebook', 'pastoral'], 'pastoral')).toBe(true);
  });

  it('returns false for disabled canonical modules', () => {
    expect(isModuleEnabledForList(['gradebook'], 'pastoral')).toBe(false);
  });

  it('returns true for unknown or omitted keys', () => {
    expect(isModuleEnabledForList(['gradebook'], 'students')).toBe(true);
    expect(isModuleEnabledForList(['gradebook'], undefined)).toBe(true);
  });
});
