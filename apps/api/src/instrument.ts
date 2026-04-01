/* eslint-disable import/order -- dotenv must load before Sentry/NestJS reads process.env */
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env into process.env BEFORE anything else.
// NestJS ConfigModule uses dotenv.parse() which does NOT set process.env.
// Prisma, BullMQ, and other libs read process.env directly, so we must load it here.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../../.env') });

import * as Sentry from '@sentry/nestjs';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PII_KEY_RE = /student|parent|staff|name|email|phone/i;

function stripUuids(value: string): string {
  return value.replace(UUID_RE, ':id');
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (PII_KEY_RE.test(key)) {
        event.extra[key] = '[REDACTED]';
      }
    }
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data?.url && typeof crumb.data.url === 'string') {
        crumb.data.url = stripUuids(crumb.data.url);
      }
    }
  }
  return event;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return scrubEvent(event);
  },
  beforeSendTransaction(event) {
    if (event.transaction) {
      event.transaction = stripUuids(event.transaction);
    }
    return event;
  },
});
