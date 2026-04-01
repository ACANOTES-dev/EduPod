'use client';

import { AlertTriangle, Check, CheckCircle, Clock, Eye, Info, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertItem {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  student_name: string | null;
  subject_name: string | null;
  staff_name: string | null;
  my_status: string;
  created_at: string;
  data_snapshot: Record<string, unknown>;
}

const TAB_KEYS = ['all', 'unseen', 'acknowledged', 'snoozed', 'resolved'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BehaviourAlertsPage() {
  const t = useTranslations('behaviour.alerts');
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<string>('all');
  const [page, setPage] = React.useState(1);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [snoozeAlertId, setSnoozeAlertId] = React.useState<string | null>(null);

  const loadAlerts = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', activeTab);
      params.set('page', String(page));
      params.set('pageSize', '20');

      const res = await apiClient<{ data: AlertItem[]; meta: { total: number } }>(
        `/behaviour/alerts?${params}`,
      );
      if (res) {
        setAlerts(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      }
    } catch (err) {
      console.error('[loadAlerts]', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  React.useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function handleAction(alertId: string, action: string, body?: Record<string, unknown>) {
    setActionLoading(alertId);
    try {
      await apiClient(`/behaviour/alerts/${alertId}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify(body ?? {}),
      });
      loadAlerts();
    } catch (err) {
      console.error('[handleAction]', err);
    } finally {
      setActionLoading(null);
    }
  }

  function handleSnooze(alertId: string, days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    handleAction(alertId, 'snooze', { snoozed_until: until.toISOString() });
    setSnoozeAlertId(null);
  }

  return (
    <div className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6 space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
        {TAB_KEYS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => {
              setActiveTab(tabKey);
              setPage(1);
            }}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tabKey
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`tabs.${tabKey}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t('noResults')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-lg border bg-card">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                {/* Severity icon */}
                <div className="flex-shrink-0">
                  {alert.severity === 'critical' && (
                    <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                      <Shield className="h-5 w-5 text-red-600" />
                    </div>
                  )}
                  {alert.severity === 'warning' && (
                    <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                  )}
                  {alert.severity === 'info' && (
                    <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                      <Info className="h-5 w-5 text-blue-600" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        alert.severity === 'critical'
                          ? 'danger'
                          : alert.severity === 'warning'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {alert.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t(`types.${alert.alert_type}` as Parameters<typeof t>[0])}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {alert.my_status === 'resolved_recipient' ? 'resolved' : alert.my_status}
                    </Badge>
                  </div>
                  <h4 className="mt-1 font-medium">{alert.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>

                  {/* Entity tags */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.student_name && (
                      <Badge variant="secondary" className="text-xs">
                        {t('studentLabel')}: {alert.student_name}
                      </Badge>
                    )}
                    {alert.subject_name && (
                      <Badge variant="secondary" className="text-xs">
                        {t('subjectLabel')}: {alert.subject_name}
                      </Badge>
                    )}
                    {alert.staff_name && (
                      <Badge variant="secondary" className="text-xs">
                        {t('staffLabel')}: {alert.staff_name}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>

                  {/* Expandable data snapshot */}
                  {expandedId === alert.id && (
                    <div className="mt-3 rounded-lg bg-muted/30 p-3">
                      <pre className="max-h-40 overflow-auto text-xs">
                        {JSON.stringify(alert.data_snapshot, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-1 sm:flex-col">
                  {/* Desktop actions */}
                  <div className="hidden gap-1 sm:flex sm:flex-col">
                    {alert.my_status !== 'acknowledged' &&
                      alert.my_status !== 'resolved_recipient' &&
                      alert.my_status !== 'dismissed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAction(alert.id, 'acknowledge')}
                          disabled={actionLoading === alert.id}
                        >
                          <Check className="me-1 h-3 w-3" /> {t('acknowledge')}
                        </Button>
                      )}
                    {alert.my_status !== 'snoozed' &&
                      alert.my_status !== 'resolved_recipient' &&
                      alert.my_status !== 'dismissed' && (
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSnoozeAlertId(snoozeAlertId === alert.id ? null : alert.id)
                            }
                            disabled={actionLoading === alert.id}
                          >
                            <Clock className="me-1 h-3 w-3" /> {t('snooze')}
                          </Button>
                          {snoozeAlertId === alert.id && (
                            <div className="absolute end-0 top-full z-10 mt-1 w-36 rounded-lg border bg-popover p-2 shadow-md">
                              <button
                                onClick={() => handleSnooze(alert.id, 1)}
                                className="w-full rounded px-2 py-1 text-start text-sm hover:bg-muted"
                              >
                                {t('snoozeTomorrow')}
                              </button>
                              <button
                                onClick={() => handleSnooze(alert.id, 5)}
                                className="w-full rounded px-2 py-1 text-start text-sm hover:bg-muted"
                              >
                                {t('snoozeEndOfWeek')}
                              </button>
                              <button
                                onClick={() => handleSnooze(alert.id, 7)}
                                className="w-full rounded px-2 py-1 text-start text-sm hover:bg-muted"
                              >
                                {t('snoozeNextWeek')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    {alert.my_status !== 'resolved_recipient' &&
                      alert.my_status !== 'dismissed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAction(alert.id, 'resolve')}
                          disabled={actionLoading === alert.id}
                        >
                          <CheckCircle className="me-1 h-3 w-3" /> {t('resolve')}
                        </Button>
                      )}
                  </div>

                  {/* Mobile: kebab menu (simplified) */}
                  <div className="flex gap-1 sm:hidden">
                    {alert.my_status !== 'resolved_recipient' &&
                      alert.my_status !== 'dismissed' && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleAction(alert.id, 'acknowledge')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleAction(alert.id, 'resolve')}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('pageOf', { page, total: Math.ceil(total / 20) })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('next')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
