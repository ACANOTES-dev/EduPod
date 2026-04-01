#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function hasGeneratedPrismaClient() {
  const directPath = path.join(repoRoot, 'node_modules/.prisma/client/index.d.ts');
  if (fs.existsSync(directPath)) {
    return true;
  }

  const pnpmStorePath = path.join(repoRoot, 'node_modules/.pnpm');
  if (!fs.existsSync(pnpmStorePath)) {
    return false;
  }

  return fs
    .readdirSync(pnpmStorePath)
    .some((entry) =>
      fs.existsSync(
        path.join(
          pnpmStorePath,
          entry,
          'node_modules/.prisma/client/index.d.ts',
        ),
      ),
    );
}

function pass(name, detail) {
  console.log(`PASS ${name}: ${detail}`);
}

function fail(name, detail, fix) {
  failures.push({ name, detail, fix });
  console.log(`FAIL ${name}: ${detail}`);
  if (fix) {
    console.log(`  fix: ${fix}`);
  }
}

function checkPort(name, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.end();
      pass(name, `reachable on localhost:${port}`);
      resolve();
    });
    socket.once('error', () => {
      fail(name, `nothing is listening on localhost:${port}`, 'Start local services with `docker compose up -d`.');
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      fail(name, `timed out while connecting to localhost:${port}`, 'Start local services with `docker compose up -d`.');
      resolve();
    });
  });
}

function checkHttp(name, urlPath) {
  return new Promise((resolve) => {
    const request = http.get(urlPath, { timeout: 1000 }, (response) => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        pass(name, `${urlPath} responded with ${response.statusCode}`);
      } else {
        fail(name, `${urlPath} responded with ${response.statusCode ?? 'no status'}`, 'Start local services with `docker compose up -d`.');
      }

      response.resume();
      resolve();
    });

    request.once('error', () => {
      fail(name, `${urlPath} is unreachable`, 'Start local services with `docker compose up -d`.');
      resolve();
    });
    request.once('timeout', () => {
      request.destroy();
      fail(name, `${urlPath} timed out`, 'Start local services with `docker compose up -d`.');
      resolve();
    });
  });
}

console.log('School OS doctor');
console.log('');

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor >= 24) {
  pass('Node.js', `v${process.versions.node}`);
} else {
  fail('Node.js', `v${process.versions.node} does not satisfy the >=24 engine requirement`, 'Use Node.js 24 before running local tooling.');
}

if (exists('node_modules')) {
  pass('Dependencies', 'node_modules present');
} else {
  fail('Dependencies', 'node_modules is missing', 'Run `pnpm install --frozen-lockfile`.');
}

if (exists('.env')) {
  pass('Environment file', '.env found');
} else if (exists('.env.local')) {
  fail('Environment file', 'found .env.local but not .env', 'Copy `.env.example` to `.env` so the API and worker read the local configuration.');
} else {
  fail('Environment file', 'missing .env', 'Copy `.env.example` to `.env` and fill in the required values.');
}

if (hasGeneratedPrismaClient()) {
  pass('Prisma client', 'generated client present');
} else {
  fail('Prisma client', 'generated client is missing', 'Run `pnpm --filter @school/prisma exec prisma generate`.');
}

if (exists('packages/shared/dist/index.js')) {
  pass('Shared build artifact', 'packages/shared/dist/index.js present');
} else {
  fail('Shared build artifact', 'packages/shared/dist/index.js is missing', 'Run `pnpm build`.');
}

if (exists('apps/api/dist/main.js')) {
  pass('API build artifact', 'apps/api/dist/main.js present');
} else {
  fail('API build artifact', 'apps/api/dist/main.js is missing', 'Run `pnpm --filter @school/api build` or `pnpm build`.');
}

if (exists('apps/worker/dist/apps/worker/src/main.js')) {
  pass('Worker build artifact', 'apps/worker/dist/apps/worker/src/main.js present');
} else {
  fail('Worker build artifact', 'apps/worker/dist/apps/worker/src/main.js is missing', 'Run `pnpm --filter @school/worker build` or `pnpm build`.');
}

await checkPort('PostgreSQL', 5553);
await checkPort('PgBouncer', 6432);
await checkPort('Redis', 5554);
await checkHttp('Meilisearch', 'http://127.0.0.1:5555/health');

if (failures.length > 0) {
  console.log('');
  console.log(`Doctor found ${failures.length} issue(s).`);
  process.exit(1);
}

console.log('');
console.log('Doctor checks passed.');
