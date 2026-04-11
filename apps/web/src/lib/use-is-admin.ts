import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

import { ADMIN_ROLES, type RoleKey } from './route-roles';

/**
 * Returns whether the currently authenticated user has any of the
 * admin-tier roles (school_owner, school_principal, admin,
 * school_vice_principal). Returns `null` while auth is still loading
 * so callers can distinguish "not yet known" from "definitely not".
 */
export function useIsAdmin(): boolean | null {
  const { user, isLoading } = useAuth();

  return React.useMemo(() => {
    if (isLoading) return null;
    if (!user?.memberships) return false;
    const roleKeys = user.memberships.flatMap(
      (m) => m.roles?.map((r: { role_key: string }) => r.role_key) ?? [],
    );
    return roleKeys.some((k) => (ADMIN_ROLES as readonly RoleKey[]).includes(k as RoleKey));
  }, [user, isLoading]);
}
