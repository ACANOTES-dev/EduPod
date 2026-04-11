import type { MessagingRole } from './constants';

/**
 * Maps platform role keys (from the RBAC `role` table's `role_key` column) to
 * the nine `MessagingRole` buckets used by the permission matrix.
 *
 * The messaging matrix does not have one cell per platform role — that would
 * be unmanageable and would let us forget to cover new roles safely. Instead
 * every platform role is pinned to one of nine canonical messaging buckets
 * (owner, principal, vice_principal, office, finance, nurse, teacher, parent,
 * student). The policy service (Wave 2) consults this map before any cell
 * lookup.
 *
 * Unknown / unrecognised role keys fall through to `UNKNOWN_ROLE_FALLBACK`,
 * which the policy service treats as deny-all.
 *
 * Wave 2's `messaging-policy.service.ts` may extend the long tail (e.g.
 * librarian → office, substitute_teacher → teacher). Keep this file in sync
 * with the seeded system roles.
 */
export const PLATFORM_ROLE_TO_MESSAGING_ROLE: Record<string, MessagingRole> = {
  platform_owner: 'owner',
  school_owner: 'owner',
  school_principal: 'principal',
  school_vice_principal: 'vice_principal',
  admin: 'office',
  front_office: 'office',
  accounting: 'finance',
  finance: 'finance',
  nurse: 'nurse',
  teacher: 'teacher',
  parent: 'parent',
  student: 'student',
};

/** Fallback bucket for unmapped platform roles. Policy service treats this as deny-all. */
export const UNKNOWN_ROLE_FALLBACK: MessagingRole | null = null;

export function resolveMessagingRole(platformRoleKey: string): MessagingRole | null {
  return PLATFORM_ROLE_TO_MESSAGING_ROLE[platformRoleKey] ?? UNKNOWN_ROLE_FALLBACK;
}
