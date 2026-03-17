'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { ScrollArea } from '../scroll-area';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Sidebar({ collapsed, onToggle, header, footer, children, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-e border-border bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-[260px]',
        className,
      )}
    >
      {header && (
        <div className={cn('flex items-center gap-3 border-b border-border p-4', collapsed && 'justify-center px-2')}>
          {header}
        </div>
      )}
      <ScrollArea className="flex-1">
        <nav className="p-2">{children}</nav>
      </ScrollArea>
      {footer && (
        <div className={cn('border-t border-border p-4', collapsed && 'px-2')}>
          {footer}
        </div>
      )}
      <button
        onClick={onToggle}
        className="flex items-center justify-center border-t border-border p-2 text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4 rtl:rotate-180" /> : <ChevronLeft className="h-4 w-4 rtl:rotate-180" />}
      </button>
    </aside>
  );
}
