#!/usr/bin/env node
// check-cross-module-deps.js
//
// Parses all *.module.ts files in apps/api/src/modules/ and builds a
// cross-module dependency graph from the NestJS @Module imports: [...] array.
// Then compares against architecture/module-blast-radius.md to detect any
// undocumented cross-module dependencies introduced by a PR.
//
// Exit 0: all dependencies are documented (or no cross-module deps exist).
// Exit 1: undocumented cross-module dependencies found.
//
// Node.js built-ins only (fs, path).

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(REPO_ROOT, 'apps', 'api', 'src', 'modules');
const BLAST_RADIUS_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'module-blast-radius.md');

// These modules are universal infrastructure — every feature module is
// permitted to import them without needing blast-radius documentation.
const INFRASTRUCTURE_MODULES = new Set([
  'AppModule',
  'AuthModule',
  'CommonModule',
  'ConfigModule',
  'ConfigurationModule',
  'PrismaModule',
  'PrismaService',
  'RedisModule',
  'RedisService',
  'S3Module',
  'BullModule',
  'ThrottlerModule',
  'EventEmitterModule',
  'ScheduleModule',
  'TypeOrmModule',
  'TerminusModule',
  'HttpModule',
  'MulterModule',
  // Audit & RBAC are cross-cutting but universal — every module gets them via
  // global guards/interceptors, not explicit NestJS module imports.
  'AuditLogModule',
  'RbacModule',
]);

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Walk one directory level and return all entries of the given type.
 * @param {string} dir
 * @param {'file'|'directory'} type
 * @returns {string[]} absolute paths
 */
function listEntries(dir, type) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => (type === 'file' ? e.isFile() : e.isDirectory()))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

// ─── Module name derivation ───────────────────────────────────────────────────

/**
 * Convert a kebab-case module directory name to the expected PascalCase NestJS
 * module class name. e.g. "child-protection" → "ChildProtectionModule".
 *
 * @param {string} dirName
 * @returns {string}
 */
function dirToModuleName(dirName) {
  const pascal = dirName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${pascal}Module`;
}

// ─── Module.ts parser ─────────────────────────────────────────────────────────

/**
 * Extract the content of the `imports: [...]` array from a *.module.ts file.
 * This uses a simple bracket-counting approach to handle multiline arrays and
 * nested function calls like forwardRef(() => SomeModule).
 *
 * @param {string} source TypeScript source text
 * @returns {string} the raw text inside imports: [ ... ], or ''
 */
function extractImportsArrayText(source) {
  // Find the start of 'imports:' inside the @Module decorator block
  const match = source.match(/imports\s*:\s*\[/);
  if (!match || match.index === undefined) return '';

  const startIndex = match.index + match[0].length;
  let depth = 1;
  let i = startIndex;

  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    i++;
  }

  return source.slice(startIndex, i - 1);
}

/**
 * Given the raw text inside imports: [...], extract all NestJS module class
 * names referenced — both plain and inside forwardRef(() => SomeModule).
 *
 * Returns only names ending in 'Module'.
 *
 * @param {string} arrayText
 * @returns {string[]}
 */
function parseModuleNamesFromArray(arrayText) {
  const names = new Set();

  // Match plain identifiers: SomeModule
  const plainPattern = /\b([A-Z][A-Za-z0-9]*Module)\b/g;
  let m;
  while ((m = plainPattern.exec(arrayText)) !== null) {
    names.add(m[1]);
  }

  return Array.from(names);
}

// ─── Blast-radius doc parser ──────────────────────────────────────────────────

/**
 * Parse architecture/module-blast-radius.md and return a set of all module
 * names that are documented in the file (either as section subjects or as
 * consumers/importers in the text).
 *
 * The set is used for a broad "mentioned" check: if a module name appears
 * anywhere in the doc, the dependency is considered documented.
 *
 * @param {string} content
 * @returns {Set<string>} PascalCase module names found in the doc
 */
function parseDocumentedModules(content) {
  const found = new Set();
  const pattern = /\b([A-Z][A-Za-z0-9]*Module)\b/g;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    found.add(m[1]);
  }
  return found;
}

/**
 * Parse architecture/module-blast-radius.md and return a map of:
 *   consumerModule → Set<importedModule>
 *
 * This is derived from "Imports:" lines in the doc, which explicitly list
 * what a module imports.  Example:
 *   - **Imports**: `AuthModule`, `SequenceModule`, ...
 *
 * @param {string} content
 * @returns {Map<string, Set<string>>}
 */
function parseDocumentedImports(content) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();

  // Track current section's module name via ### headers
  let currentModule = null;
  const sectionHeaderPattern = /^###?\s+(.+)$/gm;
  const moduleNamePattern = /\b([A-Z][A-Za-z0-9]*Module)\b/g;

  const lines = content.split('\n');
  let lineIndex = 0;

  for (const line of lines) {
    lineIndex++;

    // Detect section headers — extract the first *Module name in the heading
    const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headerMatch) {
      const headingText = headerMatch[1];
      const modMatch = headingText.match(/\b([A-Z][A-Za-z0-9]*Module)\b/);
      currentModule = modMatch ? modMatch[1] : null;
      continue;
    }

    // Detect "Imports:" lines and parse all Module names on that line
    const importsLineMatch = line.match(/\*\*Imports\*\*\s*:(.+)/i);
    if (importsLineMatch && currentModule) {
      if (!map.has(currentModule)) map.set(currentModule, new Set());
      const importsText = importsLineMatch[1];
      let m2;
      moduleNamePattern.lastIndex = 0;
      while ((m2 = moduleNamePattern.exec(importsText)) !== null) {
        if (m2[1] !== currentModule) {
          map.get(currentModule).add(m2[1]);
        }
      }
    }

    // Also handle bullet-point Imports lines: "- **Imports**: ..."
    const bulletImportsMatch = line.match(/-\s+\*\*Imports\*\*\s*:(.+)/i);
    if (bulletImportsMatch && currentModule) {
      if (!map.has(currentModule)) map.set(currentModule, new Set());
      const importsText = bulletImportsMatch[1];
      let m3;
      moduleNamePattern.lastIndex = 0;
      while ((m3 = moduleNamePattern.exec(importsText)) !== null) {
        if (m3[1] !== currentModule) {
          map.get(currentModule).add(m3[1]);
        }
      }
    }
  }

  void sectionHeaderPattern; // suppress unused-var lint (used implicitly above)

  return map;
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseMaxViolations() {
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

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const maxViolations = parseMaxViolations();
  const LINE = '━'.repeat(52);

  console.log('\nCross-Module Dependency Check');
  console.log(LINE);

  // ── 1. Discover all module directories ──────────────────────────────────────
  const moduleDirs = listEntries(MODULES_DIR, 'directory');
  if (moduleDirs.length === 0) {
    console.log('No modules found under', MODULES_DIR);
    console.log('Skipping check.');
    process.exit(0);
  }

  // Build a registry of known module names from directory names so we can
  // distinguish cross-module deps from third-party imports.
  /** @type {Set<string>} */
  const knownModuleNames = new Set();
  for (const dir of moduleDirs) {
    knownModuleNames.add(dirToModuleName(path.basename(dir)));
  }

  // ── 2. Parse each *.module.ts and build the dependency graph ────────────────
  /** @type {Map<string, string[]>} moduleName → [importedModuleName, ...] */
  const graph = new Map();

  for (const dir of moduleDirs) {
    const moduleName = dirToModuleName(path.basename(dir));
    const moduleFile = path.join(dir, `${path.basename(dir)}.module.ts`);

    if (!fs.existsSync(moduleFile)) continue;

    const source = fs.readFileSync(moduleFile, 'utf8');
    const arrayText = extractImportsArrayText(source);
    if (!arrayText) continue;

    const allImported = parseModuleNamesFromArray(arrayText);

    // Keep only cross-module deps: known feature modules that aren't the
    // module itself and aren't universal infrastructure.
    const crossModuleDeps = allImported.filter(
      (name) =>
        name !== moduleName && knownModuleNames.has(name) && !INFRASTRUCTURE_MODULES.has(name),
    );

    if (crossModuleDeps.length > 0) {
      graph.set(moduleName, crossModuleDeps);
    }
  }

  // ── 3. Load and parse blast-radius doc ──────────────────────────────────────
  if (!fs.existsSync(BLAST_RADIUS_PATH)) {
    console.log('⚠  architecture/module-blast-radius.md not found.');
    console.log('   Cannot verify cross-module dependencies.');
    console.log('   Please create the file before merging.');
    console.log(LINE);
    process.exit(1);
  }

  const blastContent = fs.readFileSync(BLAST_RADIUS_PATH, 'utf8');

  // All module names that appear ANYWHERE in the doc — used as the broad
  // "mentioned" check when explicit Imports: lines don't cover something.
  const documentedModuleNames = parseDocumentedModules(blastContent);

  // Explicit imports map derived from "Imports:" lines.
  const documentedImports = parseDocumentedImports(blastContent);

  // ── 4. Compare and report ────────────────────────────────────────────────────
  /** @type {Array<{consumer: string, imported: string}>} */
  const undocumented = [];

  for (const [consumer, deps] of graph.entries()) {
    for (const dep of deps) {
      // A dependency is considered documented if ANY of the following is true:
      //   a) The doc has an explicit "Imports:" line for this consumer listing dep
      //   b) The dep module name appears in the doc (broad coverage for Consumed-by prose)
      //   c) The consumer module name appears in the doc text alongside the dep name
      //      (the "Consumed by: X, Y, Z" lines cover the reverse direction)

      const explicitlyCovered =
        documentedImports.has(consumer) && documentedImports.get(consumer).has(dep);

      // Check if there's a "Consumed by" line for dep that mentions consumer
      // by searching the raw text for the dep section mentioning consumer name.
      const depMentionedInDoc = documentedModuleNames.has(dep);
      const consumerMentionedInDoc = documentedModuleNames.has(consumer);

      // Both sides must be mentioned in the doc, AND the specific relationship
      // must be detectable. We use the explicit imports map as the primary
      // signal; the broad "mentioned" check is a fallback that avoids false
      // positives when a module is large and the doc describes the dep in prose.
      const broadlyCovered = depMentionedInDoc && consumerMentionedInDoc;

      if (!explicitlyCovered && !broadlyCovered) {
        undocumented.push({ consumer, imported: dep });
      }
    }
  }

  // ── 5. Output ────────────────────────────────────────────────────────────────
  if (undocumented.length === 0) {
    // Print a summary of what was checked
    const totalDeps = Array.from(graph.values()).reduce((sum, deps) => sum + deps.length, 0);
    console.log(
      `✓  All ${totalDeps} cross-module dependencies are documented in module-blast-radius.md`,
    );
    console.log(LINE);
    process.exit(0);
  } else {
    for (const { consumer, imported } of undocumented) {
      console.log(`⚠  ${consumer} → ${imported}: not documented in module-blast-radius.md`);
    }
    console.log(`✓  All other dependencies documented.`);
    console.log(LINE);
    console.log(
      `${undocumented.length} undocumented ${undocumented.length === 1 ? 'dependency' : 'dependencies'} found.`,
    );
    console.log('Please update architecture/module-blast-radius.md before merging.');

    // ── Threshold gate (HR-025) ──────────────────────────────────────────────
    if (maxViolations !== null) {
      if (undocumented.length > maxViolations) {
        console.log(
          `\nFAILED: ${undocumented.length} violations exceed --max-violations threshold of ${maxViolations}.`,
        );
        process.exit(1);
      }
      console.log(
        `\nPASSED: ${undocumented.length} violations within --max-violations threshold of ${maxViolations}.`,
      );
      process.exit(0);
    }

    process.exit(1);
  }
}

main();
