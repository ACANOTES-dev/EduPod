import * as React from 'react';

import { cn } from '../../lib/utils';

import { MoreDropdown } from './more-dropdown';

export interface SubStripTab {
  label: string;
  href: string;
  count?: number;
  overflow?: boolean;
}

export interface SubStripProps {
  tabs: SubStripTab[];
  activeTabHref: string;
  className?: string;
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

export function SubStrip({
  tabs,
  activeTabHref,
  className,
  LinkComponent = DefaultLink,
}: SubStripProps) {
  if (!tabs || tabs.length === 0) return null;

  const inlineTabs = tabs.filter((t) => !t.overflow);
  const overflowTabs = tabs.filter((t) => t.overflow);

  return (
    <div
      className={cn(
        'shrink-0 flex h-[44px] items-center border-b border-[var(--color-strip-border)] bg-[var(--color-strip-bg)] px-2 sm:px-6 lg:px-8 transition-all duration-200',
        className,
      )}
    >
      <nav
        className="flex w-full items-center gap-1 sm:mx-8 overflow-x-auto selection:bg-transparent"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {inlineTabs.map((tab) => {
          // Fallback exact match or startsWith
          const isActive =
            activeTabHref === tab.href ||
            (activeTabHref.startsWith(tab.href + '/') && tab.href !== '/');

          return (
            <LinkComponent
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-[var(--color-strip-active-bg)] text-[var(--color-strip-text-active)] font-semibold'
                  : 'text-[var(--color-strip-text)] hover:bg-[var(--color-strip-active-bg)] hover:text-[var(--color-strip-text-active)] font-medium',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span
                  className={cn(
                    'flex h-4 items-center justify-center rounded-pill px-1.5 text-[10px] font-bold',
                    isActive
                      ? 'bg-emerald-500/25 text-emerald-700'
                      : 'bg-black/[0.08] text-[var(--color-strip-text)]',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </LinkComponent>
          );
        })}

        {overflowTabs.length > 0 && (
          <MoreDropdown
            tabs={overflowTabs}
            activeTabHref={activeTabHref}
            LinkComponent={LinkComponent}
          />
        )}
      </nav>
    </div>
  );
}
