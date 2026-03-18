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
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: 'edupod',
  project: 'node-nestjs',
});
