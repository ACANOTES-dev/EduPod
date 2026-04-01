/**
 * check-internal-violations.ts
 *
 * Scans apps/api/src/modules/ for cross-module imports of files decorated
 * with @Internal(). Services marked @Internal() are module-private and must
 * not be imported or injected from outside their owning module directory.
 *
 * Usage:
 *   npx tsx scripts/check-internal-violations.ts            # warnings only
 *   npx tsx scripts/check-internal-violations.ts --strict    # exit 1 on violations
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── Resolve paths ──────────────────────────────────────────────────────────

const __scriptDir: string =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(path.resolve(process.argv[1]));

const MODULES_ROOT = path.resolve(__scriptDir, '..', 'apps', 'api', 'src', 'modules');
const API_SRC_ROOT = path.resolve(__scriptDir, '..', 'apps', 'api', 'src');

// ─── Types ──────────────────────────────────────────────────────────────────

interface InternalFile {
  absolutePath: string;
  relativePath: string;
  moduleName: string;
}

interface Violation {
  importerPath: string;
  importerRelative: string;
  importerModule: string;
  internalFile: InternalFile;
  lineNumber: number;
  line: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getModuleName(relativeFilePath: string): string {
  const firstSlash = relativeFilePath.indexOf('/');
  if (firstSlash === -1) return relativeFilePath;
  return relativeFilePath.substring(0, firstSlash);
}

function collectTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

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

// ─── Phase 1: Find all @Internal() files ────────────────────────────────────

const INTERNAL_DECORATOR_PATTERN = /@Internal\(\)/;

function findInternalFiles(): InternalFile[] {
  const files = collectTypeScriptFiles(MODULES_ROOT);
  const internalFiles: InternalFile[] = [];

  for (const absolutePath of files) {
    const content = fs.readFileSync(absolutePath, 'utf-8');

    if (INTERNAL_DECORATOR_PATTERN.test(content)) {
      const relativePath = path.relative(MODULES_ROOT, absolutePath);
      internalFiles.push({
        absolutePath,
        relativePath,
        moduleName: getModuleName(relativePath),
      });
    }
  }

  return internalFiles;
}

// ─── Phase 2: Check for cross-module imports of internal files ──────────────

/**
 * Build a set of import-matchable identifiers for an internal file.
 * Given `modules/students/student-helper.service.ts`, generates patterns like:
 *   - './student-helper.service'
 *   - '../students/student-helper.service'
 *   - '../../modules/students/student-helper.service'
 * We match by checking if the import specifier ends with the file's stem
 * relative to the modules root, or the filename stem itself.
 */
function getFileBaseName(filePath: string): string {
  const base = path.basename(filePath);
  // Strip .ts extension
  if (base.endsWith('.ts')) return base.slice(0, -3);
  return base;
}

function findViolations(internalFiles: InternalFile[]): Violation[] {
  if (internalFiles.length === 0) return [];

  // Build lookup: basename -> list of internal files with that name
  const baseNameLookup = new Map<string, InternalFile[]>();
  for (const internal of internalFiles) {
    const baseName = getFileBaseName(internal.absolutePath);
    const existing = baseNameLookup.get(baseName) ?? [];
    existing.push(internal);
    baseNameLookup.set(baseName, existing);
  }

  // Also build relative stems for disambiguation (e.g., "students/student-helper.service")
  const relStemLookup = new Map<string, InternalFile>();
  for (const internal of internalFiles) {
    const stem = internal.relativePath.replace(/\.ts$/, '');
    relStemLookup.set(stem, internal);
  }

  const allFiles = collectTypeScriptFiles(API_SRC_ROOT);
  const violations: Violation[] = [];

  // Pattern to capture import specifiers: import ... from 'specifier' or import 'specifier'
  const importPattern = /(?:import\s+(?:[\s\S]*?)\s+from\s+|import\s+)['"]([^'"]+)['"]/g;

  for (const filePath of allFiles) {
    // Skip spec files
    if (filePath.endsWith('.spec.ts')) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Determine the module of this file (if it's in modules/)
    const relToModules = path.relative(MODULES_ROOT, filePath);
    const isInModules = !relToModules.startsWith('..');
    const importerModule = isInModules ? getModuleName(relToModules) : '__outside_modules__';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      importPattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = importPattern.exec(line)) !== null) {
        const specifier = match[1];

        // Only check relative imports (starting with ./ or ../)
        if (!specifier.startsWith('.')) continue;

        // Resolve the import to an absolute path
        const importerDir = path.dirname(filePath);
        const resolvedBase = path.resolve(importerDir, specifier);

        // Try with .ts extension and as directory/index.ts
        const candidates = [
          resolvedBase + '.ts',
          path.join(resolvedBase, 'index.ts'),
          resolvedBase, // might already have extension in specifier
        ];

        for (const candidate of candidates) {
          const relToModulesCandidate = path.relative(MODULES_ROOT, candidate);
          if (relToModulesCandidate.startsWith('..')) continue;

          const stem = relToModulesCandidate.replace(/\.ts$/, '');
          const internalFile = relStemLookup.get(stem);

          if (internalFile && internalFile.moduleName !== importerModule) {
            violations.push({
              importerPath: filePath,
              importerRelative: path.relative(API_SRC_ROOT, filePath),
              importerModule,
              internalFile,
              lineNumber: i + 1,
              line: trimmed,
            });
            break; // Don't double-count the same import line
          }
        }
      }
    }
  }

  return violations;
}

// ─── Report ─────────────────────────────────────────────────────────────────

function report(internalFiles: InternalFile[], violations: Violation[], strict: boolean): void {
  console.log('');
  console.log('========================================');
  console.log(' @INTERNAL() VIOLATION REPORT');
  console.log('========================================');
  console.log('');
  console.log(`Files decorated with @Internal(): ${internalFiles.length}`);

  if (internalFiles.length > 0) {
    for (const f of internalFiles) {
      console.log(`  - ${f.relativePath} (module: ${f.moduleName})`);
    }
  }

  console.log('');

  if (violations.length === 0) {
    console.log('No cross-module @Internal() import violations found.');
    return;
  }

  // Group by importer module
  const byModule = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = byModule.get(v.importerModule) ?? [];
    existing.push(v);
    byModule.set(v.importerModule, existing);
  }

  console.log(`Total violations: ${violations.length}`);
  console.log(`Modules with violations: ${byModule.size}`);
  console.log('');

  const sortedModules = [...byModule.keys()].sort();

  for (const mod of sortedModules) {
    const modViolations = byModule.get(mod);
    if (!modViolations) continue;

    console.log(
      `--- ${mod} (${modViolations.length} violation${modViolations.length > 1 ? 's' : ''}) ---`,
    );
    for (const v of modViolations) {
      const icon = strict ? 'ERROR' : 'WARN';
      console.log(`  [${icon}] ${v.importerRelative}:${v.lineNumber}`);
      console.log(
        `         Imports @Internal() file: ${v.internalFile.relativePath} (module: ${v.internalFile.moduleName})`,
      );
      console.log(`         ${v.line.substring(0, 120)}`);
    }
    console.log('');
  }

  console.log('----------------------------------------');

  if (strict) {
    console.log('');
    console.log('STRICT MODE: Exiting with code 1 due to @Internal() violations.');
  }
}

// ─── Entry ──────────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict');

if (!fs.existsSync(MODULES_ROOT)) {
  console.error(`ERROR: modules directory not found at ${MODULES_ROOT}`);
  process.exit(2);
}

const internalFiles = findInternalFiles();
const violations = findViolations(internalFiles);
report(internalFiles, violations, strict);

if (strict && violations.length > 0) {
  process.exit(1);
}
