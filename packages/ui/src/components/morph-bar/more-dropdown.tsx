import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';

import type { SubStripTab } from './sub-strip';

interface MoreDropdownProps {
  tabs: SubStripTab[];
  activeTabHref: string;
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
  }>;
}

function DefaultLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function MoreDropdown({
  tabs,
  activeTabHref,
  LinkComponent = DefaultLink,
}: MoreDropdownProps) {
  const isAnyActive = tabs.some(
    (t) => activeTabHref === t.href || (activeTabHref.startsWith(t.href + '/') && t.href !== '/'),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors focus:outline-none',
            isAnyActive
              ? 'bg-[var(--color-strip-active-bg)] text-[var(--color-strip-text-active)] font-semibold'
              : 'text-[var(--color-strip-text)] hover:bg-[var(--color-strip-active-bg)] hover:text-[var(--color-strip-text-active)]',
          )}
        >
          More
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48 border-[var(--color-strip-border)] bg-[var(--color-strip-bg)] p-1 text-[var(--color-strip-text)] shadow-lg rounded-xl"
      >
        {tabs.map((tab) => {
          const isActive =
            activeTabHref === tab.href ||
            (activeTabHref.startsWith(tab.href + '/') && tab.href !== '/');
          return (
            <DropdownMenuItem key={tab.href} asChild>
              <LinkComponent
                href={tab.href}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors cursor-pointer',
                  isActive
                    ? 'bg-[var(--color-strip-active-bg)] text-[var(--color-strip-text-active)]'
                    : 'hover:bg-[var(--color-strip-active-bg)] hover:text-[var(--color-strip-text-active)] focus:bg-[var(--color-strip-active-bg)] focus:text-[var(--color-strip-text-active)]',
                )}
              >
                {tab.label}
                {typeof tab.count === 'number' && (
                  <span className="ms-auto flex h-4 min-w-[16px] items-center justify-center rounded-pill bg-[rgba(255,255,255,0.1)] px-1 text-[10px] font-bold">
                    {tab.count}
                  </span>
                )}
              </LinkComponent>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
