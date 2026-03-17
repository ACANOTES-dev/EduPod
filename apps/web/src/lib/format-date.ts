/**
 * Format a date string or Date object for display.
 *
 * Supports format tokens:
 *   DD   — day of month, zero-padded (01–31)
 *   MM   — month, zero-padded (01–12)
 *   YYYY — four-digit year
 *
 * Default format: DD-MM-YYYY
 *
 * The separator is inferred from the format string (e.g. DD/MM/YYYY → "/",
 * DD-MM-YYYY → "-", DD.MM.YYYY → ".").
 */
export function formatDate(
  value: string | Date | null | undefined,
  format = 'DD-MM-YYYY',
): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());

  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year);
}

/**
 * Format a date with time for display (e.g. session timestamps).
 * Always uses DD-MM-YYYY HH:mm format.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}`;
}
