import * as Sentry from '@sentry/nextjs';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function stripUuids(value: string): string {
  return value.replace(UUID_RE, ':id');
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSendTransaction(event) {
    if (event.transaction) {
      event.transaction = stripUuids(event.transaction);
    }
    return event;
  },
});
