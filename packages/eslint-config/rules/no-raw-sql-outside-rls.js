const path = require('path');

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

    // Allow in RLS files, middleware directories, and tenant-aware base classes
    const isAllowed =
      basename.startsWith('rls') ||
      basename.startsWith('tenant-aware') ||
      normalizedPath.includes('/middleware/') ||
      normalizedPath.includes('/migrations/') ||
      normalizedPath.includes('/seed') ||
      normalizedPath.endsWith('.sql');

    if (isAllowed) return {};

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ['$executeRawUnsafe', '$queryRawUnsafe'].includes(node.callee.property.name)
        ) {
          context.report({
            node,
            messageId: 'noRawSql',
            data: { method: node.callee.property.name },
          });
        }
      },
    };
  },
};
