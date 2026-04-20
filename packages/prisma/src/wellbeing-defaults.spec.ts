import {
  DEFAULT_BEHAVIOUR_CATEGORIES,
  WELLBEING_AI_MODULE_KEYS,
} from './seed-data/wellbeing-default-categories';

describe('wellbeing-defaults — DEFAULT_BEHAVIOUR_CATEGORIES', () => {
  it('ships the expected number of default categories (matches PLAN.md §5 list)', () => {
    // PLAN headline says "Twenty-eight categories" but the actual list in
    // PLAN.md §5 + the impl SQL enumerates 31. Shipping the enumerated 31.
    expect(DEFAULT_BEHAVIOUR_CATEGORIES).toHaveLength(31);
  });

  it('every entry has required name, polarity, severity, and benchmark', () => {
    for (const cat of DEFAULT_BEHAVIOUR_CATEGORIES) {
      expect(cat.name.trim().length).toBeGreaterThan(0);
      expect(['positive', 'negative']).toContain(cat.polarity);
      expect(typeof cat.severity).toBe('number');
      expect(typeof cat.point_value).toBe('number');
      expect(cat.benchmark_category).toMatch(
        /^(verbal_warning|written_warning|external_suspension|minor_positive|merit|major_positive)$/,
      );
    }
  });

  it('category names are unique across the full set', () => {
    const names = DEFAULT_BEHAVIOUR_CATEGORIES.map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('display_order values are unique (stable sort key)', () => {
    const orders = DEFAULT_BEHAVIOUR_CATEGORIES.map((c) => c.display_order);
    const unique = new Set(orders);
    expect(unique.size).toBe(orders.length);
  });

  it('splits 20 negative × 11 positive across severity tiers', () => {
    const negative = DEFAULT_BEHAVIOUR_CATEGORIES.filter((c) => c.polarity === 'negative');
    const positive = DEFAULT_BEHAVIOUR_CATEGORIES.filter((c) => c.polarity === 'positive');
    expect(negative).toHaveLength(20);
    expect(positive).toHaveLength(11);
    expect(negative.length + positive.length).toBe(DEFAULT_BEHAVIOUR_CATEGORIES.length);
  });

  it('every category that converts_to_safeguarding also auto_create_pastoral_concern', () => {
    const offenders = DEFAULT_BEHAVIOUR_CATEGORIES.filter(
      (c) => c.converts_to_safeguarding && !c.auto_create_pastoral_concern,
    );
    expect(offenders).toEqual([]);
  });

  it('safeguarding-converting categories are major negatives only', () => {
    const safeguardingCats = DEFAULT_BEHAVIOUR_CATEGORIES.filter((c) => c.converts_to_safeguarding);
    for (const cat of safeguardingCats) {
      expect(cat.polarity).toBe('negative');
      expect(cat.severity).toBe(7);
      expect(cat.benchmark_category).toBe('external_suspension');
    }
    // Bullying major, drugs, discrimination, weapons are the ones marked
    expect(safeguardingCats.length).toBe(4);
  });

  it('every category carries an Arabic name', () => {
    for (const cat of DEFAULT_BEHAVIOUR_CATEGORIES) {
      expect(cat.name_ar).toBeDefined();
      expect((cat.name_ar ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});

describe('wellbeing-defaults — WELLBEING_AI_MODULE_KEYS', () => {
  it('lists the four wellbeing AI-gated modules', () => {
    expect([...WELLBEING_AI_MODULE_KEYS].sort()).toEqual(
      ['behaviour', 'early_warning', 'pastoral', 'staff_wellbeing'].sort(),
    );
  });
});
