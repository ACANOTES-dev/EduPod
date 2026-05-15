import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, Skeleton } from '@school/ui';

import { AlertSeverityBadge, AlertStatusBadge } from './alert-severity-badge';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'fired' | 'acknowledged' | 'resolved';

export interface PlatformAlertHistory {
  id: string;
  rule_id: string;
  severity: AlertSeverity;
  message: string;
  metric_value: number | string;
  channels_notified: string[];
  status: AlertStatus;
  fired_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  acknowledged_by: string | null;
  rule?: { name: string };
}

interface AlertHistoryTableProps {
  alerts: PlatformAlertHistory[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onAcknowledge: (id: string) => void;
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return 'Just now';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} d ago`;
}

export function AlertHistoryTable({
  alerts,
  loading,
  onAcknowledge,
  onPageChange,
  page,
  pageSize,
  total,
}: AlertHistoryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-text-tertiary">
            <tr>
              <th className="px-4 py-3 text-start font-semibold">Severity</th>
              <th className="px-4 py-3 text-start font-semibold">Rule</th>
              <th className="px-4 py-3 text-start font-semibold">Message</th>
              <th className="px-4 py-3 text-start font-semibold">Fired</th>
              <th className="px-4 py-3 text-start font-semibold">Status</th>
              <th className="px-4 py-3 text-end font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  <td className="px-4 py-3" colSpan={6}>
                    <Skeleton className="h-8 w-full rounded-md" />
                  </td>
                </tr>
              ))
            ) : alerts.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-text-secondary" colSpan={6}>
                  No alerts have fired yet.
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr
                  key={alert.id}
                  className="border-b border-border text-text-primary last:border-0 hover:bg-surface-secondary/50"
                >
                  <td className="px-4 py-3">
                    <AlertSeverityBadge severity={alert.severity} />
                  </td>
                  <td className="px-4 py-3 font-medium">{alert.rule?.name ?? 'Deleted rule'}</td>
                  <td className="max-w-[320px] px-4 py-3 text-text-secondary">
                    <span className="block truncate" title={alert.message}>
                      {alert.message}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    <time dateTime={alert.fired_at}>{formatRelativeTime(alert.fired_at)}</time>
                  </td>
                  <td className="px-4 py-3">
                    <AlertStatusBadge status={alert.status} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    {alert.status === 'fired' ? (
                      <Button size="sm" variant="secondary" onClick={() => onAcknowledge(alert.id)}>
                        <CheckCircle2 className="me-1.5 h-4 w-4" />
                        Ack
                      </Button>
                    ) : (
                      <span className="text-xs text-text-tertiary">No action</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
