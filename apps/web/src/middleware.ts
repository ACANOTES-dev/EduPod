import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { locales, defaultLocale } from '../i18n/config';

import { tier2RouteGuard } from './middleware/tier2-route-guard';

export const PLATFORM_HOST = 'dua.edupod.app';
export const PLATFORM_HOST_DEV = 'dua.localhost';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
});

export function normaliseHost(host: string | null): string {
  return (host ?? '').split(',')[0]?.trim().toLowerCase().replace(/:\d+$/, '') ?? '';
}

export function isPlatformHost(host: string | null): boolean {
  const normalised = normaliseHost(host);
  return normalised === PLATFORM_HOST || normalised === PLATFORM_HOST_DEV;
}

export function isPlatformLoginPath(pathname: string): boolean {
  return pathname === '/en/login' || pathname.startsWith('/en/login/');
}

export function isPlatformAdminPath(pathname: string): boolean {
  return pathname === '/en/admin' || pathname.startsWith('/en/admin/');
}

export function isRetiredAdminPath(pathname: string): boolean {
  return /^\/[a-z]{2}\/admin(?:\/|$)/.test(pathname);
}

export function isSocketIoPath(pathname: string): boolean {
  return pathname === '/socket.io' || pathname.startsWith('/socket.io/');
}

export default function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isPlatformHost(request.headers.get('host'))) {
    const hasRefreshToken = Boolean(request.cookies.get('refresh_token')?.value);

    if (path === '/' && hasRefreshToken) {
      return NextResponse.redirect(new URL('/en/admin', request.url));
    }

    if (isPlatformLoginPath(path)) {
      return intlMiddleware(request);
    }

    if (isPlatformAdminPath(path) && hasRefreshToken) {
      return intlMiddleware(request);
    }

    return new NextResponse(null, { status: 404 });
  }

  if (isRetiredAdminPath(path)) {
    return new NextResponse(null, { status: 404 });
  }

  const tier2Redirect = tier2RouteGuard(request);
  if (tier2Redirect) {
    return tier2Redirect;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|socket.io|_next|_vercel|.*\\..*).*)'],
};
