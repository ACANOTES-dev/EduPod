import * as Sentry from '@sentry/nextjs';

export function onMissingMessage(error: Error): void {
  if (process.env.NODE_ENV === 'production') {
    try {
      Sentry.captureException(error);
    } catch (captureError) {
      console.error('[onMissingMessage] Sentry capture failed', captureError);
    }
  }

  throw error;
}
