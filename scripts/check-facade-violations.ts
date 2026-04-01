/**
 * check-facade-violations.ts
 *
 * Scans apps/api/src/modules/ for Prisma model access that crosses module
 * boundaries — i.e., module A directly querying a table owned by module B
 * instead of going through B's facade/service.
 *
 * Usage:
 *   npx tsx scripts/check-facade-violations.ts            # warnings only
 *   npx tsx scripts/check-facade-violations.ts --strict    # exit 1 on violations
 */
import * as fs from 'fs';
import * as path from 'path';

// Resolve script directory — works in both CJS (__dirname) and ESM (process.argv)
const __scriptDir: string =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(path.resolve(process.argv[1]));

// ─── Protected tables → owner module mapping ──────────────────────────────────

const PROTECTED_TABLES: Record<string, string> = {
  student: 'students',
  studentParent: 'students',
  staffProfile: 'staff-profiles',
  academicPeriod: 'academics',
  academicYear: 'academics',
  classEnrolment: 'classes',
  dailyAttendanceSummary: 'attendance',
  attendanceRecord: 'attendance',
  attendanceSession: 'attendance',
  attendancePatternAlert: 'attendance',
};

// ─── Prisma operations we look for ───────────────────────────────────────────

const PRISMA_OPS = [
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findFirstOrThrow',
  'count',
  'groupBy',
  'aggregate',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

// ─── Allowlisted file patterns (relative to apps/api/src/modules/) ───────────

const ALLOWLIST: string[] = [
  'reports/reports-data-access.service.ts', // existing reports facade
  'dashboard/', // dashboard aggregation facade
  'compliance/', // GDPR/DSAR traversal needs cross-module reads
  'search/', // search indexer needs to read all models
  'imports/', // bulk import needs direct table access
  'academics/academic-read.facade.ts', // academic facade legitimately reads class_enrolments
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Violation {
  filePath: string;
  relativePath: string;
  lineNumber: number;
  line: string;
  modelAccessed: string;
  ownerModule: string;
  violatingModule: string;
}

function getModuleName(relativeFilePath: string): string {
  // e.g., "behaviour/behaviour-admin.service.ts" → "behaviour"
  const firstSlash = relativeFilePath.indexOf('/');
  if (firstSlash === -1) return relativeFilePath;
  return relativeFilePath.substring(0, firstSlash);
}

function isAllowlisted(relativePath: string): boolean {
  return ALLOWLIST.some((pattern) => relativePath.startsWith(pattern));
}

function collectTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTypeScriptFiles(fullPath));
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

// ─── Build regex for all protected models ────────────────────────────────────

function buildPattern(): RegExp {
  const modelNames = Object.keys(PROTECTED_TABLES).join('|');
  // Match: prisma.MODEL.OP  or  tx.MODEL.OP  or  this.prisma.MODEL.OP
  const opNames = PRISMA_OPS.join('|');
  return new RegExp(`(?:prisma|tx)\\.(?:${modelNames})\\.(?:${opNames})`, 'g');
}

function extractModelFromMatch(match: string): string | null {
  // match is like "prisma.student.findMany" or "tx.academicYear.findFirst"
  const parts = match.split('.');
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}

// ─── Main scan ───────────────────────────────────────────────────────────────

function scan(): Violation[] {
  const rootDir = path.resolve(__scriptDir, '..', 'apps', 'api', 'src', 'modules');

  if (!fs.existsSync(rootDir)) {
    console.error(`ERROR: modules directory not found at ${rootDir}`);
    process.exit(2);
  }

  const files = collectTypeScriptFiles(rootDir);
  const pattern = buildPattern();
  const violations: Violation[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath);
    const moduleName = getModuleName(relativePath);

    // Skip spec/test files (already filtered above, but belt-and-suspenders)
    if (relativePath.endsWith('.spec.ts')) continue;

    // Skip allowlisted paths
    if (isAllowlisted(relativePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment lines
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Reset regex lastIndex for each line since we use 'g' flag
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(line)) !== null) {
        const model = extractModelFromMatch(match[0]);
        if (!model) continue;

        const ownerModule = PROTECTED_TABLES[model];
        if (!ownerModule) continue;

        // Is this module the owner?
        if (moduleName === ownerModule) continue;

        violations.push({
          filePath,
          relativePath,
          lineNumber: i + 1,
          line: trimmed,
          modelAccessed: model,
          ownerModule,
          violatingModule: moduleName,
        });
      }
    }
  }

  return violations;
}

// ─── Report ──────────────────────────────────────────────────────────────────

function report(violations: Violation[], strict: boolean): void {
  if (violations.length === 0) {
    console.log('No facade violations found.');
    return;
  }

  // Group by violating module
  const byModule = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = byModule.get(v.violatingModule) ?? [];
    existing.push(v);
    byModule.set(v.violatingModule, existing);
  }

  console.log('');
  console.log('========================================');
  console.log(' FACADE VIOLATION REPORT');
  console.log('========================================');
  console.log('');
  console.log(`Total violations: ${violations.length}`);
  console.log(`Modules with violations: ${byModule.size}`);
  console.log('');

  const sortedModules = [...byModule.keys()].sort();

  for (const mod of sortedModules) {
    const modViolations = byModule.get(mod)!;
    console.log(
      `--- ${mod} (${modViolations.length} violation${modViolations.length > 1 ? 's' : ''}) ---`,
    );
    for (const v of modViolations) {
      const icon = strict ? 'ERROR' : 'WARN';
      console.log(`  [${icon}] ${v.relativePath}:${v.lineNumber}`);
      console.log(`         Model: ${v.modelAccessed} (owned by: ${v.ownerModule})`);
      console.log(`         ${v.line.substring(0, 120)}`);
    }
    console.log('');
  }

  console.log('----------------------------------------');
  console.log(`Allowlisted paths: ${ALLOWLIST.join(', ')}`);
  console.log('----------------------------------------');

  if (strict) {
    console.log('');
    console.log('STRICT MODE: Exiting with code 1 due to facade violations.');
  }
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict');
const violations = scan();
report(violations, strict);

if (strict && violations.length > 0) {
  process.exit(1);
}
