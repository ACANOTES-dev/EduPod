import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  tenant_id: z.string().uuid().optional(),
  mfa_code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Code must be exactly 6 digits')
    .optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(255),
});

export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

export type PasswordResetConfirmDto = z.infer<typeof passwordResetConfirmSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
});

export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;

export const mfaRecoverySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  recovery_code: z.string().min(1),
});

export type MfaRecoveryDto = z.infer<typeof mfaRecoverySchema>;

export const switchTenantSchema = z.object({
  tenant_id: z.string().uuid(),
});

export type SwitchTenantDto = z.infer<typeof switchTenantSchema>;
