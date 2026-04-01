/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when multiple useState calls resemble hand-rolled form state. Prefer react-hook-form with zodResolver.',
    },
    messages: {
      noHandRolledForms:
        'Consider using react-hook-form with zodResolver instead of individual useState for form fields. See docs/conventions/form-migration.md',
    },
    schema: [],
  },
  create(context) {
    // ─── Form-field name heuristics ───────────────────────────────────────────
    const FORM_FIELD_PATTERNS = [
      'name',
      'email',
      'title',
      'description',
      'value',
      'status',
      'date',
      'amount',
      'notes',
    ];

    let useStateCount = 0;
    let hasFormFieldName = false;
    let hasSubmitHandler = false;

    /** @type {import('eslint').AST.Token | null} */
    let firstFormFieldNode = null;

    /**
     * Check whether a variable name looks like a form field setter or state variable.
     * Matches patterns like: setName, setEmail, name, email, title, description, etc.
     */
    function looksLikeFormField(varName) {
      const lower = varName.toLowerCase();
      return FORM_FIELD_PATTERNS.some((field) => lower === field || lower === `set${field}`);
    }

    return {
      // ─── Track useState calls AND submit handler assignments ──────────────
      VariableDeclarator(node) {
        // Match: const [x, setX] = React.useState(...) or useState(...)
        if (node.init && node.init.type === 'CallExpression' && node.id.type === 'ArrayPattern') {
          const callee = node.init.callee;
          const isUseState =
            // useState(...)
            (callee.type === 'Identifier' && callee.name === 'useState') ||
            // React.useState(...)
            (callee.type === 'MemberExpression' &&
              callee.object.type === 'Identifier' &&
              callee.object.name === 'React' &&
              callee.property.type === 'Identifier' &&
              callee.property.name === 'useState');

          if (isUseState) {
            useStateCount++;

            // Check destructured names for form-field patterns
            for (const element of node.id.elements) {
              if (element && element.type === 'Identifier' && looksLikeFormField(element.name)) {
                hasFormFieldName = true;
                if (!firstFormFieldNode) {
                  firstFormFieldNode = node;
                }
              }
            }
          }
        }

        // Match: const onSubmit = () => {} / const handleSubmit = function() {}
        if (
          node.id.type === 'Identifier' &&
          (node.id.name === 'onSubmit' || node.id.name === 'handleSubmit') &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
        ) {
          hasSubmitHandler = true;
        }
      },

      // ─── Track named function declarations: function onSubmit() {} ────────
      FunctionDeclaration(node) {
        if (node.id) {
          const fnName = node.id.name;
          if (fnName === 'onSubmit' || fnName === 'handleSubmit') {
            hasSubmitHandler = true;
          }
        }
      },

      // ─── Report at end of program ─────────────────────────────────────────
      'Program:exit'() {
        if (useStateCount >= 3 && hasFormFieldName && hasSubmitHandler) {
          context.report({
            node: firstFormFieldNode || context.getSourceCode().ast,
            messageId: 'noHandRolledForms',
          });
        }
      },
    };
  },
};
