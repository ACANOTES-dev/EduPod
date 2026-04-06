#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Types ────────────────────────────────────────────────────────────────────

type Command = 'acquire' | 'heartbeat' | 'release' | 'status' | 'list' | 'cleanup' | 'help';

interface CliOptions {
  target?: string;
  session?: string;
  module?: string;
  owner?: string;
  reason?: string;
  ttlSeconds: number;
  pollSeconds: number;
  wait: boolean;
  json: boolean;
}

interface LockRecord {
  version: number;
  target: string;
  session: string;
  module: string;
  owner: string;
  reason: string | null;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  ttlSeconds: number;
  hostname: string;
  pid: number;
  cwd: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_POLL_SECONDS = 60;
const LOCKS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'coverage-locks');
const LOCKS_DIR = resolve(LOCKS_ROOT, 'locks');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(`[coverage-lock] ${message}`);
  process.exit(1);
}

function ensureLockDirs(): void {
  mkdirSync(LOCKS_DIR, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function nowIso(now = Date.now()): string {
  return new Date(now).toISOString();
}

function expiresIso(ttlSeconds: number, now = Date.now()): string {
  return new Date(now + ttlSeconds * 1000).toISOString();
}

function sanitizeTarget(target: string): string {
  const sanitized = target
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/[\\/]/g, '--')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized.slice(0, 80) || 'lock';
}

function lockPathForTarget(target: string): string {
  const hash = createHash('sha1').update(target).digest('hex').slice(0, 10);
  const safeTarget = sanitizeTarget(target);
  return resolve(LOCKS_DIR, `${safeTarget}--${hash}.json`);
}

function parseNumber(value: string | undefined, flagName: string, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

function parseArgs(argv: string[]): { command: Command; options: CliOptions } {
  const [maybeCommand, ...rest] = argv;
  const command = (maybeCommand ?? 'help') as Command;
  const options: CliOptions = {
    ttlSeconds: DEFAULT_TTL_SECONDS,
    pollSeconds: DEFAULT_POLL_SECONDS,
    wait: false,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    switch (token) {
      case '--target':
        options.target = rest[index + 1];
        index += 1;
        break;
      case '--session':
        options.session = rest[index + 1];
        index += 1;
        break;
      case '--module':
        options.module = rest[index + 1];
        index += 1;
        break;
      case '--owner':
        options.owner = rest[index + 1];
        index += 1;
        break;
      case '--reason':
        options.reason = rest[index + 1];
        index += 1;
        break;
      case '--ttl-seconds':
        options.ttlSeconds = parseNumber(rest[index + 1], '--ttl-seconds', DEFAULT_TTL_SECONDS);
        index += 1;
        break;
      case '--poll-seconds':
        options.pollSeconds = parseNumber(rest[index + 1], '--poll-seconds', DEFAULT_POLL_SECONDS);
        index += 1;
        break;
      case '--wait':
        options.wait = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        return { command: 'help', options };
      default:
        fail(`Unknown argument: ${token}`);
    }
  }

  return { command, options };
}

function readLock(target: string): LockRecord | null {
  const filePath = lockPathForTarget(target);

  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as LockRecord;
}

function readAllLocks(): Array<{ filePath: string; lock: LockRecord; stale: boolean }> {
  ensureLockDirs();

  return readdirSync(LOCKS_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      const filePath = resolve(LOCKS_DIR, entry);
      const lock = JSON.parse(readFileSync(filePath, 'utf8')) as LockRecord;
      return { filePath, lock, stale: isStale(lock) };
    })
    .sort((left, right) => left.lock.target.localeCompare(right.lock.target));
}

function isStale(lock: LockRecord, now = Date.now()): boolean {
  return Date.parse(lock.expiresAt) <= now;
}

function secondsRemaining(lock: LockRecord, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(lock.expiresAt) - now) / 1000));
}

function makeRecord(target: string, options: CliOptions, previous?: LockRecord): LockRecord {
  const now = Date.now();

  return {
    version: 1,
    target,
    session: options.session ?? previous?.session ?? fail('A session id is required.'),
    module: options.module ?? previous?.module ?? 'unspecified',
    owner: options.owner ?? previous?.owner ?? process.env.USER ?? 'unknown',
    reason: options.reason ?? previous?.reason ?? null,
    acquiredAt: previous?.acquiredAt ?? nowIso(now),
    heartbeatAt: nowIso(now),
    expiresAt: expiresIso(options.ttlSeconds, now),
    ttlSeconds: options.ttlSeconds,
    hostname: hostname(),
    pid: process.pid,
    cwd: process.cwd(),
  };
}

function writeLock(target: string, record: LockRecord): void {
  ensureLockDirs();
  const filePath = lockPathForTarget(target);
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function removeLock(target: string): void {
  const filePath = lockPathForTarget(target);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function requireTarget(options: CliOptions): string {
  if (!options.target) {
    fail('A --target is required for this command.');
  }

  return options.target;
}

function requireSession(options: CliOptions): string {
  if (!options.session) {
    fail('A --session is required for this command.');
  }

  return options.session;
}

function print(value: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (typeof value === 'string') {
    console.log(value);
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}

function formatLock(lock: LockRecord, stale = false): string {
  const status = stale ? 'STALE' : 'ACTIVE';
  const remaining = stale ? 'expired' : `${secondsRemaining(lock)}s remaining`;

  return [
    `${status} ${lock.target}`,
    `  session: ${lock.session}`,
    `  module: ${lock.module}`,
    `  owner: ${lock.owner}`,
    `  reason: ${lock.reason ?? 'n/a'}`,
    `  acquired: ${lock.acquiredAt}`,
    `  heartbeat: ${lock.heartbeatAt}`,
    `  expires: ${lock.expiresAt} (${remaining})`,
  ].join('\n');
}

function printHelp(): void {
  console.log(`coverage-lock usage

Commands:
  acquire    Acquire a lock for a shared file or scope
  heartbeat  Refresh a lock you already hold
  release    Release a lock you already hold
  status     Show one lock or all locks
  list       Alias for status
  cleanup    Remove stale lock files

Examples:
  pnpm coverage:lock acquire --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4 --module behaviour --reason "shared RLS mock" --wait
  pnpm coverage:lock heartbeat --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
  pnpm coverage:lock release --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
  pnpm coverage:lock status

Notes:
  - Locks live in coverage-locks/locks/*.json
  - Acquire with --wait to poll until the file becomes free
  - Re-run acquire or heartbeat every 60-90 seconds while you are still editing
  - Use cleanup to remove stale locks left behind by dead sessions`);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function acquire(options: CliOptions): Promise<void> {
  const target = requireTarget(options);
  const session = requireSession(options);
  let lockResolved = false;

  while (!lockResolved) {
    const existing = readLock(target);

    if (!existing) {
      const created = makeRecord(target, options);
      writeLock(target, created);
      print(
        options.json
          ? { status: 'acquired', lock: created }
          : `[coverage-lock] acquired ${target} for session ${session}`,
        options.json,
      );
      return;
    }

    if (existing.session === session) {
      const refreshed = makeRecord(target, options, existing);
      writeLock(target, refreshed);
      print(
        options.json
          ? { status: 'refreshed', lock: refreshed }
          : `[coverage-lock] refreshed ${target} for session ${session}`,
        options.json,
      );
      return;
    }

    if (isStale(existing)) {
      const reclaimed = makeRecord(target, options);
      writeLock(target, reclaimed);
      print(
        options.json
          ? { status: 'reclaimed', staleLock: existing, lock: reclaimed }
          : `[coverage-lock] reclaimed stale lock on ${target} from session ${existing.session}`,
        options.json,
      );
      return;
    }

    if (!options.wait) {
      console.error(`[coverage-lock] lock busy for ${target}`);
      console.error(formatLock(existing));
      process.exit(2);
    }

    console.log(
      `[coverage-lock] waiting ${options.pollSeconds}s for ${target} (held by ${existing.session} / ${existing.module})`,
    );
    await sleep(options.pollSeconds * 1000);
  }
}

function heartbeat(options: CliOptions): void {
  const target = requireTarget(options);
  const session = requireSession(options);
  const existing = readLock(target);

  if (!existing) {
    fail(`No lock exists for ${target}.`);
  }

  if (existing.session !== session && !isStale(existing)) {
    console.error(`[coverage-lock] cannot heartbeat ${target}; it is held by another session`);
    console.error(formatLock(existing));
    process.exit(2);
  }

  const refreshed = makeRecord(target, options, existing);
  writeLock(target, refreshed);
  print(
    options.json
      ? { status: existing.session === session ? 'refreshed' : 'reclaimed', lock: refreshed }
      : `[coverage-lock] refreshed ${target} for session ${session}`,
    options.json,
  );
}

function release(options: CliOptions): void {
  const target = requireTarget(options);
  const session = requireSession(options);
  const existing = readLock(target);

  if (!existing) {
    print(
      options.json
        ? { status: 'already-free', target }
        : `[coverage-lock] ${target} is already free`,
      options.json,
    );
    return;
  }

  if (existing.session !== session && !isStale(existing)) {
    console.error(`[coverage-lock] cannot release ${target}; it is held by another session`);
    console.error(formatLock(existing));
    process.exit(2);
  }

  removeLock(target);
  print(
    options.json
      ? { status: 'released', target, previousSession: existing.session }
      : `[coverage-lock] released ${target} from session ${existing.session}`,
    options.json,
  );
}

function status(options: CliOptions): void {
  if (options.target) {
    const existing = readLock(options.target);

    if (!existing) {
      print(
        options.json
          ? { status: 'free', target: options.target }
          : `[coverage-lock] ${options.target} is free`,
        options.json,
      );
      return;
    }

    print(
      options.json
        ? { status: isStale(existing) ? 'stale' : 'active', lock: existing }
        : formatLock(existing, isStale(existing)),
      options.json,
    );
    return;
  }

  const locks = readAllLocks();

  if (locks.length === 0) {
    print(options.json ? [] : '[coverage-lock] no active or stale locks', options.json);
    return;
  }

  if (options.json) {
    print(
      locks.map(({ lock, stale }) => ({ status: stale ? 'stale' : 'active', lock })),
      true,
    );
    return;
  }

  console.log(locks.map(({ lock, stale }) => formatLock(lock, stale)).join('\n\n'));
}

function cleanup(options: CliOptions): void {
  const locks = readAllLocks();
  const staleLocks = locks.filter(({ stale }) => stale);

  for (const { filePath } of staleLocks) {
    rmSync(filePath);
  }

  print(
    options.json
      ? { removed: staleLocks.length, targets: staleLocks.map(({ lock }) => lock.target) }
      : `[coverage-lock] removed ${staleLocks.length} stale lock(s)`,
    options.json,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'acquire':
      await acquire(options);
      return;
    case 'heartbeat':
      heartbeat(options);
      return;
    case 'release':
      release(options);
      return;
    case 'status':
    case 'list':
      status(options);
      return;
    case 'cleanup':
      cleanup(options);
      return;
    case 'help':
    default:
      printHelp();
  }
}

void main();
