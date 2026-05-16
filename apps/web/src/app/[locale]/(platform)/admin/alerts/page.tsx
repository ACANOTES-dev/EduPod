'use client';

import { Bell, ListChecks } from 'lucide-react';
import * as React from 'react';

import { cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

import { AlertHistoryTable, type PlatformAlertHistory } from './_components/alert-history-table';
import { AlertRulesManager } from './_components/alert-rules-manager';

type AlertsTab = 'history' | 'rules';

interface AlertHistoryResponse {
  data: PlatformAlertHistory[];
  meta: { page: number; pageSize: number; total: number };
}

interface AlertFiredEvent {
  type: 'alert_fired';
  alert_id: string;
  rule_id: string;
  rule_name: string;
  severity: PlatformAlertHistory['severity'];
  message: string;
  metric_value: number;
  fired_at: string;
}

interface AlertResolvedEvent {
  type: 'alert_resolved';
  alert_id: string;
  rule_id: string;
  resolved_at: string;
}

const PAGE_SIZE = 20;

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
    typeof record.resolved_at === 'string'
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') {
      return maybeError.message;
    }
  }
  return fallback;
}

function historyRowFromEvent(event: AlertFiredEvent): PlatformAlertHistory {
  return {
    id: event.alert_id,
    rule_id: event.rule_id,
    severity: event.severity,
    message: event.message,
    metric_value: event.metric_value,
    channels_notified: [],
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

export default function PlatformAlertsPage() {
  const { subscribe } = usePlatformSocket();
  const [activeTab, setActiveTab] = React.useState<AlertsTab>('history');
  const [alerts, setAlerts] = React.useState<PlatformAlertHistory[]>([]);
  const [alertsPage, setAlertsPage] = React.useState(1);
  const [alertsTotal, setAlertsTotal] = React.useState(0);
  const [alertsLoading, setAlertsLoading] = React.useState(true);

  const loadHistory = React.useCallback(async (page: number) => {
    try {
      setAlertsLoading(true);
      const result = await apiClient<AlertHistoryResponse>(
        `/api/v1/admin/alerts/history?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      setAlerts(result.data);
      setAlertsPage(result.meta.page);
      setAlertsTotal(result.meta.total);
    } catch (err: unknown) {
      console.error('[PlatformAlertsPage.loadHistory]', err);
      toast.error(getErrorMessage(err, 'Failed to load alert history.'));
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHistory(1);
  }, [loadHistory]);

  React.useEffect(() => {
    return subscribe('alert:new', (payload) => {
      if (isAlertFiredEvent(payload)) {
        setAlerts((current) => [historyRowFromEvent(payload), ...current].slice(0, PAGE_SIZE));
        setAlertsTotal((current) => current + 1);
        return;
      }

      if (isAlertResolvedEvent(payload)) {
        setAlerts((current) =>
          current.map((alert) =>
            alert.id === payload.alert_id
              ? { ...alert, status: 'resolved', resolved_at: payload.resolved_at }
              : alert,
          ),
        );
      }
    });
  }, [subscribe]);

  async function handleAcknowledge(id: string) {
    try {
      const updated = await apiClient<PlatformAlertHistory>(
        `/api/v1/admin/alerts/history/${id}/acknowledge`,
        { method: 'PATCH' },
      );
      setAlerts((current) =>
        current.map((alert) => (alert.id === id ? { ...alert, ...updated } : alert)),
      );
      window.dispatchEvent(new CustomEvent('platform-alerts:acknowledged'));
      toast.success('Alert acknowledged.');
    } catch (err: unknown) {
      console.error('[PlatformAlertsPage.handleAcknowledge]', err);
      toast.error(getErrorMessage(err, 'Failed to acknowledge alert.'));
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Platform Alerts"
        description="Manage threshold rules, fired alert history, and acknowledgement workflow."
      />

      <div className="mt-6 flex flex-wrap gap-2 border-b border-border">
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
            activeTab === 'history'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
          onClick={() => setActiveTab('history')}
        >
          <Bell className="h-4 w-4" />
          History
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
            activeTab === 'rules'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-text-secondary hover:text-text-primary',
          )}
          onClick={() => setActiveTab('rules')}
        >
          <ListChecks className="h-4 w-4" />
          Rules
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'history' ? (
          <AlertHistoryTable
            alerts={alerts}
            loading={alertsLoading}
            onAcknowledge={handleAcknowledge}
            onPageChange={(page) => void loadHistory(page)}
            page={alertsPage}
            pageSize={PAGE_SIZE}
            total={alertsTotal}
          />
        ) : null}

        {activeTab === 'rules' ? <AlertRulesManager /> : null}
      </div>
    </div>
  );
}
