import * as Sentry from '@sentry/nestjs';

import type { CommsProviderChannel } from '@school/shared';

/**
 * Fields tagged on every comms-originated Sentry capture.
 *
 * `tenant_id` is REQUIRED — anything without it can't be triaged
 * per-tenant. Other fields are best-effort — pass what you have in scope.
 */
export interface CommsSentryContext {
  tenant_id: string;
  channel?: CommsProviderChannel | 'in_app';
  template_key?: string;
  notification_id?: string;
}

/**
 * Wrap a comms code block in a Sentry scope that pre-sets the comms tags.
 * If `fn` throws, the exception is captured WITH the scope already set,
 * then re-thrown unchanged so caller-side error handling is unaffected.
 *
 * Use this in place of raw `Sentry.captureException(err)` everywhere in
 * the comms code path (providers, dispatch service, worker processors,
 * webhook handlers).
 */
export async function withCommsContext<T>(
  context: CommsSentryContext,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    scope.setTag('feature', 'communications');
    scope.setTag('tenant_id', context.tenant_id);
    if (context.channel) scope.setTag('channel', context.channel);
    if (context.template_key) scope.setTag('template_key', context.template_key);
    if (context.notification_id) scope.setTag('notification_id', context.notification_id);

    try {
      return await fn();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}

/**
 * Synchronous variant for the rare comms path that doesn't await.
 */
export function withCommsContextSync<T>(context: CommsSentryContext, fn: () => T): T {
  return Sentry.withScope((scope) => {
    scope.setTag('feature', 'communications');
    scope.setTag('tenant_id', context.tenant_id);
    if (context.channel) scope.setTag('channel', context.channel);
    if (context.template_key) scope.setTag('template_key', context.template_key);
    if (context.notification_id) scope.setTag('notification_id', context.notification_id);

    try {
      return fn();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}
