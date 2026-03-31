import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// ─── Request context store ──────────────────────────────────────────────────

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Retrieve the current correlation ID from AsyncLocalStorage.
 * Returns undefined when called outside a request lifecycle.
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

/**
 * Retrieve the full request context from AsyncLocalStorage.
 * Returns undefined when called outside a request lifecycle.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Update the current request context with tenant and user info.
 * Called by auth guards after authentication resolves the user identity.
 */
export function enrichRequestContext(update: { tenantId?: string; userId?: string }): void {
  const store = asyncLocalStorage.getStore();
  if (!store) return;

  if (update.tenantId) {
    store.tenantId = update.tenantId;
  }
  if (update.userId) {
    store.userId = update.userId;
  }
}

// ─── Header constant ────────────────────────────────────────────────────────

export const REQUEST_ID_HEADER = 'x-request-id';

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Correlation middleware.
 *
 * Generates a UUID for each incoming request (or reuses an existing
 * X-Request-Id header for cross-service tracing). Stores the correlation ID
 * in AsyncLocalStorage so it is accessible anywhere in the request lifecycle
 * via `getCorrelationId()`.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.headers[REQUEST_ID_HEADER];
    const requestId = typeof incomingId === 'string' && incomingId.length > 0
      ? incomingId
      : randomUUID();

    // Set response header for traceability
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const context: RequestContext = { requestId };

    asyncLocalStorage.run(context, () => {
      next();
    });
  }
}
