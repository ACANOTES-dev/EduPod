import { buildLoginEmail } from './login-email';

describe('buildLoginEmail', () => {
  it('lowercases the local part and the domain', () => {
    expect(buildLoginEmail('ABC123', 'NHQS.edupod.app')).toBe('abc123@nhqs.edupod.app');
  });

  it('preserves the hyphen in student numbers', () => {
    expect(buildLoginEmail('ABC123-01', 'nhqs.edupod.app')).toBe('abc123-01@nhqs.edupod.app');
  });

  it('trims whitespace from both inputs', () => {
    expect(buildLoginEmail('  ABC123  ', '  nhqs.edupod.app  ')).toBe('abc123@nhqs.edupod.app');
  });

  it('rejects empty local part', () => {
    expect(() => buildLoginEmail('', 'nhqs.edupod.app')).toThrow(/localPart is empty/);
    expect(() => buildLoginEmail('   ', 'nhqs.edupod.app')).toThrow(/localPart is empty/);
  });

  it('rejects an invalid tenant domain (no dot)', () => {
    expect(() => buildLoginEmail('abc123', 'localhost')).toThrow(/invalid tenantDomain/);
  });

  it('rejects an empty tenant domain', () => {
    expect(() => buildLoginEmail('abc123', '')).toThrow(/invalid tenantDomain/);
  });
});
