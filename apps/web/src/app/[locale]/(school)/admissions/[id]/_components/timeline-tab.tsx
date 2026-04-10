'use client';

import type { TimelineEvent } from './types';

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
      {events.map((event) => (
        <li
          key={event.id}
          className="flex gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <span
            className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium ${KIND_CLASSES[event.kind]}`}
          >
            {KIND_LABELS[event.kind]}
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
      ))}
    </ol>
  );
}
