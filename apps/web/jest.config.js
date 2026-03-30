/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  // Only pick up plain .spec.ts files — e2e and visual specs live under e2e/ and are handled by Playwright
  testRegex: 'src/.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    // Path aliases from tsconfig
    '^@/(.*)$': '<rootDir>/src/$1',
    // Workspace packages — resolve to their source
    '^@school/ui$': '<rootDir>/../../packages/ui/src',
    '^@school/ui/(.*)$': '<rootDir>/../../packages/ui/src/$1',
    '^@school/shared$': '<rootDir>/../../packages/shared/src',
    '^@school/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    // Stub out Next.js and third-party browser modules — not needed for pure-logic tests
    '^next/navigation$': '<rootDir>/src/__mocks__/next-navigation.ts',
    '^next-intl$': '<rootDir>/src/__mocks__/next-intl.ts',
    '^next-themes$': '<rootDir>/src/__mocks__/next-themes.ts',
    // CSS / image imports
    '\\.(css|scss|png|jpg|svg)$': '<rootDir>/src/__mocks__/file-stub.ts',
  },
};
