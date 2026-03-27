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

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getReplayOnErrorSampleRate(): number {
  try {
    const raw = readCookie('cookie_consent');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      const categories = parsed?.categories as Record<string, unknown> | undefined;
      if (categories?.analytics === true) {
        return 0.1;
      }
    }
  } catch (error: unknown) {
    console.error('[Sentry] Failed to read cookie consent:', error);
  }
  return 0;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: getReplayOnErrorSampleRate(),
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
