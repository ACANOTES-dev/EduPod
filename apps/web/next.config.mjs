import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const API_URL = process.env.API_URL || 'http://localhost:5552';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@school/ui', '@school/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
  async redirects() {
    // CBA and Transfers were promoted out of /regulatory/ppod in Phase 4.
    // Keep old deep links working with 308 permanent redirects.
    return [
      {
        source: '/:locale/regulatory/ppod/cba',
        destination: '/:locale/regulatory/cba',
        permanent: true,
      },
      {
        source: '/:locale/regulatory/ppod/cba/:path*',
        destination: '/:locale/regulatory/cba/:path*',
        permanent: true,
      },
      {
        source: '/:locale/regulatory/ppod/transfers',
        destination: '/:locale/regulatory/transfers',
        permanent: true,
      },
      {
        source: '/:locale/regulatory/ppod/transfers/:path*',
        destination: '/:locale/regulatory/transfers/:path*',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG || 'edupod',
  project: process.env.SENTRY_PROJECT_FRONTEND || 'school-web',
  release: { name: process.env.SENTRY_RELEASE },
});
