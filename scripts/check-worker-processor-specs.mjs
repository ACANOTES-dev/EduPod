#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const processorsRoot = join(repoRoot, 'apps', 'worker', 'src', 'processors');

function collectProcessorFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectProcessorFiles(absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.endsWith('.processor.ts')) {
      continue;
    }

    if (entry.name.endsWith('.processor.spec.ts')) {
      continue;
    }

    files.push(absolutePath);
  }

  return files.sort();
}

if (!existsSync(processorsRoot) || !statSync(processorsRoot).isDirectory()) {
  console.error(`Worker processors directory not found: ${processorsRoot}`);
  process.exit(1);
}

const processorFiles = collectProcessorFiles(processorsRoot);
const missingSpecs = processorFiles.filter((processorFile) => {
  const specFile = processorFile.replace('.processor.ts', '.processor.spec.ts');
  return !existsSync(specFile);
});

if (missingSpecs.length > 0) {
  console.error('Missing co-located worker processor specs:');
  for (const file of missingSpecs) {
    console.error(`- ${file.replace(`${repoRoot}/`, '')}`);
  }
  process.exit(1);
}

console.log(`Verified ${processorFiles.length} worker processors with matching specs.`);
