/**
 * RLS Catalogue Audit Script
 *
 * Enforces policies.sql as the SINGLE SOURCE OF TRUTH for all RLS policies.
 * Prisma models with `tenant_id` MUST appear in policies.sql to pass.
 * Migration files are scanned for informational coverage stats only.
 *
 * Exit code 0 = all tenant-scoped tables have RLS policies in policies.sql
 * Exit code 1 = one or more tenant-scoped tables are missing from policies.sql
 *
 * Usage: npx tsx scripts/audit-rls.ts
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT_DIR = resolve(__dirname, '..');
const SCHEMA_PATH = join(ROOT_DIR, 'packages', 'prisma', 'schema.prisma');
const POLICIES_PATH = join(ROOT_DIR, 'packages', 'prisma', 'rls', 'policies.sql');
const MIGRATIONS_DIR = join(ROOT_DIR, 'packages', 'prisma', 'migrations');

/**
 * Tables excluded from the RLS audit.
 * Each entry documents the reason for exclusion.
 */
const KNOWN_EXCEPTIONS: Record<string, string> = {
  users: 'Platform-level table, not tenant-scoped. Guarded at application layer.',
  survey_responses: 'Anonymity by design — no tenant_id linkage for response privacy.',
  survey_participation_tokens:
    'Anonymity by design — tokens are not tenant-isolated to preserve survey anonymity.',
  gdpr_export_policies: 'Platform-level configuration, not tenant-scoped.',
};

// ─── PascalCase to snake_case conversion ──────────────────────────────────────

function pascalToSnake(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

// ─── Schema parsing ──────────────────────────────────────────────────────────

interface ModelInfo {
  modelName: string;
  tableName: string;
  hasTenantId: boolean;
}

function parseSchema(schemaContent: string): ModelInfo[] {
  const models: ModelInfo[] = [];
  const modelRegex = /^model\s+(\w+)\s*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const modelName = match[1];
    const startIndex = match.index + match[0].length;

    // Find the closing brace for this model block (handles nested braces)
    let braceCount = 1;
    let endIndex = startIndex;
    while (braceCount > 0 && endIndex < schemaContent.length) {
      if (schemaContent[endIndex] === '{') braceCount++;
      if (schemaContent[endIndex] === '}') braceCount--;
      endIndex++;
    }

    const modelBody = schemaContent.slice(startIndex, endIndex - 1);

    // Check for tenant_id field (as a column, not a relation reference)
    const hasTenantId = /^\s+tenant_id\s+/m.test(modelBody);

    // Determine table name: @@map("table_name") or PascalCase -> snake_case
    const mapMatch = modelBody.match(/@@map\("([^"]+)"\)/);
    const tableName = mapMatch ? mapMatch[1] : pascalToSnake(modelName);

    models.push({ modelName, tableName, hasTenantId });
  }

  return models;
}

// ─── RLS policy extraction ───────────────────────────────────────────────────

function extractRlsTables(sqlContent: string): Set<string> {
  const tables = new Set<string>();
  // Match: ALTER TABLE "table_name" ENABLE ROW LEVEL SECURITY
  // and:   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY
  const rlsRegex = /ALTER\s+TABLE\s+"?(\w+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let match: RegExpExecArray | null;

  while ((match = rlsRegex.exec(sqlContent)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  return tables;
}

// ─── Recursively find SQL files in migrations directory ──────────────────────

function findSqlFiles(dir: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...findSqlFiles(fullPath));
    } else if (entry.endsWith('.sql')) {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('=== RLS Catalogue Audit ===\n');
  console.log('Source of truth: packages/prisma/rls/policies.sql\n');

  // 1. Parse schema
  let schemaContent: string;
  try {
    schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
  } catch (err) {
    console.error(`FATAL: Cannot read schema at ${SCHEMA_PATH}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const models = parseSchema(schemaContent);
  const tenantModels = models.filter((m) => m.hasTenantId);
  const nonTenantModels = models.filter((m) => !m.hasTenantId);

  console.log(`Total models in schema: ${models.length}`);
  console.log(`Models with tenant_id: ${tenantModels.length}`);
  console.log(`Models without tenant_id: ${nonTenantModels.length}\n`);

  // 2. Extract canonical RLS tables from policies.sql (SINGLE SOURCE OF TRUTH)
  let canonicalRlsTables = new Set<string>();
  try {
    const policiesContent = readFileSync(POLICIES_PATH, 'utf-8');
    canonicalRlsTables = extractRlsTables(policiesContent);
    console.log(`RLS policies in policies.sql (canonical): ${canonicalRlsTables.size}`);
  } catch {
    console.error(`FATAL: Cannot read canonical catalogue at ${POLICIES_PATH}`);
    process.exit(1);
  }

  // 3. Scan migration files for informational coverage stats only
  const migrationRlsTables = new Set<string>();
  const migrationSqlFiles = findSqlFiles(MIGRATIONS_DIR);
  for (const sqlFile of migrationSqlFiles) {
    try {
      const sqlContent = readFileSync(sqlFile, 'utf-8');
      const tables = extractRlsTables(sqlContent);
      for (const t of tables) {
        migrationRlsTables.add(t);
      }
    } catch {
      // Skip unreadable files
    }
  }

  console.log(`RLS policies in migration files (informational): ${migrationRlsTables.size}`);

  // Report tables in migrations but NOT in policies.sql
  const migrationOnly: string[] = [];
  for (const t of migrationRlsTables) {
    if (!canonicalRlsTables.has(t)) {
      migrationOnly.push(t);
    }
  }
  if (migrationOnly.length > 0) {
    console.log(
      `  (${migrationOnly.length} in migrations only, not in canonical catalogue)`,
    );
  }
  console.log('');

  // 4. Compare: tenant_id models vs canonical policies.sql
  const criticalGaps: Array<{ modelName: string; tableName: string; inMigrations: boolean }> = [];
  const stalePolicies: string[] = [];

  // 4a. Tables with tenant_id but NO RLS policy in policies.sql
  for (const model of tenantModels) {
    const tableNameLower = model.tableName.toLowerCase();

    // Skip known exceptions
    if (tableNameLower in KNOWN_EXCEPTIONS) {
      continue;
    }

    if (!canonicalRlsTables.has(tableNameLower)) {
      criticalGaps.push({
        modelName: model.modelName,
        tableName: model.tableName,
        inMigrations: migrationRlsTables.has(tableNameLower),
      });
    }
  }

  // 4b. Tables with RLS policy in policies.sql but no tenant_id in schema
  const tenantTableNames = new Set(tenantModels.map((m) => m.tableName.toLowerCase()));
  for (const rlsTable of canonicalRlsTables) {
    if (!tenantTableNames.has(rlsTable)) {
      stalePolicies.push(rlsTable);
    }
  }

  // 5. Report results
  console.log('─── Known Exceptions ─────────────────────────────────────────');
  for (const [table, reason] of Object.entries(KNOWN_EXCEPTIONS)) {
    const model = models.find((m) => m.tableName.toLowerCase() === table);
    const hasTenant = model?.hasTenantId ? 'has tenant_id' : 'no tenant_id';
    console.log(`  SKIP  ${table} (${hasTenant}) — ${reason}`);
  }
  console.log('');

  if (criticalGaps.length > 0) {
    console.log('─── CRITICAL: Tables with tenant_id but NOT in policies.sql ──');
    for (const gap of criticalGaps) {
      const migrationNote = gap.inMigrations
        ? ' (exists in migrations but NOT in canonical catalogue)'
        : '';
      console.log(`  FAIL  ${gap.tableName} (model: ${gap.modelName})${migrationNote}`);
    }
    console.log('');
  }

  if (stalePolicies.length > 0) {
    console.log('─── WARNING: policies.sql entries with no matching tenant_id model ──');
    for (const table of stalePolicies.sort()) {
      console.log(`  WARN  ${table}`);
    }
    console.log('');
  }

  if (migrationOnly.length > 0) {
    console.log('─── INFO: Migration-only RLS (not in policies.sql) ──────────');
    for (const table of migrationOnly.sort()) {
      console.log(`  INFO  ${table}`);
    }
    console.log('');
  }

  // 6. Summary
  console.log('─── Summary ──────────────────────────────────────────────────');
  if (criticalGaps.length === 0 && stalePolicies.length === 0) {
    console.log('  PASS  All tenant-scoped tables are in the canonical catalogue (policies.sql)');
    console.log('  PASS  No stale RLS policies found');
    console.log('\nResult: PASS');
    process.exit(0);
  }

  if (criticalGaps.length > 0) {
    console.log(
      `  FAIL  ${criticalGaps.length} table(s) with tenant_id but missing from policies.sql (SECURITY GAP)`,
    );
  } else {
    console.log('  PASS  All tenant-scoped tables are in the canonical catalogue (policies.sql)');
  }

  if (stalePolicies.length > 0) {
    console.log(`  WARN  ${stalePolicies.length} policies.sql entry(ies) with no matching model`);
  } else {
    console.log('  PASS  No stale RLS policies found');
  }

  if (criticalGaps.length > 0) {
    console.log('\nResult: FAIL');
    process.exit(1);
  }

  // Stale policies alone are warnings, not failures
  console.log('\nResult: PASS (with warnings)');
  process.exit(0);
}

main();
