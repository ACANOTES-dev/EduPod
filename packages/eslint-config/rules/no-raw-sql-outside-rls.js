const path = require('path');
const fs = require('fs');

// ─── Prohibited raw SQL methods ───────────────────────────────────────────────
const RAW_SQL_METHODS = ['$executeRawUnsafe', '$queryRawUnsafe', '$executeRaw', '$queryRaw'];

// ─── Load allowlist ───────────────────────────────────────────────────────────
const ALLOWLIST_PATH = path.resolve(__dirname, '..', 'raw-sql-allowlist.json');
let allowlistedFiles = new Set();
try {
  const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.allowlist)) {
    for (const entry of parsed.allowlist) {
      if (entry.file) {
        allowlistedFiles.add(entry.file);
      }
    }
  }
} catch {
  // If the allowlist cannot be loaded, no files are allowlisted
}

/**
 * Resolve the file path relative to the repo root by stripping everything
 * up to and including the repo root directory marker. Falls back to the
 * normalised full path if no repo root marker is found.
 */
function toRepoRelative(filename) {
  const normalised = filename.replace(/\\/g, '/');

  // Walk up looking for package.json + turbo.json as repo root indicator
  let dir = path.dirname(filename);
  for (let i = 0; i < 20; i++) {
    const turboPath = path.join(dir, 'turbo.json');
    try {
      fs.statSync(turboPath);
      // Found the repo root
      const root = dir.replace(/\\/g, '/');
      const rel = normalised.startsWith(root + '/')
        ? normalised.slice(root.length + 1)
        : normalised;
      return rel;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return normalised;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw SQL queries outside files governed by the raw-sql-allowlist.json.',
    },
    messages: {
      noRawSql:
        'Raw SQL ({{method}}) is not governed by the allowlist. Add this file to packages/eslint-config/raw-sql-allowlist.json with a documented reason, or move the query to an allowlisted file.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const normalizedPath = filename.replace(/\\/g, '/');

    // ─── Auto-allowed categories ──────────────────────────────────────────────
    // Test files, migration files, seed files, and SQL files are always allowed
    const isAutoAllowed =
      normalizedPath.endsWith('.spec.ts') ||
      normalizedPath.endsWith('.test.ts') ||
      normalizedPath.includes('/migrations/') ||
      normalizedPath.includes('/seed') ||
      normalizedPath.endsWith('.sql');

    if (isAutoAllowed) return {};

    // ─── Allowlist check ──────────────────────────────────────────────────────
    const repoRelative = toRepoRelative(filename);
    if (allowlistedFiles.has(repoRelative)) return {};

    /**
     * Check whether a MemberExpression property is a prohibited raw SQL method.
     * Returns the method name if prohibited, or null otherwise.
     */
    function getProhibitedMethod(memberExpr) {
      if (
        memberExpr.type === 'MemberExpression' &&
        memberExpr.property.type === 'Identifier' &&
        RAW_SQL_METHODS.includes(memberExpr.property.name)
      ) {
        return memberExpr.property.name;
      }
      return null;
    }

    return {
      // Catches: prisma.$executeRawUnsafe('...'), prisma.$queryRawUnsafe('...'),
      //          prisma.$executeRaw(Prisma.sql`...`), prisma.$queryRaw(Prisma.sql`...`)
      CallExpression(node) {
        const method = getProhibitedMethod(node.callee);
        if (method) {
          context.report({ node, messageId: 'noRawSql', data: { method } });
        }
      },

      // Catches: prisma.$executeRaw`SELECT ...`, prisma.$queryRaw`SELECT ...`
      TaggedTemplateExpression(node) {
        const method = getProhibitedMethod(node.tag);
        if (method) {
          context.report({ node, messageId: 'noRawSql', data: { method } });
        }
      },
    };
  },
};
