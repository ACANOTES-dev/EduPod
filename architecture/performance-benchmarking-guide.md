# Performance Benchmarking Guide

Lightweight performance benchmarking for validating that refactors don't introduce regressions.

## When to Benchmark

Benchmark **before and after** any refactor rated High or Critical in the [refactor risk matrix](./refactor-risk-matrix.md). Specifically:

- Query replacements (Prisma query rewrite, raw SQL migration)
- Algorithm changes (calculation logic, sorting, filtering)
- Data flow changes (new joins, changed includes, pagination changes)
- Serialisation changes (response shape, transformation logic)

## File Naming

Performance tests use the `*.performance.spec.ts` suffix and are excluded from normal `jest` runs (see `apps/api/jest.config.js` — `testPathIgnorePatterns`).

Place them co-located with the code they test:

```
modules/gradebook/
  gradebook-calc.service.ts
  gradebook-calc.service.spec.ts              # Unit tests (run always)
  gradebook-calc.service.performance.spec.ts  # Benchmarks (run manually)
```

## Running Benchmarks

```bash
# Run all performance benchmarks
cd apps/api && npx jest --testPathPattern=performance

# Run a specific benchmark
cd apps/api && npx jest --testPathPattern=gradebook-calc.service.performance
```

## Writing a Benchmark

```typescript
import { benchmark, hasPerformanceRegression } from '../../common/utils/benchmark.helper';
import type { BenchmarkResult } from '../../common/utils/benchmark.helper';

describe('GradebookCalcService — performance', () => {
  it('should compute weighted averages within baseline', async () => {
    const result = await benchmark(
      'gradebook.weightedAverage.100students',
      async () => {
        // Set up test data and call the function under test
        await service.computeWeightedAverages(tenantId, classId);
      },
      100, // iterations
    );

    // Assert against known baseline
    expect(result.p95Ms).toBeLessThan(50); // 50ms ceiling
  });
});
```

## Reading Results

The `benchmark()` function logs and returns:

| Metric     | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `avgMs`    | Mean execution time                                |
| `minMs`    | Best case                                          |
| `maxMs`    | Worst case (often an outlier)                      |
| `p95Ms`    | 95th percentile — the key metric for regressions   |
| `medianMs` | Typical execution time (less affected by outliers) |

**Focus on `p95Ms`** — it captures the experience of the slowest 5% of executions without being skewed by a single outlier like `maxMs`.

## Regression Threshold

**>20% increase in p95 = investigate before merging.**

Use the `hasPerformanceRegression()` helper:

```typescript
const baseline: BenchmarkResult = {
  /* recorded before refactor */
};
const current = await benchmark('my-operation', fn, 100);

if (hasPerformanceRegression(baseline, current)) {
  // p95 increased by more than 20% — something got slower
}
```

### What to do when regression is detected

1. Profile the new code path — is there an N+1 query? Missing index? Unnecessary serialisation?
2. Check if the regression is real or noise — re-run 3 times, compare medians
3. If real and unavoidable, document why and get approval before merging
4. If avoidable, fix before merging

## Before/After Workflow

1. **Before refactoring**: Write the performance test, run it, record the baseline numbers in a comment
2. **Refactor**: Make your changes
3. **After refactoring**: Run the same performance test, compare against baseline
4. **Document**: Add baseline and current numbers as comments in the test file

```typescript
describe('StudentService.listActive — performance', () => {
  // Baseline (2026-04-01): avg=12ms, p95=18ms, median=11ms
  // Current  (2026-04-01): avg=11ms, p95=17ms, median=10ms — no regression
  it('should list active students within baseline', async () => {
    const result = await benchmark('students.listActive', fn, 100);
    expect(result.p95Ms).toBeLessThan(25); // 25ms ceiling with margin
  });
});
```

## Tips

- Run benchmarks on the same machine with similar load for consistent results
- Use at least 50 iterations for reliable p95 numbers
- Warm up caches before measuring if the code has caching
- Mock external services (DB, Redis) in unit benchmarks — measure the logic, not the network
- For integration benchmarks, use a dedicated test database
