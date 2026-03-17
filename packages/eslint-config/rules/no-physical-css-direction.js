/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow physical CSS directional classes. Use logical equivalents for RTL support.',
    },
    messages: {
      noPhysicalDirection:
        'Physical CSS class "{{found}}" is prohibited. Use logical equivalent "{{suggestion}}" instead for RTL support.',
    },
    schema: [],
  },
  create(context) {
    const replacements = [
      { pattern: /\bml-/g, suggestion: 'ms-' },
      { pattern: /\bmr-/g, suggestion: 'me-' },
      { pattern: /\bpl-/g, suggestion: 'ps-' },
      { pattern: /\bpr-/g, suggestion: 'pe-' },
      { pattern: /\bleft-/g, suggestion: 'start-' },
      { pattern: /\bright-/g, suggestion: 'end-' },
      { pattern: /\btext-left\b/g, suggestion: 'text-start' },
      { pattern: /\btext-right\b/g, suggestion: 'text-end' },
      { pattern: /\brounded-l-/g, suggestion: 'rounded-s-' },
      { pattern: /\brounded-r-/g, suggestion: 'rounded-e-' },
      { pattern: /\bborder-l-/g, suggestion: 'border-s-' },
      { pattern: /\bborder-r-/g, suggestion: 'border-e-' },
      { pattern: /\bscroll-ml-/g, suggestion: 'scroll-ms-' },
      { pattern: /\bscroll-mr-/g, suggestion: 'scroll-me-' },
      { pattern: /\bscroll-pl-/g, suggestion: 'scroll-ps-' },
      { pattern: /\bscroll-pr-/g, suggestion: 'scroll-pe-' },
    ];

    function checkValue(value, node) {
      for (const { pattern, suggestion } of replacements) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        const match = pattern.exec(value);
        if (match) {
          context.report({
            node,
            messageId: 'noPhysicalDirection',
            data: {
              found: match[0],
              suggestion,
            },
          });
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkValue(node.value, node);
        }
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          checkValue(quasi.value.raw, node);
        }
      },
    };
  },
};
