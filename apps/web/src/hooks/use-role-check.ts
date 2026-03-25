import { useMemo } from 'react';

import { useAuth } from '@/providers/auth-provider';

type RoleKey = 'school_principal' | 'admin' | 'teacher' | 'accounting' | 'front_office' | 'parent' | 'school_vice_principal' | 'student';

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
  const isOwner = hasRole('school_principal');

  return { roleKeys, hasRole, hasAnyRole, isOwner };
}
