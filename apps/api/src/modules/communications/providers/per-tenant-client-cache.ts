/**
 * Generic per-tenant client cache with LRU + idle-TTL eviction.
 *
 * Each provider (Resend, Twilio SMS, Twilio WhatsApp) owns one of these
 * keyed by the same `tenant_id` strings used for RLS. Eviction triggers:
 *   1. Cache bus events on `comms:config-changed` (cross-process)
 *   2. LRU pressure (>maxSize distinct tenants)
 *   3. Idle TTL (default 30 min)
 */

interface Entry<T> {
  value: T;
  lastAccessedAt: number; // ms epoch
  /**
   * Optional dispose hook — invoked when the entry is evicted via LRU,
   * TTL, or explicit invalidate. Lets a provider close SDK-internal
   * resources (e.g., underlying HTTP agents) if it ever needs to.
   */
  dispose?: (value: T) => void;
}

export interface PerTenantClientCacheOptions {
  /** Max distinct tenants in the cache. Default 1000. */
  maxSize?: number;
  /** Idle TTL in ms — entry evicted if not accessed within window. Default 30 min. */
  ttlMs?: number;
  /** Wall clock — overridable for tests. Default `Date.now`. */
  now?: () => number;
}

export class PerTenantClientCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: PerTenantClientCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns the cached client for `tenantId`, creating it via `factory`
   * if absent or expired. Promotes the entry to most-recently-used.
   */
  getOrCreate(tenantId: string, factory: () => T, dispose?: (value: T) => void): T {
    const existing = this.entries.get(tenantId);
    const now = this.now();

    if (existing && now - existing.lastAccessedAt < this.ttlMs) {
      // Hit — promote to MRU by re-inserting.
      this.entries.delete(tenantId);
      existing.lastAccessedAt = now;
      this.entries.set(tenantId, existing);
      return existing.value;
    }

    if (existing) {
      // Expired — dispose.
      this.disposeEntry(existing);
      this.entries.delete(tenantId);
    }

    const value = factory();
    const entry: Entry<T> = { value, lastAccessedAt: now, dispose };
    this.entries.set(tenantId, entry);

    // Evict LRU if over capacity. Map preserves insertion order, so the
    // oldest entry is the first key.
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.disposeEntry(oldest);
      this.entries.delete(oldestKey);
    }

    return value;
  }

  invalidate(tenantId: string): void {
    const entry = this.entries.get(tenantId);
    if (entry) {
      this.disposeEntry(entry);
      this.entries.delete(tenantId);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.disposeEntry(entry);
    }
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private disposeEntry(entry: Entry<T>): void {
    if (!entry.dispose) return;
    try {
      entry.dispose(entry.value);
    } catch (err) {
      // Dispose is fire-and-forget — never let it break eviction. Log
      // via console.error so failures surface in dev/prod logs without
      // bringing down the cache.
      // eslint-disable-next-line no-console
      console.error(
        `[PerTenantClientCache] dispose hook threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
