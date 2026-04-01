import { benchmark, hasPerformanceRegression } from '../utils/benchmark.helper';
import type { BenchmarkResult } from '../utils/benchmark.helper';

/**
 * Example performance benchmark test.
 *
 * These files use the *.performance.spec.ts suffix and are excluded from
 * normal test runs (see jest.config.js testPathIgnorePatterns).
 *
 * Run manually with: npx jest --testPathPattern=performance
 *
 * Usage pattern:
 * 1. Before refactoring, run the benchmark and record the baseline
 * 2. Make your changes
 * 3. Run the benchmark again
 * 4. Compare p95 — if >20% increase, investigate before merging
 */
describe('Benchmark — example patterns', () => {
  describe('benchmark utility', () => {
    it('should measure a simple computation', async () => {
      const result = await benchmark(
        'array-sort-1000',
        async () => {
          const arr = Array.from({ length: 1000 }, () => Math.random());
          arr.sort((a, b) => a - b);
        },
        50,
      );

      expect(result.label).toBe('array-sort-1000');
      expect(result.iterations).toBe(50);
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
      expect(result.minMs).toBeLessThanOrEqual(result.avgMs);
      expect(result.maxMs).toBeGreaterThanOrEqual(result.avgMs);
      expect(result.p95Ms).toBeGreaterThanOrEqual(result.minMs);
      expect(result.medianMs).toBeGreaterThanOrEqual(result.minMs);
    });

    it('should measure an async operation', async () => {
      const result = await benchmark(
        'async-delay',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
        },
        10,
      );

      expect(result.avgMs).toBeGreaterThanOrEqual(0.5);
      expect(result.iterations).toBe(10);
    });
  });

  describe('hasPerformanceRegression', () => {
    it('should detect regression above threshold', () => {
      const baseline: BenchmarkResult = {
        label: 'test',
        iterations: 100,
        avgMs: 10,
        minMs: 5,
        maxMs: 20,
        p95Ms: 15,
        medianMs: 10,
      };

      const current: BenchmarkResult = {
        ...baseline,
        p95Ms: 20, // 33% increase
      };

      expect(hasPerformanceRegression(baseline, current)).toBe(true);
    });

    it('should not flag acceptable variation', () => {
      const baseline: BenchmarkResult = {
        label: 'test',
        iterations: 100,
        avgMs: 10,
        minMs: 5,
        maxMs: 20,
        p95Ms: 15,
        medianMs: 10,
      };

      const current: BenchmarkResult = {
        ...baseline,
        p95Ms: 17, // ~13% increase — within threshold
      };

      expect(hasPerformanceRegression(baseline, current)).toBe(false);
    });

    it('should handle zero baseline gracefully', () => {
      const baseline: BenchmarkResult = {
        label: 'test',
        iterations: 100,
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
        p95Ms: 0,
        medianMs: 0,
      };

      const current: BenchmarkResult = {
        ...baseline,
        p95Ms: 5,
      };

      // Zero baseline — cannot compute percentage, no regression
      expect(hasPerformanceRegression(baseline, current)).toBe(false);
    });
  });
});
