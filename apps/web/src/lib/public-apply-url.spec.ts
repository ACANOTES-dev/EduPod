import { buildPublicApplyUrl } from './public-apply-url';

describe('buildPublicApplyUrl', () => {
  it('builds a URL from explicit host, locale, and slug', () => {
    const url = buildPublicApplyUrl({
      tenantSlug: 'nhqs',
      locale: 'en',
      host: 'nhqs.edupod.app',
      protocol: 'https:',
    });
    expect(url).toBe('https://nhqs.edupod.app/en/apply/nhqs');
  });

  it('url-encodes slugs that contain reserved characters', () => {
    const url = buildPublicApplyUrl({
      tenantSlug: 'nurul huda / qurani',
      locale: 'ar',
      host: 'edupod.app',
      protocol: 'https:',
    });
    expect(url).toBe('https://edupod.app/ar/apply/nurul%20huda%20%2F%20qurani');
  });

  it('falls back to edupod.app when host is not provided and window is undefined', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    try {
      const url = buildPublicApplyUrl({ tenantSlug: 'demo', locale: 'en' });
      expect(url).toBe('https://edupod.app/en/apply/demo');
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('defaults empty locale to "en"', () => {
    const url = buildPublicApplyUrl({
      tenantSlug: 'demo',
      locale: '',
      host: 'edupod.app',
      protocol: 'https:',
    });
    expect(url).toBe('https://edupod.app/en/apply/demo');
  });
});
