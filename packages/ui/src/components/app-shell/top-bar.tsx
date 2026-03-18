import * as React from 'react';

import { cn } from '../../lib/utils';

interface TopBarProps {
  title?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function TopBar({ title, actions, children, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-4 border-b border-border bg-surface px-3 sm:px-6',
        className,
      )}
    >
      {title && <h1 className="text-lg font-semibold text-text-primary">{title}</h1>}
      <div className="flex-1">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
