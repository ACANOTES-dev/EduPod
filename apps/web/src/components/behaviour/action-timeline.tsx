'use client';

import { Badge } from '@school/ui';
import * as React from 'react';

import { formatDateTime } from '@/lib/format-date';

export interface TimelineAction {
  id: string;
  action_type: string;
  note: string | null;
  performed_by_name: string | null;
  created_at: string;
}

interface ActionTimelineProps {
  actions: TimelineAction[];
  isLoading?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  status_change: 'Status Change',
  note: 'Note Added',
  assignment: 'Assignment',
  referral: 'Referral',
  attachment: 'Attachment',
  seal: 'Case Sealed',
  break_glass: 'Break-Glass Access',
};

export function ActionTimeline({ actions, isLoading }: ActionTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-tertiary">
        No actions recorded yet.
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical connector line */}
      <div className="absolute start-3 top-3 bottom-3 w-px bg-border" />

      {actions.map((action) => (
        <div key={action.id} className="relative flex gap-4 pb-4">
          {/* Dot */}
          <div className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-surface" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {ACTION_LABELS[action.action_type] ?? action.action_type}
              </Badge>
              <span className="text-[11px] text-text-tertiary">
                {formatDateTime(action.created_at)}
              </span>
            </div>

            {action.note && (
              <p className="mt-1 text-sm text-text-secondary">{action.note}</p>
            )}

            {action.performed_by_name && (
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                by {action.performed_by_name}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
