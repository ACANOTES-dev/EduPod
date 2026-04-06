import { Bell, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

import { HubPill } from './hub-pill';
import { SearchPill } from './search-pill';

export interface MorphBarHub {
  key: string;
  label: string;
}

export interface MorphBarProps {
  schoolName: string;
  logoUrl?: string;
  activeHub: string | null;
  hubs: MorphBarHub[];
  onHubClick: (hubKey: string) => void;
  onSearchClick: () => void;
  notificationCount: number;
  onNotificationClick: () => void;
  onHamburgerClick?: () => void;
  userAvatar?: string;
  userName: string;
  onUserClick: () => void;
  className?: string;
}

export const MorphBar = React.forwardRef<HTMLElement, MorphBarProps>(
  (
    {
      schoolName,
      logoUrl,
      activeHub,
      hubs,
      onHubClick,
      onSearchClick,
      notificationCount,
      onNotificationClick,
      onHamburgerClick,
      userAvatar,
      userName,
      onUserClick,
      className,
    },
    ref,
  ) => {
    return (
      <header
        ref={ref}
        className={cn(
          'shrink-0 z-50 flex h-[56px] items-center justify-between bg-[var(--color-bar-bg)] border-b border-[var(--color-bar-border)] px-4 sm:px-6 lg:px-8',
          className,
        )}
      >
        <div className="flex items-center gap-1 sm:gap-2">
          {onHamburgerClick && (
            <button
              type="button"
              onClick={onHamburgerClick}
              className="lg:hidden flex items-center justify-center p-2 -ms-2 text-[var(--color-bar-text)] hover:text-[var(--color-text-primary)] hover:bg-black/5 rounded-full transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
          )}

          <div className="flex items-center gap-3 lg:me-6 overflow-hidden max-w-[180px] lg:max-w-none">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={schoolName}
                className="h-7 w-7 rounded border border-[var(--color-bar-border)] object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white shadow-sm">
                {schoolName ? schoolName.charAt(0) : 'E'}
              </div>
            )}
            <span className="hidden sm:inline-flex text-[15px] font-bold text-[var(--color-text-primary)] tracking-tight truncate">
              {schoolName || 'EduPod'}
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {hubs.map((hub) => (
              <HubPill
                key={hub.key}
                active={activeHub === hub.key}
                onClick={() => onHubClick(hub.key)}
              >
                {hub.label}
              </HubPill>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden sm:block lg:hidden">
            <SearchPill onClick={onSearchClick} aria-label="Search" />
          </div>
          <button
            type="button"
            className="lg:hidden flex h-[36px] w-[36px] items-center justify-center rounded-full text-[var(--color-bar-text)] hover:bg-black/5 hover:text-[var(--color-text-primary)] transition-colors"
            onClick={onSearchClick}
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={onNotificationClick}
            className="group relative rounded-pill p-1.5 text-[var(--color-bar-text)] transition-colors hover:bg-black/5 hover:text-[var(--color-text-primary)]"
          >
            <Bell className="h-5 w-5 group-hover:animate-[bounce_300ms_ease-in-out_1]" />
            {notificationCount > 0 && (
              <span className="absolute top-0 end-0 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-emerald-700 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--color-bar-bg)]">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          <button
            onClick={onUserClick}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] ms-1 overflow-hidden"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="h-full w-full object-cover" />
            ) : userName ? (
              userName.charAt(0).toUpperCase()
            ) : (
              'U'
            )}
          </button>
        </div>
      </header>
    );
  },
);
MorphBar.displayName = 'MorphBar';
