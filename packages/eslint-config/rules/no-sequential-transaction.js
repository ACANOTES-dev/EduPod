/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow sequential/array-based Prisma $transaction calls. Use interactive transactions instead.',
    },
    messages: {
      noSequentialTransaction:
        'Sequential $transaction([...]) is prohibited. Use interactive $transaction(async (tx) => { ... }) instead. PgBouncer transaction mode requires connection affinity.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // Match: *.$transaction([...])
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === '$transaction' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'ArrayExpression'
        ) {
          context.report({
            node,
            messageId: 'noSequentialTransaction',
          });
        }
      },
    };
  },
};
