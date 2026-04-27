import { Inject, Injectable, Logger, Optional, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import type { CommsProviderChannel } from '@school/shared';

/**
 * Required context on every comms log line.
 *
 * `tenant_id` is REQUIRED — multi-tenant; an unlabelled comms log line is a
 * defect. Other fields are optional because some code paths (cache
 * invalidation, etc.) don't have a single channel/template in scope.
 */
export interface CommsLogContext {
  tenant_id: string;
  channel?: CommsProviderChannel | 'in_app';
  template_key?: string;
  notification_id?: string;
  correlation_id?: string;
  // Free-form tail. NEVER put recipient address, plaintext body,
  // or any credential value here.
  [extra: string]: unknown;
}

export type CommsLogLevel = 'log' | 'error' | 'warn' | 'debug';

/**
 * `CommsLoggerService` is the structured logger for code under
 * `apps/api/src/modules/communications/`. Mirrors NestJS `Logger` API.
 *
 * Request-scoped: when `REQUEST` is injectable (HTTP path), pulls
 * `tenant_id` and `correlation_id` from the request automatically.
 * In worker / cron scopes there is no request, so callers MUST pass
 * `tenant_id` (and ideally `correlation_id`) explicitly.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CommsLoggerService {
  private readonly logger: Logger;
  private context: string = 'Comms';

  constructor(@Optional() @Inject(REQUEST) private readonly request?: Request) {
    this.logger = new Logger();
  }

  setContext(context: string): this {
    this.context = context;
    return this;
  }

  log(message: string, ctx: CommsLogContext): void {
    this.write('log', message, ctx);
  }

  error(message: string, ctx: CommsLogContext, trace?: string): void {
    this.write('error', message, ctx, trace);
  }

  warn(message: string, ctx: CommsLogContext): void {
    this.write('warn', message, ctx);
  }

  debug(message: string, ctx: CommsLogContext): void {
    this.write('debug', message, ctx);
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private write(level: CommsLogLevel, message: string, ctx: CommsLogContext, trace?: string): void {
    const merged = this.mergeRequestContext(ctx);

    if (process.env.NODE_ENV === 'production') {
      const record: Record<string, unknown> = {
        level,
        msg: message,
        context: this.context,
        ts: new Date().toISOString(),
        ...merged,
      };
      if (trace) record.trace = trace;
      this.logger.log(JSON.stringify(record), this.context);
      return;
    }

    // Dev: human-readable single-line format.
    const channelLabel = merged.channel ? `[${merged.channel}]` : '';
    const tenantLabel = `tenant=${merged.tenant_id}`;
    const templateLabel = merged.template_key ? `template=${merged.template_key}` : '';
    const corrLabel = merged.correlation_id ? `corr=${merged.correlation_id}` : '';
    const notifLabel = merged.notification_id ? `notif=${merged.notification_id}` : '';
    const tags = [tenantLabel, templateLabel, notifLabel, corrLabel].filter(Boolean).join(' ');
    const formatted = `${channelLabel} ${tags} — ${message}`.trim();

    switch (level) {
      case 'log':
        this.logger.log(formatted, this.context);
        break;
      case 'error':
        this.logger.error(formatted, trace, this.context);
        break;
      case 'warn':
        this.logger.warn(formatted, this.context);
        break;
      case 'debug':
        this.logger.debug(formatted, this.context);
        break;
    }
  }

  private mergeRequestContext(ctx: CommsLogContext): CommsLogContext {
    if (!this.request) return ctx;
    const out: CommsLogContext = { ...ctx };
    const reqAny = this.request as unknown as {
      tenantContext?: { tenant_id?: string };
      correlation_id?: string;
      headers?: { 'x-correlation-id'?: string };
    };
    if (!out.tenant_id && reqAny.tenantContext?.tenant_id) {
      out.tenant_id = reqAny.tenantContext.tenant_id;
    }
    if (!out.correlation_id) {
      out.correlation_id =
        reqAny.correlation_id ?? reqAny.headers?.['x-correlation-id'] ?? undefined;
    }
    return out;
  }
}
