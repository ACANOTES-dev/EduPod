import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SyntheticCredentialResolverService } from './synthetic-credential-resolver.service';

describe('SyntheticCredentialResolverService', () => {
  function buildService(values: Record<string, string | undefined>) {
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    return new SyntheticCredentialResolverService(config);
  }

  it('resolves uppercase env credential keys', () => {
    const service = buildService({ SYNTHETIC_PLATFORM_USER_PASSWORD: 'secret-value' });

    expect(service.resolveEnvKey('SYNTHETIC_PLATFORM_USER_PASSWORD')).toBe('secret-value');
  });

  it('rejects non-env credential references and ~/.codex sources', () => {
    const service = buildService({
      SYNTHETIC_PLATFORM_USER_PASSWORD: '/Users/ram/.codex/secrets/not-for-schedule.env',
    });

    expect(() => service.resolveEnvKey('synthetic_password')).toThrow(BadRequestException);
    expect(() => service.resolveEnvKey('SYNTHETIC_PLATFORM_USER_PASSWORD')).toThrow(
      BadRequestException,
    );
  });

  it('recursively resolves env references without accepting raw secret paths', () => {
    const service = buildService({ SYNTHETIC_USER_EMAIL: 'synthetic@example.test' });

    expect(
      service.resolveValue({
        email: { env: 'SYNTHETIC_USER_EMAIL' },
        metadata: { purpose: 'synthetic' },
      }),
    ).toEqual({
      email: 'synthetic@example.test',
      metadata: { purpose: 'synthetic' },
    });
  });
});
