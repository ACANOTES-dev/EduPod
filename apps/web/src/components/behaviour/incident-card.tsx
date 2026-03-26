'use client';

import * as React from 'react';

import { formatDateTime } from '@/lib/format-date';

import { IncidentStatusBadge } from './incident-status-badge';

export interface IncidentCardData {
  id: string;
  incident_number: string;
  description: string;
  status: string;
  occurred_at: string;
  category: {
    name: string;
    polarity: string;
    color: string | null;
  } | null;
  participants: Array<{
    student?: { first_name: string; last_name: string } | null;
  }>;
}

interface IncidentCardProps {
  incident: IncidentCardData;
  onClick?: () => void;
}

const POLARITY_ACCENT: Record<string, string> = {
  positive: 'bg-green-500',
  negative: 'bg-red-500',
  neutral: 'bg-gray-400',
};

export function IncidentCard({ incident, onClick }: IncidentCardProps) {
  const studentNames = incident.participants
    .map((p) => p.student ? `${p.student.first_name} ${p.student.last_name}` : null)
    .filter(Boolean)
    .join(', ');

  const accentColor = incident.category?.color
    ? incident.category.color
    : undefined;
  const accentClass = !accentColor
    ? POLARITY_ACCENT[incident.category?.polarity ?? 'neutral'] ?? 'bg-gray-400'
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
    >
      {/* Color accent bar */}
      <div
        className={`w-1 shrink-0 self-stretch rounded-full ${accentClass ?? ''}`}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-text-tertiary">
            {incident.incident_number}
          </span>
          {incident.category && (
            <span className="text-xs font-medium text-text-secondary">
              {incident.category.name}
            </span>
          )}
          <IncidentStatusBadge status={incident.status} />
        </div>

        {studentNames && (
          <p className="mt-1 text-sm font-medium text-text-primary truncate">
            {studentNames}
          </p>
        )}

        <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
          {incident.description}
        </p>

        <p className="mt-1 text-[11px] text-text-tertiary">
          {formatDateTime(incident.occurred_at)}
        </p>
      </div>
    </button>
  );
}
