import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Recursively converts BigInt values to numbers in a response object.
 * BigInt values that exceed Number.MAX_SAFE_INTEGER are converted to strings.
 */
function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeBigInt);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = serializeBigInt(v);
    }
    return result;
  }
  return value;
}

/**
 * Wraps all successful responses in { data: T } envelope.
 * Pagination meta is preserved if present.
 * BigInt values are converted to numbers (or strings if > MAX_SAFE_INTEGER).
 *
 * Note: endpoints using @Res() decorator bypass this interceptor entirely.
 * Only responses returned from controller methods go through this interceptor.
 */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((response) => {
        // Serialize BigInt values before wrapping
        const serialized = serializeBigInt(response);

        // If response already has 'data' property (e.g., paginated responses with meta),
        // pass through as-is to preserve the existing envelope structure
        if (serialized && typeof serialized === 'object' && 'data' in (serialized as object)) {
          return serialized;
        }

        return { data: serialized };
      }),
    );
  }
}
