'use client';

interface OnboardingProgressBarProps {
  completed: number;
  total: number;
  percentComplete: number;
  compact?: boolean;
}

export function OnboardingProgressBar({
  completed,
  total,
  percentComplete,
  compact = false,
}: OnboardingProgressBarProps) {
  const value = Math.min(Math.max(percentComplete, 0), 100);

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-text-primary">{percentComplete}%</span>
        <span className="text-text-secondary">
          {completed}/{total} steps
        </span>
      </div>
      <progress
        aria-label="Onboarding progress"
        className={`mt-2 block w-full overflow-hidden rounded-pill bg-surface-secondary accent-primary-700 [&::-moz-progress-bar]:bg-primary-700 [&::-webkit-progress-bar]:bg-surface-secondary [&::-webkit-progress-value]:bg-primary-700 ${
          compact ? 'h-1.5' : 'h-2.5'
        }`}
        max={100}
        value={value}
      />
    </div>
  );
}
