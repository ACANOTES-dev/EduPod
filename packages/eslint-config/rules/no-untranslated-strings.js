/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect hardcoded human-facing strings in JSX that are not wrapped in a translation function t().',
    },
    messages: {
      untranslatedString: 'Hardcoded string detected. Wrap in t() for i18n support.',
    },
    schema: [],
  },
  create(context) {
    // ─── Allowlisted JSX attribute names (non-human-facing) ───────────────────
    const SAFE_ATTRIBUTES = new Set([
      'className',
      'href',
      'src',
      'type',
      'name',
      'id',
      'key',
      'htmlFor',
      'role',
      'method',
      'action',
      'target',
      'rel',
      'as',
      'crossOrigin',
      'integrity',
      'media',
      'sizes',
      'srcSet',
      'value',
      'defaultValue',
      'autoComplete',
      'inputMode',
      'pattern',
      'accept',
      'dir',
      'lang',
      'slot',
      'tabIndex',
      'style',
      'dangerouslySetInnerHTML',
      'suppressHydrationWarning',
      'xmlns',
      'viewBox',
      'fill',
      'stroke',
      'strokeWidth',
      'd',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'x',
      'y',
      'width',
      'height',
      'transform',
      'clipPath',
      'clipRule',
      'fillRule',
      'strokeLinecap',
      'strokeLinejoin',
    ]);

    // ─── Human-facing attributes that SHOULD be translated ────────────────────
    const HUMAN_FACING_ATTRIBUTES = new Set([
      'placeholder',
      'title',
      'label',
      'aria-label',
      'aria-placeholder',
      'aria-roledescription',
      'aria-valuetext',
      'alt',
    ]);

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Check if file is inside a (platform)/ route (English-only admin) */
    function isPlatformRoute() {
      const filename = context.getFilename();
      return filename.includes('(platform)');
    }

    /** Returns true when the string is NOT human-readable text */
    function isNonHumanString(value) {
      const trimmed = value.trim();

      // Empty or whitespace-only
      if (trimmed.length === 0) return true;

      // Single character
      if (trimmed.length === 1) return true;

      // Pure numbers / dates / timestamps
      if (/^[\d.,/:;\-\s]+$/.test(trimmed)) return true;

      // Looks like a CSS class list (all lowercase/hyphens/numbers with spaces)
      if (/^[a-z0-9\-_\s./]+$/.test(trimmed) && trimmed.includes('-')) return true;

      // Looks like a URL or file path
      if (/^(https?:|\/|\.\/|\.\.\/)/.test(trimmed)) return true;

      // Looks like an email address
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return true;

      // Looks like a template / interpolation variable (e.g., {{ name }})
      if (/^\{\{.*\}\}$/.test(trimmed)) return true;

      // Looks like a data key / enum value (snake_case or dot.separated)
      if (/^[a-z][a-z0-9]*([._][a-z0-9]+)+$/.test(trimmed)) return true;

      // camelCase identifiers (no spaces, starts lowercase, has uppercase)
      if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed) && /[A-Z]/.test(trimmed)) return true;

      // Does not contain 2+ consecutive word characters (just punctuation/symbols)
      if (!/\w{2,}/.test(trimmed)) return true;

      return false;
    }

    /** Check if a node is inside a t() or similar translation call */
    function isInsideTranslationCall(node) {
      let parent = node.parent;
      while (parent) {
        if (
          parent.type === 'CallExpression' &&
          parent.callee &&
          ((parent.callee.type === 'Identifier' && parent.callee.name === 't') ||
            (parent.callee.type === 'MemberExpression' &&
              parent.callee.property &&
              parent.callee.property.name === 't'))
        ) {
          return true;
        }
        parent = parent.parent;
      }
      return false;
    }

    /** Check if node is a JSX attribute value for a non-human-facing attribute */
    function isSafeJSXAttribute(node) {
      const parent = node.parent;
      if (!parent) return false;

      // Direct JSX attribute value: <Comp prop="string" />
      if (parent.type === 'JSXAttribute') {
        const attrName = parent.name && parent.name.name;
        if (!attrName) return false;

        // data-* attributes are always safe
        if (typeof attrName === 'string' && attrName.startsWith('data-')) return true;

        // Known safe attributes
        if (SAFE_ATTRIBUTES.has(attrName)) return true;

        // If it IS a human-facing attribute, it is not safe
        if (HUMAN_FACING_ATTRIBUTES.has(attrName)) return false;

        // For unknown attributes, allow them (low false positive rate)
        return true;
      }

      // Inside a JSXExpressionContainer inside a JSXAttribute
      if (
        parent.type === 'JSXExpressionContainer' &&
        parent.parent &&
        parent.parent.type === 'JSXAttribute'
      ) {
        const attrName = parent.parent.name && parent.parent.name.name;
        if (!attrName) return false;
        if (typeof attrName === 'string' && attrName.startsWith('data-')) return true;
        if (SAFE_ATTRIBUTES.has(attrName)) return true;
        if (HUMAN_FACING_ATTRIBUTES.has(attrName)) return false;
        return true;
      }

      return false;
    }

    // ─── Skip platform routes entirely ────────────────────────────────────────
    if (isPlatformRoute()) {
      return {};
    }

    return {
      // ─── JSXText: text content between tags ──────────────────────────────
      JSXText(node) {
        const value = node.value;
        if (isNonHumanString(value)) return;

        context.report({
          node,
          messageId: 'untranslatedString',
        });
      },

      // ─── Literal strings in JSX context ──────────────────────────────────
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (isNonHumanString(node.value)) return;
        if (isInsideTranslationCall(node)) return;
        if (isSafeJSXAttribute(node)) return;

        // Only flag literals that are in JSX context
        const parent = node.parent;
        if (!parent) return;

        // Direct JSX attribute value
        if (parent.type === 'JSXAttribute') {
          const attrName = parent.name && parent.name.name;
          if (HUMAN_FACING_ATTRIBUTES.has(attrName)) {
            context.report({ node, messageId: 'untranslatedString' });
          }
          return;
        }

        // Inside JSXExpressionContainer
        if (parent.type === 'JSXExpressionContainer') {
          // Check if the container is in a JSX attribute
          if (parent.parent && parent.parent.type === 'JSXAttribute') {
            const attrName = parent.parent.name && parent.parent.name.name;
            if (HUMAN_FACING_ATTRIBUTES.has(attrName)) {
              context.report({ node, messageId: 'untranslatedString' });
            }
            return;
          }

          // Container is a child of a JSXElement (inline expression content)
          if (
            parent.parent &&
            (parent.parent.type === 'JSXElement' || parent.parent.type === 'JSXFragment')
          ) {
            context.report({ node, messageId: 'untranslatedString' });
          }
          return;
        }
      },
    };
  },
};
