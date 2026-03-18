import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  sendDefaultPii: true,
});
