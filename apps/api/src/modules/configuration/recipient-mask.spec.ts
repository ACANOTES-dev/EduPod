import { maskEmailRecipient, maskPhoneRecipient } from './recipient-mask';

describe('maskEmailRecipient', () => {
  it('masks normal emails preserving first + last char of local + full domain', () => {
    expect(maskEmailRecipient('john.smith@school.test')).toMatch(/^j[*]+h@school\.test$/);
  });
  it('masks 2-char locals with single star', () => {
    expect(maskEmailRecipient('jp@school.test')).toBe('j*@school.test');
  });
  it('masks 1-char locals', () => {
    expect(maskEmailRecipient('a@b.test')).toBe('a*@b.test');
  });
  it('returns *** for empty input', () => {
    expect(maskEmailRecipient('')).toBe('***');
  });
  it('returns *** for input with no @', () => {
    expect(maskEmailRecipient('not-an-email')).toBe('***');
  });
  it('preserves the full domain', () => {
    expect(maskEmailRecipient('john.smith@example.org')).toContain('@example.org');
  });
});

describe('maskPhoneRecipient', () => {
  it('keeps country prefix + last 4', () => {
    expect(maskPhoneRecipient('+447912345678')).toMatch(/^\+4479[*]+5678$/);
  });
  it('handles US numbers', () => {
    expect(maskPhoneRecipient('+15555550100')).toMatch(/^\+1555[*]+0100$/);
  });
  it('returns *** for short input', () => {
    expect(maskPhoneRecipient('short')).toBe('***');
    expect(maskPhoneRecipient('')).toBe('***');
  });
});
