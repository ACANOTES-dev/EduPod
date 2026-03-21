import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';

type RoleKey = 'school_owner' | 'school_admin' | 'teacher' | 'finance_staff' | 'admissions_staff' | 'parent';

/**
 * Returns the current user's role keys and helper to check membership.
 */
export function useRoleCheck() {
  const { user } = useAuth();

  const roleKeys = useMemo<string[]>(() => {
    if (!user?.memberships) return [];
    return user.memberships.flatMap(
      (m) => m.roles?.map((r: { role_key: string }) => r.role_key) ?? [],
    );
  }, [user]);

  const hasRole = (role: RoleKey) => roleKeys.includes(role);
  const hasAnyRole = (...roles: RoleKey[]) => roles.some((r) => roleKeys.includes(r));
  const isOwner = hasRole('school_owner');

  return { roleKeys, hasRole, hasAnyRole, isOwner };
}
