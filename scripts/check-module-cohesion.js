#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Module Cohesion Checker
 *
 * Scans apps/api/src/modules/ and reports metrics per module:
 *   - Number of non-test .ts files
 *   - Total lines of code (non-test .ts files)
 *   - Number of exported services (parsed from *.module.ts)
 *
 * Thresholds:
 *   WARNING : >50 files  OR  >10k LOC
 *   ERROR   : >75 files  OR  >15k LOC
 *
 * Exit code 1 if any module is in ERROR state.
 * Pass --strict to also exit 1 on WARNING.
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const WARN_FILES = 50;
const ERROR_FILES = 75;
const WARN_LOC = 10_000;
const ERROR_LOC = 15_000;

/**
 * Some large domains are already decomposed into explicit sub-modules, but they
 * still live under one top-level folder. Treat those slices as separate cohesion
 * units so the report reflects the actual architecture rather than raw folder size.
 */
const SPLIT_MODULES = {
  behaviour: [
    {
      name: 'ops',
      moduleFile: 'behaviour-ops.module.ts',
      patterns: [/^behaviour-admin\./, /^behaviour-export\./, /^behaviour-ops\.module\.ts$/],
    },
    {
      name: 'analytics',
      moduleFile: 'behaviour-analytics.module.ts',
      patterns: [
        /^behaviour-analytics\./,
        /^behaviour-comparison-analytics\./,
        /^behaviour-incident-analytics\./,
        /^behaviour-sanction-analytics\./,
        /^behaviour-export-analytics\./,
        /^behaviour-staff-analytics\./,
        /^behaviour-student-analytics\./,
        /^behaviour-pulse\./,
        /^behaviour-ai\./,
        /^behaviour-alerts\./,
      ],
    },
    {
      name: 'recognition',
      moduleFile: 'behaviour-recognition.module.ts',
      patterns: [
        /^behaviour-award\./,
        /^behaviour-house\./,
        /^behaviour-recognition\./,
        /^behaviour-recognition\.module\.ts$/,
      ],
    },
    {
      name: 'portal',
      moduleFile: 'behaviour-portal.module.ts',
      patterns: [/^behaviour-parent\./, /^behaviour-students\./, /^behaviour-portal\.module\.ts$/],
    },
    {
      name: 'discipline',
      moduleFile: 'behaviour-discipline.module.ts',
      patterns: [
        /^behaviour-amendments\./,
        /^behaviour-appeals\./,
        /^behaviour-guardian-restrictions\./,
        /^behaviour-interventions\./,
        /^behaviour-legal-hold\./,
        /^behaviour-sanctions/,
        /^behaviour-exclusion/,
        /^behaviour-document\./,
        /^behaviour-documents\./,
        /^behaviour-discipline\.module\.ts$/,
      ],
    },
  ],
  pastoral: [
    {
      name: 'dsar',
      moduleFile: 'pastoral-dsar.module.ts',
      patterns: [/^controllers\/pastoral-dsar\./, /^services\/pastoral-dsar\./, /^pastoral-dsar\.module\.ts$/],
    },
    {
      name: 'critical-incidents',
      moduleFile: 'pastoral-critical-incidents.module.ts',
      patterns: [
        /^controllers\/critical-incidents\./,
        /^services\/critical-incident/,
        /^services\/affected-tracking\./,
        /^pastoral-critical-incidents\.module\.ts$/,
      ],
    },
    {
      name: 'checkins',
      moduleFile: 'pastoral-checkins.module.ts',
      patterns: [
        /^controllers\/checkins\./,
        /^controllers\/checkin-admin\./,
        /^controllers\/checkin-config\./,
        /^services\/checkin/,
        /^pastoral-checkins\.module\.ts$/,
      ],
    },
    {
      name: 'sst',
      moduleFile: 'pastoral-sst.module.ts',
      patterns: [/^controllers\/sst\./, /^services\/sst/, /^pastoral-sst\.module\.ts$/],
    },
    {
      name: 'reports',
      moduleFile: null,
      patterns: [
        /^controllers\/pastoral-reports\./,
        /^services\/pastoral-report/,
        /^services\/student-chronology\./,
      ],
    },
    {
      name: 'admin',
      moduleFile: 'pastoral-admin.module.ts',
      patterns: [
        /^controllers\/pastoral-admin\./,
        /^controllers\/pastoral-import\./,
        /^services\/pastoral-import\./,
        /^services\/pastoral-export\./,
        /^pastoral-admin\.module\.ts$/,
      ],
    },
    {
      name: 'portal',
      moduleFile: 'pastoral-parent-portal.module.ts',
      patterns: [
        /^controllers\/parent-pastoral\./,
        /^services\/parent-pastoral\./,
        /^pastoral-parent-portal\.module\.ts$/,
      ],
    },
  ],
  gradebook: [
    {
      name: 'report-cards',
      moduleFile: 'report-cards/report-card.module.ts',
      patterns: [/^report-cards\//],
    },
  ],
};

const STRICT = process.argv.includes('--strict');

// --max-errors N : allow up to N known errors (for tracked hotspots being decomposed)
const maxErrorsIdx = process.argv.indexOf('--max-errors');
const MAX_ERRORS = maxErrorsIdx !== -1 ? parseInt(process.argv[maxErrorsIdx + 1], 10) : 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk a directory and return all file paths (recursively).
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
 * Count the number of lines in a file.
 * @param {string} filePath
 * @returns {number}
 */
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Count newlines + 1 for the last line (unless the file is empty)
  if (content.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') count++;
  }
  return count;
}

/**
 * Return a repo-relative path using forward slashes.
 * @param {string} filePath
 * @param {string} baseDir
 * @returns {string}
 */
function toRelativePath(filePath, baseDir) {
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

/**
 * Parse the exports: [...] array from a NestJS *.module.ts file.
 * Returns the number of identifiers found inside the exports array.
 * @param {string} filePath
 * @returns {number}
 */
function parseModuleExports(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return 0;
  }

  // Find the exports: [ ... ] block (may span multiple lines)
  const exportsMatch = content.match(/exports\s*:\s*\[([^\]]*)\]/s);
  if (!exportsMatch || !exportsMatch[1]) return 0;

  const body = exportsMatch[1];
  // Count comma-separated identifiers (trim comments and empty entries)
  const identifiers = body
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('//') && !s.startsWith('/*'));

  return identifiers.length;
}

/**
 * Determine status label and flags for a module.
 * @param {number} files
 * @param {number} loc
 * @returns {{ label: string, isWarning: boolean, isError: boolean, reasons: string[] }}
 */
function classify(files, loc) {
  /** @type {string[]} */
  const reasons = [];

  if (files > ERROR_FILES) reasons.push(`>${ERROR_FILES} files`);
  else if (files > WARN_FILES) reasons.push(`>${WARN_FILES} files`);

  if (loc > ERROR_LOC) reasons.push(`>${(ERROR_LOC / 1000).toFixed(0)}k LOC`);
  else if (loc > WARN_LOC) reasons.push(`>${(WARN_LOC / 1000).toFixed(0)}k LOC`);

  const isError = files > ERROR_FILES || loc > ERROR_LOC;
  const isWarning = !isError && (files > WARN_FILES || loc > WARN_LOC);

  let label;
  if (isError) {
    label = reasons.length > 0 ? `\u2717 ERROR (${reasons.join(', ')})` : '\u2717 ERROR';
  } else if (isWarning) {
    label = reasons.length > 0 ? `\u26a0 WARNING (${reasons.join(', ')})` : '\u26a0 WARNING';
  } else {
    label = 'OK';
  }

  return { label, isWarning, isError, reasons };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const repoRoot = path.resolve(__dirname, '..');
const modulesDir = path.join(repoRoot, 'apps', 'api', 'src', 'modules');

if (!fs.existsSync(modulesDir)) {
  console.error(`[check-module-cohesion] Modules directory not found: ${modulesDir}`);
  process.exit(1);
}

const moduleDirs = fs
  .readdirSync(modulesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/**
 * @typedef {{ name: string, files: number, loc: number, exports: number, label: string, isWarning: boolean, isError: boolean }} ModuleMetric
 */

/** @type {ModuleMetric[]} */
const metrics = [];

/**
 * Add one cohesion metric entry.
 * @param {string} name
 * @param {string[]} files
 * @param {string | null} moduleFile
 */
function addMetric(name, files, moduleFile) {
  const loc = files.reduce((sum, f) => sum + countLines(f), 0);
  const exportCount = moduleFile ? parseModuleExports(moduleFile) : 0;
  const { label, isWarning, isError } = classify(files.length, loc);

  metrics.push({
    name,
    files: files.length,
    loc,
    exports: exportCount,
    label,
    isWarning,
    isError,
  });
}

for (const moduleName of moduleDirs) {
  const moduleDir = path.join(modulesDir, moduleName);
  const allFiles = walkDir(moduleDir);

  // Only count .ts files that are NOT test files
  const sourceFiles = allFiles.filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'),
  );

  const splitConfig = SPLIT_MODULES[moduleName];
  if (!splitConfig) {
    const moduleFile = sourceFiles.find((f) => f.endsWith('.module.ts')) ?? null;
    addMetric(moduleName, sourceFiles, moduleFile);
    continue;
  }

  /** @type {Map<string, string[]>} */
  const groupedFiles = new Map();
  for (const slice of splitConfig) {
    groupedFiles.set(slice.name, []);
  }
  groupedFiles.set('core', []);

  for (const filePath of sourceFiles) {
    const relativePath = toRelativePath(filePath, moduleDir);
    let matched = false;
    for (const slice of splitConfig) {
      if (slice.patterns.some((pattern) => pattern.test(relativePath))) {
        groupedFiles.get(slice.name)?.push(filePath);
        matched = true;
        break;
      }
    }
    if (!matched) {
      groupedFiles.get('core')?.push(filePath);
    }
  }

  for (const slice of splitConfig) {
    const files = groupedFiles.get(slice.name) ?? [];
    if (files.length === 0) continue;
    const moduleFile = slice.moduleFile ? path.join(moduleDir, slice.moduleFile) : null;
    addMetric(`${moduleName}:${slice.name}`, files, moduleFile);
  }

  const coreFiles = groupedFiles.get('core') ?? [];
  if (coreFiles.length > 0) {
    const coreModuleFileCandidates = [`${moduleName}-core.module.ts`, `${moduleName}.module.ts`]
      .map((candidate) => path.join(moduleDir, candidate))
      .filter((candidate) => fs.existsSync(candidate));
    addMetric(
      `${moduleName}:core`,
      coreFiles,
      coreModuleFileCandidates.length > 0 ? coreModuleFileCandidates[0] : null,
    );
  }
}

// Sort by LOC descending
metrics.sort((a, b) => b.loc - a.loc);

// ─── Output ───────────────────────────────────────────────────────────────────

const COL_MODULE = 26;
const COL_FILES = 7;
const COL_LOC = 8;
const COL_EXPORTS = 9;
const COL_STATUS = 35;

/**
 * Pad a string to a given width (left-aligned).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function pad(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/**
 * Pad a number string to a given width (right-aligned).
 * @param {number|string} val
 * @param {number} width
 * @returns {string}
 */
function rpad(val, width) {
  const str = String(val);
  return str.length >= width ? str : ' '.repeat(width - str.length) + str;
}

const divider = '\u2501'.repeat(COL_MODULE + COL_FILES + COL_LOC + COL_EXPORTS + COL_STATUS + 4);

console.log('\nModule Cohesion Report');
console.log(divider);
console.log(
  pad('Module', COL_MODULE) +
    rpad('Files', COL_FILES) +
    rpad('LOC', COL_LOC) +
    rpad('Exports', COL_EXPORTS) +
    '  Status',
);
console.log(divider);

for (const m of metrics) {
  console.log(
    pad(m.name, COL_MODULE) +
      rpad(m.files, COL_FILES) +
      rpad(m.loc.toLocaleString(), COL_LOC) +
      rpad(m.exports, COL_EXPORTS) +
      '  ' +
      m.label,
  );
}

console.log(divider);

const warnings = metrics.filter((m) => m.isWarning).length;
const errors = metrics.filter((m) => m.isError).length;

console.log(`\nWarnings: ${warnings} | Errors: ${errors}`);

if (STRICT) {
  console.log('\n--strict mode: warnings are treated as errors.\n');
}

if (MAX_ERRORS > 0 && errors <= MAX_ERRORS) {
  console.log(
    `\n[check-module-cohesion] PASSED (${errors} known error(s) within --max-errors ${MAX_ERRORS})\n`,
  );
  process.exit(0);
} else if (errors > 0 || (STRICT && warnings > 0)) {
  const detail = MAX_ERRORS > 0 ? ` (allowed: ${MAX_ERRORS})` : '';
  console.log(
    `\n[check-module-cohesion] FAILED — ${errors} error(s)${detail}${STRICT && warnings > 0 ? `, ${warnings} warning(s) (strict)` : ''}.\n`,
  );
  process.exit(1);
} else {
  console.log('\n[check-module-cohesion] PASSED\n');
  process.exit(0);
}
