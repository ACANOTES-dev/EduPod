import { buildLocaleSwitchedPath } from '@/lib/locale-path';

describe('LocalePicker — buildLocaleSwitchedPath', () => {
  it('replaces the locale segment while preserving the rest of the path', () => {
    expect(buildLocaleSwitchedPath('/en/dashboard', 'ar')).toBe('/ar/dashboard');
    expect(buildLocaleSwitchedPath('/ar/profile/communication', 'en')).toBe(
      '/en/profile/communication',
    );
  });

  it('handles an empty path by returning the locale root', () => {
    expect(buildLocaleSwitchedPath('', 'en')).toBe('/en');
  });
});
