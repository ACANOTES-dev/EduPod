import { Badge } from '@school/ui';

interface AttendanceStatusBadgeProps {
  status: string;
  type?: 'session' | 'record' | 'daily';
}

const STATUS_STYLES: Record<string, { className: string; label: string }> = {
  present: {
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    label: 'Present',
  },
  absent: {
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    label: 'Absent',
  },
  absent_unexcused: {
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    label: 'Absent (Unexcused)',
  },
  absent_excused: {
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Absent (Excused)',
  },
  excused: {
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Excused',
  },
  late: {
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    label: 'Late',
  },
  left_early: {
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    label: 'Left Early',
  },
  submitted: {
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    label: 'Submitted',
  },
  locked: {
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    label: 'Locked',
  },
  open: {
    className: 'border border-green-300 bg-transparent text-green-700 dark:border-green-700 dark:text-green-400',
    label: 'Open',
  },
  cancelled: {
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400',
    label: 'Cancelled',
  },
  partially_absent: {
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Partially Absent',
  },
};

export function AttendanceStatusBadge({ status, type: _type }: AttendanceStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? {
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
    label: status,
  };

  return (
    <Badge className={`text-xs font-medium ${style.className}`}>
      {style.label}
    </Badge>
  );
}
