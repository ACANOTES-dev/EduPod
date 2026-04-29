export function buildLocaleSwitchedPath(pathname: string, nextLocale: string): string {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  if (segments.length === 0) {
    return `/${nextLocale}`;
  }
  segments[0] = nextLocale;
  return `/${segments.join('/')}`;
}
