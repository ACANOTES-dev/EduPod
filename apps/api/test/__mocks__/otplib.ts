/**
 * Manual mock for otplib — avoids ESM transformation issues in e2e tests.
 * MFA-specific e2e tests are marked as todo; this mock provides enough
 * for the auth service to initialise and handle non-MFA login flows.
 */
export function generateSecret(): string {
  return 'MOCKSECRET1234567890ABCDEF';
}

export function generateURI(
  _secret: string,
  _accountName: string,
  _issuer: string,
): string {
  return 'otpauth://totp/MockIssuer:mock@test.com?secret=MOCKSECRET&issuer=MockIssuer';
}

export function verify(opts: { token: string; secret: string }): boolean {
  // Always return false unless a special test token is used
  return opts.token === '000000';
}
