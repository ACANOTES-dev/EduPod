'use client';

import * as React from 'react';

import type { MessagingRole } from '@school/shared/inbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@school/ui';

import type { PolicyMatrixDict } from './types';
import { MESSAGING_ROLES, RELATIONAL_SCOPE_NOTES, ROLE_LABELS } from './types';

interface Props {
  matrix: PolicyMatrixDict;
  disabledCells: Set<`${MessagingRole}:${MessagingRole}`>;
  onToggle: (sender: MessagingRole, recipient: MessagingRole) => void;
  readOnly?: boolean;
}

export function PolicyMatrixGrid({
  matrix,
  disabledCells,
  onToggle,
  readOnly,
}: Props): React.ReactElement {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="hidden md:block">
        <div
          className="grid gap-0 border border-border rounded-lg overflow-hidden"
          style={{
            gridTemplateColumns: `minmax(8rem, auto) repeat(${MESSAGING_ROLES.length}, minmax(3.25rem, 1fr))`,
          }}
          role="grid"
          aria-label="Messaging policy matrix"
        >
          <div className="bg-surface-secondary border-b border-e border-border px-3 py-2 text-xs font-medium text-text-secondary sticky top-0 z-10">
            Sender ↓ / Recipient →
          </div>
          {MESSAGING_ROLES.map((recipient) => (
            <div
              key={`col-${recipient}`}
              className="bg-surface-secondary border-b border-border px-2 py-2 text-center text-xs font-medium text-text-secondary sticky top-0 z-10 truncate"
              title={ROLE_LABELS[recipient]}
            >
              {ROLE_LABELS[recipient]}
            </div>
          ))}

          {MESSAGING_ROLES.map((sender) => (
            <React.Fragment key={`row-${sender}`}>
              <div className="bg-surface-secondary border-e border-b border-border px-3 py-2 text-sm font-medium text-text-primary sticky start-0 z-[5]">
                {ROLE_LABELS[sender]}
              </div>
              {MESSAGING_ROLES.map((recipient) => {
                const key = `${sender}:${recipient}` as const;
                const allowed = matrix[sender]?.[recipient] ?? false;
                const cellDisabled = disabledCells.has(key);
                const scopeNote = RELATIONAL_SCOPE_NOTES[key];
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${ROLE_LABELS[sender]} can message ${ROLE_LABELS[recipient]}: ${allowed ? 'allowed' : 'blocked'}`}
                        aria-pressed={allowed}
                        disabled={readOnly || cellDisabled}
                        onClick={() => onToggle(sender, recipient)}
                        className={cn(
                          'h-10 w-full border-b border-e border-border flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset',
                          cellDisabled
                            ? 'bg-surface-secondary text-text-tertiary cursor-not-allowed opacity-50'
                            : allowed
                              ? 'bg-primary-50 hover:bg-primary-100 text-primary-700'
                              : 'bg-surface hover:bg-surface-secondary text-text-tertiary',
                        )}
                      >
                        <span aria-hidden="true" className="text-lg font-semibold">
                          {allowed ? '✓' : '×'}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-medium">
                        {ROLE_LABELS[sender]} → {ROLE_LABELS[recipient]}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {cellDisabled
                          ? 'Disabled by global kill switch above.'
                          : allowed
                            ? 'Allowed — the sender role may initiate this conversation.'
                            : 'Blocked — the sender role may not message this recipient.'}
                      </p>
                      {scopeNote && (
                        <p className="mt-1 text-xs text-text-secondary italic">{scopeNote}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="md:hidden space-y-4">
        {MESSAGING_ROLES.map((sender) => (
          <div
            key={`mobile-${sender}`}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div className="bg-surface-secondary px-3 py-2 text-sm font-semibold text-text-primary">
              From {ROLE_LABELS[sender]} →
            </div>
            <div className="divide-y divide-border">
              {MESSAGING_ROLES.map((recipient) => {
                const key = `${sender}:${recipient}` as const;
                const allowed = matrix[sender]?.[recipient] ?? false;
                const cellDisabled = disabledCells.has(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2.5 text-sm',
                      cellDisabled && 'opacity-50',
                    )}
                  >
                    <span className="text-text-primary">{ROLE_LABELS[recipient]}</span>
                    <input
                      type="checkbox"
                      checked={allowed}
                      disabled={readOnly || cellDisabled}
                      onChange={() => onToggle(sender, recipient)}
                      className="h-5 w-5 rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
