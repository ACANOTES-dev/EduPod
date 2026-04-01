/**
 * API Surface Generator
 *
 * Scans all *.controller.ts files in apps/api/src/modules/ and extracts:
 * - HTTP method + route path
 * - Controller class name
 * - Module name (directory)
 * - Required permission(s)
 *
 * Outputs a sorted JSON snapshot to api-surface.snapshot.json for diffing on PRs.
 *
 * Usage: npx tsx scripts/generate-api-surface.ts
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, join, relative, resolve } from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiEndpoint {
  method: string;
  path: string;
  controller: string;
  module: string;
  permission: string | string[] | null;
}

interface ControllerBlock {
  className: string;
  basePath: string;
  body: string;
  bodyStart: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;

const PROJECT_ROOT = resolve(__dirname, '..');
const MODULES_DIR = join(PROJECT_ROOT, 'apps', 'api', 'src', 'modules');
const SNAPSHOT_PATH = join(PROJECT_ROOT, 'api-surface.snapshot.json');

// ─── File discovery ──────────────────────────────────────────────────────────

function findControllerFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findControllerFiles(fullPath));
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function extractModuleName(filePath: string): string {
  const rel = relative(MODULES_DIR, filePath);
  return rel.split('/')[0] ?? '';
}

/**
 * Split a file that may contain multiple controller classes into individual blocks.
 * Each block contains the decorators + class body for one controller.
 */
function splitControllerBlocks(content: string): ControllerBlock[] {
  const blocks: ControllerBlock[] = [];

  // Find all @Controller(...) followed by class declarations
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
      bodyStart: current.index,
    });
  }

  return blocks;
}

/**
 * Find the @RequiresPermission decorator that belongs to a specific route method.
 *
 * Strategy: look at the decorator block surrounding the route decorator.
 * The permission can appear before or after the HTTP method decorator,
 * but always within the same method's decorator group (between the previous
 * method's `async/function` keyword and this method's `async/function` keyword).
 */
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

/**
 * Extract all route endpoints from a single controller block.
 *
 * For each HTTP method decorator found, isolate the "method block" which is
 * the text from the end of the previous method signature (or start of class body)
 * up to the current method's signature (the `async` keyword). The permission
 * decorator lives within this block.
 */
function extractEndpointsFromBlock(block: ControllerBlock): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const content = block.body;

  // Collect all route decorator positions with their method info
  interface RouteInfo {
    method: string;
    suffix: string;
    index: number;
    matchEnd: number;
  }

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

  // Sort by position in file
  routes.sort((a, b) => a.index - b.index);

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    const fullPath = buildFullPath(block.basePath, route.suffix);

    // The method block spans from after the previous route's match end
    // to the start of the next route (or end of content).
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
      module: '', // filled in by caller
      permission,
    });
  }

  return endpoints;
}

function buildFullPath(basePath: string, suffix: string): string {
  const base = basePath.replace(/^\/+|\/+$/g, '');
  const suf = suffix.replace(/^\/+|\/+$/g, '');

  if (!base && !suf) return '/';
  if (!base) return `/${suf}`;
  if (!suf) return `/${base}`;
  return `/${base}/${suf}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function generateApiSurface(): ApiEndpoint[] {
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

  // Sort by path, then method for deterministic output
  allEndpoints.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.method.localeCompare(b.method);
  });

  return allEndpoints;
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

const isDirectRun = process.argv[1]?.endsWith('generate-api-surface.ts');

if (isDirectRun) {
  const endpoints = generateApiSurface();
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(endpoints, null, 2) + '\n');
  console.log(
    `API surface snapshot written to ${basename(SNAPSHOT_PATH)} (${endpoints.length} endpoints)`,
  );
}
