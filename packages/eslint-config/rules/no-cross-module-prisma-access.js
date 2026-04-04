const path = require('path');
const fs = require('fs');

// ─── Module boundary segments ─────────────────────────────────────────────────
const MODULES_SEGMENT = '/modules/';

// ─── Load module ownership registry ───────────────────────────────────────────
// Maps each Prisma model name to its owning NestJS module.
// Source: docs/architecture/module-ownership.json

let modelToModule = null;

function loadOwnershipRegistry() {
  if (modelToModule !== null) return modelToModule;

  modelToModule = new Map();

  const registryPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'architecture',
    'module-ownership.json',
  );

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content);

    for (const [moduleName, moduleConfig] of Object.entries(registry.modules)) {
      for (const model of moduleConfig.ownedModels) {
        modelToModule.set(model, moduleName);
      }
    }
  } catch {
    // If the registry cannot be loaded, rule is inert (no models to enforce)
  }

  return modelToModule;
}

/**
 * Extract the module name from a file path inside apps/api/src/modules/.
 * Returns null if the file is not inside a module directory.
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

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect cross-module Prisma model access. Services should use ReadFacades instead of directly querying models owned by other modules.',
    },
    messages: {
      crossModulePrismaAccess:
        "Direct Prisma access to '{{ model }}' (owned by '{{ ownerModule }}') from '{{ currentModule }}' module. Use the owning module's ReadFacade instead.",
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

    // ─── Spec files are exempt — tests legitimately reach across modules ────────
    if (normalizedPath.endsWith('.spec.ts') || normalizedPath.endsWith('.test.ts')) return {};

    const registry = loadOwnershipRegistry();
    if (registry.size === 0) return {};

    return {
      MemberExpression(node) {
        // Match pattern: this.prisma.<modelName>
        // AST shape:
        //   MemberExpression {
        //     object: MemberExpression {
        //       object: ThisExpression,
        //       property: Identifier { name: 'prisma' }
        //     },
        //     property: Identifier { name: <modelName> }
        //   }
        if (
          node.object &&
          node.object.type === 'MemberExpression' &&
          node.object.object &&
          node.object.object.type === 'ThisExpression' &&
          node.object.property &&
          node.object.property.name === 'prisma' &&
          node.property &&
          node.property.type === 'Identifier'
        ) {
          const modelName = node.property.name;

          // Skip Prisma utility methods ($transaction, $connect, $disconnect, etc.)
          if (modelName.startsWith('$')) return;

          const ownerModule = registry.get(modelName);

          // Model not in registry — skip (unregistered or shared-kernel)
          if (!ownerModule) return;

          // Same-module access — always allowed
          if (ownerModule === currentModule) return;

          context.report({
            node: node.property,
            messageId: 'crossModulePrismaAccess',
            data: {
              model: modelName,
              ownerModule,
              currentModule,
            },
          });
        }
      },
    };
  },
};
