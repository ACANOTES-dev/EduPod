import { ServiceUnavailableException } from '@nestjs/common';

import { EventAttendeesProvider } from './event-attendees.provider';

describe('EventAttendeesProvider (stub)', () => {
  const provider = new EventAttendeesProvider();

  it('is registered as unwired so the chip builder disables it', () => {
    expect(provider.wired).toBe(false);
    expect(provider.key).toBe('event_attendees');
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

  it('validates the params shape for a v1 chip-builder preview', () => {
    const ok = provider.paramsSchema.safeParse({
      event_id: '11111111-1111-1111-1111-111111111111',
      status: 'confirmed',
    });
    expect(ok.success).toBe(true);

    const missing = provider.paramsSchema.safeParse({ status: 'confirmed' });
    expect(missing.success).toBe(false);
  });
});
