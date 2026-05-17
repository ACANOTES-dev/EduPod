import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FORBIDDEN_CREDENTIAL_SOURCE = /(^~\/\.codex|\/\.codex\/|\\\.codex\\)/i;

@Injectable()
export class SyntheticCredentialResolverService {
  constructor(private readonly configService: ConfigService) {}

  resolveEnvKey(envKey: string): string {
    if (!/^[A-Z0-9_]+$/.test(envKey)) {
      throw new BadRequestException({
        code: 'INVALID_SYNTHETIC_CREDENTIAL_KEY',
        message: 'Synthetic credentials must be referenced by uppercase env var key.',
      });
    }
    if (FORBIDDEN_CREDENTIAL_SOURCE.test(envKey)) {
      throw new BadRequestException({
        code: 'FORBIDDEN_SYNTHETIC_CREDENTIAL_SOURCE',
        message: 'Synthetic checks cannot resolve credentials from ~/.codex sources.',
      });
    }

    const value = this.configService.get<string>(envKey);
    if (!value) {
      throw new BadRequestException({
        code: 'SYNTHETIC_CREDENTIAL_NOT_CONFIGURED',
        message: `Synthetic credential env key "${envKey}" is not configured.`,
      });
    }
    if (FORBIDDEN_CREDENTIAL_SOURCE.test(value)) {
      throw new BadRequestException({
        code: 'FORBIDDEN_SYNTHETIC_CREDENTIAL_SOURCE',
        message: 'Synthetic checks cannot resolve credentials from ~/.codex sources.',
      });
    }
    return value;
  }

  resolveValue(value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'env' in value) {
      const envKey = (value as { env?: unknown }).env;
      if (typeof envKey !== 'string') {
        throw new BadRequestException({
          code: 'INVALID_SYNTHETIC_CREDENTIAL_KEY',
          message: 'Synthetic env references must contain a string env key.',
        });
      }
      return this.resolveEnvKey(envKey);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, this.resolveValue(entry)]),
      );
    }
    return value;
  }
}
