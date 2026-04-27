/**
 * Redis pub/sub channel for cross-process invalidation of per-tenant
 * provider client caches. Both API and worker subscribe.
 *
 * Payload (JSON):
 *   { tenant_id: string, channel: 'email' | 'sms' | 'whatsapp', ts: number }
 */
export const COMMS_CACHE_BUS_CHANNEL = 'comms:config-changed';

/**
 * The three provider-backed channels covered by per-tenant credential
 * isolation. Used as the discriminator on cache bus events and inside
 * the per-tenant client cache.
 */
export const COMMS_PROVIDER_CHANNELS = ['email', 'sms', 'whatsapp'] as const;

export type CommsProviderChannel = (typeof COMMS_PROVIDER_CHANNELS)[number];

/**
 * Cache bus event payload. Keep the shape minimal — anything richer
 * goes through the regular DB read path on cache miss.
 */
export interface CommsCacheBusEvent {
  tenant_id: string;
  channel: CommsProviderChannel;
  ts: number; // Date.now() at publish time
}
