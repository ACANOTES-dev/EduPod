import { Badge } from '@school/ui';

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-indigo-100 text-indigo-800',
  under_investigation: 'bg-purple-100 text-purple-800',
  referred: 'bg-amber-100 text-amber-800',
  monitoring: 'bg-teal-100 text-teal-800',
  resolved: 'bg-green-100 text-green-800',
  sealed: 'bg-gray-100 text-gray-800 border border-gray-300',
};

const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  acknowledged: 'Acknowledged',
  under_investigation: 'Under Investigation',
  referred: 'Referred',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  sealed: 'SEALED',
};

export function SafeguardingStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
