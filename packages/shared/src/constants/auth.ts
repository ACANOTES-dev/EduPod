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
