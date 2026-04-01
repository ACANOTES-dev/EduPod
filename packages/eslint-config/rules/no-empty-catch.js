/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow empty catch blocks. Every catch must handle the error with toast.error(), console.error(), or a structured logger call.',
    },
    messages: {
      noEmptyCatch:
        'Empty catch blocks are prohibited. Add error handling: toast.error(), console.error(), or a structured logger call.',
    },
    schema: [],
  },
  create(context) {
    return {
      CatchClause(node) {
        const body = node.body;

        // Flag completely empty block: catch (e) {}
        if (body.body.length === 0) {
          context.report({ node, messageId: 'noEmptyCatch' });
          return;
        }

        // Flag block whose only content is comments (no actual statements).
        // ESLint AST nodes do not represent comments as children of BlockStatement.body,
        // so a block with only comments will still have body.length === 0 after parsing.
        // The check above already handles that case — body.length === 0 covers it.
      },
    };
  },
};
