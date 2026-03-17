const { RuleTester } = require('eslint');
const rule = require('../rules/no-physical-css-direction');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run('no-physical-css-direction', rule, {
  valid: [
    // Logical classes (allowed)
    { code: `const cls = "ms-4 me-2 ps-3 pe-4";` },
    { code: `const cls = "text-start text-end";` },
    { code: `const cls = "rounded-s-lg rounded-e-lg";` },
    { code: `const cls = "border-s-2 border-e-2";` },
    // Template literal with logical classes
    { code: 'const cls = `ms-${size} me-2`;' },
  ],
  invalid: [
    { code: `const cls = "ml-4";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "mr-2";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "pl-4";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "pr-2";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "text-left";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "text-right";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "rounded-l-lg";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "rounded-r-lg";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "border-l-2";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    { code: `const cls = "border-r-2";`, errors: [{ messageId: 'noPhysicalDirection' }] },
    // Template literal
    { code: 'const cls = `ml-4 p-2`;', errors: [{ messageId: 'noPhysicalDirection' }] },
  ],
});

console.log('no-physical-css-direction: all tests passed');
