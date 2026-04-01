const { RuleTester } = require('eslint');
const rule = require('../rules/no-empty-catch');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-empty-catch', rule, {
  valid: [
    // catch block with console.error (allowed)
    {
      code: `try { doSomething(); } catch (e) { console.error('[handler]', e); }`,
    },
    // catch block with throw (allowed)
    {
      code: `try { doSomething(); } catch (e) { throw e; }`,
    },
    // catch block with a function call (allowed)
    {
      code: `try { doSomething(); } catch (err) { logger.error(err); }`,
    },
    // catch block with toast.error (allowed)
    {
      code: `try { doSomething(); } catch (e) { toast.error('Something went wrong'); }`,
    },
  ],
  invalid: [
    // completely empty catch block
    {
      code: `try { doSomething(); } catch (e) {}`,
      errors: [{ messageId: 'noEmptyCatch' }],
    },
    // catch block with only a comment
    {
      code: `try { doSomething(); } catch (e) { /* ignore */ }`,
      errors: [{ messageId: 'noEmptyCatch' }],
    },
    // catch block with only a line comment
    {
      code: `try { doSomething(); } catch (e) { // intentionally ignored\n}`,
      errors: [{ messageId: 'noEmptyCatch' }],
    },
    // ES2019 optional catch binding (no parameter)
    {
      code: `try { doSomething(); } catch {}`,
      errors: [{ messageId: 'noEmptyCatch' }],
    },
  ],
});

console.log('no-empty-catch: all tests passed');
