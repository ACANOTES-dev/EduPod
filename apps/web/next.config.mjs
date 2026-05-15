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
      {
        source: '/socket.io/:path*',
        destination: `${API_URL}/socket.io/:path*`,
      },
    ];
  },
  async redirects() {
    // CBA and Transfers were promoted out of /regulatory/ppod in Phase 4.
    // Keep old deep links working with 308 permanent redirects.
    //
    // Phase 10 consolidated four pages into the /regulatory/gdpr sub-hub.
    // These four pairs use temporary 307 redirects for 90 days — flip them
    // to permanent once bookmark/search-engine drift settles.
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
      {
        source: '/:locale/regulatory/compliance',
        destination: '/:locale/regulatory/gdpr/dsar',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/compliance/:path*',
        destination: '/:locale/regulatory/gdpr/dsar/:path*',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/dpa',
        destination: '/:locale/regulatory/gdpr/dpa-policy',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/dpa/:path*',
        destination: '/:locale/regulatory/gdpr/dpa-policy/:path*',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/data-retention',
        destination: '/:locale/regulatory/gdpr/data-retention',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/data-retention/:path*',
        destination: '/:locale/regulatory/gdpr/data-retention/:path*',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/privacy-notices',
        destination: '/:locale/regulatory/gdpr/privacy-notices',
        permanent: false,
      },
      {
        source: '/:locale/regulatory/privacy-notices/:path*',
        destination: '/:locale/regulatory/gdpr/privacy-notices/:path*',
        permanent: false,
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
