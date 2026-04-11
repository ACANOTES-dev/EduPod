import { InternalServerErrorException } from '@nestjs/common';

import { SavedGroupAudienceProvider } from './saved-group.provider';

describe('SavedGroupAudienceProvider (marker only)', () => {
  const provider = new SavedGroupAudienceProvider();

  it('is marked as wired so the chip builder surfaces it', () => {
    expect(provider.wired).toBe(true);
    expect(provider.key).toBe('saved_group');
  });

  it('throws when .resolve() is called directly (composer must intercept)', async () => {
    await expect(provider.resolve()).rejects.toBeInstanceOf(InternalServerErrorException);
    try {
      await provider.resolve();
    } catch (err) {
      const response = (err as InternalServerErrorException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('SAVED_GROUP_RESOLVE_BYPASSED_COMPOSER');
    }
  });

  it('accepts a valid saved_audience_id params shape', () => {
    const ok = provider.paramsSchema.safeParse({
      saved_audience_id: '44444444-4444-4444-4444-444444444444',
    });
    expect(ok.success).toBe(true);
  });
});
