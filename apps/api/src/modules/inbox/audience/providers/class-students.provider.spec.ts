import { ClassStudentsAudienceProvider } from './class-students.provider';

describe('ClassStudentsAudienceProvider', () => {
  const provider = new ClassStudentsAudienceProvider();

  it('returns empty user_ids until students have user accounts', async () => {
    await expect(provider.resolve()).resolves.toEqual({ user_ids: [] });
  });

  it('exposes the correct key', () => {
    expect(provider.key).toBe('class_students');
  });

  it('accepts a valid class_ids params shape', () => {
    const result = provider.paramsSchema.safeParse({
      class_ids: ['22222222-2222-2222-2222-222222222222'],
    });
    expect(result.success).toBe(true);
  });
});
