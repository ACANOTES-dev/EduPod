'use client';

import { X, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

interface MobileNavOverlayProps {
  open: boolean;
  onClose: () => void;
  hubs: { key: string; label: string }[];
  activeHub: string | null;
  onHubClick: (key: string) => void;
  schoolName: string;
  onSearchClick?: () => void;
}

export function MobileNavOverlay({
  open,
  onClose,
  hubs,
  activeHub,
  onHubClick,
  schoolName,
  onSearchClick,
}: MobileNavOverlayProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] lg:hidden flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--color-bar-bg)]/95 backdrop-blur-sm transition-opacity rtl:rotate-180"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex w-4/5 max-w-sm flex-col bg-[var(--color-bar-bg)] h-full shadow-2xl animate-in fade-in slide-in-from-left duration-200 ease-out rtl:slide-in-from-right border-e border-[var(--color-strip-border)]">
        <div className="flex items-center justify-between px-6 h-[56px] border-b border-[var(--color-strip-border)]">
          <span className="text-[14px] font-bold text-[var(--color-text-primary)] tracking-wide truncate pe-4">
            {schoolName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -me-2 text-[var(--color-bar-text)] hover:text-[var(--color-text-primary)] rounded-full hover:bg-black/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-[var(--color-strip-border)]">
          <button
            onClick={() => {
              onClose();
              onSearchClick?.();
            }}
            className="w-full flex items-center gap-3 bg-black/[0.04] hover:bg-black/[0.08] text-[var(--color-bar-text)] hover:text-[var(--color-text-primary)] rounded-xl px-4 py-3.5 transition-colors border border-[var(--color-bar-border)]"
          >
            <Search className="h-5 w-5" />
            <span className="text-[15px] font-medium">Search anything...</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {hubs.map((hub) => {
            const isActive = activeHub === hub.key;
            return (
              <button
                key={hub.key}
                onClick={() => {
                  onHubClick(hub.key);
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center px-4 py-4 rounded-xl text-start transition-all',
                  isActive
                    ? 'bg-black/[0.06] text-[var(--color-text-primary)] font-bold shadow-inner border border-[var(--color-bar-border)]'
                    : 'text-[var(--color-bar-text)] hover:bg-black/[0.04] hover:text-[var(--color-text-primary)] font-medium',
                )}
              >
                {hub.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
