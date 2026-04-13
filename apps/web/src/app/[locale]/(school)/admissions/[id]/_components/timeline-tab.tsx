'use client';

import type { TimelineAction, TimelineEvent } from './types';

const KIND_LABELS: Record<TimelineEvent['kind'], string> = {
  submitted: 'Submitted',
  status_changed: 'Status changed',
  system_event: 'System',
  admin_note: 'Admin note',
  payment_event: 'Payment',
  override_granted: 'Override',
};

const KIND_CLASSES: Record<TimelineEvent['kind'], string> = {
  submitted: 'bg-info-surface text-info-text',
  status_changed: 'bg-warning-surface text-warning-text',
  system_event: 'bg-surface-secondary text-text-secondary',
  admin_note: 'bg-surface-secondary text-text-primary',
  payment_event: 'bg-success-surface text-success-text',
  override_granted: 'bg-danger-surface text-danger-text',
};

// ADM-009: per-action label and chip colour. When an event has an
// `action` set (every state-machine-emitted note since 2026-04-13 has
// one), prefer the action label over the coarser `kind` label so the
// Timeline reads "Auto-promoted" / "Cash recorded" / "Override granted"
// instead of the generic "Admin note".
const ACTION_LABELS: Record<TimelineAction, string> = {
  submitted: 'Submitted',
  auto_routed: 'Auto-routed',
  moved_to_conditional_approval: 'Conditional approval',
  cash_recorded: 'Cash recorded',
  bank_recorded: 'Bank transfer recorded',
  stripe_completed: 'Stripe payment',
  override_approved: 'Override approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  auto_promoted: 'Auto-promoted',
  manually_promoted: 'Manually promoted',
  reverted_by_expiry: 'Payment expired',
  payment_link_regenerated: 'Payment link regenerated',
  admin_note: 'Admin note',
};

const ACTION_CLASSES: Record<TimelineAction, string> = {
  submitted: 'bg-info-surface text-info-text',
  auto_routed: 'bg-info-surface text-info-text',
  moved_to_conditional_approval: 'bg-warning-surface text-warning-text',
  cash_recorded: 'bg-success-surface text-success-text',
  bank_recorded: 'bg-success-surface text-success-text',
  stripe_completed: 'bg-success-surface text-success-text',
  override_approved: 'bg-danger-surface text-danger-text',
  rejected: 'bg-danger-surface text-danger-text',
  withdrawn: 'bg-surface-secondary text-text-secondary',
  auto_promoted: 'bg-warning-surface text-warning-text',
  manually_promoted: 'bg-warning-surface text-warning-text',
  reverted_by_expiry: 'bg-danger-surface text-danger-text',
  payment_link_regenerated: 'bg-info-surface text-info-text',
  admin_note: 'bg-surface-secondary text-text-primary',
};

export function TimelineTab({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
        No timeline events yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => {
        const label = event.action ? ACTION_LABELS[event.action] : KIND_LABELS[event.kind];
        const chipClass = event.action ? ACTION_CLASSES[event.action] : KIND_CLASSES[event.kind];
        return (
          <li
            key={event.id}
            className="flex gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <span
              className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium ${chipClass}`}
            >
              {label}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                {event.message}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {new Date(event.at).toLocaleString()}
                {event.actor && (
                  <>
                    {' · '}
                    {event.actor.first_name} {event.actor.last_name}
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
