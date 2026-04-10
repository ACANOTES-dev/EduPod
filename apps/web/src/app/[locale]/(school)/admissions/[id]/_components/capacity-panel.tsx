'use client';

import type { CapacitySummary } from './types';

interface CapacityPanelProps {
  capacity: CapacitySummary | null;
  yearGroupName: string | null;
  academicYearName: string | null;
}

export function CapacityPanel({ capacity, yearGroupName, academicYearName }: CapacityPanelProps) {
  if (!capacity) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-text-primary">Target year group capacity</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          No target year group set on this application.
        </p>
      </div>
    );
  }

  const tone =
    capacity.available_seats > 0
      ? 'text-success-text'
      : capacity.configured
        ? 'text-warning-text'
        : 'text-text-tertiary';

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Target year group capacity</h3>
        {(yearGroupName || academicYearName) && (
          <p className="text-xs text-text-tertiary">
            {yearGroupName}
            {academicYearName ? ` · ${academicYearName}` : ''}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Total" value={capacity.total_capacity} />
        <Cell label="Enrolled" value={capacity.enrolled_student_count} />
        <Cell label="Cond. holds" value={capacity.conditional_approval_count} />
        <Cell
          label="Available"
          value={capacity.available_seats}
          valueClass={`font-semibold ${tone}`}
        />
      </div>
      {!capacity.configured && (
        <p className="mt-3 text-xs text-text-tertiary">
          No active classes configured for this year group yet.
        </p>
      )}
    </div>
  );
}

function Cell({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`font-mono text-base ${valueClass ?? 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
