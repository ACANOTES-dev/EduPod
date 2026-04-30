import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getLocaleEntry, isActiveLocale } from '../../i18n/registry';
import { isPathInTier2Scope } from '../../i18n/tier-routes';

const TENANT_DEFAULT_LOCALE_COOKIE = 'tenant_default_locale';

function resolveRedirectLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(TENANT_DEFAULT_LOCALE_COOKIE)?.value;
  if (cookieLocale && isActiveLocale(cookieLocale) && getLocaleEntry(cookieLocale)?.tier === 1) {
    return cookieLocale;
  }

  return 'en';
}

export function tier2RouteGuard(request: NextRequest): NextResponse | null {
  const url = request.nextUrl.clone();
  const localeSegment = url.pathname.split('/')[1];
  if (!localeSegment) {
    return null;
  }

  const localeEntry = getLocaleEntry(localeSegment);
  if (!localeEntry || localeEntry.tier !== 2 || !localeEntry.active) {
    return null;
  }

  if (isPathInTier2Scope(url.pathname)) {
    return null;
  }

  const segments = url.pathname.split('/');
  segments[1] = resolveRedirectLocale(request);
  url.pathname = segments.join('/');

  return NextResponse.redirect(url, 308);
}
