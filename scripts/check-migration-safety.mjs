#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SQL_FILE_SUFFIXES = new Set(['migration.sql', 'post_migrate.sql']);
const DESTRUCTIVE_PATTERNS = [
  { label: 'DROP TABLE', regex: /\bdrop\s+table\b/i },
  { label: 'DROP COLUMN', regex: /\bdrop\s+column\b/i },
];

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function collectSqlFiles(entries) {
  return entries
    .filter(Boolean)
    .map((entry) => path.resolve(entry))
    .filter((entry) => fs.existsSync(entry))
    .filter((entry) => fs.statSync(entry).isFile())
    .filter((entry) => SQL_FILE_SUFFIXES.has(path.basename(entry)));
}

function findViolations(filePath) {
  const rawSql = fs.readFileSync(filePath, 'utf8');
  const sanitizedSql = stripSqlComments(rawSql);
  const lines = sanitizedSql.split('\n');
  const violations = [];

  for (const [index, line] of lines.entries()) {
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.regex.test(line)) {
        violations.push({
          label: pattern.label,
          lineNumber: index + 1,
          line: line.trim(),
        });
      }
    }
  }

  return violations;
}

const files = collectSqlFiles(process.argv.slice(2));

if (files.length === 0) {
  console.log('No migration SQL files passed to safety check.');
  process.exit(0);
}

const failures = files.flatMap((filePath) =>
  findViolations(filePath).map((violation) => ({
    ...violation,
    filePath,
  })),
);

if (failures.length === 0) {
  console.log(`Migration safety check passed for ${files.length} file(s).`);
  process.exit(0);
}

console.error('Migration safety check failed. Destructive SQL detected:');

for (const failure of failures) {
  const relativeFilePath = path.relative(process.cwd(), failure.filePath);
  console.error(
    `- ${relativeFilePath}:${failure.lineNumber} ${failure.label} -> ${failure.line}`,
  );
}

process.exit(1);
