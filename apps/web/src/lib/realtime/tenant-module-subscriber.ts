'use client';

import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

export const TENANT_MODULE_POLL_INTERVAL_MS = 60_000;

export function TenantModuleSubscriber(): null {
  const { isAuthenticated, isLoading, refreshUser, user } = useAuth();
  const activeTenantId =
    user?.memberships?.find((membership) => membership.membership_status === 'active')?.tenant_id ??
    null;

  React.useEffect(() => {
    if (!isAuthenticated || isLoading || !activeTenantId) return undefined;

    const intervalId = globalThis.setInterval(() => {
      void refreshUser();
    }, TENANT_MODULE_POLL_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [activeTenantId, isAuthenticated, isLoading, refreshUser]);

  return null;
}
