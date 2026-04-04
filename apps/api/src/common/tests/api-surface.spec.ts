/**
 * API Surface Snapshot Test
 *
 * Ensures the API surface (routes, methods, permissions) has not changed
 * unintentionally during refactoring. Compares the live-scanned controller
 * surface against the committed snapshot file.
 *
 * If this test fails, it means the API surface has changed. Review the diff
 * carefully:
 *   - If the change is intentional: run `pnpm run snapshot:api` to update
 *   - If the change is unintentional: fix the code
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import { MOCK_FACADE_PROVIDERS } from './mock-facades';

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiEndpoint = {
  method: string;
  path: string;
  controller: string;
  module: string;
  permission: string | string[] | null;
};

type ControllerBlock = {
  className: string;
  basePath: string;
  body: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;

// __dirname = apps/api/src/common/tests -> go up 5 levels to project root
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const MODULES_DIR = resolve(PROJECT_ROOT, 'apps', 'api', 'src', 'modules');
const SNAPSHOT_PATH = resolve(PROJECT_ROOT, 'api-surface.snapshot.json');

// ─── Inline scanner (same logic as scripts/generate-api-surface.ts) ──────────

function findControllerFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findControllerFiles(fullPath));
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractModuleName(filePath: string): string {
  return relative(MODULES_DIR, filePath).split('/')[0] ?? '';
}

function splitControllerBlocks(content: string): ControllerBlock[] {
  const blocks: ControllerBlock[] = [];
  const controllerPattern =
    /@Controller\(\s*['"]([^'"]*)['"]\s*\)[\s\S]*?export\s+class\s+(\w+Controller)/g;
  const matches: Array<{ basePath: string; className: string; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = controllerPattern.exec(content)) !== null) {
    matches.push({
      basePath: m[1] ?? '',
      className: m[2] ?? 'UnknownController',
      index: m.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = i + 1 < matches.length ? matches[i + 1] : undefined;
    const end = next ? next.index : content.length;
    blocks.push({
      className: current.className,
      basePath: current.basePath,
      body: content.substring(current.index, end),
    });
  }

  return blocks;
}

function findPermissionInMethodBlock(methodBlock: string): string | string[] | null {
  const permRegex =
    /@RequiresPermission\(\s*((?:'[^']*'(?:\s*,\s*'[^']*')*)|(?:"[^"]*"(?:\s*,\s*"[^"]*")*))\s*\)/;
  const match = permRegex.exec(methodBlock);
  if (!match) return null;

  const rawPerms = match[1] ?? '';
  const perms: string[] = [];
  const singlePermRegex = /['"]([^'"]+)['"]/g;
  let pm: RegExpExecArray | null;
  while ((pm = singlePermRegex.exec(rawPerms)) !== null) {
    const captured = pm[1];
    if (captured) perms.push(captured);
  }

  if (perms.length === 0) return null;
  if (perms.length === 1) return perms[0] ?? null;
  return perms;
}

function buildFullPath(basePath: string, suffix: string): string {
  const base = basePath.replace(/^\/+|\/+$/g, '');
  const suf = suffix.replace(/^\/+|\/+$/g, '');
  if (!base && !suf) return '/';
  if (!base) return `/${suf}`;
  if (!suf) return `/${base}`;
  return `/${base}/${suf}`;
}

function extractEndpointsFromBlock(block: ControllerBlock): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const content = block.body;

  type RouteInfo = {
    method: string;
    suffix: string;
    index: number;
    matchEnd: number;
  };

  const routes: RouteInfo[] = [];
  for (const method of HTTP_METHODS) {
    const routeRegex = new RegExp(`@${method}\\(\\s*(?:['"]([^'"]*)['"'])?\\s*\\)`, 'g');
    let routeMatch: RegExpExecArray | null;
    while ((routeMatch = routeRegex.exec(content)) !== null) {
      routes.push({
        method: method.toUpperCase(),
        suffix: routeMatch[1] ?? '',
        index: routeMatch.index,
        matchEnd: routeMatch.index + routeMatch[0].length,
      });
    }
  }

  routes.sort((a, b) => a.index - b.index);

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const fullPath = buildFullPath(block.basePath, route.suffix);
    const prev = i > 0 ? routes[i - 1] : undefined;
    const next = i + 1 < routes.length ? routes[i + 1] : undefined;
    const blockStart = prev ? prev.matchEnd : 0;
    const blockEnd = next ? next.index : content.length;
    const methodBlock = content.substring(blockStart, blockEnd);
    const permission = findPermissionInMethodBlock(methodBlock);

    endpoints.push({
      method: route.method,
      path: fullPath,
      controller: block.className,
      module: '',
      permission,
    });
  }

  return endpoints;
}

function scanCurrentApiSurface(): ApiEndpoint[] {
  const controllerFiles = findControllerFiles(MODULES_DIR);
  const allEndpoints: ApiEndpoint[] = [];

  for (const filePath of controllerFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const moduleName = extractModuleName(filePath);
    const blocks = splitControllerBlocks(content);

    for (const block of blocks) {
      const endpoints = extractEndpointsFromBlock(block);
      for (const endpoint of endpoints) {
        endpoint.module = moduleName;
        allEndpoints.push(endpoint);
      }
    }
  }

  allEndpoints.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.method.localeCompare(b.method);
  });

  return allEndpoints;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('API Surface Snapshot', () => {
  it('should have a committed snapshot file', () => {
    expect(existsSync(SNAPSHOT_PATH)).toBe(true);
  });

  it('should match the committed snapshot', () => {
    if (!existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        'api-surface.snapshot.json does not exist. Run `pnpm run snapshot:api` to generate it.',
      );
    }

    const snapshotContent = readFileSync(SNAPSHOT_PATH, 'utf-8');
    const snapshot: ApiEndpoint[] = JSON.parse(snapshotContent);
    const current = scanCurrentApiSurface();

    // Build lookup maps for better diff output
    const endpointKey = (e: ApiEndpoint) => `${e.method} ${e.path} [${e.controller}]`;
    const snapshotSet = new Set(snapshot.map(endpointKey));
    const currentSet = new Set(current.map(endpointKey));

    const added = current.filter((e) => !snapshotSet.has(endpointKey(e)));
    const removed = snapshot.filter((e) => !currentSet.has(endpointKey(e)));

    // Check for permission changes on endpoints that exist in both
    const currentMap = new Map(current.map((e) => [endpointKey(e), e]));
    const permissionChanged = snapshot.filter((e) => {
      const key = endpointKey(e);
      const cur = currentMap.get(key);
      if (!cur) return false;
      return JSON.stringify(e.permission) !== JSON.stringify(cur.permission);
    });

    if (added.length > 0 || removed.length > 0 || permissionChanged.length > 0) {
      const lines: string[] = [
        'API surface has changed. Run `pnpm run snapshot:api` to update the snapshot after reviewing changes.',
        '',
      ];

      if (added.length > 0) {
        lines.push(`ADDED (${added.length}):`);
        added.forEach((e) =>
          lines.push(
            `  + ${e.method} ${e.path} [${e.controller}] permission=${JSON.stringify(e.permission)}`,
          ),
        );
        lines.push('');
      }

      if (removed.length > 0) {
        lines.push(`REMOVED (${removed.length}):`);
        removed.forEach((e) =>
          lines.push(
            `  - ${e.method} ${e.path} [${e.controller}] permission=${JSON.stringify(e.permission)}`,
          ),
        );
        lines.push('');
      }

      if (permissionChanged.length > 0) {
        lines.push(`PERMISSION CHANGED (${permissionChanged.length}):`);
        permissionChanged.forEach((e) => {
          const cur = currentMap.get(endpointKey(e));
          lines.push(
            `  ~ ${e.method} ${e.path}: ${JSON.stringify(e.permission)} -> ${JSON.stringify(cur?.permission)}`,
          );
        });
        lines.push('');
      }

      throw new Error(lines.join('\n'));
    }

    // Also verify total count matches (catches duplicates)
    expect(current.length).toBe(snapshot.length);
  });

  it('should detect all controller files', () => {
    const current = scanCurrentApiSurface();
    // Sanity check: we should have a non-trivial number of endpoints
    expect(current.length).toBeGreaterThan(50);
  });
});
