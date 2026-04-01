const path = require('path');

// ─── Prohibited raw SQL methods ───────────────────────────────────────────────
const RAW_SQL_METHODS = ['$executeRawUnsafe', '$queryRawUnsafe', '$executeRaw', '$queryRaw'];

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw SQL queries outside RLS middleware files.',
    },
    messages: {
      noRawSql:
        'Raw SQL ({{method}}) is prohibited outside RLS middleware. Move this query to the RLS middleware or a migration file.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const basename = path.basename(filename);
    const normalizedPath = filename.replace(/\\/g, '/');

    // Allow in RLS files, middleware directories, tenant-aware base classes,
    // migration files, seed scripts, SQL files, utility scripts, test files,
    // and worker processors (which use raw PrismaClient and set their own RLS
    // context via set_config — they don't go through the API middleware layer)
    const isAllowed =
      basename.startsWith('rls') ||
      basename.startsWith('tenant-aware') ||
      basename.endsWith('.processor.ts') ||
      normalizedPath.includes('/middleware/') ||
      normalizedPath.includes('/migrations/') ||
      normalizedPath.includes('/seed') ||
      normalizedPath.includes('/scripts/') ||
      normalizedPath.includes('/rules/') ||
      normalizedPath.endsWith('.sql') ||
      normalizedPath.endsWith('.spec.ts') ||
      normalizedPath.endsWith('.test.ts');

    if (isAllowed) return {};

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
