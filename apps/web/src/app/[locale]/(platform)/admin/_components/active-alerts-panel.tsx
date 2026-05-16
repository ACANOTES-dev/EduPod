'use client';

import { AlertTriangle, CheckCircle2, CircleAlert, Info, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, cn, toast } from '@school/ui';

import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

type AlertSeverity = 'info' | 'warning' | 'critical';
type AlertStatus = 'fired' | 'acknowledged' | 'resolved';

interface PlatformAlertHistory {
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
  suppressed_by_silence_id: string | null;
  suppressed_by_maintenance_window_id: string | null;
  rule?: { name: string };
}

interface AlertHistoryResponse {
  data: PlatformAlertHistory[];
  meta: { page: number; pageSize: number; total: number };
}

interface AlertFiredEvent {
  type: 'alert_fired';
  alert_id: string;
  rule_id: string;
  rule_name: string;
  severity: AlertSeverity;
  message: string;
  metric_value: number;
  channels_notified?: string[];
  fired_at: string;
}

interface AlertResolvedEvent {
  type: 'alert_resolved';
  alert_id: string;
  rule_id: string;
  resolved_at: string;
}

interface ActiveAlertsPanelProps {
  className?: string;
}

const severityRank: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function isAlertFiredEvent(value: unknown): value is AlertFiredEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.type === 'alert_fired' &&
    typeof record.alert_id === 'string' &&
    typeof record.rule_id === 'string' &&
    typeof record.rule_name === 'string' &&
    typeof record.message === 'string' &&
    typeof record.fired_at === 'string'
  );
}

function isAlertResolvedEvent(value: unknown): value is AlertResolvedEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.type === 'alert_resolved' &&
    typeof record.alert_id === 'string' &&
    typeof record.rule_id === 'string' &&
    typeof record.resolved_at === 'string'
  );
}

function alertFromEvent(event: AlertFiredEvent): PlatformAlertHistory {
  return {
    id: event.alert_id,
    rule_id: event.rule_id,
    severity: event.severity,
    message: event.message,
    metric_value: event.metric_value,
    channels_notified: event.channels_notified ?? [],
    status: 'fired',
    fired_at: event.fired_at,
    acknowledged_at: null,
    resolved_at: null,
    acknowledged_by: null,
    suppressed_by_silence_id: null,
    suppressed_by_maintenance_window_id: null,
    rule: { name: event.rule_name },
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

function formatRelativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return 'Just now';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  return `${Math.floor(elapsedHours / 24)} d ago`;
}

function sortAlerts(alerts: PlatformAlertHistory[]): PlatformAlertHistory[] {
  return [...alerts].sort((a, b) => {
    const severityDelta = severityRank[a.severity] - severityRank[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime();
  });
}

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  if (severity === 'critical') {
    return <CircleAlert className="h-4 w-4 text-danger-text" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-warning-text" />;
  }
  return <Info className="h-4 w-4 text-info-text" />;
}

export function ActiveAlertsPanel({ className }: ActiveAlertsPanelProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { connected, subscribe } = usePlatformSocket();
  const [alerts, setAlerts] = React.useState<PlatformAlertHistory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acknowledgingId, setAcknowledgingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadAlerts = React.useCallback(async () => {
    try {
      setError(null);
      const result = await apiClient<AlertHistoryResponse>(
        '/api/v1/admin/alerts/history?status=fired&pageSize=5',
        { silent: true },
      );
      setAlerts(sortAlerts(result.data).slice(0, 5));
    } catch (err: unknown) {
      console.error('[ActiveAlertsPanel.loadAlerts]', err);
      setError(getErrorMessage(err, 'Active alerts unavailable.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  React.useEffect(() => {
    return subscribe('alert:new', (payload) => {
      if (isAlertFiredEvent(payload)) {
        setAlerts((current) => sortAlerts([alertFromEvent(payload), ...current]).slice(0, 5));
        setError(null);
        return;
      }

      if (isAlertResolvedEvent(payload)) {
        setAlerts((current) => current.filter((alert) => alert.id !== payload.alert_id));
      }
    });
  }, [subscribe]);

  React.useEffect(() => {
    if (connected) return undefined;
    const interval = setInterval(() => void loadAlerts(), 15_000);
    return () => clearInterval(interval);
  }, [connected, loadAlerts]);

  async function handleAcknowledge(alertId: string) {
    try {
      setAcknowledgingId(alertId);
      await apiClient<PlatformAlertHistory>(`/api/v1/admin/alerts/history/${alertId}/acknowledge`, {
        method: 'PATCH',
      });
      setAlerts((current) => current.filter((alert) => alert.id !== alertId));
      window.dispatchEvent(new CustomEvent('platform-alerts:acknowledged'));
      toast.success('Alert acknowledged.');
    } catch (err: unknown) {
      console.error('[ActiveAlertsPanel.handleAcknowledge]', err);
      toast.error(getErrorMessage(err, 'Failed to acknowledge alert.'));
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <section className={cn('rounded-lg border border-border bg-surface shadow-sm', className)}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">Active Alerts</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {error ?? `${alerts.length} unacknowledged alert${alerts.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
          href={`/${locale}/admin/alerts`}
        >
          View all
        </Link>
      </header>

      <div className="divide-y divide-border">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="px-5 py-4">
                <div className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
              </div>
            ))
          : null}

        {!loading && alerts.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-fill text-success-text">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text-primary">No active alerts</p>
            <p className="mt-1 text-xs text-text-secondary">Acknowledgement queue is clear.</p>
          </div>
        ) : null}

        {alerts.map((alert) => (
          <article key={alert.id} className="flex min-w-0 flex-col gap-3 px-5 py-4 sm:flex-row">
            <div className="flex min-w-0 flex-1 gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  alert.severity === 'critical' && 'bg-danger-fill',
                  alert.severity === 'warning' && 'bg-warning-fill',
                  alert.severity === 'info' && 'bg-info-fill',
                )}
              >
                <SeverityIcon severity={alert.severity} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {alert.rule?.name ?? 'Platform alert'}
                  </p>
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold capitalize text-text-secondary">
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{alert.message}</p>
                <time className="mt-1 block text-xs text-text-tertiary" dateTime={alert.fired_at}>
                  {formatRelativeTime(alert.fired_at)}
                </time>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={acknowledgingId === alert.id}
              onClick={() => void handleAcknowledge(alert.id)}
              className="self-start"
            >
              <CheckCircle2 className="me-1.5 h-4 w-4" />
              Acknowledge
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
