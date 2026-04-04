import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';

import { getRequestContext } from '../middleware/correlation.middleware';

import type { LokiLogShipper, StructuredLogEntry } from './loki-log-shipper.service';

export type { StructuredLogEntry };

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
  private static shipper: LokiLogShipper | null = null;

  static setShipper(shipper: LokiLogShipper): void {
    StructuredLoggerService.shipper = shipper;
  }

  static clearShipper(): void {
    StructuredLoggerService.shipper = null;
  }

  // ─── Log level overrides ────────────────────────────────────────────────

  override log(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('log', message, context);
    } else {
      super.log(message, context);
    }
  }

  override error(message: string, trace?: string, context?: string): void {
    if (this.isProduction) {
      const entry = this.buildEntry('error', message, context);
      if (trace) {
        (entry as StructuredLogEntry & { trace: string }).trace = trace;
      }
      process.stderr.write(JSON.stringify(entry) + '\n');
      StructuredLoggerService.shipper?.ship(entry);
    } else {
      super.error(message, trace, context);
    }
  }

  override warn(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('warn', message, context);
    } else {
      super.warn(message, context);
    }
  }

  override debug(message: string, context?: string): void {
    if (this.isProduction) {
      this.writeStructured('debug', message, context);
    } else {
      super.debug(message, context);
    }
  }

  override verbose(message: string, context?: string): void {
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
    StructuredLoggerService.shipper?.ship(entry);
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
