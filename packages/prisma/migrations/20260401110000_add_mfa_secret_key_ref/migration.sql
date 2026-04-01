-- AlterTable: add mfa_secret_key_ref column to users table
-- Stores the encryption key version reference for encrypted MFA TOTP secrets.
-- NULL means legacy plaintext (pre-encryption migration).
ALTER TABLE users ADD COLUMN mfa_secret_key_ref VARCHAR(10);
