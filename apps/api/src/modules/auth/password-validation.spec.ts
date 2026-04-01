import {
  acceptInvitationSchema,
  createUserSchema,
  parentRegistrationSchema,
  passwordResetConfirmSchema,
} from '@school/shared';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SHORT_PASSWORD = 'Ab1!xyz'; // 7 chars — below minimum
const EXACT_MIN_PASSWORD = 'Ab1!xyzW'; // exactly 8 chars
const VALID_PASSWORD = 'SecurePass123!'; // well above minimum
const EMPTY_PASSWORD = '';

// ─── createUserSchema — password ──────────────────────────────────────────────

describe('createUserSchema — password validation', () => {
  const basePayload = {
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
  };

  it('should reject password shorter than 8 characters', () => {
    const result = createUserSchema.safeParse({
      ...basePayload,
      password: SHORT_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = createUserSchema.safeParse({
      ...basePayload,
      password: EMPTY_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should accept password of exactly 8 characters', () => {
    const result = createUserSchema.safeParse({
      ...basePayload,
      password: EXACT_MIN_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should accept password longer than 8 characters', () => {
    const result = createUserSchema.safeParse({
      ...basePayload,
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing password', () => {
    const result = createUserSchema.safeParse(basePayload);
    expect(result.success).toBe(false);
  });
});

// ─── acceptInvitationSchema — password ────────────────────────────────────────

describe('acceptInvitationSchema — password validation', () => {
  const basePayload = {
    token: 'some-valid-token',
    first_name: 'Test',
    last_name: 'User',
  };

  it('should reject password shorter than 8 characters', () => {
    const result = acceptInvitationSchema.safeParse({
      ...basePayload,
      password: SHORT_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = acceptInvitationSchema.safeParse({
      ...basePayload,
      password: EMPTY_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should accept password of exactly 8 characters', () => {
    const result = acceptInvitationSchema.safeParse({
      ...basePayload,
      password: EXACT_MIN_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should accept password longer than 8 characters', () => {
    const result = acceptInvitationSchema.safeParse({
      ...basePayload,
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should accept omitted password (optional for existing users)', () => {
    const result = acceptInvitationSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
  });
});

// ─── passwordResetConfirmSchema — new_password ───────────────────────────────

describe('passwordResetConfirmSchema — password validation', () => {
  const basePayload = {
    token: 'some-reset-token',
  };

  it('should reject password shorter than 8 characters', () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...basePayload,
      new_password: SHORT_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...basePayload,
      new_password: EMPTY_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should accept password of exactly 8 characters', () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...basePayload,
      new_password: EXACT_MIN_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should accept password longer than 8 characters', () => {
    const result = passwordResetConfirmSchema.safeParse({
      ...basePayload,
      new_password: VALID_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing new_password', () => {
    const result = passwordResetConfirmSchema.safeParse(basePayload);
    expect(result.success).toBe(false);
  });
});

// ─── parentRegistrationSchema — password (extends createUserSchema) ──────────

describe('parentRegistrationSchema — password validation', () => {
  const basePayload = {
    email: 'parent@example.com',
    first_name: 'Parent',
    last_name: 'User',
    preferred_contact_channels: ['email'] as const,
  };

  it('should reject password shorter than 8 characters', () => {
    const result = parentRegistrationSchema.safeParse({
      ...basePayload,
      password: SHORT_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = parentRegistrationSchema.safeParse({
      ...basePayload,
      password: EMPTY_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it('should accept password of exactly 8 characters', () => {
    const result = parentRegistrationSchema.safeParse({
      ...basePayload,
      password: EXACT_MIN_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it('should accept password longer than 8 characters', () => {
    const result = parentRegistrationSchema.safeParse({
      ...basePayload,
      password: VALID_PASSWORD,
    });
    expect(result.success).toBe(true);
  });
});
