'use client';

import { Bell, History, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Switch,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { AlertForm } from './_components/alert-form';
import { EvaluationHistoryDrawer } from './_components/evaluation-history-drawer';

/**
 * Report Alerts list page (impl 17).
 *
 * Lists every report alert configured for the tenant, with row actions:
 *   - Toggle Active / Paused (PUT `/v1/reports/alerts/:id`)
 *   - View History (opens the drawer over `GET /:id/history` from impl 09)
 *   - Delete
 *   - "+ New alert" opens the create modal
 *
 * Error state is explicit — no silent fallback. Per CLAUDE.md "no
 * silent failures" rule.
 */

interface ReportAlertRow {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  check_frequency: string;
  notification_recipients_json: string[] | null;
  active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  data: ReportAlertRow[];
  meta: { page: number; pageSize: number; total: number };
}

const OPERATOR_SYMBOLS: Record<string, string> = {
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  eq: '=',
  ne: '≠',
};

export default function AlertsPage() {
  const t = useTranslations('reports.alerts');

  const [items, setItems] = React.useState<ReportAlertRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerAlert, setDrawerAlert] = React.useState<ReportAlertRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  // ─── Fetch list ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    apiClient<ListResponse>('/api/v1/reports/alerts?page=1&pageSize=50', {
      method: 'GET',
      signal: controller.signal,
      silent: true,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[AlertsPage]', err);
        setLoadError(t('listLoadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTick, t]);

  // ─── Row actions ────────────────────────────────────────────────────────

  const toggleActive = async (id: string, nextActive: boolean) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, active: nextActive } : r)));
    try {
      await apiClient(`/api/v1/reports/alerts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: nextActive }),
        silent: true,
      });
    } catch (err: unknown) {
      console.error('[AlertsPage.toggleActive]', err);
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, active: !nextActive } : r)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await apiClient(`/api/v1/reports/alerts/${id}`, { method: 'DELETE', silent: true });
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      console.error('[AlertsPage.delete]', err);
    } finally {
      setPendingDeleteId(null);
    }
  };

  const openHistory = (alert: ReportAlertRow) => {
    setDrawerAlert(alert);
    setDrawerOpen(true);
  };

  const onSaved = () => setRefreshTick((n) => n + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: '../', label: t('backToReports') }}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createButton')}
          </Button>
        }
      />

      {loadError && !loading && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">{t('listLoadErrorTitle')}</p>
            <p className="mt-1 text-sm text-red-600">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshTick((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 && !loadError ? (
        <EmptyState
          icon={Bell}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={{
            label: t('createButton'),
            onClick: () => setCreateOpen(true),
          }}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const recipientCount = Array.isArray(row.notification_recipients_json)
              ? row.notification_recipients_json.length
              : 0;
            const opSymbol = OPERATOR_SYMBOLS[row.operator] ?? row.operator;
            const metricLabel = t(`metricLabels.${row.metric}` as 'metricLabels.attendance_rate');
            return (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
                      <Bell className="h-4 w-4 text-amber-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{row.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-text-tertiary">
                        {metricLabel}{' '}
                        <span className="font-mono">{opSymbol}</span> {row.threshold}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">
                          {t(`frequencyLabels.${row.check_frequency}` as 'frequencyLabels.daily')}
                        </Badge>
                        <Badge variant="secondary">
                          {t('recipientsCount', { n: recipientCount })}
                        </Badge>
                        {row.last_triggered_at && (
                          <Badge variant="secondary">
                            {t('lastTriggered')} {formatRelative(row.last_triggered_at)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-surface-secondary text-text-tertiary'
                      }`}
                    >
                      {row.active ? t('active') : t('inactive')}
                    </span>
                    <Switch
                      aria-label={t('toggleActive', { name: row.name })}
                      checked={row.active}
                      onCheckedChange={(next) => void toggleActive(row.id, next)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openHistory(row)}
                    >
                      <History className="me-2 h-4 w-4" />
                      {t('viewHistory')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendingDeleteId === row.id}
                      onClick={() => void handleDelete(row.id)}
                      aria-label={t('deleteAria', { name: row.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertForm open={createOpen} onClose={() => setCreateOpen(false)} onSaved={onSaved} />

      <EvaluationHistoryDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerAlert(null);
        }}
        alertId={drawerAlert?.id ?? null}
        alertName={drawerAlert?.name ?? ''}
      />
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
