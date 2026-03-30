import { Skeleton } from '@school/ui';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Page header with action button */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Payroll calendar card */}
      <Skeleton className="h-20 rounded-2xl" />

      {/* 3 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Current run card */}
      <Skeleton className="h-24 rounded-2xl" />

      {/* Cost trend chart */}
      <Skeleton className="h-72 rounded-2xl" />

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
