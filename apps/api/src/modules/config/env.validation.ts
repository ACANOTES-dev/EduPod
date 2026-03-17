import { z } from 'zod';

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_URL: z.string().url().default('http://localhost:5552'),
  APP_URL: z.string().url().default('http://localhost:5551'),
  API_PORT: z.coerce.number().default(5552),

  // Optional -- S3
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),

  // Optional -- Sentry
  SENTRY_DSN_BACKEND: z.string().optional(),

  // Optional -- Encryption
  ENCRYPTION_KEY: z.string().optional(),

  // Optional -- Platform
  PLATFORM_DOMAIN: z.string().default('edupod.app'),
  MFA_ISSUER: z.string().default('SchoolOS'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function envValidation(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  return result.data;
}
