'use client';

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function SidebarItem({ icon: Icon, label, active, collapsed, href, onClick, className }: SidebarItemProps) {
  const classes = cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    active
      ? 'bg-primary-50 text-primary-700 border-s-[3px] border-primary-600'
      : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
    collapsed && 'justify-center px-2',
    className,
  );

  const content = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{label}</span>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={classes}
        title={collapsed ? label : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className={classes}
      title={collapsed ? label : undefined}
    >
      {content}
    </button>
  );
}
