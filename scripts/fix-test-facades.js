#!/usr/bin/env node
/**
 * Codemod script to add MOCK_FACADE_PROVIDERS to all failing test files.
 *
 * For each test file:
 * 1. Adds `import { MOCK_FACADE_PROVIDERS } from '...common/tests/mock-facades';`
 * 2. Adds `...MOCK_FACADE_PROVIDERS,` to every `providers: [` in Test.createTestingModule calls
 */

const fs = require('fs');
const path = require('path');

const API_SRC = path.resolve(__dirname, '../apps/api/src');
const MOCK_FACADES_PATH = 'common/tests/mock-facades';

// Read list of failing tests
const failingTests = fs.readFileSync('/tmp/unique_failing_tests.txt', 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(f => path.resolve(__dirname, '../apps/api', f));

let modified = 0;
let skipped = 0;
let errors = [];

for (const testFile of failingTests) {
  try {
    if (!fs.existsSync(testFile)) {
      errors.push(`NOT FOUND: ${testFile}`);
      continue;
    }

    let content = fs.readFileSync(testFile, 'utf-8');

    // Skip if already has MOCK_FACADE_PROVIDERS
    if (content.includes('MOCK_FACADE_PROVIDERS')) {
      skipped++;
      continue;
    }

    // Calculate relative import path
    const testDir = path.dirname(testFile);
    let relPath = path.relative(testDir, path.join(API_SRC, MOCK_FACADES_PATH));
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    // Normalize to forward slashes
    relPath = relPath.replace(/\\/g, '/');

    // Step 1: Add import statement
    // Find the right place - after the last external/internal import, before relative imports
    // Strategy: find the first relative import (../ or ./) and insert before it
    const lines = content.split('\n');
    let importInsertIndex = -1;
    let lastNestJsImportIndex = -1;
    let lastExternalImportIndex = -1;
    let firstRelativeImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('import{')) {
        if (line.includes("'@nestjs/") || line.includes('"@nestjs/')) {
          lastNestJsImportIndex = i;
        }
        if (line.includes("'@") || line.includes('"@') || !line.includes("'./") && !line.includes("'../") && !line.includes('"./') && !line.includes('"../')) {
          lastExternalImportIndex = i;
        }
        if ((line.includes("'../") || line.includes('"../') || line.includes("'./") || line.includes('"./')) && firstRelativeImportIndex === -1) {
          firstRelativeImportIndex = i;
        }
      }
    }

    // Insert after external imports (which includes @school/* etc), before relative imports
    // The mock-facades import is a relative import, so it goes with other relative imports
    // But it should go before module-specific relative imports
    // Best strategy: insert right before the first relative import, with a blank line if needed

    const importLine = `import { MOCK_FACADE_PROVIDERS } from '${relPath}';`;

    if (firstRelativeImportIndex !== -1) {
      // Check if there's a blank line before the first relative import
      const prevLine = lines[firstRelativeImportIndex - 1]?.trim();
      if (prevLine === '') {
        // Insert after the blank line (at firstRelativeImportIndex position)
        lines.splice(firstRelativeImportIndex, 0, importLine);
      } else {
        // Insert with blank line before
        lines.splice(firstRelativeImportIndex, 0, '', importLine);
      }
    } else if (lastExternalImportIndex !== -1) {
      // No relative imports found, add after last external import
      lines.splice(lastExternalImportIndex + 1, 0, '', importLine);
    } else {
      // No imports at all, add at top
      lines.splice(0, 0, importLine, '');
    }

    content = lines.join('\n');

    // Step 2: Add ...MOCK_FACADE_PROVIDERS to providers arrays
    // Match patterns like `providers: [` and add the spread at the start of the array
    // Handle both inline and multi-line patterns

    // Pattern: `providers: [\n` followed by anything
    content = content.replace(
      /providers:\s*\[(\s*\n)/g,
      'providers: [$1        ...MOCK_FACADE_PROVIDERS,\n'
    );

    // Also handle single-line providers that may have content right after [
    // Like: `providers: [SomeService,`
    // But NOT if ...MOCK_FACADE_PROVIDERS is already there
    content = content.replace(
      /providers:\s*\[(\s*)(?!\.\.\.MOCK_FACADE_PROVIDERS)([A-Z{])/g,
      'providers: [$1...MOCK_FACADE_PROVIDERS, $2'
    );

    fs.writeFileSync(testFile, content, 'utf-8');
    modified++;
  } catch (e) {
    errors.push(`ERROR: ${testFile}: ${e.message}`);
  }
}

console.log(`Modified: ${modified}`);
console.log(`Skipped (already has mocks): ${skipped}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  errors.forEach(e => console.log(`  ${e}`));
}
