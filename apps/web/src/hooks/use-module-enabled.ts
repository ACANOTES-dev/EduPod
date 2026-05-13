'use client';

import { isModuleKey, type ModuleKey } from '@school/shared';

import { useAuth } from '@/providers/auth-provider';

export function isModuleEnabledForList(
  enabledModules: readonly ModuleKey[],
  key: ModuleKey | string | undefined,
): boolean {
  if (key === undefined) {
    return true;
  }

  if (!isModuleKey(key)) {
    return true;
  }

  return enabledModules.includes(key);
}

export function useModuleEnabled(key: ModuleKey | string | undefined): boolean {
  const { enabledModules } = useAuth();
  return isModuleEnabledForList(enabledModules, key);
}
