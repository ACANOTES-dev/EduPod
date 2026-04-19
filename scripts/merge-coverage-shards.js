#!/usr/bin/env node
/*
 * Merges Jest shard coverage-final.json files and checks package thresholds.
 *
 * Used by CI after sharded unit-tests complete. Each shard writes its
 * coverage-final.json to coverage/shard-N/; we merge them here and apply the
 * thresholds from the package's jest.config.js.
 *
 * Usage:
 *   node scripts/merge-coverage-shards.js <package-dir> <shards-dir>
 *
 * Example:
 *   node scripts/merge-coverage-shards.js apps/api coverage-shards-api
 *
 * Exits non-zero if any threshold is below the configured floor.
 */

const fs = require('fs');
const path = require('path');
const libCoverage = require('istanbul-lib-coverage');

const [, , packageDir, shardsDir] = process.argv;

if (!packageDir || !shardsDir) {
  console.error('Usage: merge-coverage-shards.js <package-dir> <shards-dir>');
  process.exit(2);
}

const repoRoot = path.resolve(__dirname, '..');
const absPackageDir = path.resolve(repoRoot, packageDir);
const absShardsDir = path.resolve(repoRoot, shardsDir);

const jestConfigPath = path.join(absPackageDir, 'jest.config.js');
if (!fs.existsSync(jestConfigPath)) {
  console.error(`[${packageDir}] jest.config.js not found at ${jestConfigPath}`);
  process.exit(1);
}

const jestConfig = require(jestConfigPath);
const thresholds = jestConfig.coverageThreshold && jestConfig.coverageThreshold.global;

if (!thresholds) {
  console.log(`[${packageDir}] No coverage thresholds defined — merging but skipping gate.`);
}

if (!fs.existsSync(absShardsDir)) {
  console.error(`[${packageDir}] shards directory not found: ${absShardsDir}`);
  process.exit(1);
}

const shardDirs = fs
  .readdirSync(absShardsDir)
  .filter((d) => d.startsWith('shard-'))
  .map((d) => path.join(absShardsDir, d));

if (shardDirs.length === 0) {
  console.error(`[${packageDir}] No shard-* directories found in ${absShardsDir}`);
  process.exit(1);
}

const map = libCoverage.createCoverageMap();
let mergedCount = 0;

for (const dir of shardDirs) {
  const coverageFile = path.join(dir, 'coverage-final.json');
  if (!fs.existsSync(coverageFile)) {
    console.warn(`[${packageDir}] ${coverageFile} missing, skipping`);
    continue;
  }
  map.merge(JSON.parse(fs.readFileSync(coverageFile, 'utf8')));
  mergedCount++;
}

if (mergedCount === 0) {
  console.error(`[${packageDir}] No coverage-final.json files found in any shard`);
  process.exit(1);
}

// Compute global summary by summing covered/total across files.
const totals = { statements: [0, 0], branches: [0, 0], functions: [0, 0], lines: [0, 0] };
for (const file of map.files()) {
  const summary = map.fileCoverageFor(file).toSummary();
  for (const metric of Object.keys(totals)) {
    totals[metric][0] += summary[metric].covered;
    totals[metric][1] += summary[metric].total;
  }
}

const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);
const result = {};
for (const metric of Object.keys(totals)) {
  result[metric] = pct(totals[metric][0], totals[metric][1]);
}

console.log(`\n=== Merged coverage for ${packageDir} (${mergedCount} shards) ===`);
for (const metric of Object.keys(totals)) {
  const [covered, total] = totals[metric];
  const threshold = thresholds ? thresholds[metric] : undefined;
  const line = `  ${metric.padEnd(11)} ${result[metric].toFixed(2).padStart(6)}% (${covered}/${total})`;
  console.log(threshold !== undefined ? `${line}  threshold: ${threshold}%` : line);
}

if (!thresholds) {
  process.exit(0);
}

const failures = [];
for (const metric of Object.keys(thresholds)) {
  if (result[metric] < thresholds[metric]) {
    failures.push(`${metric} ${result[metric].toFixed(2)}% < ${thresholds[metric]}%`);
  }
}

if (failures.length > 0) {
  console.error(`\n✗ Coverage gate FAILED for ${packageDir}:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\n✓ Coverage gate passed for ${packageDir}`);
