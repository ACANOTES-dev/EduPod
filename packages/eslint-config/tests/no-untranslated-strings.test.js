const { RuleTester } = require('eslint');
const rule = require('../rules/no-untranslated-strings');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run('no-untranslated-strings', rule, {
  valid: [
    // ─── Translation function usage ─────────────────────────────────────────
    { code: `<div>{t('greeting')}</div>` },
    { code: `<input placeholder={t('enterName')} />` },
    { code: `<div title={t('tooltip')} />` },

    // ─── Safe attributes (className, href, src, etc.) ───────────────────────
    { code: `<div className="Hello World" />` },
    { code: `<a href="https://example.com">{t('link')}</a>` },
    { code: `<img src="/images/logo.png" />` },
    { code: `<input type="text" />` },
    { code: `<input name="firstName" />` },
    { code: `<div id="main-content" />` },
    { code: `<div key="item-1" />` },
    { code: `<div data-testid="submit-button" />` },
    { code: `<div data-custom="Hello World" />` },
    { code: `<div role="button" />` },

    // ─── Non-human strings (numbers, dates, single chars, punctuation) ──────
    { code: `<div>42</div>` },
    { code: `<span>:</span>` },
    { code: `<span> </span>` },
    { code: `<div>  </div>` },
    { code: `<span>|</span>` },

    // ─── CSS-like class strings ─────────────────────────────────────────────
    { code: `<div className="flex-1 min-w-0 overflow-hidden" />` },

    // ─── URL / path strings ─────────────────────────────────────────────────
    { code: `<a href="https://api.school.com/v1/students">{t('go')}</a>` },

    // ─── Data key / enum strings ────────────────────────────────────────────
    { code: `<div>{status.student_name}</div>` },

    // ─── Non-JSX string literals (should not be flagged) ────────────────────
    { code: `const msg = "Hello World";` },
    { code: `console.log("Some message");` },
    { code: `function foo() { return "Hello"; }` },

    // ─── Platform route files (English-only, exempt) ────────────────────────
    {
      code: `<div>Hello World</div>`,
      filename: '/app/[locale]/(platform)/admin/page.tsx',
    },
    {
      code: `<input placeholder="Search users" />`,
      filename: '/app/[locale]/(platform)/settings/page.tsx',
    },

    // ─── Unknown attributes default to safe ─────────────────────────────────
    { code: `<CustomComponent myProp="Hello World" />` },
    { code: `<Input variant="Hello World" />` },

    // ─── JSXText that is just whitespace or newlines ────────────────────────
    { code: `<div>\n  \n</div>` },
    { code: `<div>   </div>` },

    // ─── Strings inside t() in attribute expressions ────────────────────────
    { code: `<input placeholder={t('search_placeholder')} />` },
    { code: `<div aria-label={t('close_button')} />` },
  ],

  invalid: [
    // ─── JSXText with human-readable content ────────────────────────────────
    {
      code: `<div>Hello World</div>`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<span>Submit Form</span>`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<p>Welcome to our school</p>`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<button>Save Changes</button>`,
      errors: [{ messageId: 'untranslatedString' }],
    },

    // ─── Human-facing attributes without t() ────────────────────────────────
    {
      code: `<input placeholder="Enter your name" />`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<div title="Click to expand" />`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<div aria-label="Close dialog" />`,
      errors: [{ messageId: 'untranslatedString' }],
    },
    {
      code: `<img alt="Student photo" />`,
      errors: [{ messageId: 'untranslatedString' }],
    },

    // ─── String literal in JSXExpressionContainer (child content) ───────────
    {
      code: `<div>{"Hello World"}</div>`,
      errors: [{ messageId: 'untranslatedString' }],
    },

    // ─── Human-facing attribute via expression container ────────────────────
    {
      code: `<input placeholder={"Enter name"} />`,
      errors: [{ messageId: 'untranslatedString' }],
    },
  ],
});

console.log('no-untranslated-strings: all tests passed');
