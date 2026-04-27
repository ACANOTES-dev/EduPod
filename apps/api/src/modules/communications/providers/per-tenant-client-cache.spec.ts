import { PerTenantClientCache } from './per-tenant-client-cache';

describe('PerTenantClientCache', () => {
  it('factory called once for repeated getOrCreate of the same tenant', () => {
    const cache = new PerTenantClientCache<string>();
    const factory = jest.fn().mockReturnValue('client-A');
    cache.getOrCreate('t1', factory);
    cache.getOrCreate('t1', factory);
    cache.getOrCreate('t1', factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('invalidate forces factory re-call', () => {
    const cache = new PerTenantClientCache<string>();
    const factory = jest.fn().mockReturnValueOnce('A').mockReturnValueOnce('B');
    expect(cache.getOrCreate('t1', factory)).toBe('A');
    cache.invalidate('t1');
    expect(cache.getOrCreate('t1', factory)).toBe('B');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('LRU evicts oldest entry when maxSize exceeded', () => {
    const cache = new PerTenantClientCache<string>({ maxSize: 3 });
    cache.getOrCreate('t1', () => '1');
    cache.getOrCreate('t2', () => '2');
    cache.getOrCreate('t3', () => '3');
    cache.getOrCreate('t4', () => '4');
    expect(cache.size()).toBe(3);
    // t1 should be evicted; calling getOrCreate should re-invoke factory.
    const factory = jest.fn().mockReturnValue('1*');
    cache.getOrCreate('t1', factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('LRU promotes on access — accessed entry survives', () => {
    const cache = new PerTenantClientCache<string>({ maxSize: 3 });
    cache.getOrCreate('t1', () => '1');
    cache.getOrCreate('t2', () => '2');
    cache.getOrCreate('t3', () => '3');
    cache.getOrCreate('t1', () => 'should-not-fire'); // promote t1
    cache.getOrCreate('t4', () => '4'); // should evict t2, not t1
    const factoryT1 = jest.fn().mockReturnValue('1-replaced');
    cache.getOrCreate('t1', factoryT1);
    expect(factoryT1).not.toHaveBeenCalled(); // t1 still cached
  });

  it('idle TTL expires entries', () => {
    let now = 1_000_000;
    const cache = new PerTenantClientCache<string>({ ttlMs: 1000, now: () => now });
    const factory = jest.fn().mockReturnValueOnce('A').mockReturnValueOnce('B');
    cache.getOrCreate('t1', factory);
    now += 1500; // past TTL
    cache.getOrCreate('t1', factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('dispose hook called on invalidate', () => {
    const cache = new PerTenantClientCache<string>();
    const dispose = jest.fn();
    cache.getOrCreate('t1', () => 'val', dispose);
    cache.invalidate('t1');
    expect(dispose).toHaveBeenCalledWith('val');
  });

  it('dispose hook errors do not break eviction', () => {
    const cache = new PerTenantClientCache<string>();
    const dispose = jest.fn(() => {
      throw new Error('boom');
    });
    cache.getOrCreate('t1', () => 'val', dispose);
    expect(() => cache.invalidate('t1')).not.toThrow();
  });

  it('clear empties the cache and invokes dispose for each entry', () => {
    const cache = new PerTenantClientCache<string>();
    const dispose = jest.fn();
    cache.getOrCreate('t1', () => '1', dispose);
    cache.getOrCreate('t2', () => '2', dispose);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
