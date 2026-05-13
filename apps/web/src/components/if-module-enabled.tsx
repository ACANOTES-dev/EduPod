'use client';

import type { ReactNode } from 'react';

import type { ModuleKey } from '@school/shared';

import { useModuleEnabled } from '@/hooks/use-module-enabled';

interface IfModuleEnabledProps {
  module: ModuleKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export function IfModuleEnabled({ module, children, fallback = null }: IfModuleEnabledProps) {
  return useModuleEnabled(module) ? <>{children}</> : <>{fallback}</>;
}
