import { YearGroupStudentsAudienceProvider } from './year-group-students.provider';

describe('YearGroupStudentsAudienceProvider', () => {
  const provider = new YearGroupStudentsAudienceProvider();

  it('returns empty user_ids until students have user accounts', async () => {
    const result = await provider.resolve();
    expect(result).toEqual({ user_ids: [] });
  });

  it('exposes the correct key and display name', () => {
    expect(provider.key).toBe('year_group_students');
    expect(provider.displayName).toBeTruthy();
  });

  it('accepts a valid yearGroupParams shape', () => {
    const ok = provider.paramsSchema.safeParse({
      year_group_ids: ['11111111-1111-1111-1111-111111111111'],
    });
    expect(ok.success).toBe(true);
  });
});
