import fs from 'fs';
import path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

const API_SRC = path.resolve(__dirname, '../..');
const MODULES_DIR = path.resolve(API_SRC, 'modules');

/**
 * Recursively collect all .ts files under a directory, excluding node_modules,
 * test files, and declaration files.
 */
function collectTsFiles(dir: string, filter?: (f: string) => boolean): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      results.push(...collectTsFiles(fullPath, filter));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      if (!filter || filter(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Read a file and return its contents, or empty string if not found.
 */
function readFileContents(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('gdpr_anonymisation_tokens - non-exposure', () => {
  it('should not be returned by any API controller', () => {
    // Collect all controller files across all modules
    const controllerFiles = collectTsFiles(MODULES_DIR, (f) => f.endsWith('.controller.ts'));

    expect(controllerFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of controllerFiles) {
      const contents = readFileContents(file);
      const relativePath = path.relative(MODULES_DIR, file);

      // Check if the controller references the token table directly
      if (
        contents.includes('gdprAnonymisationToken') ||
        contents.includes('gdpr_anonymisation_tokens')
      ) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('should not be included in DSAR export traversal output', () => {
    const dsarTraversalPath = path.resolve(MODULES_DIR, 'compliance/dsar-traversal.service.ts');
    const contents = readFileContents(dsarTraversalPath);

    expect(contents.length).toBeGreaterThan(0);

    // The DSAR traversal queries gdprAnonymisationToken only to get token IDs
    // for filtering usage logs. It must NEVER include the actual token values
    // (the `token` field) in the output, and must NEVER return token rows as
    // a category in the DSAR data package.

    // 1. Verify no return category named 'anonymisation_tokens' or similar
    //    exists in any of the collection methods' return objects
    const returnBlockPattern =
      /return\s*\{[^}]*(?:anonymisation_tokens|gdpr_anonymisation_tokens|token_mappings)[^}]*\}/gs;
    const returnMatches = contents.match(returnBlockPattern);
    expect(returnMatches).toBeNull();

    // 2. Verify any query on gdprAnonymisationToken uses select: { id: true }
    //    to fetch ONLY IDs, never the full record with token values
    const tokenQueryPattern = /gdprAnonymisationToken\.findMany\s*\(\s*\{[\s\S]*?\}\s*\)/g;
    const tokenQueries = contents.match(tokenQueryPattern);

    if (tokenQueries) {
      for (const query of tokenQueries) {
        // Every query must use `select: { id: true }` to restrict returned fields
        expect(query).toContain('select:');
        expect(query).toContain('id: true');

        // Must NOT select the `token` field — that would expose the mapping
        expect(query).not.toMatch(/select:\s*\{[^}]*token:\s*true/);

        // Must NOT select `entity_id` or `entity_type` — those expose the real identity mapping
        expect(query).not.toMatch(/select:\s*\{[^}]*entity_id:\s*true/);
        expect(query).not.toMatch(/select:\s*\{[^}]*entity_type:\s*true/);
      }
    }

    // 3. Verify token IDs are used ONLY for filtering usage logs,
    //    not returned directly in the data package
    const collectMethodReturns = contents.match(/return\s*\{[\s\S]*?\n\s{4}\};/g);

    if (collectMethodReturns) {
      for (const returnBlock of collectMethodReturns) {
        // No return block should contain a key that exposes token records
        expect(returnBlock).not.toMatch(/anonymisation_tokens\s*:/);
        expect(returnBlock).not.toMatch(/token_records\s*:/);
        expect(returnBlock).not.toMatch(/studentTokens\s*[,:\n]/);
      }
    }
  });

  it('should only be accessed by GdprTokenService for full token data', () => {
    // Collect all service files across all modules (excluding spec files)
    const serviceFiles = collectTsFiles(MODULES_DIR, (f) => f.endsWith('.service.ts'));

    expect(serviceFiles.length).toBeGreaterThan(0);

    // Track which services access the token table and how
    const fullAccessViolations: string[] = [];

    for (const file of serviceFiles) {
      const contents = readFileContents(file);
      const relativePath = path.relative(MODULES_DIR, file);
      const isGdprTokenService = relativePath.includes('gdpr-token.service.ts');

      if (isGdprTokenService) {
        // GdprTokenService is the only allowed full-access service
        continue;
      }

      if (!contents.includes('gdprAnonymisationToken')) {
        continue;
      }

      // Check for operations that access full records (no select restriction)
      // Allowed: deleteMany (write-only), findMany with select: { id: true }
      // Not allowed: findFirst/findMany without select, create, update (outside GdprTokenService)

      const lines = contents.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';

        if (!line.includes('gdprAnonymisationToken')) {
          continue;
        }

        // deleteMany is a write operation (cleanup), not a data exposure
        if (line.includes('.deleteMany')) {
          continue;
        }

        // findMany with select: { id: true } is acceptable (ID-only lookup)
        if (line.includes('.findMany')) {
          // Look ahead up to 5 lines for the select clause
          const lookAhead = lines.slice(i, i + 6).join('\n');
          if (lookAhead.includes('select:') && lookAhead.includes('id: true')) {
            // Verify it does NOT select token, entity_id, or entity_type
            if (
              !lookAhead.match(/token:\s*true/) &&
              !lookAhead.match(/entity_id:\s*true/) &&
              !lookAhead.match(/entity_type:\s*true/)
            ) {
              continue; // This is a safe ID-only query
            }
          }
          // Full record access — violation
          fullAccessViolations.push(
            `${relativePath}:${i + 1} — findMany without ID-only select restriction`,
          );
        }

        // findFirst without select is a full record access
        if (line.includes('.findFirst') && !line.includes('.findMany')) {
          fullAccessViolations.push(`${relativePath}:${i + 1} — findFirst (full record access)`);
        }

        // create/update outside GdprTokenService is a violation
        if (line.includes('.create') || line.includes('.update')) {
          fullAccessViolations.push(
            `${relativePath}:${i + 1} — create/update (should only be in GdprTokenService)`,
          );
        }
      }
    }

    expect(fullAccessViolations).toEqual([]);
  });

  it('should not expose token values through any controller route handler', () => {
    // Verify that the GdprTokenController does NOT have any endpoint
    // that returns token records from gdpr_anonymisation_tokens
    const gdprTokenControllerPath = path.resolve(MODULES_DIR, 'gdpr/gdpr-token.controller.ts');
    const contents = readFileContents(gdprTokenControllerPath);

    expect(contents.length).toBeGreaterThan(0);

    // The controller should only expose:
    // - getExportPolicies (gdprExportPolicy table, NOT token table)
    // - getUsageLog (gdprTokenUsageLog table, NOT token table)
    // - getUsageStats (aggregated counts, NOT token records)

    // It should NOT have any endpoint that calls methods returning raw token data
    expect(contents).not.toContain('processOutbound');
    expect(contents).not.toContain('processInbound');
    expect(contents).not.toContain('deleteTokensForEntity');
    expect(contents).not.toContain('tokeniseEntities');

    // It should NOT reference the token table directly
    expect(contents).not.toContain('gdprAnonymisationToken');
    expect(contents).not.toContain('gdpr_anonymisation_tokens');
  });
});
