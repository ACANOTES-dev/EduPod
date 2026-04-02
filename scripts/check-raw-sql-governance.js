#!/usr/bin/env node

/**
 * ─── Raw SQL Governance Check ─────────────────────────────────────────────────
 *
 * Scans the codebase for all raw SQL usage ($executeRaw, $queryRaw,
 * $executeRawUnsafe, $queryRawUnsafe) and cross-references against the
 * allowlist in packages/eslint-config/raw-sql-allowlist.json.
 *
 * Reports:
 *   - Total raw SQL call sites by category
 *   - Any production code files using raw SQL that are NOT in the allowlist
 *   - Summary counts for governance visibility
 *
 * Exit codes:
 *   0 — All production raw SQL usage is governed (in allowlist or auto-allowed)
 *   1 — Ungoverned raw SQL found in production code
 *
 * Run: node scripts/check-raw-sql-governance.js
 * ──────────────────────────────────────────────────────────────────────────────
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Load allowlist ───────────────────────────────────────────────────────────
const allowlist = require(path.join(ROOT, 'packages/eslint-config/raw-sql-allowlist.json'));
const allowedFiles = new Set(allowlist.allowlist.map((e) => e.file));

// ─── Patterns to search ──────────────────────────────────────────────────────
const RAW_SQL_PATTERN =
  '\\$executeRaw|\\$queryRaw|\\$executeRawUnsafe|\\$queryRawUnsafe';

// ─── Auto-allowed path patterns ──────────────────────────────────────────────
function isAutoAllowed(filePath) {
  return (
    filePath.endsWith('.spec.ts') ||
    filePath.endsWith('.spec.js') ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.test.js') ||
    filePath.endsWith('.e2e-spec.ts') ||
    filePath.includes('-spec.ts') ||
    filePath.includes('/migrations/') ||
    filePath.includes('/seed') ||
    filePath.includes('/rules/') ||
    filePath.includes('/tests/') ||
    filePath.includes('/dist/') ||
    filePath.endsWith('.sql') ||
    filePath.endsWith('.md') ||
    filePath.endsWith('.json') ||
    filePath.endsWith('.sh') ||
    filePath.includes('/node_modules/') ||
    filePath.includes('Plans/') ||
    filePath.includes('Audits/') ||
    filePath.includes('Manuals/') ||
    filePath.includes('Next_Feature/') ||
    filePath.includes('Next Features/') ||
    filePath.includes('architecture/') ||
    filePath.includes('docs/') ||
    filePath.includes('.claude/')
  );
}

// ─── Run ripgrep / grep to find all raw SQL call sites ───────────────────────
let grepOutput;
try {
  grepOutput = execSync(
    `grep -rn --include='*.ts' --include='*.js' -E '${RAW_SQL_PATTERN}' apps/ packages/ || true`,
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  );
} catch {
  console.error('Failed to run grep');
  process.exit(1);
}

// ─── Parse results ───────────────────────────────────────────────────────────
const lines = grepOutput.split('\n').filter((l) => l.trim());

// Filter out lines that are just comments/strings mentioning these methods
const codeLines = lines.filter((line) => {
  const content = line.split(':').slice(2).join(':');
  // Skip pure comment lines
  if (/^\s*(\/\/|\*|\/\*)/.test(content)) return false;
  // Skip import type lines
  if (/import\s+type/.test(content)) return false;
  // Skip lines that only reference the method name in a string/comment context
  // but DO include actual method calls
  return true;
});

const categorized = {
  allowlisted: [],
  autoAllowed: [],
  ungoverned: [],
};

const fileUsageMap = new Map();

for (const line of codeLines) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) continue;
  const filePath = line.substring(0, colonIdx);

  if (!fileUsageMap.has(filePath)) {
    fileUsageMap.set(filePath, []);
  }
  fileUsageMap.get(filePath).push(line);

  if (isAutoAllowed(filePath)) {
    categorized.autoAllowed.push(line);
  } else if (Array.from(allowedFiles).some((af) => filePath.endsWith(af) || filePath === af)) {
    categorized.allowlisted.push(line);
  } else {
    categorized.ungoverned.push(line);
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
console.log('');
console.log('─── Raw SQL Governance Report ────────────────────────────────');
console.log('');
console.log(`  Total raw SQL call sites:     ${codeLines.length}`);
console.log(`  Allowlisted (production):     ${categorized.allowlisted.length}`);
console.log(`  Auto-allowed (test/seed/etc): ${categorized.autoAllowed.length}`);
console.log(`  Ungoverned:                   ${categorized.ungoverned.length}`);
console.log('');

// Show allowlist summary by category
const categoryCount = {};
for (const entry of allowlist.allowlist) {
  categoryCount[entry.category] = (categoryCount[entry.category] || 0) + 1;
}
console.log('  Allowlist by category:');
for (const [cat, count] of Object.entries(categoryCount).sort()) {
  console.log(`    ${cat}: ${count} files`);
}
console.log('');

if (categorized.ungoverned.length > 0) {
  // Deduplicate by file
  const ungovernedFiles = new Set();
  for (const line of categorized.ungoverned) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      ungovernedFiles.add(line.substring(0, colonIdx));
    }
  }

  console.log('  UNGOVERNED raw SQL found in:');
  for (const file of [...ungovernedFiles].sort()) {
    console.log(`    - ${file}`);
  }
  console.log('');
  console.log('  Action: Add these files to packages/eslint-config/raw-sql-allowlist.json');
  console.log('  with a category and reason, or remove the raw SQL usage.');
  console.log('');
  console.log('FAILED: Ungoverned raw SQL detected');
  process.exit(1);
} else {
  console.log('PASSED: All raw SQL usage is governed');
  process.exit(0);
}
