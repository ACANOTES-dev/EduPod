import { envValidation } from './env.validation';

describe('worker env validation', () => {
  it('should parse a valid worker environment', () => {
    const result = envValidation({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5553/school_platform',
      REDIS_URL: 'redis://localhost:5554',
      NODE_ENV: 'production',
      WORKER_PORT: '6000',
      WORKER_SHUTDOWN_GRACE_MS: '45000',
      RESEND_FROM_EMAIL: 'ops@edupod.app',
    });

    expect(result.WORKER_PORT).toBe(6000);
    expect(result.WORKER_SHUTDOWN_GRACE_MS).toBe(45000);
    expect(result.NODE_ENV).toBe('production');
  });

  it('should reject an invalid worker environment', () => {
    expect(() =>
      envValidation({
        DATABASE_URL: 'not-a-url',
        REDIS_URL: 'redis://localhost:5554',
      }),
    ).toThrow('Worker environment validation failed');
  });
});
