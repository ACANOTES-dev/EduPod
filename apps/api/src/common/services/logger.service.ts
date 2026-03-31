import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';

import { getRequestContext } from '../middleware/correlation.middleware';

// ─── Structured log entry ───────────────────────────────────────────────────

interface StructuredLogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId: string | null;
  tenantId: string | null;
  userId: string | null;
  context: string | null;
}

// ─── Structured logger service ──────────────────────────────────────────────

/**
 * Structured JSON logger service.
 *
 * Extends NestJS ConsoleLogger to output structured JSON lines with automatic
 * inclusion of requestId, tenantId, and userId from the AsyncLocalStorage
 * request context. In production, all output is valid JSON for log aggregation.
 * In development, falls back to NestJS default coloured output.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLoggerService extends ConsoleLogger {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  // ─── Log level overrides ────────────────────────────────────────────────

  log(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('log', message, context);
    } else {
      super.log(message, context);
    }
  }

  error(message: string, trace?: string, context?: string): void {
    if (this.isProduction) {
      const entry = this.buildEntry('error', message, context);
      if (trace) {
        (entry as StructuredLogEntry & { trace: string }).trace = trace;
      }
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      super.error(message, trace, context);
    }
  }

  warn(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('warn', message, context);
    } else {
      super.warn(message, context);
    }
  }

  debug(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('debug', message, context);
    } else {
      super.debug(message, context);
    }
  }

  verbose(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('verbose', message, context);
    } else {
      super.verbose(message, context);
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private buildEntry(level: string, message: string, context?: string): StructuredLogEntry {
    const reqCtx = getRequestContext();

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: reqCtx?.requestId ?? null,
      tenantId: reqCtx?.tenantId ?? null,
      userId: reqCtx?.userId ?? null,
      context: context ?? this.context ?? null,
    };
  }

  private writeStructured(level: string, message: string, context?: string): void {
    const entry = this.buildEntry(level, message, context);
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }

  /**
   * Returns the log levels that should be enabled. This matches the default
   * NestJS behaviour: all levels in dev, log/error/warn in production.
   */
  static getLogLevels(): LogLevel[] {
    if (process.env.NODE_ENV === 'production') {
      return ['log', 'error', 'warn'];
    }
    return ['log', 'error', 'warn', 'debug', 'verbose'];
  }
}
