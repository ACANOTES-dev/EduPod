/**
 * Sentinel UUID for system-initiated operations (cron jobs, workers) where no human user is acting.
 * This value never matches any cp_access_grants row, ensuring system jobs cannot access CP records.
 */
export const SYSTEM_USER_SENTINEL = '00000000-0000-0000-0000-000000000000';
