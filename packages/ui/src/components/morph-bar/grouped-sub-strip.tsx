import * as React from 'react';

import { cn } from '../../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupedSubStripChild {
  label: string;
  href: string;
}

export interface GroupedSubStripGroup {
  label: string;
  /** If set, this is a direct-link group (no children, no Level 3) */
  href?: string;
  /** Children rendered in the Level 3 sub-sub-strip */
  children?: GroupedSubStripChild[];
}

export interface GroupedSubStripProps {
  groups: GroupedSubStripGroup[];
  activeTabHref: string;
  className?: string;
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function isPathActive(activeHref: string, href: string): boolean {
  return activeHref === href || (activeHref.startsWith(href + '/') && href !== '/');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GroupedSubStrip({
  groups,
  activeTabHref,
  className,
  LinkComponent = DefaultLink,
}: GroupedSubStripProps) {
  if (!groups || groups.length === 0) return null;

  // Determine which group is active based on current path
  const activeGroup = React.useMemo(() => {
    return groups.find((g) => {
      if (g.href) {
        return isPathActive(activeTabHref, g.href);
      }
      return g.children?.some((c) => isPathActive(activeTabHref, c.href));
    });
  }, [groups, activeTabHref]);

  const activeChildren = activeGroup?.children;

  return (
    <div className={cn('shrink-0', className)}>
      {/* Level 2 — Group headers */}
      <div className="flex h-[44px] items-center border-b border-[var(--color-strip-border)] bg-[var(--color-strip-bg)] px-2 sm:px-6 lg:px-8 transition-all duration-200">
        <nav
          className="flex w-full items-center gap-1 sm:mx-8 overflow-x-auto selection:bg-transparent"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {groups.map((group) => {
            const isGroupActive = group === activeGroup;
            // Navigate to the group's href or its first child's href
            const href = group.href ?? group.children?.[0]?.href ?? '#';

            return (
              <LinkComponent
                key={group.label + href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors whitespace-nowrap',
                  isGroupActive
                    ? 'bg-[var(--color-strip-active-bg)] text-[var(--color-strip-text-active)] font-semibold'
                    : 'text-[var(--color-strip-text)] hover:bg-[var(--color-strip-active-bg)] hover:text-[var(--color-strip-text-active)] font-medium',
                )}
              >
                {group.label}
              </LinkComponent>
            );
          })}
        </nav>
      </div>

      {/* Level 3 — Children of active group (underline-style tabs) */}
      {activeChildren && activeChildren.length > 0 && (
        <div className="flex h-[34px] items-center border-b border-[var(--color-strip-border)] bg-[var(--color-strip-bg)] px-2 sm:px-6 lg:px-8">
          <nav
            className="flex w-full items-center gap-4 sm:mx-8 overflow-x-auto selection:bg-transparent"
            style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
          >
            {activeChildren.map((child) => {
              const isActive = isPathActive(activeTabHref, child.href);

              return (
                <LinkComponent
                  key={child.href}
                  href={child.href}
                  className={cn(
                    'relative flex items-center py-1 text-[11px] transition-colors whitespace-nowrap',
                    isActive
                      ? 'text-[var(--color-strip-text-active)] font-semibold'
                      : 'text-[var(--color-strip-text)] hover:text-[var(--color-strip-text-active)] font-medium opacity-70 hover:opacity-100',
                  )}
                >
                  {child.label}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--color-strip-text-active)]" />
                  )}
                </LinkComponent>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
