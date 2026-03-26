import { AlertTriangle } from 'lucide-react';

interface BreakGlassBannerProps {
  reason?: string;
}

export function BreakGlassBanner({ reason }: BreakGlassBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Break-Glass Access Active
        </p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
          This case was accessed under break-glass protocol. All access is audit-logged.
        </p>
        {reason && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Reason: {reason}
          </p>
        )}
      </div>
    </div>
  );
}
