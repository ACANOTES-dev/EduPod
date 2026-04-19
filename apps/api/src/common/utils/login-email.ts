/**
 * Build a login email from a tenant-unique code (staff_number,
 * household_number, or student_number) and the tenant's primary domain.
 *
 * Convention — system-generated user logins:
 *   - Staff:     `{staff_number}@{tenant-domain}`       e.g. `abc123@nhqs.edupod.app`
 *   - Parent:    `{household_number}@{tenant-domain}`   e.g. `abc123@nhqs.edupod.app`
 *   - Student:   `{student_number}@{tenant-domain}`     e.g. `abc123-01@nhqs.edupod.app`
 *
 * Uniqueness is guaranteed by upstream code generators — the `TenantCodePoolService`
 * ensures `staff_number` and `household_number` share a disjoint 6-char pool per
 * tenant, and `student_number` derives from the household prefix with a `-NN`
 * suffix (disjoint from bare codes).
 *
 * The local part is lowercased because PostgreSQL's `users.email` column is
 * `CITEXT` (case-insensitive) and we want a canonical form on write.
 */
export function buildLoginEmail(localPart: string, tenantDomain: string): string {
  const trimmed = localPart.trim();
  if (trimmed.length === 0) {
    throw new Error('buildLoginEmail: localPart is empty');
  }
  const domain = tenantDomain.trim().toLowerCase();
  if (domain.length === 0 || !domain.includes('.')) {
    throw new Error(`buildLoginEmail: invalid tenantDomain "${tenantDomain}"`);
  }
  return `${trimmed.toLowerCase()}@${domain}`;
}
