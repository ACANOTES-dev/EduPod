import { getCorrelationId } from '../middleware/correlation.middleware';

/**
 * Returns the current correlation ID for inclusion in BullMQ job payloads.
 *
 * Usage in services when enqueuing jobs:
 *   await this.queue.add('job:name', {
 *     tenant_id: tenantId,
 *     ...getJobCorrelationContext(),
 *     // ...other payload fields
 *   });
 *
 * This allows tracing: HTTP request -> enqueued job -> job processing logs
 * all share the same correlation ID.
 */
export function getJobCorrelationContext(): { correlation_id?: string } {
  const correlationId = getCorrelationId();
  return correlationId ? { correlation_id: correlationId } : {};
}
