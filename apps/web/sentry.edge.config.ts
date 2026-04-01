import * as Sentry from '@sentry/nextjs';

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
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return scrubEvent(event);
  },
  beforeSendTransaction(event) {
    if (event.transaction) {
      event.transaction = stripUuids(event.transaction);
    }
    return event;
  },
});
