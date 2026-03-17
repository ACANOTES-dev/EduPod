import { loginSchema, refreshTokenSchema, passwordResetRequestSchema } from './auth.schema';

describe('loginSchema', () => {
  it('should accept valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'test@school.com',
      password: 'Pass123!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'pass',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-email',
      password: 'pass',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'a@b.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('refreshTokenSchema', () => {
  it('should accept valid token', () => {
    const result = refreshTokenSchema.safeParse({
      refresh_token: 'some-token',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const result = refreshTokenSchema.safeParse({
      refresh_token: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('passwordResetRequestSchema', () => {
  it('should accept valid email', () => {
    const result = passwordResetRequestSchema.safeParse({
      email: 'test@school.com',
    });
    expect(result.success).toBe(true);
  });
});
