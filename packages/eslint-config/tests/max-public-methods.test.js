const { RuleTester } = require('eslint');
const rule = require('../rules/max-public-methods');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

// Helper: generate a class with N public methods
function classWithPublicMethods(n) {
  const methods = Array.from({ length: n }, (_, i) => `method${i}() {}`).join('\n  ');
  return `class MyService {\n  ${methods}\n}`;
}

// Helper: generate a class with N public methods and explicit return types
function tsClassWithPublicMethods(n) {
  const methods = Array.from({ length: n }, (_, i) => `method${i}(): void {}`).join('\n  ');
  return `class MyService {\n  ${methods}\n}`;
}

ruleTester.run('max-public-methods', rule, {
  valid: [
    // Exactly at the default threshold (15)
    { code: classWithPublicMethods(15) },

    // Below threshold
    { code: classWithPublicMethods(10) },

    // Constructor is not counted
    {
      code: `class MyService {
  constructor(private readonly dep: any) {}
  methodOne(): void {}
}`,
    },

    // Private methods are not counted (TS accessibility)
    {
      code: `class MyService {
  private helper(): void {}
  private anotherHelper(): void {}
  publicMethod(): void {}
}`,
    },

    // Protected methods are not counted
    {
      code: `class MyService {
  protected internalHook(): void {}
  publicMethod(): void {}
}`,
    },

    // Private class fields (#name) are not counted
    {
      code: `class MyService {
  #privateMethod() {}
  publicMethod() {}
}`,
    },

    // Custom threshold: 5 public methods with max: 5 is valid
    {
      code: classWithPublicMethods(5),
      options: [{ max: 5 }],
    },

    // Custom threshold: 20 public methods with max: 20 is valid
    {
      code: classWithPublicMethods(20),
      options: [{ max: 20 }],
    },

    // Class expression within default threshold
    {
      code: `const svc = class { methodA() {} methodB() {} };`,
    },

    // Mixed: private + public stay under threshold
    {
      code: `class MyService {
  private a(): void {}
  private b(): void {}
  private c(): void {}
  pub1(): void {}
  pub2(): void {}
  pub3(): void {}
}`,
    },
  ],

  invalid: [
    // 16 public methods with default threshold (15) — should warn
    {
      code: classWithPublicMethods(16),
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 16, max: 15 } }],
    },

    // 20 public methods with default threshold
    {
      code: classWithPublicMethods(20),
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 20, max: 15 } }],
    },

    // Custom threshold: 6 public methods exceeds max: 5
    {
      code: classWithPublicMethods(6),
      options: [{ max: 5 }],
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 6, max: 5 } }],
    },

    // TypeScript class with TS return types: 16 public methods
    {
      code: tsClassWithPublicMethods(16),
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 16, max: 15 } }],
    },

    // Constructor is excluded — 15 public non-constructor methods + constructor = warn on 16 pub
    {
      code: `class BigService {
  constructor() {}
  ${Array.from({ length: 16 }, (_, i) => `pub${i}(): void {}`).join('\n  ')}
}`,
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 16, max: 15 } }],
    },

    // Private methods don't shield against public method count
    {
      code: `class BigService {
  private helper1(): void {}
  private helper2(): void {}
  ${Array.from({ length: 16 }, (_, i) => `pub${i}(): void {}`).join('\n  ')}
}`,
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 16, max: 15 } }],
    },

    // Class expression also caught
    {
      code: `const svc = class { ${Array.from({ length: 16 }, (_, i) => `m${i}() {}`).join(' ')} };`,
      errors: [{ messageId: 'tooManyPublicMethods', data: { count: 16, max: 15 } }],
    },
  ],
});

console.log('max-public-methods: all tests passed');
