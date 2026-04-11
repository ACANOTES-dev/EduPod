import { ServiceUnavailableException } from '@nestjs/common';

import { SectionParentsAudienceProvider } from './section-parents.provider';

describe('SectionParentsAudienceProvider (stub)', () => {
  const provider = new SectionParentsAudienceProvider();

  it('declares itself unwired', () => {
    expect(provider.wired).toBe(false);
    expect(provider.key).toBe('section_parents');
  });

  it('throws AUDIENCE_PROVIDER_NOT_WIRED when invoked', async () => {
    await expect(provider.resolve()).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await provider.resolve();
    } catch (err) {
      const response = (err as ServiceUnavailableException).getResponse() as { code: string };
      expect(response.code).toBe('AUDIENCE_PROVIDER_NOT_WIRED');
    }
  });

  it('accepts a valid params shape via the schema', () => {
    const result = provider.paramsSchema.safeParse({
      section_ids: ['11111111-1111-1111-1111-111111111111'],
    });
    expect(result.success).toBe(true);
  });
});
