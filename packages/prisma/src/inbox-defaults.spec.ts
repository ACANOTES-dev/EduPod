import {
  DEFAULT_MESSAGING_POLICY_MATRIX,
  MESSAGING_ROLES,
  STARTER_SAFEGUARDING_KEYWORDS,
} from './inbox-defaults';

describe('inbox-defaults — DEFAULT_MESSAGING_POLICY_MATRIX', () => {
  it('covers every (sender × recipient) pair exactly once — 9×9 = 81 cells', () => {
    let total = 0;
    for (const sender of MESSAGING_ROLES) {
      for (const recipient of MESSAGING_ROLES) {
        expect(typeof DEFAULT_MESSAGING_POLICY_MATRIX[sender][recipient]).toBe('boolean');
        total += 1;
      }
    }
    expect(total).toBe(81);
  });

  it('parents and students rows are entirely OFF (inbox-only baseline)', () => {
    for (const recipient of MESSAGING_ROLES) {
      expect(DEFAULT_MESSAGING_POLICY_MATRIX.parent[recipient]).toBe(false);
      expect(DEFAULT_MESSAGING_POLICY_MATRIX.student[recipient]).toBe(false);
    }
  });

  it('admin-tier senders (owner/principal/vice_principal) can reach everyone', () => {
    for (const sender of ['owner', 'principal', 'vice_principal'] as const) {
      for (const recipient of MESSAGING_ROLES) {
        expect(DEFAULT_MESSAGING_POLICY_MATRIX[sender][recipient]).toBe(true);
      }
    }
  });

  it('office cannot message students; finance cannot message nurse or students; nurse cannot message finance or students', () => {
    expect(DEFAULT_MESSAGING_POLICY_MATRIX.office.student).toBe(false);
    expect(DEFAULT_MESSAGING_POLICY_MATRIX.finance.nurse).toBe(false);
    expect(DEFAULT_MESSAGING_POLICY_MATRIX.finance.student).toBe(false);
    expect(DEFAULT_MESSAGING_POLICY_MATRIX.nurse.finance).toBe(false);
    expect(DEFAULT_MESSAGING_POLICY_MATRIX.nurse.student).toBe(false);
  });

  it('teacher row is entirely ON (teachers reach every staff tier + parents + students)', () => {
    for (const recipient of MESSAGING_ROLES) {
      expect(DEFAULT_MESSAGING_POLICY_MATRIX.teacher[recipient]).toBe(true);
    }
  });
});

describe('inbox-defaults — STARTER_SAFEGUARDING_KEYWORDS', () => {
  it('seeds at least 25 keywords across all five categories', () => {
    expect(STARTER_SAFEGUARDING_KEYWORDS.length).toBeGreaterThanOrEqual(25);
    const categories = new Set(STARTER_SAFEGUARDING_KEYWORDS.map((k) => k.category));
    for (const expected of ['bullying', 'self_harm', 'abuse', 'inappropriate_contact', 'weapons']) {
      expect(categories.has(expected)).toBe(true);
    }
  });

  it('every seeded keyword has a non-empty keyword, severity, and category', () => {
    for (const kw of STARTER_SAFEGUARDING_KEYWORDS) {
      expect(kw.keyword.trim().length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(kw.severity);
      expect(kw.category.trim().length).toBeGreaterThan(0);
    }
  });
});
