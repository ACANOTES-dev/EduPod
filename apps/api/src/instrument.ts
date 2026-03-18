import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env into process.env BEFORE anything else.
// NestJS ConfigModule uses dotenv.parse() which does NOT set process.env.
// Prisma, BullMQ, and other libs read process.env directly, so we must load it here.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../../.env') });

import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  sendDefaultPii: true,
});
