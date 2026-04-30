import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from '../i18n/config';

import { tier2RouteGuard } from './middleware/tier2-route-guard';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
});

export default function middleware(request: NextRequest) {
  const tier2Redirect = tier2RouteGuard(request);
  if (tier2Redirect) {
    return tier2Redirect;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
