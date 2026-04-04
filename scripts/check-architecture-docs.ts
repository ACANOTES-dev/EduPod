/**
 * Architecture Docs Consistency Checker
 *
 * Compares the modules listed in docs/architecture/module-blast-radius.md
 * against the actual NestJS modules found in apps/api/src/modules/.
 *
 * Advisory only — always exits 0. Flags drift for manual review.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const BLAST_RADIUS_PATH = path.join(ROOT, 'docs/architecture/module-blast-radius.md');
const MODULES_DIR = path.join(ROOT, 'apps/api/src/modules');

// Infrastructure modules that live in modules/ but are not domain modules.
// These are expected to be absent from the blast radius doc's module list
// because they are documented differently (as infrastructure in Tier 1).
const INFRA_MODULES = new Set(['prisma', 'redis']);

// Module names that appear in the blast radius doc as prose references
// (e.g., "SubstitutionModule" referring to scheduling substitution sub-feature)
// but do not correspond to standalone module directories.
const DOC_PROSE_REFERENCES = new Set(['substitution']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCodebaseModules(): string[] {
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const modules: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(MODULES_DIR, entry.name);
    const files = fs.readdirSync(dirPath);
    const hasModuleFile = files.some((f) => f.endsWith('.module.ts') && !f.endsWith('.spec.ts'));
    if (hasModuleFile) {
      modules.push(entry.name);
    }
  }

  return modules.sort();
}

function kebabToPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function getDocMentionedModules(content: string): Set<string> {
  const mentioned = new Set<string>();

  // Match PascalCase module names like "BehaviourModule", "FinanceModule", "S3Module", etc.
  const modulePattern = /([A-Z][a-zA-Z0-9]*Module)\b/g;
  let match: RegExpExecArray | null;

  while ((match = modulePattern.exec(content)) !== null) {
    const moduleName = match[1];
    // Convert PascalCase to kebab-case directory name
    const kebab = moduleName
      .replace(/Module$/, '')
      // Insert hyphen between lowercase-uppercase or digit-uppercase boundaries
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    mentioned.add(kebab);
  }

  return mentioned;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Architecture Docs Consistency Check');
  console.log('===================================\n');

  // 1. Get actual modules from codebase
  const codebaseModules = getCodebaseModules();
  console.log(`Found ${codebaseModules.length} module directories in codebase.\n`);

  // 2. Parse blast radius doc
  if (!fs.existsSync(BLAST_RADIUS_PATH)) {
    console.log('ERROR: module-blast-radius.md not found at expected path:', BLAST_RADIUS_PATH);
    process.exit(0);
  }

  const docContent = fs.readFileSync(BLAST_RADIUS_PATH, 'utf-8');
  const docModules = getDocMentionedModules(docContent);

  // 3. Check for modules in codebase but NOT in doc
  const missingFromDoc: string[] = [];
  for (const mod of codebaseModules) {
    if (INFRA_MODULES.has(mod)) continue;
    const pascalName = kebabToPascal(mod);
    if (!docModules.has(mod) && !docModules.has(pascalName.toLowerCase())) {
      // Also try common aliases
      const found = Array.from(docModules).some((docMod) => {
        return docMod === mod || mod.startsWith(docMod) || docMod.startsWith(mod);
      });
      if (!found) {
        missingFromDoc.push(mod);
      }
    }
  }

  // 4. Check for modules in doc that don't exist in codebase
  // We only check top-level module references that look like standalone modules
  const codebaseSet = new Set(codebaseModules);
  const phantomInDoc: string[] = [];
  for (const docMod of docModules) {
    if (INFRA_MODULES.has(docMod)) continue;
    // Skip common/global modules that aren't directories, and known prose references
    if (['common', 'app', 'bull'].includes(docMod)) continue;
    if (DOC_PROSE_REFERENCES.has(docMod)) continue;
    if (!codebaseSet.has(docMod)) {
      // Check if it might be a sub-module (e.g., "report-card" lives inside gradebook/)
      const isSubModule = codebaseModules.some(
        (cm) => docMod.startsWith(cm + '-') || cm.startsWith(docMod),
      );
      if (!isSubModule) {
        phantomInDoc.push(docMod);
      }
    }
  }

  // 5. Report results
  console.log('--- Modules in codebase but NOT mentioned in module-blast-radius.md ---');
  if (missingFromDoc.length === 0) {
    console.log('  (none — all codebase modules are documented)\n');
  } else {
    for (const mod of missingFromDoc) {
      console.log(`  MISSING: ${mod} (${kebabToPascal(mod)}Module)`);
    }
    console.log(`\n  ${missingFromDoc.length} module(s) not documented.\n`);
  }

  console.log('--- Modules mentioned in module-blast-radius.md but NOT found in codebase ---');
  if (phantomInDoc.length === 0) {
    console.log('  (none — all documented modules exist in codebase)\n');
  } else {
    for (const mod of phantomInDoc) {
      console.log(`  PHANTOM: ${mod} (referenced in doc but no directory found)`);
    }
    console.log(`\n  ${phantomInDoc.length} phantom module(s) in doc.\n`);
  }

  // 6. Summary
  const totalIssues = missingFromDoc.length + phantomInDoc.length;
  if (totalIssues === 0) {
    console.log('All modules are consistent between codebase and documentation.');
  } else {
    console.log(
      `${totalIssues} inconsistenc${totalIssues === 1 ? 'y' : 'ies'} found. Review and update docs as needed.`,
    );
  }

  // Advisory only — always exit 0
  process.exit(0);
}

main();
