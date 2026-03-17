import * as React from 'react';

import { cn } from '../../lib/utils';

interface SidebarSectionProps {
  label: string;
  collapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function SidebarSection({ label, collapsed, children, className }: SidebarSectionProps) {
  return (
    <div className={cn('mt-6 first:mt-0', className)}>
      {!collapsed && (
        <span className="mb-1 block px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          {label}
        </span>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
