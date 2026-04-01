/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when a service class has too many public methods. Prevents god classes by enforcing a per-class public-method budget.',
    },
    messages: {
      tooManyPublicMethods:
        'Class has {{count}} public methods (max {{max}}). Consider splitting into focused sub-services.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {};
    const max = typeof options.max === 'number' ? options.max : 15;

    /**
     * Count public methods on a class body.
     * Excludes: constructor, private methods (accessibility === 'private' or 'protected'),
     * and methods with private name identifiers (#name).
     */
    function checkClassBody(node) {
      const classNode = node.parent;
      let count = 0;

      for (const member of node.body) {
        // Only MethodDefinition nodes represent class methods
        if (member.type !== 'MethodDefinition') continue;

        // Exclude the constructor
        if (member.kind === 'constructor') continue;

        // Exclude methods with private field name (#foo)
        if (member.key && member.key.type === 'PrivateIdentifier') continue;

        // Exclude private and protected methods (TypeScript accessibility modifiers)
        if (member.accessibility === 'private' || member.accessibility === 'protected') {
          continue;
        }

        count++;
      }

      if (count > max) {
        context.report({
          node: classNode,
          messageId: 'tooManyPublicMethods',
          data: { count, max },
        });
      }
    }

    return {
      ClassBody: checkClassBody,
    };
  },
};
