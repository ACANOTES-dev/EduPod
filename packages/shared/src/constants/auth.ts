export const JWT_EXPIRY = '15m';
export const REFRESH_EXPIRY = '7d';
export const REFRESH_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

/** Progressive brute force protection thresholds */
export const BRUTE_FORCE_THRESHOLDS = [
  { failures: 5, delaySeconds: 30 },
  { failures: 8, delaySeconds: 120 },
  { failures: 10, delaySeconds: 1800 },
] as const;

export const BRUTE_FORCE_WINDOW_SECONDS = 3600; // 1 hour window

/** IP-based login throttle: max failed attempts per IP before blocking */
export const IP_LOGIN_THROTTLE_MAX_ATTEMPTS = 10;

/** IP-based login throttle: window in seconds */
export const IP_LOGIN_THROTTLE_WINDOW_SECONDS = 900; // 15 minutes

/** Account lockout: consecutive failures before locking */
export const ACCOUNT_LOCKOUT_THRESHOLD = 5;

/** Account lockout: duration in minutes */
export const ACCOUNT_LOCKOUT_DURATION_MINUTES = 15;
