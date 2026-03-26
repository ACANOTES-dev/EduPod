import { Badge } from '@school/ui';

const SLA_CONFIG: Record<string, { label: string; className: string }> = {
  overdue: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  due_soon: {
    label: 'Due Soon',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  on_track: {
    label: 'On Track',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
};

interface SlaIndicatorProps {
  status: string;
}

export function SlaIndicator({ status }: SlaIndicatorProps) {
  const config = SLA_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' };
  return (
    <Badge className={config.className}>
      {config.label}
    </Badge>
  );
}
