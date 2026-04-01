const path = require('path');

// ─── Module boundary segments ─────────────────────────────────────────────────
const MODULES_SEGMENT = '/modules/';

// Infrastructure modules that every domain module legitimately imports from.
// These are shared plumbing, not domain boundaries — skip enforcement.
const INFRASTRUCTURE_MODULES = new Set([
  'prisma',
  'redis',
  's3',
  'audit-log',
  'auth',
  'config',
  'common',
]);

/**
 * Extract the module name from a file path inside apps/api/src/modules/.
 * Returns null if the file is not inside a module directory.
 *
 * Examples:
 *   "apps/api/src/modules/finance/invoices.service.ts" → "finance"
 *   "apps/api/src/modules/students/dto/create-student.dto.ts" → "students"
 *   "apps/api/src/common/guards/auth.guard.ts" → null
 */
function getModuleName(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.indexOf(MODULES_SEGMENT);
  if (idx === -1) return null;

  const afterModules = normalized.slice(idx + MODULES_SEGMENT.length);
  const slashIdx = afterModules.indexOf('/');
  if (slashIdx === -1) return null;

  return afterModules.slice(0, slashIdx);
}

/**
 * Resolve a relative import path against the importing file's directory
 * and extract the target module name (if any).
 *
 * Returns { moduleName, isModuleFile } where isModuleFile is true
 * when the import target is a *.module.ts file.
 */
function resolveImportTarget(importSource, importerPath) {
  if (!importSource.startsWith('.')) return null;

  const importerDir = path.dirname(importerPath);
  const resolved = path.resolve(importerDir, importSource).replace(/\\/g, '/');

  const idx = resolved.indexOf(MODULES_SEGMENT);
  if (idx === -1) return null;

  const afterModules = resolved.slice(idx + MODULES_SEGMENT.length);
  const slashIdx = afterModules.indexOf('/');

  // Importing the module directory itself (unlikely but safe)
  const moduleName = slashIdx === -1 ? afterModules : afterModules.slice(0, slashIdx);
  const remainder = slashIdx === -1 ? '' : afterModules.slice(slashIdx);

  // Check if the import target is a .module.ts file (NestJS module registration)
  const isModuleFile = /\.module(?:\.ts)?$/.test(remainder) || /\/[^/]+\.module$/.test(resolved);

  return { moduleName, isModuleFile };
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent importing internal files from other NestJS modules. Use NestJS DI via module imports instead.',
    },
    messages: {
      crossModuleImport:
        "Direct import from '{{ targetModule }}' module internals. Use NestJS DI via module imports instead, or use 'import type' for type-only imports.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const normalizedPath = filename.replace(/\\/g, '/');

    // Only apply to files inside apps/api/src/modules/
    if (!normalizedPath.includes(MODULES_SEGMENT)) return {};

    const currentModule = getModuleName(normalizedPath);
    if (!currentModule) return {};

    // ─── Spec files are exempt — tests often reach across modules for fixtures ──
    if (normalizedPath.endsWith('.spec.ts') || normalizedPath.endsWith('.test.ts')) return {};

    function checkImport(node, source) {
      if (!source || !source.startsWith('.')) return;

      const target = resolveImportTarget(source, filename);
      if (!target) return;

      // Same module — always allowed
      if (target.moduleName === currentModule) return;

      // Infrastructure modules — always allowed (shared plumbing)
      if (INFRASTRUCTURE_MODULES.has(target.moduleName)) return;

      // *.module.ts imports are allowed (NestJS module registration)
      if (target.isModuleFile) return;

      // Type-only imports are allowed — no runtime coupling
      if (node.importKind === 'type') return;

      context.report({
        node,
        messageId: 'crossModuleImport',
        data: { targetModule: target.moduleName },
      });
    }

    return {
      ImportDeclaration(node) {
        checkImport(node, node.source.value);
      },
    };
  },
};
