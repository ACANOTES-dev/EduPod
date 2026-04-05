import * as React from 'react';

import { cn } from '../lib/utils';

interface TableWrapperProps {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
}

export function TableWrapper({ toolbar, children, pagination, className }: TableWrapperProps) {
  return (
    <div className={cn('rounded-[16px] border border-border bg-surface overflow-hidden', className)}>
      {toolbar && <div className="border-b border-border px-4 py-3">{toolbar}</div>}
      <div className="overflow-x-auto">{children}</div>
      {pagination && <div className="border-t border-border px-4 py-3">{pagination}</div>}
    </div>
  );
}
