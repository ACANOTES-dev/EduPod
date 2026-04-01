/**
 * check-doc-staleness.ts
 *
 * Scans all .md files in architecture/ and reports how recently each was
 * verified. Files with a "Last verified: YYYY-MM-DD" date that is >30 days old
 * are reported as WARN; >60 days old as ERROR. Files with no date are WARN.
 *
 * Usage:
 *   npx tsx scripts/check-doc-staleness.ts            # warnings only (exit 0)
 *   npx tsx scripts/check-doc-staleness.ts --strict    # exit 1 on any WARN/ERROR
 */
import * as fs from 'fs';
import * as path from 'path';

// Resolve script directory — works in both CJS (__dirname) and ESM (import.meta)
const __scriptDir: string =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(path.resolve(process.argv[1]));

// ─── Thresholds ───────────────────────────────────────────────────────────────

const WARN_DAYS = 30;
const ERROR_DAYS = 60;

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = 'OK' | 'WARN' | 'ERROR';

interface DocEntry {
  fileName: string;
  lastVerified: string | null;
  ageDays: number | null;
  status: Status;
  statusLabel: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively collect all .md files under a directory. */
function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract the first "Last verified" date from a file's content.
 * Accepts formats:
 *   Last verified: YYYY-MM-DD
 *   **Last verified**: YYYY-MM-DD
 *   > **Last verified**: YYYY-MM-DD
 *   - **Last verified**: YYYY-MM-DD
 */
function extractLastVerified(content: string): string | null {
  const match = content.match(/Last verified[*_\s]*:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

/** Calculate whole days between two dates (b - a), floored. */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

/** Parse YYYY-MM-DD safely, returning null on invalid input. */
function parseDate(dateStr: string): Date | null {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

// ─── Scan ────────────────────────────────────────────────────────────────────

function scan(archDir: string, today: Date): DocEntry[] {
  const files = collectMarkdownFiles(archDir).sort();
  const entries: DocEntry[] = [];

  for (const filePath of files) {
    const relativeName = path.relative(archDir, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const dateStr = extractLastVerified(content);

    if (!dateStr) {
      entries.push({
        fileName: relativeName,
        lastVerified: null,
        ageDays: null,
        status: 'WARN',
        statusLabel: 'WARN (no date)',
      });
      continue;
    }

    const verifiedDate = parseDate(dateStr);
    if (!verifiedDate) {
      entries.push({
        fileName: relativeName,
        lastVerified: dateStr,
        ageDays: null,
        status: 'WARN',
        statusLabel: 'WARN (invalid date)',
      });
      continue;
    }

    const ageDays = daysBetween(verifiedDate, today);

    let status: Status;
    let statusLabel: string;

    if (ageDays > ERROR_DAYS) {
      status = 'ERROR';
      statusLabel = `ERROR (>${ERROR_DAYS} days)`;
    } else if (ageDays > WARN_DAYS) {
      status = 'WARN';
      statusLabel = `WARN (>${WARN_DAYS} days)`;
    } else {
      status = 'OK';
      statusLabel = 'OK';
    }

    entries.push({
      fileName: relativeName,
      lastVerified: dateStr,
      ageDays,
      status,
      statusLabel,
    });
  }

  return entries;
}

// ─── Report ──────────────────────────────────────────────────────────────────

function report(entries: DocEntry[]): void {
  // Compute column widths dynamically so long filenames never overflow
  const maxFileLen = Math.max(4, ...entries.map((e) => e.fileName.length));
  const FILE_COL = maxFileLen + 2;
  const DATE_COL = 14;
  const AGE_COL = 6;
  const DIVIDER = '─'.repeat(FILE_COL + DATE_COL + AGE_COL + 20);

  console.log('');
  console.log('Architecture Doc Staleness Report');
  console.log(DIVIDER);
  console.log(
    pad('File', FILE_COL) + pad('Last Verified', DATE_COL) + pad('Age', AGE_COL) + 'Status',
  );
  console.log(DIVIDER);

  for (const entry of entries) {
    const fileName = pad(entry.fileName, FILE_COL);
    const dateStr = pad(entry.lastVerified ?? '(none)', DATE_COL);
    const ageStr = pad(entry.ageDays !== null ? `${entry.ageDays}d` : 'n/a', AGE_COL);

    let icon: string;
    if (entry.status === 'OK') {
      icon = '\u2713 OK';
    } else if (entry.status === 'ERROR') {
      icon = `\u2717 ${entry.statusLabel}`;
    } else {
      icon = `\u26A0 ${entry.statusLabel}`;
    }

    console.log(`${fileName}${dateStr}${ageStr}${icon}`);
  }

  console.log(DIVIDER);

  const okCount = entries.filter((e) => e.status === 'OK').length;
  const warnCount = entries.filter((e) => e.status === 'WARN').length;
  const errorCount = entries.filter((e) => e.status === 'ERROR').length;

  console.log(
    `Total: ${entries.length} files — ${okCount} OK, ${warnCount} WARN, ${errorCount} ERROR`,
  );
  console.log('');
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict');
const archDir = path.resolve(__scriptDir, '..', 'architecture');

if (!fs.existsSync(archDir)) {
  console.error(`ERROR: architecture directory not found at ${archDir}`);
  process.exit(2);
}

const today = new Date();
// Normalise to midnight UTC so day arithmetic is stable regardless of run time
today.setUTCHours(0, 0, 0, 0);

const entries = scan(archDir, today);
report(entries);

if (strict) {
  const hasIssues = entries.some((e) => e.status === 'WARN' || e.status === 'ERROR');
  if (hasIssues) {
    console.log('STRICT MODE: Exiting with code 1 due to stale or undated docs.');
    process.exit(1);
  }
}
