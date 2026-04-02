#!/usr/bin/env node
// check-module-tiers.js
// Validates that NestJS module imports respect the tier dependency rules.
//
// Rules:
//   Tier 1 → must not import from any other application tier
//   Tier 2 → may import Tier 1 only
//   Tier 3 → may import Tier 1, Tier 2, or same-tier peers (whitelisted)
//   Tier 4 → may import Tier 1, Tier 2, Tier 3, but NOT other Tier 4
//
// Violations that are whitelisted are documented in architecture/module-tiers.md.
//
// Exit 0 = clean
// Exit 1 = violations found

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Tier definitions ────────────────────────────────────────────────────────

/** @type {Record<string, 1 | 2 | 3 | 4>} */
const MODULE_TIERS = {
  // Tier 1 — Infrastructure (global, zero domain knowledge)
  prisma: 1,
  redis: 1,
  config: 1,
  common: 1,
  'audit-log': 1,

  // Tier 2 — Cross-cutting (utilities, compliance, shared services)
  auth: 2,
  s3: 2,
  sequence: 2,
  approvals: 2,
  'pdf-rendering': 2,
  search: 2,
  configuration: 2,
  gdpr: 2,
  'policy-engine': 2,

  // Tier 3 — Domain (core business logic)
  academics: 3,
  admissions: 3,
  attendance: 3,
  behaviour: 3,
  'child-protection': 3,
  'class-requirements': 3,
  classes: 3,
  communications: 3,
  'critical-incidents': 3,
  finance: 3,
  gradebook: 3,
  homework: 3,
  imports: 3,
  pastoral: 3,
  'pastoral-checkins': 3,
  'pastoral-dsar': 3,
  payroll: 3,
  'period-grid': 3,
  rbac: 3,
  registration: 3,
  regulatory: 3,
  rooms: 3,
  schedules: 3,
  scheduling: 3,
  'scheduling-runs': 3,
  'school-closures': 3,
  sen: 3,
  'staff-availability': 3,
  'staff-preferences': 3,
  'staff-profiles': 3,
  'staff-wellbeing': 3,
  students: 3,
  tenants: 3,

  // Tier 4 — Leaf (isolated, no downstream dependents)
  compliance: 4,
  dashboard: 4,
  'early-warning': 4,
  engagement: 4,
  health: 4,
  households: 4,
  'parent-inquiries': 4,
  parents: 4,
  preferences: 4,
  reports: 4,
  'security-incidents': 4,
  website: 4,
};

// ─── Known exceptions (whitelisted violations) ────────────────────────────────
// Each entry is { importer, imported } — both are module directory names.
// See architecture/module-tiers.md "Known Exceptions" for justifications.

/** @type {Array<{ importer: string, imported: string }>} */
const WHITELISTED_VIOLATIONS = [
  // T2 → T2 intra-tier: auth and s3 are the most foundational T2 modules
  // (they have zero deps on other T2 modules). Other T2 modules may import them
  // for authentication guards and file storage — this is a valid one-way flow.
  { importer: 'search', imported: 'auth' },
  { importer: 'configuration', imported: 's3' },
  { importer: 'gdpr', imported: 'auth' },
  // auth → configuration: MFA TOTP encryption uses EncryptionService (S-19)
  { importer: 'auth', imported: 'configuration' },

  // T2 → T3
  { importer: 'policy-engine', imported: 'behaviour' },
  { importer: 'gdpr', imported: 'communications' },

  // T3 → T3 peer deps (all documented in module-blast-radius.md)
  { importer: 'behaviour', imported: 'pastoral' },
  { importer: 'behaviour', imported: 'child-protection' },
  { importer: 'child-protection', imported: 'pastoral' },
  { importer: 'pastoral', imported: 'child-protection' },
  { importer: 'pastoral', imported: 'communications' },
  { importer: 'gradebook', imported: 'academics' },
  { importer: 'gradebook', imported: 'communications' },
  { importer: 'attendance', imported: 'communications' },
  { importer: 'attendance', imported: 'school-closures' },
  { importer: 'classes', imported: 'schedules' },
  { importer: 'registration', imported: 'finance' },
  { importer: 'scheduling-runs', imported: 'period-grid' },
  { importer: 'schedules', imported: 'rooms' },

  // T4 → T3 (documented)
  { importer: 'households', imported: 'registration' },
  { importer: 'compliance', imported: 'pastoral' },

  // T4 → T4 (documented facade pattern)
  { importer: 'dashboard', imported: 'reports' },
];

// ─── Module directory discovery ───────────────────────────────────────────────

const MODULES_ROOT = path.resolve(__dirname, '../apps/api/src/modules');

// Some Tier 1 modules live outside the modules/ directory.
// Map their names to alternate paths for resolution.
const ALTERNATE_PATHS = {
  // CommonModule lives at apps/api/src/common/ not apps/api/src/modules/common/
  common: path.resolve(__dirname, '../apps/api/src/common/common.module.ts'),
};

function getModuleFile(moduleName) {
  // Check alternate paths first
  if (ALTERNATE_PATHS[moduleName]) {
    const altPath = ALTERNATE_PATHS[moduleName];
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }

  const dir = path.join(MODULES_ROOT, moduleName);
  try {
    const files = fs.readdirSync(dir);
    const moduleFile = files.find((f) => f.endsWith('.module.ts'));
    if (moduleFile) {
      return path.join(dir, moduleFile);
    }
  } catch (_) {
    // directory doesn't exist
  }
  return null;
}

// ─── Import extraction ────────────────────────────────────────────────────────

// Match: from '../some-module/some-module.module' or from '../some-module/...'
const CROSS_MODULE_IMPORT_RE = /from\s+['"]\.\.\/([^/'"]+)/g;

/**
 * Returns the list of sibling module names that this module.ts imports.
 * @param {string} filePath
 * @returns {string[]}
 */
function extractImportedModules(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return [];
  }

  const imported = new Set();
  let match;
  while ((match = CROSS_MODULE_IMPORT_RE.exec(content)) !== null) {
    const moduleName = match[1];
    // Only track names we know about
    if (moduleName in MODULE_TIERS) {
      imported.add(moduleName);
    }
  }
  return Array.from(imported);
}

// ─── Violation detection ──────────────────────────────────────────────────────

function isWhitelisted(importer, imported) {
  return WHITELISTED_VIOLATIONS.some((e) => e.importer === importer && e.imported === imported);
}

/**
 * @param {string} importer  — module name of the importer
 * @param {number} importerTier
 * @param {string} imported  — module name being imported
 * @param {number} importedTier
 * @returns {string | null}  — violation message, or null if allowed
 */
function checkViolation(importer, importerTier, imported, importedTier) {
  if (isWhitelisted(importer, imported)) {
    return null;
  }

  // Tier 1 must not import any application module
  if (importerTier === 1 && importedTier >= 1) {
    return `Tier 1 module "${importer}" must not import any application module, but imports "${imported}" (Tier ${importedTier})`;
  }

  // Tier 2 must only import Tier 1
  if (importerTier === 2 && importedTier > 1) {
    return `Tier 2 module "${importer}" must only import Tier 1, but imports "${imported}" (Tier ${importedTier})`;
  }

  // Tier 3 must not import Tier 4
  if (importerTier === 3 && importedTier === 4) {
    return `Tier 3 module "${importer}" must not import Tier 4 module "${imported}"`;
  }

  // Tier 4 must not import other Tier 4
  if (importerTier === 4 && importedTier === 4) {
    return `Tier 4 module "${importer}" must not import Tier 4 module "${imported}" (Tier 4 isolation rule)`;
  }

  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const violations = [];
  const warnings = [];
  const checked = [];

  for (const [moduleName, tier] of Object.entries(MODULE_TIERS)) {
    const moduleFile = getModuleFile(moduleName);
    if (!moduleFile) {
      warnings.push(
        `  [WARN] Module "${moduleName}" (Tier ${tier}) has no *.module.ts file — skipping`,
      );
      continue;
    }

    const imports = extractImportedModules(moduleFile);
    checked.push({ moduleName, tier, imports });

    for (const importedName of imports) {
      const importedTier = MODULE_TIERS[importedName];
      if (importedTier === undefined) {
        // Unknown module — not in tier map, skip
        continue;
      }

      const violation = checkViolation(moduleName, tier, importedName, importedTier);
      if (violation) {
        violations.push(violation);
      }
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────────────

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const { tier } of checked) {
    tierCounts[tier]++;
  }

  console.log('');
  console.log('Module Tier Check');
  console.log('=================');
  console.log(`Scanned: ${checked.length} modules`);
  console.log(`  Tier 1 (Infrastructure):      ${tierCounts[1]}`);
  console.log(`  Tier 2 (Cross-cutting):        ${tierCounts[2]}`);
  console.log(`  Tier 3 (Domain):               ${tierCounts[3]}`);
  console.log(`  Tier 4 (Leaf):                 ${tierCounts[4]}`);
  console.log(`Whitelisted exceptions:          ${WHITELISTED_VIOLATIONS.length}`);
  console.log('');

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const w of warnings) {
      console.log(w);
    }
    console.log('');
  }

  if (violations.length === 0) {
    console.log('Result: PASS — no tier violations found');
    console.log('');
    process.exit(0);
  } else {
    console.error(`Result: FAIL — ${violations.length} tier violation(s) found:`);
    console.error('');
    for (const v of violations) {
      console.error(`  [VIOLATION] ${v}`);
    }
    console.error('');
    console.error('To fix: either resolve the dependency direction, or add an entry to');
    console.error('WHITELISTED_VIOLATIONS in scripts/check-module-tiers.js with a');
    console.error('justification comment, and document it in architecture/module-tiers.md.');
    console.error('');
    process.exit(1);
  }
}

main();
