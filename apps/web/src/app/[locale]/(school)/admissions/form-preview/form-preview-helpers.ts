// Pure helpers for the admissions form-preview page. Extracted so the spec
// file can unit-test them without pulling the React tree (qrcode.react,
// file-saver, @school/ui) through Jest's module resolver.

// Admin roles permitted to rebuild the system form. Mirrors the
// `admissions.manage` permission check on the backend.
const MANAGE_ROLES = new Set<string>(['school_owner', 'school_principal', 'admin']);

export function canManageForm(roleKeys: readonly string[]): boolean {
  return roleKeys.some((r) => MANAGE_ROLES.has(r));
}
