import { publicHouseholdLookupSchema } from './household.schema';

describe('publicHouseholdLookupSchema', () => {
  it('accepts a valid lookup request', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: 'XYZ476',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('uppercases the household_number', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: 'xyz476',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.household_number).toBe('XYZ476');
    }
  });

  it('lowercases the parent_email', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: 'ABC123',
      parent_email: 'Alice@Example.COM',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parent_email).toBe('alice@example.com');
    }
  });

  it('trims whitespace from all fields', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: '  nhqs  ',
      household_number: '  ABC123  ',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_slug).toBe('nhqs');
      expect(result.data.household_number).toBe('ABC123');
    }
  });

  it('rejects an invalid household_number pattern (too short)', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: 'AB12',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid household_number pattern (wrong format)', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: '123ABC',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid parent_email', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: 'nhqs',
      household_number: 'ABC123',
      parent_email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty tenant_slug', () => {
    const result = publicHouseholdLookupSchema.safeParse({
      tenant_slug: '',
      household_number: 'ABC123',
      parent_email: 'alice@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(publicHouseholdLookupSchema.safeParse({}).success).toBe(false);
    expect(
      publicHouseholdLookupSchema.safeParse({
        tenant_slug: 'nhqs',
      }).success,
    ).toBe(false);
    expect(
      publicHouseholdLookupSchema.safeParse({
        tenant_slug: 'nhqs',
        household_number: 'ABC123',
      }).success,
    ).toBe(false);
  });
});
