import { shadowRead, shadowReadSync } from './shadow-read.helper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('shadowRead', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shadowRead — basic behaviour', () => {
    it('should return the primary result when both agree', async () => {
      const result = await shadowRead({
        label: 'test.basic',
        primary: async () => ({ id: 1, name: 'Alice' }),
        shadow: async () => ({ id: 1, name: 'Alice' }),
        tenantId: TENANT_ID,
      });

      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should return the primary result even when shadow diverges', async () => {
      const result = await shadowRead({
        label: 'test.diverge',
        primary: async () => ({ id: 1, name: 'Alice' }),
        shadow: async () => ({ id: 1, name: 'Bob' }),
        tenantId: TENANT_ID,
      });

      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should return the primary result when shadow throws', async () => {
      const result = await shadowRead({
        label: 'test.shadow-error',
        primary: async () => 42,
        shadow: async () => {
          throw new Error('Shadow exploded');
        },
        tenantId: TENANT_ID,
      });

      expect(result).toBe(42);
    });
  });

  describe('shadowReadSync — divergence detection', () => {
    it('should report no divergence when results match', async () => {
      const { result, diverged } = await shadowReadSync({
        label: 'test.sync-match',
        primary: async () => [1, 2, 3],
        shadow: async () => [1, 2, 3],
        tenantId: TENANT_ID,
      });

      expect(result).toEqual([1, 2, 3]);
      expect(diverged).toBe(false);
    });

    it('should report divergence when results differ', async () => {
      const warnSpy = jest
        .spyOn(jest.requireActual('@nestjs/common').Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const { result, diverged } = await shadowReadSync({
        label: 'test.sync-diverge',
        primary: async () => ({ count: 10 }),
        shadow: async () => ({ count: 11 }),
        tenantId: TENANT_ID,
      });

      expect(result).toEqual({ count: 10 });
      expect(diverged).toBe(true);

      warnSpy.mockRestore();
    });

    it('should report divergence when shadow throws', async () => {
      const errorSpy = jest
        .spyOn(jest.requireActual('@nestjs/common').Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const { result, diverged } = await shadowReadSync({
        label: 'test.sync-error',
        primary: async () => 'ok',
        shadow: async () => {
          throw new Error('Connection timeout');
        },
        tenantId: TENANT_ID,
      });

      expect(result).toBe('ok');
      expect(diverged).toBe(true);

      errorSpy.mockRestore();
    });
  });

  describe('shadowReadSync — custom compare', () => {
    it('should use custom compare function when provided', async () => {
      const { diverged } = await shadowReadSync({
        label: 'test.custom-compare',
        primary: async () => ({ id: 1, name: 'Alice', updatedAt: '2026-01-01' }),
        shadow: async () => ({ id: 1, name: 'Alice', updatedAt: '2026-01-02' }),
        compare: (a, b) => a.id === b.id && a.name === b.name,
        tenantId: TENANT_ID,
      });

      // Custom compare ignores updatedAt, so no divergence
      expect(diverged).toBe(false);
    });

    it('should detect divergence with custom compare', async () => {
      const warnSpy = jest
        .spyOn(jest.requireActual('@nestjs/common').Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const { diverged } = await shadowReadSync({
        label: 'test.custom-compare-diverge',
        primary: async () => ({ id: 1, name: 'Alice' }),
        shadow: async () => ({ id: 1, name: 'Bob' }),
        compare: (a, b) => a.name === b.name,
        tenantId: TENANT_ID,
      });

      expect(diverged).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('shadowRead — error isolation', () => {
    it('should not let shadow errors propagate to caller', async () => {
      // The shadow throws, but the primary should succeed cleanly
      const promise = shadowRead({
        label: 'test.isolation',
        primary: async () => 'safe',
        shadow: async () => {
          throw new TypeError('Cannot read properties of undefined');
        },
        tenantId: TENANT_ID,
      });

      await expect(promise).resolves.toBe('safe');
    });

    it('should propagate primary errors to caller', async () => {
      const promise = shadowRead({
        label: 'test.primary-error',
        primary: async () => {
          throw new Error('Primary failed');
        },
        shadow: async () => 'fallback',
        tenantId: TENANT_ID,
      });

      await expect(promise).rejects.toThrow('Primary failed');
    });
  });
});
