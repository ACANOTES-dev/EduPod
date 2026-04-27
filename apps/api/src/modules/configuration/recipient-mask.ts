/**
 * Mask an email recipient for audit / response logging.
 * `john.smith@school.test` → `j*********h@school.test`.
 * Preserves the entire domain (admins need to recognise it). Hides the local
 * part except first and last char.
 */
export function maskEmailRecipient(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? '*'}*${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.slice(-1)}${domain}`;
}

/**
 * Mask a phone recipient for audit / response logging.
 * `+447912345678` → `+4479****5678` (keeps country prefix + last 4).
 */
export function maskPhoneRecipient(phone: string): string {
  if (phone.length <= 5) return '***';
  return `${phone.slice(0, 5)}${'*'.repeat(Math.max(1, phone.length - 9))}${phone.slice(-4)}`;
}
