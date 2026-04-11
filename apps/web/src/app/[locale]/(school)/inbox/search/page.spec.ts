import { sanitiseSnippet } from './page';

describe('sanitiseSnippet', () => {
  it('preserves <mark> and </mark> tags emitted by ts_headline', () => {
    const input = 'Hello <mark>world</mark>, how are you?';
    expect(sanitiseSnippet(input)).toBe('Hello <mark>world</mark>, how are you?');
  });

  it('escapes angle brackets outside the allowlist', () => {
    const input = '<script>alert(1)</script> and <mark>safe</mark>';
    const out = sanitiseSnippet(input);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<mark>safe</mark>');
  });

  it('escapes ampersands before re-allowing <mark>', () => {
    const input = 'a & <mark>b</mark>';
    expect(sanitiseSnippet(input)).toBe('a &amp; <mark>b</mark>');
  });

  it('escapes quotes so they cannot break attributes', () => {
    const input = '"quoted" <mark>match</mark>';
    expect(sanitiseSnippet(input)).toBe('&quot;quoted&quot; <mark>match</mark>');
  });
});
