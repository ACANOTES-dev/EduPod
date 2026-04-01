/**
 * check-module-size.ts
 *
 * Scans each directory under apps/api/src/modules/ and counts total lines of
 * TypeScript source files (excluding *.spec.ts and *.d.ts). Reports modules
 * that approach or exceed size thresholds and exits with code 1 if any module
 * exceeds the ERROR threshold.
 *
 * Thresholds:
 *   WARN  > 10,000 LOC  — module is growing large, consider splitting
 *   ERROR > 15,000 LOC  — module must be split before merging new work
 *
 * Usage:
 *   npx tsx scripts/check-module-size.ts
 *   npx ts-node scripts/check-module-size.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// Resolve script directory — works in both CJS (__dirname) and ESM (process.argv)
const __scriptDir: string =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(path.resolve(process.argv[1]));

// ─── Thresholds ───────────────────────────────────────────────────────────────

const WARN_LOC = 10_000;
const ERROR_LOC = 15_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'OK' | 'WARN' | 'ERROR';

interface ModuleReport {
  name: string;
  loc: number;
  status: Status;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively collects all .ts files that are not spec or declaration files.
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Counts the number of lines in a file.
 */
function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Split on newlines; a trailing newline produces an empty final element — subtract it
  const lines = content.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function resolveStatus(loc: number): Status {
  if (loc > ERROR_LOC) return 'ERROR';
  if (loc > WARN_LOC) return 'WARN';
  return 'OK';
}

// ─── Main scan ───────────────────────────────────────────────────────────────

function scan(): ModuleReport[] {
  const modulesRoot = path.resolve(__scriptDir, '..', 'apps', 'api', 'src', 'modules');

  if (!fs.existsSync(modulesRoot)) {
    console.error(`ERROR: modules directory not found at ${modulesRoot}`);
    process.exit(2);
  }

  const entries = fs.readdirSync(modulesRoot, { withFileTypes: true });
  const reports: ModuleReport[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const moduleDir = path.join(modulesRoot, entry.name);
    const files = collectSourceFiles(moduleDir);

    let loc = 0;
    for (const file of files) {
      loc += countLines(file);
    }

    reports.push({
      name: entry.name,
      loc,
      status: resolveStatus(loc),
    });
  }

  // Sort alphabetically by module name for deterministic output
  reports.sort((a, b) => a.name.localeCompare(b.name));

  return reports;
}

// ─── Report ──────────────────────────────────────────────────────────────────

function formatLoc(loc: number): string {
  return loc.toLocaleString('en-US');
}

function statusIcon(status: Status): string {
  switch (status) {
    case 'ERROR':
      return '✗ ERROR';
    case 'WARN':
      return '⚠ WARN';
    case 'OK':
      return '✓ OK';
  }
}

function report(reports: ModuleReport[]): void {
  const errorCount = reports.filter((r) => r.status === 'ERROR').length;
  const warnCount = reports.filter((r) => r.status === 'WARN').length;

  // Determine column widths dynamically
  const maxNameLen = Math.max(...reports.map((r) => r.name.length), 'Module'.length);
  const maxLocLen = Math.max(...reports.map((r) => formatLoc(r.loc).length), 'LOC'.length);
  const dividerLen = maxNameLen + maxLocLen + 14; // padding + status column

  const divider = '─'.repeat(dividerLen);

  console.log('');
  console.log('Module Size Report');
  console.log(divider);
  console.log(`${'Module'.padEnd(maxNameLen)}  ${'LOC'.padStart(maxLocLen)}  Status`);
  console.log(divider);

  for (const r of reports) {
    const locStr = formatLoc(r.loc).padStart(maxLocLen);
    const icon = statusIcon(r.status);
    console.log(`${r.name.padEnd(maxNameLen)}  ${locStr}  ${icon}`);
  }

  console.log(divider);
  console.log(
    `Total: ${reports.length} module${reports.length !== 1 ? 's' : ''}, ${errorCount} ERROR, ${warnCount} WARN`,
  );
  console.log('');

  if (errorCount > 0) {
    console.log(
      `ERROR: ${errorCount} module${errorCount !== 1 ? 's' : ''} exceed${errorCount === 1 ? 's' : ''} the ${ERROR_LOC.toLocaleString('en-US')}-LOC limit and must be split.`,
    );
    console.log('');
  }
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const reports = scan();
report(reports);

const hasErrors = reports.some((r) => r.status === 'ERROR');
if (hasErrors) {
  process.exit(1);
}
