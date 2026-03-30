'use client';

import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildSwitcherProps {
  childList: Array<{ id: string; name: string }>;
  activeId: string;
  onSelect: (id: string) => void;
  badges?: Record<string, number>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChildSwitcher({ childList, activeId, onSelect, badges }: ChildSwitcherProps) {
  if (childList.length <= 1) return null;

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 border-b border-border">
        {childList.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => onSelect(child.id)}
            className={`relative shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeId === child.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {child.name}
            {badges?.[child.id] != null && (badges[child.id] ?? 0) > 0 && (
              <span className="ms-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {badges[child.id]}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
