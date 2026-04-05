/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'school'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        pathGroups: [
          { pattern: '@school/**', group: 'internal', position: 'before' },
          { pattern: '@/**', group: 'internal', position: 'after' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'school/no-empty-catch': 'error',
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx', '**/*.e2e-spec.ts'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'warn',
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', '.next/', 'coverage/'],
};
