import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const ignoredGhsaIds = new Set(packageJson.securityAudit?.ignoredGhsaIds ?? []);

const audit = spawnSync(
  'pnpm',
  ['audit', '--audit-level=high', '--ignore-registry-errors', '--json'],
  {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  },
);

const stdout = audit.stdout?.trim();

if (!stdout) {
  console.error('Security audit produced no JSON output.');
  if (audit.stderr) {
    console.error(audit.stderr.trim());
  }
  process.exit(audit.status ?? 1);
}

let data;

try {
  data = JSON.parse(stdout);
} catch (error) {
  console.error('Failed to parse pnpm audit JSON output.');
  console.error(stdout);
  console.error(error);
  process.exit(1);
}

const advisories = Object.values(data.advisories ?? {});
const unignoredHighAdvisories = advisories.filter((advisory) => {
  return advisory.severity === 'high' && !ignoredGhsaIds.has(advisory.github_advisory_id);
});

if (unignoredHighAdvisories.length > 0) {
  console.error('Unignored high-severity advisories:');
  for (const advisory of unignoredHighAdvisories) {
    console.error(`  ${advisory.github_advisory_id} ${advisory.module_name}: ${advisory.title}`);
  }
  process.exit(1);
}

console.log(
  `Security audit passed (${advisories.length} advisories, all high-severity GHSA findings ignored or below threshold)`,
);
