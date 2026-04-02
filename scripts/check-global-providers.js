#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Global Provider Registry Check
 *
 * Scans all *.ts files in apps/api/src/ for NestJS global provider registrations:
 *   - provide: APP_GUARD
 *   - provide: APP_INTERCEPTOR
 *   - provide: APP_FILTER
 *   - provide: APP_PIPE
 *
 * Global providers affect EVERY request in the application. Any new registration
 * not in the KNOWN_GLOBAL_PROVIDERS baseline will cause this check to fail,
 * prompting developers to update architecture/module-blast-radius.md before merging.
 *
 * Exit code 1 if any new (unknown) global provider is detected.
 * Exit code 0 if all found providers are in the known baseline.
 */

const fs = require('fs');
const path = require('path');

// ─── Known baseline ───────────────────────────────────────────────────────────

/**
 * The known set of global provider registrations in the codebase.
 * To add a new global provider legitimately:
 *   1. Add it here (with the correct type, class name, and file path fragment)
 *   2. Update architecture/module-blast-radius.md with the blast-radius analysis
 *   3. Get the PR reviewed by a senior engineer
 *
 * File path fragments are matched against the relative path from apps/api/src/.
 * Use a directory prefix (e.g. 'gdpr/') to match any file under that directory.
 *
 * @type {Array<{ type: string, class: string, file: string }>}
 */
const KNOWN_GLOBAL_PROVIDERS = [
  { type: 'APP_FILTER', class: 'SentryGlobalFilter', file: 'app.module.ts' },
  { type: 'APP_GUARD', class: 'DpaAcceptedGuard', file: 'gdpr/' },
  { type: 'APP_GUARD', class: 'AuthGuard', file: 'common/' },
  { type: 'APP_GUARD', class: 'PermissionGuard', file: 'common/' },
  { type: 'APP_GUARD', class: 'ThrottlerGuard', file: 'app.module.ts' }, // S-02: global rate limiting
  { type: 'APP_INTERCEPTOR', class: 'AuditLogInterceptor', file: 'audit-log/' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk a directory recursively and return all file paths.
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
  /** @type {string[]} */
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Given the content of a TypeScript file and a global provider type (e.g. 'APP_GUARD'),
 * extract the useClass value for each registration of that provider type.
 *
 * Matches patterns such as:
 *   provide: APP_GUARD,
 *   useClass: SomeClass,
 *
 * @param {string} content
 * @param {string} providerType  e.g. 'APP_GUARD'
 * @returns {string[]}  class names found
 */
function extractUseClasses(content, providerType) {
  const results = [];
  // Match the provide: APP_XXX token, then scan forward for the nearest useClass: Identifier
  const providePattern = new RegExp(`provide\\s*:\\s*${providerType}`, 'g');
  let match;
  while ((match = providePattern.exec(content)) !== null) {
    // Slice the content starting just after the `provide: APP_XXX` match
    const tail = content.slice(match.index + match[0].length);
    // Find the first useClass: ClassName occurrence (may have comma/whitespace in between)
    const useClassMatch = tail.match(/useClass\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (useClassMatch && useClassMatch[1]) {
      results.push(useClassMatch[1]);
    }
  }
  return results;
}

/**
 * Check whether a detected registration matches a known baseline entry.
 *
 * Matching rules:
 *   - type must match exactly
 *   - class must match exactly
 *   - the file's relative path must contain the known entry's file fragment
 *
 * @param {string} type
 * @param {string} className
 * @param {string} relPath  path relative to apps/api/src/
 * @returns {boolean}
 */
function isKnown(type, className, relPath) {
  return KNOWN_GLOBAL_PROVIDERS.some(
    (entry) => entry.type === type && entry.class === className && relPath.includes(entry.file),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PROVIDER_TYPES = ['APP_GUARD', 'APP_INTERCEPTOR', 'APP_FILTER', 'APP_PIPE'];

const repoRoot = path.resolve(__dirname, '..');
const apiSrcDir = path.join(repoRoot, 'apps', 'api', 'src');

if (!fs.existsSync(apiSrcDir)) {
  console.error(`[check-global-providers] API source directory not found: ${apiSrcDir}`);
  process.exit(1);
}

// Collect all .ts files (excluding test files — they can legitimately reference APP_* tokens)
const allFiles = walkDir(apiSrcDir).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'),
);

/**
 * @typedef {{ type: string, class: string, relPath: string, absPath: string }} Found
 */

/** @type {Found[]} */
const foundProviders = [];

for (const absPath of allFiles) {
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    // Skip unreadable files silently — they will surface in lint/build anyway
    continue;
  }

  const relPath = path.relative(apiSrcDir, absPath).replace(/\\/g, '/');

  for (const providerType of PROVIDER_TYPES) {
    const classes = extractUseClasses(content, providerType);
    for (const className of classes) {
      foundProviders.push({ type: providerType, class: className, relPath, absPath });
    }
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

const divider = '\u2501'.repeat(51);

console.log('\nGlobal Provider Registry Check');
console.log(divider);
console.log(`Known global providers: ${KNOWN_GLOBAL_PROVIDERS.length}`);
for (const entry of KNOWN_GLOBAL_PROVIDERS) {
  console.log(`  \u2713 ${entry.type}: ${entry.class} (${entry.file})`);
}
console.log(divider);

/** @type {Found[]} */
const newProviders = foundProviders.filter((f) => !isKnown(f.type, f.class, f.relPath));

if (newProviders.length === 0) {
  console.log('No new global providers found. \u2713\n');
  process.exit(0);
} else {
  console.log(`\u2717 NEW global provider(s) detected — blast-radius review required:\n`);
  for (const p of newProviders) {
    console.log(`  [${p.type}] ${p.class}`);
    console.log(`    File: apps/api/src/${p.relPath}`);
    console.log('');
  }
  console.log('Action required:');
  console.log(
    '  1. Add the new provider to KNOWN_GLOBAL_PROVIDERS in scripts/check-global-providers.js',
  );
  console.log('  2. Update architecture/module-blast-radius.md with the blast-radius analysis');
  console.log('  3. Get the change reviewed before merging\n');
  process.exit(1);
}
