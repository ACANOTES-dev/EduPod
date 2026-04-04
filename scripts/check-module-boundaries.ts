#!/usr/bin/env node
/**
 * check-module-boundaries.ts
 *
 * Reads docs/architecture/module-ownership.json and scans all NestJS module
 * source files for direct Prisma reads of facade-protected models. Reports
 * violations where a module directly queries another module's owned tables
 * instead of using the published read facade.
 *
 * When run with --max-violations N, this is a hard CI gate: the process exits 1
 * if the violation count exceeds the threshold. CI enforces a ratcheted budget
 * so new violations cannot be introduced without raising the threshold.
 *
 * Without --max-violations the tool runs in advisory mode (exit 0).
 *
 * Usage:
 *   npx tsx scripts/check-module-boundaries.ts
 *   npx tsx scripts/check-module-boundaries.ts --max-violations 17  # CI gate
 *   npx tsx scripts/check-module-boundaries.ts --json                # machine-readable output
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const OWNERSHIP_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'module-ownership.json');
const MODULES_DIR = path.join(REPO_ROOT, 'apps', 'api', 'src', 'modules');

// Prisma read operations that indicate a module is reading another module's data
const READ_OPS = [
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
];

// Directories/paths that are allowlisted — these have legitimate reasons to
// bypass facade boundaries (DSAR traversal, search indexing, bulk import, etc.)
const ALLOWLISTED_PATHS = [
  'compliance/', // GDPR/DSAR traversal needs cross-module reads
  'search/', // search indexer reads all models for indexing
  'imports/', // bulk import needs direct table access
  'reports/', // reports data access facade reads across modules
  'dashboard/', // dashboard aggregation reads across modules
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModuleEntry {
  path: string;
  ownedModels: string[];
  readFacade: string | null;
}

interface OwnershipRegistry {
  modules: Record<string, ModuleEntry>;
}

interface Violation {
  file: string;
  line: number;
  model: string;
  ownerModule: string;
  facade: string;
  snippet: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadRegistry(): OwnershipRegistry {
  if (!fs.existsSync(OWNERSHIP_PATH)) {
    console.error(`ERROR: Module ownership registry not found at ${OWNERSHIP_PATH}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(OWNERSHIP_PATH, 'utf-8');
  return JSON.parse(raw) as OwnershipRegistry;
}

/**
 * Build a map from Prisma model name -> { ownerModule, facade }
 * Only includes models whose owning module has a readFacade.
 */
function buildProtectedModelsMap(
  registry: OwnershipRegistry,
): Map<string, { ownerModule: string; ownerDir: string; facade: string }> {
  const map = new Map<string, { ownerModule: string; ownerDir: string; facade: string }>();

  for (const [moduleName, entry] of Object.entries(registry.modules)) {
    if (!entry.readFacade) continue;

    const ownerDir = path.resolve(REPO_ROOT, entry.path);
    for (const model of entry.ownedModels) {
      map.set(model, {
        ownerModule: moduleName,
        ownerDir,
        facade: entry.readFacade,
      });
    }
  }

  return map;
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function getRelativePath(filePath: string): string {
  return path.relative(MODULES_DIR, filePath);
}

function isAllowlisted(relativePath: string): boolean {
  return ALLOWLISTED_PATHS.some((prefix) => relativePath.startsWith(prefix));
}

function isInsideOwnerDir(filePath: string, ownerDir: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(ownerDir + path.sep) || resolved === ownerDir;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

function scan(
  protectedModels: Map<string, { ownerModule: string; ownerDir: string; facade: string }>,
): Violation[] {
  const modelNames = [...protectedModels.keys()];
  if (modelNames.length === 0) {
    console.log('No facade-protected models found in registry.');
    return [];
  }

  // Build regex: match prisma.MODEL.READ_OP or tx.MODEL.READ_OP
  const modelPattern = modelNames.join('|');
  const opPattern = READ_OPS.join('|');
  const regex = new RegExp(`(?:prisma|tx)\\.(?:${modelPattern})\\.(?:${opPattern})`, 'g');

  const files = collectTsFiles(MODULES_DIR);
  const violations: Violation[] = [];

  for (const filePath of files) {
    const relativePath = getRelativePath(filePath);

    // Skip allowlisted directories
    if (isAllowlisted(relativePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        // Extract the model name from the match (e.g. "prisma.student.findMany" -> "student")
        const parts = match[0].split('.');
        if (parts.length < 3) continue;
        const modelName = parts[1];

        const protection = protectedModels.get(modelName);
        if (!protection) continue;

        // Skip if this file is inside the owning module
        if (isInsideOwnerDir(filePath, protection.ownerDir)) continue;

        violations.push({
          file: relativePath,
          line: i + 1,
          model: modelName,
          ownerModule: protection.ownerModule,
          facade: protection.facade,
          snippet: trimmed.substring(0, 120),
        });
      }
    }
  }

  return violations;
}

// ─── Report ─────────────────────────────────────────────────────────────────

function reportText(violations: Violation[]): void {
  if (violations.length === 0) {
    console.log('');
    console.log('Module boundary check: PASS (0 violations)');
    console.log('All facade-protected models are accessed through their facades.');
    return;
  }

  // Group by owner module + facade
  const byOwner = new Map<string, Violation[]>();
  for (const v of violations) {
    const key = `${v.ownerModule}|${v.facade}`;
    const list = byOwner.get(key) ?? [];
    list.push(v);
    byOwner.set(key, list);
  }

  console.log('');
  console.log('Module boundary violations:');
  console.log('');

  const sortedKeys = [...byOwner.keys()].sort();
  for (const key of sortedKeys) {
    const vList = byOwner.get(key)!;
    const { ownerModule, facade } = vList[0];
    console.log(`${ownerModule} (owned by: ${ownerModule}, facade: ${facade}):`);

    for (const v of vList) {
      console.log(
        `  - apps/api/src/modules/${v.file}:${v.line} — direct prisma.${v.model}.${v.snippet.includes('.find') ? (v.snippet.split('.').pop()?.split('(')[0] ?? 'read') : 'read'}`,
      );
    }

    console.log(`  ... (${vList.length} total violation${vList.length !== 1 ? 's' : ''})`);
    console.log('');
  }

  console.log(
    `Summary: ${violations.length} violation${violations.length !== 1 ? 's' : ''} across ${byOwner.size} facade-protected module${byOwner.size !== 1 ? 's' : ''}`,
  );
  console.log('');
  console.log('Boundary violations are enforced in CI via --max-violations threshold.');
  console.log('Migrate to facade methods when touching these files to reduce the budget.');
}

function reportJson(violations: Violation[]): void {
  const output = {
    totalViolations: violations.length,
    violations: violations.map((v) => ({
      file: `apps/api/src/modules/${v.file}`,
      line: v.line,
      model: v.model,
      ownerModule: v.ownerModule,
      facade: v.facade,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}

// ─── CLI argument parsing ──────────────────────────────────────────────────

function parseMaxViolations(): number | null {
  const idx = process.argv.indexOf('--max-violations');
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  const value = parseInt(process.argv[idx + 1], 10);
  if (isNaN(value) || value < 0) {
    console.error(
      `ERROR: --max-violations requires a non-negative integer, got "${process.argv[idx + 1]}"`,
    );
    process.exit(2);
  }
  return value;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const jsonMode = process.argv.includes('--json');
const maxViolations = parseMaxViolations();

const registry = loadRegistry();
const protectedModels = buildProtectedModelsMap(registry);

if (protectedModels.size === 0) {
  console.log('No facade-protected models found in module-ownership.json.');
  process.exit(0);
}

console.log(
  `Scanning for boundary violations across ${protectedModels.size} facade-protected models...`,
);

const violations = scan(protectedModels);

if (jsonMode) {
  reportJson(violations);
} else {
  reportText(violations);
}

// ─── Threshold gate (HR-025) ───────────────────────────────────────────────
if (maxViolations !== null) {
  if (violations.length > maxViolations) {
    console.log(
      `\nFAILED: ${violations.length} violations exceed --max-violations threshold of ${maxViolations}.`,
    );
    console.log('Fix the new violations before merging.');
    process.exit(1);
  }
  console.log(
    `\nPASSED: ${violations.length} violations within --max-violations threshold of ${maxViolations}.`,
  );
  process.exit(0);
}

// No threshold flag — advisory mode (exit 0).
process.exit(0);
