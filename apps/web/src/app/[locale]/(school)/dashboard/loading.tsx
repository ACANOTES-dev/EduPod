export default function DashboardLoading() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="h-8 w-64 skeleton rounded-pill" />
          <div className="h-6 w-32 skeleton rounded-pill" />
        </div>
        
        {/* Priority Feed Skeleton */}
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="h-6 w-48 skeleton rounded-pill mb-6" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4 p-4 rounded-[12px] border border-border/50">
              <div className="h-10 w-10 skeleton rounded-[10px] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 skeleton rounded-pill" />
                <div className="h-4 w-2/3 skeleton rounded-pill" />
              </div>
              <div className="h-8 w-20 skeleton rounded-pill shrink-0" />
            </div>
          ))}
        </div>

        {/* Activity Feed Skeleton */}
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="h-6 w-32 skeleton rounded-pill mb-6" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-start gap-4">
              <div className="mt-1 h-2 w-2 rounded-full skeleton shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 skeleton rounded-pill" />
                <div className="h-3 w-1/4 skeleton rounded-pill" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        {/* School Snapshot Skeleton */}
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="h-6 w-40 skeleton rounded-pill mb-4" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 skeleton rounded-[10px] shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-2/3 skeleton rounded-pill" />
                <div className="h-5 w-1/3 skeleton rounded-pill" />
              </div>
            </div>
          ))}
        </div>
        
        {/* This Week Skeleton */}
        <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm space-y-6">
          <div className="h-6 w-32 skeleton rounded-pill" />
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-1/3 skeleton rounded-pill" />
                <div className="h-4 w-12 skeleton rounded-pill" />
              </div>
              <div className="h-2 w-full skeleton rounded-pill" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
