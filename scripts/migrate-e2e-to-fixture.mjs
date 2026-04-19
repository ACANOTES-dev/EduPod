#!/usr/bin/env node
/**
 * One-shot migration script: shared al-noor/cedar tenant → per-test fixture.
 *
 * For each file:
 *   1. Strip AL_NOOR_* / CEDAR_* imports from ./helpers.
 *   2. Add PrismaClient + createTenantFixture/deleteTenantFixture imports.
 *   3. Inject `let prisma` + `let fixture` (+ `let cedarFixture` if dual) into describe.
 *   4. Inject fixture provisioning after `await createTestApp()`.
 *   5. Inject fixture teardown before `await closeTestApp()`.
 *   6. Rewrite AL_NOOR_DOMAIN → fixture.domainName (and *_EMAIL equivalents).
 *   7. Same for CEDAR_* → cedarFixture.* (dual-tenant files only).
 *
 * Non-destructive: prints a summary and skips files already migrated.
 * Run: node scripts/migrate-e2e-to-fixture.mjs <file1> <file2> ...
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const AL_NOOR_REPLACEMENTS = [
  ['AL_NOOR_DOMAIN', 'fixture.domainName'],
  ['AL_NOOR_OWNER_EMAIL', 'fixture.ownerEmail'],
  ['AL_NOOR_ADMIN_EMAIL', 'fixture.adminEmail!'],
  ['AL_NOOR_TEACHER_EMAIL', 'fixture.teacherEmail!'],
  ['AL_NOOR_PARENT_EMAIL', 'fixture.parentEmail!'],
];

const CEDAR_REPLACEMENTS = [
  ['CEDAR_DOMAIN', 'cedarFixture.domainName'],
  ['CEDAR_OWNER_EMAIL', 'cedarFixture.ownerEmail'],
  ['CEDAR_ADMIN_EMAIL', 'cedarFixture.adminEmail!'],
  ['CEDAR_TEACHER_EMAIL', 'cedarFixture.teacherEmail!'],
  ['CEDAR_PARENT_EMAIL', 'cedarFixture.parentEmail!'],
];

const AL_NOOR_IMPORT_NAMES = [
  'AL_NOOR_DOMAIN',
  'AL_NOOR_OWNER_EMAIL',
  'AL_NOOR_ADMIN_EMAIL',
  'AL_NOOR_TEACHER_EMAIL',
  'AL_NOOR_PARENT_EMAIL',
];

const CEDAR_IMPORT_NAMES = [
  'CEDAR_DOMAIN',
  'CEDAR_OWNER_EMAIL',
  'CEDAR_ADMIN_EMAIL',
  'CEDAR_TEACHER_EMAIL',
  'CEDAR_PARENT_EMAIL',
];

function migrateFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;

  const isDual = /CEDAR_DOMAIN|CEDAR_\w+_EMAIL/.test(content);
  const hasAlNoor = /AL_NOOR_DOMAIN|AL_NOOR_\w+_EMAIL/.test(content);

  if (!hasAlNoor) {
    return { filePath, skipped: 'no AL_NOOR references' };
  }

  // Already migrated? Detect import of createTenantFixture.
  if (content.includes("from './tenant-fixture.builder'") ||
      content.includes('from "./tenant-fixture.builder"')) {
    return { filePath, skipped: 'already migrated' };
  }

  // Detect the helpers import path used by this file (./helpers or ../helpers).
  const helpersPathMatch = content.match(/from\s*(['"])((?:\.\.?\/)+helpers)\1/);
  const helpersPath = helpersPathMatch?.[2] ?? './helpers';
  const fixturePath = helpersPath.replace(/helpers$/, 'tenant-fixture.builder');

  // 1. Strip AL_NOOR_* and CEDAR_* import names from the helpers import block.
  const allImportNames = [...AL_NOOR_IMPORT_NAMES, ...CEDAR_IMPORT_NAMES];
  const helpersImportRegex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${helpersPath.replace(/\./g, '\\.')}['"]`,
  );
  content = content.replace(helpersImportRegex, (_full, body) => {
    const names = body
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !allImportNames.includes(s));
    return `import {\n  ${names.join(',\n  ')},\n} from '${helpersPath}'`;
  });

  // 2. Add PrismaClient import. Insert after the @nestjs/common import or at top.
  if (!content.includes("import { PrismaClient } from '@prisma/client'")) {
    if (content.includes("from '@nestjs/common'")) {
      content = content.replace(
        /(import\s*\{[^}]*\}\s*from\s*['"]@nestjs\/common['"];?\n)/,
        `$1import { PrismaClient } from '@prisma/client';\n`,
      );
    } else {
      // Insert at very top
      content = `import { PrismaClient } from '@prisma/client';\n\n` + content;
    }
  }

  // 3. Add fixture builder import after the helpers import.
  if (!content.includes(`from '${fixturePath}'`)) {
    const helpersImportLineRegex = new RegExp(
      `(import\\s*\\{[^}]*\\}\\s*from\\s*['"]${helpersPath.replace(/\./g, '\\.')}['"];?\\n)`,
    );
    content = content.replace(
      helpersImportLineRegex,
      `$1import {\n  createTenantFixture,\n  deleteTenantFixture,\n  TenantFixture,\n} from '${fixturePath}';\n`,
    );
  }

  // 4. Inject let declarations after `let app: INestApplication;`, but only
  //    for declarations that don't already exist (files written with a manual
  //    prisma declaration should not get a duplicate).
  const letLines = [];
  if (!/\s{2}let prisma:\s*PrismaClient;/.test(content)) {
    letLines.push('  let prisma: PrismaClient;');
  }
  if (!/\s{2}let fixture:\s*TenantFixture;/.test(content)) {
    letLines.push('  let fixture: TenantFixture;');
  }
  if (isDual && !/\s{2}let cedarFixture:\s*TenantFixture;/.test(content)) {
    letLines.push('  let cedarFixture: TenantFixture;');
  }
  if (letLines.length > 0) {
    content = content.replace(
      /(\s{2}let app:\s*INestApplication;\n)/,
      `$1${letLines.join('\n')}\n`,
    );
  }

  // 5. Inject fixture creation after `app = await createTestApp();`.
  const createInject = isDual
    ? `    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });\n    fixture = await createTenantFixture(prisma);\n    cedarFixture = await createTenantFixture(prisma);\n`
    : `    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });\n    fixture = await createTenantFixture(prisma);\n`;

  content = content.replace(
    /(\s+app\s*=\s*await\s+createTestApp\(\);\n)/,
    `$1${createInject}`,
  );

  // 6. Inject teardown before `await closeTestApp();`.
  const teardownInject = isDual
    ? `    await deleteTenantFixture(prisma, fixture);\n    await deleteTenantFixture(prisma, cedarFixture);\n    await prisma.$disconnect();\n`
    : `    await deleteTenantFixture(prisma, fixture);\n    await prisma.$disconnect();\n`;

  content = content.replace(
    /(\s+)(await\s+closeTestApp\(\);)/,
    `\n${teardownInject}$1$2`,
  );

  // 7. Apply body text replacements.
  for (const [from, to] of AL_NOOR_REPLACEMENTS) {
    content = content.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  if (isDual) {
    for (const [from, to] of CEDAR_REPLACEMENTS) {
      content = content.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    }
  }

  // 8. Cleanup: string-interpolate literal alnoor/cedar test email domains.
  //    `test-x@alnoor.test` → `test-x@${fixture.domainName}`
  //    `test-x@cedar.test`  → `test-x@${cedarFixture.domainName}`
  content = content.replace(/@alnoor\.test`/g, '@${fixture.domainName}`');
  if (isDual) {
    content = content.replace(/@cedar\.test`/g, '@${cedarFixture.domainName}`');
  }

  // 9. Rewrite setupP4A/P4B/P5TestData calls that omit the options arg.
  //    setupP4ATestData(app, token)       → setupP4ATestData(app, token, { domain: fixture.domainName, teacherEmail: fixture.teacherEmail!, ownerEmail: fixture.ownerEmail })
  //    setupP5TestData(app, token)        → same
  //    setupP4BTestData(app, token)       → same
  //    setupCedarP5TestData(app, token)   → setupCedarP5TestData(app, token, { domain: cedarFixture.domainName })
  content = content.replace(
    /setupP(4A|4B|5)TestData\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    (_m, variant, appArg, tokenArg) =>
      `setupP${variant}TestData(${appArg.trim()}, ${tokenArg.trim()}, { domain: fixture.domainName, teacherEmail: fixture.teacherEmail!, ownerEmail: fixture.ownerEmail })`,
  );
  content = content.replace(
    /setupCedarP5TestData\(\s*([^,]+),\s*([^,)]+)\s*\)/g,
    (_m, appArg, tokenArg) =>
      `setupCedarP5TestData(${appArg.trim()}, ${tokenArg.trim()}, { domain: cedarFixture.domainName })`,
  );

  if (content === original) {
    return { filePath, skipped: 'no changes' };
  }

  writeFileSync(filePath, content);
  return { filePath, migrated: true, isDual };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node migrate-e2e-to-fixture.mjs <file1> <file2> ...');
  process.exit(1);
}

const results = files.map((f) => migrateFile(resolve(f)));
for (const r of results) {
  if (r.migrated) {
    console.log(`✓ ${r.isDual ? 'DUAL' : 'SOLO'}  ${r.filePath}`);
  } else {
    console.log(`- SKIP  ${r.filePath} (${r.skipped})`);
  }
}
