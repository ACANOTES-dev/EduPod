import { SkeletonCascade } from '@school/ui';

export default function Loading() {
  return (
    <div>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
      <div className="mt-8">
        <SkeletonCascade count={5} itemClassName="h-16" />
      </div>
    </div>
  );
}
