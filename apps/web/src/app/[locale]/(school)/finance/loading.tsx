import { Skeleton, SkeletonCascade } from '@school/ui';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <Skeleton className="h-8 w-48" />

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Household debt breakdown panel */}
      <Skeleton className="h-40 rounded-2xl" />

      {/* Recent payments table */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <Skeleton className="mb-4 h-5 w-36" />
        <SkeletonCascade count={5} itemClassName="h-12" />
      </div>
    </div>
  );
}
