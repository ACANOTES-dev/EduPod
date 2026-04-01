'use client';

import {
  DEFAULT_TYPE_BADGE,
  RESTRICTION_TYPE_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  TYPE_BADGE_CLASSES,
} from './restriction-types';

// ─── TypeBadge ────────────────────────────────────────────────────────────────

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_BADGE_CLASSES[type] ?? DEFAULT_TYPE_BADGE
      }`}
    >
      {RESTRICTION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? DEFAULT_TYPE_BADGE
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
