'use client';

const TYPE_COLORS: Record<string, string> = {
  written: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  reading: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  research: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  revision: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  project_work: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  online_activity: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const TYPE_LABELS: Record<string, string> = {
  written: 'Written',
  reading: 'Reading',
  research: 'Research',
  revision: 'Revision',
  project_work: 'Project',
  online_activity: 'Online',
};

interface HomeworkTypeBadgeProps {
  type: string;
}

export function HomeworkTypeBadge({ type }: HomeworkTypeBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-800'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}
