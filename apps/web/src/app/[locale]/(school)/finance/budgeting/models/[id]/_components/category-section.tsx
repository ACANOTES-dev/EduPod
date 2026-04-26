'use client';

import { ChevronDown, Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@school/ui';

interface Props {
  title: string;
  totalDisplay: React.ReactNode;
  defaultOpen?: boolean;
  canManage?: boolean;
  addLabel?: string;
  onAddLine?: () => void;
  children: React.ReactNode;
}

export function CategorySection({
  title,
  totalDisplay,
  defaultOpen = true,
  canManage = false,
  addLabel,
  onAddLine,
  children,
}: Props) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-3 bg-surface-secondary px-4 py-3 text-start hover:bg-surface-tertiary"
      >
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
        />
        <span className="flex-1 text-sm font-semibold text-text-primary">{title}</span>
        <span className="font-mono text-sm tabular-nums text-text-secondary">{totalDisplay}</span>
      </button>
      {open && (
        <div className="flex flex-col">
          {children}
          {canManage && onAddLine && addLabel && (
            <div className="border-t border-border p-2">
              <Button size="sm" variant="ghost" onClick={onAddLine}>
                <Plus className="me-1 h-4 w-4" />
                {addLabel}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
