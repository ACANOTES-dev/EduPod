import { Logger } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  /** Human-readable label for the benchmark */
  label: string;
  /** Number of iterations executed */
  iterations: number;
  /** Average execution time in milliseconds */
  avgMs: number;
  /** Minimum execution time in milliseconds */
  minMs: number;
  /** Maximum execution time in milliseconds */
  maxMs: number;
  /** 95th percentile execution time in milliseconds */
  p95Ms: number;
  /** Median execution time in milliseconds */
  medianMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ITERATIONS = 100;
const PERCENTILE_95 = 0.95;

// ─── Benchmark ────────────────────────────────────────────────────────────────

const logger = new Logger('Benchmark');

/**
 * Runs a function N times and reports timing statistics.
 *
 * Used in *.performance.spec.ts files to establish performance baselines
 * before and after major refactors.
 *
 * Performance regression threshold: >20% increase in p95 = investigate.
 *
 * @param label - Human-readable description of what's being benchmarked
 * @param fn - The async function to benchmark
 * @param iterations - Number of times to run fn (default: 100)
 * @returns Timing statistics including avg, min, max, p95, median
 */
export async function benchmark(
  label: string,
  fn: () => Promise<void>,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<BenchmarkResult> {
  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    timings.push(end - start);
  }

  // Sort for percentile calculations
  const sorted = [...timings].sort((a, b) => a - b);

  const sum = sorted.reduce((acc, t) => acc + t, 0);
  const avgMs = round(sum / iterations);
  const minMs = round(sorted[0] ?? 0);
  const maxMs = round(sorted[sorted.length - 1] ?? 0);
  const p95Ms = round(percentile(sorted, PERCENTILE_95));
  const medianMs = round(percentile(sorted, 0.5));

  const result: BenchmarkResult = {
    label,
    iterations,
    avgMs,
    minMs,
    maxMs,
    p95Ms,
    medianMs,
  };

  logger.log(
    `[${label}] ${iterations} iterations — ` +
      `avg: ${avgMs}ms, min: ${minMs}ms, max: ${maxMs}ms, ` +
      `p95: ${p95Ms}ms, median: ${medianMs}ms`,
  );

  return result;
}

/**
 * Compares two benchmark results and checks if there is a regression.
 *
 * @param baseline - The before result
 * @param current - The after result
 * @param thresholdPercent - Allowed p95 increase percentage (default: 20)
 * @returns true if p95 increased by more than the threshold
 */
export function hasPerformanceRegression(
  baseline: BenchmarkResult,
  current: BenchmarkResult,
  thresholdPercent: number = 20,
): boolean {
  if (baseline.p95Ms === 0) {
    return false;
  }
  const increasePercent = ((current.p95Ms - baseline.p95Ms) / baseline.p95Ms) * 100;
  return increasePercent > thresholdPercent;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
