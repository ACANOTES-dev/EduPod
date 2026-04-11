import { ServiceUnavailableException } from '@nestjs/common';

import { TripRosterProvider } from './trip-roster.provider';

describe('TripRosterProvider (stub)', () => {
  const provider = new TripRosterProvider();

  it('is registered as unwired', () => {
    expect(provider.wired).toBe(false);
    expect(provider.key).toBe('trip_roster');
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

  it('validates the trip_id params shape', () => {
    const ok = provider.paramsSchema.safeParse({
      trip_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(ok.success).toBe(true);
  });
});
